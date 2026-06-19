import * as React from 'react';

export interface MapDraft {
  name: string;
  scale: number | null;
  unit: string;
  projection: 'flat' | 'equirectangular' | 'mercator';
  visibility: 'dm-only' | 'players' | 'shared';
}

/**
 * MapCreationForm — the new-map form body (name, scale, projection, default visibility). Fails
 * closed to DM-only; submit disabled until Name is set. Wrap in your own dialog/sheet chrome.
 */
export interface MapCreationFormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'defaultValue'> {
  defaults?: Partial<MapDraft>;
  onCreate?: (draft: MapDraft) => void;
  onCancel?: () => void;
  submitting?: boolean;
}

export function MapCreationForm(props: MapCreationFormProps): React.ReactElement;
