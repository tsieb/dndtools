<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { mapBreadcrumbs } from '$lib/domain/map-atlas.js';
	import { createNoteId } from '$lib/types/note.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import type { BreadcrumbItem } from '$lib/types/breadcrumb.js';
	import Breadcrumb from '$lib/ui/navigation/Breadcrumb.svelte';

	interface Crumb {
		label: string;
		href: string | null;
	}

	const knownRoutes = new Map<string, string>([
		['/knowledge', 'Knowledge'],
		['/knowledge/notes', 'All Notes'],
		['/knowledge/search', 'Search'],
		['/knowledge/graph', 'Graph'],
		['/atlas/maps', 'Maps'],
		['/campaign/timeline', 'Timeline'],
		['/session/boards', 'Session Board'],
		['/session/combat', 'Combat Tracker'],
		['/session/encounter/new', 'Encounter Builder'],
		['/settings', 'Settings'],
		['/player', 'Player Screen'],
	]);

	function toMetadataCrumbs(data: unknown): Crumb[] | null {
		if (!data || typeof data !== 'object') return null;
		const raw = (data as { breadcrumb?: unknown }).breadcrumb;
		if (!Array.isArray(raw) || raw.length === 0) return null;
		const parsed: Crumb[] = [];
		for (const entry of raw) {
			if (!entry || typeof entry !== 'object') return null;
			const label = (entry as BreadcrumbItem).label;
			const href = (entry as BreadcrumbItem).href;
			if (typeof label !== 'string' || label.trim().length === 0) return null;
			if (href !== null && typeof href !== 'string') return null;
			parsed.push({ label, href });
		}
		return parsed;
	}

	function folderSegments(folder: string): string[] {
		return folder
			.split('/')
			.map((part) => part.trim())
			.filter(Boolean);
	}

	function buildNoteRouteCrumbs(pathname: string): Crumb[] | null {
		const noteMatch = pathname.match(/^\/knowledge\/notes\/([^/]+)(?:\/(edit))?$/);
		if (!noteMatch) return null;
		const id = createNoteId(decodeURIComponent(noteMatch[1] ?? ''));
		const isEdit = noteMatch[2] === 'edit';
		const rawNote = notesState.getNoteById(id);
		const note =
			rawNote && (!playerModeState.enabled || isNoteVisibleInPlayerMode(rawNote)) ? rawNote : null;
		const crumbs: Crumb[] = [
			{ label: 'Knowledge', href: resolve('/knowledge') },
			{ label: 'All Notes', href: resolve('/knowledge/notes') },
		];
		if (note) {
			const segments = folderSegments(String(note.folder));
			let currentPath = '';
			for (const segment of segments) {
				currentPath += `/${segment}`;
				crumbs.push({
					label: segment,
					href: `${resolve('/knowledge/notes')}?folder=${encodeURIComponent(currentPath)}`,
				});
			}
			crumbs.push({
				label: note.title,
				href: isEdit ? resolve(`/knowledge/notes/${id}`) : null,
			});
		} else {
			crumbs.push({
				label: `Note ${id}`,
				href: isEdit ? resolve(`/knowledge/notes/${id}`) : null,
			});
		}
		if (isEdit) {
			crumbs.push({ label: 'Edit', href: null });
		}
		return crumbs;
	}

	function buildAtlasRouteCrumbs(pathname: string, search: URLSearchParams): Crumb[] | null {
		if (pathname !== '/atlas/maps') return null;
		const selectedMapId = search.get('map')?.trim();
		const base: Crumb[] = [
			{ label: 'Atlas', href: resolve('/atlas/maps') },
			{ label: 'Maps', href: selectedMapId ? resolve('/atlas/maps') : null },
		];
		if (!selectedMapId) return base;
		const selectedMap = mapsState.mapById[selectedMapId];
		if (!selectedMap) {
			return [
				...base,
				{
					label: `Map ${selectedMapId}`,
					href: null,
				},
			];
		}
		const hierarchy = mapBreadcrumbs(selectedMapId, mapsState.maps);
		const hierarchyCrumbs = hierarchy.map((entry, index) => {
			const isCurrent = index === hierarchy.length - 1;
			return {
				label: entry.name,
				href: isCurrent ? null : `${resolve('/atlas/maps')}?map=${encodeURIComponent(entry.mapId)}`,
			} satisfies Crumb;
		});
		return [...base, ...hierarchyCrumbs];
	}

	function buildSessionBoardCrumbs(pathname: string): Crumb[] | null {
		if (pathname !== '/session/boards') return null;
		const activeBoard = sessionBoardsState.activeBoard;
		if (!activeBoard) {
			return [
				{ label: 'Session', href: resolve('/session/boards') },
				{ label: 'Boards', href: null },
			];
		}
		return [
			{ label: 'Session', href: resolve('/session/boards') },
			{ label: 'Boards', href: resolve('/session/boards') },
			{ label: activeBoard.name, href: null },
		];
	}

	const breadcrumbs = $derived.by<Crumb[]>(() => {
		const pathname = page.url.pathname;
		const search = page.url.searchParams;
		const noteCrumbs = buildNoteRouteCrumbs(pathname);
		if (noteCrumbs) return noteCrumbs;

		const atlasCrumbs = buildAtlasRouteCrumbs(pathname, search);
		if (atlasCrumbs) return atlasCrumbs;

		const sessionBoardCrumbs = buildSessionBoardCrumbs(pathname);
		if (sessionBoardCrumbs) return sessionBoardCrumbs;

		const metadataCrumbs = toMetadataCrumbs(page.data);
		if (metadataCrumbs) {
			return metadataCrumbs.map((crumb) => ({
				label: crumb.label,
				href: crumb.href,
			}));
		}

		const crumbs: Crumb[] = [{ label: 'Knowledge', href: resolve('/knowledge') }];

		if (pathname === '/knowledge') {
			crumbs[0] = { label: 'Knowledge', href: null };
			return crumbs;
		}

		if (pathname === '/knowledge/notes') {
			crumbs.push({ label: 'All Notes', href: null });
			const folder = search.get('folder');
			const tag = search.get('tag');
			if (folder) {
				crumbs.push({ label: folder, href: null });
			}
			if (tag) {
				crumbs.push({ label: `#${tag}`, href: null });
			}
			return crumbs;
		}

		if (knownRoutes.has(pathname)) {
			crumbs.push({ label: knownRoutes.get(pathname) ?? pathname, href: null });
			return crumbs;
		}

		crumbs.push({ label: pathname, href: null });
		return crumbs;
	});

	const contextHint = $derived.by(() => {
		const pathname = page.url.pathname;
		const noteMatch = pathname.match(/^\/knowledge\/notes\/([^/]+)(?:\/edit)?$/);
		if (noteMatch) {
			const id = createNoteId(decodeURIComponent(noteMatch[1] ?? ''));
			const rawNote = notesState.getNoteById(id);
			const note =
				rawNote && (!playerModeState.enabled || isNoteVisibleInPlayerMode(rawNote))
					? rawNote
					: null;
			if (!note) return '';
			const backlinks = linksState.getBacklinkCount(note.id);
			const outbound = linksState.getForwardLinkCount(note.id);
			const folder = String(note.folder);
			const from = navigationState.backEntry?.label;
			const folderHint = folder === '/' ? 'Vault root' : folder;
			const flowHint = from ? `From ${from}` : '';
			return [folderHint, `${backlinks} backlinks`, `${outbound} outbound links`, flowHint]
				.filter(Boolean)
				.join(' | ');
		}

		if (pathname === '/knowledge/notes') {
			const folder = page.url.searchParams.get('folder');
			const tag = page.url.searchParams.get('tag');
			if (!folder && !tag) return 'Browse all notes';
			return [folder ? `Folder ${folder}` : '', tag ? `Tag #${tag}` : '']
				.filter(Boolean)
				.join(' | ');
		}

		return '';
	});
</script>

<div class="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-md">
	<div class="px-4 py-2">
		<Breadcrumb items={breadcrumbs} />
		{#if contextHint}
			<p class="mt-1 text-[11px] text-ink-faint">{contextHint}</p>
		{/if}
	</div>
</div>
