import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  ArrowDownToLine,
  Check,
  FileImage,
  FolderOpen,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Trash2,
  X,
  Archive,
} from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button';
import { fetchRemoteImage, requestImageHostPermission, validateRemoteImageUrl } from '../../browser/remote-image';
import { extensionForFormat, formatLabel } from '../../engine/format';
import { detectOutputCapabilitiesInWorker, inspectImageInWorker, processImageInWorker } from '../../engine/worker-client';
import { SequentialTaskQueue, type QueueTask, type TaskStatus } from '../../tasks/queue';
import { getBatchImportError, MAX_BATCH_OUTPUT_BYTES } from '../../tasks/batch-limits';
import { createResultsArchiveInWorker } from '../../tasks/export-zip-client';
import { saveHistoryRecord, type HistoryRecord } from '../../storage/history';
import { ImageEngineError, OUTPUT_FORMATS, type DetectedFormat, type ImageProcessingOptions, type ImageProcessingResult, type OutputFormat } from '../../engine/types';
import type { PendingImage } from './ImageStudio';

type BatchTask = QueueTask<File> & {
  filename: string;
  size: number;
  format: DetectedFormat;
  width: number;
  height: number;
  previewUrl: string;
  createdAt: number;
  targetFormat?: OutputFormat;
  result?: ImageProcessingResult;
  outputUrl?: string;
  error?: string;
};

const outputFormats: { value: OutputFormat; label: string }[] = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
];

export function BatchStudio({
  pendingImage,
  onClearPendingImage,
}: {
  pendingImage: PendingImage | null;
  onClearPendingImage: () => void;
}) {
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<OutputFormat>('webp');
  const [quality, setQuality] = useState(0.82);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [capabilities, setCapabilities] = useState<Record<OutputFormat, boolean>>({
    jpeg: false, png: false, webp: false, avif: false,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [remoteBusy, setRemoteBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef(new SequentialTaskQueue<File, ImageProcessingResult>());
  const tasksRef = useRef<BatchTask[]>([]);
  const urlRef = useRef(new Set<string>());
  const importSequence = useRef(0);
  const importBusyRef = useRef(false);
  const importControllerRef = useRef<AbortController | null>(null);
  const remoteControllerRef = useRef<AbortController | null>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const resultsRef = useRef(new Map<string, ImageProcessingResult>());

  function updateTasks(update: (current: BatchTask[]) => BatchTask[]) {
    const next = update(tasksRef.current);
    tasksRef.current = next;
    setTasks(next);
  }

  useEffect(() => {
    let active = true;
    const objectUrls = urlRef.current;
    const taskQueue = queueRef.current;
    const capabilityController = new AbortController();
    mountedRef.current = true;
    void detectOutputCapabilitiesInWorker(capabilityController.signal).then((result) => {
      if (!active) return;
      setCapabilities(result);
      setFormat((current) => result[current] ? current : OUTPUT_FORMATS.find((formatOption) => result[formatOption]) ?? current);
    }).catch((cause: unknown) => {
      console.error('AfterImage batch workspace could not detect output formats.', cause);
      if (active) setError('Could not detect image encoder support in this browser.');
    });
    return () => {
      active = false;
      mountedRef.current = false;
      capabilityController.abort();
      importSequence.current += 1;
      importControllerRef.current?.abort();
      remoteControllerRef.current?.abort();
      exportControllerRef.current?.abort();
      taskQueue.cancelAll(tasksRef.current);
      for (const url of objectUrls) URL.revokeObjectURL(url);
      objectUrls.clear();
    };
  }, []);

  async function importFiles(files: FileList | File[]): Promise<boolean> {
    if (importBusyRef.current) return false;
    const incoming = Array.from(files);
    if (!incoming.length) return false;
    const currentCount = tasksRef.current.length;
    const currentBytes = tasksRef.current.reduce((total, task) => total + task.size, 0);
    const incomingBytes = incoming.reduce((total, file) => total + file.size, 0);
    const importError = getBatchImportError(currentCount, currentBytes, incoming.length, incomingBytes);
    if (importError) {
      setError(importError);
      return false;
    }
    setError('');
    setNotice('');
    importBusyRef.current = true;
    setIsImporting(true);
    const sequence = ++importSequence.current;
    const controller = new AbortController();
    importControllerRef.current = controller;
    const added: BatchTask[] = [];
    let failed = false;

    try {
      for (const file of incoming) {
        if (sequence !== importSequence.current) return false;
        try {
          if (file.size > 100 * 1024 * 1024) throw new ImageEngineError('IMAGE_TOO_LARGE', `${file.name} is larger than 100 MB.`);
          const inspection = await inspectImageInWorker(file, controller.signal);
          if (sequence !== importSequence.current) return false;
          const previewUrl = URL.createObjectURL(file);
          urlRef.current.add(previewUrl);
          added.push({
            id: crypto.randomUUID(),
            input: file,
            filename: file.name,
            size: file.size,
            format: inspection.format,
            width: inspection.width,
            height: inspection.height,
            previewUrl,
            createdAt: Date.now(),
            status: 'pending',
          });
        } catch (cause) {
            if (!mountedRef.current) return false;
            if (cause instanceof Error && cause.name === 'AbortError') return false;
          failed = true;
          const reason = cause instanceof Error ? cause.message : 'Unsupported image.';
          setNotice((current) => `${current ? `${current} ` : ''}${file.name}: ${reason}`);
        }
      }
      if (added.length) {
        updateTasks((current) => [...current, ...added]);
        setNotice((current) => `${current ? `${current} ` : ''}Added ${added.length} image${added.length === 1 ? '' : 's'} to the queue.`);
      }
      return added.length > 0 && !failed;
    } finally {
      importBusyRef.current = false;
      if (importControllerRef.current === controller) importControllerRef.current = null;
      if (mountedRef.current && sequence === importSequence.current) setIsImporting(false);
    }
  }

  async function addRemoteImage() {
    if (!pendingImage || remoteBusy) return;
    setError('');
    setNotice('');
    setRemoteBusy(true);
    const controller = new AbortController();
    remoteControllerRef.current = controller;
    try {
      const url = validateRemoteImageUrl(pendingImage.sourceUrl);
      const granted = await requestImageHostPermission(url);
      if (!granted) {
        throw new Error('Access was denied. You can save the web image and import it from your device instead.');
      }
      const file = await fetchRemoteImage(url, controller.signal);
      const imported = await importFiles([file]);
      if (imported) {
        const task = tasksRef.current.find((entry) => entry.input === file);
        if (task && quickAction) {
          const quickFormat: OutputFormat = pendingImage.action === 'png' ? 'png' : 'webp';
          await processQueue(new Set([task.id]), {
            ...settings(),
            format: quickFormat,
            quality: pendingImage.action === 'compress' ? 0.72 : 0.82,
            resize: { preserveAspectRatio: true },
          });
        } else {
          setNotice(`${file.name} was added to the batch. The browser received only this image host permission.`);
        }
        if (mountedRef.current) onClearPendingImage();
      }
    } catch (cause) {
      if (!mountedRef.current || (cause instanceof Error && cause.name === 'AbortError')) return;
      const description = cause instanceof Error ? cause.message : 'Could not fetch the web image.';
      setError(description);
      console.error('AfterImage could not acquire the context-menu image.', cause);
    } finally {
      if (remoteControllerRef.current === controller) remoteControllerRef.current = null;
      if (mountedRef.current) setRemoteBusy(false);
    }
  }

  function settings(): ImageProcessingOptions {
    return {
      format,
      quality,
      resize: {
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
        preserveAspectRatio: keepAspectRatio,
      },
      backgroundColor,
    };
  }

  async function persistTask(
    task: BatchTask,
    status: TaskStatus,
    result?: ImageProcessingResult,
    taskError?: string,
    options: ImageProcessingOptions = settings(),
  ) {
    const record: HistoryRecord = {
      id: task.id,
      filename: task.filename,
      sourceSize: task.size,
      status: status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'failed',
      operation: 'batch',
      options,
      createdAt: task.createdAt,
      completedAt: Date.now(),
      ...(result ? {
        outputBlob: result.blob,
        outputFormat: result.format,
        outputSize: result.outputSize,
        width: result.width,
        height: result.height,
      } : {}),
      ...(taskError ? { error: taskError } : {}),
    };
    try {
      await saveHistoryRecord(record);
    } catch (cause) {
      const description = cause instanceof Error ? cause.message : 'Local history could not be saved.';
      setError(`Task ${task.filename} finished, but its history could not be saved: ${description}`);
      console.error('AfterImage could not persist a batch history record.', cause);
    }
  }

  async function processQueue(taskIds?: Set<string>, options?: ImageProcessingOptions) {
    if (isRunning) return;
    const pending = tasksRef.current
      .filter((task) => task.status === 'pending' && (!taskIds || taskIds.has(task.id)))
      .map((task) => ({ id: task.id, input: task.input, status: task.status as 'pending' }));
    if (!pending.length) return;
    setError('');
    setNotice('');
    setIsRunning(true);
    const processSettings = options ?? settings();
    const pendingIds = new Set(pending.map(({ id }) => id));
    updateTasks((current) => current.map((task) => pendingIds.has(task.id)
      ? { ...task, targetFormat: processSettings.format }
      : task));
    try {
      await queueRef.current.run(
        pending,
        async (file, signal, queueTask) => {
          const task = tasksRef.current.find((entry) => entry.id === queueTask.id);
          if (!task) throw new Error('The queued image is no longer available.');
          const result = await processImageInWorker(file, processSettings, signal);
          const completedBytes = tasksRef.current.reduce((total, current) => total + (current.result?.outputSize ?? 0), 0);
          if (result.outputSize > MAX_BATCH_OUTPUT_BYTES - completedBytes) {
            throw new Error('Completed batch outputs may not exceed 500 MB. Download or remove completed tasks before continuing.');
          }
          resultsRef.current.set(task.id, result);
          return result;
        },
        (queueTask, taskError) => {
          if (!mountedRef.current) {
            resultsRef.current.delete(queueTask.id);
            return;
          }
          const currentTask = tasksRef.current.find(({ id }) => id === queueTask.id);
          if (!currentTask) {
            resultsRef.current.delete(queueTask.id);
            return;
          }
          const result = queueTask.status === 'completed' ? resultsRef.current.get(queueTask.id) : undefined;
          const outputUrl = result ? URL.createObjectURL(result.blob) : undefined;
          if (outputUrl) urlRef.current.add(outputUrl);
          updateTasks((current) => current.map((task) => task.id === queueTask.id
            ? {
              ...task,
              status: queueTask.status,
              ...(taskError ? { error: taskError.message } : {}),
              ...(result && outputUrl ? { result, outputUrl } : {}),
            }
            : task));

          if (queueTask.status === 'completed' || queueTask.status === 'failed' || queueTask.status === 'cancelled') {
            void persistTask(currentTask, queueTask.status, result, taskError?.message, processSettings);
            resultsRef.current.delete(queueTask.id);
          }
        },
      );
    } catch (cause) {
      if (!mountedRef.current) return;
      const description = cause instanceof Error ? cause.message : 'The task queue failed.';
      setError(description);
      console.error('AfterImage batch queue failed.', cause);
    } finally {
      if (mountedRef.current) setIsRunning(false);
    }
  }

  function retryTask(id: string) {
    updateTasks((current) => current.map((task) => task.id === id
      ? { ...task, status: 'pending', error: undefined }
      : task));
  }

  function retryFailed() {
    const failedIds = new Set(tasksRef.current.filter((task) => task.status === 'failed').map((task) => task.id));
    if (!failedIds.size) return;
    updateTasks((current) => current.map((task) => failedIds.has(task.id)
      ? { ...task, status: 'pending', error: undefined }
      : task));
    void processQueue(failedIds);
  }

  function downloadSelected() {
    const selected = tasksRef.current.filter((task) =>
      selectedIds.has(task.id) && task.status === 'completed' && task.result?.blob,
    );
    for (const task of selected) {
      downloadBlob(
        task.result!.blob,
        `${removeExtension(task.filename)}.${extensionForFormat(task.result!.format)}`,
      );
    }
    if (selected.length) setNotice(`Started ${selected.length} selected download${selected.length === 1 ? '' : 's'}.`);
  }

  function cancelTask(task: BatchTask) {
    queueRef.current.cancel(task.id);
    if (task.status === 'pending') {
      if (!isRunning) {
        queueRef.current.forgetCancellation(task.id);
        updateTasks((current) => current.map((entry) => entry.id === task.id ? { ...entry, status: 'cancelled' } : entry));
        void persistTask(task, 'cancelled');
      }
    }
  }

  function cancelAll() {
    queueRef.current.cancelAll(tasksRef.current);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    for (const task of tasksRef.current) {
      if (!selectedIds.has(task.id)) continue;
      if (task.status === 'processing' || task.status === 'pending') {
        queueRef.current.cancel(task.id);
        void persistTask(task, 'cancelled');
        if (!isRunning) queueRef.current.forgetCancellation(task.id);
      }
      revokeTaskUrls(task);
    }
    updateTasks((current) => current.filter((task) => !selectedIds.has(task.id)));
    setSelectedIds(new Set());
  }

  function revokeTaskUrls(task: BatchTask) {
    urlRef.current.delete(task.previewUrl);
    URL.revokeObjectURL(task.previewUrl);
    if (task.outputUrl) {
      urlRef.current.delete(task.outputUrl);
      URL.revokeObjectURL(task.outputUrl);
    }
  }

  async function exportZip() {
    const controller = new AbortController();
    exportControllerRef.current = controller;
    setIsExporting(true);
    setError('');
    try {
      const currentResults: HistoryRecord[] = tasksRef.current
        .filter((task) => task.status === 'completed' && task.result)
        .map((task) => ({
          id: task.id,
          filename: task.filename,
          sourceSize: task.size,
          status: 'completed',
          options: settings(),
          createdAt: task.createdAt,
          completedAt: Date.now(),
          outputBlob: task.result!.blob,
          outputFormat: task.result!.format,
          outputSize: task.result!.outputSize,
        }));
      const archive = await createResultsArchiveInWorker(currentResults, controller.signal);
      downloadBlob(archive, `afterimage-batch-${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice(`Exported ${currentResults.length} processed image${currentResults.length === 1 ? '' : 's'} as ZIP.`);
    } catch (cause) {
      if (!mountedRef.current || (cause instanceof Error && cause.name === 'AbortError')) return;
      const description = cause instanceof Error ? cause.message : 'Could not export ZIP.';
      setError(description);
      console.error('AfterImage failed to export batch results.', cause);
    } finally {
      if (exportControllerRef.current === controller) {
        exportControllerRef.current = null;
        if (mountedRef.current) setIsExporting(false);
      }
    }
  }

  function cancelExport() {
    exportControllerRef.current?.abort();
  }

  const counts = tasks.reduce<Record<TaskStatus, number>>((summary, task) => {
    summary[task.status] += 1;
    return summary;
  }, { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 });
  const completedCount = tasks.filter((task) => task.status === 'completed').length;
  const failedCount = counts.failed;
  const originalBytes = tasks.reduce((total, task) => total + task.size, 0);
  const outputBytes = tasks.reduce((total, task) => total + (task.result?.outputSize ?? 0), 0);
  const netSavedBytes = tasks.reduce((total, task) => total + (task.result ? task.size - task.result.outputSize : 0), 0);
  const selectedCompletedCount = tasks.filter((task) => selectedIds.has(task.id) && task.status === 'completed' && task.result).length;
  const quickAction = pendingImage?.action !== 'batch' && pendingImage?.action !== 'open';

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BATCH WORKSPACE</p>
          <h1>One queue.<br />Every image.</h1>
          <p className="heading-copy">Process images locally with consistent settings.</p>
        </div>
        <div className="heading-art" aria-hidden="true"><Archive size={20} /></div>
      </div>

      {pendingImage && (
        <div className="source-card">
          <div className="source-card-icon"><FileImage size={17} /></div>
          <div className="source-card-content">
            <strong>{quickAction ? 'Quick action from webpage' : 'Web image selected'}</strong>
            <span className="source-url" title={pendingImage.sourceUrl}>{pendingImage.sourceUrl}</span>
            <span className="source-note">Fetching requires your permission for this image host. Credentials and redirects are not followed.</span>
            <Button
              size="small"
              disabled={isImporting && !remoteBusy}
              onClick={() => {
                if (remoteBusy) {
                  remoteControllerRef.current?.abort();
                  importControllerRef.current?.abort();
                } else {
                  void addRemoteImage();
                }
              }}
            >
              {remoteBusy ? <><X size={13} /> Cancel web image</> : <><ImagePlus size={13} /> Authorize & {quickAction ? 'process image' : 'add image'}</>}
            </Button>
          </div>
          <IconButton onClick={onClearPendingImage} aria-label="Dismiss web image"><X size={15} /></IconButton>
        </div>
      )}

      <div className="batch-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        void importFiles(event.dataTransfer.files);
      }}>
        <div className="import-icon"><FolderOpen size={19} /></div>
        <strong>{isImporting ? 'Inspecting images locally…' : 'Drop multiple images here'}</strong>
        <span>Up to 100 images · 100 MB each · 500 MB total input and output</span>
        <Button onClick={() => inputRef.current?.click()} disabled={isImporting}>
          <ImagePlus size={14} /> Add Images
        </Button>
        <input ref={inputRef} className="visually-hidden" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Choose multiple images" onChange={(event) => {
          if (event.currentTarget.files) void importFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }} />
      </div>

      <section className="batch-settings">
        <div className="processing-heading">
          <div><p className="eyebrow">ONE SET OF SETTINGS</p><h2>Batch output</h2></div>
          <span className="worker-badge"><span /> SINGLE WORKER</span>
        </div>
        <div className="settings-grid">
          <label className="setting-field">
            <span>Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as OutputFormat)}>
              {outputFormats.map((item) => <option key={item.value} value={item.value} disabled={!capabilities[item.value]}>{item.label}{capabilities[item.value] ? '' : ' — unavailable'}</option>)}
            </select>
          </label>
          <label className="setting-field">
            <span>Quality <strong>{Math.round(quality * 100)}%</strong></span>
            <input type="range" min="10" max="100" value={Math.round(quality * 100)} disabled={format === 'png'} aria-label="Batch output quality" onChange={(event) => setQuality(Number(event.target.value) / 100)} />
            <span className="setting-hint">{format === 'png' ? 'PNG is lossless.' : 'Applied equally to every image.'}</span>
          </label>
        </div>
        <div className="dimension-controls batch-dimensions">
          <label className="setting-field"><span>Width (px, optional)</span><input type="number" min="1" max="100000" value={width} onChange={(event) => setWidth(event.target.value)} /></label>
          <span className="dimension-times">×</span>
          <label className="setting-field"><span>Height (px, optional)</span><input type="number" min="1" max="100000" value={height} onChange={(event) => setHeight(event.target.value)} /></label>
        </div>
        <label className="checkbox-setting"><input type="checkbox" checked={keepAspectRatio} onChange={(event) => setKeepAspectRatio(event.target.checked)} /><span>Maintain aspect ratio</span></label>
        {format === 'jpeg' && <label className="background-setting"><span>JPEG transparency background</span><span className="color-control"><input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} aria-label="Batch JPEG background color" />{backgroundColor.toUpperCase()}</span></label>}
      </section>

      <div className="batch-toolbar">
        <div><p className="eyebrow">PROCESSING QUEUE</p><h2>{tasks.length} image{tasks.length === 1 ? '' : 's'}</h2></div>
        <div className="batch-selection-actions">
          {tasks.length > 0 && <Button size="small" onClick={() => setSelectedIds(selectedIds.size === tasks.length ? new Set() : new Set(tasks.map((task) => task.id)))}>{selectedIds.size === tasks.length ? 'Deselect all' : 'Select all'}</Button>}
          {selectedIds.size > 0 && <Button size="small" onClick={deleteSelected}><Trash2 size={12} /> Delete {selectedIds.size}</Button>}
        </div>
      </div>

      {tasks.length > 0 && (
        <>
          <div className="batch-stats" aria-label="Batch statistics">
            <div><span>Total</span><strong>{tasks.length}</strong></div>
            <div><span>Completed</span><strong>{completedCount}</strong></div>
            <div><span>Failed</span><strong>{failedCount}</strong></div>
            <div><span>Original Size</span><strong>{formatBytes(originalBytes)}</strong></div>
            <div><span>Output Size</span><strong>{formatBytes(outputBytes)}</strong></div>
            <div><span>Total Saved</span><strong>{formatSignedBytes(netSavedBytes)}</strong></div>
          </div>
          <div className="queue-summary" role="status" aria-live="polite">
            {counts.processing > 0
              ? `${counts.completed} of ${tasks.length} complete · ${counts.processing} processing · ${counts.pending} waiting`
              : `${counts.completed} completed · ${counts.pending} waiting · ${counts.failed} failed · ${counts.cancelled} cancelled`}
          </div>
          <div className="batch-actions">
            <Button variant="primary" disabled={isRunning || isImporting || counts.pending === 0 || !capabilities[format]} onClick={() => void processQueue()}>
              {isRunning ? <><LoaderCircle size={14} className="spin-icon" /> Processing queue…</> : <><ArrowDownToLine size={14} /> Start Processing ({counts.pending})</>}
            </Button>
            {isRunning && <Button onClick={cancelAll}><X size={13} /> Cancel queue</Button>}
            {failedCount > 0 && <Button disabled={isRunning} onClick={retryFailed}><RotateCcw size={13} /> Retry Failed ({failedCount})</Button>}
            {selectedCompletedCount > 0 && <Button onClick={downloadSelected}><ArrowDownToLine size={13} /> Download Selected ({selectedCompletedCount})</Button>}
            {completedCount > 0 && (isExporting
              ? <Button onClick={cancelExport}><X size={13} /> Cancel ZIP</Button>
              : <Button onClick={() => void exportZip()}><Archive size={13} /> Export ZIP</Button>)}
          </div>
        </>
      )}

      {tasks.length === 0 ? (
        <div className="batch-empty"><ImagePlus size={19} /><span>Your queue is empty. Add multiple images to begin.</span></div>
      ) : (
        <div className="batch-task-list">
          {tasks.map((task) => (
            <article className={`batch-task batch-task-${task.status}`} key={task.id}>
              <input type="checkbox" checked={selectedIds.has(task.id)} aria-label={`Select ${task.filename}`} onChange={() => toggleSelected(task.id)} />
              <img src={task.previewUrl} alt="" loading="lazy" decoding="async" />
              <div className="batch-task-info">
                <strong title={task.filename}>{task.filename}</strong>
                <span>{formatBytes(task.size)} · {task.width} × {task.height} · {formatLabel(task.format)}</span>
                <small>Target: {formatLabel(task.result?.format ?? task.targetFormat ?? format)}</small>
                {task.error && <small role="alert">{task.error}</small>}
                {task.result && <small>{formatBytes(task.result.outputSize)} output · {task.result.reductionPercentage >= 0 ? `${task.result.reductionPercentage.toFixed(1)}% smaller` : `${Math.abs(task.result.reductionPercentage).toFixed(1)}% larger`}</small>}
              </div>
              <span className={`task-status task-status-${task.status}`}>{statusLabel(task.status)}</span>
              {task.status === 'completed' && task.outputUrl && task.result && (
                <a className="task-icon-action" href={task.outputUrl} download={`${removeExtension(task.filename)}.${extensionForFormat(task.result.format)}`} aria-label={`Download ${task.filename}`}><ArrowDownToLine size={15} /></a>
              )}
              {task.status === 'failed' && <IconButton onClick={() => retryTask(task.id)} aria-label={`Retry ${task.filename}`}><RotateCcw size={14} /></IconButton>}
              {(task.status === 'pending' || task.status === 'processing') && <IconButton onClick={() => cancelTask(task)} aria-label={`Cancel ${task.filename}`}><X size={14} /></IconButton>}
            </article>
          ))}
        </div>
      )}

      {(error || notice) && <p className={error ? 'inline-error' : 'inline-success'} role={error ? 'alert' : 'status'}>{error || notice}</p>}
      <div className="privacy-card">
        <div className="privacy-card-icon"><Check size={16} /></div>
        <div><strong>Private batch processing</strong><span>One image at a time. Original files stay in memory; completed outputs are retained locally.</span></div>
      </div>
      <footer className="workspace-footer">
        <span>Queue state reflects actual task status; no estimated percentage.</span>
        <span>{counts.completed} / {tasks.length} complete</span>
      </footer>
    </>
  );
}

function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'pending': return 'Waiting';
    case 'processing': return 'Processing';
    case 'completed': return 'Done';
    case 'failed': return 'Failed';
    case 'cancelled': return 'Cancelled';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSignedBytes(bytes: number): string {
  const amount = formatBytes(Math.abs(bytes));
  return bytes < 0 ? `${amount} larger` : `${amount} saved`;
}

function removeExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'afterimage';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
