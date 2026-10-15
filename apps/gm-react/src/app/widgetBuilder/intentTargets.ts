import { useMemo } from 'react';
import {
	VAULT_OBJECT_SUBTYPE_KEY,
	getContentItemsForActor,
	listCharactersForActor,
	listMapsForActor,
	listScreensForActor,
	type WidgetIntentEntityKind,
} from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';

/** The targets an open intent may name in the builder's Intents section (RC-WID-5.1, RC-SES-7.3). */
export interface TargetOption {
	value: string;
	label: string;
}

export type IntentTargets = Record<
	WidgetIntentEntityKind | 'screen' | 'participant',
	TargetOption[]
>;

/**
 * What an open intent can point at, read the way the author sees the vault. These are the same
 * actor-filtered reads the destinations use; the viewer's own gate is applied again at press time.
 */
export function useIntentTargets(): IntentTargets {
	const runtime = useRuntime();
	const state = runtime.state;
	const actorId = runtime.defaultActorId;
	return useMemo(() => {
		const { characters, maps, permissions, content, scenes } = state;
		const items = getContentItemsForActor(content, permissions, actorId);
		const byName = (a: TargetOption, b: TargetOption) => a.label.localeCompare(b.label);
		return {
			character: listCharactersForActor(characters, permissions, actorId).map((c) => ({
				value: c.id,
				label: c.name,
			})),
			map: listMapsForActor(maps, permissions, actorId).map((m) => ({
				value: m.id,
				label: m.name,
			})),
			note: items
				.filter((item) => item.kind === 'note')
				.map((item) => ({ value: item.id, label: item.title }))
				.sort(byName),
			quest: items
				.filter(
					(item) => item.kind === 'object' && item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'quest',
				)
				.map((item) => ({ value: item.id, label: item.title }))
				.sort(byName),
			screen: listScreensForActor(scenes, permissions, actorId).map((screen) => ({
				value: screen.id,
				label: screen.name,
			})),
			// The seats a `preview-participant` intent may name (the host checks the role again).
			participant: Object.values(permissions.actors)
				.filter((actor) => actor.role === 'player' || actor.role === 'observer')
				.map((actor) => ({ value: actor.id, label: actor.displayName }))
				.sort(byName),
		};
	}, [state, actorId]);
}
