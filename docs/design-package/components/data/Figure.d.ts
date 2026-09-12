import * as React from 'react';

export interface FigureProps extends React.HTMLAttributes<HTMLElement> {
  src?: string;
  imgStyle?: React.CSSProperties;
  alt?: string;
  caption?: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

export function Figure(props: FigureProps): React.ReactElement;
