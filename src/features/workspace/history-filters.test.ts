import { describe, expect, it } from 'vitest';
import { filterHistorySummaries, type HistoryFilters } from './history-filters';
import type { HistorySummary } from '../../storage/history';

function makeSummary(
  id: string,
  filename: string,
  operation: HistorySummary['operation'],
  status: HistorySummary['status'],
  completedAt: number,
): HistorySummary {
  return {
    id,
    filename,
    operation,
    status,
    sourceSize: 10,
    options: { format: 'png', quality: 0.8, resize: { preserveAspectRatio: true }, backgroundColor: '#ffffff' },
    createdAt: completedAt - 1,
    completedAt,
    hasOutput: false,
    storedOutputBytes: 0,
  };
}

const defaultFilters: HistoryFilters = {
  query: '',
  operation: 'all',
  status: 'all',
  sort: 'newest',
};

describe('history filters', () => {
  const records = [
    makeSummary('a', 'Family Photo.PNG', 'convert', 'completed', 10),
    makeSummary('b', 'family-icon.png', 'batch', 'failed', 20),
    makeSummary('c', 'Poster.jpg', undefined, 'completed', 30),
  ];

  it('searches filenames without case sensitivity and combines filters', () => {
    const filtered = filterHistorySummaries(records, {
      ...defaultFilters,
      query: ' FAMILY ',
      operation: 'convert',
      status: 'completed',
    });

    expect(filtered.map(({ id }) => id)).toEqual(['a']);
  });

  it('can find legacy records without operation metadata', () => {
    const filtered = filterHistorySummaries(records, {
      ...defaultFilters,
      operation: 'unknown',
    });

    expect(filtered.map(({ id }) => id)).toEqual(['c']);
  });

  it('sorts matching records oldest first', () => {
    const filtered = filterHistorySummaries(records, {
      ...defaultFilters,
      sort: 'oldest',
    });

    expect(filtered.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });
});
