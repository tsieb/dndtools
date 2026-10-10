import {
	kindWordFor,
	type ActorWikilinkTarget,
	type ContentItemView,
	type TypedRelationEdge,
} from '@dndtools/core';

/**
 * Campaign's row shapes and the pure readers that pull typed values out of a role-projected
 * Vault Object's frontmatter fields.
 *
 * Extracted from `Campaign.tsx` unchanged so the screen stays under its RC-STB-2.7 line baseline
 * after RC-UX-3.1 placed the Factions visibility HelpTip; `campaignVocab.ts` holds the option tables.
 */

/** First non-heading body line, marker-stripped — the one-line summary for list cards. */
export function bodySummary(body: string, fallback: string): string {
	const line = body
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l && !l.startsWith('#'));
	if (!line) return fallback;
	return line
		.replace(/^[>\-*]\s+/, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.slice(0, 180);
}

export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export const strArray = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((entry): entry is string => typeof entry === 'string') : [];

/** A quest objective as declared by the `quest` subtype schema: `{id, text, done}`, in order. */
export interface QuestObjective {
	id: string;
	text: string;
	done: boolean;
}

export const objectiveArray = (v: unknown): QuestObjective[] =>
	Array.isArray(v)
		? v.filter(
				(entry): entry is QuestObjective =>
					!!entry &&
					typeof entry === 'object' &&
					typeof (entry as QuestObjective).id === 'string' &&
					typeof (entry as QuestObjective).text === 'string' &&
					typeof (entry as QuestObjective).done === 'boolean',
			)
		: [];

/** A quest Vault Object row: the raw item view + its role-projected tracker fields. */
export interface QuestRow {
	view: ContentItemView;
	fields: Record<string, unknown>;
}

/** A faction Vault Object row: the raw item view + its role-projected dossier fields. */
export interface FactionRow {
	view: ContentItemView;
	fields: Record<string, unknown>;
}

/**
 * RC-KNW-6.6 — one card's view of the typed relationship graph: the edges with this entity at either
 * end, from the actor-filtered `getTypedRelationshipEdgesForActor` read (so an edge whose other end the
 * actor cannot see never arrives here).
 */
export function edgesTouching(entityId: string, edges: TypedRelationEdge[]): TypedRelationEdge[] {
	return edges.filter((edge) => edge.sourceId === entityId || edge.targetId === entityId);
}

/** A note that links to a card's entity, newest first, with the route that opens it. */
export interface Mention {
	id: string;
	title: string;
	route: string;
}

/**
 * The visible notes and story objects whose body links to `backlinks`' target, newest edit first. Only
 * content-backed sources count as "notes"; a character or map description that links here is not one.
 */
export function mentionsOf(
	backlinks: readonly { sourceId: string; sourceTitle: string }[],
	candidates: ReadonlyMap<string, ActorWikilinkTarget>,
	updatedAt: (id: string) => string,
): Mention[] {
	return backlinks
		.flatMap((link) => {
			const source = candidates.get(link.sourceId);
			return source?.storage === 'content'
				? [{ id: link.sourceId, title: link.sourceTitle, route: source.route }]
				: [];
		})
		.sort(
			(a, b) => updatedAt(b.id).localeCompare(updatedAt(a.id)) || a.title.localeCompare(b.title),
		);
}

/**
 * RC-KNW-6.6 — an NPC's story home: the first faction and the first place (a point of interest, else a
 * map) it has a relationship with, in either direction. Edges arrive sorted, so the pick is stable.
 */
export function npcStoryHome(
	npcId: string,
	edges: TypedRelationEdge[],
	candidates: ReadonlyMap<string, ActorWikilinkTarget>,
): { faction: string | null; place: string | null } {
	const others = edgesTouching(npcId, edges).map((edge) =>
		edge.sourceId === npcId
			? { id: edge.targetId, title: edge.targetTitle }
			: { id: edge.sourceId, title: edge.sourceTitle },
	);
	const first = (...words: string[]) =>
		words
			.map((word) =>
				others.find((other) => {
					const kind = candidates.get(other.id)?.kind;
					return kind !== undefined && kindWordFor(kind) === word;
				}),
			)
			.find(Boolean)?.title ?? null;
	return { faction: first('faction'), place: first('place', 'map') };
}
