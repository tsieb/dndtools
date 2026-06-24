import * as React from 'react';

export interface Feature {
  name: React.ReactNode;
  text: React.ReactNode;
}

export interface StatBlockProps extends React.HTMLAttributes<HTMLElement> {
  /** Creature name — set in the Cinzel display serif. */
  name: React.ReactNode;
  /** Italic type line, e.g. "Medium humanoid (human), lawful evil". */
  meta?: React.ReactNode;
  ac?: React.ReactNode;
  /** Parenthetical after AC, e.g. "(natural armor)". */
  acNote?: React.ReactNode;
  hp?: React.ReactNode;
  /** Parenthetical HP dice, e.g. "(8d8 + 16)". */
  hpFormula?: React.ReactNode;
  speed?: React.ReactNode;
  /** Raw ability scores. */
  abilities?: { str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number };
  saves?: React.ReactNode;
  skills?: React.ReactNode;
  resistances?: React.ReactNode;
  immunities?: React.ReactNode;
  conditionImmunities?: React.ReactNode;
  senses?: React.ReactNode;
  languages?: React.ReactNode;
  /** Challenge rating, e.g. "5". Renders the corner CR badge and the Challenge line (with `xp`). */
  cr?: React.ReactNode;
  xp?: React.ReactNode;
  proficiency?: React.ReactNode;
  traits?: Feature[];
  actions?: Feature[];
  bonusActions?: Feature[];
  reactions?: Feature[];
  legendaryActions?: Feature[];
  legendaryIntro?: React.ReactNode;
  /** Overlay an editable combat HP track on the block — same creature, mid-fight. */
  live?: { current: number; max?: number };
  /** Flag a hidden NPC with the purple DM-only visibility cue. */
  dmOnly?: boolean;
}

/** StatBlock — the iconic creature/NPC reference card for encounter-building and combat lookups. */
export function StatBlock(props: StatBlockProps): React.ReactElement;
