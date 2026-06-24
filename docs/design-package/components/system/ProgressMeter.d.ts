import * as React from 'react';

export interface ProgressMarker {
  at: number;
  label?: string;
}

export interface ProgressMeterProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  label?: React.ReactNode;
  /** Override the right-side readout (defaults to a percentage). */
  valueLabel?: React.ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  /** Threshold ticks, e.g. difficulty bands. */
  markers?: ProgressMarker[];
  indeterminate?: boolean;
}

/** ProgressMeter — labeled determinate meter for non-combat quantities (XP budget, sync, prep). */
export function ProgressMeter(props: ProgressMeterProps): React.ReactElement;
