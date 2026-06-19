import * as React from 'react';

/**
 * Input — crafted single-line field replacing the native control.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Leading icon (semantic Icon name), e.g. "search". */
  icon?: string;
}
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Input(props: InputProps): React.ReactElement;
/** Textarea — crafted multi-line field. */
export function Textarea(props: TextareaProps): React.ReactElement;
