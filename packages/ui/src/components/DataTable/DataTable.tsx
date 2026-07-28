'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../Table/Table';
import { Icon } from '../Icon/Icon';
import { EmptyState } from '../EmptyState/EmptyState';
import styles from './DataTable.module.css';

export type SortDirection = 'asc' | 'desc';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  /** Cell content. Defaults to String(row[key]) when omitted. */
  render?: (row: T) => ReactNode;
  /** Value compared when sorting by this column. Defaults to row[key].
   * Required if `key` isn't a property on T (a computed/joined column). */
  sortValue?: (row: T) => string | number;
  align?: 'start' | 'end';
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  /** Initial sort — uncontrolled after mount, like Table itself has no
   * externally-controlled state. */
  defaultSortKey?: string;
  defaultSortDirection?: SortDirection;
  emptyMessage?: string;
  className?: string;
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * DataTable — sortable table built on Table's own primitives (no
 * virtualization or filtering — those stay out of scope, matching Table's
 * own "not a data grid" boundary). Column-driven: pass `columns` + `data`
 * rather than composing `<TableRow>`/`<TableCell>` by hand.
 *
 * Sort state is internal (uncontrolled) and click-cycles
 * ascending → descending → unsorted for a sortable column, mirroring the
 * "toggle → toggle → clear" pattern most sortable tables use rather than
 * being permanently stuck in whichever direction was clicked last.
 */
export function DataTable<T>({
  columns,
  data,
  getRowKey,
  defaultSortKey,
  defaultSortDirection = 'asc',
  emptyMessage = 'No results.',
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  const sortColumn = columns.find((c) => c.key === sortKey);

  const sortedData = useMemo(() => {
    if (!sortColumn) return data;
    const getValue =
      sortColumn.sortValue ??
      ((row: T) => (row as Record<string, unknown>)[sortColumn.key] as string | number);
    const sorted = [...data].sort((a, b) => compareValues(getValue(a), getValue(b)));
    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [data, sortColumn, sortDirection]);

  function handleSort(column: DataTableColumn<T>) {
    if (!column.sortable) return;
    if (sortKey !== column.key) {
      setSortKey(column.key);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else {
      setSortKey(undefined);
      setSortDirection('asc');
    }
  }

  if (data.length === 0) {
    return <EmptyState heading={emptyMessage} />;
  }

  return (
    <Table className={className}>
      <TableHead>
        <TableRow>
          {columns.map((column) => {
            const isSorted = sortKey === column.key;
            const ariaSort = !column.sortable
              ? undefined
              : isSorted
                ? sortDirection === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none';
            return (
              <TableHeaderCell
                key={column.key}
                aria-sort={ariaSort}
                style={column.align === 'end' ? { textAlign: 'end' } : undefined}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    className={styles.sortButton}
                    onClick={() => handleSort(column)}
                  >
                    {column.header}
                    <span className={styles.sortIcon}>
                      {isSorted && (
                        <Icon
                          name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'}
                          size="sm"
                          aria-hidden
                        />
                      )}
                    </span>
                  </button>
                ) : (
                  column.header
                )}
              </TableHeaderCell>
            );
          })}
        </TableRow>
      </TableHead>
      <TableBody>
        {sortedData.map((row) => (
          <TableRow key={getRowKey(row)}>
            {columns.map((column) => (
              <TableCell
                key={column.key}
                style={column.align === 'end' ? { textAlign: 'end' } : undefined}
              >
                {column.render
                  ? column.render(row)
                  : String((row as Record<string, unknown>)[column.key] ?? '')}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
