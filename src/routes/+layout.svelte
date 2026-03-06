<script lang="ts">
	import '../app.css';
	import AppShell from '$lib/ui/layout/AppShell.svelte';
	import Toast from '$lib/ui/common/Toast.svelte';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { runtimeState } from '$lib/state/runtime.svelte.js';
	import { vaultHealthState } from '$lib/state/vaultHealth.svelte.js';
	import { a11yAnnouncerState } from '$lib/state/a11y-announcer.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { installGlobalRuntimeDiagnostics, reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { createFolderId, createNoteId } from '$lib/types/note.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { isVaultObjectNote } from '$lib/domain/object-notes.js';
	import { settingsStorageState } from '$lib/state/settings-storage.svelte.js';
	import { templateLibraryState } from '$lib/state/template-library.svelte.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { desktopShellState } from '$lib/state/desktop-shell.svelte.js';
	import { mobileKeyboardState } from '$lib/state/mobile-keyboard.svelte.js';
	import { inputModalityState } from '$lib/state/input-modality.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { syncState } from '$lib/state/sync.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { pwaState } from '$lib/state/pwa.svelte.js';
	import { isDetailPanelAvailable } from '$lib/domain/detail-panel-context.js';
	import { searchService } from '$lib/domain/search.js';
	import LiveAnnouncer from '$lib/ui/a11y/LiveAnnouncer.svelte';
	import InstallPromptBanner from '$lib/ui/pwa/InstallPromptBanner.svelte';
	import KeyboardShortcutsOverlay from '$lib/ui/layout/KeyboardShortcutsOverlay.svelte';
	import { registerSW } from 'virtual:pwa-register';
	import {
		onDesktopAppMenuCommand,
		onDesktopNavigateRequest,
		onDesktopVaultFileSync,
		pickDesktopVaultDirectory,
		exportDesktopMarkdownZip,
		type DesktopAppMenuCommand,
		type DesktopVaultFileSyncPayload,
	} from '$lib/platform/desktop/bridge.js';
	import {
		buildTemplateContext,
		getFolderScopedTemplateMatches,
		renderNoteTemplate,
		toNewNoteOverrides,
	} from '$lib/domain/template-automation.js';
	import type { AppSettings } from '$lib/types/settings.js';
	import { createSessionBoardId } from '$lib/types/session-board.js';
	import type { NoteTemplate } from '$lib/types/template-library.js';
	import type { WorldCalendar } from '$lib/types/world-calendar.js';

	let { children } = $props();
	let quickSwitcherOpen = $state(false);
	let sessionQuickPanelOpen = $state(false);
	let diceTrayOpen = $state(false);
	let generatorOpen = $state(false);
	let quickReferenceOverlayOpen = $state(false);
	let quickReferenceSplitNoteId = $state<string | null>(null);
	let keyboardShortcutOverlayOpen = $state(false);
	let templateDialogOpen = $state(false);
	let handoutCreatorOpen = $state(false);
	let templateDialogFolderOverride = $state<string | null>(null);
	let templateDialogCandidates = $state<readonly NoteTemplate[] | null>(null);
	let lastAnnouncedRoute = $state<string | null>(null);
	let runtimeBootstrapRequested = false;
	let activeTemplateFolder = $derived.by(
		() => templateDialogFolderOverride ?? page.url.searchParams.get('folder'),
	);

	function canonicalizeLegacyPath(url: URL): string | null {
		const { pathname, search } = url;
		if (pathname === '/') return `/knowledge${search}`;
		if (pathname === '/notes') return `/knowledge/notes${search}`;
		const noteMatch = pathname.match(/^\/notes\/([^/]+)(?:\/(edit))?$/);
		if (noteMatch) {
			const noteId = noteMatch[1] ?? '';
			const editSuffix = noteMatch[2] === 'edit' ? '/edit' : '';
			return `/knowledge/notes/${noteId}${editSuffix}${search}`;
		}
		if (pathname === '/search') return `/knowledge/search${search}`;
		if (pathname === '/graph') return `/knowledge/graph${search}`;
		if (pathname === '/maps') return `/atlas/maps${search}`;
		if (pathname === '/timeline') return `/campaign/timeline${search}`;
		if (pathname === '/session-board') return `/session/boards${search}`;
		if (pathname === '/encounter/new') return `/session/encounter/new${search}`;
		if (pathname === '/combat') return `/session/combat${search}`;
		return null;
	}

	function routeLabel(url: URL): string {
		const { pathname, searchParams } = url;
		if (pathname === '/knowledge') return 'Knowledge';
		if (pathname === '/knowledge/notes') {
			const tag = searchParams.get('tag');
			const folder = searchParams.get('folder');
			if (tag) return `Notes #${tag}`;
			if (folder) return `Notes ${folder}`;
			return 'All Notes';
		}
		if (pathname === '/knowledge/search') return 'Search';
		if (pathname === '/knowledge/graph') return 'Graph';
		if (pathname === '/atlas/maps') return 'Maps';
		if (pathname === '/campaign/timeline') return 'Timeline';
		if (pathname === '/session/boards') return 'Session Board';
		if (pathname === '/session/encounter/new') return 'Encounter Builder';
		if (pathname === '/session/combat') return 'Combat Tracker';
		if (pathname === '/settings') return 'Settings';
		if (pathname === '/player') return 'Player Screen';
		return pathname;
	}

	function setBrowserHistoryLabel(label: string): void {
		if (typeof window === 'undefined') return;
		const normalized = label.trim();
		if (!normalized) return;
		const currentState =
			window.history.state && typeof window.history.state === 'object'
				? (window.history.state as Record<string, unknown>)
				: {};
		if (currentState.label === normalized) return;
		window.history.replaceState(
			{
				...currentState,
				label: normalized,
			},
			'',
			window.location.href,
		);
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
			if (!templateLibraryState.loaded && !templateLibraryState.loading) {
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
		layoutState.initialize();
		return () => layoutState.dispose();
	});

	$effect(() => {
		desktopShellState.ensureHydrated();
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
		if (layoutState.isMedium) return;
		keyboardShortcutOverlayOpen = false;
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		pwaState.initialize();
		if (typeof navigator !== 'undefined' && navigator.webdriver) {
			return () => pwaState.dispose();
		}
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
		const canonical = canonicalizeLegacyPath(page.url);
		if (!canonical) return;
		const current = `${page.url.pathname}${page.url.search}`;
		if (canonical === current) return;
		goto(canonical, { replaceState: true, keepFocus: true, noScroll: true });
	});

	$effect(() => {
		const routeId = page.route.id;
		if (routeId === '/knowledge/search') {
			void onboardingState.completeStep('use_search');
		} else if (routeId === '/settings') {
			void onboardingState.completeStep('open_settings');
		}
	});

	afterNavigate(({ to }) => {
		const next = to?.url;
		if (!next) return;
		const canonicalPath = canonicalizeLegacyPath(next);
		const targetUrl = canonicalPath ? new URL(canonicalPath, next.origin) : next;
		const pathWithSearch = `${targetUrl.pathname}${targetUrl.search}`;
		navigationState.setActiveRoute(pathWithSearch);
		const noteMatch = targetUrl.pathname.match(/^\/knowledge\/notes\/([^/]+)(?:\/(edit))?$/);
		if (noteMatch) {
			const noteId = createNoteId(decodeURIComponent(noteMatch[1] ?? ''));
			const isEdit = noteMatch[2] === 'edit';
			const note = notesState.getNoteById(noteId);
			const title = note?.title ?? `Note ${noteId}`;
			const noteKind = note && isVaultObjectNote(note) ? 'entity' : 'note';
			const label = isEdit ? `${title} (Edit)` : title;
			pwaState.recordNoteOpened(String(noteId));
			navigationState.record(pathWithSearch, {
				label,
				noteId,
				recentKind: noteKind,
				recentItemId: String(noteId),
			});
			setBrowserHistoryLabel(label);
			return;
		}

		if (targetUrl.pathname === '/atlas/maps') {
			const mapId = targetUrl.searchParams.get('map')?.trim() ?? '';
			if (mapId) {
				const label = `Map ${mapId}`;
				navigationState.record(pathWithSearch, {
					label,
					recentKind: 'map',
					recentItemId: mapId,
				});
				setBrowserHistoryLabel(label);
				return;
			}
		}

		const label = routeLabel(targetUrl);
		navigationState.record(pathWithSearch, { label });
		setBrowserHistoryLabel(label);
	});

	$effect(() => {
		navigationState.setActiveRoute(`${page.url.pathname}${page.url.search}`);
	});

	$effect(() => {
		const current = navigationState.currentEntry;
		if (!current?.noteId) return;
		const note = notesState.getNoteById(current.noteId);
		if (!note) return;
		const label = page.url.pathname.endsWith('/edit') ? `${note.title} (Edit)` : note.title;
		if (current.label !== label) {
			navigationState.updateCurrentLabel(label);
			setBrowserHistoryLabel(label);
		}
	});

	$effect(() => {
		if (page.url.pathname.startsWith('/player') && !playerModeState.enabled) {
			void playerModeState.setEnabled(true);
		}
	});

	$effect(() => {
		if (page.url.pathname !== '/session/boards') return;
		const boardId = page.url.searchParams.get('board');
		if (!boardId) return;
		sessionBoardsState.setActiveBoard(createSessionBoardId(boardId));
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
			page.url.pathname === '/knowledge/graph' ||
			page.url.pathname === '/campaign/timeline' ||
			page.url.pathname === '/session/boards' ||
			page.url.pathname === '/session/encounter/new' ||
			page.url.pathname === '/session/combat'
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
		goto(resolve(`/knowledge/notes/${note.id}/edit`));
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
		goto(resolve(`/knowledge/notes/${note.id}/edit`));
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

	async function handleSetPlayerMode(enabled: boolean): Promise<void> {
		await playerModeState.setEnabled(enabled);
		if (enabled) {
			if (!page.url.pathname.startsWith('/player')) {
				goto(resolve('/player'));
			}
			return;
		}
		if (page.url.pathname.startsWith('/player')) {
			goto(resolve('/knowledge/notes'));
		}
	}

	async function handleTogglePlayerMode(): Promise<void> {
		await handleSetPlayerMode(!playerModeState.enabled);
	}

	function handleCreateHandout(): void {
		if (playerModeState.enabled) return;
		handoutCreatorOpen = true;
	}

	async function toggleDarkThemeMode(): Promise<void> {
		const next = ui.resolvedTheme === 'dark' ? 'light' : 'dark';
		await ui.setTheme(next);
	}

	async function handleDesktopVaultPicker(): Promise<void> {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) return;
		const result = await pickDesktopVaultDirectory();
		if (!result) return;
		if (!result.ok || !result.vaultDir) {
			toastState.error(result.error ?? 'Failed to switch vault folder.');
			return;
		}
		await notesState.loadAll();
		await Promise.all([
			searchService.buildIndex(notesState.notes),
			mcpChangesState.refresh(),
			vaultHealthState.refresh(),
		]);
		navigationState.reset(resolve('/knowledge/notes'), { label: 'All Notes' });
		goto(resolve('/knowledge/notes'));
		toastState.success('Switched vault folder.');
	}

	async function handleDesktopMarkdownExport(): Promise<void> {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) return;
		const result = await exportDesktopMarkdownZip({ profile: 'portable_markdown_zip' });
		if (result.canceled) return;
		toastState.success('Exported markdown archive.');
	}

	async function handleDesktopAppMenuCommand(command: DesktopAppMenuCommand): Promise<void> {
		if (command === 'new-note') {
			if (playerModeState.enabled) return;
			await handleNewNote();
			return;
		}
		if (command === 'open-vault') {
			await handleDesktopVaultPicker();
			return;
		}
		if (command === 'export-markdown') {
			await handleDesktopMarkdownExport();
			return;
		}
		if (command === 'toggle-local-panel') {
			if (layoutState.isExpanded) {
				if (desktopShellState.zenMode) return;
				desktopShellState.toggleLocalPanelCollapsed();
			} else {
				ui.toggleSidebar();
			}
			return;
		}
		if (command === 'toggle-dark-mode') {
			await toggleDarkThemeMode();
			return;
		}
		if (command === 'start-session') {
			if (playerModeState.enabled) return;
			goto(resolve('/session/boards'));
			return;
		}
		if (command === 'open-dice-tray') {
			diceTrayOpen = true;
			return;
		}
		if (command === 'open-combat-tracker') {
			if (playerModeState.enabled) return;
			goto(resolve('/session/combat'));
			return;
		}
		if (command === 'open-shortcuts') {
			goto(`${resolve('/settings')}?tab=general`);
			return;
		}
		if (command === 'open-about') {
			goto(`${resolve('/settings')}?tab=about`);
		}
	}

	async function handleDesktopVaultFileSync(payload: DesktopVaultFileSyncPayload): Promise<void> {
		await notesState.applyExternalVaultSync({
			updatedNotes: payload.updatedNotes,
			deletedNoteIds: payload.deletedNoteIds,
		});
		if (payload.updatedCount <= 0) return;
		toastState.info(
			`${payload.updatedCount} ${payload.updatedCount === 1 ? 'note' : 'notes'} updated from disk`,
		);
	}

	$effect(() => {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) return;
		return onDesktopAppMenuCommand((command) => {
			void handleDesktopAppMenuCommand(command);
		});
	});

	$effect(() => {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) return;
		return onDesktopNavigateRequest((path) => {
			void goto(path);
		});
	});

	$effect(() => {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) return;
		return onDesktopVaultFileSync((payload) => {
			void handleDesktopVaultFileSync(payload);
		});
	});

	function isTextEntryTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return (
			target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') !==
				null || target.closest('.cm-editor') !== null
		);
	}

	function handleKeydown(event: KeyboardEvent): void {
		inputModalityState.observeKeyboardEvent(event);
		const mod = event.ctrlKey || event.metaKey;
		const target = event.target as HTMLElement;
		const isInEditor = target.closest('.cm-editor') !== null;
		const isTextEntry = isTextEntryTarget(target);
		const mediumKeyboardDiscoverabilityEnabled =
			!layoutState.isMedium || inputModalityState.keyboardDetected;
		const compactEditorRoute = /^\/knowledge\/notes\/[^/]+\/edit$/.test(page.url.pathname);
		const detailPanelAvailable =
			layoutState.isExpanded &&
			!ui.focusReading &&
			!compactEditorRoute &&
			!desktopShellState.zenMode &&
			isDetailPanelAvailable(page.url);

		if (keyboardShortcutOverlayOpen && event.key === 'Escape') {
			event.preventDefault();
			keyboardShortcutOverlayOpen = false;
			return;
		}

		const questionMarkPressed = event.key === '?' || (event.code === 'Slash' && event.shiftKey);
		if (
			questionMarkPressed &&
			!mod &&
			layoutState.isMedium &&
			mediumKeyboardDiscoverabilityEnabled &&
			!isTextEntry
		) {
			event.preventDefault();
			keyboardShortcutOverlayOpen = true;
			return;
		}

		if (event.key === 'F11' && layoutState.isExpanded) {
			event.preventDefault();
			desktopShellState.setZenMode(!desktopShellState.zenMode);
			return;
		}

		if (mod && event.key === 'p') {
			if (!mediumKeyboardDiscoverabilityEnabled) return;
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
		} else if (mod && event.key.toLowerCase() === 'o') {
			event.preventDefault();
			void handleDesktopVaultPicker();
		} else if (mod && event.shiftKey && event.key.toLowerCase() === 'e') {
			event.preventDefault();
			void handleDesktopMarkdownExport();
		} else if (mod && event.shiftKey && event.key.toLowerCase() === 'h') {
			event.preventDefault();
			handleCreateHandout();
		} else if (mod && event.key === 'b' && !isInEditor) {
			event.preventDefault();
			if (layoutState.isExpanded) {
				if (desktopShellState.zenMode) return;
				desktopShellState.toggleLocalPanelCollapsed();
			} else {
				ui.toggleSidebar();
			}
		} else if (mod && event.shiftKey && event.key.toLowerCase() === 'r' && !isInEditor) {
			if (!detailPanelAvailable) return;
			event.preventDefault();
			desktopShellState.toggleDetailPanel();
		} else if (mod && event.shiftKey && event.key.toLowerCase() === 'l') {
			event.preventDefault();
			void toggleDarkThemeMode();
		} else if (mod && event.shiftKey && event.key.toLowerCase() === 's') {
			if (playerModeState.enabled) return;
			event.preventDefault();
			goto(resolve('/session/boards'));
		} else if (mod && event.shiftKey && event.key.toLowerCase() === 'c') {
			if (playerModeState.enabled) return;
			event.preventDefault();
			goto(resolve('/session/combat'));
		} else if (mod && event.key === '/') {
			event.preventDefault();
			goto(`${resolve('/settings')}?tab=general`);
		} else if (mod && event.shiftKey && event.key === 'F') {
			event.preventDefault();
			goto(resolve('/knowledge/search'));
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
		onsearch={() => (quickSwitcherOpen = true)}
		ondice={() => (diceTrayOpen = true)}
		ontemplate={openTemplateDialog}
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
	<KeyboardShortcutsOverlay
		open={keyboardShortcutOverlayOpen}
		onclose={() => (keyboardShortcutOverlayOpen = false)}
	/>
	<InstallPromptBanner />
	<Toast />
	<LiveAnnouncer />
{:else if runtimeState.migrationReport}
	{#await import('$lib/ui/migration/MigrationReadinessScreen.svelte')}
		<div class="flex h-screen items-center justify-center bg-bg">
			<p class="text-sm text-ink-muted">Loading upgrade screen…</p>
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
	<div class="flex h-screen items-center justify-center bg-bg">
		<div class="text-center max-w-md p-6 rounded-lg border border-border bg-surface">
			<p class="text-lg font-semibold text-ink">Failed to load vault</p>
			<p class="text-sm text-ink-muted mt-2">{runtimeState.error}</p>
			<button
				class="mt-4 px-3 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover"
				onclick={handleRetryInit}
			>
				Retry
			</button>
		</div>
	</div>
{:else}
	<div class="flex h-screen items-center justify-center bg-bg">
		<div class="text-center animate-fade-in">
			<div class="mb-4 flex justify-center">
				<img src="/app-icon.svg" alt="" class="w-12 h-12 rounded-xl ring-1 ring-border shadow-sm" />
			</div>
			<p class="text-lg font-semibold text-ink">DND Tools</p>
			<div class="flex items-center justify-center gap-2 mt-3">
				<div
					class="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin"
				></div>
				<p class="text-sm text-ink-muted">Loading your vault...</p>
			</div>
		</div>
	</div>
{/if}
