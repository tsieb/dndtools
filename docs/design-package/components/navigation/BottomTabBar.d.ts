import * as React from 'react';
import { NavEntry } from './NavSidebar';

export interface BottomTabBarProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onSelect'> {
  items?: NavEntry[];
  active?: string;
  onSelect?: (key: string) => void;
}

/** BottomTabBar — mobile icon-over-label tabs (≥44px targets); same IA as NavSidebar. */
export function BottomTabBar(props: BottomTabBarProps): React.ReactElement;
