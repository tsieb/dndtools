import type { ActorId } from '../state/ids';
import type { CalendarDateFormat } from '../state/calendar';
import type { SearchContentType } from '../state/saved-search';
import {
	searchVaultForActor,
	type SearchHit,
	type SearchResult,
} from './search-query';
import {
	listPaletteCommands,
	resolvePaletteCommand,
	type PaletteCommand,
	type ResolvedPaletteCommand,
} from './command-availability';
import type { CommandActionContext, CommandActionStateView } from './command-actions';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { PermissionState } from '../state/permission-state';
import type { SessionState } from '../state/session-state';

/**
 * SRCH-002 — the QUICK SWITCHER: TITLE-FIRST navigation across VISIBLE content AND COMMANDS, fail closed.
 *
 * The quick switcher is a fast, actor-filtered NAVIGATION + COMMAND palette. It is NOT a second index and
 * NOT a second command registry — it COMPOSES the two surfaces the rest of SRCH/CMD already own:
 *
 *   - NAVIGATION entries come from {@link searchVaultForActor} (SRCH-001/003), the SINGLE actor-filtered
 *     visible search index over notes, structured objects, map POIs, handouts, and session artifacts. Every
 *     candidate is already visibility-filtered at its source, so a `dm-only`/hidden target is never even a
 *     candidate (Cross-Contract Non-Negotiable 2). The switcher re-uses that read's title-first scoring:
 *     a TITLE match outranks a body/relationship-only match (SRCH-002 AC1).
 *   - COMMAND entries come from {@link listPaletteCommands} (CMD-008/NAV-008/NAV-010), the SINGLE
 *     actor-filtered command availability API the command palette and primary nav already consume. That
 *     surface fails closed: a player NEVER receives a DM-only command, a hidden scene/section command, or a
 *     command whose label/target would reveal hidden content — those entries are ABSENT, not disabled
 *     (SRCH-002 AC3). An `unavailable` command that IS shown (a valid-but-blocked DM command) carries only a
 *     generic, non-leaking reason and is rejected by the core on resolve, so it can never be invoked.
 *
 * The Processing Core owns result resolution, TITLE-FIRST RANKING, and command eligibility. The GUI renders
 * the computed entries and either navigates to a route or dispatches the IDENTICAL command a visible control
 * dispatches — it re-derives NO visibility, NO ranking, and NO command policy (Architecture Contract 1).
 *
 * STALE-SELECTION SAFETY (SRCH-002 AC2): an entry is resolved through {@link resolveQuickSwitcherEntry} from
 * its OWN current descriptor, never from a remembered index. When the query changes the entry list is
 * recomputed; resolving the current selection re-checks command availability and required inputs, so a
 * selection that has gone unavailable resolves to `null` rather than firing a stale command.
 *
 * Pure + deterministic: the same (state, actor, query) always yields the same ordered entry list. An
 * unknown/unauthenticated actor receives an empty list from BOTH composed surfaces (fail closed).
 */

/** Which composed surface an entry came from. Navigation entries open content; command entries act. */
export type QuickSwitcherEntryKind = 'navigation' | 'command';

/**
 * One quick-switcher NAVIGATION entry: a visible content/POI/handout/session-artifact hit the actor may
 * open. The `target` carries the content type + the route the GUI navigates to (route-shape is GUI-facing
 * navigation metadata, exactly as the command palette's navigation entries carry a route).
 */
export interface QuickSwitcherNavigationEntry {
	kind: 'navigation';
	/** Stable id, namespaced by hit type so a content id and a POI id can never collide. */
	id: string;
	/** The visible title/label (already actor-safe at its search source). */
	title: string;
	/** The searchable content type this hit belongs to (note/object/poi/handout/session-artifact). */
	contentType: SearchContentType;
	/** The route the GUI navigates to when this entry is chosen. */
	route: string;
	/** A title match outranks a body/relationship-only match (SRCH-002 AC1); higher sorts first. */
	score: number;
}

/**
 * One quick-switcher COMMAND entry: an actor-eligible command (navigation/scene/action/widget) wrapping the
 * SAME {@link PaletteCommand} the command palette renders, so it dispatches the IDENTICAL Processing Core
 * command (or routes). A non-permitted command is ABSENT from `listPaletteCommands`, so it never reaches
 * here; a present-but-`unavailable` command carries only a generic reason and resolves to `null`.
 */
export interface QuickSwitcherCommandEntry {
	kind: 'command';
	/** Stable id, namespaced so it can never collide with a navigation entry id. */
	id: string;
	title: string;
	/** The underlying actor-filtered palette command (carries availability + the route/command + any input). */
	command: PaletteCommand;
	/** Commands rank below content hits in the title-first model (content navigation is the primary use). */
	score: number;
}

export type QuickSwitcherEntry = QuickSwitcherNavigationEntry | QuickSwitcherCommandEntry;

/** The state slices the quick switcher reads: the search domains + the command-availability surface. */
export interface QuickSwitcherStateView extends CommandActionStateView {
	content: VaultContentState;
	maps: MapState;
	permissions: PermissionState;
	session: SessionState;
}

/** The resolved action a chosen entry produces: navigate to a route, or the palette's resolved command. */
export type ResolvedQuickSwitcherEntry =
	| { kind: 'navigate'; route: string }
	| { kind: 'palette'; resolved: ResolvedPaletteCommand };

/** The default navigation cap so a huge vault never produces an unbounded switcher list. */
const DEFAULT_NAVIGATION_LIMIT = 25;

/** Title-first scoring: a search hit that matched on its TITLE scores 2, a body/relationship-only hit 1. */
const TITLE_MATCH_SCORE = 2;

/**
 * The route a navigation hit opens. The switcher routes to the section that owns each domain (the same
 * canonical route roots the navigation registry declares): content lives in Knowledge, POIs in the Atlas,
 * and handouts/session artifacts in the Session section. Deep-link-precise focusing within a section is
 * owned by NAV deep links; the switcher's job is title-first navigation TO the visible target.
 */
function routeForHit(hit: SearchHit): string {
	switch (hit.type) {
		case 'note':
		case 'object':
			return '/knowledge/';
		case 'poi':
			return '/atlas/';
		case 'handout':
		case 'session-artifact':
			return '/session/';
	}
}

/** The namespaced entry id for a navigation hit (type + id; a POI also carries its map id for uniqueness). */
function navigationEntryId(hit: SearchHit): string {
	if (hit.type === 'poi' && hit.mapId) return `nav:poi:${hit.mapId}:${hit.id}`;
	return `nav:${hit.type}:${hit.id}`;
}

/**
 * Project the actor-filtered search result into title-first navigation entries. The search read already
 * ranked the hits deterministically (composite score → stable type order → id); this preserves that order
 * and caps the list. The entry's own switcher score is TITLE-FIRST (a title-matching hit scores 2, a
 * body/relationship-only hit 1) so navigation and command entries share the same title-first scale —
 * derived from the hit's TITLE signal (SRCH-005), not its composite score. NO re-filtering — every hit is
 * already visible.
 */
function navigationEntries(result: SearchResult, limit: number): QuickSwitcherNavigationEntry[] {
	const entries: QuickSwitcherNavigationEntry[] = [];
	for (const hit of result.hits) {
		if (entries.length >= limit) break;
		entries.push({
			kind: 'navigation',
			id: navigationEntryId(hit),
			title: hit.title,
			contentType: hit.type,
			route: routeForHit(hit),
			score: hit.signals.title > 0 ? TITLE_MATCH_SCORE : 1,
		});
	}
	return entries;
}

/**
 * Whether a palette command's title or keywords match a (lowercased, non-empty) query. A title match scores
 * above a keyword-only match so command ordering is also title-first, consistent with the content hits.
 */
function commandMatch(command: PaletteCommand, needle: string): { matched: boolean; titleMatch: boolean } {
	if (needle === '') return { matched: true, titleMatch: false };
	const titleMatch = command.title.toLowerCase().includes(needle);
	const keywordMatch = command.keywords.some((keyword) => keyword.toLowerCase().includes(needle));
	return { matched: titleMatch || keywordMatch, titleMatch };
}

/** Stable type order so equal-score entries order identically across runs (navigation before commands). */
const KIND_ORDER: Record<QuickSwitcherEntryKind, number> = { navigation: 0, command: 1 };

/**
 * Deterministic ordering for the merged list: by score descending (title matches first), then navigation
 * entries before command entries, then by id. Equal-input entries order identically across repeated runs
 * and fresh fixtures (the SRCH stable tie-break, applied to the merged switcher list).
 */
function compareEntries(a: QuickSwitcherEntry, b: QuickSwitcherEntry): number {
	if (a.score !== b.score) return b.score - a.score;
	if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
	return a.id.localeCompare(b.id);
}

export interface QuickSwitcherOptions {
	/** Max number of navigation (content) entries to include. Defaults to {@link DEFAULT_NAVIGATION_LIMIT}. */
	navigationLimit?: number;
	dateFormat?: CalendarDateFormat;
}

/**
 * SRCH-002 — build the actor-filtered, TITLE-FIRST quick-switcher entry list for a query. Composes the
 * visible search index (navigation) and the actor-filtered command surface (commands) into one ordered list.
 *
 * TITLE-FIRST (AC1): a hit whose TITLE matches the query outranks a body/relationship-only hit; the search
 * read assigns that score and this preserves it. Commands rank below content hits.
 *
 * FAIL CLOSED (AC3): navigation candidates are drawn only from the actor's visible search index (a hidden
 * note/object/POI/handout/secret-roll is never a candidate), and command candidates from
 * {@link listPaletteCommands}, which omits DM-only/hidden-target/hidden-label commands ENTIRELY for a
 * non-permitted actor. An unknown/unauthenticated actor receives an empty list (both surfaces fail closed).
 *
 * Pure + deterministic. With an empty query the navigation cap bounds the content list while every eligible
 * command is offered, so the switcher opens to a usable, non-leaking default.
 */
export function buildQuickSwitcher(
	state: QuickSwitcherStateView,
	actorId: ActorId,
	context: CommandActionContext,
	query: string,
	options: QuickSwitcherOptions = {},
): QuickSwitcherEntry[] {
	const needle = query.trim().toLowerCase();
	const navigationLimit = options.navigationLimit ?? DEFAULT_NAVIGATION_LIMIT;

	// NAVIGATION — the actor-filtered visible search index. The query is the free-text needle; passing it as
	// the search filter's `query` gives the search read's own title-first scoring (AC1). An unknown actor
	// yields an empty result here (fail closed).
	const searchResult = searchVaultForActor(
		state.content,
		state.maps,
		state.permissions,
		state.session,
		actorId,
		needle === '' ? {} : { query: needle },
		options.dateFormat,
	);
	const entries: QuickSwitcherEntry[] = navigationEntries(searchResult, navigationLimit);

	// COMMANDS — the actor-filtered command availability surface. Already fails closed: a non-permitted
	// command is absent. We match the same query over titles + keywords, title-first.
	for (const command of listPaletteCommands(state, actorId, context)) {
		const { matched, titleMatch } = commandMatch(command, needle);
		if (!matched) continue;
		entries.push({
			kind: 'command',
			id: `cmd:${command.id}`,
			title: command.title,
			command,
			score: titleMatch ? TITLE_MATCH_SCORE : 1,
		});
	}

	entries.sort(compareEntries);
	return entries;
}

/**
 * SRCH-002 AC2 — resolve a CHOSEN quick-switcher entry to its action from the entry's OWN CURRENT
 * descriptor, never a remembered index. A navigation entry resolves to its route. A command entry re-runs
 * {@link resolvePaletteCommand}, which returns `null` when the command is unavailable (e.g. a present-but-
 * blocked DM command) or a required input is missing — so a stale or now-ineligible selection resolves to
 * `null` instead of dispatching a command a disabled control could not (fail closed). The GUI passes the
 * entry the user is acting on RIGHT NOW, so a query change between keystroke and Enter never fires a stale
 * command.
 */
export function resolveQuickSwitcherEntry(
	entry: QuickSwitcherEntry,
	input: Record<string, string> = {},
): ResolvedQuickSwitcherEntry | null {
	if (entry.kind === 'navigation') {
		return { kind: 'navigate', route: entry.route };
	}
	const resolved = resolvePaletteCommand(entry.command, input);
	if (!resolved) return null;
	return { kind: 'palette', resolved };
}
