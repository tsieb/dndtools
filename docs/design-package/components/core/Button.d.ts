import * as React from 'react';

/**
 * Button — crafted action control. One primary (gold) per region; secondary/ghost recede.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. primary = the single gold action per region. Default "secondary". */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Leading icon (semantic Icon name). */
  icon?: string;
  /** Trailing icon (semantic Icon name). */
  iconRight?: string;
  children?: React.ReactNode;
}

export function Button(props: ButtonProps): React.ReactElement;
