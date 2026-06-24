import * as React from 'react';

export interface NavItemProps extends React.HTMLAttributes<HTMLElement> {
  /** Semantic Icon name. */
  icon: string;
  label: React.ReactNode;
  active?: boolean;
  /** Icon-only (rail) mode — label becomes the accessible name + tooltip. */
  collapsed?: boolean;
  /** Count shown as a pill (expanded) or accent dot (collapsed). */
  badge?: React.ReactNode;
  onClick?: () => void;
  as?: 'button' | 'a';
  href?: string;
}

/** NavItem — one global-nav destination; shared by NavSidebar and NavRail. */
export function NavItem(props: NavItemProps): React.ReactElement;
