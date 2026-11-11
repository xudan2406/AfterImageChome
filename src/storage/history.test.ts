import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearHistoryRecords,
  deleteHistoryRecord,
  getHistoryRecord,
  listHistorySummaries,
  saveHistoryRecord,
  type HistoryRecord,
} from './history';

function makeRecord(id: string, completedAt: number): HistoryRecord {
  return {
    id,
    filename: `${id}.png`,
    sourceSize: 10,
    operation: 'convert',
    status: 'completed',
    options: { format: 'png', quality: 0.8, resize: { preserveAspectRatio: true }, backgroundColor: '#ffffff' },
    createdAt: completedAt - 1,
    completedAt,
    outputBlob: new Blob([id], { type: 'image/png' }),
    outputFormat: 'png',
    outputSize: id.length,
    width: 1,
    height: 1,
  };
}

describe('processing history', () => {
  beforeEach(async () => {
    await clearHistoryRecords();
  });

  it('persists output Blobs and lists most recent results first', async () => {
    await saveHistoryRecord(makeRecord('older', 1));
    await saveHistoryRecord(makeRecord('newer', 2));

    const summaries = await listHistorySummaries();
    expect(summaries.map(({ id }) => id)).toEqual(['newer', 'older']);
    expect(summaries[0]).toMatchObject({ id: 'newer', hasOutput: true, operation: 'convert' });
    expect(summaries[0]).not.toHaveProperty('outputBlob');
    const newest = await getHistoryRecord('newer');
    await expect(newest?.outputBlob?.text()).resolves.toBe('newer');
  });

  it('deletes one record and can clear all remaining records', async () => {
    await saveHistoryRecord(makeRecord('one', 1));
    await saveHistoryRecord(makeRecord('two', 2));
    await deleteHistoryRecord('one');
    expect((await listHistorySummaries()).map(({ id }) => id)).toEqual(['two']);

    await clearHistoryRecords();
    await expect(listHistorySummaries()).resolves.toEqual([]);
  });

  it('retains only the 100 newest records', async () => {
    for (let index = 0; index < 101; index += 1) {
      await saveHistoryRecord(makeRecord(`record-${index}`, index));
    }

    const records = await listHistorySummaries();
    expect(records).toHaveLength(100);
    expect(records.at(-1)?.id).toBe('record-1');
  });
});
