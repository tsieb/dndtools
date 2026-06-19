import * as React from 'react';

/**
 * Slider — the range-input primitive for brush size, opacity, and generation parameters.
 * A gold fill marks progress; optional −/+ steppers are the non-drag (WCAG 2.5.7) alternative.
 */
export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  onChange?: (value: number) => void;
  /** Label shown above the track, left-aligned. */
  label?: string;
  /** Human-readable value readout (e.g. "2 ft", "75%"). Defaults to the raw value. */
  valueLabel?: React.ReactNode;
  /** Render −/+ step buttons flanking the track (touch / keyboard-free alternative). */
  steppers?: boolean;
  /** Discrete labelled stops (e.g. ["Small","Medium","Large","Huge"]) instead of a % track. */
  stops?: string[];
  disabled?: boolean;
}

export function Slider(props: SliderProps): React.ReactElement;
