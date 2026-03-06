<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { searchService } from '$lib/domain/search.js';
	import {
		DEFAULT_SEARCH_SCOPE,
		describeSearchScope,
		matchesSearchScope,
		normalizeSearchScope,
		type SearchScope,
	} from '$lib/domain/search-scope.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { diceState } from '$lib/state/dice.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { templateLibraryState } from '$lib/state/template-library.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import type { Note, NoteId } from '$lib/types/note.js';
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';

	interface Props {
		open: boolean;
		onclose: () => void;
		onnewnote: () => void;
		oncreatehandout: () => void;
		onopendicetray: () => void;
		onopengenerator: () => void;
		ontemplate: (folderOverride?: string) => void;
		oncreatefromtemplate: (templateId: string) => void;
		onsessionrecap: () => void;
		onopensplitview: (noteId: NoteId) => void;
		ontoggleplayermode: () => void;
	}

	type PaletteMode = 'notes' | 'commands' | 'tags' | 'sections';
	type PaletteGroup = 'Notes' | 'Commands' | 'Sections';

	interface PaletteItem {
		id: string;
		group: PaletteGroup;
		title: string;
		subtitle: string;
		keywords: string;
		disabled?: boolean;
		run: () => void | Promise<void>;
		openSplit?: () => void | Promise<void>;
	}

	interface ScopeOption {
		id: string;
		label: string;
		scope: SearchScope;
	}

	interface SectionDestination {
		id: string;
		title: string;
		path: string;
		description: string;
		keywords: string;
	}

	const SECTION_DESTINATIONS: SectionDestination[] = [
		{
			id: 'knowledge-home',
			title: 'Knowledge',
			path: '/knowledge',
			description: 'Knowledge section root',
			keywords: 'knowledge section notes worldbuilding lore',
		},
		{
			id: 'knowledge-notes',
			title: 'Knowledge Notes',
			path: '/knowledge/notes',
			description: 'All notes and folders',
			keywords: 'knowledge notes list folder browse',
		},
		{
			id: 'knowledge-search',
			title: 'Knowledge Search',
			path: '/knowledge/search',
			description: 'Search and discovery',
			keywords: 'knowledge search discover operators',
		},
		{
			id: 'knowledge-graph',
			title: 'Knowledge Graph',
			path: '/knowledge/graph',
			description: 'Link graph view',
			keywords: 'knowledge graph links network',
		},
		{
			id: 'atlas-maps',
			title: 'Atlas Maps',
			path: '/atlas/maps',
			description: 'Map library and hierarchy',
			keywords: 'atlas maps world map navigation',
		},
		{
			id: 'session-boards',
			title: 'Session Boards',
			path: '/session/boards',
			description: 'Live session board',
			keywords: 'session board scene dm tools',
		},
		{
			id: 'session-encounter',
			title: 'Session Encounter Builder',
			path: '/session/encounter/new',
			description: 'Encounter setup workflow',
			keywords: 'session encounter builder combat prep',
		},
		{
			id: 'session-combat',
			title: 'Session Combat Tracker',
			path: '/session/combat',
			description: 'Combat tracker controls',
			keywords: 'session combat initiative tracker',
		},
		{
			id: 'campaign-timeline',
			title: 'Campaign Timeline',
			path: '/campaign/timeline',
			description: 'Campaign chronology',
			keywords: 'campaign timeline events',
		},
		{
			id: 'settings',
			title: 'Settings',
			path: '/settings',
			description: 'Application settings',
			keywords: 'settings preferences configuration',
		},
		{
			id: 'player',
			title: 'Player Screen',
			path: '/player',
			description: 'Player-facing display',
			keywords: 'player screen shared display',
		},
	];

	let {
		open = $bindable(),
		onclose,
		onnewnote,
		oncreatehandout,
		onopendicetray,
		onopengenerator,
		ontemplate,
		oncreatefromtemplate,
		onsessionrecap,
		onopensplitview,
		ontoggleplayermode,
	}: Props = $props();

	let query = $state('');
	let selectedIndex = $state(0);
	let lastSelectionSignature = $state('');
	let wasOpen = $state(false);
	let inputRef: HTMLInputElement | undefined = $state();
	let returnFocusTarget: HTMLElement | null = $state(null);
	let noteScope = $state<SearchScope>({ ...DEFAULT_SEARCH_SCOPE });

	let modeScopedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);

	let currentFolderScopeValue = $derived.by(() => {
		const noteId = navigationState.currentEntry?.noteId;
		if (!noteId) return null;
		const note = notesState.getActiveNoteById(noteId);
		if (!note) return null;
		return String(note.folder);
	});

	let scopeOptions = $derived.by<ScopeOption[]>(() => {
		const options: ScopeOption[] = [
			{
				id: 'scope-all',
				label: 'All notes',
				scope: { ...DEFAULT_SEARCH_SCOPE },
			},
			{
				id: 'scope-npc',
				label: 'NPCs only',
				scope: { kind: 'type', value: 'npc' },
			},
		];
		if (currentFolderScopeValue) {
			options.splice(1, 0, {
				id: 'scope-folder-current',
				label: `In ${currentFolderScopeValue}`,
				scope: { kind: 'folder', value: currentFolderScopeValue },
			});
		}
		return options;
	});

	const mode = $derived.by<PaletteMode>(() => {
		const trimmed = query.trim();
		if (trimmed.startsWith('>')) return 'commands';
		if (trimmed.startsWith('#')) return 'tags';
		if (trimmed.startsWith('/')) return 'sections';
		return 'notes';
	});

	const modeLabel = $derived.by(() => {
		if (mode === 'commands') return 'Commands mode';
		if (mode === 'tags') return 'Tag filter mode';
		if (mode === 'sections') return 'Section navigation mode';
		return 'Note navigation mode';
	});

	const modeQuery = $derived.by(() => {
		const trimmed = query.trim();
		if (mode === 'notes') return trimmed;
		return trimmed.slice(1).trim();
	});

	const scopeLabel = $derived(describeSearchScope(noteScope));
	const notesModeActive = $derived(mode === 'notes' || mode === 'tags');

	$effect(() => {
		if (noteScope.kind === 'folder' && !currentFolderScopeValue) {
			noteScope = { ...DEFAULT_SEARCH_SCOPE };
		}
	});

	function readNoteType(note: Note): string | null {
		const value = note.frontmatter.type;
		if (typeof value !== 'string') return null;
		const normalized = value.trim().toLowerCase();
		return normalized || null;
	}

	function normalizeTag(value: string): string {
		return value.trim().replace(/^#/, '').toLowerCase();
	}

	function asNoteItem(note: Note): PaletteItem {
		const type = readNoteType(note);
		const typePrefix = type ? `[${type}] ` : '';
		const tagsPreview = note.tags.length > 0 ? ` | #${note.tags.slice(0, 3).join(' #')}` : '';
		return {
			id: `note-${note.id}`,
			group: 'Notes',
			title: note.title,
			subtitle: `${typePrefix}${note.filePath ?? String(note.folder)}${tagsPreview}`,
			keywords: `${note.title} ${note.content} ${note.tags.join(' ')} ${note.filePath ?? note.folder}`,
			run: () => {
				navigateToNote(note.id);
			},
			openSplit: () => {
				onopensplitview(note.id);
				closePalette();
			},
		};
	}

	const noteItems = $derived.by<PaletteItem[]>(() => {
		if (mode !== 'notes') return [];
		const normalized = modeQuery.toLowerCase();
		if (!normalized) {
			return [...modeScopedNotes]
				.filter((note) =>
					matchesSearchScope(
						{
							folder: String(note.folder),
							type: readNoteType(note),
						},
						noteScope,
					),
				)
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.slice(0, 12)
				.map((note) => asNoteItem(note));
		}

		const matched = searchService.search(normalized);
		const items: PaletteItem[] = [];
		for (const result of matched.slice(0, 24)) {
			const note = notesState.getActiveNoteById(result.id);
			if (!note) continue;
			if (
				!matchesSearchScope(
					{
						folder: String(note.folder),
						type: readNoteType(note),
					},
					noteScope,
				)
			) {
				continue;
			}
			items.push(asNoteItem(note));
		}
		return items;
	});

	const tagItems = $derived.by<PaletteItem[]>(() => {
		if (mode !== 'tags') return [];
		const tagSearch = normalizeTag(modeQuery);
		const tagged = modeScopedNotes
			.filter((note) => {
				if (
					!matchesSearchScope({ folder: String(note.folder), type: readNoteType(note) }, noteScope)
				) {
					return false;
				}
				if (!tagSearch) {
					return note.tags.length > 0;
				}
				return note.tags.some((tag) => normalizeTag(tag).includes(tagSearch));
			})
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 24);
		return tagged.map((note) => asNoteItem(note));
	});

	const commandItems = $derived.by<PaletteItem[]>(() => {
		const items: PaletteItem[] = [
			{
				id: 'command-create-note',
				group: 'Commands',
				title: 'Create note',
				subtitle: playerModeState.enabled
					? 'Unavailable while Player Mode is active'
					: 'Create and open a fresh note',
				keywords: 'create note new',
				disabled: playerModeState.enabled,
				run: () => {
					closePalette();
					void onnewnote();
				},
			},
			{
				id: 'command-switch-session',
				group: 'Commands',
				title: 'Switch to Session mode',
				subtitle: playerModeState.enabled
					? 'Unavailable while Player Mode is active'
					: 'Open Session Boards',
				keywords: 'switch session mode board',
				disabled: playerModeState.enabled,
				run: () => navigate(resolve('/session/boards')),
			},
			{
				id: 'command-open-settings-vault',
				group: 'Commands',
				title: 'Open settings -> Vault',
				subtitle: 'Open vault health and maintenance controls',
				keywords: 'settings vault health repair',
				run: () => navigate(`${resolve('/settings')}?tab=vault`),
			},
			{
				id: 'command-toggle-theme',
				group: 'Commands',
				title: 'Toggle dark mode',
				subtitle: ui.resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
				keywords: 'theme dark light toggle',
				run: async () => {
					const nextTheme = ui.resolvedTheme === 'dark' ? 'light' : 'dark';
					await ui.setTheme(nextTheme);
					closePalette();
				},
			},
			{
				id: 'command-roll-1d20',
				group: 'Commands',
				title: 'Roll 1d20',
				subtitle: 'Quick single d20 roll',
				keywords: 'dice roll d20',
				run: () => {
					const attempt = diceState.roll('1d20', 'command_palette');
					if (attempt.ok) {
						closePalette();
					}
				},
			},
			{
				id: 'command-open-dice-tray',
				group: 'Commands',
				title: 'Open Dice Tray',
				subtitle: 'Roll expressions and review history',
				keywords: 'dice tray roll history',
				run: () => {
					onopendicetray();
					closePalette();
				},
			},
			{
				id: 'command-template',
				group: 'Commands',
				title: 'Create from template',
				subtitle: playerModeState.enabled
					? 'Unavailable while Player Mode is active'
					: 'Open template picker',
				keywords: 'template create note',
				disabled: playerModeState.enabled,
				run: () => {
					closePalette();
					ontemplate();
				},
			},
			{
				id: 'command-create-handout',
				group: 'Commands',
				title: 'Create handout',
				subtitle: playerModeState.enabled
					? 'Unavailable while Player Mode is active'
					: 'Open handout creator',
				keywords: 'handout create',
				disabled: playerModeState.enabled,
				run: () => {
					closePalette();
					oncreatehandout();
				},
			},
			{
				id: 'command-session-recap',
				group: 'Commands',
				title: 'Generate session recap scaffold',
				subtitle: playerModeState.enabled
					? 'Unavailable while Player Mode is active'
					: 'Create a recap note from template',
				keywords: 'session recap scaffold template',
				disabled: playerModeState.enabled,
				run: () => {
					closePalette();
					onsessionrecap();
				},
			},
			{
				id: 'command-toggle-sidebar',
				group: 'Commands',
				title: 'Toggle local navigation',
				subtitle: 'Show or hide the local navigation panel',
				keywords: 'sidebar local navigation toggle',
				run: () => {
					ui.toggleSidebar();
					closePalette();
				},
			},
			{
				id: 'command-toggle-player-mode',
				group: 'Commands',
				title: playerModeState.enabled ? 'Exit Player Mode' : 'Enter Player Mode',
				subtitle: playerModeState.enabled
					? 'Return to DM-only content'
					: 'Switch to player-visible content boundary',
				keywords: 'player mode dm mode toggle',
				run: () => {
					closePalette();
					ontoggleplayermode();
				},
			},
			{
				id: 'command-back',
				group: 'Commands',
				title: 'Back',
				subtitle: navigationState.backEntry
					? `Back to ${navigationState.backEntry.label}`
					: 'No previous location',
				keywords: 'back history navigation',
				disabled: !navigationState.canGoBack,
				run: () => {
					window.history.back();
					closePalette();
				},
			},
			{
				id: 'command-forward',
				group: 'Commands',
				title: 'Forward',
				subtitle: navigationState.forwardEntry
					? `Forward to ${navigationState.forwardEntry.label}`
					: 'No forward location',
				keywords: 'forward history navigation',
				disabled: !navigationState.canGoForward,
				run: () => {
					window.history.forward();
					closePalette();
				},
			},
			{
				id: 'command-open-generator',
				group: 'Commands',
				title: 'Open Generator Panel',
				subtitle: playerModeState.enabled
					? 'Unavailable while Player Mode is active'
					: 'Open random tables and macro helpers',
				keywords: 'generator random tables macros',
				disabled: playerModeState.enabled,
				run: () => {
					onopengenerator();
					closePalette();
				},
			},
		];

		for (const template of templateLibraryState.templates) {
			items.push({
				id: `command-template-${template.id}`,
				group: 'Commands',
				title: `Create: ${template.name}`,
				subtitle: `Template in ${template.defaultFolder}`,
				keywords: `template create ${template.name} ${template.defaultFolder}`,
				disabled: playerModeState.enabled,
				run: () => {
					closePalette();
					oncreatefromtemplate(template.id);
				},
			});
		}

		for (const macro of diceState.macros) {
			items.push({
				id: `command-macro-${macro.id}`,
				group: 'Commands',
				title: `Roll: ${macro.label}`,
				subtitle: macro.expression,
				keywords: `dice macro roll ${macro.label} ${macro.expression}`,
				run: () => {
					const attempt = diceState.rollMacro(macro, 'command_palette');
					if (attempt.ok) {
						closePalette();
					}
				},
			});
		}

		if (mode !== 'commands') {
			return [];
		}

		const normalized = modeQuery.toLowerCase();
		if (!normalized) return items;
		return items.filter((item) => {
			const haystack = `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase();
			return haystack.includes(normalized);
		});
	});

	const sectionItems = $derived.by<PaletteItem[]>(() => {
		if (mode !== 'sections') return [];
		const normalized = modeQuery.toLowerCase();
		const filtered =
			normalized.length === 0
				? SECTION_DESTINATIONS
				: SECTION_DESTINATIONS.filter((entry) => {
						const haystack =
							`${entry.title} ${entry.description} ${entry.keywords} ${entry.path}`.toLowerCase();
						return haystack.includes(normalized);
					});
		return filtered.map((entry) => ({
			id: `section-${entry.id}`,
			group: 'Sections',
			title: entry.title,
			subtitle: entry.path,
			keywords: `${entry.description} ${entry.keywords}`,
			disabled:
				playerModeState.enabled &&
				(entry.id === 'session-boards' ||
					entry.id === 'session-encounter' ||
					entry.id === 'session-combat' ||
					entry.id === 'campaign-timeline'),
			run: () => navigate(entry.path),
		}));
	});

	const items = $derived.by<PaletteItem[]>(() => {
		if (mode === 'commands') return commandItems;
		if (mode === 'sections') return sectionItems;
		if (mode === 'tags') return tagItems;
		return noteItems;
	});

	function firstEnabledIndex(): number {
		const index = items.findIndex((item) => !item.disabled);
		return index >= 0 ? index : 0;
	}

	$effect(() => {
		if (open && !wasOpen) {
			returnFocusTarget =
				typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
					? document.activeElement
					: null;
			query = '';
			noteScope = { ...DEFAULT_SEARCH_SCOPE };
			selectedIndex = firstEnabledIndex();
			lastSelectionSignature = '';
			setTimeout(() => inputRef?.focus(), 0);
			void diceState.ensureMacrosLoaded();
		}
		wasOpen = open;
	});

	$effect(() => {
		const signature = `${mode}|${modeQuery.toLowerCase()}|${noteScope.kind}|${noteScope.value ?? ''}`;
		if (signature !== lastSelectionSignature) {
			lastSelectionSignature = signature;
			selectedIndex = firstEnabledIndex();
		}
		const maxIndex = Math.max(0, items.length - 1);
		if (selectedIndex > maxIndex) {
			selectedIndex = maxIndex;
		}
		if (items[selectedIndex]?.disabled) {
			selectedIndex = firstEnabledIndex();
		}
	});

	function setScope(scope: SearchScope): void {
		noteScope = normalizeSearchScope(scope);
	}

	function closePalette(): void {
		open = false;
		onclose();
		const target = returnFocusTarget;
		setTimeout(() => {
			if (!target) return;
			if (typeof document !== 'undefined' && !document.contains(target)) return;
			target.focus();
		}, 0);
	}

	function navigateToNote(id: string): void {
		goto(resolve(`/knowledge/notes/${id}`));
		closePalette();
	}

	function navigate(path: string): void {
		goto(path);
		closePalette();
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
		if (event.key === 'Escape') {
			event.preventDefault();
			closePalette();
			return;
		}

		const target = event.target as HTMLElement;
		const inputActive = target === inputRef;
		const resultActive = target.closest('[data-command-palette-option]') !== null;
		if (!inputActive && !resultActive) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = findNextIndex(selectedIndex, 1);
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = findNextIndex(selectedIndex, -1);
			return;
		}

		if (event.key === 'Enter' && items[selectedIndex]) {
			event.preventDefault();
			const item = items[selectedIndex];
			if (!item || item.disabled) return;
			if ((event.ctrlKey || event.metaKey) && item.openSplit) {
				void item.openSplit();
				return;
			}
			void item.run();
		}
	}

	function handleBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) closePalette();
	}

	function shouldShowGroup(index: number): boolean {
		if (index === 0) return true;
		return items[index]?.group !== items[index - 1]?.group;
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[9vh]"
		role="dialog"
		aria-modal="true"
		aria-label="Command palette"
		use:focusTrap
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<div
			class="mx-4 w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg"
		>
			<div class="border-b border-border p-3">
				<input
					bind:this={inputRef}
					bind:value={query}
					type="text"
					placeholder="Type to find notes | > commands | # tags | / sections"
					class="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
					role="combobox"
					aria-label="Command palette query"
					aria-expanded={items.length > 0}
					aria-controls="command-palette-list"
					aria-activedescendant={items[selectedIndex]
						? `command-palette-item-${selectedIndex}`
						: undefined}
				/>
				<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
					<span class="rounded-md bg-surface-alt px-2 py-1 text-ink-muted">{modeLabel}</span>
					{#if notesModeActive}
						<span class="rounded-md border border-border px-2 py-1 text-ink-muted"
							>{scopeLabel}</span
						>
					{/if}
				</div>
				{#if notesModeActive}
					<div class="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Search scope selector">
						{#each scopeOptions as option (option.id)}
							<button
								type="button"
								data-scope-selector="true"
								class="rounded-md border px-2 py-1 text-xs {noteScope.kind === option.scope.kind &&
								noteScope.value === option.scope.value
									? 'border-accent bg-accent-subtle text-accent'
									: 'border-border text-ink-muted'}"
								onclick={() => setScope(option.scope)}
								aria-pressed={noteScope.kind === option.scope.kind &&
									noteScope.value === option.scope.value}
							>
								{option.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if items.length > 0}
				<ul class="max-h-[54vh] overflow-y-auto py-1" role="listbox" id="command-palette-list">
					{#each items as item, i (item.id)}
						{#if shouldShowGroup(i)}
							<li
								class="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-ink-faint"
							>
								{item.group}
							</li>
						{/if}
						<li role="option" aria-selected={i === selectedIndex} id={`command-palette-item-${i}`}>
							<button
								type="button"
								data-command-palette-option="true"
								class="w-full px-3 py-2 text-left transition-colors disabled:opacity-50 {i ===
								selectedIndex
									? 'bg-accent-subtle'
									: 'hover:bg-surface-alt'}"
								onclick={() => !item.disabled && void item.run()}
								disabled={item.disabled}
								title={item.title}
							>
								<span class="block truncate text-sm font-medium text-ink">
									{item.title}
								</span>
								<span class="block truncate text-xs text-ink-muted">
									{item.subtitle}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="px-3 py-6 text-center text-sm text-ink-muted">
					No results found for this mode
				</div>
			{/if}

			<div class="flex flex-wrap gap-3 border-t border-border px-3 py-2 text-xs text-ink-faint">
				<span><kbd class="font-mono">up/down</kbd> move</span>
				<span><kbd class="font-mono">enter</kbd> activate</span>
				<span><kbd class="font-mono">tab</kbd> scope controls</span>
				<span><kbd class="font-mono">esc</kbd> close</span>
			</div>
		</div>
	</div>
{/if}
