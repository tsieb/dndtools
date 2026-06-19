import * as React from 'react';

/**
 * POIMarker — the anchored map pin for a POI. Category drives color/glyph; DM-only markers carry
 * the safety-purple ring. ≥44px hit area for touch.
 */
export interface POIMarkerProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  category?: 'location' | 'quest' | 'danger' | 'npc' | 'treasure' | 'note';
  label?: string;
  dmOnly?: boolean;
  active?: boolean;
  size?: number;
  onClick?: () => void;
}

export function POIMarker(props: POIMarkerProps): React.ReactElement;
