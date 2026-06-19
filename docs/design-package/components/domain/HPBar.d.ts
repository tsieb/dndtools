import * as React from 'react';

/**
 * HPBar — hit-point meter; fill crosses healthy/bloodied/critical thresholds, reinforced by the number.
 */
export interface HPBarProps extends React.HTMLAttributes<HTMLDivElement> {
  current: number;
  max: number;
  /** Optional name shown left of the value. */
  label?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Show the "current/max" mono readout. Default true. */
  showText?: boolean;
}

export function HPBar(props: HPBarProps): React.ReactElement;
