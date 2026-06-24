import * as React from 'react';

/**
 * Sheet — edge-anchored overlay (the touch-first sibling of Dialog). `bottom` is the mobile
 * default (grab-handle slab); `right`/`left` are tablet/desktop drawers for secondary flows. Same
 * contract as Dialog: role=dialog, aria-modal, focus-trapped, Escape/backdrop dismiss, scroll lock,
 * focus restore. Exposed-edge corners use `--radius-xl`.
 */
export interface SheetProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  open?: boolean;
  onClose?: () => void;
  side?: 'bottom' | 'right' | 'left';
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Bottom: max height (CSS length, default 88vh). Side: width in px (default 440). */
  size?: number | string;
  /** When false, Escape, backdrop click, and the close button are suppressed. */
  dismissible?: boolean;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

export function Sheet(props: SheetProps): React.ReactElement | null;
