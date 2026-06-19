import * as React from 'react';

export type SelectOption = string | { value: string; label: string };

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  invalid?: boolean;
}

/** Select — crafted dropdown replacing the native control (real chevron, token styling). */
export function Select(props: SelectProps): React.ReactElement;
