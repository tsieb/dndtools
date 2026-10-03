import { HelpMenu } from './help/HelpMenu';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	getSavedSearchesForActor,
	listCharactersForActor,
	listMapsForActor,
	parseQuickSwitcherQuery,
	searchVaultForActor,
} from '@dndtools/core';
import { CommandPalette as DSCommandPalette } from '../ds';
import { useI18n, type MessageKey } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../platform/preferences';
import { activeCanvasSurface, subscribeCanvasSurface } from './shortcuts/registry';
import {
	RUN,
	LIBRARY,
	PLATFORM,
	PLAYER_SECTION,
	SETTINGS_SECTION,
	isNavSectionVisible,
} from './nav';
import { SCREENS_PATH } from '../screens/screen/screenModel';
import { screenPaletteRows } from '../screens/screen/paletteRows';
import { useScreens } from '../screens/screen/useScreens';
import {
	SEARCH_DEBOUNCE_MS,
	SEARCH_HIT_LIMIT,
	RECENT_LIMIT,
	SAVED_SEARCH_LIMIT,
	HIT_PRESENTATION,
	routeForHit,
	type PaletteCommand as PaletteRow,
} from './shortcuts/palettePresentation';
import { paletteActions } from './shortcuts/paletteActions';
/** The remembered row ids, newest first. Device-scoped UI history, never vault state. */
function readRecentIds(): string[] {
	const raw = readPreference(PREFERENCE_KEYS.paletteRecents);
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((id): id is string => typeof id === 'string').slice(0, RECENT_LIMIT);
	} catch {
		// A hand-edited or half-written value is history, not data: forget it rather than throw.
		return [];
	}
}

/**
 * Compose navigation, actor-filtered search hits and core actions in the ⌘K palette.
 * Contextual actions lead; `>` restricts results to actions. Core actions dispatch the same
 * commands as their visible controls. Actor-filtered reads keep hidden content out of results.
 *
 * Mirror and debounce the DS input before querying. Computed rows carry the raw query as a
 * keyword so the DS filter preserves body-only matches and results behind the `>` sigil.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const [helpOpen, setHelpOpen] = useState(false);
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const vaultState = runtime.state;
	const actorId = runtime.defaultActorId;

	// Mirror of the DS palette's input value (captured via the bubbling input event) + its debounce.
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	const [recentIds, setRecentIds] = useState<string[]>(readRecentIds);
	// RC-CAN-4.3 — the canvas behind the palette (its edit toggle + undo stack), if one is mounted.
	const canvasSurface = useSyncExternalStore(subscribeCanvasSurface, activeCanvasSurface);
	// RC-CAN-7.3 — the same actor-filtered screens read the library and the header switcher use.
	const screens = useScreens();

	useEffect(() => {
		// The DS palette clears its own input on open; keep the mirror in sync so stale hits never flash.
		setQuery('');
		setDebouncedQuery('');
		// Another tab (or the same one, earlier) may have moved the history on; re-read on open.
		if (open) setRecentIds(readRecentIds());
	}, [open]);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [query]);

	/** Remember a row that was just run, so the empty palette opens on what the DM keeps reaching
	 *  for. Search-hit ids are deliberately NOT remembered: they only exist while a query is typed,
	 *  so they could never resolve back into an empty palette. */
	const remember = useCallback((id: string) => {
		if (id.startsWith('search:')) return;
		setRecentIds((prev) => {
			const next = [id, ...prev.filter((existing) => existing !== id)].slice(0, RECENT_LIMIT);
			writePreference(PREFERENCE_KEYS.paletteRecents, JSON.stringify(next));
			return next;
		});
	}, []);

	const parsed = parseQuickSwitcherQuery(debouncedQuery);
	const commandMode = parsed.commandMode;
	// A canvas prefix scopes action search to the matching route's canvas verbs.
	const canvasPrefix = parsed.commandMode
		? /^(board|scene)(?=\s|$)/i.exec(parsed.needle)?.[1].toLowerCase()
		: undefined;
	const needle = canvasPrefix
		? parsed.needle.slice(canvasPrefix.length).trimStart()
		: parsed.needle;
	const rawQuery = debouncedQuery.trim();

	const commands = useMemo<PaletteRow[]>(() => {
		const goTo = (id: string, path: string, state?: Record<string, unknown>) => () => {
			remember(id);
			navigate(path, state ? { state } : undefined);
			onClose();
		};
		// The DS re-filters every row against the RAW query text, which a row we already matched
		// ourselves (a body-only search hit, a keyword-matched action, anything behind the `>` sigil)
		// would fail. Those rows carry the raw query as a keyword so the DS lets them through — but
		// ONLY those: handing it to a row we have NOT filtered would make it match everything.
		const withQuery = (...extra: (string | undefined)[]) =>
			[rawQuery, ...extra].filter(Boolean).join(' ');
		/** The palette's own match for plain-text rows, used where the DS filter cannot be trusted
		 *  (command mode, where its query still carries the `>`). Same all-tokens rule the DS uses. */
		const matchesNeedle = (...text: (string | undefined)[]): boolean => {
			if (needle === '') return true;
			const hay = text.filter(Boolean).join(' ').toLowerCase();
			return needle.split(/\s+/).every((token) => hay.includes(token));
		};

		const actions = paletteActions({
			runtime,
			actorId,
			pathname: location.pathname,
			commandMode,
			needle,
			canvasPrefix,
			canvasSurface,
			remember,
			onClose,
			t,
			withQuery,
			matchesNeedle,
		});

		// Each launcher lands with `state.create` so the destination OPENS its create flow (instead of
		// leaving the user on a list hunting for the button). Keywords cover the words a GM actually
		// types — "npc", "location", "quest" — not just our screen names.
		const create = (
			id: string,
			label: MessageKey,
			keywords: MessageKey,
			icon: string,
			path: string,
			state?: Record<string, unknown>,
		): PaletteRow | null => {
			if (runtime.readOnly || vaultState.permissions.actors[actorId]?.role !== 'dm') return null;
			const text = t(label);
			const words = t(keywords);
			// In command mode the DS still sees the `>`, so the launcher is matched here instead and
			// carries the raw query; outside it the DS's own substring filter does the work.
			if (commandMode && !matchesNeedle(text, words)) return null;
			return {
				id,
				kind: 'action',
				label: text,
				icon,
				group: t('palette.group.create'),
				keywords: commandMode ? withQuery(words) : words,
				run: goTo(id, path, state),
			};
		};
		const creates: PaletteRow[] = [
			create(
				'new:screen',
				'palette.new.screen',
				'palette.new.screenKeywords',
				'add',
				SCREENS_PATH,
				{
					createScreen: true,
				},
			),
			create(
				'new:character',
				'palette.new.character',
				'palette.new.characterKeywords',
				'new-character',
				'/characters',
				{ create: true },
			),
			create(
				'new:npc',
				'palette.new.npc',
				'palette.new.npcKeywords',
				'new-character',
				'/characters',
				{ create: true, kind: 'npc' },
			),
			create(
				'new:note',
				'palette.new.note',
				'palette.new.noteKeywords',
				'note-edit',
				'/knowledge',
				{
					create: true,
				},
			),
			create('new:map', 'palette.new.map', 'palette.new.mapKeywords', 'new-map', '/atlas', {
				create: true,
			}),
			create(
				'new:faction',
				'palette.new.faction',
				'palette.new.factionKeywords',
				'flag',
				'/campaign',
				{
					createFaction: true,
				},
			),
			// The one Create entry that navigated without an intent — it dropped you on /session
			// with nothing open while its siblings all open their editor on arrival.
			create(
				'new:encounter',
				'palette.new.encounter',
				'palette.new.encounterKeywords',
				'sword',
				'/session',
				{ createEncounter: true },
			),
		].filter((row): row is PaletteRow => row !== null);

		// ── Saved searches ───────────────────────────────────────────────────────────────────────
		// RC-KNW-2.1 — `>search saved` reaches the DM's own named searches from the palette instead
		// of making them walk to Knowledge and open the disclosure first. The candidates come from
		// `getSavedSearchesForActor`, so a dm-only saved search is not a row for a player at all
		// (SRCH-004 AC2), and the count on each row is that actor's LIVE re-run of the stored
		// filter — a saved search stores the query, never a result. Running one hands its id to
		// Knowledge, which restores the whole filter into the editor rather than just its name.
		const savedWords = t('palette.savedSearch.keywords');
		const savedSearches: PaletteRow[] = getSavedSearchesForActor(
			vaultState.content,
			vaultState.maps,
			vaultState.permissions,
			vaultState.session,
			actorId,
		)
			// Pinned first: those are the ones the DM put on the Command Center.
			.sort((a, b) => Number(b.pinned) - Number(a.pinned))
			.filter((entry) => matchesNeedle(entry.name, savedWords))
			.slice(0, SAVED_SEARCH_LIMIT)
			.map((entry) => ({
				id: `saved-search:${entry.id}`,
				kind: 'action' as const,
				label: entry.name,
				icon: 'search',
				group: t('palette.group.savedSearches'),
				keywords: commandMode ? withQuery(savedWords) : savedWords,
				description: t('palette.savedSearch.matches', { count: entry.result.totalCount }),
				run: goTo(`saved-search:${entry.id}`, '/knowledge', { savedSearchId: entry.id }),
			}));

		// `>` lists ACTIONS only: no section, no entity, no search hit can appear behind the sigil
		// (SRCH-005 AC3), so the DM who typed `>` is never handed a place instead of a verb. A saved
		// search qualifies — it RUNS a stored query rather than naming a place.
		if (canvasPrefix) return actions;
		if (commandMode) return [...actions, ...creates, ...savedSearches];

		// ── Destinations ─────────────────────────────────────────────────────────────────────────
		// Player view and Settings live outside the three nav groups but are still destinations —
		// omitting them made "settings" / "player" return "No matches" in the jump-anywhere surface.
		// RC-UX-3.5 — jump-anywhere must not leak a surface the sidebar itself keeps hidden pending
		// its usage signal (Graph before 3 links).
		const sections: PaletteRow[] = [
			...RUN,
			...LIBRARY,
			...PLATFORM,
			PLAYER_SECTION,
			SETTINGS_SECTION,
		]
			.filter((s) => isNavSectionVisible(s.id, vaultState))
			.map((s) => ({
				id: `nav:${s.id}`,
				kind: 'destination' as const,
				label: t(s.labelKey),
				icon: s.icon,
				group: t('palette.group.goTo'),
				keywords: s.subKey ? t(s.subKey) : '',
				run: goTo(`nav:${s.id}`, s.path),
			}));
		// RC-CAN-7.3 — "All screens" joins Go to, and every screen is a jump target.
		const screenRows = screenPaletteRows(screens.entries, screens.nameOf, t, goTo);
		sections.push(screenRows.library);
		const scenes: PaletteRow[] = screenRows.screens;
		const characters: PaletteRow[] = listCharactersForActor(
			vaultState.characters,
			vaultState.permissions,
			actorId,
		)
			.slice(0, 12)
			.map((c) => ({
				id: `char:${c.id}`,
				kind: 'destination' as const,
				label: c.name,
				icon: 'characters-person',
				group: t('palette.group.characters'),
				keywords: c.kind,
				run: goTo(`char:${c.id}`, `/characters/${c.id}`),
			}));
		const maps: PaletteRow[] = listMapsForActor(vaultState.maps, vaultState.permissions, actorId)
			.slice(0, 12)
			.map((m) => ({
				id: `map:${m.id}`,
				kind: 'destination' as const,
				label: m.name,
				icon: 'atlas-map',
				group: t('palette.group.maps'),
				keywords: m.description,
				description: t(m.visibility === 'dm-only' ? 'common.visibility.dmOnly' : 'palette.shared'),
				// Deep-link the SPECIFIC map (`?map=…` — the Atlas deep-link contract), not the list.
				run: goTo(`map:${m.id}`, `/atlas?map=${encodeURIComponent(m.id)}`),
			}));

		// Full-text hits from the core search engine — only once the user typed something (a blank
		// query would match the whole visible vault and flood the palette's browse view).
		let searchHits: PaletteRow[] = [];
		if (needle !== '') {
			const result = searchVaultForActor(
				vaultState.content,
				vaultState.maps,
				vaultState.permissions,
				vaultState.session,
				actorId,
				{ query: needle },
			);
			searchHits = result.hits.slice(0, SEARCH_HIT_LIMIT).map((hit) => {
				const p = HIT_PRESENTATION[hit.type];
				return {
					id: `search:${hit.type}:${hit.mapId ?? ''}:${hit.id}`,
					kind: 'destination' as const,
					label: hit.title,
					icon: p.icon,
					group: t(p.group),
					// Carry the matched query + snippet + tags so the DS live substring filter keeps
					// body-only matches (whose titles don't contain the query) in the list.
					keywords: withQuery(hit.tags.join(' '), hit.snippet?.text),
					description: hit.snippet?.text,
					meta: t(p.kind),
					run: goTo(`search:${hit.type}:${hit.id}`, routeForHit(hit)),
				};
			});
		}

		return [
			...actions,
			...creates,
			...savedSearches,
			...sections,
			{
				id: 'help',
				kind: 'destination',
				label: t('help.title'),
				icon: 'info',
				group: t('palette.group.goTo'),
				keywords: t('help.keyboardShortcuts'),
				run: () => {
					onClose();
					setHelpOpen(true);
				},
			},
			...scenes,
			...characters,
			...maps,
			...searchHits,
		];
	}, [
		runtime,
		vaultState,
		actorId,
		commandMode,
		needle,
		rawQuery,
		location.pathname,
		navigate,
		onClose,
		canvasSurface,
		canvasPrefix,
		remember,
		t,
		screens,
	]);

	return (
		<div
			style={{ display: 'contents' }}
			onInput={(e) => {
				const target = e.target as HTMLInputElement;
				if (typeof target.value === 'string') setQuery(target.value);
			}}
		>
			{helpOpen && <HelpMenu open onClose={() => setHelpOpen(false)} />}
			<DSCommandPalette
				open={open}
				onClose={onClose}
				commands={commands}
				recentIds={recentIds}
				groupOrder={[
					t('palette.group.here'),
					t('palette.group.create'),
					t('palette.group.actions'),
					t('palette.group.savedSearches'),
					t('palette.group.goTo'),
					t('palette.group.screens'),
					t('palette.group.characters'),
					t('palette.group.maps'),
					t('palette.group.notes'),
					t('palette.group.objects'),
					t('palette.group.mapLocations'),
					t('palette.group.handouts'),
					t('palette.group.rolls'),
				]}
				placeholder={t('palette.placeholder')}
				emptyTitle={t('palette.emptyTitle')}
				emptyDescription={t('palette.emptyDescription')}
				emptyIllustration="search-none"
				labels={{
					title: t('palette.title'),
					results: t('palette.results'),
					recent: t('palette.recent'),
					navigate: t('palette.navigate'),
					select: t('palette.select'),
					close: t('palette.close'),
					resultCount: (count: number) => t('palette.resultCount', { count }),
				}}
			/>
		</div>
	);
}
