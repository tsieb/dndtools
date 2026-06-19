import * as React from 'react';

/**
 * Card — panel/widget container; elevation & tone encode importance (squint test).
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Surface tone + shadow. Use "raised" for the one primary region, "flat"/"sunken" for supporting tiles. */
  elevation?: 'sunken' | 'flat' | 'raised' | 'overlay';
  /** Gold accent border + lift — the single primary panel per surface. */
  accent?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Hover affordance for clickable cards (map rows, note rows). */
  interactive?: boolean;
  children?: React.ReactNode;
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode;
  /** Uppercase tracked eyebrow style (widget header). Set false for a plain title. Default true. */
  eyebrow?: boolean;
  actions?: React.ReactNode;
}

export function Card(props: CardProps): React.ReactElement;
/** CardHeader — widget header with eyebrow title + actions. */
export function CardHeader(props: CardHeaderProps): React.ReactElement;
