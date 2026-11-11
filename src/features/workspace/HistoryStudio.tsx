import { useEffect, useState } from 'react';
import { ArrowDownToLine, Clock3, Search, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button';
import { extensionForFormat, formatLabel } from '../../engine/format';
import {
  filterHistorySummaries,
  type HistoryOperationFilter,
  type HistorySortOrder,
  type HistoryStatusFilter,
} from './history-filters';
import {
  clearHistoryRecords,
  deleteHistoryRecord,
  getHistoryRecord,
  listHistorySummaries,
  MAX_HISTORY_ITEMS,
  MAX_HISTORY_OUTPUT_BYTES,
  type HistorySummary,
} from '../../storage/history';

export function HistoryStudio() {
  const [records, setRecords] = useState<HistorySummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [operationFilter, setOperationFilter] = useState<HistoryOperationFilter>('all');
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<HistorySortOrder>('newest');
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const visibleRecords = filterHistorySummaries(records, {
    query,
    operation: operationFilter,
    status: statusFilter,
    sort: sortOrder,
  });
  const storedOutputBytes = records.reduce((total, record) => total + record.storedOutputBytes, 0);

  useEffect(() => {
    let isCurrent = true;
    void listHistorySummaries().then((history) => {
      if (isCurrent) setRecords(history);
    }).catch((cause: unknown) => {
      const description = cause instanceof Error ? cause.message : 'Local history could not be loaded.';
      if (isCurrent) setError(description);
      console.error('AfterImage could not load processing history.', cause);
    }).finally(() => {
      if (isCurrent) setLoading(false);
    });
    return () => { isCurrent = false; };
  }, []);

  async function removeRecord(id: string) {
    setDeletingIds((current) => new Set(current).add(id));
    try {
      await deleteHistoryRecord(id);
      setRecords((current) => current.filter((record) => record.id !== id));
      setError('');
    } catch (cause) {
      const description = cause instanceof Error ? cause.message : 'The history item could not be deleted.';
      setError(description);
      console.error('AfterImage could not delete a history record.', cause);
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function download(id: string, filename: string) {
    setDownloadingIds((current) => new Set(current).add(id));
    try {
      const record = await getHistoryRecord(id);
      if (!record?.outputBlob || !record.outputFormat) {
        throw new Error('The saved output is no longer available.');
      }
      const url = URL.createObjectURL(record.outputBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${removeExtension(filename)}.${extensionForFormat(record.outputFormat)}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      const description = cause instanceof Error ? cause.message : 'The saved output could not be downloaded.';
      setError(description);
      console.error('AfterImage could not download a history result.', cause);
    } finally {
      setDownloadingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function clearAll() {
    setClearing(true);
    try {
      await clearHistoryRecords();
      setRecords([]);
      setError('');
      setConfirmClear(false);
    } catch (cause) {
      const description = cause instanceof Error ? cause.message : 'Local history could not be cleared.';
      setError(description);
      console.error('AfterImage could not clear processing history.', cause);
    } finally {
      setClearing(false);
    }
  }

  function resetFilters() {
    setQuery('');
    setOperationFilter('all');
    setStatusFilter('all');
    setSortOrder('newest');
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ON THIS DEVICE</p>
          <h1>Processing<br />history.</h1>
          <p className="heading-copy">Recent results and task statuses, stored locally.</p>
        </div>
        <div className="heading-art" aria-hidden="true"><Clock3 size={20} /></div>
      </div>

      <div className="history-toolbar">
        <div>
          <span>{records.length} of {MAX_HISTORY_ITEMS} saved task{records.length === 1 ? '' : 's'}</span>
          <span className="history-storage">Stored outputs {formatBytes(storedOutputBytes)} / {formatBytes(MAX_HISTORY_OUTPUT_BYTES)}</span>
        </div>
        {records.length > 0 && <Button size="small" disabled={clearing} onClick={() => setConfirmClear(true)}><Trash2 size={12} /> Clear history</Button>}
      </div>
      {records.length > 0 && (
        <div className="history-controls">
          <label className="history-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filenames" aria-label="Search history filenames" />
          </label>
          <label>
            <span className="visually-hidden">Filter by operation</span>
            <select value={operationFilter} onChange={(event) => setOperationFilter(event.target.value as HistoryOperationFilter)} aria-label="Filter history by operation">
              <option value="all">All operations</option>
              <option value="convert">Convert</option>
              <option value="compress">Compress</option>
              <option value="resize">Resize</option>
              <option value="edit">Edit</option>
              <option value="batch">Batch</option>
              <option value="unknown">Other / older records</option>
            </select>
          </label>
          <label>
            <span className="visually-hidden">Filter by status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as HistoryStatusFilter)} aria-label="Filter history by status">
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label>
            <span className="visually-hidden">Sort history</span>
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as HistorySortOrder)} aria-label="Sort history">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {confirmClear && records.length > 0 && (
        <div className="history-confirm" role="group" aria-live="polite" aria-labelledby="history-clear-title" aria-describedby="history-clear-description">
          <div>
            <strong id="history-clear-title">Clear all local history?</strong>
            <span id="history-clear-description">Saved output files and task records on this device will be deleted.</span>
          </div>
          <Button size="small" disabled={clearing} onClick={() => setConfirmClear(false)}>Keep history</Button>
          <Button size="small" disabled={clearing} onClick={() => void clearAll()}>{clearing ? 'Clearing…' : 'Clear all'}</Button>
        </div>
      )}
      {loading ? (
        <div className="batch-empty">Loading local history…</div>
      ) : records.length === 0 ? (
        <div className="batch-empty"><Clock3 size={19} /><span>No processing history yet.</span></div>
      ) : visibleRecords.length === 0 ? (
        <div className="batch-empty">
          <span>No history matches these filters.</span>
          <Button size="small" onClick={resetFilters}>Clear filters</Button>
        </div>
      ) : (
        <div className="history-list">
          {visibleRecords.map((record) => (
            <article className="history-item" key={record.id}>
              <div className={`history-status history-status-${record.status}`} aria-label={record.status} />
              <div className="history-item-info">
                <strong title={record.filename}>{record.filename}</strong>
                <span>{operationLabel(record.operation)} · {record.status}</span>
                <span>Original {formatBytes(record.sourceSize)}</span>
                {record.outputFormat && <span>Output {formatBytes(record.outputSize ?? 0)} · {formatLabel(record.outputFormat)}</span>}
                <small>{new Date(record.completedAt).toLocaleString()}</small>
                {record.error && <small className="history-error">{record.error}</small>}
                {record.status === 'completed' && !record.hasOutput && <small>Output file is not stored; download unavailable.</small>}
              </div>
              {record.hasOutput && (
                <IconButton title="Download result" aria-label={`Download ${record.filename}`} disabled={downloadingIds.has(record.id)} onClick={() => void download(record.id, record.filename)}>
                  <ArrowDownToLine size={15} />
                </IconButton>
              )}
              <IconButton title="Delete history item" aria-label={`Delete ${record.filename} from history`} disabled={deletingIds.has(record.id)} onClick={() => void removeRecord(record.id)}>
                <Trash2 size={14} />
              </IconButton>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function formatBytes(bytes = 0): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function removeExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'image';
}

function operationLabel(operation: HistorySummary['operation']): string {
  switch (operation) {
    case 'convert': return 'Convert';
    case 'compress': return 'Compress';
    case 'resize': return 'Resize';
    case 'edit': return 'Edit';
    case 'batch': return 'Batch';
    default: return 'Image processing';
  }
}
