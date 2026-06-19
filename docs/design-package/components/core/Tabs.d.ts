import * as React from 'react';

export type TabItem = string | { id: string; label: string; icon?: string };

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs: TabItem[];
  /** Active tab id. */
  value: string;
  onChange?: (id: string) => void;
}

/** Tabs — segmented in-surface navigation; gold underline marks the active tab. */
export function Tabs(props: TabsProps): React.ReactElement;
