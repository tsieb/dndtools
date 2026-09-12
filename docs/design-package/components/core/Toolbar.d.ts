import * as React from 'react';

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  ariaLabel?: string;
  dense?: boolean;
  gap?: React.CSSProperties['gap'];
}

/** Toolbar — horizontal command row wrapper. */
export function Toolbar(props: ToolbarProps): React.ReactElement;
