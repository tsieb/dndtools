import * as React from 'react';

export interface FeatureSpotlightProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  description?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  icon?: string;
}

/** FeatureSpotlight — inline feature highlight card. */
export function FeatureSpotlight(props: FeatureSpotlightProps): React.ReactElement;
