import * as React from 'react';

export type IconSize = 'micro' | 'sm' | 'md' | 'lg' | 'xl' | number;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'color'> {
  /** Semantic registry name (e.g. "session-bolt", "dm-only", "success") or a raw Lucide PascalCase name (e.g. "House"). */
  name: string;
  /** Token size keyword or explicit px. Default "md" (24px). */
  size?: IconSize;
  /** Accessible name. Provide for meaningful icons (role=img); omit for decorative (aria-hidden). Icon-only buttons MUST pass this. */
  label?: string;
  /** Override stroke color. Defaults to currentColor. */
  color?: string;
  /** Override stroke width. Defaults to the --icon-stroke-width token (2). */
  strokeWidth?: number;
}

/**
 * Icon — the single Lucide glyph family for DND Tools. 2px stroke, currentColor, token sizes.
 * Requires the global `lucide` UMD on the page.
 */
export function Icon(props: IconProps): React.ReactElement;
