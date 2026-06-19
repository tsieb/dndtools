import * as React from 'react';

export interface InitiativeRowProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  initiative: number;
  current: number;
  max: number;
  conditions?: string[];
  /** Current turn — emphasized with gold rail + raised tone. */
  active?: boolean;
  /** Hidden/DM-only combatant — shows the visibility cue. */
  dmOnly?: boolean;
  onHpUp?: () => void;
  onHpDown?: () => void;
}

/** InitiativeRow — one combatant in the initiative tracker; active row wins the squint test. */
export function InitiativeRow(props: InitiativeRowProps): React.ReactElement;
