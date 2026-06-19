import * as React from 'react';

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** Checkbox — token-styled check with a gold fill when on. */
export function Checkbox(props: CheckboxProps): React.ReactElement;
