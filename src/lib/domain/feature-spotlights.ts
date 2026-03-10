import type { AdvancedFeatureId } from '$lib/types/settings.js';

export interface FeatureSpotlightDefinition {
	id: string;
	featureId: AdvancedFeatureId;
	title: string;
	description: string;
	selectors: readonly string[];
	encounterPaths: readonly string[];
}

function createSpotlightId(featureId: AdvancedFeatureId): string {
	return `feature-spotlight:${featureId}`;
}

function featureToggleSelector(featureId: AdvancedFeatureId): string {
	return `[data-feature-toggle-id="${featureId}"]`;
}

export const FEATURE_SPOTLIGHTS: readonly FeatureSpotlightDefinition[] = [
	{
		id: createSpotlightId('mcp_staged_review'),
		featureId: 'mcp_staged_review',
		title: 'MCP Staged Review',
		description:
			'Review AI-proposed changes here before they touch your vault. This keeps high-trust automation transparent and reversible while you build confidence.',
		selectors: [
			'[data-help-target="mcp-staged-review-counter"]',
			featureToggleSelector('mcp_staged_review'),
		],
		encounterPaths: ['/settings', '/knowledge', '/atlas', '/session', '/campaign'],
	},
	{
		id: createSpotlightId('object_notes'),
		featureId: 'object_notes',
		title: 'Object Notes',
		description:
			'Object Notes give structure to NPCs, factions, quests, and other campaign entities. Use them to keep relationships clear and campaign context connected.',
		selectors: ['[data-help-target="object-notes-concept"]', featureToggleSelector('object_notes')],
		encounterPaths: ['/campaign', '/knowledge'],
	},
	{
		id: createSpotlightId('encounter_builder'),
		featureId: 'encounter_builder',
		title: 'Encounter Builder',
		description:
			'Encounter Builder speeds up prep by structuring combat setup and reusable templates. Open Session tools to start drafting encounters quickly.',
		selectors: [featureToggleSelector('encounter_builder')],
		encounterPaths: ['/session/encounter/new', '/session/boards'],
	},
	{
		id: createSpotlightId('knowledge_graph'),
		featureId: 'knowledge_graph',
		title: 'Knowledge Graph',
		description:
			'Knowledge Graph reveals how notes connect across your vault. Use it to find relationship clusters and discover hidden navigation paths.',
		selectors: [featureToggleSelector('knowledge_graph')],
		encounterPaths: ['/knowledge/graph', '/knowledge/search'],
	},
	{
		id: createSpotlightId('timeline'),
		featureId: 'timeline',
		title: 'Timeline',
		description:
			'Timeline tracks campaign events chronologically so session history stays coherent. It is especially useful for recaps and continuity checks.',
		selectors: [featureToggleSelector('timeline')],
		encounterPaths: ['/campaign/timeline'],
	},
	{
		id: createSpotlightId('handout_delivery'),
		featureId: 'handout_delivery',
		title: 'Handout Delivery',
		description:
			'Handout Delivery lets you present player-facing assets directly from session workflows. Use it to keep reveals intentional and fast at the table.',
		selectors: [featureToggleSelector('handout_delivery')],
		encounterPaths: ['/session/boards'],
	},
	{
		id: createSpotlightId('custom_templates'),
		featureId: 'custom_templates',
		title: 'Custom Templates',
		description:
			'Custom Templates speed repetitive note creation with consistent structure. Use them when your campaign has recurring documentation patterns.',
		selectors: [featureToggleSelector('custom_templates')],
		encounterPaths: ['/knowledge/notes', '/settings'],
	},
	{
		id: createSpotlightId('theme_presets'),
		featureId: 'theme_presets',
		title: 'Theme Presets',
		description:
			'Theme Presets let you switch visual mood quickly while preserving readability. Pick the style that supports your current prep or play context.',
		selectors: [featureToggleSelector('theme_presets')],
		encounterPaths: ['/settings'],
	},
	{
		id: createSpotlightId('random_tables'),
		featureId: 'random_tables',
		title: 'Random Tables',
		description:
			'Random Tables help improvise names, details, and outcomes during live play. Keep them ready for fast, low-friction rulings.',
		selectors: [featureToggleSelector('random_tables')],
		encounterPaths: ['/session/boards'],
	},
	{
		id: createSpotlightId('inline_dice_rolls'),
		featureId: 'inline_dice_rolls',
		title: 'Inline Dice Rolls',
		description:
			'Inline Dice Rolls let note content trigger calculations in context. This keeps rules and outcomes together where decisions are made.',
		selectors: [featureToggleSelector('inline_dice_rolls')],
		encounterPaths: ['/knowledge/notes', '/session/boards'],
	},
] as const;

const BY_FEATURE = new Map(FEATURE_SPOTLIGHTS.map((entry) => [entry.featureId, entry]));
const BY_ID = new Map(FEATURE_SPOTLIGHTS.map((entry) => [entry.id, entry]));

export function getSpotlightForFeature(
	featureId: AdvancedFeatureId,
): FeatureSpotlightDefinition | null {
	return BY_FEATURE.get(featureId) ?? null;
}

export function getSpotlightById(id: string): FeatureSpotlightDefinition | null {
	return BY_ID.get(id) ?? null;
}

export function routeMatchesSpotlight(
	pathname: string,
	spotlight: FeatureSpotlightDefinition,
): boolean {
	return spotlight.encounterPaths.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}
