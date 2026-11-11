import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ArrowDownToLine, FlipHorizontal2, FlipVertical2, FolderOpen, RotateCcw, RotateCw, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { extensionForFormat, formatLabel } from '../../engine/format';
import { detectOutputCapabilitiesInWorker, inspectImageInWorker, processImageInWorker } from '../../engine/worker-client';
import { ImageEngineError, OUTPUT_FORMATS, type DetectedFormat, type ImageProcessingOptions, type ImageProcessingResult, type ImageTransformOptions, type OutputFormat } from '../../engine/types';
import { saveHistoryRecord } from '../../storage/history';

type EditorAsset = {
  file: File;
  url: string;
  format: DetectedFormat;
  width: number;
  height: number;
};

type CropState = { x: string; y: string; width: string; height: string };

const formatOptions: { value: OutputFormat; label: string }[] = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
];

export function EditorStudio() {
  const [asset, setAsset] = useState<EditorAsset | null>(null);
  const [crop, setCrop] = useState<CropState>({ x: '0', y: '0', width: '', height: '' });
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [format, setFormat] = useState<OutputFormat>('png');
  const [capabilities, setCapabilities] = useState<Record<OutputFormat, boolean>>({ jpeg: false, png: false, webp: false, avif: false });
  const [result, setResult] = useState<ImageProcessingResult | null>(null);
  const [resultUrl, setResultUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const assetUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const operationControllerRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void detectOutputCapabilitiesInWorker(controller.signal).then((supported) => {
      if (!active) return;
      setCapabilities(supported);
      setFormat((current) => supported[current] ? current : OUTPUT_FORMATS.find((item) => supported[item]) ?? current);
    }).catch((cause: unknown) => {
      if (active && !(cause instanceof Error && cause.name === 'AbortError')) setError('Image format capability detection failed.');
      if (!(cause instanceof Error && cause.name === 'AbortError')) console.error('AfterImage could not detect editor output formats.', cause);
    });
    return () => {
      active = false;
      controller.abort();
      operationControllerRef.current?.abort();
      if (assetUrlRef.current) URL.revokeObjectURL(assetUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  function clearResult() {
    if (operationControllerRef.current) {
      operationControllerRef.current.abort();
      operationControllerRef.current = null;
      setIsProcessing(false);
    }
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResultUrl('');
    setResult(null);
  }

  async function importFile(file?: File) {
    if (!file) return;
    sequenceRef.current += 1;
    const sequence = sequenceRef.current;
    operationControllerRef.current?.abort();
    setIsProcessing(false);
    clearResult();
    setError('');
    setNotice('');
    setIsLoading(true);
    const controller = new AbortController();
    operationControllerRef.current = controller;
    try {
      if (file.size > 100 * 1024 * 1024) throw new ImageEngineError('IMAGE_TOO_LARGE', 'Images larger than 100 MB cannot be processed.');
      const inspection = await inspectImageInWorker(file, controller.signal);
      if (sequence !== sequenceRef.current) return;
      const url = URL.createObjectURL(file);
      if (assetUrlRef.current) URL.revokeObjectURL(assetUrlRef.current);
      assetUrlRef.current = url;
      setAsset({ file, url, format: inspection.format, width: inspection.width, height: inspection.height });
      setCrop({ x: '0', y: '0', width: String(inspection.width), height: String(inspection.height) });
      setRotation(0);
      setFlipHorizontal(false);
      setFlipVertical(false);
    } catch (cause) {
      if (sequence !== sequenceRef.current || (cause instanceof Error && cause.name === 'AbortError')) return;
      const description = cause instanceof Error ? cause.message : 'The selected image could not be opened.';
      setError(description);
      console.error('AfterImage editor could not import the selected image.', cause);
    } finally {
      if (sequence === sequenceRef.current) setIsLoading(false);
      if (operationControllerRef.current === controller) operationControllerRef.current = null;
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void importFile(event.dataTransfer.files[0]);
  }

  function updateCrop(key: keyof CropState, value: string) {
    setCrop((current) => ({ ...current, [key]: value }));
    clearResult();
  }

  function rotate(degrees: 90 | -90) {
    setRotation((current) => ((current + degrees + 360) % 360) as 0 | 90 | 180 | 270);
    clearResult();
  }

  function transformOptions(): ImageTransformOptions {
    return {
      crop: {
        x: Number(crop.x),
        y: Number(crop.y),
        width: Number(crop.width),
        height: Number(crop.height),
      },
      rotation,
      flipHorizontal,
      flipVertical,
    };
  }

  async function processEditedImage() {
    if (!asset || isProcessing) return;
    setError('');
    setNotice('');
    clearResult();
    setIsProcessing(true);
    const controller = new AbortController();
    operationControllerRef.current = controller;
    const sequence = sequenceRef.current;
    const options: ImageProcessingOptions = {
      format,
      quality: 0.9,
      resize: { preserveAspectRatio: true },
      backgroundColor: '#ffffff',
      transform: transformOptions(),
    };
    try {
      const processed = await processImageInWorker(asset.file, options, controller.signal);
      if (sequence !== sequenceRef.current) return;
      const url = URL.createObjectURL(processed.blob);
      resultUrlRef.current = url;
      setResultUrl(url);
      setResult(processed);
      try {
        await saveHistoryRecord({
          id: crypto.randomUUID(),
          filename: asset.file.name,
          sourceSize: asset.file.size,
          operation: 'edit',
          status: 'completed',
          options,
          createdAt: Date.now(),
          completedAt: Date.now(),
          outputBlob: processed.blob,
          outputFormat: processed.format,
          outputSize: processed.outputSize,
          width: processed.width,
          height: processed.height,
        });
      } catch (cause) {
        const description = cause instanceof Error ? cause.message : 'Local history could not be saved.';
        setError(`Image edit succeeded, but its history could not be saved: ${description}`);
        console.error('AfterImage could not save editor history.', cause);
      }
      setNotice('Edited image generated locally.');
    } catch (cause) {
      if (sequence !== sequenceRef.current || (cause instanceof Error && cause.name === 'AbortError')) return;
      const description = cause instanceof Error ? cause.message : 'Image editing failed.';
      setError(description);
      console.error('AfterImage image editor failed.', cause);
    } finally {
      if (operationControllerRef.current === controller) operationControllerRef.current = null;
      if (sequence === sequenceRef.current) setIsProcessing(false);
    }
  }

  function resetEdits() {
    if (!asset) return;
    setCrop({ x: '0', y: '0', width: String(asset.width), height: String(asset.height) });
    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    clearResult();
    setError('');
    setNotice('');
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EDITOR · LOCAL PROCESSING</p>
          <h1>Shape your image.</h1>
          <p className="heading-copy">Crop, rotate, and flip. Planned tools are clearly marked below.</p>
        </div>
      </div>

      <div className={`import-card editor-import ${asset ? 'has-image' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        {asset ? (
          <>
            <img className="image-preview" src={asset.url} alt={`Editor source ${asset.file.name}`} />
            <div className="preview-meta"><strong>{asset.file.name}</strong><span>{formatBytes(asset.file.size)} · {asset.width} × {asset.height} · {formatLabel(asset.format)}</span></div>
            <Button size="small" onClick={() => inputRef.current?.click()}><FolderOpen size={13} /> Replace Image</Button>
          </>
        ) : (
          <>
            <div className="import-icon"><FolderOpen size={20} /></div>
            <h2>{isLoading ? 'Inspecting image…' : 'Choose an image to edit'}</h2>
            <p>Drop a JPEG, PNG, WebP, or AVIF image here.</p>
            <Button onClick={() => inputRef.current?.click()} disabled={isLoading}><FolderOpen size={14} /> Select Image</Button>
            <span className="import-footnote">Files remain on your device.</span>
          </>
        )}
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Select image to edit" onChange={(event) => {
          void importFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = '';
        }} />
      </div>

      {asset && (
        <section className="processing-panel editor-controls">
          <div className="processing-heading"><div><p className="eyebrow">BASIC EDITS</p><h2>Transform</h2></div><Button size="small" onClick={resetEdits}><RotateCcw size={12} /> Reset</Button></div>
          <div className="editor-tool-row">
            <div className="editor-tool-group">
              <span className="setting-hint">Rotate</span>
              <Button size="small" aria-label="Rotate left 90 degrees" title="Rotate left 90°" onClick={() => rotate(-90)}><RotateCcw size={13} /> −90°</Button>
              <Button size="small" aria-label="Rotate right 90 degrees" title="Rotate right 90°" onClick={() => rotate(90)}><RotateCw size={13} /> +90°</Button>
            </div>
            <div className="editor-tool-group">
              <span className="setting-hint">Flip</span>
              <Button size="small" aria-pressed={flipHorizontal} onClick={() => { setFlipHorizontal((value) => !value); clearResult(); }}><FlipHorizontal2 size={13} /> Horizontal</Button>
              <Button size="small" aria-pressed={flipVertical} onClick={() => { setFlipVertical((value) => !value); clearResult(); }}><FlipVertical2 size={13} /> Vertical</Button>
            </div>
          </div>
          <div className="editor-crop-heading"><strong>Crop area</strong><span>{asset.width} × {asset.height} source pixels</span></div>
          <div className="editor-crop-grid">
            <label className="setting-field"><span>Left (X)</span><input type="number" min="0" max={asset.width - 1} value={crop.x} onChange={(event) => updateCrop('x', event.target.value)} /></label>
            <label className="setting-field"><span>Top (Y)</span><input type="number" min="0" max={asset.height - 1} value={crop.y} onChange={(event) => updateCrop('y', event.target.value)} /></label>
            <label className="setting-field"><span>Width</span><input type="number" min="1" max={asset.width} value={crop.width} onChange={(event) => updateCrop('width', event.target.value)} /></label>
            <label className="setting-field"><span>Height</span><input type="number" min="1" max={asset.height} value={crop.height} onChange={(event) => updateCrop('height', event.target.value)} /></label>
          </div>
          <div className="editor-output-row">
            <label className="setting-field"><span>Output format</span><select value={format} onChange={(event) => { setFormat(event.target.value as OutputFormat); clearResult(); }}>
              {formatOptions.map((option) => <option key={option.value} value={option.value} disabled={!capabilities[option.value]}>{option.label}{capabilities[option.value] ? '' : ' — unavailable'}</option>)}
            </select></label>
            <Button variant="primary" disabled={isProcessing || !capabilities[format]} onClick={() => void processEditedImage()}>
              {isProcessing ? <><span className="spinner" /> Processing…</> : <><Sparkles size={14} /> Apply & Export</>}
            </Button>
          </div>
        </section>
      )}

      {result && resultUrl && asset && (
        <section className="result-panel editor-result">
          <div className="result-heading"><div><p className="eyebrow">EDIT COMPLETE</p><h2>Output preview</h2></div><span className="subtle-label">{result.width} × {result.height}</span></div>
          <div className="comparison-preview editor-result-preview"><img src={resultUrl} alt="Edited image preview" /></div>
          <div className="comparison-meta"><strong>{formatBytes(asset.file.size)} → {formatBytes(result.outputSize)}</strong><small>{formatLabel(result.format)}</small></div>
          <a className="button button-primary download-button" href={resultUrl} download={`${removeExtension(asset.file.name)}-edited.${extensionForFormat(result.format)}`}>
            <ArrowDownToLine size={14} /> Download Edited Image
          </a>
        </section>
      )}

      {(error || notice) && <p className={error ? 'inline-error' : 'inline-success'} role={error ? 'alert' : 'status'}>{error || notice}</p>}

      <section className="planned-tools">
        <p className="eyebrow">PLANNED · NOT AVAILABLE YET</p>
        <div><span>Watermark</span><span>Planned</span></div>
        <div><span>Brightness · Contrast · Saturation</span><span>Planned</span></div>
        <div><span>Presets</span><span>Planned</span></div>
      </section>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function removeExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'image';
}
