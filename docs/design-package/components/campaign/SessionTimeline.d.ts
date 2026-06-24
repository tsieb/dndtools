import * as React from 'react';

export interface TimelineEntry {
  time?: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  /** Semantic Icon name for the node. */
  icon?: string;
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info';
  /** Emphasize this node (most recent beat). */
  active?: boolean;
}

export interface SessionTimelineProps extends React.HTMLAttributes<HTMLOListElement> {
  entries: TimelineEntry[];
}

/** SessionTimeline — vertical session log / recap rail; node per beat with timestamp + detail. */
export function SessionTimeline(props: SessionTimelineProps): React.ReactElement;
