import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createResultsArchive } from './export-zip';
import type { HistoryRecord } from '../storage/history';

function record(id: string, filename: string, content: string): HistoryRecord {
  const blob = new Blob([content], { type: 'image/png' });
  return {
    id,
    filename,
    sourceSize: 1,
    status: 'completed',
    options: { format: 'png', quality: 0.8, resize: { preserveAspectRatio: true }, backgroundColor: '#ffffff' },
    createdAt: 1,
    completedAt: 2,
    outputBlob: blob,
    outputFormat: 'png',
    outputSize: blob.size,
    width: 2,
    height: 2,
  };
}

describe('createResultsArchive', () => {
  it('creates a real ZIP containing completed results with unique filenames', async () => {
    const archiveBlob = await createResultsArchive([
      record('1', 'same.png', 'first'),
      record('2', 'same.png', 'second'),
      { ...record('3', 'failed.png', 'ignored'), status: 'failed', outputBlob: undefined },
    ]);
    const archive = await JSZip.loadAsync(archiveBlob);
    const files = Object.keys(archive.files).filter((name) => !archive.files[name]?.dir);

    expect(files.sort()).toEqual(['same-2.png', 'same.png']);
    await expect(archive.file('same.png')!.async('string')).resolves.toBe('first');
    await expect(archive.file('same-2.png')!.async('string')).resolves.toBe('second');
  });

  it('returns an actionable error when there are no successful outputs', async () => {
    await expect(createResultsArchive([])).rejects.toThrow('There are no completed image results');
  });

  it('rejects results above the 500 MB limit before generating the archive', async () => {
    const oversized = record('large', 'large.png', 'content');
    Object.defineProperty(oversized.outputBlob, 'size', { value: 500 * 1024 * 1024 + 1 });

    await expect(createResultsArchive([oversized])).rejects.toThrow('500 MB ZIP export limit');
  });
});
