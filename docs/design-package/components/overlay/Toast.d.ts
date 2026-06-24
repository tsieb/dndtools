import * as React from 'react';

export type ToastStatus = 'success' | 'warning' | 'error' | 'info';

export interface ToastOptions {
  id?: number;
  status?: ToastStatus;
  title?: React.ReactNode;
  message?: React.ReactNode;
  /** Auto-dismiss after N ms; 0 to keep until dismissed. Default 4500 (errors 7000). */
  duration?: number;
  /** Inline action label (e.g. "Undo"). */
  action?: string;
  onAction?: () => void;
}

/**
 * Toaster — framework-free toast store. Call from anywhere; mount one <ToastViewport/> to render.
 *   Toaster.success('Saved');
 *   Toaster.error('Lost connection', { action: 'Retry', onAction: reconnect });
 */
export const Toaster: {
  show(input: string | ToastOptions): number;
  success(message: React.ReactNode, opts?: Partial<ToastOptions>): number;
  warning(message: React.ReactNode, opts?: Partial<ToastOptions>): number;
  error(message: React.ReactNode, opts?: Partial<ToastOptions>): number;
  info(message: React.ReactNode, opts?: Partial<ToastOptions>): number;
  dismiss(id: number): void;
  clear(): void;
  subscribe(fn: (items: ToastOptions[]) => void): () => void;
};

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  status?: ToastStatus;
  title?: React.ReactNode;
  message?: React.ReactNode;
  action?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}
/** The presentational toast row (status → distinct icon shape). Use directly for bespoke placements. */
export function Toast(props: ToastProps): React.ReactElement;

export interface ToastViewportProps extends React.HTMLAttributes<HTMLDivElement> {
  placement?: 'top-right' | 'top-center' | 'bottom-right' | 'bottom-center';
}
/** Mount once near the app root; subscribes to Toaster and stacks the toasts. */
export function ToastViewport(props: ToastViewportProps): React.ReactElement;
