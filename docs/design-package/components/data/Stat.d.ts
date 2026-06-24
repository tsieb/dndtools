import * as React from 'react';

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  /** Semantic Icon name (top-right). */
  icon?: string;
  /** Trend delta — number (auto-signed) or string. */
  delta?: number | string;
  /** Muted context after the delta, e.g. "vs last session". */
  deltaLabel?: React.ReactNode;
  /** When down is the good direction (e.g. errors). */
  invert?: boolean;
  tone?: 'default' | 'accent';
}

/** Stat — dashboard metric tile: label, big mono figure, optional trend delta. */
export function Stat(props: StatProps): React.ReactElement;
