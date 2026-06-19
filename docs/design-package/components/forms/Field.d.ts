import * as React from 'react';

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  /** Help text below the control. */
  help?: React.ReactNode;
  /** Error message — replaces help and turns the message red. */
  error?: React.ReactNode;
  children?: React.ReactNode;
}

/** Field — label/help/error wrapper for any form control. */
export function Field(props: FieldProps): React.ReactElement;
