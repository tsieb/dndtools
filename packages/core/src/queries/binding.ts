import type { Actor } from '../state/permission-state';
import type { WidgetBinding } from '../state/scene-state';

export const WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION = 1 as const;

/**
 * Data-layer visibility of a bound entity, per Architecture Contract 3.
 * Binding resolution checks visibility before permission and before any value
 * leaves the Processing Core (CANVAS-009).
 */
export type EntityVisibility = 'dm-only' | 'player-visible' | 'shared';

/**
 * A declarative, serializable description of an app-data entity that a widget
 * binding can target.
 *
 * The Processing Core resolves bindings against these records so that visibility,
 * conflict, and existence are decided at the data layer rather than by GUI code.
 * Future `VaultState` / `MapState` / `SessionState` slices populate this view; the
 * first prototype keeps it empty and lets binding selector markers simulate the
 * states it cannot yet source from a real entity store.
 */
export interface EntityBindingRecord {
	entityType: string;
	entityId: string;
	visibility: EntityVisibility;
	/** Actor ids a `shared` entity is explicitly shared with. */
	sharedWith?: string[];
	/** Selector paths that stay DM-only even when the entity itself is visible. */
	hiddenSelectors?: string[];
	/** Unresolved conflict: entity-wide (`true`) or scoped to specific paths. */
	conflict?: boolean | { paths: string[] };
	/** Actor-independent field values; the core redacts DM-only fields per actor. */
	value?: Record<string, unknown>;
}

/**
 * The actor-independent view of app data that widget bindings resolve against.
 * `knownEntityKeys`, when present, is the authoritative set of existing entity
 * keys: a binding whose target key is absent resolves to `missing` (a deleted or
 * never-known target) instead of leaking a stale value.
 */
export interface WidgetDataEnvironment {
	entities: Record<string, EntityBindingRecord>;
	knownEntityKeys?: string[];
	schemaVersion: typeof WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION;
}

export const EMPTY_WIDGET_DATA_ENVIRONMENT: WidgetDataEnvironment = Object.freeze({
	entities: {},
	schemaVersion: WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION,
});

export function entityBindingKey(entityType: string, entityId: string): string {
	return `${entityType}:${entityId}`;
}

/** The explicit binding states a widget can render (Architecture Contract 4). */
export type WidgetBindingState =
	| 'available'
	| 'unbound'
	| 'missing'
	| 'hidden'
	| 'conflicted'
	| 'degraded';

export type HiddenBindingReason = 'dm-only' | 'not-shared' | 'field-hidden';

/**
 * The outcome of resolving a binding for one actor. `degraded` is decided by the
 * widget host (denied host permissions), not by this data-layer resolver, so it is
 * not produced here.
 */
export type WidgetBindingResolution =
	| { state: 'available'; value: Record<string, unknown> | null }
	| { state: 'unbound' }
	| { state: 'missing' }
	| { state: 'hidden'; reason: HiddenBindingReason }
	| { state: 'conflicted'; conflictPaths: string[] };

export interface ResolveBindingOptions {
	/** Whether the widget definition declares the binding as required. */
	bindingRequired?: boolean;
}

function entityVisibilityForActor(
	record: EntityBindingRecord,
	actor: Actor,
): 'visible' | 'dm-only' | 'not-shared' {
	if (actor.role === 'dm') return 'visible';
	if (record.visibility === 'dm-only') return 'dm-only';
	if (record.visibility === 'player-visible') return 'visible';
	return (record.sharedWith ?? []).includes(actor.id) ? 'visible' : 'not-shared';
}

function conflictPathsFor(record: EntityBindingRecord): string[] | null {
	const conflict = record.conflict;
	if (!conflict) return null;
	if (conflict === true) return ['(entity)'];
	return conflict.paths.length > 0 ? conflict.paths : null;
}

function redactValue(
	record: EntityBindingRecord,
	isDm: boolean,
): Record<string, unknown> | null {
	if (!record.value) return null;
	const hidden = record.hiddenSelectors ?? [];
	if (isDm || hidden.length === 0) return record.value;
	const out: Record<string, unknown> = { ...record.value };
	for (const key of hidden) delete out[key];
	return out;
}

/**
 * Resolve a widget binding for one actor at the data layer.
 *
 * Order of evaluation fails closed: a non-DM actor never learns that a hidden
 * entity is also missing or conflicted, and a conflicted binding never silently
 * resolves to one revision's value.
 *
 * When the environment has no record for the target, prototype selector markers
 * (`missing:`, `hidden:`, `conflicted:`) let bindings exercise each state before a
 * real entity store exists. Explicit environment records always win over markers.
 */
export function resolveWidgetBinding(
	binding: WidgetBinding | null,
	actor: Actor,
	env: WidgetDataEnvironment = EMPTY_WIDGET_DATA_ENVIRONMENT,
	options: ResolveBindingOptions = {},
): WidgetBindingResolution {
	if (!binding) {
		return options.bindingRequired ? { state: 'unbound' } : { state: 'available', value: null };
	}
	const { entityType, entityId, selector } = binding.source;
	const isDm = actor.role === 'dm';
	const key = entityBindingKey(entityType, entityId);
	const record = env.entities[key];

	if (record) {
		const visibility = entityVisibilityForActor(record, actor);
		if (visibility !== 'visible') return { state: 'hidden', reason: visibility };
		if (!isDm && selector && (record.hiddenSelectors ?? []).includes(selector)) {
			return { state: 'hidden', reason: 'field-hidden' };
		}
		const conflictPaths = conflictPathsFor(record);
		if (conflictPaths) return { state: 'conflicted', conflictPaths };
		return { state: 'available', value: redactValue(record, isDm) };
	}

	if (env.knownEntityKeys && !env.knownEntityKeys.includes(key)) {
		return { state: 'missing' };
	}

	if (selector?.startsWith('missing:')) return { state: 'missing' };
	if (selector?.startsWith('hidden:')) {
		return isDm ? { state: 'available', value: null } : { state: 'hidden', reason: 'field-hidden' };
	}
	if (selector?.startsWith('conflicted:')) {
		const path = selector.slice('conflicted:'.length);
		return { state: 'conflicted', conflictPaths: [path || '(entity)'] };
	}
	return { state: 'available', value: null };
}

export type CommandBindingBlock = {
	code: 'hidden-target' | 'conflicted-target';
	message: string;
};

/**
 * Decide whether a durable widget command must be rejected because its bound path
 * is hidden or carries an unresolved conflict (CANVAS-010). This is stricter than
 * actor-scoped read resolution: a hidden or conflicted binding is unsafe to mutate
 * for any actor, including the DM, who must reveal or resolve it through an
 * explicit command first rather than silently overwriting one version.
 */
export function commandBindingBlock(binding: WidgetBinding | null): CommandBindingBlock | null {
	const selector = binding?.source.selector;
	if (!selector) return null;
	if (selector.startsWith('hidden:')) {
		return { code: 'hidden-target', message: 'Widget command targets a hidden binding path.' };
	}
	if (selector.startsWith('conflicted:')) {
		return {
			code: 'conflicted-target',
			message: 'Widget command targets a binding with an unresolved conflict.',
		};
	}
	return null;
}
