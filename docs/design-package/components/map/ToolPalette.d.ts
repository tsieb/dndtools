import * as React from 'react';

export interface MapTool {
  id: string;
  icon: string;
  label: string;
}

export declare const DEFAULT_TOOLS: MapTool[];

/**
 * ToolPalette — the map editor's tool rail (≤8 + overflow) with an undo/redo cluster. One active
 * tool at a time (gold fill). Vertical desktop rail or horizontal mobile strip.
 */
export interface ToolPaletteProps extends React.HTMLAttributes<HTMLDivElement> {
  tools?: MapTool[];
  active?: string;
  onSelect?: (id: string) => void;
  orientation?: 'vertical' | 'horizontal';
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  overflow?: boolean;
}

export function ToolPalette(props: ToolPaletteProps): React.ReactElement;
