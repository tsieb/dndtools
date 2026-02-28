<script lang="ts">
	import '../app.css';
	import AppShell from '$lib/ui/layout/AppShell.svelte';
	import Toast from '$lib/ui/common/Toast.svelte';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { runtimeState } from '$lib/state/runtime.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { vaultHealthState } from '$lib/state/vaultHealth.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { searchService } from '$lib/domain/search.js';
	import { refreshDesktopVault } from '$lib/platform/desktop/bridge.js';
	import {
		installGlobalRuntimeDiagnostics,
		markSubsystemSuccess,
		reportRuntimeError,
	} from '$lib/runtime/diagnostics.js';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { DND_TEMPLATES, type NoteTemplate } from '$lib/domain/templates.js';
	import { createNoteId } from '$lib/types/note.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import {
		buildTemplateContext,
		renderNoteTemplate,
		toNewNoteOverrides,
	} from '$lib/domain/template-automation.js';
	import type { AppSettings } from '$lib/types/settings.js';

	let { children } = $props();
	let quickSwitcherOpen = $state(false);
	let templateDialogOpen = $state(false);
	let activeTemplateFolder = $derived.by(() => page.url.searchParams.get('folder'));

	function routeLabel(url: URL): string {
		const { pathname, searchParams } = url;
		if (pathname === '/') return 'Home';
		if (pathname === '/notes') {
			const tag = searchParams.get('tag');
			const folder = searchParams.get('folder');
			if (tag) return `Notes #${tag}`;
			if (folder) return `Notes ${folder}`;
			return 'All Notes';
		}
		if (pathname === '/search') return 'Search';
		if (pathname === '/graph') return 'Graph';
		if (pathname === '/session-board') return 'Session Board';
		if (pathname === '/settings') return 'Settings';
		return pathname;
	}

	$effect(() => {
		void runtimeState.initialize();
		installGlobalRuntimeDiagnostics();
	});

	$effect(() => {
		if (runtimeState.ready) {
			void vaultHealthState.refresh();
		}
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

	$effect(() => {
		const routeId = page.route.id;
		if (routeId === '/search') {
			void onboardingState.completeStep('use_search');
		} else if (routeId === '/settings') {
			void onboardingState.completeStep('open_settings');
		}
	});

	afterNavigate(({ to }) => {
		const next = to?.url;
		if (!next) return;
		const pathWithSearch = `${next.pathname}${next.search}`;
		const noteMatch = next.pathname.match(/^\/notes\/([^/]+)(?:\/(edit))?$/);
		if (noteMatch) {
			const noteId = createNoteId(decodeURIComponent(noteMatch[1] ?? ''));
			const isEdit = noteMatch[2] === 'edit';
			const note = notesState.getNoteById(noteId);
			const title = note?.title ?? `Note ${noteId}`;
			navigationState.record(pathWithSearch, {
				label: isEdit ? `${title} (Edit)` : title,
				noteId,
			});
			return;
		}

		navigationState.record(pathWithSearch, { label: routeLabel(next) });
	});

	$effect(() => {
		const current = navigationState.currentEntry;
		if (!current?.noteId) return;
		const note = notesState.getNoteById(current.noteId);
		if (!note) return;
		const label = page.url.pathname.endsWith('/edit') ? `${note.title} (Edit)` : note.title;
		if (current.label !== label) {
			navigationState.updateCurrentLabel(label);
		}
	});

	async function handleNewNote(): Promise<void> {
		const note = await notesState.createNote();
		goto(resolve(`/notes/${note.id}/edit`));
	}

	function shouldAdvanceSessionCounter(templateId: string): boolean {
		return (
			templateId === 'session' || templateId === 'session-prep' || templateId === 'session-recap'
		);
	}

	async function loadTemplateContextSetting(): Promise<AppSettings['templateContext']> {
		return getStorage().getSetting('templateContext');
	}

	async function handleTemplateCreate(
		template: NoteTemplate,
		folderOverride?: string,
	): Promise<void> {
		templateDialogOpen = false;
		const storage = getStorage();
		const setting = await loadTemplateContextSetting();
		const context = buildTemplateContext(setting);
		const rendered = renderNoteTemplate(template, context, folderOverride);
		const note = await notesState.createNote(toNewNoteOverrides(rendered));
		if (shouldAdvanceSessionCounter(template.id)) {
			await storage.setSetting('templateContext', {
				...setting,
				sessionNumber: context.sessionNumber + 1,
			});
		}
		goto(resolve(`/notes/${note.id}/edit`));
	}

	async function handleCreateFromTemplateId(templateId: string): Promise<void> {
		const template = DND_TEMPLATES.find((entry) => entry.id === templateId);
		if (!template) return;
		await handleTemplateCreate(template);
	}

	async function handleSessionRecapScaffold(): Promise<void> {
		await handleCreateFromTemplateId('session-recap');
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
				mcpChangesState.refresh(),
				sessionBoardsState.loadAll(),
			]);
			await Promise.all([
				markSubsystemSuccess('vault_sync'),
				markSubsystemSuccess('search_index'),
				markSubsystemSuccess('link_graph_build'),
			]);
			toastState.success('Vault refreshed');
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				error,
				code: 'VAULT_REFRESH_FAILED',
			});
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
	<meta
		name="description"
		content="D&D campaign note-taking app with wikilinks and bidirectional linking"
	/>
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
		{#await import('$lib/ui/search/QuickSwitcher.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then QuickSwitcherModule}
			<QuickSwitcherModule.default
				bind:open={quickSwitcherOpen}
				onclose={() => (quickSwitcherOpen = false)}
				onnewnote={handleNewNote}
				ontemplate={() => (templateDialogOpen = true)}
				oncreatefromtemplate={(templateId: string) => void handleCreateFromTemplateId(templateId)}
				onsessionrecap={() => void handleSessionRecapScaffold()}
			/>
		{/await}
	{/if}
	{#if templateDialogOpen}
		{#await import('$lib/ui/common/TemplateDialog.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then TemplateDialogModule}
			<TemplateDialogModule.default
				open={templateDialogOpen}
				activeFolder={activeTemplateFolder}
				onclose={() => (templateDialogOpen = false)}
				oncreate={handleTemplateCreate}
			/>
		{/await}
	{/if}
	<Toast />
{:else if runtimeState.migrationReport}
	{#await import('$lib/ui/migration/MigrationReadinessScreen.svelte')}
		<div class="flex h-screen items-center justify-center bg-parchment dark:bg-tavern-bg">
			<p class="text-sm text-ink-muted dark:text-tavern-muted">Loading upgrade screen…</p>
		</div>
	{:then MigrationModule}
		<MigrationModule.default
			report={runtimeState.migrationReport}
			applying={runtimeState.applyingMigration}
			error={runtimeState.migrationError}
			onapply={() => void runtimeState.applyMigration()}
		/>
	{/await}
{:else if runtimeState.error}
	<div class="flex h-screen items-center justify-center bg-parchment dark:bg-tavern-bg">
		<div
			class="text-center max-w-md p-6 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
		>
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
				<div
					class="w-4 h-4 border-2 border-accent/30 dark:border-tavern-accent/30 border-t-accent dark:border-t-tavern-accent rounded-full animate-spin"
				></div>
				<p class="text-sm text-ink-muted dark:text-tavern-muted">Loading your vault...</p>
			</div>
		</div>
	</div>
{/if}
