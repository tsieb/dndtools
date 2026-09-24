import type React from 'react';
import { useEffect, useRef } from 'react';
import { registerBackHandler } from '../../platform/backNavigation';

/* The scene editor's shared visibility type, the phone side-panel overlay style and its Android Back
 * hook. Extracted from SceneEditor.tsx (RC-STB-2.6) so each panel can live in its own file. */

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

/**
 * RC-WID-4.3 — one audience's resolver verdict on a widget's binding, as the Binding inspector shows
 * it: the six states of Architecture Contract 4 (`WIDGETS.md` §2). `reason` is present on `hidden`
 * only, and only the DM's own inspector ever reads it — the resolver never tells a player why.
 */
export type BindingResolverState =
	| { state: 'available' | 'unbound' | 'missing' | 'conflicted' | 'degraded' }
	| { state: 'hidden'; reason: 'dm-only' | 'not-shared' | 'field-hidden' };

/**
 * RC-POL-1.3 — on a phone the Inspector and the details panel float over the canvas, so Android
 * Back closes them before it leaves the scene (the documented order: top overlay, then history).
 * Leaving instead dropped the details panel's unsaved draft along with the route.
 */
export function usePhonePanelBack(phone: boolean, onClose: () => void): void {
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	useEffect(() => {
		if (!phone) return undefined;
		return registerBackHandler('overlay', () => {
			onCloseRef.current();
			return true;
		});
	}, [phone]);
}
