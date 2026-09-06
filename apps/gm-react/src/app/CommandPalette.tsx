import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	listScenesForActor,
	listCharactersForActor,
	listMapsForActor,
	searchVaultForActor,
	type SearchHit,
} from '@dndtools/core';
import { CommandPalette as DSCommandPalette } from '../ds';
import { useI18n, type MessageKey } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { RUN, LIBRARY, PLATFORM, PLAYER_SECTION, SETTINGS_SECTION } from './nav';

interface PaletteCommand {
	id: string;
	label: string;
	icon?: string;
	group?: string;
	keywords?: string;
	description?: string;
	meta?: string;
	run: () => void;
}

/** Light debounce so the full-text search read runs per pause, not per keystroke (no new deps). */
const SEARCH_DEBOUNCE_MS = 150;
/** Cap on full-text hits fed to the palette — the core read already ranked them (SRCH-005). */
const SEARCH_HIT_LIMIT = 15;

/**
 * How each core search-hit kind is presented: which palette group it lands in, the route the app
 * navigates to (the section that owns the domain — same mapping as the core quick-switcher's
 * `routeForHit`), and its icon. Notes/objects live in Knowledge, POIs in the Atlas, handouts and
 * session artifacts in the Session section.
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
		group: 'palette.group.notes',
		route: '/campaign',
		icon: 'knowledge-book',
		kind: 'palette.kind.storyEntry',
	},
	poi: {
		group: 'palette.group.mapLocations',
		route: '/atlas',
		icon: 'poi',
		kind: 'palette.kind.poi',
	},
	handout: {
		group: 'palette.group.session',
		route: '/session',
		icon: 'scroll',
		kind: 'palette.kind.handout',
	},
	'session-artifact': {
		group: 'palette.group.session',
		route: '/session',
		icon: 'dice',
		kind: 'palette.kind.roll',
	},
};

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

/**
 * CommandPalette — the working ⌘K surface, now backed by the Processing Core's search engine. The
 * command set composes:
 *  - the static "Go to" / "Create" launchers (section destinations),
 *  - the actor-filtered entity lists the core exposes (`listScenesForActor` → `/scene/:id`,
 *    `listCharactersForActor` → Characters, `listMapsForActor` → `/atlas?map=:id`), and
 *  - once the user types, REAL full-text hits from `searchVaultForActor` (SRCH-001/003/005) — the
 *    same actor-filtered, deterministically ranked read the core quick-switcher composes — over
 *    notes, structured objects, map POIs, handouts, and session artifacts, grouped by kind and
 *    routed to the owning section. Every candidate comes from the actor-filtered read, so a
 *    dm-only note / hidden POI / withheld handout is never even a candidate while previewing or
 *    viewing as a player.
 *
 * The DS `CommandPalette` owns the input; we mirror its query through the (bubbling) input event
 * on a wrapper and debounce it lightly before running the search read. Each hit carries its query
 * + snippet as keywords so the DS substring filter keeps body-only matches visible.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;

	// Mirror of the DS palette's input value (captured via the bubbling input event) + its debounce.
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');

	useEffect(() => {
		// The DS palette clears its own input on open; keep the mirror in sync so stale hits never flash.
		setQuery('');
		setDebouncedQuery('');
	}, [open]);

	useEffect(() => {
		const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [query]);

	const commands = useMemo<PaletteCommand[]>(() => {
		const goTo = (path: string, state?: Record<string, unknown>) => () => {
			navigate(path, state ? { state } : undefined);
			onClose();
		};
		// Player view and Settings live outside the three nav groups but are still destinations —
		// omitting them made "settings" / "player" return "No matches" in the jump-anywhere surface.
		const sections = [...RUN, ...LIBRARY, ...PLATFORM, PLAYER_SECTION, SETTINGS_SECTION].map(
			(s) => ({
				id: `nav:${s.id}`,
				label: s.label,
				icon: s.icon,
				group: t('palette.group.goTo'),
				keywords: s.sub ?? '',
				run: goTo(s.path),
			}),
		);
		// The GM Screen's backing home scene is its own "Go to" destination — as a scene row it reads
		// as a mystery scene named "Command Center".
		const homeSceneId = runtime.state.commandCenter.homeSceneId;
		const scenes = listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId)
			.filter((s) => !s.isTemplate && s.id !== homeSceneId)
			.map((s) => ({
				id: `scene:${s.id}`,
				label: s.name,
				icon: 'scene',
				group: t('palette.group.scenes'),
				keywords: s.tags.join(' '),
				description: t(s.visibility === 'dm-only' ? 'common.visibility.dmOnly' : 'palette.shared'),
				run: goTo(`/scene/${s.id}`),
			}));
		const characters = listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
			actorId,
		)
			.slice(0, 12)
			.map((c) => ({
				id: `char:${c.id}`,
				label: c.name,
				icon: 'characters-person',
				group: t('palette.group.characters'),
				keywords: c.kind,
				run: goTo(`/characters/${c.id}`),
			}));
		const maps = listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId)
			.slice(0, 12)
			.map((m) => ({
				id: `map:${m.id}`,
				label: m.name,
				icon: 'atlas-map',
				group: t('palette.group.maps'),
				keywords: m.description,
				description: t(m.visibility === 'dm-only' ? 'common.visibility.dmOnly' : 'palette.shared'),
				// Deep-link the SPECIFIC map (`?map=…` — the Atlas deep-link contract), not the list.
				run: goTo(`/atlas?map=${encodeURIComponent(m.id)}`),
			}));
		// Each launcher lands with `state.create` so the destination OPENS its create flow (instead of
		// leaving the user on a list hunting for the button). Keywords cover the words a GM actually
		// types — "npc", "location", "quest" — not just our screen names.
		const creates: PaletteCommand[] = [
			{
				id: 'new:scene',
				label: t('palette.new.scene'),
				icon: 'add',
				group: t('palette.group.create'),
				keywords: t('palette.new.sceneKeywords'),
				run: goTo('/scenes'),
			},
			{
				id: 'new:character',
				label: t('palette.new.character'),
				icon: 'new-character',
				group: t('palette.group.create'),
				keywords: t('palette.new.characterKeywords'),
				run: goTo('/characters', { create: true }),
			},
			{
				id: 'new:npc',
				label: t('palette.new.npc'),
				icon: 'new-character',
				group: t('palette.group.create'),
				keywords: t('palette.new.npcKeywords'),
				run: goTo('/characters', { create: true, kind: 'npc' }),
			},
			{
				id: 'new:note',
				label: t('palette.new.note'),
				icon: 'note-edit',
				group: t('palette.group.create'),
				keywords: t('palette.new.noteKeywords'),
				run: goTo('/knowledge', { create: true }),
			},
			{
				id: 'new:map',
				label: t('palette.new.map'),
				icon: 'new-map',
				group: t('palette.group.create'),
				keywords: t('palette.new.mapKeywords'),
				run: goTo('/atlas', { create: true }),
			},
			{
				id: 'new:faction',
				label: t('palette.new.faction'),
				icon: 'flag',
				group: t('palette.group.create'),
				keywords: t('palette.new.factionKeywords'),
				run: goTo('/campaign', { createFaction: true }),
			},
			{
				id: 'new:encounter',
				label: t('palette.new.encounter'),
				icon: 'sword',
				group: t('palette.group.create'),
				keywords: t('palette.new.encounterKeywords'),
				// The one Create entry that navigated without an intent — it dropped you on /session
				// with nothing open while its siblings all open their editor on arrival.
				run: goTo('/session', { createEncounter: true }),
			},
		];

		// Full-text hits from the core search engine — only once the user typed something (a blank
		// query would match the whole visible vault and flood the palette's browse view).
		const needle = debouncedQuery.trim();
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
					label: hit.title,
					icon: p.icon,
					group: t(p.group),
					// Carry the matched query + snippet + tags so the DS live substring filter keeps
					// body-only matches (whose titles don't contain the query) in the list.
					keywords: [needle, hit.tags.join(' '), hit.snippet?.text ?? ''].join(' '),
					description: hit.snippet?.text,
					meta: t(p.kind),
					run: goTo(routeForHit(hit)),
				};
			});
		}

		return [...creates, ...sections, ...scenes, ...characters, ...maps, ...searchHits];
	}, [runtime.state, actorId, debouncedQuery, navigate, onClose, t]);

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
				groupOrder={[
					t('palette.group.create'),
					t('palette.group.goTo'),
					t('palette.group.scenes'),
					t('palette.group.characters'),
					t('palette.group.maps'),
					t('palette.group.notes'),
					t('palette.group.mapLocations'),
					t('palette.group.session'),
				]}
				placeholder={t('palette.placeholder')}
			/>
		</div>
	);
}
