import * as React from 'react';

/** The signed ability modifier string for a raw score, e.g. 16 → "+3". */
export function abilityModifier(score: number): string;

export interface AbilityScoreProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Ability abbreviation, e.g. "STR". */
  label: React.ReactNode;
  /** Raw ability score, e.g. 16. */
  score: number;
  /** Override the derived modifier (otherwise computed from `score`). */
  modifier?: string;
  /** `accent` highlights a relevant save/check in gold. */
  tone?: 'default' | 'accent';
  size?: 'sm' | 'md' | 'lg';
}

/** AbilityScore — one ability cell (label · mono score · modifier pill); shared by statblocks and sheets. */
export function AbilityScore(props: AbilityScoreProps): React.ReactElement;
