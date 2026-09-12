import * as React from 'react';

export interface RadioCardProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> {
  value?: string;
  checked?: boolean;
  heading?: React.ReactNode;
  icon?: string;
  onChange?: (value: string | undefined) => void;
}

/** RadioCard — card-shaped radio option for single-select groups. */
export function RadioCard(props: RadioCardProps): React.ReactElement;
