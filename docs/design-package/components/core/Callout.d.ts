import * as React from 'react';

export interface CalloutProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'warning' | 'success' | 'error';
  title?: string;
}

/** Callout — tone-based non-modal info block. */
export function Callout(props: CalloutProps): React.ReactElement;
