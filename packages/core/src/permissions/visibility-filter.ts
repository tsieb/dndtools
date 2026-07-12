import { hasDmAuthority } from '../state/permission-state';
import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import { hasGrantedCapability } from './grants';

/**
 * PERM-002 / PERM-003 / PERM-012 — the visibility-filtering engine. This is the SECURITY KEYSTONE of
 * the permission model (Architecture Contract 3, "Axis 1: Visibility"; Contract 1, binding rule 5 —
 * visibility is checked BEFORE a query result or subscription update is exposed to a non-DM GUI).
 *
 * Every non-DM read path MUST pass through {@link filterEntityForActor}. The product's privacy
 * guarantee rests on it. It is pure Processing-Core policy: the GUI consumes the computed/filtered
 * model and MUST NEVER receive unfiltered content to filter client-side (Contract 1 GUI knowledge
 * limits, Cross-Contract Non-Negotiable 2).
 *
 * Three visibility levels (Contract 3 Axis 1):
 *
 *   - `dm-only`       — visible only to the DM.
 *   - `player-visible` — visible to every authenticated player/observer in the session.
 *   - `shared`        — NOT generally readable. Delivered ONLY through a Player View assignment, a
 *                       handout delivery, or a viewer-capable grant. A `shared` surface with none of
 *                       those delivery channels is hidden, exactly like `dm-only`.
 *
 * Granularity + precedence (Contract 3 Axis 1 rules 3-4; PERM-003):
 *
 *   - Visibility is authorable at ENTITY, SECTION, and FIELD granularity.
 *   - MORE SPECIFIC metadata overrides LESS SPECIFIC: field beats section beats entity.
 *   - A HIDDEN ANCESTOR WINS: a visible field inside a hidden section/entity stays hidden, because a
 *     reader who cannot see the container has no surface on which the child could appear. A child
 *     may only ever be NARROWER than (or equal to) what its visible ancestors already permit; it can
 *     never widen access its ancestor denies.
 *
 * Fail-closed (Contract 3 Axis 1 rule 5):
 *
 *   - Absent / unknown / malformed visibility ⇒ `dm-only` (least visible). An entity with no
 *     metadata is invisible to every non-DM, and a denial is indistinguishable from not-found.
 */

/** The three visibility levels. Anything else (absent/unknown) collapses to `dm-only`. */
export type VisibilityLevel = 'dm-only' | 'player-visible' | 'shared';

/** The granularity a visibility rule is authored at, from least to most specific. */
export type VisibilityScope = 'entity' | 'section' | 'field';

/** The single, least-visible default applied when no/unknown metadata exists (fail closed). */
export const DEFAULT_VISIBILITY: VisibilityLevel = 'dm-only';

const VISIBILITY_LEVELS: ReadonlySet<string> = new Set<VisibilityLevel>([
	'dm-only',
	'player-visible',
	'shared',
]);

/**
 * Normalize an arbitrary value to a known visibility level, failing closed to `dm-only` for any
 * absent/unknown/malformed input. This is the single coercion point so adversarial sidecar metadata
 * (from sync/storage) can never inject a more-permissive value than the three known levels.
 */
export function normalizeVisibilityLevel(value: unknown): VisibilityLevel {
	return typeof value === 'string' && VISIBILITY_LEVELS.has(value)
		? (value as VisibilityLevel)
		: DEFAULT_VISIBILITY;
}

/**
 * Granular visibility metadata for one entity. Visibility for an entity is authored as a default
 * entity-level level plus optional per-section and per-field overrides. `sharedWith` records the
 * actor ids a `shared` surface is explicitly delivered to (player-view assignment / handout
 * delivery / viewer grant are all reduced to "delivered to actor"); it applies at the granularity it
 * is attached to.
 *
 * Stored with the entity or as a namespaced sidecar metadata record that is applied BEFORE reads
 * (Contract 3 Axis 1 rule 6) — never only in UI state.
 */
export interface VisibilityRule {
	level: VisibilityLevel;
	/** Actor ids a `shared` surface at this granularity is delivered to. Ignored for other levels. */
	sharedWith?: ActorId[];
}

export interface EntityVisibilityMetadata {
	entityType: string;
	entityId: string;
	/** Entity-level default. Absent ⇒ `dm-only` (fail closed). */
	entity?: VisibilityRule;
	/** Section-level overrides keyed by section id. */
	sections?: Record<string, VisibilityRule>;
	/** Field-level overrides keyed by field path (e.g. `character.data.dmNotes`). */
	fields?: Record<string, VisibilityRule>;
	/**
	 * Field-to-section attribution: which section a field belongs to. A field with no entry here is
	 * attributed to the entity directly. Used so a hidden SECTION hides the fields within it even
	 * when the field has no field-level rule of its own.
	 */
	fieldSections?: Record<string, string>;
}

/** A target within an entity to evaluate visibility for. */
export interface VisibilityTarget {
	/** A named section, when evaluating a section or a field that lives in a section. */
	sectionId?: string;
	/** A structured field path, when evaluating a single field. */
	fieldPath?: string;
}

/** Why a non-DM actor cannot see a surface. Mirrors the binding-layer hidden reasons. */
export type VisibilityDenialReason =
	| 'dm-only'
	| 'not-shared'
	| 'hidden-ancestor'
	| 'unknown-actor';

export type VisibilityDecision =
	| { visible: true }
	| { visible: false; reason: VisibilityDenialReason; scope: VisibilityScope };

/**
 * Resolve the effective visibility RULE for a target, applying field > section > entity precedence.
 * Returns the rule AND the scope it came from, so callers can report which granularity decided.
 * A field is attributed to its section (via an explicit field-level rule, the `fieldSections`
 * mapping, or none) so section visibility flows down to its fields.
 */
function resolveEffectiveRule(
	meta: EntityVisibilityMetadata,
	target: VisibilityTarget,
): { rule: VisibilityRule; scope: VisibilityScope } {
	const entityRule: VisibilityRule = meta.entity ?? { level: DEFAULT_VISIBILITY };

	// Most specific first: an explicit field rule wins over everything narrower-or-equal.
	if (target.fieldPath !== undefined) {
		const fieldRule = meta.fields?.[target.fieldPath];
		if (fieldRule) return { rule: fieldRule, scope: 'field' };
		// No field rule: fall through to the field's owning section (explicit target section, then
		// the field->section attribution map), then the entity.
		const owningSection = target.sectionId ?? meta.fieldSections?.[target.fieldPath];
		if (owningSection !== undefined) {
			const sectionRule = meta.sections?.[owningSection];
			if (sectionRule) return { rule: sectionRule, scope: 'section' };
		}
		return { rule: entityRule, scope: 'entity' };
	}

	if (target.sectionId !== undefined) {
		const sectionRule = meta.sections?.[target.sectionId];
		if (sectionRule) return { rule: sectionRule, scope: 'section' };
		return { rule: entityRule, scope: 'entity' };
	}

	return { rule: entityRule, scope: 'entity' };
}

/**
 * Decide whether a single visibility RULE is satisfied for an actor. Pure per-rule check (no
 * ancestry). The DM is always visible. `shared` requires explicit delivery: membership in
 * `sharedWith` OR a viewer-capable grant on the entity (player-view/handout delivery is recorded as
 * `sharedWith` membership by the delivery layer).
 */
function ruleVisibleToActor(
	rule: VisibilityRule,
	actor: Actor,
	meta: EntityVisibilityMetadata,
	permission: PermissionState | undefined,
): { visible: true } | { visible: false; reason: VisibilityDenialReason } {
	const level = normalizeVisibilityLevel(rule.level);
	if (level === 'player-visible') return { visible: true };
	if (level === 'dm-only') return { visible: false, reason: 'dm-only' };

	// `shared`: delivered only through an explicit channel.
	if ((rule.sharedWith ?? []).includes(actor.id)) return { visible: true };
	const hasViewerGrant = permission
		? hasGrantedCapability(permission, actor, meta.entityType, meta.entityId, 'viewer')
		: false;
	return hasViewerGrant ? { visible: true } : { visible: false, reason: 'not-shared' };
}

/**
 * Evaluate whether a target (entity / section / field) is visible to an actor. This is the precise
 * precedence engine: field overrides section overrides entity, but a HIDDEN ANCESTOR WINS — a more
 * specific re-grant can only narrow, never widen, what an ancestor already permits.
 *
 * Order:
 *   1. DM ⇒ always visible. Unknown/unauthenticated actor ⇒ hidden (`unknown-actor`).
 *   2. Evaluate the ENTITY rule. If the entity is hidden, the whole target is hidden regardless of
 *      any narrower re-grant (`hidden-ancestor` for section/field targets).
 *   3. For a field target, evaluate the owning SECTION rule. A hidden section hides its fields.
 *   4. Evaluate the MOST SPECIFIC rule for the target. It can narrow access further, but only
 *      applies once every ancestor already permits the actor.
 */
export function evaluateVisibility(
	meta: EntityVisibilityMetadata,
	target: VisibilityTarget,
	actor: Actor | undefined,
	permission?: PermissionState,
): VisibilityDecision {
	if (!actor) return { visible: false, reason: 'unknown-actor', scope: 'entity' };
	if (hasDmAuthority(actor.role)) return { visible: true };

	// 1. Entity ancestor. A hidden entity hides everything below it.
	const entityRule: VisibilityRule = meta.entity ?? { level: DEFAULT_VISIBILITY };
	const entityCheck = ruleVisibleToActor(entityRule, actor, meta, permission);
	if (!entityCheck.visible) {
		// For a narrower target, the cause is a hidden ancestor; for the entity itself, the direct
		// reason. Either way nothing below a hidden entity is reachable.
		const targetingNarrower = target.sectionId !== undefined || target.fieldPath !== undefined;
		return {
			visible: false,
			reason: targetingNarrower ? 'hidden-ancestor' : entityCheck.reason,
			scope: 'entity',
		};
	}

	// 2. Section ancestor (for section or field targets that live in a section).
	const owningSection =
		target.sectionId ??
		(target.fieldPath !== undefined ? meta.fieldSections?.[target.fieldPath] : undefined);
	if (owningSection !== undefined) {
		const sectionRule = meta.sections?.[owningSection];
		if (sectionRule) {
			const sectionCheck = ruleVisibleToActor(sectionRule, actor, meta, permission);
			if (!sectionCheck.visible) {
				// A field below a hidden section is hidden by its ancestor; the section itself reports
				// its own reason.
				return {
					visible: false,
					reason: target.fieldPath !== undefined ? 'hidden-ancestor' : sectionCheck.reason,
					scope: 'section',
				};
			}
		}
	}

	// 3. Most specific rule for the exact target. Ancestors already permit; this can only narrow.
	const { rule, scope } = resolveEffectiveRule(meta, target);
	const check = ruleVisibleToActor(rule, actor, meta, permission);
	if (!check.visible) return { visible: false, reason: check.reason, scope };
	return { visible: true };
}

/** Convenience: is the ENTITY itself visible to an actor (no section/field target)? */
export function isEntityVisibleToActor(
	meta: EntityVisibilityMetadata,
	actor: Actor | undefined,
	permission?: PermissionState,
): boolean {
	return evaluateVisibility(meta, {}, actor, permission).visible;
}

/**
 * A content payload to filter: the entity's section ids and field map. The filter never inspects
 * field VALUES for policy — it only decides which keys survive — so it is shape-agnostic and cannot
 * leak through value introspection.
 */
export interface FilterableContent {
	/** Section ids present in the content (markdown sections / structured content sections). */
	sectionIds?: string[];
	/** Field path → value. Keys are filtered by field/section/entity visibility. */
	fields?: Record<string, unknown>;
}

/** The filtered surface returned to a non-DM actor. */
export interface FilteredContent {
	/** True only when the ENTITY itself is visible. When false, NOTHING is returned (fail closed). */
	visible: boolean;
	/** Why the entity is hidden, when `visible` is false. */
	hiddenReason?: VisibilityDenialReason;
	/** Section ids the actor may see, in input order. Empty when the entity is hidden. */
	visibleSectionIds: string[];
	/** Field path → value, only for fields the actor may see. Empty when the entity is hidden. */
	visibleFields: Record<string, unknown>;
	/** Section ids that were redacted (present in input, hidden from actor). */
	redactedSectionIds: string[];
	/** Field paths that were redacted (present in input, hidden from actor). */
	redactedFieldPaths: string[];
}

const HIDDEN_RESULT = (reason: VisibilityDenialReason): FilteredContent => ({
	visible: false,
	hiddenReason: reason,
	visibleSectionIds: [],
	visibleFields: {},
	redactedSectionIds: [],
	redactedFieldPaths: [],
});

/**
 * THE choke-point. Filter an entity's content for an actor, returning ONLY what the actor may see.
 * This is the single sanctioned non-DM read path: every non-DM query, subscription, sync stream,
 * MCP response, and widget binding resolution MUST produce its actor-facing payload through this
 * function (or the binding resolver / scene query that delegate to the same policy).
 *
 *   - DM ⇒ receives everything (no redaction).
 *   - A non-DM whose entity is hidden ⇒ receives the empty hidden result. No section ids, no field
 *     keys, no counts — indistinguishable from not-found, so existence is not probeable by id.
 *   - A non-DM whose entity is visible ⇒ receives only the sections and fields that survive
 *     field>section>entity precedence with hidden-ancestor-wins. Redacted keys are reported
 *     separately (for the DM/diagnostics), never mixed into the actor payload.
 *
 * Fail closed: absent/unknown metadata ⇒ entity is `dm-only`, so a non-DM receives the empty hidden
 * result. A malformed visibility value is coerced to `dm-only` before evaluation.
 */
export function filterEntityForActor(
	meta: EntityVisibilityMetadata,
	content: FilterableContent,
	actor: Actor | undefined,
	permission?: PermissionState,
): FilteredContent {
	if (!actor) return HIDDEN_RESULT('unknown-actor');

	const entityDecision = evaluateVisibility(meta, {}, actor, permission);
	if (!entityDecision.visible) return HIDDEN_RESULT(entityDecision.reason);

	const isDm = hasDmAuthority(actor.role);
	const inputSections = content.sectionIds ?? [];
	const inputFields = content.fields ?? {};

	if (isDm) {
		return {
			visible: true,
			visibleSectionIds: [...inputSections],
			visibleFields: { ...inputFields },
			redactedSectionIds: [],
			redactedFieldPaths: [],
		};
	}

	const visibleSectionIds: string[] = [];
	const redactedSectionIds: string[] = [];
	for (const sectionId of inputSections) {
		if (evaluateVisibility(meta, { sectionId }, actor, permission).visible) {
			visibleSectionIds.push(sectionId);
		} else {
			redactedSectionIds.push(sectionId);
		}
	}

	const visibleFields: Record<string, unknown> = {};
	const redactedFieldPaths: string[] = [];
	for (const fieldPath of Object.keys(inputFields)) {
		if (evaluateVisibility(meta, { fieldPath }, actor, permission).visible) {
			visibleFields[fieldPath] = inputFields[fieldPath];
		} else {
			redactedFieldPaths.push(fieldPath);
		}
	}

	return {
		visible: true,
		visibleSectionIds,
		visibleFields,
		redactedSectionIds,
		redactedFieldPaths,
	};
}
