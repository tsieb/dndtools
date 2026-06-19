import * as React from 'react';

export interface BreadcrumbItem {
  id?: string;
  label?: React.ReactNode;
  /** Hidden-from-actor child: renders a generic "Unavailable" crumb, never the real name. */
  unavailable?: boolean;
}

/**
 * Breadcrumb — nested-map wayfinding bar. Current level is gold + aria-current; ancestors are
 * one-click links. Hidden children render as a generic placeholder (no name leak).
 */
export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  onNavigate?: (item: BreadcrumbItem, index: number) => void;
  ariaLabel?: string;
  /** Collapse to first + … + last N crumbs when the chain exceeds this length. */
  maxVisible?: number;
}

export function Breadcrumb(props: BreadcrumbProps): React.ReactElement;
