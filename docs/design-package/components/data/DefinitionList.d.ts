import * as React from 'react';

export interface DefinitionItem {
  label: React.ReactNode;
  value?: React.ReactNode;
  /** Mono value (rows layout only). */
  mono?: boolean;
}

export interface DefinitionListProps extends React.HTMLAttributes<HTMLDListElement> {
  items: DefinitionItem[];
  layout?: 'rows' | 'stacked';
}

/** DefinitionList — label/value pairs for detail panels; missing values render an em dash. */
export function DefinitionList(props: DefinitionListProps): React.ReactElement;
