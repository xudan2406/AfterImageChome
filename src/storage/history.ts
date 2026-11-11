import type { ImageProcessingOptions, ImageProcessingResult } from '../engine/types';

const DATABASE_NAME = 'afterimage-local';
const DATABASE_VERSION = 1;
const STORE_NAME = 'processing-history';
export const MAX_HISTORY_ITEMS = 100;
export const MAX_HISTORY_OUTPUT_BYTES = 500 * 1024 * 1024;

export type HistoryRecord = {
  id: string;
  filename: string;
  sourceSize: number;
  operation?: 'convert' | 'compress' | 'resize' | 'edit' | 'batch';
  status: 'completed' | 'failed' | 'cancelled';
  options: ImageProcessingOptions;
  createdAt: number;
  completedAt: number;
  error?: string;
  outputBlob?: Blob;
  outputFormat?: ImageProcessingResult['format'];
  outputSize?: number;
  width?: number;
  height?: number;
};

export type HistorySummary = Omit<HistoryRecord, 'outputBlob'> & {
  hasOutput: boolean;
  storedOutputBytes: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('completedAt', 'completedAt');
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error('Could not open local processing history.'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('Local processing history is blocked by another open AfterImage window.'));
    };
  });
}

export async function saveHistoryRecord(record: HistoryRecord): Promise<void> {
  if ((record.outputBlob?.size ?? 0) > MAX_HISTORY_OUTPUT_BYTES) {
    throw new Error('This output exceeds the 500 MB local history storage limit.');
  }
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(record);
      const oldestRecords: Array<{ id: string; outputBytes: number }> = [];
      let totalRecords = 0;
      let totalOutputBytes = 0;
      const recordsRequest = store.index('completedAt').openCursor();
      recordsRequest.onsuccess = () => {
        const cursor = recordsRequest.result;
        if (cursor) {
          const item = cursor.value as HistoryRecord;
          const outputBytes = item.outputBlob?.size ?? 0;
          totalRecords += 1;
          totalOutputBytes += outputBytes;
          oldestRecords.push({ id: item.id, outputBytes });
          cursor.continue();
          return;
        }

        while (totalRecords > MAX_HISTORY_ITEMS || totalOutputBytes > MAX_HISTORY_OUTPUT_BYTES) {
          const oldest = oldestRecords.shift();
          if (!oldest) break;
          totalRecords -= 1;
          totalOutputBytes -= oldest.outputBytes;
          store.delete(oldest.id);
        }
      };
      recordsRequest.onerror = () => reject(recordsRequest.error ?? new Error('Could not enforce local history storage limits.'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save processing history.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving processing history was aborted.'));
    });
  } finally {
    database.close();
  }
}

export async function listHistorySummaries(): Promise<HistorySummary[]> {
  const database = await openDatabase();
  try {
    return await new Promise<HistorySummary[]>((resolve, reject) => {
      const summaries: HistorySummary[] = [];
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .index('completedAt')
        .openCursor(null, 'prev');
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(summaries);
          return;
        }
        const { outputBlob, ...record } = cursor.value as HistoryRecord;
        summaries.push({
          ...record,
          hasOutput: Boolean(outputBlob),
          storedOutputBytes: outputBlob?.size ?? 0,
        });
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read processing history.'));
    });
  } finally {
    database.close();
  }
}

export async function getHistoryRecord(id: string): Promise<HistoryRecord | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise<HistoryRecord | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result as HistoryRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not read the selected processing result.'));
    });
  } finally {
    database.close();
  }
}

export async function clearHistoryRecords(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear processing history.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Clearing processing history was aborted.'));
    });
  } finally {
    database.close();
  }
}

export async function deleteHistoryRecord(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete processing history.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Deleting processing history was aborted.'));
    });
  } finally {
    database.close();
  }
}
