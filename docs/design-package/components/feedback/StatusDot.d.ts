import * as React from 'react';

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: 'live' | 'idle' | 'warning' | 'error' | 'syncing';
  /** Animated pulse ring (e.g. session live). */
  pulse?: boolean;
  /** Adjacent text label — always provide one for meaning. */
  label?: React.ReactNode;
}

/** StatusDot — tiny live-state dot; pair with a text label. */
export function StatusDot(props: StatusDotProps): React.ReactElement;
