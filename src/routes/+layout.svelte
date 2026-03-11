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
	import { vaultMaturityState } from '$lib/state/vault-maturity.svelte.js';
	import { templateLibraryState } from '$lib/state/template-library.svelte.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { desktopShellState } from '$lib/state/desktop-shell.svelte.js';
	import { mobileKeyboardState } from '$lib/state/mobile-keyboard.svelte.js';
	import { inputModalityState } from '$lib/state/input-modality.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { syncState } from '$lib/state/sync.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { featureSettingsState } from '$lib/state/feature-settings.svelte.js';
	import { pwaState } from '$lib/state/pwa.svelte.js';
	import { featureSpotlightsState } from '$lib/state/feature-spotlights.svelte.js';
	import { isDetailPanelAvailable } from '$lib/domain/detail-panel-context.js';
	import { searchService } from '$lib/domain/search.js';
	import LiveAnnouncer from '$lib/ui/a11y/LiveAnnouncer.svelte';
	import InstallPromptBanner from '$lib/ui/pwa/InstallPromptBanner.svelte';
	import KeyboardShortcutsOverlay from '$lib/ui/layout/KeyboardShortcutsOverlay.svelte';
	import FeatureSpotlight from '$lib/ui/common/FeatureSpotlight.svelte';
	import SetupWizard from '$lib/ui/onboarding/SetupWizard.svelte';
	import { registerSW } from 'virtual:pwa-register';
	import {
		getDesktopBackendInfo,
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
	import { getVaultTemplateById } from '$lib/domain/vault-templates.js';
	import { ADVANCED_FEATURE_IDS, type AppSettings } from '$lib/types/settings.js';
	import { createSessionBoardId } from '$lib/types/session-board.js';
	import { type KeyboardShortcutId } from '$lib/domain/keyboard-shortcuts.js';
	import { KeyboardShortcutManager } from '$lib/domain/keyboard-shortcut-manager.js';
	import type { SyncIndicatorState } from '$lib/types/sync.js';
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
	let lastSyncIndicator = $state<SyncIndicatorState | null>(null);
	let lastVaultHealthSnapshot = $state<string | null>(null);
	let lastMcpChangeCount = $state<number | null>(null);
	let lastSessionModeActive = $state<boolean | null>(null);
	let syncStatusAnnouncement = $state('');
	let vaultHealthAnnouncement = $state('');
	let vaultHealthAnnouncementRole = $state<'status' | 'alert'>('status');
	let mcpChangesAnnouncement = $state('');
	let sessionModeAnnouncement = $state('');
	let previousAdvancedFeatureSnapshot = $state<Record<string, boolean> | null>(null);
	let runtimeBootstrapRequested = false;
	let setupWizardSubmitting = $state(false);
	let suggestedVaultName = $state('My Campaign');
	let activeTemplateFolder = $derived.by(
		() => templateDialogFolderOverride ?? page.url.searchParams.get('folder'),
	);
	let showSetupWizard = $derived(
		runtimeState.ready && onboardingState.shouldShowSetupWizard(notesState.activeNotes.length),
	);
	let pageHeading = $derived.by(() => {
		if (runtimeState.ready && showSetupWizard) return 'Welcome to DND Tools';
		return routeHeading(page.url);
	});
	let documentTitle = $derived.by(() => {
		const heading = pageHeading.trim();
		return heading.length > 0 ? `${heading} | DND Tools` : 'DND Tools';
	});

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

	function routeHeading(url: URL): string {
		const canonicalPath = canonicalizeLegacyPath(url);
		const canonicalUrl = canonicalPath ? new URL(canonicalPath, url.origin) : url;
		const { pathname, searchParams } = canonicalUrl;
		const noteMatch = pathname.match(/^\/knowledge\/notes\/([^/]+)(?:\/(edit))?$/);
		if (noteMatch) {
			const noteId = createNoteId(decodeURIComponent(noteMatch[1] ?? ''));
			const note = notesState.getNoteById(noteId);
			const title = note?.title ?? `Note ${noteId}`;
			return noteMatch[2] === 'edit' ? `Edit ${title}` : title;
		}
		if (pathname === '/knowledge') {
			if (playerModeState.enabled) return 'Player Screen';
			return notesState.activeNotes.length === 0 ? 'Welcome, Dungeon Master' : 'Your Vault';
		}
		if (pathname === '/knowledge/notes') {
			const tag = searchParams.get('tag');
			if (tag) return `Notes tagged "${tag}"`;
			return playerModeState.enabled ? 'Player Notes' : 'All Notes';
		}
		if (pathname === '/knowledge/search') return 'Search & Discovery';
		if (pathname === '/knowledge/graph') return 'Link Graph';
		if (pathname === '/atlas/maps') return 'Map Library';
		if (pathname === '/campaign/timeline') return 'Campaign Timeline';
		if (pathname === '/session/boards') return 'Session Board';
		if (pathname === '/session/encounter/new') return 'Encounter Builder';
		if (pathname === '/session/combat') return 'Combat Tracker';
		if (pathname === '/settings') return 'Settings';
		if (pathname === '/player') return 'Player Screen';
		return pathname;
	}

	function syncIndicatorLabel(indicator: SyncIndicatorState): string {
		if (indicator === 'online') return 'Online';
		if (indicator === 'offline') return 'Offline';
		if (indicator === 'syncing') return 'Syncing';
		return 'Sync Error';
	}

	function isTopLevelRoute(pathname: string): boolean {
		return (
			pathname === '/knowledge' ||
			pathname === '/knowledge/notes' ||
			pathname === '/knowledge/search' ||
			pathname === '/knowledge/graph' ||
			pathname === '/atlas/maps' ||
			pathname === '/session/boards' ||
			pathname === '/session/encounter/new' ||
			pathname === '/session/combat' ||
			pathname === '/campaign/timeline' ||
			pathname === '/settings'
		);
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

	function suggestVaultNameFromPath(vaultDir: string): string | null {
		const trimmed = vaultDir.trim();
		if (!trimmed) return null;
		const segments = trimmed.split(/[\\/]+/).filter((segment) => segment.length > 0);
		const base = segments.at(-1)?.trim() ?? '';
		if (!base) return null;
		if (/^(vault|dndtools|untitled)$/i.test(base)) return null;
		if (/^[a-f0-9-]{12,}$/i.test(base)) return null;
		const normalized = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
		if (!/[a-z]/i.test(normalized)) return null;
		if (normalized.length > 80) return null;
		return normalized.replace(/\b\w/g, (match) => match.toUpperCase());
	}

	function focusRouteLandmark(): void {
		if (typeof document === 'undefined') return;
		window.requestAnimationFrame(() => {
			const main = document.getElementById('main-content');
			if (!(main instanceof HTMLElement)) return;
			const heading = main.querySelector('h1');
			const target = heading instanceof HTMLElement ? heading : main;
			if (!target.hasAttribute('tabindex')) {
				target.setAttribute('tabindex', '-1');
			}
			target.focus({ preventScroll: true });
			target.scrollIntoView({ block: 'start', inline: 'nearest' });
		});
	}

	$effect(() => {
		if (runtimeBootstrapRequested) return;
		runtimeBootstrapRequested = true;
		void runtimeState.initialize();
		installGlobalRuntimeDiagnostics();
	});

	$effect(() => {
		void sessionModeState.load();
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
		if (!runtimeState.ready) return;
		if (!featureSpotlightsState.loaded && !featureSpotlightsState.loading) {
			void featureSpotlightsState.loadFromStorage();
		}
	});

	$effect(() => {
		if (!featureSettingsState.loaded || !featureSpotlightsState.loaded) return;
		const current = featureSettingsState.settings.advanced;
		const previous = previousAdvancedFeatureSnapshot;
		if (!previous) {
			previousAdvancedFeatureSnapshot = { ...current };
			return;
		}
		let changed = false;
		for (const featureId of ADVANCED_FEATURE_IDS) {
			if (previous[featureId] !== current[featureId]) {
				changed = true;
			}
			if (!previous[featureId] && current[featureId]) {
				featureSpotlightsState.queueForFeature(featureId);
			}
		}
		if (!changed) return;
		previousAdvancedFeatureSnapshot = { ...current };
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		root.classList.remove(
			'theme-parchment',
			'theme-tavern',
			'theme-scholar',
			'theme-dungeon',
			'theme-high-contrast',
		);
		root.classList.add(`theme-${ui.resolvedThemePreset}`);
		root.classList.toggle('theme-high-contrast', ui.resolvedHighContrast);
		root.classList.toggle('dark', ui.resolvedTheme === 'dark');
		root.classList.toggle('reduce-motion', ui.resolvedReducedMotion);
		root.dataset.density = ui.uiDensity;
		root.dataset.noteReadingWidth = ui.noteReadingWidth;
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
		if (typeof window === 'undefined') return;
		const handleOpenDiceTray = (): void => {
			diceTrayOpen = true;
		};
		window.addEventListener('dndtools:open-dice-tray', handleOpenDiceTray);
		return () => window.removeEventListener('dndtools:open-dice-tray', handleOpenDiceTray);
	});

	$effect(() => {
		const configuredName = onboardingState.vaultName.trim();
		if (configuredName) {
			suggestedVaultName = configuredName;
			return;
		}
		if (!runtimeState.ready || typeof window === 'undefined' || !window.dndtoolsDesktop) return;
		let stale = false;
		void getDesktopBackendInfo()
			.then((info) => {
				if (stale) return;
				const suggested = suggestVaultNameFromPath(info.vaultDir);
				if (!suggested) return;
				suggestedVaultName = suggested;
			})
			.catch(() => undefined);
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		if (!runtimeState.ready) return;
		if (onboardingState.shouldShowSetupWizard(notesState.activeNotes.length)) return;
		void onboardingState.markVaultOpened(suggestedVaultName);
	});

	$effect(() => {
		if (!runtimeState.ready) return;
		const { noteCount, linkCount, tagCount } = vaultMaturityState.signals;
		void onboardingState.syncSignalMilestones({
			noteCount,
			linkCount,
			tagCount,
		});
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
		if (routeId === '/knowledge/search' || routeId === '/search') {
			void onboardingState.completeMilestone('first_search');
		}
	});

	$effect(() => {
		if (!sessionModeState.isActive) return;
		void onboardingState.completeMilestone('first_session');
	});

	afterNavigate(({ to }) => {
		const next = to?.url;
		if (!next) return;
		const canonicalPath = canonicalizeLegacyPath(next);
		const targetUrl = canonicalPath ? new URL(canonicalPath, next.origin) : next;
		const pathWithSearch = `${targetUrl.pathname}${targetUrl.search}`;
		navigationState.setActiveRoute(pathWithSearch);
		queueSpotlightsForRoute(targetUrl.pathname);
		focusRouteLandmark();
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

		const label = routeHeading(targetUrl);
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
		const board = sessionBoardsState.boards.find((entry) => String(entry.id) === boardId);
		void sessionModeState.setSceneId(board?.activeSceneId ?? null);
	});

	$effect(() => {
		const activeSession = sessionModeState.activeSession;
		if (!activeSession) return;
		if (sessionBoardsState.loading) return;
		const boardId = createSessionBoardId(activeSession.sessionBoardId);
		if (sessionBoardsState.boards.length === 0) {
			void sessionBoardsState.loadAll();
			return;
		}
		if (sessionBoardsState.boards.some((board) => board.id === boardId)) {
			sessionBoardsState.setActiveBoard(boardId);
		}
	});

	$effect(() => {
		const routeKey = `${page.url.pathname}${page.url.search}`;
		if (routeKey === lastAnnouncedRoute) return;
		lastAnnouncedRoute = routeKey;
		a11yAnnouncerState.announceAssertive(`${routeHeading(page.url)} view loaded.`);
	});

	$effect(() => {
		const indicator = syncState.indicator;
		if (lastSyncIndicator === null) {
			lastSyncIndicator = indicator;
			return;
		}
		if (indicator === lastSyncIndicator) return;
		lastSyncIndicator = indicator;
		syncStatusAnnouncement = `Sync status ${syncIndicatorLabel(indicator)}.`;
	});

	$effect(() => {
		const severity = vaultHealthState.severity;
		const issueCount = vaultHealthState.issueCount;
		const snapshot = `${severity}:${issueCount}`;
		if (lastVaultHealthSnapshot === null) {
			lastVaultHealthSnapshot = snapshot;
			return;
		}
		if (snapshot === lastVaultHealthSnapshot) return;
		lastVaultHealthSnapshot = snapshot;
		if (severity === 'critical') {
			vaultHealthAnnouncementRole = 'alert';
			vaultHealthAnnouncement = `Vault health critical: ${issueCount} issue${issueCount === 1 ? '' : 's'} detected.`;
			return;
		}
		vaultHealthAnnouncementRole = 'status';
		if (severity === 'warning') {
			vaultHealthAnnouncement = `Vault health warning: ${issueCount} issue${issueCount === 1 ? '' : 's'} detected.`;
			return;
		}
		if (severity === 'info') {
			vaultHealthAnnouncement = `Vault health update: ${issueCount} issue${issueCount === 1 ? '' : 's'} detected.`;
			return;
		}
		vaultHealthAnnouncement = 'Vault health is clear.';
	});

	$effect(() => {
		const count = mcpChangesState.count;
		if (lastMcpChangeCount === null) {
			lastMcpChangeCount = count;
			return;
		}
		if (count === lastMcpChangeCount) return;
		lastMcpChangeCount = count;
		mcpChangesAnnouncement =
			count === 0
				? 'No pending MCP changes.'
				: `${count} pending MCP change${count === 1 ? '' : 's'}.`;
	});

	$effect(() => {
		const active = sessionModeState.isActive;
		if (lastSessionModeActive === null) {
			lastSessionModeActive = active;
			return;
		}
		if (active === lastSessionModeActive) return;
		lastSessionModeActive = active;
		sessionModeAnnouncement = active ? 'Session mode active.' : 'Session mode inactive.';
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
		await onboardingState.completeMilestone('first_template');
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

	async function handleSetupWizardFinish(input: {
		vaultName: string;
		starter: 'empty-vault' | 'campaign-starter' | 'worldbuilding-starter';
		skipped: boolean;
	}): Promise<void> {
		if (setupWizardSubmitting) return;
		setupWizardSubmitting = true;
		try {
			await onboardingState.beginFromWizard(input.vaultName);
			if (!input.skipped && input.starter !== 'empty-vault') {
				const template = getVaultTemplateById(input.starter);
				if (template) {
					for (const note of template.notes) {
						await notesState.createNote({
							title: note.title,
							content: note.content,
							folder: note.folder,
							tags: [...note.tags],
						});
					}
					await onboardingState.completeMilestone('first_template');
				}
			}
			await searchService.buildIndex(notesState.notes);
			goto(resolve('/knowledge'));
		} catch (error) {
			toastState.error(`Failed to finish setup wizard: ${String(error)}`);
		} finally {
			setupWizardSubmitting = false;
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

	function handleOpenKeyboardShortcuts(): void {
		keyboardShortcutOverlayOpen = true;
	}

	function findSpotlightSelector(selectors: readonly string[]): string | null {
		if (typeof document === 'undefined') return null;
		for (const selector of selectors) {
			const target = document.querySelector<HTMLElement>(selector);
			if (!target) continue;
			const rect = target.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) continue;
			return selector;
		}
		return null;
	}

	function queueSpotlightsForRoute(pathname: string): void {
		if (!featureSettingsState.loaded || !featureSpotlightsState.loaded) return;
		featureSpotlightsState.queueForEncounter(pathname, (featureId) =>
			featureSettingsState.isAdvancedEnabled(featureId),
		);
		if (!isTopLevelRoute(pathname)) return;
		setTimeout(() => {
			featureSpotlightsState.showNext(findSpotlightSelector);
		}, 0);
	}

	async function handleDismissFeatureSpotlight(): Promise<void> {
		await featureSpotlightsState.dismissActive();
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
			onboardingState.loadFromStorage(),
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
			await ui.setTheme(ui.resolvedTheme === 'dark' ? 'parchment' : 'tavern');
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
			keyboardShortcutOverlayOpen = true;
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

	function detailPanelShortcutAvailable(): boolean {
		const compactEditorRoute = /^\/knowledge\/notes\/[^/]+\/edit$/.test(page.url.pathname);
		return (
			layoutState.isExpanded &&
			!ui.focusReading &&
			!compactEditorRoute &&
			!desktopShellState.zenMode &&
			isDetailPanelAvailable(page.url)
		);
	}

	function dispatchCombatShortcut(action: 'next-turn' | 'quick-damage' | 'quick-heal'): void {
		if (typeof window === 'undefined') return;
		window.dispatchEvent(new CustomEvent('dndtools:combat-shortcut', { detail: { action } }));
	}

	function dispatchKeyboardShortcut(shortcut: KeyboardShortcutId, event: KeyboardEvent): void {
		const detailPanelAvailable = detailPanelShortcutAvailable();

		const requireDmMode = (
			shortcutId: KeyboardShortcutId,
			handler: () => void | Promise<void>,
		): void => {
			if (playerModeState.enabled) return;
			event.preventDefault();
			void handler();
		};

		switch (shortcut) {
			case 'open_shortcuts_overlay':
				event.preventDefault();
				keyboardShortcutOverlayOpen = true;
				return;
			case 'toggle_zen_mode':
				event.preventDefault();
				desktopShellState.setZenMode(!desktopShellState.zenMode);
				return;
			case 'open_command_palette':
				event.preventDefault();
				quickSwitcherOpen = true;
				return;
			case 'toggle_quick_reference_overlay':
				event.preventDefault();
				quickReferenceOverlayOpen = !quickReferenceOverlayOpen;
				return;
			case 'toggle_session_quick_panel':
				event.preventDefault();
				sessionQuickPanelOpen = !sessionQuickPanelOpen;
				return;
			case 'toggle_dice_tray':
				event.preventDefault();
				diceTrayOpen = !diceTrayOpen;
				return;
			case 'toggle_generator_panel':
				requireDmMode(shortcut, () => {
					generatorOpen = !generatorOpen;
				});
				return;
			case 'combat_next_turn':
				event.preventDefault();
				dispatchCombatShortcut('next-turn');
				return;
			case 'combat_quick_damage':
				event.preventDefault();
				dispatchCombatShortcut('quick-damage');
				return;
			case 'combat_quick_heal':
				event.preventDefault();
				dispatchCombatShortcut('quick-heal');
				return;
			case 'create_note':
				requireDmMode(shortcut, () => handleNewNote());
				return;
			case 'open_vault_folder':
				event.preventDefault();
				void handleDesktopVaultPicker();
				return;
			case 'export_markdown_archive':
				event.preventDefault();
				void handleDesktopMarkdownExport();
				return;
			case 'create_handout':
				event.preventDefault();
				handleCreateHandout();
				return;
			case 'toggle_local_navigation':
				event.preventDefault();
				if (layoutState.isExpanded) {
					if (desktopShellState.zenMode) return;
					desktopShellState.toggleLocalPanelCollapsed();
				} else {
					ui.toggleSidebar();
				}
				return;
			case 'toggle_detail_panel':
				if (!detailPanelAvailable) return;
				event.preventDefault();
				desktopShellState.toggleDetailPanel();
				return;
			case 'open_session_boards':
				if (playerModeState.enabled) return;
				event.preventDefault();
				goto(resolve('/session/boards'));
				return;
			case 'open_combat_tracker':
				if (playerModeState.enabled) return;
				event.preventDefault();
				goto(resolve('/session/combat'));
				return;
			case 'open_shortcuts_settings':
				event.preventDefault();
				goto(`${resolve('/settings')}?tab=general`);
				return;
			case 'open_global_search':
				event.preventDefault();
				goto(resolve('/knowledge/search'));
				return;
			default:
				return;
		}
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		inputModalityState.observeKeyboardEvent(event);
		if (keyboardShortcutOverlayOpen && event.key === 'Escape') {
			event.preventDefault();
			keyboardShortcutOverlayOpen = false;
		}
	}

	$effect(() => {
		if (typeof document === 'undefined') return;
		const manager = new KeyboardShortcutManager({
			getContext: (event) => {
				const target = event.target as HTMLElement;
				return {
					event,
					isTextEntry: isTextEntryTarget(target),
					isInEditor: target?.closest('.cm-editor') !== null,
					layoutTier: layoutState.tier,
					detailPanelAvailable: detailPanelShortcutAvailable(),
					combatTrackerActive: page.url.pathname === '/session/combat' && sessionModeState.isActive,
				};
			},
			onShortcut: (shortcut, event) => {
				dispatchKeyboardShortcut(shortcut, event);
			},
		});
		manager.start();
		return () => manager.stop();
	});
</script>

<svelte:head>
	<title>{documentTitle}</title>
	<meta
		name="description"
		content="D&D campaign note-taking app with wikilinks and bidirectional linking"
	/>
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#1f2937" />
</svelte:head>

<svelte:window onkeydown={handleWindowKeydown} />

{#if runtimeState.ready && !showSetupWizard}
	<a class="skip-link" href="#main-content">Skip to main content</a>
{/if}

{#if runtimeState.ready && showSetupWizard}
	<div class="flex h-screen items-center justify-center bg-bg">
		<SetupWizard
			{suggestedVaultName}
			loading={setupWizardSubmitting}
			onfinish={(input) => void handleSetupWizardFinish(input)}
		/>
	</div>
	<Toast />
	<LiveAnnouncer />
{:else if runtimeState.ready}
	<AppShell
		onnewnote={handleNewNote}
		onsearch={() => (quickSwitcherOpen = true)}
		ondice={() => (diceTrayOpen = true)}
		ontemplate={openTemplateDialog}
		onsetplayermode={handleSetPlayerMode}
		onopenkeyboardshortcuts={handleOpenKeyboardShortcuts}
	>
		{@render children()}
	</AppShell>
	<div
		class="sr-only"
		role="status"
		aria-live="polite"
		aria-atomic="true"
		data-testid="sync-status-announcer"
	>
		{syncStatusAnnouncement}
	</div>
	<div
		class="sr-only"
		role={vaultHealthAnnouncementRole}
		aria-live={vaultHealthAnnouncementRole === 'alert' ? 'assertive' : 'polite'}
		aria-atomic="true"
		data-testid="vault-health-announcer"
	>
		{vaultHealthAnnouncement}
	</div>
	<div
		class="sr-only"
		role="status"
		aria-live="polite"
		aria-atomic="true"
		data-testid="mcp-changes-announcer"
	>
		{mcpChangesAnnouncement}
	</div>
	<div
		class="sr-only"
		role="status"
		aria-live="polite"
		aria-atomic="true"
		data-testid="session-mode-announcer"
	>
		{sessionModeAnnouncement}
	</div>
	{#if quickSwitcherOpen}
		{#await import('$lib/ui/search/QuickSwitcher.svelte')}
			<div class="hidden" aria-hidden="true"></div>
		{:then QuickSwitcherModule}
			<QuickSwitcherModule.default
				bind:open={quickSwitcherOpen}
				onclose={() => (quickSwitcherOpen = false)}
				onnewnote={handleNewNote}
				oncreatehandout={handleCreateHandout}
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
	<FeatureSpotlight
		spotlight={featureSpotlightsState.active}
		ondismiss={() => void handleDismissFeatureSpotlight()}
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
