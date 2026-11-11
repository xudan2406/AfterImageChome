import type { HistoryRecord } from '../storage/history';

type ExportResponse =
  | { id: string; ok: true; blob: Blob }
  | { id: string; ok: false; error: string };

export function createResultsArchiveInWorker(records: HistoryRecord[], signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./export-zip.worker.ts', import.meta.url), { type: 'module' });
    const requestId = crypto.randomUUID();
    let settled = false;
    const handleAbort = () => {
      finish(() => reject(new DOMException('ZIP export was cancelled.', 'AbortError')));
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', handleAbort);
      worker.terminate();
      callback();
    };

    if (signal?.aborted) {
      worker.terminate();
      reject(new DOMException('ZIP export was cancelled.', 'AbortError'));
      return;
    }
    signal?.addEventListener('abort', handleAbort, { once: true });

    worker.addEventListener('message', (event: MessageEvent<ExportResponse>) => {
      const response = event.data;
      if (response.id !== requestId) return;
      if (response.ok) {
        finish(() => resolve(response.blob));
      } else {
        finish(() => reject(new Error(response.error)));
      }
    });
    worker.addEventListener('error', (event) => {
      finish(() => reject(new Error(event.message || 'The ZIP worker stopped unexpectedly.')));
    });
    worker.addEventListener('messageerror', () => {
      finish(() => reject(new Error('The ZIP worker returned an unreadable result.')));
    });

    try {
      worker.postMessage({ id: requestId, records });
    } catch (cause) {
      finish(() => reject(new Error('The selected results could not be sent to the ZIP worker.', { cause })));
    }
  });
}
