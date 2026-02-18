<script lang="ts">
	import '../app.css';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import Toast from '$lib/components/common/Toast.svelte';
	import { notesState } from '$lib/stores/notes.svelte.js';
	import { linksState } from '$lib/stores/links.svelte.js';
	import { runtimeState } from '$lib/stores/runtime.svelte.js';
	import { mcpChangesState } from '$lib/stores/mcp-changes.svelte.js';
	import { sessionBoardsState } from '$lib/stores/session-boards.svelte.js';
	import { toastState } from '$lib/stores/toast.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';
	import { searchService } from '$lib/services/search.js';
	import { refreshDesktopVault } from '$lib/desktop/bridge.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { NoteTemplate } from '$lib/services/templates.js';
	import { createFolderId } from '$lib/types/note.js';

	let { children } = $props();
	let quickSwitcherOpen = $state(false);
	let templateDialogOpen = $state(false);

	$effect(() => {
		void runtimeState.initialize();
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.classList.toggle('dark', ui.resolvedTheme === 'dark');
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const handler = (): void => ui.checkMobile();
		window.addEventListener('resize', handler);
		return () => window.removeEventListener('resize', handler);
	});

	async function handleNewNote(): Promise<void> {
		const note = await notesState.createNote();
		goto(resolve(`/notes/${note.id}/edit`));
	}

	async function handleTemplateCreate(template: NoteTemplate): Promise<void> {
		templateDialogOpen = false;
		const note = await notesState.createNote({
			title: `${template.name} - Untitled`,
			content: template.content,
			tags: [...template.defaultTags],
			folder: createFolderId(template.defaultFolder),
		});
		goto(resolve(`/notes/${note.id}/edit`));
	}

	function handleRetryInit(): void {
		void runtimeState.initialize();
	}

	async function handleRefreshVault(): Promise<void> {
		try {
			await refreshDesktopVault();
			await notesState.loadAll();
			await Promise.all([
				searchService.buildIndex(notesState.notes),
				linksState.buildGraph(),
				mcpChangesState.refresh(),
				sessionBoardsState.loadAll(),
			]);
			toastState.success('Vault refreshed');
		} catch (error) {
			toastState.error(`Failed to refresh vault: ${String(error)}`);
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		const mod = event.ctrlKey || event.metaKey;
		const target = event.target as HTMLElement;
		const isInEditor = target.closest('.cm-editor') !== null;

		if (mod && event.key === 'p') {
			event.preventDefault();
			quickSwitcherOpen = true;
		} else if (mod && event.key === 'n') {
			event.preventDefault();
			void handleNewNote();
		} else if (mod && event.key === 'b' && !isInEditor) {
			event.preventDefault();
			ui.toggleSidebar();
		} else if (mod && event.shiftKey && event.key === 'F') {
			event.preventDefault();
			goto(resolve('/search'));
		}
	}
</script>

<svelte:head>
	<title>DND Tools</title>
	<meta name="description" content="D&D campaign note-taking app with wikilinks and bidirectional linking" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if runtimeState.ready}
	<AppShell
		onnewnote={handleNewNote}
		onsearch={() => (quickSwitcherOpen = true)}
		ontemplate={() => (templateDialogOpen = true)}
		onrefresh={handleRefreshVault}
	>
		{@render children()}
	</AppShell>
	{#if quickSwitcherOpen}
		{#await import('$lib/components/search/QuickSwitcher.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then QuickSwitcherModule}
			<QuickSwitcherModule.default
				bind:open={quickSwitcherOpen}
				onclose={() => (quickSwitcherOpen = false)}
			/>
		{/await}
	{/if}
	{#if templateDialogOpen}
		{#await import('$lib/components/common/TemplateDialog.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then TemplateDialogModule}
			<TemplateDialogModule.default
				open={templateDialogOpen}
				onclose={() => (templateDialogOpen = false)}
				oncreate={handleTemplateCreate}
			/>
		{/await}
	{/if}
	<Toast />
{:else if runtimeState.error}
	<div class="flex h-screen items-center justify-center bg-parchment dark:bg-tavern-bg">
		<div class="text-center max-w-md p-6 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface">
			<p class="text-lg font-semibold text-ink dark:text-tavern-text">Failed to load vault</p>
			<p class="text-sm text-ink-muted dark:text-tavern-muted mt-2">{runtimeState.error}</p>
			<button
				class="mt-4 px-3 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover dark:bg-tavern-accent dark:text-tavern-bg dark:hover:bg-tavern-accent-hover"
				onclick={handleRetryInit}
			>
				Retry
			</button>
		</div>
	</div>
{:else}
	<div class="flex h-screen items-center justify-center bg-parchment dark:bg-tavern-bg">
		<div class="text-center animate-fade-in">
			<div class="mb-4 flex justify-center">
				<img
					src="/app-icon.svg"
					alt=""
					class="w-12 h-12 rounded-xl ring-1 ring-black/10 dark:ring-white/10 shadow-sm"
				/>
			</div>
			<p class="text-lg font-semibold text-ink dark:text-tavern-text">DND Tools</p>
			<div class="flex items-center justify-center gap-2 mt-3">
				<div class="w-4 h-4 border-2 border-accent/30 dark:border-tavern-accent/30 border-t-accent dark:border-t-tavern-accent rounded-full animate-spin"></div>
				<p class="text-sm text-ink-muted dark:text-tavern-muted">Loading your vault...</p>
			</div>
		</div>
	</div>
{/if}

