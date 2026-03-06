import type { WorldCalendar } from './world-calendar.js';
import type { SessionBoardTemplate } from './session-board.js';
import {
	createDefaultSyncEngineState,
	type SyncConflictStrategy,
	type SyncEngineState,
} from './sync.js';

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

export interface DiceMacro {
	id: string;
	label: string;
	expression: string;
	createdAt: string;
	updatedAt: string;
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
	playerModeEnabled: boolean;
	defaultNoteView: 'read' | 'edit';
	editor: EditorSettings;
	autoSaveDelay: number;
	trashRetentionDays: number;
	backupCadence: 'hourly' | 'daily' | 'on-close' | 'manual';
	backupRetentionCount: number;
	defaultSort: SortSettings;
	savedSearches: SavedSearch[];
	onboarding: OnboardingSettings;
	templateContext: TemplateContextSettings;
	diceMacros: DiceMacro[];
	mcpPolicySettings: McpPolicySettings;
	syncConflictStrategy: SyncConflictStrategy;
	syncEngineState: SyncEngineState;
	worldCalendar: WorldCalendar;
	boardTemplates: SessionBoardTemplate[];
}

export interface SettingRecord {
	key: string;
	value: unknown;
}

export const DEFAULT_SETTINGS: AppSettings = {
	theme: 'system',
	sidebarOpen: true,
	sidebarWidth: 240,
	focusReading: false,
	playerModeEnabled: false,
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
	diceMacros: [],
	mcpPolicySettings: {
		defaultPresetId: 'strict_review',
		perAgent: {},
	},
	syncConflictStrategy: 'manual',
	syncEngineState: createDefaultSyncEngineState(),
	boardTemplates: [],
	worldCalendar: {
		version: 1,
		months: [
			{ name: 'January', days: 31 },
			{ name: 'February', days: 28 },
			{ name: 'March', days: 31 },
			{ name: 'April', days: 30 },
			{ name: 'May', days: 31 },
			{ name: 'June', days: 30 },
			{ name: 'July', days: 31 },
			{ name: 'August', days: 31 },
			{ name: 'September', days: 30 },
			{ name: 'October', days: 31 },
			{ name: 'November', days: 30 },
			{ name: 'December', days: 31 },
		],
		weekLength: 7,
		dayNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
		leapYearRules: [
			{
				name: 'Leap day every 4 years',
				interval: 4,
				monthIndex: 1,
				dayDelta: 1,
			},
			{
				name: 'Skip leap day every 100 years',
				interval: 100,
				monthIndex: 1,
				dayDelta: -1,
			},
			{
				name: 'Restore leap day every 400 years',
				interval: 400,
				monthIndex: 1,
				dayDelta: 1,
			},
		],
		eras: [{ name: 'Common Era', epochOffset: 0 }],
		moonCycles: [],
		currentDayOffset: 0,
	},
};
