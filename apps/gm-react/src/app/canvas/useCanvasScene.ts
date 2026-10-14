import { useMemo, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';
import { getSceneForActor, type SectionLayoutRegion } from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import { dockedPosition, type BoardWidget } from '../board-helpers';
import { extentOf } from './geometry';

const NO_SECTIONS: SectionLayoutRegion[] = [];

/** The theme painted on `<html>` (platform/theme.ts), followed as the GM switches it. */
function subscribeTheme(onChange: () => void) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	return () => observer.disconnect();
}
const paintedTheme = () => document.documentElement.getAttribute('data-theme');

/**
 * RC-POL-1.2 — the scene a canvas draws, out of `SceneBoardCanvas.tsx`: the route's scene (or the
 * home board, or whichever scene holds the first widget), its actor-read sections and background,
 * the surface theme that background implies, the widgets at their docked positions, and each
 * widget's layout group.
 */
export function useCanvasScene(authoredWidgets: BoardWidget[], policy: 'bounded' | 'canvas') {
	const runtime = useRuntime();
	const { id: routeSceneId } = useParams();
	const scene = useMemo(
		() =>
			runtime.state.scenes.scenes[
				routeSceneId ??
					(policy === 'bounded' ? (runtime.state.commandCenter.homeSceneId ?? '') : '')
			] ??
			Object.values(runtime.state.scenes.scenes).find((sc) =>
				sc.widgets.some((w) => w.id === authoredWidgets[0]?.id),
			),
		[runtime.state, authoredWidgets, routeSceneId, policy],
	);
	const summary = scene
		? getSceneForActor(
				runtime.state.scenes,
				runtime.state.permissions,
				runtime.defaultActorId,
				scene.id,
			)
		: null;
	const sections = summary && !('kind' in summary) ? summary.sections : NO_SECTIONS;
	const background = summary && !('kind' in summary) ? summary.visualSettings.background : 'paper';
	// RC-POL-1.2 — a paper or dark scene surface pins its own palette, except under the high-contrast
	// theme: a parchment sheet under high-contrast tiles undid the contrast the GM asked for.
	const highContrast = useSyncExternalStore(subscribeTheme, paintedTheme) === 'high-contrast';
	const surfaceTheme = highContrast
		? undefined
		: background === 'paper' || background === 'parchment'
			? 'parchment'
			: background === 'dark'
				? 'tavern'
				: undefined;
	const widgets = useMemo(() => {
		const extent = extentOf([...authoredWidgets, ...sections.map((section) => section.bounds)]);
		return authoredWidgets.map((widget) => ({
			...widget,
			...dockedPosition(
				widget,
				scene?.widgets.find((w) => w.id === widget.id)?.layout.dock ?? null,
				extent,
			),
		}));
	}, [authoredWidgets, scene, sections]);
	const groupOf = useMemo(
		() => new Map(scene?.widgets.map((w) => [w.id, w.layout.groupId]) ?? []),
		[scene],
	);
	return { scene, sections, background, surfaceTheme, widgets, groupOf };
}
