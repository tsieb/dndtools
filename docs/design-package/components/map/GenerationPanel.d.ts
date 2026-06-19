import * as React from 'react';

/**
 * GenerationPanel — procedural generation UI: ≤8 primary params + seed/dice, advanced disclosure,
 * live preview, determinate phase-labelled progress. Nothing commits until Accept.
 */
export interface GenerationPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–1 determinate progress. null = idle (no bar). <1 = running (preview overlay + disabled Accept). */
  progress?: number | null;
  /** Current phase label, e.g. "Placing settlements…". */
  phase?: string;
  onAccept?: (params: Record<string, unknown>) => void;
  onDiscard?: () => void;
  onRandomizeSeed?: (seed: string) => void;
}

export function GenerationPanel(props: GenerationPanelProps): React.ReactElement;
