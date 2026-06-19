import * as React from 'react';

export interface StatPillProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'error';
  /** Render the value in the mono face (default true) — for numerals. */
  mono?: boolean;
  align?: 'left' | 'center';
}

/** StatPill — labeled glance-stat: tracked eyebrow over a large mono value. */
export function StatPill(props: StatPillProps): React.ReactElement;
