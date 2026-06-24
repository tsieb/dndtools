import * as React from 'react';

export interface QuestObjective {
  label: React.ReactNode;
  done?: boolean;
}

export interface QuestCardProps extends React.HTMLAttributes<HTMLElement> {
  title: React.ReactNode;
  status?: 'active' | 'completed' | 'failed' | 'onhold';
  /** Italic hook / flavor line. */
  hook?: React.ReactNode;
  objectives?: QuestObjective[];
  reward?: React.ReactNode;
  dmOnly?: boolean;
  /** (index) — toggle an objective done. Omit for a read-only card. */
  onToggleObjective?: (index: number) => void;
}

/** QuestCard — a quest in the Campaign log: status header, hook, objective checklist, reward. */
export function QuestCard(props: QuestCardProps): React.ReactElement;
