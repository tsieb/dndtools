import * as React from 'react';

/**
 * Popover — floating panel primitive with leak-safe dismissal (outside pointerdown only, never
 * pointerleave — MAP-015 / AP-8). Anchor it with {x,y} or render inline.
 */
export interface PopoverProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  open?: boolean;
  onClose?: () => void;
  /** Page/map coordinates to anchor against. Omit to render inline. */
  anchor?: { x: number; y: number };
  placement?: 'top' | 'bottom' | 'center';
  title?: React.ReactNode;
  /** Leading element in the header (e.g. a category badge). */
  headerAccessory?: React.ReactNode;
  width?: number;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

export function Popover(props: PopoverProps): React.ReactElement | null;
