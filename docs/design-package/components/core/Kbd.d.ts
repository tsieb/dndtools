import * as React from 'react';

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  tone?: 'neutral' | 'accent';
}

/** Kbd — keyboard key token. */
export function Kbd(props: KbdProps): React.ReactElement;
