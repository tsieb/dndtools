import * as React from 'react';

/**
 * Minimap — spatial-context overlay showing the viewport rectangle within the full map extent.
 * Click to jump; collapses to a globe button.
 */
export interface MinimapProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Normalized 0–1 viewport rectangle. */
  viewport?: { x: number; y: number; w: number; h: number };
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  /** Receives a normalized {x,y} center to jump to. */
  onJump?: (center: { x: number; y: number }) => void;
  /** Optional base-layer thumbnail URL. */
  thumb?: string;
  width?: number;
  aspect?: number;
}

export function Minimap(props: MinimapProps): React.ReactElement;
