import * as React from 'react';

export interface HelpTipProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning';
  title?: string;
}

/** HelpTip — compact in-flow guidance strip. */
export function HelpTip(props: HelpTipProps): React.ReactElement;
