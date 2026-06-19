import * as React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — initials are derived from it. */
  name?: string;
  /** Image URL; falls back to initials. */
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Status ring: active (green), turn (gold), danger (red). */
  ring?: 'active' | 'turn' | 'danger';
}

/** Avatar — participant/character marker; initials disc or image, optional status ring. */
export function Avatar(props: AvatarProps): React.ReactElement;
