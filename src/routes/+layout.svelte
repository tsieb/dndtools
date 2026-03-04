<script lang="ts">
	import '../app.css';
	import AppShell from '$lib/ui/layout/AppShell.svelte';
	import Toast from '$lib/ui/common/Toast.svelte';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { runtimeState } from '$lib/state/runtime.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { vaultHealthState } from '$lib/state/vaultHealth.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { handoutsState } from '$lib/state/handouts.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { a11yAnnouncerState } from '$lib/state/a11y-announcer.svelte.js';
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
	import { createFolderId, createNoteId } from '$lib/types/note.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { settingsStorageState } from '$lib/state/settings-storage.svelte.js';
	import { templateLibraryState } from '$lib/state/template-library.svelte.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { mobileKeyboardState } from '$lib/state/mobile-keyboard.svelte.js';
	import { syncState } from '$lib/state/sync.svelte.js';
	import { pwaState } from '$lib/state/pwa.svelte.js';
	import LiveAnnouncer from '$lib/ui/a11y/LiveAnnouncer.svelte';
	import InstallPromptBanner from '$lib/ui/pwa/InstallPromptBanner.svelte';
	import { registerSW } from 'virtual:pwa-register';
	import {
		buildTemplateContext,
		getFolderScopedTemplateMatches,
		renderNoteTemplate,
		toNewNoteOverrides,
	} from '$lib/domain/template-automation.js';
	import type { AppSettings } from '$lib/types/settings.js';
	import type { NoteTemplate } from '$lib/types/template-library.js';
	import type { WorldCalendar } from '$lib/types/world-calendar.js';

	let { children } = $props();
	let quickSwitcherOpen = $state(false);
	let sessionQuickPanelOpen = $state(false);
	let diceTrayOpen = $state(false);
	let generatorOpen = $state(false);
	let quickReferenceOverlayOpen = $state(false);
	let quickReferenceSplitNoteId = $state<string | null>(null);
	let templateDialogOpen = $state(false);
	let handoutCreatorOpen = $state(false);
	let templateDialogFolderOverride = $state<string | null>(null);
	let templateDialogCandidates = $state<readonly NoteTemplate[] | null>(null);
	let lastAnnouncedRoute = $state<string | null>(null);
	let runtimeBootstrapRequested = false;
	let activeTemplateFolder = $derived.by(
		() => templateDialogFolderOverride ?? page.url.searchParams.get('folder'),
	);

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
		if (pathname === '/timeline') return 'Timeline';
		if (pathname === '/session-board') return 'Session Board';
		if (pathname === '/encounter/new') return 'Encounter Builder';
		if (pathname === '/combat') return 'Combat Tracker';
		if (pathname === '/settings') return 'Settings';
		if (pathname === '/player') return 'Player View';
		return pathname;
	}

	$effect(() => {
		if (runtimeBootstrapRequested) return;
		runtimeBootstrapRequested = true;
		void runtimeState.initialize();
		installGlobalRuntimeDiagnostics();
	});

	$effect(() => {
		if (runtimeState.ready) {
			void vaultHealthState.refresh();
			if (!templateLibraryState.loading) {
				void templateLibraryState.refresh();
			}
			if (!worldCalendarState.loaded && !worldCalendarState.loading) {
				void worldCalendarState.load();
			}
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
		if (typeof window === 'undefined') return;
		mobileKeyboardState.initialize();
		return () => mobileKeyboardState.dispose();
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		return () => syncState.dispose();
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		pwaState.initialize();
		registerSW({
			immediate: true,
			onOfflineReady: () => {
				pwaState.markServiceWorkerReady();
			},
			onRegisteredSW: () => {
				pwaState.markServiceWorkerReady();
			},
			onRegisterError: (error) => {
				void reportRuntimeError({
					category: 'ui_runtime',
					code: 'PWA_REGISTER_FAILED',
					error,
				});
			},
		});
		return () => pwaState.dispose();
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const handleOpen = (): void => {
			if (playerModeState.enabled) return;
			handoutCreatorOpen = true;
		};
		window.addEventListener('dndtools:open-handout-creator', handleOpen);
		return () => window.removeEventListener('dndtools:open-handout-creator', handleOpen);
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
			pwaState.recordNoteOpened(String(noteId));
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

	$effect(() => {
		if (page.url.pathname.startsWith('/player') && !playerModeState.enabled) {
			void playerModeState.setEnabled(true);
		}
	});

	$effect(() => {
		const routeKey = `${page.url.pathname}${page.url.search}`;
		if (routeKey === lastAnnouncedRoute) return;
		lastAnnouncedRoute = routeKey;
		a11yAnnouncerState.announceAssertive(`${routeLabel(page.url)} view loaded.`);
	});

	$effect(() => {
		if (!playerModeState.enabled) return;
		if (
			page.url.pathname === '/graph' ||
			page.url.pathname === '/timeline' ||
			page.url.pathname === '/session-board' ||
			page.url.pathname === '/encounter/new' ||
			page.url.pathname === '/combat'
		) {
			goto(resolve('/player'));
		}
	});

	function normalizeFolderContext(folder: string | null | undefined): string | null {
		if (!folder) return null;
		const normalized = folder.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
		return normalized ? `/${normalized}` : '/';
	}

	function resolveFolderContext(folderOverride?: string): string | null {
		return normalizeFolderContext(folderOverride ?? page.url.searchParams.get('folder'));
	}

	function openTemplateDialog(
		folderOverride?: string | null,
		candidates?: readonly NoteTemplate[],
	): void {
		templateDialogFolderOverride = folderOverride ? resolveFolderContext(folderOverride) : null;
		templateDialogCandidates = candidates ?? null;
		templateDialogOpen = true;
	}

	function closeTemplateDialog(): void {
		templateDialogOpen = false;
		templateDialogFolderOverride = null;
		templateDialogCandidates = null;
	}

	async function createFromTemplate(
		template: NoteTemplate,
		folderOverride?: string,
	): Promise<void> {
		const [setting, worldCalendar] = await Promise.all([
			loadTemplateContextSetting(),
			loadWorldCalendarSetting(),
		]);
		const context = buildTemplateContext(setting, new Date(), { worldCalendar });
		const rendered = renderNoteTemplate(template, context, folderOverride);
		const note = await notesState.createNote(toNewNoteOverrides(rendered));
		if (shouldAdvanceSessionCounter(template.id)) {
			await settingsStorageState.saveTemplateContext({
				...setting,
				sessionNumber: context.sessionNumber + 1,
			});
		}
		goto(resolve(`/notes/${note.id}/edit`));
	}

	async function handleNewNote(folderOverride?: string): Promise<void> {
		const folderContext = resolveFolderContext(folderOverride);
		const matches = getFolderScopedTemplateMatches(templateLibraryState.templates, folderContext);
		if (matches.length === 1) {
			await createFromTemplate(matches[0]!, folderContext ?? undefined);
			return;
		}
		if (matches.length > 1) {
			openTemplateDialog(folderContext, matches);
			return;
		}

		const note = await notesState.createNote(
			folderContext ? { folder: createFolderId(folderContext) } : undefined,
		);
		goto(resolve(`/notes/${note.id}/edit`));
	}

	function shouldAdvanceSessionCounter(templateId: string): boolean {
		return (
			templateId === 'session' || templateId === 'session-prep' || templateId === 'session-recap'
		);
	}

	async function loadTemplateContextSetting(): Promise<AppSettings['templateContext']> {
		return settingsStorageState.getTemplateContext();
	}

	async function loadWorldCalendarSetting(): Promise<WorldCalendar> {
		return settingsStorageState.getWorldCalendar();
	}

	async function handleTemplateCreate(
		template: NoteTemplate,
		folderOverride?: string,
	): Promise<void> {
		const resolvedFolder =
			resolveFolderContext(folderOverride) ?? templateDialogFolderOverride ?? undefined;
		closeTemplateDialog();
		await createFromTemplate(template, resolvedFolder);
	}

	async function handleCreateFromTemplateId(templateId: string): Promise<void> {
		const template = templateLibraryState.templates.find((entry) => entry.id === templateId);
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
			if (window.dndtoolsDesktop) {
				await refreshDesktopVault();
			}
			await notesState.loadAll();
			await Promise.all([
				searchService.buildIndex(notesState.notes),
				mcpChangesState.refresh(),
				sessionBoardsState.loadAll(),
				handoutsState.loadAll(),
				templateLibraryState.refresh(),
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

	async function handleSetPlayerMode(enabled: boolean): Promise<void> {
		await playerModeState.setEnabled(enabled);
		if (enabled) {
			if (!page.url.pathname.startsWith('/player')) {
				goto(resolve('/player'));
			}
			return;
		}
		if (page.url.pathname.startsWith('/player')) {
			goto(resolve('/notes'));
		}
	}

	async function handleTogglePlayerMode(): Promise<void> {
		await handleSetPlayerMode(!playerModeState.enabled);
	}

	function handleCreateHandout(): void {
		if (playerModeState.enabled) return;
		handoutCreatorOpen = true;
	}

	function handleKeydown(event: KeyboardEvent): void {
		const mod = event.ctrlKey || event.metaKey;
		const target = event.target as HTMLElement;
		const isInEditor = target.closest('.cm-editor') !== null;

		if (mod && event.key === 'p') {
			event.preventDefault();
			quickSwitcherOpen = true;
		} else if (mod && event.shiftKey && event.code === 'Space') {
			event.preventDefault();
			quickReferenceOverlayOpen = !quickReferenceOverlayOpen;
		} else if (mod && event.shiftKey && event.key.toLowerCase() === 'b') {
			event.preventDefault();
			sessionQuickPanelOpen = !sessionQuickPanelOpen;
		} else if (mod && event.key.toLowerCase() === 'd') {
			event.preventDefault();
			diceTrayOpen = !diceTrayOpen;
		} else if (mod && event.key.toLowerCase() === 'g') {
			event.preventDefault();
			if (!playerModeState.enabled) {
				generatorOpen = !generatorOpen;
			}
		} else if (mod && event.key === 'n') {
			event.preventDefault();
			if (!playerModeState.enabled) {
				void handleNewNote();
			}
		} else if (mod && event.shiftKey && event.key.toLowerCase() === 'h') {
			event.preventDefault();
			handleCreateHandout();
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
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#1f2937" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if runtimeState.ready}
	<AppShell
		onnewnote={handleNewNote}
		oncreatehandout={handleCreateHandout}
		onsearch={() => (quickSwitcherOpen = true)}
		ondice={() => (diceTrayOpen = true)}
		ontemplate={openTemplateDialog}
		onrefresh={handleRefreshVault}
		onsetplayermode={handleSetPlayerMode}
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
				oncreatehandout={handleCreateHandout}
				onopendicetray={() => (diceTrayOpen = true)}
				onopengenerator={() => (generatorOpen = true)}
				ontemplate={openTemplateDialog}
				oncreatefromtemplate={(templateId: string) => void handleCreateFromTemplateId(templateId)}
				onsessionrecap={() => void handleSessionRecapScaffold()}
				onopensplitview={(noteId: string) => (quickReferenceSplitNoteId = noteId)}
				ontoggleplayermode={handleTogglePlayerMode}
			/>
		{/await}
	{/if}
	{#if quickReferenceOverlayOpen}
		{#await import('$lib/ui/search/QuickReferenceOverlay.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then QuickReferenceOverlayModule}
			<QuickReferenceOverlayModule.default
				bind:open={quickReferenceOverlayOpen}
				onclose={() => (quickReferenceOverlayOpen = false)}
				onopensplitview={(noteId: string) => (quickReferenceSplitNoteId = noteId)}
			/>
		{/await}
	{/if}
	{#if quickReferenceSplitNoteId}
		{#await import('$lib/ui/search/QuickReferenceSplitView.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then QuickReferenceSplitViewModule}
			<QuickReferenceSplitViewModule.default
				noteId={createNoteId(quickReferenceSplitNoteId)}
				onclose={() => (quickReferenceSplitNoteId = null)}
			/>
		{/await}
	{/if}
	{#if sessionQuickPanelOpen}
		{#await import('$lib/ui/board/SessionQuickPanel.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then SessionQuickPanelModule}
			<SessionQuickPanelModule.default
				bind:open={sessionQuickPanelOpen}
				onclose={() => (sessionQuickPanelOpen = false)}
			/>
		{/await}
	{/if}
	{#if diceTrayOpen}
		{#await import('$lib/ui/dice/DiceTrayOverlay.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then DiceTrayOverlayModule}
			<DiceTrayOverlayModule.default
				bind:open={diceTrayOpen}
				onclose={() => (diceTrayOpen = false)}
			/>
		{/await}
	{/if}
	{#if generatorOpen}
		{#await import('$lib/ui/generator/GeneratorOverlay.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then GeneratorOverlayModule}
			<GeneratorOverlayModule.default
				bind:open={generatorOpen}
				onclose={() => (generatorOpen = false)}
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
				folderOverride={templateDialogFolderOverride}
				templates={templateDialogCandidates ?? templateLibraryState.templates}
				onclose={closeTemplateDialog}
				oncreate={handleTemplateCreate}
			/>
		{/await}
	{/if}
	{#if handoutCreatorOpen}
		{#await import('$lib/ui/handouts/HandoutCreatorOverlay.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then HandoutCreatorOverlayModule}
			<HandoutCreatorOverlayModule.default
				bind:open={handoutCreatorOpen}
				onclose={() => (handoutCreatorOpen = false)}
			/>
		{/await}
	{/if}
	<InstallPromptBanner />
	<Toast />
	<LiveAnnouncer />
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
