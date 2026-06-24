import * as React from 'react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Semantic Icon name. */
  icon?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** The single action that fills the surface (e.g. a Button). */
  action?: React.ReactNode;
  /** Tighter padding for use inside a card/panel. */
  inset?: boolean;
}

/** EmptyState — calm pre-content state: icon, title, one line, one action. */
export function EmptyState(props: EmptyStateProps): React.ReactElement;
