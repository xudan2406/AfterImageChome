import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  Archive,
  ArrowDownToLine,
  ArrowRight,
  Crop,
  FileImage,
  FolderOpen,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import { Button, IconButton } from '../../components/ui/Button';
import { collectPageImages, isPageImageDiscoveryAvailable, type PageImage } from '../../content/image-discovery';
import { extensionForFormat, formatLabel } from '../../engine/format';
import { detectOutputCapabilitiesInWorker, inspectImageInWorker, processImageInWorker } from '../../engine/worker-client';
import { calculateOutputDimensions } from '../../engine/resize';
import { ImageEngineError, OUTPUT_FORMATS, type DetectedFormat, type ImageProcessingOptions, type ImageProcessingResult, type OutputFormat } from '../../engine/types';
import { fetchRemoteImage, requestImageHostPermission, validateRemoteImageUrl } from '../../browser/remote-image';
import { saveHistoryRecord } from '../../storage/history';
import { resizeOptionsForMode, type HomeMode } from './home-mode';

export type { HomeMode } from './home-mode';

export type PendingImage = {
  sourceUrl: string;
  pageUrl?: string;
  action: 'open' | 'compress' | 'png' | 'webp' | 'batch';
  capturedAt: number;
};

type LocalAsset = {
  file: File;
  url: string;
  format: DetectedFormat;
  width: number;
  height: number;
};

const actionLabels: Record<PendingImage['action'], string> = {
  open: 'Opened in workspace',
  compress: 'Compression requested',
  png: 'PNG conversion requested',
  webp: 'WebP conversion requested',
  batch: 'Batch workspace requested',
};

const formatOptions: { value: OutputFormat; label: string }[] = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
];

export function ImageStudio({
  mode,
  onModeChange,
  pendingImage,
  onClearPendingImage,
}: {
  mode: HomeMode;
  onModeChange: (mode: HomeMode) => void;
  pendingImage: PendingImage | null;
  onClearPendingImage: () => void;
}) {
  const [asset, setAsset] = useState<LocalAsset | null>(null);
  const [result, setResult] = useState<ImageProcessingResult | null>(null);
  const [resultUrl, setResultUrl] = useState('');
  const [detectedCapabilities, setDetectedCapabilities] = useState<Record<OutputFormat, boolean>>({
    jpeg: false, png: false, webp: false, avif: false,
  });
  const [format, setFormat] = useState<OutputFormat>('webp');
  const [quality, setQuality] = useState(0.82);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFetchingRemote, setIsFetchingRemote] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [pageImages, setPageImages] = useState<PageImage[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const importSequence = useRef(0);
  const assetUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const inspectionControllerRef = useRef<AbortController | null>(null);
  const processingControllerRef = useRef<AbortController | null>(null);
  const remoteControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void detectOutputCapabilitiesInWorker(controller.signal).then((capabilities) => {
      if (!active) return;
      setDetectedCapabilities(capabilities);
      setFormat((currentFormat) => {
        if (capabilities[currentFormat]) return currentFormat;
        const supported = OUTPUT_FORMATS.find((candidate) => capabilities[candidate]);
        return supported ?? currentFormat;
      });
    }).catch((cause: unknown) => {
      if (active) setError('Image format capability detection failed in this browser.');
      console.error('AfterImage could not detect browser image encoders.', cause);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      importSequence.current += 1;
      inspectionControllerRef.current?.abort();
      processingControllerRef.current?.abort();
      remoteControllerRef.current?.abort();
      processingControllerRef.current = null;
      remoteControllerRef.current = null;
      if (assetUrlRef.current) URL.revokeObjectURL(assetUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  useEffect(() => {
    return () => remoteControllerRef.current?.abort();
  }, [pendingImage?.sourceUrl]);

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResultUrl('');
    setResult(null);
  }

  function clearAsset() {
    importSequence.current += 1;
    inspectionControllerRef.current?.abort();
    processingControllerRef.current?.abort();
    remoteControllerRef.current?.abort();
    if (assetUrlRef.current) URL.revokeObjectURL(assetUrlRef.current);
    assetUrlRef.current = null;
    setAsset(null);
    clearResult();
    setWidth('');
    setHeight('');
    setMessage('');
    setError('');
  }

  async function importFile(file?: File) {
    if (!file) return;
    const sequence = ++importSequence.current;
    inspectionControllerRef.current?.abort();
    processingControllerRef.current?.abort();
    remoteControllerRef.current?.abort();
    const controller = new AbortController();
    inspectionControllerRef.current = controller;
    setError('');
    setMessage('');
    clearResult();

    try {
      if (file.size > 100 * 1024 * 1024) {
        throw new ImageEngineError('IMAGE_TOO_LARGE', 'Images larger than 100 MB cannot be processed.');
      }
      const inspection = await inspectImageInWorker(file, controller.signal);
      if (sequence !== importSequence.current) return;
      const nextAsset = {
        file,
        url: URL.createObjectURL(file),
        format: inspection.format,
        width: inspection.width,
        height: inspection.height,
      };
      if (assetUrlRef.current) URL.revokeObjectURL(assetUrlRef.current);
      assetUrlRef.current = nextAsset.url;
      setAsset(nextAsset);
      setWidth(String(inspection.width));
      setHeight(String(inspection.height));
    } catch (cause) {
      if (sequence !== importSequence.current) return;
      if (cause instanceof Error && cause.name === 'AbortError') return;
      const description = cause instanceof Error ? cause.message : 'The selected image could not be opened.';
      setError(description);
      console.error('AfterImage could not import the selected image.', cause);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.dataTransfer.files.length > 1) {
      setError('Home processes one image at a time. Use Batch to process multiple images.');
      return;
    }
    void importFile(event.dataTransfer.files[0]);
  }

  function setTargetWidth(value: string) {
    setWidth(value);
    const targetWidth = Number(value);
    if (keepAspectRatio && asset && Number.isInteger(targetWidth) && targetWidth > 0) {
      setHeight(String(Math.max(1, Math.round(asset.height * targetWidth / asset.width))));
    }
  }

  function setTargetHeight(value: string) {
    setHeight(value);
    const targetHeight = Number(value);
    if (keepAspectRatio && asset && Number.isInteger(targetHeight) && targetHeight > 0) {
      setWidth(String(Math.max(1, Math.round(asset.width * targetHeight / asset.height))));
    }
  }

  async function runProcessing() {
    if (!asset || isProcessing) return;
    const sequence = importSequence.current;
    const sourceFile = asset.file;
    const controller = new AbortController();
    processingControllerRef.current = controller;
    setError('');
    setMessage('');
    setIsProcessing(true);
    try {
      const options: ImageProcessingOptions = {
        format,
        quality,
        resize: resizeOptionsForMode(mode, width, height, keepAspectRatio),
        backgroundColor,
      };
      const processed = await processImageInWorker(sourceFile, options, controller.signal);
      if (sequence !== importSequence.current) return;
      const url = URL.createObjectURL(processed.blob);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = url;
      setResultUrl(url);
      setResult(processed);
      setMessage('Image processed successfully on this device.');
      await persistResult(sourceFile, processed, options, mode);
    } catch (cause) {
      if (sequence !== importSequence.current) return;
      const description = cause instanceof Error ? cause.message : 'Image processing failed.';
      setError(description);
      console.error('AfterImage image processing failed.', cause);
    } finally {
      if (processingControllerRef.current === controller) {
        processingControllerRef.current = null;
        setIsProcessing(false);
      }
    }
  }

  async function fetchPendingImage() {
    if (!pendingImage || isFetchingRemote || isProcessing) return;
    setError('');
    setMessage('');
    setIsFetchingRemote(true);
    const sequence = ++importSequence.current;
    inspectionControllerRef.current?.abort();
    processingControllerRef.current?.abort();
    const controller = new AbortController();
    remoteControllerRef.current = controller;
    try {
      const url = validateRemoteImageUrl(pendingImage.sourceUrl);
      const granted = await requestImageHostPermission(url);
      if (!granted) throw new Error('Access was denied. Save the image from the page and import it from your device instead.');
      const file = await fetchRemoteImage(url, controller.signal);
      const inspection = await inspectImageInWorker(file, controller.signal);
      if (sequence !== importSequence.current) return;

      const nextAsset: LocalAsset = {
        file,
        url: URL.createObjectURL(file),
        format: inspection.format,
        width: inspection.width,
        height: inspection.height,
      };
      if (assetUrlRef.current) URL.revokeObjectURL(assetUrlRef.current);
      assetUrlRef.current = nextAsset.url;
      setAsset(nextAsset);
      setWidth(String(inspection.width));
      setHeight(String(inspection.height));
      clearResult();

      if (pendingImage.action === 'open' || pendingImage.action === 'batch') {
        setMessage('Web image opened locally. No image data was uploaded.');
        onClearPendingImage();
        return;
      }

      const targetFormat: OutputFormat = pendingImage.action === 'png' ? 'png' : 'webp';
      if (!detectedCapabilities[targetFormat]) {
        throw new Error(`${targetFormat.toUpperCase()} output is unavailable in this browser.`);
      }
      const targetQuality = pendingImage.action === 'compress' ? 0.72 : 0.82;
      const options: ImageProcessingOptions = {
        format: targetFormat,
        quality: targetQuality,
        resize: { width: inspection.width, height: inspection.height, preserveAspectRatio: true },
        backgroundColor,
      };
      setFormat(targetFormat);
      setQuality(targetQuality);
      setIsProcessing(true);
      const processed = await processImageInWorker(file, options, controller.signal);
      if (sequence !== importSequence.current) return;
      const outputUrl = URL.createObjectURL(processed.blob);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = outputUrl;
      setResultUrl(outputUrl);
      setResult(processed);
      setMessage(pendingImage.action === 'compress'
        ? 'Quick compression completed in your browser.'
        : `Quick conversion to ${targetFormat.toUpperCase()} completed in your browser.`);
      await persistResult(file, processed, options, pendingImage.action === 'compress' ? 'compress' : 'convert');
      onClearPendingImage();
    } catch (cause) {
      if (sequence !== importSequence.current) return;
      if (cause instanceof Error && cause.name === 'AbortError') return;
      const description = cause instanceof Error ? cause.message : 'The web image could not be processed.';
      setError(description);
      console.error('AfterImage could not process the context-menu image.', cause);
    } finally {
      if (remoteControllerRef.current === controller) {
        remoteControllerRef.current = null;
        if (mountedRef.current) {
          setIsFetchingRemote(false);
          setIsProcessing(false);
        }
      }
    }
  }

  async function persistResult(file: File, processed: ImageProcessingResult, options: ImageProcessingOptions, operation: HomeMode | 'edit' = mode) {
    try {
      await saveHistoryRecord({
        id: crypto.randomUUID(),
        filename: file.name,
        sourceSize: file.size,
        operation,
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
      setError(`Image processing succeeded, but its history could not be saved: ${description}`);
      console.error('AfterImage could not save single-image processing history.', cause);
    }
  }

  async function scanCurrentPage() {
    setError('');
    setMessage('');
    setIsScanning(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || !isPageImageDiscoveryAvailable(tab.url)) {
        setMessage('Open a regular HTTP or HTTPS website to discover images. Chrome pages and new tabs are not accessible.');
        return;
      }
      const [response] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectPageImages,
      });
      if (!response?.result) throw new Error('The page did not return image information.');
      setPageImages(response.result);
      setMessage(response.result.length
        ? `Found ${response.result.length} image${response.result.length === 1 ? '' : 's'} on this page.`
        : 'No images were found on this page.');
    } catch (cause) {
      const description = cause instanceof Error ? cause.message : 'Could not inspect this page.';
      setError(description);
      console.error('AfterImage page image discovery failed.', cause);
    } finally {
      setIsScanning(false);
    }
  }

  const currentDimensions = asset && width && height
    ? calculateOutputDimensions(asset, {
      width: Number(width),
      height: Number(height),
      preserveAspectRatio: keepAspectRatio,
    })
    : null;
  const selectedFormatAvailable = detectedCapabilities[format];
  const canAdjustQuality = format !== 'png';

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">HOME · {mode.toUpperCase()}</p>
          <h1>{mode === 'convert' ? 'Convert images.' : mode === 'compress' ? 'Compress images.' : 'Resize images.'}</h1>
          <p className="heading-copy">One local workspace for your image tasks.</p>
        </div>
        <div className="heading-art" aria-hidden="true"><Sparkles size={20} /></div>
      </div>

      <div className="home-mode-switch" role="group" aria-label="Image processing mode">
        {([
          ['convert', 'Convert', ArrowDownToLine],
          ['compress', 'Compress', Archive],
          ['resize', 'Resize', Crop],
        ] as const).map(([id, label, Icon]) => (
          <button
            type="button"
            key={id}
            className={`home-mode-button ${mode === id ? 'is-active' : ''}`}
            aria-pressed={mode === id}
            onClick={() => onModeChange(id)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {pendingImage && pendingImage.action !== 'batch' && (
        <div className="source-card">
          <div className="source-card-icon"><FileImage size={17} /></div>
          <div className="source-card-content">
            <strong>{actionLabels[pendingImage.action]}</strong>
            <span className="source-url" title={pendingImage.sourceUrl}>{pendingImage.sourceUrl}</span>
            <span className="source-note">AfterImage requests access only to this image host. Credentials and redirects are not followed.</span>
            <Button
              size="small"
              disabled={isProcessing && !isFetchingRemote}
              onClick={() => {
                if (isFetchingRemote) remoteControllerRef.current?.abort();
                else void fetchPendingImage();
              }}
            >
              {isFetchingRemote ? 'Cancel image request' : `Authorize & ${pendingImage.action === 'open' ? 'open image' : `run ${pendingImage.action === 'compress' ? 'compression' : 'PNG/WebP conversion'}`}`}
            </Button>
          </div>
          <IconButton onClick={onClearPendingImage} aria-label="Dismiss selected webpage image"><X size={15} /></IconButton>
        </div>
      )}

      <div
        className={`import-card ${asset ? 'has-image' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        {asset ? (
          <>
            <IconButton className="remove-image" onClick={clearAsset} aria-label="Remove image"><X size={16} /></IconButton>
            <img className="image-preview" src={asset.url} alt={`Preview of ${asset.file.name}`} />
            <div className="preview-meta">
              <strong>{asset.file.name}</strong>
              <span>{formatBytes(asset.file.size)} · {asset.width} × {asset.height}</span>
            </div>
            <div className="image-format-badge">
              <FileImage size={12} /> {formatLabel(asset.format)} · detected from file data
            </div>
            <Button size="small" onClick={() => fileInput.current?.click()}>Replace image</Button>
          </>
        ) : (
          <>
            <div className="import-icon"><FolderOpen size={20} /></div>
            <h2>Select an image to {mode}</h2>
            <p>Drop one JPEG, PNG, WebP, or AVIF here, or browse files.</p>
            <Button onClick={() => fileInput.current?.click()}><FolderOpen size={15} /> Select Image</Button>
            <span className="import-footnote">Files stay on your device. Nothing is uploaded.</span>
          </>
        )}
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          aria-label="Choose one JPEG, PNG, WebP, or AVIF image"
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      </div>

      {asset && (
        <section className="processing-panel" aria-label="Image processing settings">
          <div className="processing-heading">
            <div><p className="eyebrow">LOCAL IMAGE ENGINE</p><h2>{mode[0]?.toUpperCase()}{mode.slice(1)} settings</h2></div>
            <span className="worker-badge"><span /> WEB WORKER</span>
          </div>
          {mode === 'compress' && (
            <p className="mode-guidance">
              Compression uses the selected output format. To keep the source format, choose {formatLabel(asset.format)}.
            </p>
          )}

          <div className="settings-grid">
            <label className="setting-field">
              <span>Output format</span>
              <select value={format} onChange={(event) => setFormat(event.target.value as OutputFormat)}>
                {formatOptions.map((option) => (
                  <option key={option.value} value={option.value} disabled={!detectedCapabilities[option.value]}>
                    {option.label}{detectedCapabilities[option.value] ? '' : ' — unavailable'}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-field">
              <span>Quality <strong>{Math.round(quality * 100)}%</strong></span>
              <input
                type="range"
                min="10"
                max="100"
                value={Math.round(quality * 100)}
                disabled={!canAdjustQuality}
                aria-label="Output quality"
                onChange={(event) => setQuality(Number(event.target.value) / 100)}
              />
              <span className="setting-hint">{format === 'png' ? 'PNG is lossless; quality does not apply.' : 'Lower quality usually reduces file size.'}</span>
            </label>
          </div>

          {mode === 'resize' && <>
            <div className="resize-heading"><span>Output dimensions</span><span className="setting-hint">Original: {asset.width} × {asset.height}</span></div>
            <div className="dimension-controls">
              <label className="setting-field"><span>Width (px)</span><input type="number" min="1" max="100000" value={width} onChange={(event) => setTargetWidth(event.target.value)} /></label>
              <span className="dimension-times">×</span>
              <label className="setting-field"><span>Height (px)</span><input type="number" min="1" max="100000" value={height} onChange={(event) => setTargetHeight(event.target.value)} /></label>
            </div>
            {currentDimensions && (currentDimensions.width !== Number(width) || currentDimensions.height !== Number(height)) && (
              <p className="setting-hint dimensions-note">Aspect ratio preserved: {currentDimensions.width} × {currentDimensions.height}</p>
            )}
            <label className="checkbox-setting">
              <input type="checkbox" checked={keepAspectRatio} onChange={(event) => setKeepAspectRatio(event.target.checked)} />
              <span>Maintain aspect ratio</span>
            </label>
          </>}

          {format === 'jpeg' && (
            <label className="background-setting">
              <span>Transparent areas in JPEG</span>
              <span className="color-control">
                <input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} aria-label="JPEG background color" />
                {backgroundColor.toUpperCase()}
              </span>
            </label>
          )}

          {!selectedFormatAvailable && (
            <p className="inline-error" role="status">{formatLabel(format)} encoding is not available in this browser.</p>
          )}
          <Button
            variant="primary"
            className="process-button"
            disabled={isProcessing || !selectedFormatAvailable}
            onClick={() => void runProcessing()}
          >
            {isProcessing ? <><span className="spinner" /> Processing locally…</> : <><Sparkles size={15} /> Process image</>}
          </Button>
          <p className="processing-disclaimer">Processing runs in a dedicated Web Worker. No estimated or simulated progress is shown.</p>
        </section>
      )}

      {result && resultUrl && asset && (
        <section className="result-panel" aria-label="Processed image result">
          <div className="result-heading">
            <div><p className="eyebrow">PROCESSING COMPLETE</p><h2>Before & after</h2></div>
            <span className={result.reductionPercentage >= 0 ? 'size-change size-reduced' : 'size-change size-increased'}>
              {result.reductionPercentage >= 0
                ? `${result.reductionPercentage.toFixed(1)}% smaller`
                : `${Math.abs(result.reductionPercentage).toFixed(1)}% larger`}
            </span>
          </div>
          <div className="comparison-grid">
            <div className="comparison-item">
              <div className="comparison-preview"><img src={asset.url} alt={`Original ${asset.file.name}`} /></div>
              <div className="comparison-meta"><strong>Original</strong><span>{formatBytes(asset.file.size)}</span><small>{asset.width} × {asset.height}</small></div>
            </div>
            <div className="comparison-item">
              <div className="comparison-preview"><img src={resultUrl} alt={`Processed ${asset.file.name}`} /></div>
              <div className="comparison-meta"><strong>{formatLabel(result.format)}</strong><span>{formatBytes(result.outputSize)}</span><small>{result.width} × {result.height}</small></div>
            </div>
          </div>
          <a
            className="button button-primary download-button"
            href={resultUrl}
            download={`${removeExtension(asset.file.name)}.${extensionForFormat(result.format)}`}
          >
            <ArrowDownToLine size={15} /> Download {extensionForFormat(result.format).toUpperCase()}
          </a>
        </section>
      )}

      <div className="section-title-row">
        <div><p className="eyebrow">BROWSER WORKSPACE</p><h2>From the page</h2></div>
        <span className="subtle-label">Current tab only</span>
      </div>
      <div className="discovery-card">
        <div className="discovery-icon"><ScanSearch size={18} /></div>
        <div className="discovery-copy">
          <strong>Find page images</strong>
          <span>Uses temporary access to the active tab; no image files are fetched.</span>
        </div>
        <Button variant="icon-action" onClick={() => void scanCurrentPage()} disabled={isScanning}>
          {isScanning ? <span className="spinner" aria-label="Scanning" /> : <ArrowRight size={17} />}
          <span className="visually-hidden">{isScanning ? 'Scanning page' : 'Scan current page'}</span>
        </Button>
      </div>
      {pageImages.length > 0 && (
        <div className="page-image-list" aria-label="Images discovered on this page">
          {pageImages.slice(0, 8).map((pageImage, index) => (
            <div className="page-image-row" key={`${pageImage.src}-${index}`}>
              <div className="page-image-thumb"><FileImage size={15} /></div>
              <div>
                <strong title={pageImage.src}>{pageImage.alt || new URL(pageImage.src).pathname.split('/').pop() || `Image ${index + 1}`}</strong>
                <span>{pageImage.width} × {pageImage.height}</span>
              </div>
              <ScanSearch size={14} className="muted-icon" />
            </div>
          ))}
          {pageImages.length > 8 && <p className="subtle-label">Showing 8 of {pageImages.length} images.</p>}
        </div>
      )}

      {(message || error) && <p className={error ? 'inline-error' : 'inline-success'} role={error ? 'alert' : 'status'}>{error || message}</p>}

      <div className="privacy-card">
        <div className="privacy-card-icon"><ShieldCheck size={17} /></div>
        <div><strong>Private by design</strong><span>Local preview and processing. No account. No uploads.</span></div>
        <LockKeyhole size={14} className="muted-icon" />
      </div>
      <footer className="workspace-footer">
        <span><span className="status-dot" /> Ready on this device</span>
        <span><BrandMark size="small" /> Local processing</span>
      </footer>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function removeExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'afterimage';
}
