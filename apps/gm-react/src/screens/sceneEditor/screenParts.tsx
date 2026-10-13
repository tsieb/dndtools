import { lazy, Suspense, useState, type ComponentProps, type SyntheticEvent } from 'react';
import './sceneEditor.css';

// The parts of the editor a screen board borrows. They live apart from `SceneEditor` so `/board`
// does not load the whole editor page, its widget builder and the assistant run; the inspector and
// the preview overlay load the first time a GM edits or previews (RC-ENG-3.2).

const LazyInspector = lazy(() =>
	import('./ScreenEditing').then((module) => ({ default: module.ScreenInspector })),
);
const LazyPreviewOverlay = lazy(() =>
	import('./ScreenEditing').then((module) => ({ default: module.ScreenPreviewOverlay })),
);

/** The screen board borrows the editor's drawers, with its own dispatch and undo stack. */
export function ScreenInspector(props: ComponentProps<typeof LazyInspector>) {
	return (
		<Suspense fallback={null}>
			<LazyInspector {...props} />
		</Suspense>
	);
}

/** The player-preview overlay on a screen (see `ScreenEditing.tsx`). */
export function ScreenPreviewOverlay(props: ComponentProps<typeof LazyPreviewOverlay>) {
	return (
		<Suspense fallback={null}>
			<LazyPreviewOverlay {...props} />
		</Suspense>
	);
}

/**
 * While a bounded screen's layout is edited the frame owns the keys, and each tile's scroll region
 * leaves the tab order. Clip those regions instead of leaving scrollers a keyboard cannot reach
 * (axe scrollable-region-focusable): "N more lines" still shows, and Done brings scrolling back.
 */
const EDIT_CLIP =
	'[data-testid="scene-board-bounded"][role="application"] [data-widget-region]{overflow:hidden!important}';
export function ScreenEditClip() {
	return <style>{EDIT_CLIP}</style>;
}

/**
 * The inspector covers the whole board on a phone, so a tile the Add gallery just placed there is
 * selected with the inspector held shut (`id`). A pointer press or Enter on that tile wakes it, as
 * for any other tile; its menu trigger does not.
 */
export function useQuietPlacement() {
	const [id, setId] = useState<string | null>(null);
	return {
		id,
		placed: (placedId: string, phone: boolean) => setId(phone ? placedId : null),
		clear: () => setId(null),
		wake: (e: SyntheticEvent) => {
			if (!id || ('key' in e && e.key !== 'Enter')) return;
			const target = e.target as Element;
			if (target.closest('[data-testid="tile-actions-trigger"]')) return;
			if (target.closest(`[data-testid="widget-${id}"]`)) setId(null);
		},
	};
}
