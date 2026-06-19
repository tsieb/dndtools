import * as React from 'react';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  icon?: string;
  tone?: 'neutral' | 'accent' | 'danger' | 'info';
  selected?: boolean;
  /** Render a remove (×) affordance and call this when clicked. */
  onRemove?: () => void;
  children?: React.ReactNode;
}

/** Chip — compact token for conditions, tags, filters; optionally removable. */
export function Chip(props: ChipProps): React.ReactElement;
