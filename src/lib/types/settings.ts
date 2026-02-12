export interface EditorSettings {
	fontSize: number;
	lineHeight: number;
	showLineNumbers: boolean;
	wordWrap: boolean;
	vimMode: boolean;
}

export interface SortSettings {
	field: 'title' | 'updatedAt' | 'createdAt';
	direction: 'asc' | 'desc';
}

export interface AppSettings {
	theme: 'light' | 'dark' | 'system';
	sidebarOpen: boolean;
	sidebarWidth: number;
	defaultNoteView: 'read' | 'edit';
	editor: EditorSettings;
	autoSaveDelay: number;
	trashRetentionDays: number;
	defaultSort: SortSettings;
}

export interface SettingRecord {
	key: string;
	value: unknown;
}

export const DEFAULT_SETTINGS: AppSettings = {
	theme: 'system',
	sidebarOpen: true,
	sidebarWidth: 260,
	defaultNoteView: 'read',
	editor: {
		fontSize: 16,
		lineHeight: 1.6,
		showLineNumbers: false,
		wordWrap: true,
		vimMode: false,
	},
	autoSaveDelay: 500,
	trashRetentionDays: 30,
	defaultSort: {
		field: 'updatedAt',
		direction: 'desc',
	},
};
