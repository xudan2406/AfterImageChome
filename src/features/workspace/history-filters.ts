import type { HistorySummary } from '../../storage/history';

export type HistoryOperationFilter = 'all' | 'unknown' | NonNullable<HistorySummary['operation']>;
export type HistoryStatusFilter = 'all' | HistorySummary['status'];
export type HistorySortOrder = 'newest' | 'oldest';

export type HistoryFilters = {
  query: string;
  operation: HistoryOperationFilter;
  status: HistoryStatusFilter;
  sort: HistorySortOrder;
};

export function filterHistorySummaries(
  records: HistorySummary[],
  filters: HistoryFilters,
): HistorySummary[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return records
    .filter((record) => {
      const matchesQuery = !query || record.filename.toLocaleLowerCase().includes(query);
      const matchesOperation = filters.operation === 'all'
        || (filters.operation === 'unknown'
          ? !record.operation
          : record.operation === filters.operation);
      const matchesStatus = filters.status === 'all' || record.status === filters.status;
      return matchesQuery && matchesOperation && matchesStatus;
    })
    .sort((left, right) => {
      const timeDifference = left.completedAt - right.completedAt;
      const tieBreak = left.id.localeCompare(right.id);
      return filters.sort === 'newest'
        ? -timeDifference || tieBreak
        : timeDifference || tieBreak;
    });
}
