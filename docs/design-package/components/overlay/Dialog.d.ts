import * as React from 'react';

/**
 * Dialog — modal chrome (scrim + one centered panel) for confirms and short forms. role=dialog,
 * aria-modal, focus-trapped, Escape/backdrop dismiss (off for destructive confirms), body-scroll
 * lock, focus restored on close. This is the chrome the system delegates to ("drop it inside a
 * Dialog"); supply the body. `tone="danger"` marks destructive confirms (icon shape carries
 * severity without colour).
 */
export interface DialogProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  open?: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  /** One-line supporting text under the title; wired to aria-describedby. */
  description?: React.ReactNode;
  /** Header mark + primary affordance accent for confirms. Each tone has a distinct icon shape. */
  tone?: 'default' | 'danger' | 'warning' | 'success' | 'info';
  /** Override the header icon (semantic Icon name). Defaults to the tone's status shape. */
  icon?: string;
  /** Panel width: sm 400 · md 540 · lg 760. */
  size?: 'sm' | 'md' | 'lg';
  /** When false, Escape, backdrop click, and the close button are all suppressed (forced choice). */
  dismissible?: boolean;
  /** Right-aligned action row (typically Cancel + a primary/danger Button). */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

export function Dialog(props: DialogProps): React.ReactElement | null;
