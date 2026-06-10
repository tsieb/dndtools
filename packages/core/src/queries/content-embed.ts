import type { PermissionState } from '../state/permission-state';
import type { ContentEmbed, ContentItem, VaultContentState } from '../state/content';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	contentItemVisibilityMetadata,
	isLiveContentItem,
} from '../state/content';
import { filterEntityForActor } from '../permissions/visibility-filter';
import {
	EMPTY_WIDGET_DATA_ENVIRONMENT,
	entityBindingKey,
	type EntityBindingRecord,
	type EntityVisibility,
	type WidgetDataEnvironment,
} from './binding';
import { contentFieldPath } from './content-query';

/**
 * CONTENT-010 — THE actor-filtered EMBED RESOLVER. This is the SECURITY CRUX of the epic: an embed is a
 * REFERENCE, not a copy (`state/content.ts` `ContentEmbed`). The host note stores only `targetItemId` +
 * which projection; the embedded content is RESOLVED HERE, AT READ, against the LIVE target through the
 * SAME PERM visibility filter (`filterEntityForActor`) — so it always reflects:
 *
 *   1. the target's CURRENT data (the host never goes stale — CONTENT-010 AC1), and
 *   2. the VIEWER's OWN permission to the TARGET, NOT the host note's visibility (CONTENT-010 AC2).
 *
 * Therefore a player viewing a note that embeds a `dm-only` object/section sees the generic, fail-closed
 * `unavailable` placeholder — NEVER the hidden content, the target title, or even that the target exists.
 * This mirrors the MAP-008 hidden-child → generic-unavailable contract exactly (reference + transform,
 * hidden child resolves unavailable, NO cloning). Pure, deterministic Processing-Core policy: the GUI
 * renders the resolved model and never touches the raw target.
 */

/** Why an embed resolved to the `unavailable` placeholder. All collapse to the SAME placeholder UI; the
 *  reason is for the DM/diagnostics only and never widens what a non-DM learns. */
export type ContentEmbedUnavailableReason =
	| 'target-missing' // the target item does not exist or is tombstoned (a broken reference).
	| 'target-hidden' // the actor cannot see the target entity (visibility fail-closed).
	| 'section-hidden' // the embedded `note-section` is not visible to the actor.
	| 'section-missing'; // the embedded `note-section` names a section the target does not declare.

/** A resolved object-card embed: the target's VISIBLE fields (DM-only fields already omitted). */
export interface ResolvedObjectCardEmbed {
	kind: 'object-card';
	state: 'available';
	embedId: string;
	targetItemId: string;
	title: string;
	/** Field key → value, only for fields the actor may see in the target. */
	fields: Record<string, unknown>;
}

/** A resolved note-section embed: ONE visible section of the target note's body. */
export interface ResolvedNoteSectionEmbed {
	kind: 'note-section';
	state: 'available';
	embedId: string;
	targetItemId: string;
	title: string;
	sectionId: string;
}

/** A resolved render-block embed: the target's whole VISIBLE render (title + visible sections/fields). */
export interface ResolvedRenderBlockEmbed {
	kind: 'render-block';
	state: 'available';
	embedId: string;
	targetItemId: string;
	title: string;
	visibleSectionIds: string[];
	fields: Record<string, unknown>;
}

/**
 * The generic, NON-LEAKING fail-closed placeholder. It carries NO target id, title, or content — only
 * the host's embed id (so the GUI can render the placeholder in place) and a DM/diagnostic reason. A
 * non-DM viewer learns nothing about the target beyond "this embed is unavailable to you".
 */
export interface UnavailableEmbed {
	state: 'unavailable';
	embedId: string;
	/** The embed kind the host declared (safe to expose — it is the host's own data, not the target's). */
	kind: ContentEmbed['kind'];
	/** Why it is unavailable. For a non-DM this is always coarsened so existence is not probeable. */
	reason: ContentEmbedUnavailableReason;
}

export type ResolvedContentEmbed =
	| ResolvedObjectCardEmbed
	| ResolvedNoteSectionEmbed
	| ResolvedRenderBlockEmbed
	| UnavailableEmbed;

function unavailable(
	embed: ContentEmbed,
	reason: ContentEmbedUnavailableReason,
	isDm: boolean,
): UnavailableEmbed {
	// For a non-DM, coarsen the reason so a player cannot distinguish "hidden" from "missing" — both are
	// indistinguishable from not-found, so target existence is never probeable through the embed.
	return {
		state: 'unavailable',
		embedId: embed.id,
		kind: embed.kind,
		reason: isDm ? reason : 'target-hidden',
	};
}

/**
 * CONTENT-010 — resolve ONE embed for one actor against the LIVE target. Fails closed at every step:
 * an unknown actor, a missing/tombstoned target, a hidden target entity, or a hidden/absent embedded
 * section all resolve to the generic {@link UnavailableEmbed} placeholder with ZERO target leak.
 *
 * Never clones: the host embed carried only a reference; this reads the target's CURRENT record and
 * runs it through {@link filterEntityForActor}, so the rendered embed reflects the target's live data
 * and the viewer's own permission to the target — exactly what the host note's own visibility never
 * grants the viewer.
 */
export function resolveContentEmbedForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	embed: ContentEmbed,
): ResolvedContentEmbed {
	const actor = permissions.actors[actorId];
	// An unknown actor sees nothing. Treat as a non-DM for reason coarsening.
	if (!actor) return unavailable(embed, 'target-hidden', false);
	const isDm = actor.role === 'dm';

	const target: ContentItem | undefined = content.items[embed.targetItemId];
	if (!target || !isLiveContentItem(target)) {
		return unavailable(embed, 'target-missing', isDm);
	}

	const meta = contentItemVisibilityMetadata(target);
	const declaredSectionIds = embed.kind === 'note-section' && embed.sectionId !== undefined
		? [embed.sectionId]
		: [];
	const fieldPaths = Object.fromEntries(
		Object.entries(target.fields).map(([key, value]) => [contentFieldPath(key), value]),
	);
	const filtered = filterEntityForActor(
		meta,
		{ sectionIds: declaredSectionIds, fields: fieldPaths },
		actor,
		permissions,
	);
	// Target entity hidden ⇒ generic unavailable, no leak (CONTENT-010 AC2).
	if (!filtered.visible) return unavailable(embed, 'target-hidden', isDm);

	const visibleFields: Record<string, unknown> = {};
	for (const [path, value] of Object.entries(filtered.visibleFields)) {
		visibleFields[path.startsWith('fields.') ? path.slice('fields.'.length) : path] = value;
	}

	if (embed.kind === 'note-section') {
		const sectionId = embed.sectionId;
		if (sectionId === undefined) return unavailable(embed, 'section-missing', isDm);
		// The section is visible iff it survived the filter. A `dm-only` section under a visible entity is
		// absent from `visibleSectionIds` for a player ⇒ generic unavailable (no section content leaks).
		if (!filtered.visibleSectionIds.includes(sectionId)) {
			return unavailable(embed, 'section-hidden', isDm);
		}
		return {
			kind: 'note-section',
			state: 'available',
			embedId: embed.id,
			targetItemId: target.id,
			title: target.title,
			sectionId,
		};
	}

	if (embed.kind === 'object-card') {
		return {
			kind: 'object-card',
			state: 'available',
			embedId: embed.id,
			targetItemId: target.id,
			title: target.title,
			fields: visibleFields,
		};
	}

	return {
		kind: 'render-block',
		state: 'available',
		embedId: embed.id,
		targetItemId: target.id,
		title: target.title,
		visibleSectionIds: filtered.visibleSectionIds,
		fields: visibleFields,
	};
}

/**
 * CONTENT-010 — resolve EVERY embed of a HOST item for one actor. The host item must itself be visible
 * to the actor (its own entity visibility), otherwise the whole host — and therefore its embeds — is
 * unreachable and an empty list is returned (fail closed). When the host is visible, each embed is
 * resolved INDEPENDENTLY against its own target, so the host's visibility never widens (or narrows) what
 * the viewer may see in the target: a `player-visible` host that embeds a `dm-only` target shows the
 * generic unavailable placeholder for that embed (AC2), and vice-versa.
 *
 * Returns embeds in host-declared order. The placeholders are interleaved with the available embeds so
 * the GUI renders the host's content layout intact (a redacted embed is a visible "unavailable" slot,
 * not a silently dropped one).
 */
export function resolveContentEmbedsForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	hostItemId: string,
): ResolvedContentEmbed[] {
	const actor = permissions.actors[actorId];
	if (!actor) return [];
	const host = content.items[hostItemId];
	if (!host || !isLiveContentItem(host)) return [];
	// The host's OWN entity visibility gates whether its content (and embeds) are reachable at all.
	const hostFiltered = filterEntityForActor(
		contentItemVisibilityMetadata(host),
		{},
		actor,
		permissions,
	);
	if (!hostFiltered.visible) return [];
	return host.embeds.map((embed) =>
		resolveContentEmbedForActor(content, permissions, actorId, embed),
	);
}

/**
 * CONTENT-010 — build the {@link WidgetDataEnvironment} for content items, so an ENTITY-BACKED Scene
 * widget bound to a `content-item` resolves through the EXISTING widget binding model
 * (`queries/binding.ts` + `getSceneForActor`) — the same `hidden`/`missing`/`conflicted` states, the
 * same actor-scoped visibility, NO parallel embed system in Scene context (Contract 4: "a scene widget
 * is an embed in scene context"). A scene widget bound to a `dm-only` content item resolves to the
 * `hidden` placeholder for a player exactly as a note embed resolves to `unavailable` — both fail closed.
 *
 * Each live item becomes one {@link EntityBindingRecord}: its entity-level visibility + `sharedWith`, its
 * DM-only field paths as `hiddenSelectors` (so a field-level `dm-only` rule redacts the value for a
 * non-DM), and its visible field values. `knownEntityKeys` lists exactly the live items, so a binding to
 * a deleted/tombstoned item resolves to `missing` (not a stale value). Pure + deterministic.
 */
export function buildContentWidgetDataEnvironment(
	content: VaultContentState,
): WidgetDataEnvironment {
	const entities: Record<string, EntityBindingRecord> = {};
	const knownEntityKeys: string[] = [];
	for (const item of Object.values(content.items)) {
		if (!isLiveContentItem(item)) continue;
		const key = entityBindingKey(CONTENT_ITEM_ENTITY_TYPE, item.id);
		knownEntityKeys.push(key);
		// Field-level `dm-only` rules become hidden selectors so a non-DM never receives those values
		// through the binding (the binding resolver deletes them). Section ancestry is handled at the
		// entity/section level; a field hidden by a dm-only field rule is the binding-relevant case.
		const hiddenSelectors = Object.entries(item.fieldVisibility)
			.filter(([, rule]) => rule.level === 'dm-only')
			.map(([path]) => (path.startsWith('fields.') ? path.slice('fields.'.length) : path));
		entities[key] = {
			entityType: CONTENT_ITEM_ENTITY_TYPE,
			entityId: item.id,
			visibility: item.visibility as EntityVisibility,
			...(item.visibility === 'shared' ? { sharedWith: [...item.sharedWith] } : {}),
			...(hiddenSelectors.length > 0 ? { hiddenSelectors } : {}),
			value: { ...item.fields },
		};
	}
	return {
		...EMPTY_WIDGET_DATA_ENVIRONMENT,
		entities,
		knownEntityKeys,
	};
}
