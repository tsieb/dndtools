import * as React from 'react';

export type LayerType =
  | 'base' | 'height' | 'political' | 'climate' | 'roads' | 'water' | 'wshed'
  | 'fog' | 'poi' | 'dm' | 'player' | 'combat' | 'custom';

export declare const LAYER_TYPES: Record<LayerType, { label: string; token: string; icon: string; hatch?: boolean }>;

/**
 * LayerTypeBadge — the at-a-glance map-layer type chip. 13 types, each a distinct warm-harmonised
 * hue + icon + label. The DM type adds a grayscale-safe hatch.
 */
export interface LayerTypeBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  type?: LayerType;
  /** Override the default short label (e.g. a custom tag name). */
  label?: string;
  showIcon?: boolean;
  /** Icon-only, no text. */
  compact?: boolean;
}

export function LayerTypeBadge(props: LayerTypeBadgeProps): React.ReactElement;
