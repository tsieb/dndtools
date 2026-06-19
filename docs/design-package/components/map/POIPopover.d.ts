import * as React from 'react';

export interface POI {
  id?: string;
  name?: string;
  category?: 'location' | 'quest' | 'danger' | 'npc' | 'treasure' | 'note';
  categoryLabel?: string;
  linkedNote?: string;
  visibility?: 'dm-only' | 'players' | 'shared';
}

/**
 * POIPopover — point-of-interest detail panel on the leak-safe Popover. POI visibility is its own
 * axis (independent of the layer). Authoring controls are DM-only; `readOnly` = player view.
 */
export interface POIPopoverProps {
  poi: POI;
  anchor?: { x: number; y: number };
  readOnly?: boolean;
  onClose?: () => void;
  onVisibilityChange?: (v: 'dm-only' | 'players' | 'shared') => void;
  onFocus?: () => void;
  onEdit?: () => void;
  onDeepLink?: () => void;
  onDelete?: () => void;
  onOpenNote?: () => void;
}

export function POIPopover(props: POIPopoverProps): React.ReactElement;
