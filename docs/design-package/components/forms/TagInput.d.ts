import * as React from 'react';

export interface TagInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: string[];
  onChange?: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
  inputStyle?: React.CSSProperties;
  chipStyle?: React.CSSProperties;
}

export function TagInput(props: TagInputProps): React.ReactElement;
