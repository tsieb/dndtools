import type React from 'react';
import { useState } from 'react';
import {
	CHARACTER_ENTITY_TYPE,
	CONTENT_ITEM_ENTITY_TYPE,
	PREVIEW_PLAYER_ACTOR_ID,
	deliveredMapIdsForActor,
	findWidgetDefinition,
	getContentItemsForActor,
	getMapViewForActor,
	getSceneForActor,
	hasDmAuthority,
	listCharactersForActor,
	listMapsForActor,
	permissionsWithPreviewActors,
	resolveWidgetBinding,
	type Actor,
	type CoreStateSlice,
	type WidgetBinding,
} from '@dndtools/core';
import { Badge, Button, Field, Input, Select, Toaster, VisibilityChip } from '../../ds';
import type { DSBadgeStatus } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { bindingSlot, sceneInstance } from '../../app/canvas/TileDialogs';
import { payloadIndex, type BoardWidget } from '../../app/board-helpers';
import { useI18n, type MessageKey } from '../../i18n';
import { previewDataEnvironment } from './playerPreview';
import { Section } from './fields';
import type { BindingResolverState } from './shared';

/**
 * RC-WID-4.3 — the Inspector's Binding section: what the selected widget is pointed at, what it may
 * do with it, and what the Processing Core's resolver hands each audience.
 *
 * - Search runs over the DM's own actor-filtered reads (maps, characters, content items), so the
 *   picker offers everything the DM may bind and nothing a raw state read would add.
 * - Mode is the binding's `mode`; the capability it needs follows from it.
 * - The resolver state is computed twice: as the DM, and as the core's generic zero-grant preview
 *   player — the same actor the scene's "Any player" preview reads as, against the same data
 *   environment (`previewDataEnvironment`). A player gets `hidden` for a DM-only target and is never
 *   told whether it is also missing or conflicted; only the DM's own row can say why.
 */

type BindingMode = WidgetBinding['mode'];
type BindingState = BindingResolverState['state'];

const MODES: readonly BindingMode[] = ['read', 'observe', 'operate', 'manage'];

/** The grant a binding's mode asks for (`widget-operator-authority`: operate vs configure). */
const CAPABILITY: Record<BindingMode, WidgetBinding['requiredCapability']> = {
	read: 'viewer',
	observe: 'viewer',
	operate: 'operator',
	manage: 'manager',
};

const STATE_TONE: Record<BindingState, DSBadgeStatus> = {
	available: 'success',
	unbound: 'neutral',
	missing: 'warning',
	hidden: 'info',
	conflicted: 'error',
	degraded: 'warning',
};

/** The map read decides map tiles; the data environment does not model maps (`playerPreview.ts`). */
const MAP_ENTITY_TYPE = 'map';

interface Candidate {
	entityType: string;
	id: string;
	label: string;
	visibility: string;
}

/** The DM's actor-filtered reads per bindable entity type. A type with no read offers nothing. */
const READERS: Record<
	string,
	(state: CoreStateSlice, actorId: string) => Omit<Candidate, 'entityType'>[]
> = {
	[MAP_ENTITY_TYPE]: (s, a) =>
		listMapsForActor(s.maps, s.permissions, a).map((m) => ({
			id: m.id,
			label: m.name,
			visibility: m.visibility,
		})),
	[CHARACTER_ENTITY_TYPE]: (s, a) =>
		listCharactersForActor(s.characters, s.permissions, a).map((c) => ({
			id: c.id,
			label: c.name,
			visibility: c.visibility,
		})),
	[CONTENT_ITEM_ENTITY_TYPE]: (s, a) =>
		getContentItemsForActor(s.content, s.permissions, a).map((i) => ({
			id: i.id,
			label: i.title,
			visibility: i.visibility,
		})),
};

/**
 * The resolver's verdict on `widgetId`'s binding for the DM and for a generic player. Pure, so it
 * reads the same whether the inspector or a test asks.
 */
export function resolveBindingStates(
	state: CoreStateSlice,
	sceneId: string,
	widgetId: string,
	dmActorId: string,
): { dm: BindingResolverState; players: BindingResolverState } {
	const instance = state.scenes.scenes[sceneId]?.widgets.find((w) => w.id === widgetId);
	const permissions = permissionsWithPreviewActors(state.permissions);
	const player = permissions.actors[PREVIEW_PLAYER_ACTOR_ID]!;
	const dm = state.permissions.actors[dmActorId] ?? player;
	if (!instance) return { dm: { state: 'missing' }, players: { state: 'missing' } };
	const env = previewDataEnvironment(state, sceneId);
	const required = (findWidgetDefinition(state.widgets, instance.type)?.requiredBindings ?? [])
		.length;
	// `degraded` is the host's call (denied host permissions), not the data layer's, and it is the same
	// for every audience: take it from the core's scene read.
	const read = getSceneForActor(state.scenes, state.permissions, dm.id, sceneId, {
		widgetPackages: state.widgets,
		dataEnvironment: env,
	});
	const degraded =
		!('kind' in read) && payloadIndex(read.widgets).get(widgetId)?.kind === 'degraded';

	const resolveFor = (actor: Actor): BindingResolverState => {
		// An optional slot with nothing in it still draws, so the resolver calls it available; the
		// inspector is describing the binding, and there is none.
		if (!instance.binding) return { state: 'unbound' };
		const resolution = resolveWidgetBinding(instance.binding, actor, env, {
			bindingRequired: required > 0,
		});
		if (resolution.state === 'hidden') return { state: 'hidden', reason: resolution.reason };
		if (resolution.state !== 'available') return { state: resolution.state };
		const source = instance.binding.source;
		if (source.entityType === MAP_ENTITY_TYPE && !hasDmAuthority(actor.role)) {
			const view = getMapViewForActor(state.maps, permissions, actor.id, source.entityId, {
				deliveredMapIds: deliveredMapIdsForActor(state.session, actor.id),
			});
			if (view.kind !== 'available') {
				const shared = state.maps.maps[source.entityId]?.visibility === 'shared';
				return { state: 'hidden', reason: shared ? 'not-shared' : 'dm-only' };
			}
		}
		return { state: degraded ? 'degraded' : 'available' };
	};
	return { dm: resolveFor(dm), players: resolveFor(player) };
}

const HIDDEN_REASON: Record<
	Extract<BindingResolverState, { state: 'hidden' }>['reason'],
	MessageKey
> = {
	'dm-only': 'sceneEditor.binding.hiddenReason.dmOnly',
	'not-shared': 'sceneEditor.binding.hiddenReason.notShared',
	'field-hidden': 'sceneEditor.binding.hiddenReason.fieldHidden',
};

/** One audience's row: the state as a badge, and what it means. */
function StateRow({
	audience,
	label,
	resolved,
	optional,
}: {
	audience: 'dm' | 'players';
	label: string;
	resolved: BindingResolverState;
	optional: boolean;
}) {
	const { t } = useI18n();
	const explain: MessageKey =
		resolved.state === 'unbound' && optional
			? 'sceneEditor.binding.explain.unboundOptional'
			: `sceneEditor.binding.explain.${resolved.state}`;
	return (
		<div
			role="listitem"
			data-testid={`binding-state-${audience}`}
			data-state={resolved.state}
			style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span
					style={{
						flex: 1,
						minWidth: 0,
						font: '600 var(--text-2xs) var(--font-sans)',
						color: 'var(--color-text-primary)',
					}}
				>
					{label}
				</span>
				<Badge status={STATE_TONE[resolved.state]}>
					{t(`sceneEditor.binding.state.${resolved.state}`)}
				</Badge>
			</div>
			<span
				style={{
					font: 'var(--text-2xs)/1.4 var(--font-sans)',
					color: 'var(--color-text-secondary)',
				}}
			>
				{/* Only the DM reads this panel, and may know why players are refused — the player's own
				    read never says. */}
				{resolved.state === 'hidden' && `${t(HIDDEN_REASON[resolved.reason])} `}
				{t(explain)}
			</span>
		</div>
	);
}

export function BindingInspector({ widget }: { widget: BoardWidget }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [query, setQuery] = useState('');
	const [busy, setBusy] = useState(false);
	const state = runtime.state;
	const actorId = runtime.defaultActorId;
	const found = bindingSlot(state.widgets, widget.type);
	const place = sceneInstance(state, widget.id);
	if (!found || !place) return null;
	const { slot, optional } = found;
	const binding = place.instance.binding;
	const candidates: Candidate[] = slot.entityTypes.flatMap((entityType) =>
		(READERS[entityType]?.(state, actorId) ?? []).map((entry) => ({ ...entry, entityType })),
	);
	const current = binding
		? candidates.find(
				(c) => c.entityType === binding.source.entityType && c.id === binding.source.entityId,
			)
		: undefined;
	const needle = query.trim().toLowerCase();
	const matches = candidates
		.filter((c) => !needle || c.label.toLowerCase().includes(needle))
		.filter((c) => c !== current)
		.slice(0, 8);
	const mode: BindingMode = binding?.mode ?? slot.mode;
	const states = resolveBindingStates(state, place.scene.id, widget.id, actorId);

	async function write(next: WidgetBinding | null) {
		if (!place) return;
		setBusy(true);
		const result = await runtime.dispatch({
			type: 'scene.configure-widget',
			actorId,
			payload: { sceneId: place.scene.id, widgetInstanceId: widget.id, binding: next },
		});
		setBusy(false);
		if (result.status !== 'accepted') Toaster.error(result.rejection.message);
	}
	const bindTo = (candidate: Candidate) => {
		setQuery('');
		void write({
			source: { entityType: candidate.entityType, entityId: candidate.id },
			mode,
			requiredCapability: CAPABILITY[mode],
		});
	};
	const setMode = (next: BindingMode) => {
		if (!binding || next === binding.mode) return;
		void write({ ...binding, mode: next, requiredCapability: CAPABILITY[next] });
	};

	return (
		<Section label={t('sceneEditor.binding.title')}>
			<div
				data-testid="widget-inspector-binding"
				style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
					<span
						data-testid="binding-current"
						style={{
							flex: 1,
							minWidth: 0,
							font: 'var(--text-xs)/1.4 var(--font-sans)',
							color: 'var(--color-text-primary)',
							overflowWrap: 'anywhere',
						}}
					>
						{binding
							? current
								? t('sceneEditor.binding.boundTo', { name: current.label })
								: t('sceneEditor.binding.boundToGone')
							: t('sceneEditor.binding.none')}
					</span>
					{current && <VisibilityChip level={current.visibility} compact />}
					{binding && optional && (
						<Button variant="ghost" size="sm" disabled={busy} onClick={() => void write(null)}>
							{t('sceneEditor.binding.unbind')}
						</Button>
					)}
				</div>

				<div
					role="list"
					aria-label={t('sceneEditor.binding.states')}
					style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
				>
					<StateRow
						audience="dm"
						label={t('sceneEditor.binding.forYou')}
						resolved={states.dm}
						optional={optional}
					/>
					<StateRow
						audience="players"
						label={t('sceneEditor.binding.forPlayers')}
						resolved={states.players}
						optional={optional}
					/>
				</div>

				<Select
					aria-label={t('sceneEditor.binding.mode')}
					value={mode}
					disabled={!binding || busy}
					onChange={(e: { target: { value: string } }) => setMode(e.target.value as BindingMode)}
					options={MODES.map((value) => ({ value, label: t(`builder.bindingMode.${value}`) }))}
				/>

				<Field label={t('sceneEditor.binding.search', { noun: slot.label.toLowerCase() })}>
					<Input
						type="search"
						icon="search"
						value={query}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
					/>
				</Field>
				{candidates.length === 0 ? (
					<span
						style={{
							font: 'var(--text-2xs) var(--font-sans)',
							color: 'var(--color-text-tertiary)',
						}}
					>
						{t('sceneEditor.binding.nothing', { noun: slot.label.toLowerCase() })}
					</span>
				) : matches.length === 0 ? (
					<span
						style={{
							font: 'var(--text-2xs) var(--font-sans)',
							color: 'var(--color-text-tertiary)',
						}}
					>
						{t('sceneEditor.binding.noMatches', { query: query.trim() })}
					</span>
				) : (
					<div
						role="list"
						aria-label={t('sceneEditor.binding.results')}
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 'var(--space-1)',
						}}
					>
						{matches.map((candidate) => (
							<div
								role="listitem"
								key={`${candidate.entityType}:${candidate.id}`}
								style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
							>
								<Button
									variant="secondary"
									size="sm"
									icon="link"
									disabled={busy}
									aria-label={t('sceneEditor.binding.bindTo', { name: candidate.label })}
									onClick={() => bindTo(candidate)}
									style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}
								>
									{candidate.label}
								</Button>
								<VisibilityChip level={candidate.visibility} compact />
							</div>
						))}
					</div>
				)}
			</div>
		</Section>
	);
}
