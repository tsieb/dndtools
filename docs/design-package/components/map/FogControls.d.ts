import * as React from 'react';

/**
 * FogControls — the contextual fog-of-war options strip (reveal/conceal, shape, brush size,
 * feather, presets, sync status). Drives the DM authoring side of fog.
 */
export interface FogControlsProps extends React.HTMLAttributes<HTMLDivElement> {
  mode?: 'reveal' | 'conceal';
  onModeChange?: (mode: 'reveal' | 'conceal') => void;
  shape?: 'brush' | 'rect' | 'polygon';
  onShapeChange?: (shape: 'brush' | 'rect' | 'polygon') => void;
  /** Brush size in map-space units. */
  brushSize?: number;
  onBrushSize?: (size: number) => void;
  unit?: string;
  feather?: boolean;
  onFeather?: (on: boolean) => void;
  syncStatus?: 'synced' | 'syncing' | 'queued';
  onRevealAll?: () => void;
  onResetFog?: () => void;
}

export function FogControls(props: FogControlsProps): React.ReactElement;
