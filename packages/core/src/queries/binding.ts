import type { Actor } from '../state/permission-state';
import type { WidgetBinding } from '../state/scene-state';
import type { WidgetOutputDestinationClass } from '../state/widget-package-state';

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
export type WidgetSourcePrivilegeLabel =
	| 'player-visible'
	| 'shared-with-actors'
	| 'derived'
	| 'unknown'
	| 'dm-only';

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

export type WidgetTaintedBindingResolution =
	| { state: 'available'; value: Record<string, unknown> | null; privilege: WidgetSourcePrivilegeLabel }
	| { state: 'unbound'; privilege: 'unknown' }
	| { state: 'missing'; privilege: 'unknown' }
	| { state: 'hidden'; reason: HiddenBindingReason; privilege: 'unknown' }
	| { state: 'conflicted'; conflictPaths: string[]; privilege: 'unknown' };

export interface WidgetBindingQuery {
	id: string;
	binding: WidgetBinding | null;
	required?: boolean;
}

export interface WidgetBindingSetResolution {
	queries: Record<string, WidgetTaintedBindingResolution>;
	highestPrivilege: WidgetSourcePrivilegeLabel;
}

export interface WidgetTaintedValue<T = unknown> {
	value: T;
	privilege: WidgetSourcePrivilegeLabel;
}

export type WidgetLeakDecision = 'allowed' | 'requires-confirmation';

export interface WidgetLeakRiskWarning {
	widgetInstanceId: string;
	sourcePrivilege: WidgetSourcePrivilegeLabel;
	destinationClass: WidgetOutputDestinationClass;
	message: string;
}

export interface WidgetLeakAudit {
	widgetInstanceId: string;
	sourcePrivilege: WidgetSourcePrivilegeLabel;
	destinationClass: WidgetOutputDestinationClass;
	decision: WidgetLeakDecision;
	confirmedByDm: boolean;
}

export interface WidgetWriteFlowRequest {
	widgetInstanceId: string;
	values: readonly WidgetTaintedValue[];
	destinationClass: WidgetOutputDestinationClass;
	confirmedByDm?: boolean;
}

export interface WidgetWriteFlowResult {
	decision: WidgetLeakDecision;
	warning: WidgetLeakRiskWarning | null;
	audit: WidgetLeakAudit;
}

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

function privilegeForRecord(record: EntityBindingRecord): WidgetSourcePrivilegeLabel {
	if (record.visibility === 'dm-only') return 'dm-only';
	if (record.visibility === 'player-visible') return 'player-visible';
	// Only `shared` reaches here, and resolution already proved this actor may see it.
	return 'shared-with-actors';
}

const SOURCE_PRIVILEGE_RANK: Record<WidgetSourcePrivilegeLabel, number> = {
	'player-visible': 0,
	'shared-with-actors': 1,
	derived: 2,
	unknown: 2,
	'dm-only': 3,
};

const DESTINATION_PRIVILEGE_RANK: Record<WidgetOutputDestinationClass, number> = {
	scene: 1,
	session: 1,
	entity: 1,
	'player-visible-state': 0,
	'player-scene': 0,
	clipboard: 0,
	network: 0,
	'exported-package': 0,
};

export function highestSourcePrivilege(
	labels: readonly WidgetSourcePrivilegeLabel[],
): WidgetSourcePrivilegeLabel {
	if (labels.length === 0) return 'derived';
	return labels.reduce((highest, next) =>
		SOURCE_PRIVILEGE_RANK[next] > SOURCE_PRIVILEGE_RANK[highest] ? next : highest,
	);
}

export function deriveWidgetValue<T>(
	value: T,
	inputs: readonly WidgetTaintedValue[],
): WidgetTaintedValue<T> {
	return { value, privilege: highestSourcePrivilege(inputs.map((input) => input.privilege)) };
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
		if (conflictPaths) {
			// A binding with a field SELECTOR is conflicted only by an ENTITY-level conflict or a conflict
			// on its OWN path — a conflict on an unrelated path (e.g. `data.backstory`) must NOT block this
			// binding (e.g. `combat.hp`). An entity-level binding (no selector) is conflicted by any conflict.
			const relevant = selector
				? conflictPaths.filter((path) => path === '(entity)' || path === selector)
				: conflictPaths;
			if (relevant.length > 0) return { state: 'conflicted', conflictPaths: relevant };
		}
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

export function resolveWidgetBindingWithTaint(
	binding: WidgetBinding | null,
	actor: Actor,
	env: WidgetDataEnvironment = EMPTY_WIDGET_DATA_ENVIRONMENT,
	options: ResolveBindingOptions = {},
): WidgetTaintedBindingResolution {
	const resolution = resolveWidgetBinding(binding, actor, env, options);
	if (resolution.state !== 'available') return { ...resolution, privilege: 'unknown' };
	if (!binding) return { ...resolution, privilege: 'derived' };
	const record = env.entities[entityBindingKey(binding.source.entityType, binding.source.entityId)];
	return { ...resolution, privilege: record ? privilegeForRecord(record) : 'unknown' };
}

export function resolveWidgetBindingSet(
	queries: readonly WidgetBindingQuery[],
	actor: Actor,
	env: WidgetDataEnvironment = EMPTY_WIDGET_DATA_ENVIRONMENT,
): WidgetBindingSetResolution {
	const resolved: Record<string, WidgetTaintedBindingResolution> = {};
	for (const query of queries) {
		resolved[query.id] = resolveWidgetBindingWithTaint(query.binding, actor, env, {
			bindingRequired: query.required,
		});
	}
	const privileges = Object.values(resolved)
		.filter((resolution) => resolution.state === 'available')
		.map((resolution) => resolution.privilege);
	return { queries: resolved, highestPrivilege: highestSourcePrivilege(privileges) };
}

export function evaluateWidgetWriteFlow(request: WidgetWriteFlowRequest): WidgetWriteFlowResult {
	const sourcePrivilege = highestSourcePrivilege(request.values.map((value) => value.privilege));
	const destinationRank = DESTINATION_PRIVILEGE_RANK[request.destinationClass];
	const leakRisk = SOURCE_PRIVILEGE_RANK[sourcePrivilege] > destinationRank;
	const confirmedByDm = request.confirmedByDm === true;
	const decision: WidgetLeakDecision = leakRisk && !confirmedByDm ? 'requires-confirmation' : 'allowed';
	const warning: WidgetLeakRiskWarning | null = leakRisk
		? {
				widgetInstanceId: request.widgetInstanceId,
				sourcePrivilege,
				destinationClass: request.destinationClass,
				message:
					'Widget output may move higher-privilege data into a lower-privilege destination. DM confirmation is required before committing the write.',
			}
		: null;
	return {
		decision,
		warning,
		audit: {
			widgetInstanceId: request.widgetInstanceId,
			sourcePrivilege,
			destinationClass: request.destinationClass,
			decision,
			confirmedByDm,
		},
	};
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
