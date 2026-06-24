import * as React from 'react';

export type ConditionTone = 'danger' | 'warning' | 'good' | 'info' | 'neutral';

export interface ConditionDef {
  label: string;
  icon: string;
  tone: ConditionTone;
}

/** The 5e condition catalog keyed by canonical name. */
export const CONDITIONS: Record<string, ConditionDef>;

export interface ConditionBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Known condition key (auto label/icon/tone), e.g. "poisoned". */
  condition?: keyof typeof CONDITIONS | string;
  /** Custom label when not using a known key. */
  label?: React.ReactNode;
  tone?: ConditionTone;
  /** Override the icon (semantic Icon name). */
  icon?: string;
  /** Rounds remaining — shows a mono countdown. */
  duration?: number;
  /** Stack level (e.g. exhaustion 1–6). */
  level?: number;
  /** Icon-only pill (label moves to aria-label). */
  compact?: boolean;
  onRemove?: () => void;
}

/** ConditionBadge — status-effect pill (color + distinct icon + label); reads in grayscale. */
export function ConditionBadge(props: ConditionBadgeProps): React.ReactElement;

export interface ConditionEntry {
  key: string;
  duration?: number;
  level?: number;
}

export interface ConditionTrackerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Active conditions — bare keys or `{ key, duration, level }`. */
  entries?: Array<string | ConditionEntry>;
  onRemove?: (key: string, index: number) => void;
  onAdd?: () => void;
  compact?: boolean;
  /** Show the dashed "+ Condition" affordance. Default true. */
  addable?: boolean;
}

/** ConditionTracker — a combatant's active conditions with add/remove affordances. */
export function ConditionTracker(props: ConditionTrackerProps): React.ReactElement;
