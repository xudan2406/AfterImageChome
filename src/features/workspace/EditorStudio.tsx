import { useEffect, useReducer, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDownToLine, FlipHorizontal2, FlipVertical2, FolderOpen, Redo2, RotateCcw, RotateCw, Sparkles, Undo2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { extensionForFormat, formatLabel } from '../../engine/format';
import { detectOutputCapabilitiesInWorker, inspectImageInWorker, processImageInWorker } from '../../engine/worker-client';
import { ImageEngineError, OUTPUT_FORMATS, type DetectedFormat, type ImageProcessingOptions, type ImageProcessingResult, type ImageTransformOptions, type OutputFormat } from '../../engine/types';
import { saveHistoryRecord } from '../../storage/history';
import {
  createEditorHistory,
  cropFromDrag,
  editorHistoryReducer,
  type EditorEdits,
} from './editor-state';

type EditorAsset = {
  file: File;
  url: string;
  format: DetectedFormat;
  width: number;
  height: number;
};

type CropDrag = { pointerId: number; x: number; y: number };

const formatOptions: { value: OutputFormat; label: string }[] = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
];

export function EditorStudio() {
  const [asset, setAsset] = useState<EditorAsset | null>(null);
  const [editHistory, dispatchEdit] = useReducer(
    editorHistoryReducer,
    {
      crop: { x: '0', y: '0', width: '', height: '' },
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
    } satisfies EditorEdits,
    createEditorHistory,
  );
  const edits = editHistory.present;
  const [cropDraft, setCropDraft] = useState<EditorEdits['crop'] | null>(null);
  const [format, setFormat] = useState<OutputFormat>('png');
  const [capabilities, setCapabilities] = useState<Record<OutputFormat, boolean>>({ jpeg: false, png: false, webp: false, avif: false });
  const [result, setResult] = useState<ImageProcessingResult | null>(null);
  const [resultUrl, setResultUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cropOverlayRef = useRef<SVGSVGElement>(null);
  const cropDragRef = useRef<CropDrag | null>(null);
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
      dispatchEdit({
        type: 'replace',
        edits: {
          crop: { x: '0', y: '0', width: String(inspection.width), height: String(inspection.height) },
          rotation: 0,
          flipHorizontal: false,
          flipVertical: false,
        },
      });
      cropDragRef.current = null;
      setCropDraft(null);
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

  function updateCrop(key: keyof EditorEdits['crop'], value: string) {
    dispatchEdit({ type: 'set-crop-field', key, value });
    clearResult();
  }

  function rotate(degrees: 90 | -90) {
    dispatchEdit({ type: 'rotate', degrees });
    clearResult();
  }

  function transformOptions(): ImageTransformOptions {
    return {
      crop: {
        x: Number(edits.crop.x),
        y: Number(edits.crop.y),
        width: Number(edits.crop.width),
        height: Number(edits.crop.height),
      },
      rotation: edits.rotation,
      flipHorizontal: edits.flipHorizontal,
      flipVertical: edits.flipVertical,
    };
  }

  function sourcePoint(event: ReactPointerEvent<SVGSVGElement>): { x: number; y: number } | null {
    if (!asset) return null;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return null;
    const point = event.currentTarget.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const source = point.matrixTransform(matrix.inverse());
    return { x: source.x, y: source.y };
  }

  function draftForPoint(point: { x: number; y: number }, drag: CropDrag) {
    if (!asset) return null;
    return cropFromDrag(
      { x: drag.x, y: drag.y },
      point,
      asset.width,
      asset.height,
    );
  }

  function handleCropPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!asset || isProcessing) return;
    const point = sourcePoint(event);
    if (!point || point.x < 0 || point.y < 0 || point.x > asset.width || point.y > asset.height) return;
    const drag: CropDrag = {
      pointerId: event.pointerId,
      x: Math.min(Math.floor(point.x), asset.width - 1),
      y: Math.min(Math.floor(point.y), asset.height - 1),
    };
    cropDragRef.current = drag;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCropDraft(draftForPoint(point, drag));
    clearResult();
    event.preventDefault();
  }

  function handleCropPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = sourcePoint(event);
    if (point) setCropDraft(draftForPoint(point, drag));
  }

  function handleCropPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = sourcePoint(event);
    const crop = point ? draftForPoint(point, drag) : cropDraft;
    if (crop) dispatchEdit({ type: 'set-crop', crop });
    cropDragRef.current = null;
    setCropDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleCropPointerCancel(event: ReactPointerEvent<SVGSVGElement>) {
    if (cropDragRef.current?.pointerId !== event.pointerId) return;
    cropDragRef.current = null;
    setCropDraft(null);
  }

  function undoEdit() {
    dispatchEdit({ type: 'undo' });
    clearResult();
  }

  function redoEdit() {
    dispatchEdit({ type: 'redo' });
    clearResult();
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
    dispatchEdit({
      type: 'set-edits',
      edits: {
        crop: { x: '0', y: '0', width: String(asset.width), height: String(asset.height) },
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
      },
    });
    cropDragRef.current = null;
    setCropDraft(null);
    clearResult();
    setError('');
    setNotice('');
  }

  const activeCrop = cropDraft ?? edits.crop;
  const cropBounds = asset ? getVisibleCropBounds(activeCrop, asset.width, asset.height) : null;

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
            <div className="editor-crop-stage">
              <img src={asset.url} alt={`Editor source ${asset.file.name}`} draggable={false} />
              {cropBounds && (
                <svg
                  ref={cropOverlayRef}
                  className="editor-crop-overlay"
                  viewBox={`0 0 ${asset.width} ${asset.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  aria-label="Drag on the image to set the crop area"
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerCancel}
                >
                  <path
                    d={`M0 0 H${asset.width} V${asset.height} H0 Z M${cropBounds.x} ${cropBounds.y} H${cropBounds.x + cropBounds.width} V${cropBounds.y + cropBounds.height} H${cropBounds.x} Z`}
                    fill="rgba(15, 16, 24, 0.42)"
                    role="img"
                    fillRule="evenodd"
                    pointerEvents="none"
                  />
                  <rect
                    x={cropBounds.x}
                    y={cropBounds.y}
                    width={cropBounds.width}
                    height={cropBounds.height}
                    fill="transparent"
                    stroke="#8d87ee"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                </svg>
              )}
            </div>
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
          <div className="processing-heading editor-history-heading">
            <div><p className="eyebrow">BASIC EDITS</p><h2>Transform</h2></div>
            <div className="editor-history-actions">
              <Button size="small" disabled={!editHistory.past.length} aria-label="Undo edit" onClick={undoEdit}><Undo2 size={12} /> Undo</Button>
              <Button size="small" disabled={!editHistory.future.length} aria-label="Redo edit" onClick={redoEdit}><Redo2 size={12} /> Redo</Button>
              <Button size="small" onClick={resetEdits}><RotateCcw size={12} /> Reset</Button>
            </div>
          </div>
          <div className="editor-tool-row">
            <div className="editor-tool-group">
              <span className="setting-hint">Rotate</span>
              <Button size="small" aria-label="Rotate left 90 degrees" title="Rotate left 90°" onClick={() => rotate(-90)}><RotateCcw size={13} /> −90°</Button>
              <Button size="small" aria-label="Rotate right 90 degrees" title="Rotate right 90°" onClick={() => rotate(90)}><RotateCw size={13} /> +90°</Button>
            </div>
            <div className="editor-tool-group">
              <span className="setting-hint">Flip</span>
              <Button size="small" aria-pressed={edits.flipHorizontal} onClick={() => { dispatchEdit({ type: 'toggle-flip-horizontal' }); clearResult(); }}><FlipHorizontal2 size={13} /> Horizontal</Button>
              <Button size="small" aria-pressed={edits.flipVertical} onClick={() => { dispatchEdit({ type: 'toggle-flip-vertical' }); clearResult(); }}><FlipVertical2 size={13} /> Vertical</Button>
            </div>
          </div>
          <div className="editor-crop-heading"><strong>Crop area</strong><span>{asset.width} × {asset.height} source pixels</span></div>
          <p className="editor-crop-hint">Drag on the image to set the crop area, or enter source-pixel bounds.</p>
          <div className="editor-crop-grid">
            <label className="setting-field"><span>Left (X)</span><input type="number" min="0" max={asset.width - 1} value={activeCrop.x} onChange={(event) => updateCrop('x', event.target.value)} /></label>
            <label className="setting-field"><span>Top (Y)</span><input type="number" min="0" max={asset.height - 1} value={activeCrop.y} onChange={(event) => updateCrop('y', event.target.value)} /></label>
            <label className="setting-field"><span>Width</span><input type="number" min="1" max={asset.width} value={activeCrop.width} onChange={(event) => updateCrop('width', event.target.value)} /></label>
            <label className="setting-field"><span>Height</span><input type="number" min="1" max={asset.height} value={activeCrop.height} onChange={(event) => updateCrop('height', event.target.value)} /></label>
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

function getVisibleCropBounds(
  crop: EditorEdits['crop'],
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const parsedX = Number(crop.x);
  const parsedY = Number(crop.y);
  const x = clamp(Number.isFinite(parsedX) ? Math.trunc(parsedX) : 0, 0, imageWidth - 1);
  const y = clamp(Number.isFinite(parsedY) ? Math.trunc(parsedY) : 0, 0, imageHeight - 1);
  const remainingWidth = imageWidth - x;
  const remainingHeight = imageHeight - y;
  const parsedWidth = Number(crop.width);
  const parsedHeight = Number(crop.height);
  const width = clamp(Number.isFinite(parsedWidth) ? Math.trunc(parsedWidth) : 1, 1, remainingWidth);
  const height = clamp(Number.isFinite(parsedHeight) ? Math.trunc(parsedHeight) : 1, 1, remainingHeight);
  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
