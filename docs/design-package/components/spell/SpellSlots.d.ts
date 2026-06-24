import * as React from 'react';

export interface SpellSlotLevel {
  /** Spell level (0 = cantrip — usually omit since cantrips have no slots). */
  level: number;
  /** Total slots at this level. */
  total: number;
  /** Slots already expended. */
  used?: number;
}

export interface SpellSlotsProps extends React.HTMLAttributes<HTMLDivElement> {
  levels?: SpellSlotLevel[];
  /** (level, pipIndex, wasFilled) — toggle a slot spent/recovered. */
  onToggle?: (level: number, index: number, wasFilled: boolean) => void;
  readOnly?: boolean;
}

/** SpellSlots — per-level diamond-pip slot tracker; click to spend/recover. */
export function SpellSlots(props: SpellSlotsProps): React.ReactElement;
