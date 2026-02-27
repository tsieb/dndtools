export interface EditorSettings {
	fontSize: number;
	lineHeight: number;
	showLineNumbers: boolean;
	wordWrap: boolean;
	vimMode: boolean;
	splitPane: boolean;
	toolbarDensity: 'compact' | 'comfortable';
}

export interface SortSettings {
	field: 'title' | 'updatedAt' | 'createdAt';
	direction: 'asc' | 'desc';
}

export interface SavedSearch {
	id: string;
	name: string;
	query: string;
	createdAt: string;
	updatedAt: string;
}

export type OnboardingStepId =
	| 'create_first_note'
	| 'add_link'
	| 'add_tag'
	| 'use_search'
	| 'open_settings';

export type OnboardingTipId = 'wikilinks' | 'backlinks' | 'object_embeds';

export interface OnboardingSettings {
	dismissed: boolean;
	completedSteps: OnboardingStepId[];
	dismissedTips: OnboardingTipId[];
}

export interface TemplateContextSettings {
	campaignName: string;
	sessionNumber: number;
	characterNames: string[];
}

export type McpPolicyPresetId = 'strict_review' | 'balanced' | 'trusted';

export interface McpPolicySettings {
	defaultPresetId: McpPolicyPresetId;
	perAgent: Record<string, McpPolicyPresetId>;
}

export interface AppSettings {
	theme: 'light' | 'dark' | 'system';
	sidebarOpen: boolean;
	sidebarWidth: number;
	focusReading: boolean;
	defaultNoteView: 'read' | 'edit';
	editor: EditorSettings;
	autoSaveDelay: number;
	trashRetentionDays: number;
	backupCadence: 'hourly' | 'daily' | 'manual';
	backupRetentionCount: number;
	defaultSort: SortSettings;
	savedSearches: SavedSearch[];
	onboarding: OnboardingSettings;
	templateContext: TemplateContextSettings;
	mcpPolicySettings: McpPolicySettings;
}

export interface SettingRecord {
	key: string;
	value: unknown;
}

export const DEFAULT_SETTINGS: AppSettings = {
	theme: 'system',
	sidebarOpen: true,
	sidebarWidth: 260,
	focusReading: false,
	defaultNoteView: 'read',
	editor: {
		fontSize: 16,
		lineHeight: 1.6,
		showLineNumbers: false,
		wordWrap: true,
		vimMode: false,
		splitPane: true,
		toolbarDensity: 'comfortable',
	},
	autoSaveDelay: 500,
	trashRetentionDays: 30,
	backupCadence: 'daily',
	backupRetentionCount: 20,
	defaultSort: {
		field: 'updatedAt',
		direction: 'desc',
	},
	savedSearches: [],
	onboarding: {
		dismissed: false,
		completedSteps: [],
		dismissedTips: [],
	},
	templateContext: {
		campaignName: '',
		sessionNumber: 1,
		characterNames: [],
	},
	mcpPolicySettings: {
		defaultPresetId: 'strict_review',
		perAgent: {},
	},
};
