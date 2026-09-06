import type { CoreStateSlice, SceneListEntry } from '@dndtools/core';
import type { MessageKey } from '../i18n';

export type SceneStatus = 'live' | 'ready' | 'draft';

/**
 * The hub/sidebar status for a scene, mirroring the archived Svelte `+page.svelte` derivation: the
 * actor's active scene is "live", a DM-only scene is a "draft", anything else is "ready". The
 * design package's tri-state badge (Live / Ready / Draft) maps onto exactly these.
 */
export function sceneStatus(
	scene: SceneListEntry,
	activeSceneId: string | null | undefined,
): SceneStatus {
	if (scene.id === activeSceneId) return 'live';
	return scene.visibility === 'dm-only' ? 'draft' : 'ready';
}

/** The badge's message key. RC-UX-1.2: the caller renders it with `t`, so a non-English locale
 * shows a translated badge instead of the English source. */
export function statusLabel(status: SceneStatus): MessageKey {
	return status === 'live'
		? 'scenes.status.live'
		: status === 'ready'
			? 'scenes.status.ready'
			: 'scenes.status.draft';
}

/** Active scene id for the rendered actor view. */
export function activeSceneId(state: CoreStateSlice): string | null {
	return state.session.activeSceneId ?? null;
}

/** Parse a comma-separated tags input into the trimmed tag list the scene commands expect. */
export function parseTags(raw: string): string[] {
	return raw
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
}
