import { createResultsArchive } from './export-zip';
import type { HistoryRecord } from '../storage/history';

type ExportRequest = {
  id: string;
  records: HistoryRecord[];
};

type ExportResponse =
  | { id: string; ok: true; blob: Blob }
  | { id: string; ok: false; error: string };

const workerScope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<ExportRequest>) => void): void;
  postMessage(message: ExportResponse): void;
};

workerScope.addEventListener('message', (event) => {
  const { id, records } = event.data;
  void createResultsArchive(records).then((blob) => {
    workerScope.postMessage({ id, ok: true, blob });
  }).catch((cause: unknown) => {
    const error = cause instanceof Error ? cause.message : 'Could not create the ZIP archive.';
    workerScope.postMessage({ id, ok: false, error });
  });
});
