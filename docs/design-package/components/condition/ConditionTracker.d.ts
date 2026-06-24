import * as React from 'react';

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
