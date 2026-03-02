<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { searchService } from '$lib/domain/search.js';
	import {
		buildQuickReferenceEntityRecords,
		quickReferenceIconToken,
		searchQuickReferenceEntities,
		type QuickReferenceEntitySearchResult,
	} from '$lib/domain/quick-reference.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { templateLibraryState } from '$lib/state/template-library.svelte.js';
	import type { NoteId } from '$lib/types/note.js';

	interface Props {
		open: boolean;
		onclose: () => void;
		onnewnote: () => void;
		ontemplate: (folderOverride?: string) => void;
		oncreatefromtemplate: (templateId: string) => void;
		onsessionrecap: () => void;
		onopensplitview: (noteId: NoteId) => void;
	}

	type PaletteGroup = 'Actions' | 'Navigation' | 'Settings' | 'Notes' | 'Entities';

	interface PaletteItem {
		id: string;
		group: PaletteGroup;
		title: string;
		subtitle: string;
		keywords: string;
		disabled?: boolean;
		noteId?: NoteId;
		entity?: QuickReferenceEntitySearchResult;
		run: () => void | Promise<void>;
		openSplit?: () => void | Promise<void>;
	}

	let {
		open = $bindable(),
		onclose,
		onnewnote,
		ontemplate,
		oncreatefromtemplate,
		onsessionrecap,
		onopensplitview,
	}: Props = $props();
	let query = $state('');
	let selectedIndex = $state(0);
	let inputRef: HTMLInputElement | undefined = $state();
	let entityRecords = $derived(buildQuickReferenceEntityRecords(notesState.activeNotes));
	let isEntityMode = $derived(query.trim().startsWith('@'));
	let entityQuery = $derived(query.trim().slice(1).trim());

	const entityItems = $derived.by<PaletteItem[]>(() =>
		searchQuickReferenceEntities(entityRecords, entityQuery, 12).map((entry) => ({
			id: `entity-${entry.noteId}`,
			group: 'Entities',
			title: entry.title,
			subtitle: `${entry.typeLabel}${entry.keyStats.length > 0 ? ` | ${entry.keyStats.join(' | ')}` : ''}`,
			keywords: `${entry.typeLabel} ${entry.keyStats.join(' ')} ${entry.previewLines.join(' ')}`,
			noteId: entry.noteId,
			entity: entry,
			run: () => navigateToNote(entry.noteId),
			openSplit: () => {
				onopensplitview(entry.noteId);
				onclose();
			},
		})),
	);

	const noteItems = $derived.by<PaletteItem[]>(() => {
		const normalized = query.trim();
		const noteResults = !normalized
			? [...notesState.activeNotes]
					.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
					.slice(0, 8)
					.map((note) => ({
						id: `note-${note.id}`,
						group: 'Notes' as const,
						title: note.title,
						subtitle: note.filePath ?? String(note.folder),
						keywords: `${note.title} ${note.tags.join(' ')} ${note.filePath ?? note.folder}`,
						noteId: note.id,
						run: () => navigateToNote(note.id),
						openSplit: () => {
							onopensplitview(note.id);
							onclose();
						},
					}))
			: searchService
					.search(normalized)
					.slice(0, 10)
					.map((result) => ({
						id: `note-${result.id}`,
						group: 'Notes' as const,
						title: result.title,
						subtitle: result.filePath ?? String(result.folder ?? '/'),
						keywords: `${result.title} ${result.filePath ?? result.folder ?? ''}`,
						noteId: result.id,
						run: () => navigateToNote(result.id),
						openSplit: () => {
							onopensplitview(result.id);
							onclose();
						},
					}));
		return noteResults;
	});

	const commandItems = $derived.by<PaletteItem[]>(() => {
		const items: PaletteItem[] = [
			{
				id: 'action-new-note',
				group: 'Actions',
				title: 'New note',
				subtitle: 'Create and open a fresh note',
				keywords: 'create add note action',
				run: () => {
					onclose();
					void onnewnote();
				},
			},
			{
				id: 'action-template',
				group: 'Actions',
				title: 'New from template',
				subtitle: 'Start from a campaign template',
				keywords: 'template create action',
				run: () => {
					onclose();
					ontemplate();
				},
			},
			{
				id: 'action-session-recap',
				group: 'Actions',
				title: 'Generate session recap scaffold',
				subtitle: 'Create a structured session recap note',
				keywords: 'session recap scaffold template',
				run: () => {
					onclose();
					onsessionrecap();
				},
			},
			{
				id: 'action-toggle-sidebar',
				group: 'Actions',
				title: 'Toggle sidebar',
				subtitle: 'Show or hide sidebar navigation',
				keywords: 'sidebar layout action',
				run: () => {
					ui.toggleSidebar();
					onclose();
				},
			},
			{
				id: 'action-back',
				group: 'Navigation',
				title: 'Back',
				subtitle: navigationState.backEntry
					? `Go to ${navigationState.backEntry.label}`
					: 'No previous location',
				keywords: 'history back previous navigation',
				disabled: !navigationState.canGoBack,
				run: () => {
					window.history.back();
					onclose();
				},
			},
			{
				id: 'action-forward',
				group: 'Navigation',
				title: 'Forward',
				subtitle: navigationState.forwardEntry
					? `Go to ${navigationState.forwardEntry.label}`
					: 'No forward location',
				keywords: 'history forward next navigation',
				disabled: !navigationState.canGoForward,
				run: () => {
					window.history.forward();
					onclose();
				},
			},
			{
				id: 'nav-home',
				group: 'Navigation',
				title: 'Go to Home',
				subtitle: '/',
				keywords: 'home route navigation',
				run: () => navigate(resolve('/')),
			},
			{
				id: 'nav-notes',
				group: 'Navigation',
				title: 'Go to All Notes',
				subtitle: '/notes',
				keywords: 'notes list navigation',
				run: () => navigate(resolve('/notes')),
			},
			{
				id: 'nav-search',
				group: 'Navigation',
				title: 'Go to Search',
				subtitle: '/search',
				keywords: 'search route navigation',
				run: () => navigate(resolve('/search')),
			},
			{
				id: 'nav-session-board',
				group: 'Navigation',
				title: 'Go to Session Board',
				subtitle: '/session-board',
				keywords: 'board session navigation',
				run: () => navigate(resolve('/session-board')),
			},
			{
				id: 'settings-main',
				group: 'Settings',
				title: 'Open Settings',
				subtitle: 'General app settings',
				keywords: 'preferences configuration settings',
				run: () => navigate(resolve('/settings')),
			},
			{
				id: 'settings-mcp',
				group: 'Settings',
				title: 'Review MCP Changes',
				subtitle: 'Open pending MCP approvals',
				keywords: 'mcp staged pending changes settings',
				run: () => navigate(`${resolve('/settings')}?tab=mcp#mcp-changes`),
			},
		];
		for (const template of templateLibraryState.templates) {
			items.push({
				id: `action-template-${template.id}`,
				group: 'Actions',
				title: `Create: ${template.name}`,
				subtitle: `Template in ${template.defaultFolder}`,
				keywords: `template ${template.name} ${template.defaultFolder}`,
				run: () => {
					onclose();
					oncreatefromtemplate(template.id);
				},
			});
		}
		return items;
	});

	const items = $derived.by<PaletteItem[]>(() => {
		if (isEntityMode) {
			return entityItems;
		}
		const normalized = query.trim().toLowerCase();
		const filteredCommands =
			normalized.length === 0
				? commandItems
				: commandItems.filter((item) => {
						const haystack = `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase();
						return haystack.includes(normalized);
					});
		return [...filteredCommands, ...noteItems];
	});

	$effect(() => {
		if (open) {
			query = '';
			selectedIndex = 0;
			setTimeout(() => inputRef?.focus(), 0);
		}
	});

	$effect(() => {
		const maxIndex = Math.max(0, items.length - 1);
		if (selectedIndex > maxIndex) {
			selectedIndex = maxIndex;
		}
	});

	function navigateToNote(id: string): void {
		goto(resolve(`/notes/${id}`));
		onclose();
	}

	function navigate(path: string): void {
		goto(path);
		onclose();
	}

	function findNextIndex(start: number, direction: 1 | -1): number {
		if (items.length === 0) return 0;
		let index = start;
		for (let i = 0; i < items.length; i += 1) {
			index = (index + direction + items.length) % items.length;
			if (!items[index]?.disabled) return index;
		}
		return start;
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = findNextIndex(selectedIndex, 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = findNextIndex(selectedIndex, -1);
		} else if (event.key === 'Enter' && items[selectedIndex]) {
			event.preventDefault();
			const item = items[selectedIndex];
			if (!item) return;
			if (item.disabled) return;
			if ((event.ctrlKey || event.metaKey) && item.openSplit) {
				void item.openSplit();
				return;
			}
			void item.run();
		} else if (event.key === 'Escape') {
			onclose();
		}
	}

	function handleBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) onclose();
	}

	function shouldShowGroup(index: number): boolean {
		if (index === 0) return true;
		return items[index]?.group !== items[index - 1]?.group;
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/50"
		role="dialog"
		aria-modal="true"
		aria-label="Quick switcher"
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<div
			class="bg-surface dark:bg-tavern-surface rounded-lg shadow-xl border border-border dark:border-tavern-border w-full max-w-2xl mx-4 overflow-hidden"
		>
			<div class="p-3 border-b border-border dark:border-tavern-border">
				<input
					bind:this={inputRef}
					bind:value={query}
					type="text"
					placeholder="Search commands and notes... (type @ for entities)"
					class="w-full bg-transparent text-ink dark:text-tavern-text placeholder:text-ink-faint dark:placeholder:text-tavern-faint outline-none text-base"
					role="combobox"
					aria-label="Search commands and notes"
					aria-expanded={items.length > 0}
					aria-controls="quick-switcher-list"
					aria-activedescendant={items[selectedIndex] ? `qs-item-${selectedIndex}` : undefined}
				/>
			</div>

			{#if items.length > 0}
				<ul class="max-h-[52vh] overflow-y-auto py-1" role="listbox" id="quick-switcher-list">
					{#each items as item, i (item.id)}
						{#if shouldShowGroup(i)}
							<li
								class="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
							>
								{item.group}
							</li>
						{/if}
						<li role="option" aria-selected={i === selectedIndex} id={`qs-item-${i}`}>
							<button
								type="button"
								class="w-full text-left px-3 py-2 flex flex-col transition-colors disabled:opacity-50
									{i === selectedIndex
									? 'bg-accent-subtle dark:bg-tavern-accent-subtle'
									: 'hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
								onclick={() => !item.disabled && void item.run()}
								disabled={item.disabled}
								title={item.title}
							>
								{#if item.entity}
									<div class="flex items-start gap-2">
										<span
											class="h-6 w-6 mt-0.5 shrink-0 rounded-full border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt text-[11px] font-semibold flex items-center justify-center text-ink-muted dark:text-tavern-muted"
											aria-hidden="true"
										>
											{quickReferenceIconToken(item.entity.type)}
										</span>
										<div class="min-w-0 flex-1">
											<span
												class="text-sm font-medium text-ink dark:text-tavern-text truncate block"
											>
												{item.title}
											</span>
											<span class="text-xs text-ink-muted dark:text-tavern-muted truncate block">
												{item.subtitle}
											</span>
											{#if item.entity.previewLines.length > 0}
												<span
													class="text-[11px] text-ink-faint dark:text-tavern-faint truncate block mt-0.5"
												>
													{item.entity.previewLines.join(' ')}
												</span>
											{/if}
										</div>
									</div>
								{:else}
									<span class="text-sm font-medium text-ink dark:text-tavern-text truncate">
										{item.title}
									</span>
									<span class="text-xs text-ink-muted dark:text-tavern-muted truncate">
										{item.subtitle}
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="px-3 py-6 text-center text-sm text-ink-muted dark:text-tavern-muted">
					No commands or notes found
				</div>
			{/if}

			<div
				class="px-3 py-2 border-t border-border dark:border-tavern-border text-xs text-ink-faint dark:text-tavern-faint flex gap-3"
			>
				<span><kbd class="font-mono">up/down</kbd> move</span>
				<span><kbd class="font-mono">enter</kbd> run</span>
				<span><kbd class="font-mono">ctrl+enter</kbd> split</span>
				<span><kbd class="font-mono">esc</kbd> close</span>
			</div>
		</div>
	</div>
{/if}
