import { useState } from 'react';
import {
	CHARACTER_ENTITY_TYPE,
	CONTENT_ITEM_ENTITY_TYPE,
	findWidgetDefinition,
	getContentItemsForActor,
	listCharactersForActor,
	listMapsForActor,
	type CoreStateSlice,
	type WidgetBindingDefinition,
} from '@dndtools/core';
import { Button, Dialog, Field, Select, Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { FieldControl } from '../../screens/sceneEditor/fields';
import type { BoardWidget } from '../board-helpers';

/**
 * RC-CAN-2.4 — the two tile-menu items that need more room than a menu row: Bind… (which entity the
 * tile shows) and, off the scene editor, Configure… (the definition's declared settings; the scene
 * editor opens its Inspector instead). Both write `scene.configure-widget`, the command the Map tile's
 * own picker and the Inspector already use, so the core stays the one judge of who may bind what.
 */

/** Tile-dialog copy — English-only for now, like the tile menu's. */
const TEXT = {
	bindTitle: (title: string) => `Bind ${title}`,
	bindHelp: (noun: string) => `Choose the ${noun} this tile shows.`,
	nothing: (noun: string) => `There is no ${noun} you can bind yet.`,
	bound: (title: string, name: string) => `Bound ${title} to ${name}`,
	unbound: (title: string) => `${title} is no longer bound`,
	none: 'Nothing',
	bind: 'Bind',
	cancel: 'Cancel',
	configureTitle: (title: string) => `Configure ${title}`,
	done: 'Done',
};

export function sceneInstance(state: CoreStateSlice, widgetId: string) {
	for (const scene of Object.values(state.scenes.scenes)) {
		const instance = scene.widgets.find((candidate) => candidate.id === widgetId);
		if (instance) return { scene, instance };
	}
	return null;
}

/** The definition's binding slot. An instance holds one binding, so the first declared slot is it. */
export function bindingSlot(
	widgets: CoreStateSlice['widgets'],
	type: string,
): { slot: WidgetBindingDefinition; optional: boolean } | null {
	const definition = findWidgetDefinition(widgets, type);
	const required = definition?.requiredBindings[0];
	if (required) return { slot: required, optional: false };
	const optional = definition?.optionalBindings[0];
	return optional ? { slot: optional, optional: true } : null;
}

/** What a settings dialog lists: visibility has its own submenu, so it is never offered twice. */
export const settingsFields = (w: Pick<BoardWidget, 'configFields'>) =>
	w.configFields.filter((field) => field.key !== 'visibility');

type Named = { id: string; label: string };

/** Actor-filtered reads only, like the header's bound-name lookup: the picker never offers a record
 *  the viewer may not read. An entity type with no read here offers nothing. */
const READERS: Record<string, (state: CoreStateSlice, actorId: string) => Named[]> = {
	map: (s, a) =>
		listMapsForActor(s.maps, s.permissions, a).map((map) => ({ id: map.id, label: map.name })),
	[CHARACTER_ENTITY_TYPE]: (s, a) =>
		listCharactersForActor(s.characters, s.permissions, a).map((c) => ({ id: c.id, label: c.name })),
	[CONTENT_ITEM_ENTITY_TYPE]: (s, a) =>
		getContentItemsForActor(s.content, s.permissions, a).map((i) => ({ id: i.id, label: i.title })),
};

const NONE = '';

export function TileBindDialog({ w, onClose }: { w: BoardWidget; onClose: () => void }) {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const found = bindingSlot(runtime.state.widgets, w.type);
	const types = found?.slot.entityTypes ?? [];
	const candidates = types.flatMap((entityType) =>
		(READERS[entityType]?.(runtime.state, actorId) ?? []).map((entry) => ({ ...entry, entityType })),
	);
	const ref = w.bindingRef;
	const current = ref
		? candidates.findIndex((c) => c.entityType === ref.entityType && c.id === ref.entityId)
		: -1;
	const [choice, setChoice] = useState(
		current >= 0 ? String(current) : found?.optional || !candidates.length ? NONE : '0',
	);
	const [busy, setBusy] = useState(false);
	if (!found) return null;
	const { slot, optional } = found;
	const noun = slot.label.toLowerCase();
	const picked = choice === NONE ? null : (candidates[Number(choice)] ?? null);

	async function bind() {
		const place = sceneInstance(runtime.state, w.id);
		if (!place) return;
		setBusy(true);
		const result = await runtime.dispatch({
			type: 'scene.configure-widget',
			actorId,
			payload: {
				sceneId: place.scene.id,
				widgetInstanceId: w.id,
				binding: picked
					? {
							source: { entityType: picked.entityType, entityId: picked.id },
							mode: slot.mode,
							requiredCapability: slot.requiredCapability,
						}
					: null,
			},
		});
		setBusy(false);
		if (result.status !== 'accepted') {
			Toaster.error(result.rejection.message);
			return;
		}
		Toaster.success(picked ? TEXT.bound(w.title, picked.label) : TEXT.unbound(w.title));
		onClose();
	}

	const options = [
		...(optional ? [{ value: NONE, label: TEXT.none }] : []),
		...candidates.map((c, i) => ({
			value: String(i),
			label: types.length > 1 ? `${c.label} · ${c.entityType}` : c.label,
		})),
	];
	return (
		<Dialog
			open
			onClose={onClose}
			title={TEXT.bindTitle(w.title)}
			description={TEXT.bindHelp(noun)}
			size="sm"
			data-testid="tile-bind-dialog"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose}>
						{TEXT.cancel}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="link"
						disabled={busy || (!picked && !optional)}
						onClick={() => void bind()}
					>
						{TEXT.bind}
					</Button>
				</>
			}
		>
			{options.length === 0 ? (
				<div style={{ color: 'var(--color-text-secondary)' }}>{TEXT.nothing(noun)}</div>
			) : (
				<Field label={slot.label}>
					<Select
						value={choice}
						options={options}
						onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setChoice(e.target.value)}
					/>
				</Field>
			)}
		</Dialog>
	);
}

/** The board has no Inspector, so its Configure… opens the definition's declared settings here. Each
 *  control commits on its own, as it does in the Inspector: Done only closes. */
export function TileConfigureDialog({ w, onClose }: { w: BoardWidget; onClose: () => void }) {
	const runtime = useRuntime();
	function commit(key: string, value: unknown) {
		const place = sceneInstance(runtime.state, w.id);
		if (!place) return;
		void runtime
			.dispatch({
				type: 'scene.configure-widget',
				actorId: runtime.defaultActorId,
				payload: {
					sceneId: place.scene.id,
					widgetInstanceId: w.id,
					configuration: { ...place.instance.configuration, [key]: value },
				},
			})
			.then((result) => {
				if (result.status !== 'accepted') Toaster.error(result.rejection.message);
			});
	}
	return (
		<Dialog
			open
			onClose={onClose}
			title={TEXT.configureTitle(w.title)}
			size="sm"
			data-testid="tile-configure-dialog"
			footer={
				<Button variant="primary" size="sm" onClick={onClose}>
					{TEXT.done}
				</Button>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
				{settingsFields(w).map((field) => (
					<FieldControl
						key={field.key}
						field={field}
						value={w.configuration[field.key]}
						onCommit={(value) => commit(field.key, value)}
					/>
				))}
			</div>
		</Dialog>
	);
}
