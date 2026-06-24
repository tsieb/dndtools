import * as React from 'react';

export interface NavEntry {
  key: string;
  icon: string;
  label: React.ReactNode;
  badge?: React.ReactNode;
}

export interface NavSidebarProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onSelect'> {
  items?: NavEntry[];
  /** Active item key. */
  active?: string;
  onSelect?: (key: string) => void;
  /** Brand/header slot at top. */
  header?: React.ReactNode;
  /** Footer slot (settings, account). */
  footer?: React.ReactNode;
  width?: number;
}

/** NavSidebar — desktop labeled vertical nav for the seven-section IA. */
export function NavSidebar(props: NavSidebarProps): React.ReactElement;
