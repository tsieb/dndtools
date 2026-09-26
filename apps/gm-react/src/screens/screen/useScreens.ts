import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	findWidgetDefinition,
	isLiveScene,
	listScreensForActor,
	type ScreenListEntry,
} from '@dndtools/core';
import { Toaster } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { screenDisplayName, type ScreenTemplate } from './screenModel';

/**
 * The screens this actor may list, in the core's order (pinned first, in the GM's order, then by
 * name), with the name each is shown under. One read shared by the library, the header switcher and
 * the palette, so the three can never disagree about which screens exist or what they are called.
 */
export function useScreens(): {
	entries: ScreenListEntry[];
	nameOf: (entry: Pick<ScreenListEntry, 'name' | 'isHome'>) => string;
} {
	const runtime = useRuntime();
	const { t } = useI18n();
	const { scenes, permissions, commandCenter, session } = runtime.state;
	const actorId = runtime.defaultActorId;
	const entries = useMemo(
		() => listScreensForActor(scenes, permissions, actorId, { commandCenter, session }),
		[scenes, permissions, actorId, commandCenter, session],
	);
	const gmScreen = t('board.title');
	const nameOf = useCallback(
		(entry: Pick<ScreenListEntry, 'name' | 'isHome'>) => screenDisplayName(entry, gmScreen),
		[gmScreen],
	);
	return { entries, nameOf };
}

/**
 * ADR-041: the GM screen is one of the vault's screens from the start. A fresh vault has no home board
 * until `command-center.ensure-home` provisions it — which `/board` has always done on first open — so
 * the library does the same, or the GM screen would be missing from the one place that lists screens.
 * The command is idempotent (it keeps an existing, live home), and only the GM can run it. Returns
 * whether the last attempt failed to persist, so a caller can fall back to a surface that says so.
 */
export function useEnsureHomeScreen(): { failed: boolean } {
	const runtime = useRuntime();
	const ensuring = useRef(false);
	const [failed, setFailed] = useState(false);
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
	const homeSceneId = runtime.state.commandCenter.homeSceneId;
	const home = homeSceneId ? runtime.state.scenes.scenes[homeSceneId] : undefined;
	const missing = !home || !isLiveScene(home);
	useEffect(() => {
		if (!runtime.loaded || !isDm || !missing || ensuring.current || failed) return;
		ensuring.current = true;
		void runtime
			.dispatch({ type: 'command-center.ensure-home', actorId, payload: {} })
			// `dispatch` rethrows a persist failure. It is not retried here; the board reports it.
			.catch(() => setFailed(true))
			.finally(() => {
				ensuring.current = false;
			});
	}, [runtime, runtime.loaded, isDm, missing, actorId, failed]);
	return { failed };
}

/** A write's outcome: `null` on success, else the message to show. */
type Outcome = string | null;

/**
 * The library's writes, each one an existing core command (ADR-041: a screen is a scene, so there is
 * no screen-specific write path). A persist failure — `dispatch` rethrows one — is reported as the
 * same honest "couldn't be saved" message the rest of the app uses, never swallowed.
 */
export function useScreenActions() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;

	const run = useCallback(
		async (command: Parameters<typeof runtime.dispatch>[0]) => {
			try {
				const result = await runtime.dispatch(command);
				if (result.status === 'rejected') {
					return { ok: false as const, message: result.rejection.message ?? t('screens.failed') };
				}
				return { ok: true as const, events: result.events };
			} catch {
				return { ok: false as const, message: t('screens.notSaved') };
			}
		},
		[runtime, t],
	);

	const setPinned = useCallback(
		async (sceneId: string, pinned: boolean): Promise<Outcome> => {
			const result = await run({ type: 'scene.set-pinned', actorId, payload: { sceneId, pinned } });
			return result.ok ? null : result.message;
		},
		[run, actorId],
	);

	const rename = useCallback(
		async (
			sceneId: string,
			meta: { name: string; description: string; tags: string[] },
		): Promise<Outcome> => {
			const result = await run({
				type: 'scene.update-metadata',
				actorId,
				payload: { sceneId, name: meta.name, description: meta.description, tags: meta.tags },
			});
			return result.ok ? null : result.message;
		},
		[run, actorId],
	);

	const duplicate = useCallback(
		async (sceneId: string, name: string): Promise<{ id: string } | { error: string }> => {
			const result = await run({
				type: 'scene.duplicate',
				actorId,
				payload: { sceneId, name: t('screens.copyName', { name }) },
			});
			if (!result.ok) return { error: result.message };
			const event = result.events.find((e) => e.kind === 'scene.duplicated');
			return event && event.kind === 'scene.duplicated'
				? { id: event.newSceneId }
				: { error: t('screens.failed') };
		},
		[run, actorId, t],
	);

	/**
	 * Delete with undo: `scene.delete` is the core's recoverable soft delete, so the removal happens at
	 * once and the toast's Undo dispatches `scene.restore`. The core refuses the home and the live
	 * screen; that refusal is shown as it is worded.
	 */
	const remove = useCallback(
		async (sceneId: string, name: string): Promise<Outcome> => {
			const result = await run({ type: 'scene.delete', actorId, payload: { sceneId } });
			if (!result.ok) return result.message;
			Toaster.success(t('screens.deleted', { name }), {
				action: t('common.action.undo'),
				onAction: () => {
					void run({ type: 'scene.restore', actorId, payload: { sceneId } }).then((restored) => {
						if (restored.ok) Toaster.success(t('screens.restored', { name }));
						else Toaster.error(restored.message);
					});
				},
			});
			return null;
		},
		[run, actorId, t],
	);

	/**
	 * New from template: `scene.create` (GM only, as every new GM workspace starts), then the layout
	 * policy when it is not the default, then the template's tiles. A CAN-4.4 or saved template goes
	 * through `scene.apply-template`; a layout defined here places each tile with `scene.add-widget`.
	 * A step that fails after the create leaves the new screen in place and says so, rather than
	 * pretending nothing happened.
	 */
	const createFromTemplate = useCallback(
		async (
			template: ScreenTemplate,
			name: string,
		): Promise<{ id: string; warning?: string } | { error: string }> => {
			const created = await run({
				type: 'scene.create',
				actorId,
				payload: {
					name,
					description: '',
					tags: [],
					visibility: 'dm-only',
					...(template.background ? { visualSettings: { background: template.background } } : {}),
				},
			});
			if (!created.ok) return { error: created.message };
			const event = created.events.find((e) => e.kind === 'scene.created');
			if (!event || event.kind !== 'scene.created') return { error: t('screens.failed') };
			const sceneId = event.sceneId;
			const steps: Parameters<typeof runtime.dispatch>[0][] = [];
			if (template.layoutPolicy !== 'canvas') {
				steps.push({
					type: 'scene.set-layout-policy',
					actorId,
					payload: { sceneId, layoutPolicy: template.layoutPolicy },
				});
			}
			const source = template.source;
			if (source.kind === 'builtin' || source.kind === 'preset' || source.kind === 'scene') {
				steps.push({ type: 'scene.apply-template', actorId, payload: { sceneId, source } });
			} else if (source.kind === 'tiles') {
				for (const tile of source.tiles) {
					const definition = findWidgetDefinition(runtime.state.widgets, tile.type);
					if (!definition) continue;
					steps.push({
						type: 'scene.add-widget',
						actorId,
						payload: {
							sceneId,
							widget: {
								type: tile.type,
								version: definition.version,
								layout: { x: tile.x, y: tile.y, w: tile.w, h: tile.h },
								configuration: {},
								localState: {},
								binding: null,
							},
						},
					});
				}
			}
			for (const step of steps) {
				const result = await run(step);
				if (!result.ok) return { id: sceneId, warning: result.message };
			}
			return { id: sceneId };
		},
		[run, runtime, actorId, t],
	);

	return { setPinned, rename, duplicate, remove, createFromTemplate };
}
