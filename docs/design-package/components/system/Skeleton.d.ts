import * as React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'rect' | 'text' | 'circle';
  width?: number | string;
  height?: number | string;
  /** For variant="text": number of lines (last is shortened). */
  lines?: number;
  radius?: string;
}

/** Skeleton — shimmer loading placeholder; collapses under reduce-motion. */
export function Skeleton(props: SkeletonProps): React.ReactElement;
