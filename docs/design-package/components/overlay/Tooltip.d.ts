import * as React from 'react';

/**
 * Tooltip — small label-on-hover/focus that names an icon-only control or adds a terse hint. Opens
 * on hover AND keyboard focus, closes on leave/blur/Escape, with a short delay-in. NEVER the sole
 * home of information and never holds interactive content. Wrap a single focusable child.
 */
export interface TooltipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The hint text. Keep it terse; omit to render the child bare. */
  label?: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Hover delay before showing, ms. Default 250. */
  delay?: number;
  children: React.ReactNode;
}

export function Tooltip(props: TooltipProps): React.ReactElement;
