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
	{ group: string; route: string; icon: string; kind: string }
> = {
	note: { group: 'Notes', route: '/knowledge', icon: 'knowledge-book', kind: 'Note' },
	object: { group: 'Notes', route: '/campaign', icon: 'knowledge-book', kind: 'Story entry' },
	poi: { group: 'Map locations', route: '/atlas', icon: 'poi', kind: 'Point of interest' },
	handout: { group: 'Session', route: '/session', icon: 'scroll', kind: 'Handout' },
	'session-artifact': { group: 'Session', route: '/session', icon: 'dice', kind: 'Roll' },
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
		const sections = [...RUN, ...LIBRARY, ...PLATFORM, PLAYER_SECTION, SETTINGS_SECTION].map((s) => ({
			id: `nav:${s.id}`,
			label: s.label,
			icon: s.icon,
			group: 'Go to',
			keywords: s.sub ?? '',
			run: goTo(s.path),
		}));
		// The GM Screen's backing home scene is its own "Go to" destination — as a scene row it reads
		// as a mystery scene named "Command Center".
		const homeSceneId = runtime.state.commandCenter.homeSceneId;
		const scenes = listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId)
			.filter((s) => !s.isTemplate && s.id !== homeSceneId)
			.map((s) => ({
				id: `scene:${s.id}`,
				label: s.name,
				icon: 'scene',
				group: 'Scenes',
				keywords: s.tags.join(' '),
				description: s.visibility === 'dm-only' ? 'DM only' : 'Shared',
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
				group: 'Characters',
				keywords: c.kind,
				run: goTo(`/characters/${c.id}`),
			}));
		const maps = listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId)
			.slice(0, 12)
			.map((m) => ({
				id: `map:${m.id}`,
				label: m.name,
				icon: 'atlas-map',
				group: 'Maps',
				keywords: m.description,
				description: m.visibility === 'dm-only' ? 'DM only' : 'Shared',
				// Deep-link the SPECIFIC map (`?map=…` — the Atlas deep-link contract), not the list.
				run: goTo(`/atlas?map=${encodeURIComponent(m.id)}`),
			}));
		// Each launcher lands with `state.create` so the destination OPENS its create flow (instead of
		// leaving the user on a list hunting for the button). Keywords cover the words a GM actually
		// types — "npc", "location", "quest" — not just our screen names.
		const creates: PaletteCommand[] = [
			{
				id: 'new:scene',
				label: 'New scene',
				icon: 'add',
				group: 'Create',
				keywords: 'canvas board battle stage',
				run: goTo('/scenes'),
			},
			{
				id: 'new:character',
				label: 'New character',
				icon: 'new-character',
				group: 'Create',
				keywords: 'pc party player hero',
				run: goTo('/characters', { create: true }),
			},
			{
				id: 'new:npc',
				label: 'New NPC or monster',
				icon: 'new-character',
				group: 'Create',
				keywords: 'npc monster villain creature bestiary sidekick',
				run: goTo('/characters', { create: true, kind: 'npc' }),
			},
			{
				id: 'new:note',
				label: 'New note',
				icon: 'note-edit',
				group: 'Create',
				keywords: 'quest thread lore location place handout journal wiki',
				run: goTo('/knowledge', { create: true }),
			},
			{
				id: 'new:map',
				label: 'New map',
				icon: 'new-map',
				group: 'Create',
				keywords: 'location place battlemap dungeon atlas poi',
				run: goTo('/atlas', { create: true }),
			},
			{
				id: 'new:faction',
				label: 'New faction',
				icon: 'flag',
				group: 'Create',
				keywords: 'cult guild order organization dossier',
				run: goTo('/campaign', { createFaction: true }),
			},
			{
				id: 'new:encounter',
				label: 'Build encounter',
				icon: 'sword',
				group: 'Create',
				keywords: 'combat fight initiative monsters battle',
				run: goTo('/session'),
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
					group: p.group,
					// Carry the matched query + snippet + tags so the DS live substring filter keeps
					// body-only matches (whose titles don't contain the query) in the list.
					keywords: [needle, hit.tags.join(' '), hit.snippet?.text ?? ''].join(' '),
					description: hit.snippet?.text,
					meta: p.kind,
					run: goTo(routeForHit(hit)),
				};
			});
		}

		return [...creates, ...sections, ...scenes, ...characters, ...maps, ...searchHits];
	}, [runtime.state, actorId, debouncedQuery, navigate, onClose]);

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
					'Create',
					'Go to',
					'Scenes',
					'Characters',
					'Maps',
					'Notes',
					'Map locations',
					'Session',
				]}
				placeholder="Search notes, maps, handouts, scenes, characters…"
			/>
		</div>
	);
}
