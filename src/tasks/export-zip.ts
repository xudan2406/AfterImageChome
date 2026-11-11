import JSZip from 'jszip';
import type { HistoryRecord } from '../storage/history';
import { sanitizeFilename } from '../utils/sanitize-filename';

const MAX_ZIP_BYTES = 500 * 1024 * 1024;

export async function createResultsArchive(records: HistoryRecord[]): Promise<Blob> {
  const completed = records.filter((record) => record.status === 'completed' && record.outputBlob);
  if (completed.length === 0) throw new Error('There are no completed image results to export.');

  const totalBytes = completed.reduce((total, record) => total + record.outputBlob!.size, 0);
  if (totalBytes > MAX_ZIP_BYTES) throw new Error('The selected results exceed the 500 MB ZIP export limit.');

  const archive = new JSZip();
  const usedNames = new Set<string>();
  for (const record of completed) {
    const baseName = record.filename.replace(/\.[^.]+$/, '') || 'image';
    const extension = record.outputFormat === 'jpeg' ? 'jpg' : record.outputFormat ?? 'bin';
    const name = uniqueArchiveName(`${sanitizeFilename(baseName)}.${extension}`, usedNames);
    archive.file(name, record.outputBlob!, { date: new Date(record.completedAt) });
  }

  const blob = await archive.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
  if (blob.size > MAX_ZIP_BYTES) throw new Error('The generated ZIP exceeds the 500 MB export limit.');
  return blob;
}

function uniqueArchiveName(filename: string, used: Set<string>): string {
  if (!used.has(filename)) {
    used.add(filename);
    return filename;
  }
  const dot = filename.lastIndexOf('.');
  const stem = dot > -1 ? filename.slice(0, dot) : filename;
  const extension = dot > -1 ? filename.slice(dot) : '';
  let suffix = 2;
  while (used.has(`${stem}-${suffix}${extension}`)) suffix += 1;
  const unique = `${stem}-${suffix}${extension}`;
  used.add(unique);
  return unique;
}
