import * as React from 'react';

export interface NpcCardProps extends React.HTMLAttributes<HTMLElement> {
  name: React.ReactNode;
  role?: React.ReactNode;
  location?: React.ReactNode;
  disposition?: 'friendly' | 'neutral' | 'hostile' | 'unknown';
  /** The secret hook the DM plays them with. */
  hook?: React.ReactNode;
  tags?: string[];
  /** Avatar image URL (falls back to initials). */
  src?: string;
  dmOnly?: boolean;
  onClick?: () => void;
}

/** NpcCard — a non-player-character reference: avatar, role/location, disposition, hook, tags. */
export function NpcCard(props: NpcCardProps): React.ReactElement;
