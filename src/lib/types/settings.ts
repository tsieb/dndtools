import type { WorldCalendar } from './world-calendar.js';
import type { SessionBoardTemplate } from './session-board.js';
import type { ThemeSetting } from '$lib/domain/theme.js';
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

export type UiDensityMode = 'standard' | 'compact';
export type NoteReadingWidthMode = 'comfortable' | 'wide' | 'full';
export type ReduceMotionMode = 'system' | 'reduce' | 'no-preference';
export type HighContrastMode = 'system' | 'high' | 'standard';

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

export type OnboardingPhase = 'not_started' | 'started' | 'completed';

export type OnboardingMilestoneId =
	| 'vault_created'
	| 'first_note'
	| 'first_link'
	| 'first_tag'
	| 'first_template'
	| 'first_search'
	| 'first_session';

export const ONBOARDING_MILESTONE_IDS: readonly OnboardingMilestoneId[] = [
	'vault_created',
	'first_note',
	'first_link',
	'first_tag',
	'first_template',
	'first_search',
	'first_session',
];

export type OnboardingGuidedPromptId = 'first_note_link_hint' | 'second_note_link_hint';

export const ONBOARDING_GUIDED_PROMPT_IDS: readonly OnboardingGuidedPromptId[] = [
	'first_note_link_hint',
	'second_note_link_hint',
];

export interface OnboardingSettings {
	onboardingComplete: boolean | null;
	onboardingPhase: OnboardingPhase;
	vaultName: string;
	milestones: Record<OnboardingMilestoneId, boolean>;
	shownPrompts: OnboardingGuidedPromptId[];
	dismissedPrompts: OnboardingGuidedPromptId[];
	lastSeenWhatsNewVersion: string | null;
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

export type AdvancedFeatureId =
	| 'mcp_staged_review'
	| 'object_notes'
	| 'encounter_builder'
	| 'knowledge_graph'
	| 'timeline'
	| 'handout_delivery'
	| 'custom_templates'
	| 'theme_presets'
	| 'random_tables'
	| 'inline_dice_rolls';

export const ADVANCED_FEATURE_IDS: readonly AdvancedFeatureId[] = [
	'mcp_staged_review',
	'object_notes',
	'encounter_builder',
	'knowledge_graph',
	'timeline',
	'handout_delivery',
	'custom_templates',
	'theme_presets',
	'random_tables',
	'inline_dice_rolls',
];

export interface AdvancedFeatureSettings {
	mcp_staged_review: boolean;
	object_notes: boolean;
	encounter_builder: boolean;
	knowledge_graph: boolean;
	timeline: boolean;
	handout_delivery: boolean;
	custom_templates: boolean;
	theme_presets: boolean;
	random_tables: boolean;
	inline_dice_rolls: boolean;
}

export interface FeatureSettings {
	advanced: AdvancedFeatureSettings;
	mcpAccessAcknowledged: boolean;
	dismissedPrompts: string[];
}

export function normalizeSeenSpotlights(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const deduped = new Set<string>();
	for (const entry of raw) {
		if (typeof entry !== 'string') continue;
		const normalized = entry.trim();
		if (!normalized) continue;
		deduped.add(normalized);
	}
	return [...deduped];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAdvancedFeatureId(value: string): value is AdvancedFeatureId {
	return ADVANCED_FEATURE_IDS.includes(value as AdvancedFeatureId);
}

function defaultOnboardingMilestones(): Record<OnboardingMilestoneId, boolean> {
	return {
		vault_created: false,
		first_note: false,
		first_link: false,
		first_tag: false,
		first_template: false,
		first_search: false,
		first_session: false,
	};
}

function normalizeOnboardingPhase(raw: unknown): OnboardingPhase {
	return raw === 'started' || raw === 'completed' ? raw : 'not_started';
}

function isOnboardingGuidedPromptId(value: string): value is OnboardingGuidedPromptId {
	return ONBOARDING_GUIDED_PROMPT_IDS.includes(value as OnboardingGuidedPromptId);
}

function normalizeOnboardingPromptList(raw: unknown): OnboardingGuidedPromptId[] {
	if (!Array.isArray(raw)) return [];
	const deduped = new Set<OnboardingGuidedPromptId>();
	for (const value of raw) {
		if (typeof value !== 'string' || !isOnboardingGuidedPromptId(value)) continue;
		deduped.add(value);
	}
	return [...deduped];
}

function normalizeOnboardingMilestones(raw: unknown): Record<OnboardingMilestoneId, boolean> {
	const milestones = defaultOnboardingMilestones();
	if (!isRecord(raw)) return milestones;
	for (const milestoneId of ONBOARDING_MILESTONE_IDS) {
		if (typeof raw[milestoneId] === 'boolean') {
			milestones[milestoneId] = raw[milestoneId];
		}
	}
	return milestones;
}

export function normalizeOnboardingSettings(raw: unknown): OnboardingSettings {
	const defaults: OnboardingSettings = {
		onboardingComplete: null,
		onboardingPhase: 'not_started',
		vaultName: '',
		milestones: defaultOnboardingMilestones(),
		shownPrompts: [],
		dismissedPrompts: [],
		lastSeenWhatsNewVersion: null,
	};

	if (!isRecord(raw)) {
		return defaults;
	}

	const milestones = normalizeOnboardingMilestones(raw.milestones);
	const legacyStepToMilestone: Partial<Record<string, OnboardingMilestoneId>> = {
		create_first_note: 'first_note',
		add_link: 'first_link',
		add_tag: 'first_tag',
		use_search: 'first_search',
	};
	if (Array.isArray(raw.completedSteps)) {
		for (const step of raw.completedSteps) {
			if (typeof step !== 'string') continue;
			const mapped = legacyStepToMilestone[step];
			if (!mapped) continue;
			milestones[mapped] = true;
		}
	}

	const shownPrompts = normalizeOnboardingPromptList(raw.shownPrompts);
	const dismissedPrompts = normalizeOnboardingPromptList(raw.dismissedPrompts);

	let onboardingPhase = normalizeOnboardingPhase(raw.onboardingPhase);
	let onboardingComplete: boolean | null =
		typeof raw.onboardingComplete === 'boolean'
			? raw.onboardingComplete
			: defaults.onboardingComplete;

	const hasAnyMilestone = ONBOARDING_MILESTONE_IDS.some((milestoneId) => milestones[milestoneId]);
	const hasLegacyState = Array.isArray(raw.completedSteps) || raw.dismissed === true;
	if (
		onboardingPhase === 'not_started' &&
		(hasAnyMilestone || hasLegacyState || shownPrompts.length > 0 || dismissedPrompts.length > 0)
	) {
		onboardingPhase = 'started';
	}

	if (onboardingPhase === 'completed') {
		onboardingComplete = true;
	} else if (onboardingPhase !== 'not_started' && onboardingComplete === null) {
		onboardingComplete = false;
	}

	return {
		onboardingComplete,
		onboardingPhase,
		vaultName: typeof raw.vaultName === 'string' ? raw.vaultName.trim() : defaults.vaultName,
		milestones,
		shownPrompts,
		dismissedPrompts,
		lastSeenWhatsNewVersion:
			typeof raw.lastSeenWhatsNewVersion === 'string' &&
			raw.lastSeenWhatsNewVersion.trim().length > 0
				? raw.lastSeenWhatsNewVersion.trim()
				: defaults.lastSeenWhatsNewVersion,
	};
}

function defaultAdvancedFeatureSettings(): AdvancedFeatureSettings {
	return {
		mcp_staged_review: false,
		object_notes: false,
		encounter_builder: false,
		knowledge_graph: false,
		timeline: false,
		handout_delivery: false,
		custom_templates: false,
		theme_presets: false,
		random_tables: false,
		inline_dice_rolls: false,
	};
}

export function normalizeFeatureSettings(raw: unknown): FeatureSettings {
	const defaults: FeatureSettings = {
		advanced: defaultAdvancedFeatureSettings(),
		mcpAccessAcknowledged: false,
		dismissedPrompts: [],
	};
	if (!isRecord(raw)) return defaults;
	const rawAdvanced = isRecord(raw.advanced) ? raw.advanced : {};
	const advanced = { ...defaults.advanced };
	for (const id of ADVANCED_FEATURE_IDS) {
		if (typeof rawAdvanced[id] === 'boolean') {
			advanced[id] = rawAdvanced[id];
		}
	}
	const dismissedPrompts = Array.isArray(raw.dismissedPrompts)
		? raw.dismissedPrompts.filter((entry): entry is string => typeof entry === 'string')
		: defaults.dismissedPrompts;
	return {
		advanced,
		mcpAccessAcknowledged:
			typeof raw.mcpAccessAcknowledged === 'boolean'
				? raw.mcpAccessAcknowledged
				: defaults.mcpAccessAcknowledged,
		dismissedPrompts,
	};
}

export interface AppSettings {
	theme: ThemeSetting;
	uiDensity: UiDensityMode;
	noteReadingWidth: NoteReadingWidthMode;
	reduceMotion: ReduceMotionMode;
	highContrast: HighContrastMode;
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
	featureSettings: FeatureSettings;
	seenSpotlights: string[];
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
	uiDensity: 'standard',
	noteReadingWidth: 'comfortable',
	reduceMotion: 'system',
	highContrast: 'system',
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
		onboardingComplete: null,
		onboardingPhase: 'not_started',
		vaultName: '',
		milestones: defaultOnboardingMilestones(),
		shownPrompts: [],
		dismissedPrompts: [],
		lastSeenWhatsNewVersion: null,
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
	featureSettings: {
		advanced: defaultAdvancedFeatureSettings(),
		mcpAccessAcknowledged: false,
		dismissedPrompts: [],
	},
	seenSpotlights: [],
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
