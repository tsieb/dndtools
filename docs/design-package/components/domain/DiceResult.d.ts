import * as React from 'react';

export interface DiceResultProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Dice notation, e.g. "1d20+5". */
  notation?: string;
  total: number;
  /** Individual die results. */
  rolls?: number[];
  modifier?: number;
  /** Natural 20 / natural 1 coloring. */
  crit?: 'success' | 'fail';
}

/** DiceResult — die-roll readout: big mono total + breakdown; spring easing on reveal. */
export function DiceResult(props: DiceResultProps): React.ReactElement;
