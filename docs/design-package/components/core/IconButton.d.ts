import * as React from 'react';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Semantic Icon name. */
  icon: string;
  /** Required accessible name (also the tooltip). */
  label: string;
  variant?: 'ghost' | 'outline' | 'accent';
  size?: 'sm' | 'md' | 'lg';
}

/** IconButton — square icon-only control with a required accessible name. */
export function IconButton(props: IconButtonProps): React.ReactElement;
