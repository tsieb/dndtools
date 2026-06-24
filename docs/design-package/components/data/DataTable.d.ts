import * as React from 'react';

export interface DataColumn {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  /** Mono font for tabular numerics. */
  mono?: boolean;
  /** Emphasize (primary color, semibold) — usually the name column. */
  strong?: boolean;
  /** Allow wrapping (default nowrap). */
  wrap?: boolean;
  width?: number | string;
  sortable?: boolean;
  /** Custom cell renderer: (value, row, index) => node. */
  render?: (value: any, row: any, index: number) => React.ReactNode;
}

export interface DataTableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  columns: DataColumn[];
  rows: any[];
  rowKey?: (row: any, index: number) => React.Key;
  sort?: { key: string; dir: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  zebra?: boolean;
  dense?: boolean;
  empty?: React.ReactNode;
}

/** DataTable — tabular primitive: tracked headers, mono numerics, zebra rows, sortable, gold hover. */
export function DataTable(props: DataTableProps): React.ReactElement;
