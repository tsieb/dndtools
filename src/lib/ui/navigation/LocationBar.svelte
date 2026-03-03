<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { createNoteId } from '$lib/types/note.js';

	interface Crumb {
		label: string;
		href: string | null;
	}

	const knownRoutes = new Map<string, string>([
		['/', 'Home'],
		['/notes', 'All Notes'],
		['/search', 'Search'],
		['/timeline', 'Timeline'],
		['/session-board', 'Session Board'],
		['/settings', 'Settings'],
	]);

	function folderSegments(folder: string): string[] {
		return folder
			.split('/')
			.map((part) => part.trim())
			.filter(Boolean);
	}

	const breadcrumbs = $derived.by<Crumb[]>(() => {
		const pathname = page.url.pathname;
		const search = page.url.searchParams;
		const crumbs: Crumb[] = [{ label: 'Home', href: resolve('/') }];

		if (pathname === '/') {
			crumbs[0] = { label: 'Home', href: null };
			return crumbs;
		}

		if (pathname === '/notes') {
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

		const noteMatch = pathname.match(/^\/notes\/([^/]+)(?:\/(edit))?$/);
		if (noteMatch) {
			const id = createNoteId(decodeURIComponent(noteMatch[1] ?? ''));
			const isEdit = noteMatch[2] === 'edit';
			const note = notesState.getNoteById(id);
			crumbs.push({ label: 'All Notes', href: resolve('/notes') });
			if (note) {
				const segments = folderSegments(String(note.folder));
				let currentPath = '';
				for (const segment of segments) {
					currentPath += `/${segment}`;
					crumbs.push({
						label: segment,
						href: `${resolve('/notes')}?folder=${encodeURIComponent(currentPath)}`,
					});
				}
				crumbs.push({
					label: note.title,
					href: isEdit ? resolve(`/notes/${id}`) : null,
				});
			} else {
				crumbs.push({ label: `Note ${id}`, href: isEdit ? resolve(`/notes/${id}`) : null });
			}
			if (isEdit) {
				crumbs.push({ label: 'Edit', href: null });
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
		const noteMatch = pathname.match(/^\/notes\/([^/]+)(?:\/edit)?$/);
		if (noteMatch) {
			const id = createNoteId(decodeURIComponent(noteMatch[1] ?? ''));
			const note = notesState.getNoteById(id);
			if (!note) return '';
			const backlinks = linksState.getBacklinkCount(note.id);
			const outbound = linksState.getForwardLinkCount(note.id);
			const folder = String(note.folder);
			const from = navigationState.backEntry?.label;
			const folderHint = folder === '/' ? 'Vault root' : folder;
			const flowHint = from ? `From ${from}` : '';
			return [folderHint, `${backlinks} backlinks`, `${outbound} outbound links`, flowHint]
				.filter(Boolean)
				.join(' • ');
		}

		if (pathname === '/notes') {
			const folder = page.url.searchParams.get('folder');
			const tag = page.url.searchParams.get('tag');
			if (!folder && !tag) return 'Browse all notes';
			return [folder ? `Folder ${folder}` : '', tag ? `Tag #${tag}` : '']
				.filter(Boolean)
				.join(' • ');
		}

		return '';
	});
</script>

<div
	class="sticky top-0 z-20 border-b border-border dark:border-tavern-border bg-surface/90 dark:bg-tavern-surface/90 backdrop-blur-md"
>
	<div class="px-4 py-2">
		<nav aria-label="Breadcrumb" class="flex flex-wrap items-center gap-1 text-xs">
			{#each breadcrumbs as crumb, index (`${crumb.label}-${index}`)}
				{#if index > 0}
					<span class="text-ink-faint dark:text-tavern-faint" aria-hidden="true">/</span>
				{/if}
				{#if crumb.href}
					<a
						href={crumb.href}
						class="rounded px-1 text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					>
						{crumb.label}
					</a>
				{:else}
					<span class="rounded px-1 font-medium text-ink dark:text-tavern-text">{crumb.label}</span>
				{/if}
			{/each}
		</nav>
		{#if contextHint}
			<p class="mt-1 text-[11px] text-ink-faint dark:text-tavern-faint">{contextHint}</p>
		{/if}
	</div>
</div>
