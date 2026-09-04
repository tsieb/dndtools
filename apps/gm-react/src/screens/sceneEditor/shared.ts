import type React from 'react';

/* The scene editor's shared visibility type + the phone side-panel overlay style. Extracted from
 * SceneEditor.tsx (RC-STB-2.6) so each panel can live in its own file. */

export type Visibility = 'dm-only' | 'shared' | 'player-visible';

/**
 * On a phone the side panels are flex SIBLINGS of the canvas, so opening one used to shrink the
 * canvas from the full width down to ~80px — an unusable sliver. Float them over the canvas
 * instead, the same treatment Board.tsx already gives its inspector.
 */
export const PHONE_PANEL_OVERLAY: React.CSSProperties = {
	position: 'absolute',
	right: 0,
	top: 0,
	bottom: 0,
	zIndex: 4,
	width: 'min(300px, 100%)',
	maxWidth: '100%',
};
