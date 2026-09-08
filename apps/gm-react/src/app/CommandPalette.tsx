import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	getSceneDisplayForActor,
	listCommandActions,
	listScenesForActor,
	listCharactersForActor,
	listMapsForActor,
	parseQuickSwitcherQuery,
	resolveCommandAction,
	searchCommandActions,
	searchVaultForActor,
	type CommandAction,
	type CommandActionGroup,
	type SearchHit,
} from '@dndtools/core';
import { CommandPalette as DSCommandPalette, Toaster } from '../ds';
import { useI18n, type MessageKey } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { widgetProfileForRuntime } from '../platform/capabilities';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../platform/preferences';
import { shortcut } from './shortcuts/registry';
import {
	RUN,
	LIBRARY,
	PLATFORM,
	PLAYER_SECTION,
	SETTINGS_SECTION,
	isNavSectionVisible,
} from './nav';

/**
 * One palette row. `kind` is the v2 addition: an ACTION does something (a Create launcher, a core
 * command action), a DESTINATION goes somewhere (a section, an entity, a search hit). The `>`
 * prefix lists actions only, so the distinction has to be carried per row.
 */
interface PaletteCommand {
	id: string;
	kind: 'action' | 'destination';
	label: string;
	icon?: string;
	group?: string;
	keywords?: string;
	description?: string;
	meta?: string;
	/** Key legend printed on the row, straight from `shortcuts/registry.ts` — never hand-typed. */
	shortcut?: string;
	disabled?: boolean;
	run: () => void;
}

/** Light debounce so the full-text search read runs per pause, not per keystroke (no new deps). */
const SEARCH_DEBOUNCE_MS = 150;
/** Cap on full-text hits fed to the palette — the core read already ranked them (SRCH-005). */
const SEARCH_HIT_LIMIT = 15;
/** Cap on core action rows, so a big widget library never buries the rest of the palette. */
const ACTION_LIMIT = 12;
/** How many just-run rows the empty palette offers back. */
const RECENT_LIMIT = 5;

/**
 * How each core search-hit kind is presented: which palette group it lands in, the route the app
 * navigates to (the section that owns the domain — same mapping as the core quick-switcher's
 * `routeForHit`), and its icon. Notes/objects live in Knowledge, POIs in the Atlas, handouts and
 * rolls in the Session section. RC-KNW-2.3 gives objects, handouts and rolls their own groups:
 * "Session" lumped a shared handout together with a die roll, which read as one kind of thing.
 */
const HIT_PRESENTATION: Record<
	SearchHit['type'],
	{ group: MessageKey; route: string; icon: string; kind: MessageKey }
> = {
	note: {
		group: 'palette.group.notes',
		route: '/knowledge',
		icon: 'knowledge-book',
		kind: 'palette.kind.note',
	},
	object: {
		group: 'palette.group.objects',
		route: '/campaign',
		icon: 'campaign-scroll',
		kind: 'palette.kind.storyEntry',
	},
	poi: {
		group: 'palette.group.mapLocations',
		route: '/atlas',
		icon: 'poi',
		kind: 'palette.kind.poi',
	},
	handout: {
		group: 'palette.group.handouts',
		route: '/session',
		icon: 'scroll',
		kind: 'palette.kind.handout',
	},
	'session-artifact': {
		group: 'palette.group.rolls',
		route: '/session',
		icon: 'dice',
		kind: 'palette.kind.roll',
	},
};

/** The icon each core action group wears, so an action row reads as its own kind at a glance. */
const ACTION_GROUP_ICON: Record<CommandActionGroup, string> = {
	home: 'home',
	preset: 'layers',
	widget: 'widget',
	session: 'session-bolt',
	map: 'atlas-map',
};

/**
 * RC-KNW-2.3 / RC-CAN-4.3 — CONTEXTUAL actions: which core action groups belong to the screen the
 * DM is looking at right now. Those are promoted into an "On this screen" group at the top of the
 * palette and offered even with an empty query; everything else in the catalog waits behind a
 * query or the `>` prefix. Route → relevance is GUI navigation metadata (the same kind of mapping
 * `routeForHit` already owns); eligibility itself stays the core's decision.
 */
function contextualGroupsFor(pathname: string): readonly CommandActionGroup[] {
	if (pathname === '/board' || pathname.startsWith('/scene/')) return ['home', 'preset', 'widget'];
	if (pathname.startsWith('/session')) return ['session', 'map'];
	if (pathname.startsWith('/atlas')) return ['map'];
	if (pathname.startsWith('/player')) return ['session', 'map'];
	return [];
}

/** A note hit deep-links the exact note; a POI hit deep-links its map and highlights the marker
 *  (`/atlas?map=…&poi=…`, the same URL contract as MapBuilder's copy-link); everything else lands
 *  on its owning section. */
function routeForHit(hit: SearchHit): string {
	if (hit.type === 'note') return `/knowledge/${hit.id}`;
	if (hit.type === 'poi' && hit.mapId) {
		return `/atlas?map=${encodeURIComponent(hit.mapId)}&poi=${encodeURIComponent(hit.id)}`;
	}
	return HIT_PRESENTATION[hit.type].route;
}

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
 * CommandPalette — the working ⌘K surface, backed by the Processing Core's search engine AND its
 * actor-filtered action catalog. The command set composes:
 *  - the static "Go to" / "Create" launchers (section destinations),
 *  - the actor-filtered entity lists the core exposes (`listScenesForActor` → `/scene/:id`,
 *    `listCharactersForActor` → Characters, `listMapsForActor` → `/atlas?map=:id`),
 *  - REAL full-text hits from `searchVaultForActor` (SRCH-001/003/005) once the user types — the
 *    same actor-filtered, deterministically ranked read the core quick-switcher composes — over
 *    notes, structured objects, map POIs, handouts, and rolls, each in its own group and routed to
 *    the owning section, and
 *  - RC-KNW-2.3: ACTIONS from `listCommandActions` (CMD-008), dispatched through
 *    `runtime.dispatch` as the IDENTICAL core command the visible control issues. The actions
 *    relevant to the current route are promoted to "On this screen"; a leading `>` (the core's
 *    `parseQuickSwitcherQuery` sigil, SRCH-005) narrows the palette to actions only.
 *
 * Every candidate comes from an actor-filtered read, so a dm-only note / hidden POI / withheld
 * handout / DM-only action is never even a candidate while previewing or viewing as a player.
 *
 * The DS `CommandPalette` owns the input; we mirror its query through the (bubbling) input event
 * on a wrapper and debounce it lightly before running the search read. Because the DS applies its
 * own substring filter to the RAW query text, every row we compute ourselves carries that raw text
 * as a keyword — otherwise a body-only search hit, or anything behind the `>` sigil, would be
 * filtered straight back out.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;

	// Mirror of the DS palette's input value (captured via the bubbling input event) + its debounce.
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	const [recentIds, setRecentIds] = useState<string[]>(readRecentIds);

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
	const needle = parsed.needle;
	const rawQuery = debouncedQuery.trim();

	const commands = useMemo<PaletteCommand[]>(() => {
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

		// ── Actions ──────────────────────────────────────────────────────────────────────────────
		// The core's actor-filtered action catalog. An action DISPATCHES; it does not navigate.
		const contextual = contextualGroupsFor(location.pathname);
		const dispatchAction = (action: CommandAction) => () => {
			const resolved = resolveCommandAction(action);
			// Belt and braces: an unavailable action is already rendered disabled, and the core
			// refuses it a second time here. Fail closed rather than pretend.
			if (!resolved) {
				Toaster.error(t('palette.toast.rejected'));
				return;
			}
			remember(`action:${action.id}`);
			void (async () => {
				try {
					const result = await runtime.dispatch({ ...resolved, actorId });
					if (result.status === 'rejected') Toaster.error(t('palette.toast.rejected'));
					else Toaster.success(t('palette.toast.ran', { title: action.title }));
				} catch {
					Toaster.error(t('palette.toast.notSaved'));
				}
			})();
			onClose();
		};
		const actionRow = (action: CommandAction, contextualRow: boolean): PaletteCommand => {
			const blocked =
				action.availability.status === 'unavailable' ? action.availability.reason : null;
			return {
				id: `action:${action.id}`,
				kind: 'action',
				label: action.title,
				icon: ACTION_GROUP_ICON[action.group],
				group: t(contextualRow ? 'palette.group.here' : 'palette.group.actions'),
				keywords: withQuery(action.keywords.join(' ')),
				// A blocked action keeps its row and says why, in the core's own generic words.
				description: blocked ?? undefined,
				disabled: blocked !== null,
				run: dispatchAction(action),
			};
		};
		const catalog = listCommandActions(runtime.state, actorId, {
			profileId: widgetProfileForRuntime(),
		})
			// An action that needs a typed value (a preset name) has no field to collect it here, and
			// a row that can never fire is a dead control. Its own screen owns that form.
			.filter((action) => action.input === null);
		const contextualActions = catalog.filter((action) => contextual.includes(action.group));
		const otherActions = catalog.filter((action) => !contextual.includes(action.group));
		// Contextual actions are always offered; the rest of the catalog waits for a query or `>`.
		// Both lists are matched HERE, by the core's own matcher, because they carry the raw query.
		const matchedOthers =
			commandMode || needle !== '' ? searchCommandActions(otherActions, needle) : [];
		const actions: PaletteCommand[] = [
			...searchCommandActions(contextualActions, needle).map((action) => actionRow(action, true)),
			...matchedOthers.slice(0, ACTION_LIMIT).map((action) => actionRow(action, false)),
		];

		// I11 S11.2.3 — the one global keyboard shortcut the palette can also fire, so the row can
		// honestly print its key legend from the registry instead of advertising a chord it does not
		// perform. Same command, same guard, same message as the shell's Ctrl/⌘+→ handler.
		const display = getSceneDisplayForActor(
			runtime.state.session,
			runtime.state.permissions,
			actorId,
		);
		const advanceLabel = t('palette.action.advanceCard');
		const advanceKeywords = t('palette.action.advanceCardKeywords');
		// DM-only, like every other action here: `listCommandActions` fails closed on its own, so this
		// hand-written row has to as well — a player previewing the vault is offered no verbs at all.
		const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
		if (isDm && matchesNeedle(advanceLabel, advanceKeywords))
			actions.push({
				id: 'action:scene-card.advance',
				kind: 'action',
				label: advanceLabel,
				icon: 'skip',
				group: t(contextual.length ? 'palette.group.here' : 'palette.group.actions'),
				// Plain-text row: it only needs the raw query when the DS query still carries the sigil.
				keywords: commandMode ? withQuery(advanceKeywords) : advanceKeywords,
				shortcut: shortcut('global.advanceCard').keys,
				disabled: display.queuedCount === 0,
				description: display.queuedCount === 0 ? t('palette.action.advanceCardBlocked') : undefined,
				run: () => {
					remember('action:scene-card.advance');
					void (async () => {
						try {
							const result = await runtime.dispatch({
								type: 'scene-card.advance',
								actorId,
								payload: {},
							});
							if (result.status === 'rejected') Toaster.error(t('palette.toast.rejected'));
							else Toaster.success(t('palette.action.advanceCardDone'));
						} catch {
							Toaster.error(t('palette.toast.notSaved'));
						}
					})();
					onClose();
				},
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
		): PaletteCommand | null => {
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
		const creates: PaletteCommand[] = [
			create('new:scene', 'palette.new.scene', 'palette.new.sceneKeywords', 'add', '/scenes'),
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
		].filter((row): row is PaletteCommand => row !== null);

		// `>` lists ACTIONS only: no section, no entity, no search hit can appear behind the sigil
		// (SRCH-005 AC3), so the DM who typed `>` is never handed a place instead of a verb.
		if (commandMode) return [...actions, ...creates];

		// ── Destinations ─────────────────────────────────────────────────────────────────────────
		// Player view and Settings live outside the three nav groups but are still destinations —
		// omitting them made "settings" / "player" return "No matches" in the jump-anywhere surface.
		// RC-UX-3.5 — jump-anywhere must not leak a surface the sidebar itself keeps hidden pending
		// its usage signal (Graph before 3 links).
		const sections: PaletteCommand[] = [
			...RUN,
			...LIBRARY,
			...PLATFORM,
			PLAYER_SECTION,
			SETTINGS_SECTION,
		]
			.filter((s) => isNavSectionVisible(s.id, runtime.state))
			.map((s) => ({
				id: `nav:${s.id}`,
				kind: 'destination' as const,
				label: t(s.labelKey),
				icon: s.icon,
				group: t('palette.group.goTo'),
				keywords: s.subKey ? t(s.subKey) : '',
				run: goTo(`nav:${s.id}`, s.path),
			}));
		// The GM Screen's backing home scene is its own "Go to" destination — as a scene row it reads
		// as a mystery scene named "Command Center".
		const homeSceneId = runtime.state.commandCenter.homeSceneId;
		const scenes: PaletteCommand[] = listScenesForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			actorId,
		)
			.filter((s) => !s.isTemplate && s.id !== homeSceneId)
			.map((s) => ({
				id: `scene:${s.id}`,
				kind: 'destination' as const,
				label: s.name,
				icon: 'scene',
				group: t('palette.group.scenes'),
				keywords: s.tags.join(' '),
				description: t(s.visibility === 'dm-only' ? 'common.visibility.dmOnly' : 'palette.shared'),
				run: goTo(`scene:${s.id}`, `/scene/${s.id}`),
			}));
		const characters: PaletteCommand[] = listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
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
		const maps: PaletteCommand[] = listMapsForActor(
			runtime.state.maps,
			runtime.state.permissions,
			actorId,
		)
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
		let searchHits: PaletteCommand[] = [];
		if (needle !== '') {
			const result = searchVaultForActor(
				runtime.state.content,
				runtime.state.maps,
				runtime.state.permissions,
				runtime.state.session,
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

		return [...actions, ...creates, ...sections, ...scenes, ...characters, ...maps, ...searchHits];
	}, [
		runtime,
		runtime.state,
		actorId,
		commandMode,
		needle,
		rawQuery,
		location.pathname,
		navigate,
		onClose,
		remember,
		t,
	]);

	return (
		<div
			style={{ display: 'contents' }}
			onInput={(e) => {
				const target = e.target as HTMLInputElement;
				if (typeof target.value === 'string') setQuery(target.value);
			}}
		>
			<DSCommandPalette
				open={open}
				onClose={onClose}
				commands={commands}
				recentIds={recentIds}
				groupOrder={[
					t('palette.group.here'),
					t('palette.group.create'),
					t('palette.group.actions'),
					t('palette.group.goTo'),
					t('palette.group.scenes'),
					t('palette.group.characters'),
					t('palette.group.maps'),
					t('palette.group.notes'),
					t('palette.group.objects'),
					t('palette.group.mapLocations'),
					t('palette.group.handouts'),
					t('palette.group.rolls'),
				]}
				placeholder={t('palette.placeholder')}
			/>
		</div>
	);
}
