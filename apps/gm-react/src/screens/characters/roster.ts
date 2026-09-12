import {
	hasDmAuthority,
	hasGrantedCapability,
	type CharacterView,
	type PermissionState,
	type SessionState,
} from '@dndtools/core';

/* RC-CHR-5.3 — the roster's information scent: everything a card or filter shows that the
 * `CharacterView` does not carry directly, read from real core state and never invented. Pure, so the
 * card, the filters and the unit tests all agree on what "owner", "tag" and "last played" mean. */

export const OWNER_ANY = 'any';
/** Filter value for characters no player owns (NPCs, monsters, unassigned PCs). */
export const OWNER_NONE = 'none';
export const TAG_ANY = 'any';

export interface RosterOwner {
	id: string;
	name: string;
}

export type LastPlayed = { live: true } | { live: false; at: string };

export interface RosterEntry {
	view: CharacterView;
	className: string | null;
	level: number | null;
	tags: string[];
	owners: RosterOwner[];
	lastPlayed: LastPlayed | null;
}

export interface RosterFilter {
	kind: string;
	owner: string;
	tag: string;
}

/** The class the builder stored on `data.class`, or null. */
export function classOf(view: CharacterView): string | null {
	const raw = view.data.class;
	return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/** The level on `data.level` (the key core advancement reads). A PC with none yet is level 1, the
 *  same default `characterLevel` applies; other kinds show no level unless one was set. */
export function levelOf(view: CharacterView): number | null {
	const raw = view.data.level;
	const n =
		typeof raw === 'number'
			? raw
			: typeof raw === 'string' && raw.trim() !== ''
				? Number(raw)
				: NaN;
	if (Number.isFinite(n) && n >= 1) return Math.trunc(n);
	return view.kind === 'pc' ? 1 : null;
}

/** De-duplicate (case-insensitively, first spelling wins) and drop blanks. */
export function normalizeTags(raw: readonly unknown[]): string[] {
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const part of raw) {
		if (typeof part !== 'string') continue;
		const tag = part.trim();
		const key = tag.toLowerCase();
		if (!tag || seen.has(key)) continue;
		seen.add(key);
		tags.push(tag);
	}
	return tags;
}

/** Tags on `data.tags`. `character.edit-field` stores every `data.*` field as a string, so the
 *  canonical form is comma-separated; an array (an imported record) is read too. */
export function tagsOf(view: CharacterView): string[] {
	const raw = view.data.tags;
	if (Array.isArray(raw)) return normalizeTags(raw);
	return typeof raw === 'string' ? normalizeTags(raw.split(',')) : [];
}

/** The storage form `tagsOf` reads back. */
export function serializeTags(tags: readonly string[]): string {
	return normalizeTags(tags).join(', ');
}

/** The player actors holding a live `owner` grant on the character (PERM-013). DM authority is left
 *  out: a DM satisfies every capability check, so listing them on every card would say nothing. */
export function ownersOf(
	permissions: PermissionState,
	characterId: string,
	now?: string,
): RosterOwner[] {
	return Object.values(permissions.actors)
		.filter((actor) => !hasDmAuthority(actor.role))
		.filter((actor) =>
			hasGrantedCapability(permissions, actor, 'character', characterId, 'owner', now),
		)
		.map((actor) => ({ id: actor.id, name: actor.displayName || actor.id }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** When each character last took part in a session: the newest archive whose combat included it or
 *  whose recap captured it as changed. A combatant in the running combat of a live session is `live`.
 *  Characters that never appeared are absent from the map. */
export function lastPlayedIndex(
	session: Pick<SessionState, 'archives' | 'workflow' | 'combat'>,
): Map<string, LastPlayed> {
	const index = new Map<string, LastPlayed>();
	const note = (characterId: string | null | undefined, at: string) => {
		if (!characterId) return;
		const prior = index.get(characterId);
		if (prior && (prior.live || prior.at >= at)) return;
		index.set(characterId, { live: false, at });
	};
	for (const archive of Object.values(session.archives ?? {})) {
		for (const combatant of Object.values(archive.combat?.combatants ?? {})) {
			note(combatant.characterId, archive.archivedAt);
		}
		for (const change of archive.recap?.changes ?? []) {
			if (change.entityType === 'character') note(change.entityId, archive.archivedAt);
		}
	}
	if (session.workflow === 'active' && session.combat?.status === 'running') {
		for (const combatant of Object.values(session.combat.combatants)) {
			if (combatant.characterId) index.set(combatant.characterId, { live: true });
		}
	}
	return index;
}

export function buildRosterEntries(
	views: readonly CharacterView[],
	permissions: PermissionState,
	session: Pick<SessionState, 'archives' | 'workflow' | 'combat'>,
): RosterEntry[] {
	const played = lastPlayedIndex(session);
	return views.map((view) => ({
		view,
		className: classOf(view),
		level: levelOf(view),
		tags: tagsOf(view),
		owners: ownersOf(permissions, view.id),
		lastPlayed: played.get(view.id) ?? null,
	}));
}

/** The kind tabs: "NPCs" also holds sidekicks (both are DM-run companions of the party). */
export function matchesKind(view: CharacterView, kind: string): boolean {
	if (kind === 'all') return true;
	if (kind === 'npc') return view.kind === 'npc' || view.kind === 'sidekick';
	return view.kind === kind;
}

export function matchesRosterFilter(entry: RosterEntry, filter: RosterFilter): boolean {
	if (!matchesKind(entry.view, filter.kind)) return false;
	if (filter.owner === OWNER_NONE && entry.owners.length > 0) return false;
	if (
		filter.owner !== OWNER_ANY &&
		filter.owner !== OWNER_NONE &&
		!entry.owners.some((owner) => owner.id === filter.owner)
	) {
		return false;
	}
	if (filter.tag !== TAG_ANY) {
		const wanted = filter.tag.toLowerCase();
		if (!entry.tags.some((tag) => tag.toLowerCase() === wanted)) return false;
	}
	return true;
}

/** Every owner and tag present on the given entries, for the filter menus. Sorted for a stable menu. */
export function rosterFacets(entries: readonly RosterEntry[]): {
	owners: RosterOwner[];
	tags: string[];
} {
	const owners = new Map<string, RosterOwner>();
	const tags = new Map<string, string>();
	for (const entry of entries) {
		for (const owner of entry.owners) owners.set(owner.id, owner);
		for (const tag of entry.tags)
			if (!tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag);
	}
	return {
		owners: [...owners.values()].sort((a, b) => a.name.localeCompare(b.name)),
		tags: [...tags.values()].sort((a, b) => a.localeCompare(b)),
	};
}

/**
 * Where an arrow/Home/End key moves focus in a wrapped card grid, or null when it goes nowhere.
 * Movement stops at the edges rather than wrapping (the WAI-ARIA grid convention). `columns` is
 * measured from layout by the caller, because the `auto-fill` track count changes with the viewport.
 */
export function gridTargetIndex(
	key: string,
	index: number,
	count: number,
	columns: number,
): number | null {
	if (count === 0) return null;
	const cols = Math.max(1, columns);
	let next: number;
	switch (key) {
		case 'ArrowRight':
			next = index + 1;
			break;
		case 'ArrowLeft':
			next = index - 1;
			break;
		case 'ArrowDown':
			next = index + cols;
			break;
		case 'ArrowUp':
			next = index - cols;
			break;
		case 'Home':
			next = 0;
			break;
		case 'End':
			next = count - 1;
			break;
		default:
			return null;
	}
	if (next < 0 || next >= count || next === index) return null;
	return next;
}
