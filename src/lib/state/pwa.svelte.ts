import { Capacitor } from '@capacitor/core';

const NOTE_OPEN_COUNT_KEY = 'dndtools.pwa.noteOpenCount';
const INSTALL_PROMPT_DISMISSED_KEY = 'dndtools.pwa.installPromptDismissed';
const INSTALL_LAST_NOTE_ID_KEY = 'dndtools.pwa.lastTrackedNoteId';

function isStandaloneDisplayMode(): boolean {
	if (typeof window === 'undefined') return false;
	const mediaMatch = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
	const navigatorStandalone =
		typeof navigator !== 'undefined' &&
		Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
	return mediaMatch || navigatorStandalone;
}

function isIosBrowserInstallFlow(): boolean {
	if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
	const userAgent = navigator.userAgent.toLowerCase();
	const iosLikeDevice = /iphone|ipad|ipod/.test(userAgent);
	return iosLikeDevice && !isStandaloneDisplayMode();
}

class PwaState {
	initialized = $state(false);
	online = $state(true);
	serviceWorkerReady = $state(false);
	installPromptDismissed = $state(false);
	noteOpenCount = $state(0);
	installed = $state(false);
	iosManualInstallFlow = $state(false);
	promptEvent = $state<BeforeInstallPromptEvent | null>(null);

	private lastTrackedNoteId: string | null = null;
	private teardown: (() => void) | null = null;
	private hasRuntimeInitialization = false;

	browserRuntime = $derived.by(
		() => typeof window !== 'undefined' && !window.dndtoolsDesktop && !Capacitor.isNativePlatform(),
	);

	cacheOnlyOffline = $derived.by(
		() => this.browserRuntime && this.serviceWorkerReady && !this.online,
	);

	canInstall = $derived.by(
		() =>
			this.browserRuntime &&
			!this.installed &&
			!isStandaloneDisplayMode() &&
			(this.promptEvent !== null || this.iosManualInstallFlow),
	);

	shouldShowInstallPrompt = $derived.by(
		() => this.canInstall && !this.installPromptDismissed && this.noteOpenCount >= 3,
	);

	get installPromptDescription(): string {
		if (this.promptEvent) {
			return 'Install DND Tools for a full-screen app with offline access.';
		}
		return 'Open the browser share menu, then choose "Add to Home Screen" to install.';
	}

	initialize(): void {
		if (this.hasRuntimeInitialization || typeof window === 'undefined') return;
		if (window.dndtoolsDesktop || Capacitor.isNativePlatform()) {
			this.hasRuntimeInitialization = true;
			this.initialized = true;
			return;
		}

		this.online = navigator.onLine;
		this.serviceWorkerReady = Boolean(navigator.serviceWorker?.controller);
		this.installed = isStandaloneDisplayMode();
		this.iosManualInstallFlow = isIosBrowserInstallFlow();
		this.loadPersistedState();

		const onOnline = (): void => {
			this.online = true;
		};
		const onOffline = (): void => {
			this.online = false;
		};
		const onBeforeInstallPrompt = (event: Event): void => {
			event.preventDefault();
			this.promptEvent = event as BeforeInstallPromptEvent;
		};
		const onInstalled = (): void => {
			this.installed = true;
			this.promptEvent = null;
			this.installPromptDismissed = true;
			this.persistState();
		};

		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOffline);
		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		window.addEventListener('appinstalled', onInstalled);

		void navigator.serviceWorker?.ready
			.then(() => {
				this.markServiceWorkerReady();
			})
			.catch(() => undefined);

		this.teardown = () => {
			window.removeEventListener('online', onOnline);
			window.removeEventListener('offline', onOffline);
			window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
			window.removeEventListener('appinstalled', onInstalled);
		};
		this.hasRuntimeInitialization = true;
		this.initialized = true;
	}

	dispose(): void {
		if (!this.hasRuntimeInitialization) return;
		this.teardown?.();
		this.teardown = null;
		this.hasRuntimeInitialization = false;
		this.initialized = false;
	}

	markServiceWorkerReady(): void {
		this.serviceWorkerReady = true;
	}

	recordNoteOpened(noteId: string): void {
		if (!this.browserRuntime || this.installed) return;
		if (this.lastTrackedNoteId === noteId) return;
		this.lastTrackedNoteId = noteId;
		this.noteOpenCount += 1;
		this.persistState();
	}

	dismissInstallPrompt(): void {
		this.installPromptDismissed = true;
		this.persistState();
	}

	async promptInstall(): Promise<void> {
		if (!this.promptEvent) return;
		try {
			await this.promptEvent.prompt();
			const choice = await this.promptEvent.userChoice;
			if (choice.outcome === 'accepted') {
				this.installed = true;
				this.installPromptDismissed = true;
			}
			this.promptEvent = null;
			this.persistState();
		} catch {
			this.promptEvent = null;
			this.persistState();
		}
	}

	private loadPersistedState(): void {
		try {
			const rawCount = window.localStorage.getItem(NOTE_OPEN_COUNT_KEY);
			const rawDismissed = window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY);
			const rawLastNoteId = window.localStorage.getItem(INSTALL_LAST_NOTE_ID_KEY);
			const parsedCount = Number.parseInt(rawCount ?? '', 10);
			this.noteOpenCount = Number.isFinite(parsedCount) && parsedCount >= 0 ? parsedCount : 0;
			this.installPromptDismissed = rawDismissed === '1';
			this.lastTrackedNoteId = rawLastNoteId && rawLastNoteId.length > 0 ? rawLastNoteId : null;
		} catch {
			this.noteOpenCount = 0;
			this.installPromptDismissed = false;
			this.lastTrackedNoteId = null;
		}
	}

	private persistState(): void {
		try {
			window.localStorage.setItem(NOTE_OPEN_COUNT_KEY, String(this.noteOpenCount));
			window.localStorage.setItem(
				INSTALL_PROMPT_DISMISSED_KEY,
				this.installPromptDismissed ? '1' : '0',
			);
			if (this.lastTrackedNoteId) {
				window.localStorage.setItem(INSTALL_LAST_NOTE_ID_KEY, this.lastTrackedNoteId);
			} else {
				window.localStorage.removeItem(INSTALL_LAST_NOTE_ID_KEY);
			}
		} catch {
			// Ignore storage failures in private browsing or restrictive policies.
		}
	}
}

export const pwaState = new PwaState();
