import * as React from 'react';
import { NavEntry } from './NavSidebar';

export interface NavRailProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onSelect'> {
  items?: NavEntry[];
  active?: string;
  onSelect?: (key: string) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

/** NavRail — tablet icon-only nav column; same IA as NavSidebar. */
export function NavRail(props: NavRailProps): React.ReactElement;
