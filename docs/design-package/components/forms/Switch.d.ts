import * as React from 'react';

export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** Switch — on/off toggle with a gold track when on. */
export function Switch(props: SwitchProps): React.ReactElement;
