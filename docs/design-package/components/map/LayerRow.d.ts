import * as React from 'react';
import { LayerType } from './LayerTypeBadge';

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  /** 0–100. Independent of visibility (AP-6). */
  opacity?: number;
  /** Whether the layer renders on the DM's own view. Independent of player visibility. */
  dmDisplay?: boolean;
  visibility?: 'dm-only' | 'players' | 'shared';
  locked?: boolean;
}

/**
 * LayerRow — canonical layer-panel row. Three independent controls (DM display, visibility,
 * opacity) plus lock, inline rename, and actions. `readOnly` = the player/observer actor view.
 */
export interface LayerRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  layer: Layer;
  /** Actor-filtered player/observer view: strips all authoring controls. */
  readOnly?: boolean;
  /** Filter non-match: fades the row to 40%. */
  dimmed?: boolean;
  selected?: boolean;
  onToggleDisplay?: () => void;
  onCycleVisibility?: (next: 'dm-only' | 'players' | 'shared') => void;
  onOpacityChange?: (value: number) => void;
  onToggleLock?: () => void;
  onRename?: (name: string) => void;
  onAction?: (action: string) => void;
  /** Keyboard reorder: −1 (up) / +1 (down), via Alt+Arrow. */
  onMove?: (delta: number) => void;
}

export function LayerRow(props: LayerRowProps): React.ReactElement;
