import * as React from 'react';

/**
 * Badge — status pill encoding state with color + a redundant icon shape.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** State/severity role. Each carries a redundant icon shape (never color alone). */
  status?: 'success' | 'warning' | 'error' | 'info' | 'accent' | 'neutral';
  /** Override the automatic status icon (semantic name), or null to hide it. */
  icon?: string | null;
  children?: React.ReactNode;
}

export function Badge(props: BadgeProps): React.ReactElement;
