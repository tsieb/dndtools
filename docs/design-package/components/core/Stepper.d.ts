import * as React from 'react';

/**
 * Stepper — horizontal progress indicator for multi-step flows (e.g. the import wizard).
 */
export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: (string | { label: React.ReactNode })[];
  /** Zero-based index of the active step. Earlier steps render as complete (check). */
  current?: number;
  ariaLabel?: string;
}

export function Stepper(props: StepperProps): React.ReactElement;
