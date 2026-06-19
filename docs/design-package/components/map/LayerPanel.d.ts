import * as React from 'react';
import { Layer } from './LayerRow';

/**
 * LayerPanel — the layer-system sidebar: tag filter bar, render-ordered rows, add-layer action.
 * Manages reorder/visibility/opacity/lock internally and mirrors changes through onChange.
 */
export interface LayerPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  layers: Layer[];
  /** Actor-filtered player/observer view: no authoring controls, label-only rows. */
  readOnly?: boolean;
  onChange?: (layers: Layer[]) => void;
  onAddLayer?: () => void;
  title?: string;
}

export function LayerPanel(props: LayerPanelProps): React.ReactElement;
