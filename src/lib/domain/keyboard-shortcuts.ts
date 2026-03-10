export type KeyboardShortcutSection =
	| 'Navigation'
	| 'Notes'
	| 'Session'
	| 'Dice'
	| 'Editor'
	| 'System';

export type KeyboardShortcutId =
	| 'open_command_palette'
	| 'open_global_search'
	| 'toggle_quick_reference_overlay'
	| 'create_note'
	| 'open_vault_folder'
	| 'open_session_boards'
	| 'open_combat_tracker'
	| 'toggle_session_quick_panel'
	| 'toggle_dice_tray'
	| 'toggle_generator_panel'
	| 'create_handout'
	| 'toggle_local_navigation'
	| 'toggle_detail_panel'
	| 'toggle_zen_mode'
	| 'open_shortcuts_settings'
	| 'open_shortcuts_overlay'
	| 'export_markdown_archive'
	| 'editor_save_note'
	| 'editor_toggle_bold'
	| 'editor_toggle_italic'
	| 'editor_toggle_inline_code'
	| 'editor_insert_link'
	| 'editor_undo'
	| 'editor_redo';

export interface KeyboardShortcutDefinition {
	id: KeyboardShortcutId;
	section: KeyboardShortcutSection;
	label: string;
	shortcut: string;
	keywords: string;
	scope: 'global' | 'editor';
}

export const KEYBOARD_SHORTCUT_SECTION_ORDER: readonly KeyboardShortcutSection[] = [
	'Navigation',
	'Notes',
	'Session',
	'Dice',
	'Editor',
	'System',
];

export const KEYBOARD_SHORTCUT_REGISTRY: readonly KeyboardShortcutDefinition[] = [
	{
		id: 'open_command_palette',
		section: 'Navigation',
		label: 'Open command palette',
		shortcut: 'Ctrl+P',
		keywords: 'command palette search navigation',
		scope: 'global',
	},
	{
		id: 'open_global_search',
		section: 'Navigation',
		label: 'Open global search',
		shortcut: 'Ctrl+Shift+F',
		keywords: 'search find notes',
		scope: 'global',
	},
	{
		id: 'toggle_quick_reference_overlay',
		section: 'Navigation',
		label: 'Toggle quick reference overlay',
		shortcut: 'Ctrl+Shift+Space',
		keywords: 'quick reference overlay',
		scope: 'global',
	},
	{
		id: 'create_note',
		section: 'Notes',
		label: 'Create new note',
		shortcut: 'Ctrl+N',
		keywords: 'new note create',
		scope: 'global',
	},
	{
		id: 'open_vault_folder',
		section: 'Notes',
		label: 'Open vault folder',
		shortcut: 'Ctrl+O',
		keywords: 'vault folder open',
		scope: 'global',
	},
	{
		id: 'open_session_boards',
		section: 'Session',
		label: 'Open session boards',
		shortcut: 'Ctrl+Shift+S',
		keywords: 'session boards',
		scope: 'global',
	},
	{
		id: 'open_combat_tracker',
		section: 'Session',
		label: 'Open combat tracker',
		shortcut: 'Ctrl+Shift+C',
		keywords: 'combat session',
		scope: 'global',
	},
	{
		id: 'toggle_session_quick_panel',
		section: 'Session',
		label: 'Toggle session quick panel',
		shortcut: 'Ctrl+Shift+B',
		keywords: 'session quick panel overlay',
		scope: 'global',
	},
	{
		id: 'toggle_dice_tray',
		section: 'Dice',
		label: 'Toggle dice tray',
		shortcut: 'Ctrl+D',
		keywords: 'dice roll tray',
		scope: 'global',
	},
	{
		id: 'toggle_generator_panel',
		section: 'Dice',
		label: 'Toggle generator panel',
		shortcut: 'Ctrl+G',
		keywords: 'generator random tables',
		scope: 'global',
	},
	{
		id: 'editor_save_note',
		section: 'Editor',
		label: 'Save note',
		shortcut: 'Ctrl+S',
		keywords: 'editor save',
		scope: 'editor',
	},
	{
		id: 'editor_toggle_bold',
		section: 'Editor',
		label: 'Toggle bold',
		shortcut: 'Ctrl+B',
		keywords: 'editor bold format',
		scope: 'editor',
	},
	{
		id: 'editor_toggle_italic',
		section: 'Editor',
		label: 'Toggle italic',
		shortcut: 'Ctrl+I',
		keywords: 'editor italic format',
		scope: 'editor',
	},
	{
		id: 'editor_toggle_inline_code',
		section: 'Editor',
		label: 'Toggle inline code',
		shortcut: 'Ctrl+E',
		keywords: 'editor code format',
		scope: 'editor',
	},
	{
		id: 'editor_insert_link',
		section: 'Editor',
		label: 'Insert link',
		shortcut: 'Ctrl+K',
		keywords: 'editor link',
		scope: 'editor',
	},
	{
		id: 'editor_undo',
		section: 'Editor',
		label: 'Undo',
		shortcut: 'Ctrl+Z',
		keywords: 'editor undo',
		scope: 'editor',
	},
	{
		id: 'editor_redo',
		section: 'Editor',
		label: 'Redo',
		shortcut: 'Ctrl+Shift+Z',
		keywords: 'editor redo',
		scope: 'editor',
	},
	{
		id: 'toggle_local_navigation',
		section: 'System',
		label: 'Toggle local navigation',
		shortcut: 'Ctrl+B',
		keywords: 'sidebar local navigation',
		scope: 'global',
	},
	{
		id: 'toggle_detail_panel',
		section: 'System',
		label: 'Toggle contextual detail panel',
		shortcut: 'Ctrl+Shift+R',
		keywords: 'detail panel context',
		scope: 'global',
	},
	{
		id: 'toggle_zen_mode',
		section: 'System',
		label: 'Toggle zen mode',
		shortcut: 'F11',
		keywords: 'zen mode focus',
		scope: 'global',
	},
	{
		id: 'create_handout',
		section: 'System',
		label: 'Create handout',
		shortcut: 'Ctrl+Shift+H',
		keywords: 'handout',
		scope: 'global',
	},
	{
		id: 'export_markdown_archive',
		section: 'System',
		label: 'Export markdown archive',
		shortcut: 'Ctrl+Shift+E',
		keywords: 'export markdown',
		scope: 'global',
	},
	{
		id: 'open_shortcuts_settings',
		section: 'System',
		label: 'Open keyboard shortcuts in settings',
		shortcut: 'Ctrl+/',
		keywords: 'shortcuts settings',
		scope: 'global',
	},
	{
		id: 'open_shortcuts_overlay',
		section: 'System',
		label: 'Open keyboard shortcut overlay',
		shortcut: '?',
		keywords: 'shortcuts help overlay',
		scope: 'global',
	},
] as const;

export interface KeyboardShortcutMatchContext {
	event: KeyboardEvent;
	isTextEntry: boolean;
	isInEditor: boolean;
	layoutTier: 'compact' | 'medium' | 'expanded';
	detailPanelAvailable: boolean;
}

function hasPrimaryModifier(event: KeyboardEvent): boolean {
	return event.ctrlKey || event.metaKey;
}

function keyLower(event: KeyboardEvent): string {
	return event.key.toLowerCase();
}

function isQuestionMarkPress(event: KeyboardEvent): boolean {
	return event.key === '?' || (event.code === 'Slash' && event.shiftKey);
}

export function matchGlobalKeyboardShortcut(
	context: KeyboardShortcutMatchContext,
): KeyboardShortcutId | null {
	const { event, isTextEntry, isInEditor, layoutTier, detailPanelAvailable } = context;
	const withModifier = hasPrimaryModifier(event);
	const lower = keyLower(event);

	if (isQuestionMarkPress(event) && !withModifier && !isTextEntry) {
		return 'open_shortcuts_overlay';
	}

	if (event.key === 'F11' && layoutTier === 'expanded') {
		return 'toggle_zen_mode';
	}

	if (!withModifier) {
		return null;
	}

	if (lower === 'p' && !event.shiftKey) return 'open_command_palette';
	if (event.shiftKey && event.code === 'Space') return 'toggle_quick_reference_overlay';
	if (lower === 'd' && !event.shiftKey) return 'toggle_dice_tray';
	if (lower === 'g' && !event.shiftKey) return 'toggle_generator_panel';
	if (lower === 'n' && !event.shiftKey) return 'create_note';
	if (lower === 'o' && !event.shiftKey) return 'open_vault_folder';
	if (event.shiftKey && lower === 'e') return 'export_markdown_archive';
	if (event.shiftKey && lower === 'h') return 'create_handout';
	if (event.shiftKey && lower === 'b') return 'toggle_session_quick_panel';
	if (!event.shiftKey && event.key === 'b' && !isInEditor) return 'toggle_local_navigation';
	if (event.shiftKey && lower === 'r' && !isInEditor && detailPanelAvailable) {
		return 'toggle_detail_panel';
	}
	if (event.shiftKey && lower === 's') return 'open_session_boards';
	if (event.shiftKey && lower === 'c') return 'open_combat_tracker';
	if (!event.shiftKey && event.key === '/') return 'open_shortcuts_settings';
	if (event.shiftKey && event.key === 'F') return 'open_global_search';

	return null;
}
