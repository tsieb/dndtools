import * as React from 'react';

/**
 * VisibilityChip — DM-only vs player-visible signal; distinct icon+label+color per level, reads in grayscale.
 */
export interface VisibilityChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The safety-critical visibility level. */
  level?: 'dm-only' | 'players' | 'hidden' | 'mixed';
  /** Icon-only (label hidden, kept as title/aria). */
  compact?: boolean;
}

export function VisibilityChip(props: VisibilityChipProps): React.ReactElement;
