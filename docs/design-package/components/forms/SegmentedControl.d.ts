import * as React from 'react';

export interface SegmentedOption {
  value: string;
  label?: React.ReactNode;
  disabled?: boolean;
}

/**
 * SegmentedControl — compact single-select for 2–4 short, mutually-exclusive options.
 */
export interface SegmentedControlProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: (string | SegmentedOption)[];
  value?: string;
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  ariaLabel?: string;
}

export function SegmentedControl(props: SegmentedControlProps): React.ReactElement;
