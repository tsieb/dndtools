import * as React from 'react';

export type SpellSchool =
  | 'abjuration' | 'conjuration' | 'divination' | 'enchantment'
  | 'evocation' | 'illusion' | 'necromancy' | 'transmutation';

export interface SpellCardProps extends React.HTMLAttributes<HTMLElement> {
  name: React.ReactNode;
  /** 0 = cantrip. */
  level?: number;
  school?: SpellSchool | string;
  castingTime?: React.ReactNode;
  range?: React.ReactNode;
  components?: React.ReactNode;
  duration?: React.ReactNode;
  description?: React.ReactNode;
  /** "At higher levels" upcast note. */
  higherLevels?: React.ReactNode;
  concentration?: boolean;
  ritual?: boolean;
}

/** SpellCard — single-spell reference: name, level/school, meta grid, description, upcast note. */
export function SpellCard(props: SpellCardProps): React.ReactElement;
