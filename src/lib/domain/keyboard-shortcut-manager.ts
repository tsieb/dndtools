import {
	matchGlobalKeyboardShortcut,
	type KeyboardShortcutId,
	type KeyboardShortcutMatchContext,
} from './keyboard-shortcuts.js';

export interface KeyboardShortcutManagerOptions {
	getContext: (event: KeyboardEvent) => KeyboardShortcutMatchContext;
	onShortcut: (shortcutId: KeyboardShortcutId, event: KeyboardEvent) => void;
}

export class KeyboardShortcutManager {
	private readonly getContext: KeyboardShortcutManagerOptions['getContext'];
	private readonly onShortcut: KeyboardShortcutManagerOptions['onShortcut'];
	private readonly handleKeydown = (event: KeyboardEvent): void => {
		const shortcut = matchGlobalKeyboardShortcut(this.getContext(event));
		if (!shortcut) return;
		this.onShortcut(shortcut, event);
	};
	private listening = false;

	constructor(options: KeyboardShortcutManagerOptions) {
		this.getContext = options.getContext;
		this.onShortcut = options.onShortcut;
	}

	start(): void {
		if (this.listening || typeof document === 'undefined') return;
		document.addEventListener('keydown', this.handleKeydown);
		this.listening = true;
	}

	stop(): void {
		if (!this.listening || typeof document === 'undefined') return;
		document.removeEventListener('keydown', this.handleKeydown);
		this.listening = false;
	}
}
