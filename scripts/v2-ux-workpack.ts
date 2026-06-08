import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';

export type UxRequirementPriority = 'Must-have' | 'Should-have' | 'Could-have';
export type UxEpicStatus = 'proposed' | 'approved' | 'active' | 'complete' | 'deferred';
export type UxProductPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface UxRequirementRecord {
	id: string;
	domain: string;
	title: string;
	statement: string;
	priority: UxRequirementPriority;
	acceptanceCriteria: string[];
	file: string;
	line: number;
}

export interface UxRequirementPackage {
	requirements: UxRequirementRecord[];
}

export interface UxStoryDefinition {
	id: string;
	title: string;
	acceptanceCriteria: string[];
	tasks?: Array<{
		id: string;
		title: string;
		kind: UxTaskKind;
	}>;
}

export type UxTaskKind =
	| 'decision'
	| 'design'
	| 'implementation'
	| 'test'
	| 'documentation'
	| 'demo';

export interface UxEpicDefinition {
	id: string;
	title: string;
	phase: string;
	productPriority: UxProductPriority;
	domain: string;
	objective: string;
	requirementIds: string[];
	dependencies: string[];
	expectedAffectedAreas: string[];
	sourceDocs?: string[];
	parallelSafetyNotes?: string;
	customStories?: UxStoryDefinition[];
}

export interface UxStoryPacket {
	id: string;
	title: string;
	requirementIds: string[];
	acceptanceCriteria: string[];
	tasks: Array<{
		id: string;
		title: string;
		kind: UxTaskKind;
	}>;
}

export interface UxEpicPacket {
	schemaVersion: 1;
	kind: 'ux-ui-remake-epic';
	id: string;
	title: string;
	status: UxEpicStatus;
	approved: boolean;
	phase: string;
	productPriority: UxProductPriority;
	domain: string;
	objective: string;
	requirementIds: string[];
	sourceDocs: string[];
	expectedAffectedAreas: string[];
	dependencies: string[];
	parallelSafety: {
		fileOwnership: string[];
		notes: string;
	};
	stories: UxStoryPacket[];
	qualityBar: string[];
	gitWorkflow: string[];
	statusAutomation: string[];
	testPlan: string[];
	demoNotesTemplate: string[];
	stopConditions: string[];
	completionEvidence: string[];
	completionEvidenceFile?: string;
}

export interface UxEpicStateOverride {
	id: string;
	status?: UxEpicStatus;
	approved?: boolean;
	completionEvidenceFile?: string;
	notes?: string;
}

export interface UxWorkpackPrecedence {
	phases: string[];
	epics: string[];
}

export interface UxWorkpackState {
	schemaVersion: 1;
	sourceOfTruth: {
		purpose: string;
		generatedFiles: string[];
	};
	defaults: {
		status: UxEpicStatus;
		approved: boolean;
	};
	precedence?: UxWorkpackPrecedence;
	epics: UxEpicStateOverride[];
}

export interface UxWorkpackValidationIssue {
	file: string;
	message: string;
}

const repoRoot = process.cwd();
const uxPlanningDir = path.join(repoRoot, 'docs', 'planning', 'v2', 'ux');
const templatesDir = path.join(repoRoot, 'docs', 'planning', 'v2', 'templates');
const uxStateFileName = 'workpack-state.yaml';

const uxGeneratedWorkpackFiles = [
	'docs/planning/v2/ux/requirements-index.yaml',
	'docs/planning/v2/ux/initiative-map.yaml',
	'docs/planning/v2/ux/status.yaml',
	'docs/planning/v2/ux/parallel-batches.yaml',
	'docs/planning/v2/ux/epics/*.yaml',
];

const uxFoundationDocs = [
	'docs/remake-review/ux-requirements/README.md',
	'docs/remake-review/ux-requirements/00-overview-and-principles.md',
	'docs/remake-review/ux-requirements/16-ideal-gui-architecture.md',
];

const uxEpicStatuses = ['proposed', 'approved', 'active', 'complete', 'deferred'] as const;

const uxTaskKinds = [
	'decision',
	'design',
	'implementation',
	'test',
	'documentation',
	'demo',
] as const;

const uxEpicPacketSchema: z.ZodType<UxEpicPacket> = z.object({
	schemaVersion: z.literal(1),
	kind: z.literal('ux-ui-remake-epic'),
	id: z.string().min(1),
	title: z.string().min(1),
	status: z.enum(uxEpicStatuses),
	approved: z.boolean(),
	phase: z.string().min(1),
	productPriority: z.enum(['P0', 'P1', 'P2', 'P3']),
	domain: z.string().min(1),
	objective: z.string().min(1),
	requirementIds: z.array(z.string().min(1)),
	sourceDocs: z.array(z.string().min(1)).min(1),
	expectedAffectedAreas: z.array(z.string().min(1)).min(1),
	dependencies: z.array(z.string()),
	parallelSafety: z.object({
		fileOwnership: z.array(z.string().min(1)).min(1),
		notes: z.string().min(1),
	}),
	stories: z
		.array(
			z.object({
				id: z.string().min(1),
				title: z.string().min(1),
				requirementIds: z.array(z.string().min(1)),
				acceptanceCriteria: z.array(z.string().min(1)).min(1),
				tasks: z
					.array(
						z.object({
							id: z.string().min(1),
							title: z.string().min(1),
							kind: z.enum(uxTaskKinds),
						}),
					)
					.min(1),
			}),
		)
		.min(1),
	qualityBar: z.array(z.string().min(1)).min(1),
	gitWorkflow: z.array(z.string().min(1)).min(1),
	statusAutomation: z.array(z.string().min(1)).min(1),
	testPlan: z.array(z.string().min(1)).min(1),
	demoNotesTemplate: z.array(z.string().min(1)).min(1),
	stopConditions: z.array(z.string().min(1)).min(1),
	completionEvidence: z.array(z.string().min(1)).min(1),
	completionEvidenceFile: z.string().min(1).optional(),
});

const uxWorkpackStateSchema: z.ZodType<UxWorkpackState> = z.object({
	schemaVersion: z.literal(1),
	sourceOfTruth: z.object({
		purpose: z.string().min(1),
		generatedFiles: z.array(z.string().min(1)).min(1),
	}),
	defaults: z.object({
		status: z.enum(uxEpicStatuses),
		approved: z.boolean(),
	}),
	precedence: z
		.object({
			phases: z.array(z.string().min(1)),
			epics: z.array(z.string().min(1)),
		})
		.optional(),
	epics: z.array(
		z.object({
			id: z.string().min(1),
			status: z.enum(uxEpicStatuses).optional(),
			approved: z.boolean().optional(),
			completionEvidenceFile: z.string().min(1).optional(),
			notes: z.string().min(1).optional(),
		}),
	),
});

export const uxEpicDefinitions: UxEpicDefinition[] = [
	{
		id: 'UX-ARCH-product-architecture-and-ia-reconciliation',
		title: 'Product Architecture and IA Reconciliation',
		phase: '00 Architecture Decisions',
		productPriority: 'P0',
		domain: 'UX-ARCH',
		objective:
			'Resolve the global IA, route, Scene naming, renderer, player-preview, layout-preset, and deferred sync/collaboration decisions before broad UI route work starts.',
		requirementIds: ['UX-NAV-002'],
		dependencies: [],
		expectedAffectedAreas: [
			'docs/remake-review/ux-requirements',
			'docs/planning/v2/ux',
			'app shell route registry',
			'navigation lint contracts',
		],
		sourceDocs: uxFoundationDocs,
		parallelSafetyNotes:
			'This epic sets product decisions that later UI epics consume. Keep implementation to docs, route registry contracts, lint fixtures, and explicit decision records.',
		customStories: [
			{
				id: 'UX-ARCH-S01',
				title: 'Resolve GUI architecture decisions before route scaffolding',
				acceptanceCriteria: [
					'Given UX-NAV lists nine global sections and the ideal GUI architecture recommends seven, when this epic completes, then the accepted global navigation model is recorded and affected docs, route registry contracts, and navigation lint fixtures agree.',
					'Given Scene naming, canvas renderer, player-view preview, layout-preset storage, and interim sync/collaboration states are open decisions, when this epic completes, then each decision is accepted or explicitly deferred with owner, risk, and implementation constraint.',
					'Given later UI epics consume the route map and page/panel/modal contract, when this epic completes, then each durable workspace, overlay type, and non-global capability home is documented before broad implementation starts.',
				],
			},
		],
	},
	{
		id: 'UX-VIS-design-tokens-themes-and-brand',
		title: 'Design Tokens, Themes, and Brand Mood',
		phase: '01 Foundations',
		productPriority: 'P0',
		domain: 'UX-VIS',
		objective:
			'Replace the narrow slice styling with the production semantic token system, five themes, typography, spacing, radius, elevation, contrast, and premium genre visual language.',
		requirementIds: [
			'UX-VIS-001',
			'UX-VIS-002',
			'UX-VIS-003',
			'UX-VIS-004',
			'UX-VIS-005',
			'UX-VIS-006',
			'UX-VIS-007',
			'UX-VIS-008',
			'UX-VIS-012',
			'UX-VIS-013',
		],
		dependencies: ['UX-ARCH-product-architecture-and-ia-reconciliation'],
		expectedAffectedAreas: [
			'app CSS custom properties',
			'theme preferences',
			'token compliance lint',
			'visual regression fixtures',
		],
	},
	{
		id: 'UX-VIS-component-library-motion-density-icons',
		title: 'Component Library, Motion, Density, and Icons',
		phase: '01 Foundations',
		productPriority: 'P0',
		domain: 'UX-VIS',
		objective:
			'Create the shared UI component grammar, Lucide icon policy, reduced-motion contract, and profile-linked density modes consumed by every route and surface.',
		requirementIds: ['UX-VIS-009', 'UX-VIS-010', 'UX-VIS-011'],
		dependencies: ['UX-VIS-design-tokens-themes-and-brand'],
		expectedAffectedAreas: [
			'app component library',
			'motion preference state',
			'icon registry',
			'profile density styles',
		],
	},
	{
		id: 'UX-A11Y-release-gates-and-contrast',
		title: 'Accessibility Release Gates and Contrast',
		phase: '01 Foundations',
		productPriority: 'P0',
		domain: 'UX-A11Y',
		objective:
			'Make WCAG 2.2 AA, non-text contrast, deterministic axe artifacts, and screen-reader release evidence part of the UI remake gate set from the start.',
		requirementIds: ['UX-A11Y-001', 'UX-A11Y-016', 'UX-A11Y-017', 'UX-A11Y-018'],
		dependencies: ['UX-VIS-design-tokens-themes-and-brand'],
		expectedAffectedAreas: [
			'Playwright accessibility projects',
			'axe report artifacts',
			'accessibility QA docs',
			'known violation register',
		],
	},
	{
		id: 'UX-A11Y-interaction-primitives-and-help-compliance',
		title: 'Accessible Interaction Primitives and Help Compliance',
		phase: '01 Foundations',
		productPriority: 'P0',
		domain: 'UX-A11Y',
		objective:
			'Ship reusable keyboard, focus, target-size, APG widget, drag-alternative, motion, color-independent state, redundant-entry, and consistent-help primitives.',
		requirementIds: [
			'UX-A11Y-002',
			'UX-A11Y-007',
			'UX-A11Y-009',
			'UX-A11Y-010',
			'UX-A11Y-011',
			'UX-A11Y-012',
			'UX-A11Y-013',
			'UX-A11Y-014',
			'UX-A11Y-015',
		],
		dependencies: ['UX-VIS-component-library-motion-density-icons'],
		expectedAffectedAreas: [
			'focus manager',
			'live announcer',
			'dialog/menu/tabs/tree/grid primitives',
			'help trigger contract',
			'drag alternative command adapters',
		],
	},
	{
		id: 'UX-A11Y-spatial-live-region-and-leakage',
		title: 'Spatial Access, Live Regions, and No-Leak Boundaries',
		phase: '01 Foundations',
		productPriority: 'P0',
		domain: 'UX-A11Y',
		objective:
			'Establish the Scene Outline, map summary, combat announcement, and ARIA visibility-boundary model before canvas, maps, and live-play surfaces deepen.',
		requirementIds: ['UX-A11Y-003', 'UX-A11Y-004', 'UX-A11Y-005', 'UX-A11Y-006', 'UX-A11Y-008'],
		dependencies: ['UX-A11Y-interaction-primitives-and-help-compliance'],
		expectedAffectedAreas: [
			'Scene Outline model',
			'map accessibility summary',
			'combat announcer',
			'player-safe ARIA fixtures',
		],
	},
	{
		id: 'UX-SHELL-route-layout-and-platform-profiles',
		title: 'Route Shell, Landmarks, and Platform Profiles',
		phase: '02 Shell and Navigation',
		productPriority: 'P0',
		domain: 'UX-SHELL',
		objective:
			'Build the production application shell: Command Center home, global/local/contextual layout zones, desktop sidebar, tablet rail, mobile tab/sheet shell, landmarks, titles, announcements, and input modality.',
		requirementIds: [
			'UX-NAV-001',
			'UX-NAV-003',
			'UX-NAV-004',
			'UX-NAV-005',
			'UX-NAV-006',
			'UX-NAV-009',
			'UX-NAV-010',
			'UX-NAV-011',
			'UX-NAV-018',
		],
		dependencies: [
			'UX-ARCH-product-architecture-and-ia-reconciliation',
			'UX-VIS-component-library-motion-density-icons',
			'UX-A11Y-interaction-primitives-and-help-compliance',
		],
		expectedAffectedAreas: [
			'app route layout',
			'navigation components',
			'platform profile state',
			'route landmarks',
			'focus restoration',
		],
	},
	{
		id: 'UX-SHELL-contextual-navigation-history-and-deep-links',
		title: 'Contextual Navigation, History, and Deep Links',
		phase: '02 Shell and Navigation',
		productPriority: 'P0',
		domain: 'UX-SHELL',
		objective:
			'Make breadcrumbs, backlinks, hash focus, scroll restoration, browser history, player-safe deep-link fallbacks, and legacy alias transparency production-grade.',
		requirementIds: [
			'UX-NAV-007',
			'UX-NAV-008',
			'UX-NAV-012',
			'UX-NAV-016',
			'UX-NAV-017',
			'UX-NAV-020',
		],
		dependencies: ['UX-SHELL-route-layout-and-platform-profiles'],
		expectedAffectedAreas: [
			'breadcrumb components',
			'backlinks panel',
			'history store',
			'deep-link resolver',
			'alias redirect fixtures',
		],
	},
	{
		id: 'UX-SHELL-actor-filtered-nav-recents',
		title: 'Actor-Filtered Navigation, Pinned Items, and Recents',
		phase: '02 Shell and Navigation',
		productPriority: 'P0',
		domain: 'UX-SHELL',
		objective:
			'Keep the shell fast while proving that player navigation, pinned items, and recents never reveal DM-only destinations or metadata.',
		requirementIds: ['UX-NAV-013', 'UX-NAV-015'],
		dependencies: ['UX-SHELL-route-layout-and-platform-profiles'],
		expectedAffectedAreas: [
			'actor-filtered nav query',
			'pinned/recent item store',
			'player-safe nav tests',
		],
	},
	{
		id: 'UX-SHELL-command-surface-and-shortcuts',
		title: 'Command Surface, Search Entry, and Shortcuts',
		phase: '02 Shell and Navigation',
		productPriority: 'P0',
		domain: 'UX-SHELL',
		objective:
			'Turn the command palette and mobile command menu into the global keyboard/touch command surface, including shell search entry and quick-switcher behavior.',
		requirementIds: ['UX-NAV-014', 'UX-NAV-019', 'UX-SRCH-001', 'UX-SRCH-005'],
		dependencies: [
			'UX-SHELL-route-layout-and-platform-profiles',
			'UX-SHELL-actor-filtered-nav-recents',
		],
		expectedAffectedAreas: [
			'command palette',
			'mobile command sheet',
			'shortcut registry',
			'global search invocation',
			'quick switcher',
		],
	},
	{
		id: 'UX-CANVAS-viewport-rendering-and-performance',
		title: 'Canvas Viewport, Rendering, and Performance',
		phase: '03 Canvas and Command Center',
		productPriority: 'P0',
		domain: 'UX-CANVAS',
		objective:
			'Create the production canvas viewport with pan/zoom, responsive gesture alternatives, and perceived-performance guarantees suitable for Command Center, Scenes, maps, and player views.',
		requirementIds: ['UX-CANVAS-001', 'UX-CANVAS-014', 'UX-CANVAS-016'],
		dependencies: [
			'UX-ARCH-product-architecture-and-ia-reconciliation',
			'UX-A11Y-spatial-live-region-and-leakage',
		],
		expectedAffectedAreas: [
			'canvas runtime',
			'viewport controls',
			'performance instrumentation',
			'touch gesture alternatives',
		],
	},
	{
		id: 'UX-CANVAS-widget-manipulation-and-outline',
		title: 'Widget Placement, Manipulation, and Outline',
		phase: '03 Canvas and Command Center',
		productPriority: 'P0',
		domain: 'UX-CANVAS',
		objective:
			'Make widget placement, selection, move, resize, rotation, grouping, z-order, alignment, undo/redo, and keyboard focus feel like a direct production canvas tool.',
		requirementIds: [
			'UX-CANVAS-002',
			'UX-CANVAS-003',
			'UX-CANVAS-004',
			'UX-CANVAS-005',
			'UX-CANVAS-006',
			'UX-CANVAS-009',
			'UX-CANVAS-012',
			'UX-CANVAS-015',
		],
		dependencies: ['UX-CANVAS-viewport-rendering-and-performance'],
		expectedAffectedAreas: [
			'widget library insert flow',
			'selection toolbar',
			'Scene Outline integration',
			'canvas undo/redo',
			'alignment tools',
		],
	},
	{
		id: 'UX-CANVAS-chrome-bindings-templates-and-view-modes',
		title: 'Widget Chrome, Bindings, Templates, and View Modes',
		phase: '03 Canvas and Command Center',
		productPriority: 'P0',
		domain: 'UX-CANVAS',
		objective:
			'Complete reusable widget anatomy with data-binding affordances, templates, empty teaching state, and trustworthy DM/player view differentiation.',
		requirementIds: [
			'UX-CANVAS-007',
			'UX-CANVAS-008',
			'UX-CANVAS-010',
			'UX-CANVAS-011',
			'UX-CANVAS-013',
		],
		dependencies: ['UX-CANVAS-widget-manipulation-and-outline'],
		expectedAffectedAreas: [
			'widget chrome components',
			'binding inspector',
			'layout templates',
			'DM/player view toggle',
			'canvas empty state',
		],
	},
	{
		id: 'UX-CMD-home-scene-and-role-differentiated-dashboard',
		title: 'Command Center Home Scene and Role-Differentiated Dashboard',
		phase: '03 Canvas and Command Center',
		productPriority: 'P0',
		domain: 'UX-CMD',
		objective:
			'Make the home route a populated live-play Command Center with clear session state, recoverable layout presets, and distinct DM/player/observer dashboards.',
		requirementIds: ['UX-CMD-001', 'UX-CMD-002', 'UX-CMD-003', 'UX-CMD-008', 'UX-CMD-012'],
		dependencies: [
			'UX-SHELL-route-layout-and-platform-profiles',
			'UX-CANVAS-chrome-bindings-templates-and-view-modes',
		],
		expectedAffectedAreas: [
			'home route',
			'Command Center layout preset store',
			'session status strip',
			'role-specific dashboards',
		],
	},
	{
		id: 'UX-PERM-visibility-preview-badges-and-privacy-status',
		title: 'Visibility Controls, Preview Mode, Badges, and Privacy Status',
		phase: '04 Trust and Safety',
		productPriority: 'P0',
		domain: 'UX-PERM',
		objective:
			'Give DMs safe inline visibility controls, preview-as-player/observer, ambient visibility badges, and privacy/cache status before deeper player-facing projection work lands.',
		requirementIds: ['UX-PERM-001', 'UX-PERM-006', 'UX-PERM-007', 'UX-PERM-008'],
		dependencies: [
			'UX-SHELL-actor-filtered-nav-recents',
			'UX-A11Y-spatial-live-region-and-leakage',
		],
		expectedAffectedAreas: [
			'visibility controls',
			'preview-as actor state',
			'content badges',
			'session privacy panel',
			'cache purge UI',
		],
	},
	{
		id: 'UX-CMD-player-view-handouts-map-and-session-controls',
		title: 'Command Center Player Views, Handouts, Map, and Session Controls',
		phase: '04 Trust and Safety',
		productPriority: 'P0',
		domain: 'UX-CMD',
		objective:
			'Finish the Command Center live-control surface: player-view controller and preview, handout push, active map projection controls, widget drawer, phase transitions, and command parity.',
		requirementIds: [
			'UX-CMD-004',
			'UX-CMD-005',
			'UX-CMD-006',
			'UX-CMD-007',
			'UX-CMD-009',
			'UX-CMD-010',
			'UX-CMD-011',
		],
		dependencies: [
			'UX-CMD-home-scene-and-role-differentiated-dashboard',
			'UX-PERM-visibility-preview-badges-and-privacy-status',
			'UX-SHELL-command-surface-and-shortcuts',
		],
		expectedAffectedAreas: [
			'player-view controller',
			'handout push flow',
			'active map widget',
			'widget library drawer',
			'session phase controls',
		],
	},
	{
		id: 'UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell',
		title: 'Session Lifecycle, Recovery, and Hot-Path Combat Shell',
		phase: '05 Live-Play Workspaces',
		productPriority: 'P1',
		domain: 'UX-SES',
		objective:
			'Build the focused Session route around lifecycle, recovery, combat row glanceability, current-turn emphasis, turn advance, and async undo/retry states.',
		requirementIds: [
			'UX-SES-001',
			'UX-SES-002',
			'UX-SES-003',
			'UX-SES-004',
			'UX-SES-006',
			'UX-SES-017',
		],
		dependencies: [
			'UX-SHELL-route-layout-and-platform-profiles',
			'UX-CMD-home-scene-and-role-differentiated-dashboard',
		],
		expectedAffectedAreas: [
			'session route',
			'combat tracker shell',
			'turn controls',
			'recovery prompt',
			'pending/undo/retry UI',
		],
	},
	{
		id: 'UX-SESSION-combat-editing-conditions-and-player-tracker',
		title: 'Combat Editing, Conditions, and Player Tracker',
		phase: '05 Live-Play Workspaces',
		productPriority: 'P1',
		domain: 'UX-SES',
		objective:
			'Complete combat editing hot paths with HP steppers, conditions, concentration, death saves, combatant management, mass/secret combatants, and a safe player-visible tracker.',
		requirementIds: ['UX-SES-005', 'UX-SES-007', 'UX-SES-008', 'UX-SES-016'],
		dependencies: [
			'UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell',
			'UX-PERM-visibility-preview-badges-and-privacy-status',
		],
		expectedAffectedAreas: [
			'combat row editor',
			'condition controls',
			'combatant reorder UI',
			'player combat projection',
		],
	},
	{
		id: 'UX-SESSION-tools-encounters-dice-timers-prep-calendar',
		title: 'Session Tools, Encounters, Dice, Timers, Prep, and Calendar',
		phase: '05 Live-Play Workspaces',
		productPriority: 'P1',
		domain: 'UX-SES',
		objective:
			'Add the supporting live-play tools that make the Session route complete: encounter building, dice, roll history, timers, quick reference, prep/recap, and campaign calendar continuity.',
		requirementIds: [
			'UX-SES-009',
			'UX-SES-010',
			'UX-SES-011',
			'UX-SES-012',
			'UX-SES-013',
			'UX-SES-014',
			'UX-SES-015',
		],
		dependencies: ['UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell'],
		expectedAffectedAreas: [
			'encounter builder',
			'dice tools',
			'roll history',
			'timer widget',
			'quick reference',
			'prep/recap digest',
			'calendar continuity',
		],
	},
	{
		id: 'UX-CHAR-roster-creation-and-draft-ownership',
		title: 'Character Roster, Creation, and Draft Ownership',
		phase: '06 Core Library Workspaces',
		productPriority: 'P1',
		domain: 'UX-CHAR',
		objective:
			'Make Characters a primary suite with roster overview, fast DM quick-create, player creation wizard, party view, and draft ownership management.',
		requirementIds: ['UX-CHAR-001', 'UX-CHAR-002', 'UX-CHAR-011', 'UX-CHAR-013'],
		dependencies: ['UX-SHELL-route-layout-and-platform-profiles'],
		expectedAffectedAreas: [
			'characters route',
			'party roster',
			'quick-create panel',
			'creation wizard',
			'draft ownership surface',
		],
	},
	{
		id: 'UX-CHAR-sheet-live-resources-and-advancement',
		title: 'Character Sheet, Live Resources, and Advancement',
		phase: '06 Core Library Workspaces',
		productPriority: 'P1',
		domain: 'UX-CHAR',
		objective:
			'Complete the production character sheet with persistent vitals, reading/edit modes, HP and class resources, conditions, concentration, death saves, advancement, and journal.',
		requirementIds: [
			'UX-CHAR-003',
			'UX-CHAR-004',
			'UX-CHAR-005',
			'UX-CHAR-006',
			'UX-CHAR-007',
			'UX-CHAR-008',
			'UX-CHAR-012',
		],
		dependencies: ['UX-CHAR-roster-creation-and-draft-ownership'],
		expectedAffectedAreas: [
			'character sheet route',
			'vitals bar',
			'inline edit mode',
			'combat resources',
			'advancement flow',
			'character journal',
		],
	},
	{
		id: 'UX-CHAR-collaboration-and-widget-bindings',
		title: 'Character Collaboration and Widget Bindings',
		phase: '06 Core Library Workspaces',
		productPriority: 'P1',
		domain: 'UX-CHAR',
		objective:
			'Add collaborative edit attribution and a safe data-exposure path browser so character data can power widgets without leaking private fields.',
		requirementIds: ['UX-CHAR-009', 'UX-CHAR-010'],
		dependencies: [
			'UX-CHAR-sheet-live-resources-and-advancement',
			'UX-CANVAS-chrome-bindings-templates-and-view-modes',
		],
		expectedAffectedAreas: [
			'collaborative edit badges',
			'character binding browser',
			'widget data exposure UI',
		],
	},
	{
		id: 'UX-MAP-library-viewer-import-and-search',
		title: 'Map Library, Viewer, Import, and Search',
		phase: '06 Core Library Workspaces',
		productPriority: 'P1',
		domain: 'UX-MAP',
		objective:
			'Turn Atlas into a production map workspace with map library, viewer pan/zoom, nested transitions, minimap, create/import flows, and actor-filtered map search.',
		requirementIds: [
			'UX-MAP-001',
			'UX-MAP-002',
			'UX-MAP-003',
			'UX-MAP-006',
			'UX-MAP-009',
			'UX-MAP-018',
		],
		dependencies: [
			'UX-SHELL-route-layout-and-platform-profiles',
			'UX-CANVAS-viewport-rendering-and-performance',
			'UX-A11Y-spatial-live-region-and-leakage',
		],
		expectedAffectedAreas: [
			'atlas route',
			'map viewer',
			'map import wizard',
			'nested map breadcrumbs',
			'map search',
		],
	},
	{
		id: 'UX-MAP-layers-authoring-generation-and-tags',
		title: 'Map Layers, Authoring, Generation, and Tags',
		phase: '06 Core Library Workspaces',
		productPriority: 'P1',
		domain: 'UX-MAP',
		objective:
			'Complete map authoring with layer panel anatomy, layer type badges, drawing/painting tools, procedural generation UI, and tag query controls.',
		requirementIds: ['UX-MAP-004', 'UX-MAP-005', 'UX-MAP-007', 'UX-MAP-008', 'UX-MAP-014'],
		dependencies: ['UX-MAP-library-viewer-import-and-search'],
		expectedAffectedAreas: [
			'map layer panel',
			'map authoring tools',
			'procedural generation panel',
			'layer tag filters',
		],
	},
	{
		id: 'UX-MAP-pois-fog-projection-combat-and-embeds',
		title: 'Map POIs, Fog, Projection, Combat, Routes, and Embeds',
		phase: '06 Core Library Workspaces',
		productPriority: 'P1',
		domain: 'UX-MAP',
		objective:
			'Finish map live-play controls: POIs, fog, annotations, projection safety checks, combat overlay, Scene embeds, route drawing, and measurement.',
		requirementIds: [
			'UX-MAP-010',
			'UX-MAP-011',
			'UX-MAP-012',
			'UX-MAP-013',
			'UX-MAP-015',
			'UX-MAP-016',
			'UX-MAP-017',
		],
		dependencies: [
			'UX-MAP-layers-authoring-generation-and-tags',
			'UX-PERM-visibility-preview-badges-and-privacy-status',
		],
		expectedAffectedAreas: [
			'map POI controls',
			'fog-of-war panel',
			'projection consistency report',
			'combat overlay',
			'map widget embed',
			'route measurement tools',
		],
	},
	{
		id: 'UX-CONTENT-editor-shell-and-writing-controls',
		title: 'Knowledge Editor Shell and Writing Controls',
		phase: '06 Core Library Workspaces',
		productPriority: 'P1',
		domain: 'UX-CONTENT',
		objective:
			'Make Knowledge authoring production-ready with a writing-first editor, toolbar, slash insert menu, autosave/failure recovery, split preview, and focus mode.',
		requirementIds: [
			'UX-CONTENT-001',
			'UX-CONTENT-002',
			'UX-CONTENT-003',
			'UX-CONTENT-004',
			'UX-CONTENT-005',
			'UX-CONTENT-007',
		],
		dependencies: [
			'UX-SHELL-route-layout-and-platform-profiles',
			'UX-VIS-component-library-motion-density-icons',
		],
		expectedAffectedAreas: [
			'knowledge route',
			'note editor',
			'markdown toolbar',
			'autosave status chip',
			'split preview',
			'focus writing mode',
		],
	},
	{
		id: 'UX-CONTENT-wikilinks-objects-backlinks-and-calendar-fields',
		title: 'Wikilinks, Structured Objects, Backlinks, and Calendar Fields',
		phase: '06 Core Library Workspaces',
		productPriority: 'P1',
		domain: 'UX-CONTENT',
		objective:
			'Complete structured authoring around wikilinks, unresolved states, frontmatter/object forms, rename propagation, disambiguation, backlinks, and calendar-date fields.',
		requirementIds: [
			'UX-CONTENT-006',
			'UX-CONTENT-008',
			'UX-CONTENT-009',
			'UX-CONTENT-010',
			'UX-CONTENT-019',
		],
		dependencies: [
			'UX-CONTENT-editor-shell-and-writing-controls',
			'UX-SHELL-contextual-navigation-history-and-deep-links',
		],
		expectedAffectedAreas: [
			'wikilink autocomplete',
			'frontmatter object form',
			'rename workflow',
			'backlinks panel',
			'calendar picker',
		],
	},
	{
		id: 'UX-CONTENT-templates-snippets-sources-import-export',
		title: 'Templates, Snippets, Sources, Import, and Export',
		phase: '06 Core Library Workspaces',
		productPriority: 'P1',
		domain: 'UX-CONTENT',
		objective:
			'Add the production content-management flows for templates, snippets, source-of-truth indicators, pre-write diagnostics, import previews, and export validation reports.',
		requirementIds: [
			'UX-CONTENT-011',
			'UX-CONTENT-012',
			'UX-CONTENT-013',
			'UX-CONTENT-014',
			'UX-CONTENT-015',
			'UX-CONTENT-018',
		],
		dependencies: ['UX-CONTENT-editor-shell-and-writing-controls'],
		expectedAffectedAreas: [
			'template library',
			'snippet library',
			'source badges',
			'source constraint panel',
			'import wizard',
			'export wizard',
		],
	},
	{
		id: 'UX-PERM-grant-dialog-active-grants-and-diagnostics',
		title: 'Grant Dialog, Active Grants, and Diagnostics',
		phase: '07 Collaboration and Permissions',
		productPriority: 'P0',
		domain: 'UX-PERM',
		objective:
			'Finish permission UX with person-to-entity grant preview, active grant revocation, player permission summaries, and DM consistency diagnostics.',
		requirementIds: ['UX-PERM-002', 'UX-PERM-003', 'UX-PERM-004', 'UX-PERM-005'],
		dependencies: ['UX-PERM-visibility-preview-badges-and-privacy-status'],
		expectedAffectedAreas: [
			'capability-set grant dialog',
			'active grant list',
			'player permission summary',
			'permission diagnostics',
		],
	},
	{
		id: 'UX-CONTENT-visibility-and-embeds',
		title: 'Content Visibility and Embeds',
		phase: '07 Collaboration and Permissions',
		productPriority: 'P0',
		domain: 'UX-CONTENT',
		objective:
			'Wire content authoring into the permission model with field/entity/section visibility controls and safe embed authoring in notes and canvas.',
		requirementIds: ['UX-CONTENT-016', 'UX-CONTENT-017'],
		dependencies: [
			'UX-CONTENT-editor-shell-and-writing-controls',
			'UX-PERM-visibility-preview-badges-and-privacy-status',
		],
		expectedAffectedAreas: [
			'content visibility controls',
			'embed authoring',
			'actor-filtered previews',
			'canvas embed insertion',
		],
	},
	{
		id: 'UX-COLLAB-presence-join-roster-connection-and-catchup',
		title: 'Presence, Join, Roster, Connection, and Catch-Up',
		phase: '07 Collaboration and Permissions',
		productPriority: 'P0',
		domain: 'UX-COLLAB',
		objective:
			'Make collaboration visible and recoverable through presence, full participant roster, join/invite/leave, degradation feedback, reconnect, and mobile catch-up UI.',
		requirementIds: [
			'UX-COLLAB-001',
			'UX-COLLAB-002',
			'UX-COLLAB-003',
			'UX-COLLAB-006',
			'UX-COLLAB-009',
		],
		dependencies: ['UX-SHELL-actor-filtered-nav-recents'],
		expectedAffectedAreas: [
			'presence strip',
			'participant roster panel',
			'join/invite flow',
			'connection degradation banner',
			'reconnect catch-up UI',
		],
	},
	{
		id: 'UX-COLLAB-handouts-player-views-combat-and-groups',
		title: 'Handouts, Player Views, Combat Sharing, and Groups',
		phase: '07 Collaboration and Permissions',
		productPriority: 'P0',
		domain: 'UX-COLLAB',
		objective:
			'Complete live collaboration controls for handout push/revoke tracking, shared combat filtering, per-player canvas assignment, and player groups.',
		requirementIds: ['UX-COLLAB-004', 'UX-COLLAB-005', 'UX-COLLAB-007', 'UX-COLLAB-008'],
		dependencies: [
			'UX-COLLAB-presence-join-roster-connection-and-catchup',
			'UX-CMD-player-view-handouts-map-and-session-controls',
			'UX-SESSION-combat-editing-conditions-and-player-tracker',
		],
		expectedAffectedAreas: [
			'handout delivery panel',
			'combat visibility overlay',
			'player-view assignment',
			'player group management',
		],
	},
	{
		id: 'UX-CAMPAIGN-world-model-route-shell',
		title: 'Campaign World Model Route Shell',
		phase: '08 Campaign and Discovery',
		productPriority: 'P1',
		domain: 'UX-CAMPAIGN',
		objective:
			'Add the Campaign route architecture from the ideal GUI plan: overview, arcs, quests, factions, locations, NPCs, timeline, entity detail shell, and cross-links without duplicating Knowledge.',
		requirementIds: [],
		dependencies: [
			'UX-SHELL-contextual-navigation-history-and-deep-links',
			'UX-CONTENT-wikilinks-objects-backlinks-and-calendar-fields',
			'UX-PERM-visibility-preview-badges-and-privacy-status',
		],
		expectedAffectedAreas: [
			'campaign route',
			'campaign entity shell',
			'timeline overview',
			'cross-section related links',
			'visibility controls',
		],
		sourceDocs: ['docs/remake-review/ux-requirements/16-ideal-gui-architecture.md'],
		customStories: [
			{
				id: 'UX-CAMPAIGN-S01',
				title: 'Campaign overview and object taxonomy shell',
				acceptanceCriteria: [
					'Given the user opens Campaign, when the route renders, then arcs, quests, factions, locations, NPCs, items, timeline events, and relationships have clear entry points.',
					'Given a campaign entity is opened, when related objects exist, then links to Knowledge, Atlas, Session, Characters, and graph context are available without duplicating note authoring.',
				],
			},
		],
	},
	{
		id: 'UX-SRCH-result-layout-filters-freshness-and-saved-searches',
		title: 'Search Results, Filters, Freshness, and Saved Searches',
		phase: '08 Campaign and Discovery',
		productPriority: 'P1',
		domain: 'UX-SRCH',
		objective:
			'Complete search beyond shell invocation: result row anatomy, type grouping, filters, relevance transparency, recent/suggested content, zero/error states, freshness, and saved searches.',
		requirementIds: [
			'UX-SRCH-002',
			'UX-SRCH-003',
			'UX-SRCH-004',
			'UX-SRCH-006',
			'UX-SRCH-007',
			'UX-SRCH-008',
			'UX-SRCH-009',
			'UX-SRCH-010',
		],
		dependencies: [
			'UX-SHELL-command-surface-and-shortcuts',
			'UX-CONTENT-wikilinks-objects-backlinks-and-calendar-fields',
			'UX-SHELL-actor-filtered-nav-recents',
		],
		expectedAffectedAreas: [
			'search result rows',
			'filter panel',
			'relevance labels',
			'index freshness indicators',
			'saved searches',
		],
	},
	{
		id: 'UX-GRAPH-canvas-encoding-filtering-and-health',
		title: 'Graph Canvas, Encoding, Filtering, and Health',
		phase: '08 Campaign and Discovery',
		productPriority: 'P2',
		domain: 'UX-GRAPH',
		objective:
			'Ship a useful graph, not a decorative graph: readable canvas, non-color encoding, legend, filters, local mode, clustering, health indicators, and sparse/empty states.',
		requirementIds: [
			'UX-GRAPH-001',
			'UX-GRAPH-002',
			'UX-GRAPH-003',
			'UX-GRAPH-004',
			'UX-GRAPH-005',
			'UX-GRAPH-006',
			'UX-GRAPH-008',
			'UX-GRAPH-010',
		],
		dependencies: [
			'UX-CONTENT-wikilinks-objects-backlinks-and-calendar-fields',
			'UX-VIS-component-library-motion-density-icons',
		],
		expectedAffectedAreas: [
			'graph route',
			'graph canvas renderer',
			'legend/filter sidebar',
			'graph health panel',
			'empty/sparse states',
		],
	},
	{
		id: 'UX-GRAPH-accessible-mobile-and-link-repair',
		title: 'Graph Accessibility, Mobile Backlinks, and Link Repair',
		phase: '08 Campaign and Discovery',
		productPriority: 'P1',
		domain: 'UX-GRAPH',
		objective:
			'Provide the accessible and mobile graph alternatives plus hidden-target-safe link repair so discovery remains useful without leaking or requiring graph navigation.',
		requirementIds: ['UX-GRAPH-007', 'UX-GRAPH-009', 'UX-GRAPH-011'],
		dependencies: [
			'UX-GRAPH-canvas-encoding-filtering-and-health',
			'UX-A11Y-spatial-live-region-and-leakage',
		],
		expectedAffectedAreas: [
			'accessible graph node list',
			'mobile backlinks surface',
			'link repair picker',
			'player-safe suggestion filtering',
		],
	},
	{
		id: 'UX-SYNC-global-indicators-local-first-and-entity-badges',
		title: 'Sync Indicators, Local-First Feedback, and Entity Badges',
		phase: '09 Reliability and Optional Capabilities',
		productPriority: 'P0',
		domain: 'UX-SYNC',
		objective:
			'Make sync visible but non-blocking through global status, entity badges, offline banner, optimistic local-first acknowledgements, trust signals, and no blocking spinners.',
		requirementIds: [
			'UX-SYNC-001',
			'UX-SYNC-002',
			'UX-SYNC-003',
			'UX-SYNC-008',
			'UX-SYNC-011',
			'UX-SYNC-013',
		],
		dependencies: ['UX-SHELL-route-layout-and-platform-profiles'],
		expectedAffectedAreas: [
			'top-bar sync badge',
			'per-entity sync badges',
			'offline banner',
			'local-first write feedback',
			'last-synced trust signals',
		],
	},
	{
		id: 'UX-SYNC-queues-conflicts-recovery-consent-and-authorization',
		title: 'Sync Queues, Conflicts, Recovery, Consent, and Authorization',
		phase: '09 Reliability and Optional Capabilities',
		productPriority: 'P1',
		domain: 'UX-SYNC',
		objective:
			'Complete the Sync Status details: queued changes, conflicts, actionable retry/recovery, asset-missing states, cloud storage consent/classification, and first-time authorization.',
		requirementIds: [
			'UX-SYNC-004',
			'UX-SYNC-005',
			'UX-SYNC-006',
			'UX-SYNC-007',
			'UX-SYNC-009',
			'UX-SYNC-010',
			'UX-SYNC-012',
		],
		dependencies: [
			'UX-SYNC-global-indicators-local-first-and-entity-badges',
			'UX-CONTENT-templates-snippets-sources-import-export',
			'UX-COLLAB-presence-join-roster-connection-and-catchup',
		],
		expectedAffectedAreas: [
			'sync status page',
			'queued changes view',
			'conflict resolver',
			'asset missing states',
			'cloud consent panel',
			'authorization flow',
		],
	},
	{
		id: 'UX-AUDIO-live-controls-player-delivery-and-degradation',
		title: 'Audio Live Controls, Player Delivery, and Degradation',
		phase: '09 Reliability and Optional Capabilities',
		productPriority: 'P1',
		domain: 'UX-AUDIO',
		objective:
			'Make audio feel like a live-play capability: now-playing card, transport, mixer, what-players-hear indicator, autoplay handling, player device controls, and performance degradation.',
		requirementIds: [
			'UX-AUDIO-001',
			'UX-AUDIO-002',
			'UX-AUDIO-003',
			'UX-AUDIO-008',
			'UX-AUDIO-009',
			'UX-AUDIO-012',
			'UX-AUDIO-014',
		],
		dependencies: [
			'UX-CMD-home-scene-and-role-differentiated-dashboard',
			'UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell',
		],
		expectedAffectedAreas: [
			'audio controls widget',
			'audio transport',
			'channel mixer',
			'player delivery indicators',
			'autoplay recovery UI',
			'player audio controls',
		],
	},
	{
		id: 'UX-AUDIO-library-presets-soundboard-and-automation',
		title: 'Audio Library, Presets, Soundboard, and Automation',
		phase: '09 Reliability and Optional Capabilities',
		productPriority: 'P2',
		domain: 'UX-AUDIO',
		objective:
			'Finish the audio production surface with scene-linked presets, soundboard, crossfades, track library, asset management, automation, and mobile audio declarations.',
		requirementIds: [
			'UX-AUDIO-004',
			'UX-AUDIO-005',
			'UX-AUDIO-006',
			'UX-AUDIO-007',
			'UX-AUDIO-010',
			'UX-AUDIO-011',
			'UX-AUDIO-013',
		],
		dependencies: [
			'UX-AUDIO-live-controls-player-delivery-and-degradation',
			'UX-CANVAS-chrome-bindings-templates-and-view-modes',
			'UX-MAP-pois-fog-projection-combat-and-embeds',
		],
		expectedAffectedAreas: [
			'audio preset association',
			'soundboard grid',
			'track library drawer',
			'audio asset management',
			'automation triggers',
			'mobile audio policy UI',
		],
	},
	{
		id: 'UX-MCP-settings-policy-provenance-staged-writes-and-fallback',
		title: 'AI/MCP Settings, Policy, Provenance, Staged Writes, and Fallback',
		phase: '09 Reliability and Optional Capabilities',
		productPriority: 'P1',
		domain: 'UX-MCP',
		objective:
			'Make AI optional, bounded, and reviewable through global disable parity, tool config, provenance, staged writes, streaming stop, policy labels, actor boundaries, and fallback detection.',
		requirementIds: [
			'UX-MCP-001',
			'UX-MCP-004',
			'UX-MCP-006',
			'UX-MCP-007',
			'UX-MCP-009',
			'UX-MCP-010',
			'UX-MCP-011',
			'UX-MCP-012',
		],
		dependencies: [
			'UX-SHELL-route-layout-and-platform-profiles',
			'UX-CONTENT-editor-shell-and-writing-controls',
			'UX-PERM-grant-dialog-active-grants-and-diagnostics',
			'UX-SYNC-global-indicators-local-first-and-entity-badges',
		],
		expectedAffectedAreas: [
			'AI settings route',
			'tool configuration panel',
			'provenance badge',
			'staged-write review panel',
			'streaming stop control',
			'policy mode labels',
			'capability fallback UI',
		],
	},
	{
		id: 'UX-MCP-inline-assist-suggestions-attachments-and-response-presentation',
		title: 'AI Inline Assist, Suggestions, Attachments, and Response Presentation',
		phase: '09 Reliability and Optional Capabilities',
		productPriority: 'P2',
		domain: 'UX-MCP',
		objective:
			'Complete optional AI assistance in the editor with inline suggestions, named-entity chips, agent attachment flow, and response-envelope presentation.',
		requirementIds: ['UX-MCP-002', 'UX-MCP-003', 'UX-MCP-005', 'UX-MCP-008'],
		dependencies: [
			'UX-MCP-settings-policy-provenance-staged-writes-and-fallback',
			'UX-CONTENT-editor-shell-and-writing-controls',
		],
		expectedAffectedAreas: [
			'inline AI suggestion panel',
			'named entity chips',
			'agent attachment flow',
			'AI response envelope UI',
		],
	},
	{
		id: 'UX-ONB-first-run-role-and-player-join-paths',
		title: 'First-Run, Role, and Player Join Paths',
		phase: '10 Onboarding and Production Polish',
		productPriority: 'P1',
		domain: 'UX-ONB',
		objective:
			'Teach through real surfaces with a minimal, skippable, resumable first-run flow, role declaration, starter setup, DM first-value path, and player join path.',
		requirementIds: [
			'UX-ONB-001',
			'UX-ONB-002',
			'UX-ONB-003',
			'UX-ONB-004',
			'UX-ONB-005',
			'UX-ONB-006',
			'UX-ONB-007',
			'UX-ONB-008',
		],
		dependencies: [
			'UX-SHELL-route-layout-and-platform-profiles',
			'UX-CMD-home-scene-and-role-differentiated-dashboard',
		],
		expectedAffectedAreas: [
			'first-run wizard',
			'vault setup',
			'role declaration',
			'starter presets',
			'invite players step',
			'player join route',
		],
	},
	{
		id: 'UX-ONB-empty-states-and-teach-by-doing',
		title: 'Empty States and Teach-by-Doing Examples',
		phase: '10 Onboarding and Production Polish',
		productPriority: 'P1',
		domain: 'UX-ONB',
		objective:
			'Replace blank slices with canonical empty states for Command Center, Canvas, Maps, Characters, Knowledge, Graph, and Sessions, including interactive teach-by-doing examples.',
		requirementIds: ['UX-ONB-009', 'UX-ONB-010', 'UX-ONB-011', 'UX-ONB-012', 'UX-ONB-021'],
		dependencies: [
			'UX-ONB-first-run-role-and-player-join-paths',
			'UX-CMD-home-scene-and-role-differentiated-dashboard',
			'UX-CANVAS-chrome-bindings-templates-and-view-modes',
			'UX-MAP-library-viewer-import-and-search',
			'UX-CHAR-roster-creation-and-draft-ownership',
			'UX-CONTENT-editor-shell-and-writing-controls',
			'UX-GRAPH-canvas-encoding-filtering-and-health',
			'UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell',
		],
		expectedAffectedAreas: [
			'empty state components',
			'starter/demo examples',
			'route root zero-data states',
			'interactive tutorial snippets',
		],
	},
	{
		id: 'UX-ONB-help-coachmarks-demo-and-progressive-disclosure',
		title: 'Help, Coach Marks, Demo Content, and Progressive Disclosure',
		phase: '10 Onboarding and Production Polish',
		productPriority: 'P1',
		domain: 'UX-ONB',
		objective:
			'Finish learnability with contextual coach marks, persistent help, shortcut reference, contextual help center, progressive feature tiers, sample content offer, and changelog.',
		requirementIds: [
			'UX-ONB-013',
			'UX-ONB-014',
			'UX-ONB-015',
			'UX-ONB-016',
			'UX-ONB-017',
			'UX-ONB-018',
			'UX-ONB-019',
			'UX-ONB-020',
		],
		dependencies: [
			'UX-ONB-first-run-role-and-player-join-paths',
			'UX-SHELL-command-surface-and-shortcuts',
			'UX-VIS-component-library-motion-density-icons',
		],
		expectedAffectedAreas: [
			'coach mark trigger rules',
			'help panel',
			'keyboard shortcut reference',
			'feature-tier controls',
			'demo content offer',
			'changelog surface',
		],
	},
	{
		id: 'UX-RELEASE-production-readiness-and-shareable-cut',
		title: 'Production Readiness and Shareable UI Cut',
		phase: '11 Production Readiness',
		productPriority: 'P0',
		domain: 'UX-RELEASE',
		objective:
			'Verify the remade UI is complete enough to share: every primary route, role, platform profile, hot path, no-leak boundary, empty/error state, and production gate is covered end to end.',
		requirementIds: [],
		dependencies: [
			'UX-AUDIO-library-presets-soundboard-and-automation',
			'UX-CAMPAIGN-world-model-route-shell',
			'UX-CHAR-collaboration-and-widget-bindings',
			'UX-COLLAB-handouts-player-views-combat-and-groups',
			'UX-CONTENT-visibility-and-embeds',
			'UX-GRAPH-accessible-mobile-and-link-repair',
			'UX-MAP-pois-fog-projection-combat-and-embeds',
			'UX-MCP-inline-assist-suggestions-attachments-and-response-presentation',
			'UX-ONB-empty-states-and-teach-by-doing',
			'UX-ONB-help-coachmarks-demo-and-progressive-disclosure',
			'UX-SESSION-tools-encounters-dice-timers-prep-calendar',
			'UX-SYNC-queues-conflicts-recovery-consent-and-authorization',
		],
		expectedAffectedAreas: [
			'app-wide route walkthrough',
			'cross-profile Playwright suite',
			'accessibility release evidence',
			'player-safe no-leak fixtures',
			'visual polish review',
			'production readiness docs',
		],
		sourceDocs: uxFoundationDocs,
		customStories: [
			{
				id: 'UX-RELEASE-S01',
				title: 'End-to-end product walkthrough and release evidence',
				acceptanceCriteria: [
					'Given all UX remake epics are complete or explicitly deferred, when the production walkthrough runs, then Command Center, Session, Characters, Atlas, Campaign, Knowledge, Settings, Audio surfaces, AI/MCP surfaces, onboarding, and player join paths are demonstrable without placeholder-only screens.',
					'Given Desktop, Tablet, and Mobile profiles, when the primary hot paths are tested, then navigation, command access, live-play controls, authoring, search, collaboration, sync, and help remain reachable with no horizontal overflow or clipped controls.',
					'Given DM, Player, and Observer roles, when no-leak fixtures run across routes, command palette, search, graph, ARIA, live regions, previews, errors, and skeletons, then hidden content remains absent.',
					'Given release evidence is assembled, when this epic completes, then targeted tests, axe artifacts, manual screen-reader checklist status, visual review notes, known gaps, and final git status are recorded.',
				],
			},
		],
	},
];

function getLineNumber(markdown: string, offset: number): number {
	return markdown.slice(0, offset).split(/\r?\n/).length;
}

function normalizeUxPriority(raw: string): UxRequirementPriority {
	if (raw.startsWith('Must-have')) return 'Must-have';
	if (raw.startsWith('Should-have')) return 'Should-have';
	if (raw.startsWith('Could-have')) return 'Could-have';
	throw new Error(`Unknown UX requirement priority: ${raw}`);
}

function extractBulletField(block: string, field: string): string {
	const lines = block.split(/\r?\n/);
	const startIndex = lines.findIndex((line) =>
		new RegExp(`^-\\s+\\*\\*${field}:\\*\\*\\s*(.*)$`).test(line),
	);
	if (startIndex === -1) return '';
	const firstLine = lines[startIndex] ?? '';
	const first = firstLine.replace(new RegExp(`^-\\s+\\*\\*${field}:\\*\\*\\s*`), '').trim();
	const valueLines = [first];
	for (let index = startIndex + 1; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		if (/^-\s+\*\*[^:]+:\*\*/.test(line) || /^###\s+/.test(line) || /^---\s*$/.test(line)) {
			break;
		}
		if (/^\s{2,}\S/.test(line)) {
			valueLines.push(line.trim());
			continue;
		}
		if (line.trim() === '') {
			break;
		}
		break;
	}
	return valueLines.join(' ').replace(/\s+/g, ' ').trim();
}

function extractUxAcceptanceCriteria(block: string): string[] {
	const lines = block.split(/\r?\n/);
	const startIndex = lines.findIndex((line) => /^-\s+\*\*Acceptance criteria:\*\*/.test(line));
	if (startIndex === -1) return [];
	const criteria: string[] = [];
	let current: string | null = null;
	for (let index = startIndex + 1; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		if (/^-\s+\*\*[^:]+:\*\*/.test(line) || /^###\s+/.test(line)) break;
		const bullet = line.match(/^\s{2,}-\s+(.+)/);
		if (bullet?.[1]) {
			if (current) criteria.push(current.replace(/\s+/g, ' ').trim());
			current = bullet[1].trim();
			continue;
		}
		if (current && /^\s{4,}\S/.test(line)) {
			current = `${current} ${line.trim()}`;
		}
	}
	if (current) criteria.push(current.replace(/\s+/g, ' ').trim());
	return criteria;
}

export async function parseUxRequirementPackage(root = repoRoot): Promise<UxRequirementPackage> {
	const dir = path.join(root, 'docs', 'remake-review', 'ux-requirements');
	const entries = (await fs.readdir(dir)).filter((entry) => /^\d{2}-.+\.md$/.test(entry)).sort();
	const requirements: UxRequirementRecord[] = [];
	const headingPattern = /^###\s+(UX-[A-Z0-9]+-\d{3})\s+[\u2013\u2014-]\s+(.+)$/gm;

	for (const entry of entries) {
		const fullPath = path.join(dir, entry);
		const markdown = await fs.readFile(fullPath, 'utf-8');
		const matches = Array.from(markdown.matchAll(headingPattern));
		for (let index = 0; index < matches.length; index += 1) {
			const match = matches[index]!;
			const id = match[1]!;
			const start = match.index ?? 0;
			const nextStart = matches[index + 1]?.index ?? markdown.length;
			const block = markdown.slice(start, nextStart);
			const priority = normalizeUxPriority(extractBulletField(block, 'Priority'));
			const title = (match[2] ?? '').trim();
			const domain = id.replace(/-\d{3}$/, '');
			requirements.push({
				id,
				domain,
				title,
				statement: extractBulletField(block, 'Requirement') || title,
				priority,
				acceptanceCriteria: extractUxAcceptanceCriteria(block),
				file: path.relative(root, fullPath).replace(/\\/g, '/'),
				line: getLineNumber(markdown, start),
			});
		}
	}

	return { requirements };
}

function isApprovedStatus(status: UxEpicStatus): boolean {
	return status === 'approved' || status === 'active' || status === 'complete';
}

function uxWorkpackStatePath(root = repoRoot): string {
	return path.join(root, 'docs', 'planning', 'v2', 'ux', uxStateFileName);
}

function defaultUxWorkpackState(definitions = uxEpicDefinitions): UxWorkpackState {
	return {
		schemaVersion: 1,
		sourceOfTruth: {
			purpose:
				'Mutable source of truth for v2 UX/UI remake epic approval and completion state. Generated planning files are derived from ux-requirements plus this file.',
			generatedFiles: uxGeneratedWorkpackFiles,
		},
		defaults: {
			status: 'approved',
			approved: true,
		},
		precedence: {
			phases: Array.from(new Set(definitions.map((definition) => definition.phase))),
			epics: definitions.map((definition) => definition.id),
		},
		epics: [],
	};
}

async function readYamlFile(filePath: string): Promise<unknown> {
	const content = await fs.readFile(filePath, 'utf-8');
	return YAML.parse(content) as unknown;
}

async function readUxWorkpackState(root = repoRoot): Promise<UxWorkpackState | null> {
	try {
		const parsed = await readYamlFile(uxWorkpackStatePath(root));
		return uxWorkpackStateSchema.parse(parsed);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw error;
	}
}

function normalizeUxWorkpackState(
	state: UxWorkpackState,
	definitions = uxEpicDefinitions,
): UxWorkpackState {
	const defaultPrecedence = defaultUxWorkpackState(definitions).precedence as UxWorkpackPrecedence;
	const currentPrecedence = state.precedence ?? defaultPrecedence;
	const phases = [
		...currentPrecedence.phases,
		...defaultPrecedence.phases.filter((phase) => !currentPrecedence.phases.includes(phase)),
	];
	const epics = [
		...currentPrecedence.epics,
		...defaultPrecedence.epics.filter((epicId) => !currentPrecedence.epics.includes(epicId)),
	];
	return {
		...state,
		sourceOfTruth: {
			purpose: state.sourceOfTruth.purpose,
			generatedFiles: uxGeneratedWorkpackFiles,
		},
		precedence: { phases, epics },
		epics: [...state.epics].sort((left, right) => left.id.localeCompare(right.id)),
	};
}

async function writeYaml(filePath: string, yaml: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, yaml, 'utf-8');
}

async function writeUxWorkpackState(
	root: string,
	state: UxWorkpackState,
	definitions = uxEpicDefinitions,
): Promise<void> {
	await writeYaml(
		uxWorkpackStatePath(root),
		YAML.stringify(normalizeUxWorkpackState(state, definitions)),
	);
}

async function ensureUxWorkpackState(
	root = repoRoot,
	definitions = uxEpicDefinitions,
): Promise<UxWorkpackState> {
	const existing = await readUxWorkpackState(root);
	if (existing) {
		const normalized = normalizeUxWorkpackState(existing, definitions);
		await writeUxWorkpackState(root, normalized, definitions);
		return normalized;
	}
	const state = defaultUxWorkpackState(definitions);
	await writeUxWorkpackState(root, state, definitions);
	return state;
}

function uxQualityBar(): string[] {
	return [
		'Product fit: the delivered UI follows the canvas-first command platform model and never regresses to a document-list home.',
		'Traceability: every mapped UX requirement is tied to implementation, tests, and demo evidence.',
		'Foundations first: design tokens, shared components, platform profiles, and accessibility primitives are reused rather than reimplemented per surface.',
		'Actor safety: player and observer routes, search, ARIA, errors, skeletons, previews, and command results never leak DM-only content.',
		'Platform parity: Desktop, Tablet, and Mobile expose the same Must-have commands through profile-appropriate surfaces and the same processing-core commands.',
		'Live-play readiness: hot paths acknowledge within 100 ms, support undo/retry where appropriate, and stay glanceable under table pressure.',
		'Accessibility: WCAG 2.2 AA, keyboard parity, reduced motion, touch targets, non-color state, and screen-reader QA are part of the acceptance bar.',
		'Production polish: empty/loading/error states, responsive constraints, visual hierarchy, motion, and help affordances are complete enough to share.',
	];
}

function uxGitWorkflow(): string[] {
	return [
		'Start from `git status --short` and work around unrelated local edits unless they block the epic.',
		'Use one branch per UX epic and keep commits scoped to that epic plus its generated UX workpack evidence.',
		'Do not hand-edit generated files under `docs/planning/v2/ux` for status changes; use the UX workpack commands.',
		'Do not reset, overwrite, or reformat unrelated user changes.',
		'Before handoff, run targeted tests plus `pnpm v2:ux-workpack:validate` and leave no stale generated UX planning diffs.',
	];
}

function uxStatusAutomation(epicId: string): string[] {
	return [
		'Do not hand-edit generated UX epic packets, `status.yaml`, `requirements-index.yaml`, `initiative-map.yaml`, or `parallel-batches.yaml` for status changes.',
		`Use \`pnpm v2:ux-workpack:set-status -- --epic ${epicId} --status active\` when implementation starts.`,
		`Create \`docs/planning/v2/ux/epics/${epicId}.completion.md\` with demo, tests, traceability, gaps, and git evidence before marking complete.`,
		`Use \`pnpm v2:ux-workpack:complete -- --epic ${epicId}\` to update \`docs/planning/v2/ux/workpack-state.yaml\` and regenerate all derived UX planning files together.`,
		'Run `pnpm v2:ux-workpack:validate` after any status or generation command.',
	];
}

function uxTestPlan(definition: UxEpicDefinition): string[] {
	const base = [
		'Run `pnpm v2:ux-workpack:validate` before handoff.',
		'Run targeted unit tests for stores, query shaping, route metadata, component state, and command dispatch touched by this epic.',
		'Run app tests or Playwright coverage for visible route, profile, keyboard, touch, empty/loading/error, and player-safe behavior touched by this epic.',
		'Run axe and manual accessibility checks when the epic touches focus, landmarks, dialogs, menus, tabs, drag alternatives, live regions, or screen-reader output.',
	];
	if (definition.domain === 'UX-VIS') {
		base.push('Run token lint and theme contrast checks for every named theme.');
	}
	if (definition.domain === 'UX-SYNC') {
		base.push('Verify offline/degraded states never block local-first core work.');
	}
	if (definition.domain === 'UX-COLLAB' || definition.domain === 'UX-PERM') {
		base.push(
			'Run DM/player/observer no-leak fixtures across DOM, ARIA, command palette, search, and previews touched by this epic.',
		);
	}
	return base;
}

function uxDemoTemplate(): string[] {
	return [
		'Describe the user-visible path demonstrated on Desktop, Tablet, and Mobile where applicable.',
		'List the UX requirement IDs and acceptance criteria exercised by the demo.',
		'Record actor roles used in the demo, especially DM/player/observer safety cases.',
		'Record remaining polish, research, or product-decision gaps explicitly.',
	];
}

function uxStopConditions(): string[] {
	return [
		'Stop if the epic needs a product decision that the architecture reconciliation epic has not resolved.',
		'Stop if a UX requirement conflicts with a functional requirement and the conflict has not been raised in docs.',
		'Stop if a player-visible route, ARIA label, command result, search result, preview, skeleton, or error can reveal hidden DM-only content.',
		'Stop if a Must-have action is pointer-only, gesture-only, desktop-only, or depends on an optional network/cloud/AI feature.',
		'Stop if generated UX workpack validation fails and the cause is not understood.',
	];
}

function uxCompletionEvidence(): string[] {
	return [
		'Targeted tests and profile checks pass.',
		'Requirement IDs are traced to implementation, tests, and demo notes.',
		'Desktop, Tablet, and Mobile behavior is covered or explicitly scoped with a reason.',
		'Accessibility, actor-safety, no-leak, reduced-motion, touch-target, and keyboard parity evidence is recorded where applicable.',
		'Completion file records demo path, tests run, changed files, requirement coverage, known gaps, git branch/commit or PR, and final `git status --short` output.',
		'The UX workpack status is updated with the programmatic complete command after completion evidence exists.',
	];
}

function defaultFileOwnership(definition: UxEpicDefinition): string[] {
	const domain = definition.domain.toLowerCase();
	const areas = ['docs/planning/v2/ux/'];
	if (definition.domain === 'UX-ARCH') {
		areas.push('docs/remake-review/ux-requirements/', 'scripts/');
		return areas;
	}
	if (definition.domain === 'UX-VIS' || definition.domain === 'UX-A11Y') {
		areas.push('apps/v2/app/src/routes/styles.css', 'apps/v2/app/src/lib/gui/');
		return areas;
	}
	areas.push(`apps/v2/app/src/lib/gui/${domain}/`, 'apps/v2/app/src/routes/');
	return areas;
}

function createRequirementStory(requirement: UxRequirementRecord): UxStoryPacket {
	const storyId = `${requirement.id}-S01`;
	return {
		id: storyId,
		title: requirement.title,
		requirementIds: [requirement.id],
		acceptanceCriteria: requirement.acceptanceCriteria,
		tasks: [
			{
				id: `${storyId}-T01`,
				title: `Confirm UI contract, responsive profile behavior, and actor-safety implications for ${requirement.id}`,
				kind: 'design',
			},
			{
				id: `${storyId}-T02`,
				title: `Implement the shared or surface-specific UI behavior for ${requirement.id}`,
				kind: 'implementation',
			},
			{
				id: `${storyId}-T03`,
				title: `Add automated and manual coverage for ${requirement.id} acceptance criteria`,
				kind: 'test',
			},
			{
				id: `${storyId}-T04`,
				title: `Record demo notes and traceability evidence for ${requirement.id}`,
				kind: 'demo',
			},
		],
	};
}

function createCustomStory(story: UxStoryDefinition): UxStoryPacket {
	return {
		id: story.id,
		title: story.title,
		requirementIds: [],
		acceptanceCriteria: story.acceptanceCriteria,
		tasks: story.tasks ?? [
			{
				id: `${story.id}-T01`,
				title: 'Confirm source-doc contract and route/component ownership',
				kind: 'design',
			},
			{
				id: `${story.id}-T02`,
				title: 'Implement the route or component shell described by the ideal GUI architecture',
				kind: 'implementation',
			},
			{
				id: `${story.id}-T03`,
				title: 'Add route, accessibility, and no-leak coverage for the shell behavior',
				kind: 'test',
			},
			{
				id: `${story.id}-T04`,
				title: 'Record demo notes and traceability back to the source UX architecture docs',
				kind: 'demo',
			},
		],
	};
}

export function buildUxEpicPackets(
	pack: UxRequirementPackage,
	definitions = uxEpicDefinitions,
): UxEpicPacket[] {
	const requirementsById = new Map(
		pack.requirements.map((requirement) => [requirement.id, requirement]),
	);
	const epics: UxEpicPacket[] = [];
	for (const definition of definitions) {
		const requirements = definition.requirementIds.map((id) => {
			const requirement = requirementsById.get(id);
			if (!requirement) {
				throw new Error(`UX epic ${definition.id} references unknown requirement id: ${id}`);
			}
			return requirement;
		});
		const sourceDocs = Array.from(
			new Set([
				...uxFoundationDocs,
				...(definition.sourceDocs ?? []),
				...requirements.map((requirement) => requirement.file),
			]),
		).sort();
		const stories = [
			...requirements.map((requirement) => createRequirementStory(requirement)),
			...(definition.customStories ?? []).map((story) => createCustomStory(story)),
		];
		if (stories.length === 0) {
			throw new Error(`UX epic ${definition.id} must have requirements or custom stories.`);
		}
		epics.push({
			schemaVersion: 1,
			kind: 'ux-ui-remake-epic',
			id: definition.id,
			title: definition.title,
			status: 'approved',
			approved: true,
			phase: definition.phase,
			productPriority: definition.productPriority,
			domain: definition.domain,
			objective: definition.objective,
			requirementIds: definition.requirementIds,
			sourceDocs,
			expectedAffectedAreas: definition.expectedAffectedAreas,
			dependencies: definition.dependencies,
			parallelSafety: {
				fileOwnership: defaultFileOwnership(definition),
				notes:
					definition.parallelSafetyNotes ??
					'Parallel execution is safe only with non-overlapping component, route, and generated UX workpack ownership; shared shell/component contracts must be agreed before implementation.',
			},
			stories,
			qualityBar: uxQualityBar(),
			gitWorkflow: uxGitWorkflow(),
			statusAutomation: uxStatusAutomation(definition.id),
			testPlan: uxTestPlan(definition),
			demoNotesTemplate: uxDemoTemplate(),
			stopConditions: uxStopConditions(),
			completionEvidence: uxCompletionEvidence(),
		});
	}
	return epics;
}

function applyUxWorkpackState(epics: UxEpicPacket[], state: UxWorkpackState): UxEpicPacket[] {
	const overrides = new Map(state.epics.map((epic) => [epic.id, epic]));
	return epics.map((epic) => {
		const override = overrides.get(epic.id);
		const status = override?.status ?? state.defaults.status;
		const approved = override?.approved ?? state.defaults.approved;
		const nextEpic: UxEpicPacket = { ...epic, status, approved };
		if (override?.completionEvidenceFile) {
			nextEpic.completionEvidenceFile = override.completionEvidenceFile;
		}
		return nextEpic;
	});
}

function buildStatusSummary(epics: UxEpicPacket[]): Record<UxEpicStatus | 'totalEpics', number> {
	return {
		totalEpics: epics.length,
		proposed: epics.filter((epic) => epic.status === 'proposed').length,
		approved: epics.filter((epic) => epic.status === 'approved').length,
		active: epics.filter((epic) => epic.status === 'active').length,
		complete: epics.filter((epic) => epic.status === 'complete').length,
		deferred: epics.filter((epic) => epic.status === 'deferred').length,
	};
}

function completionPercent(done: number, total: number): number {
	if (total === 0) return 100;
	return Number(((done / total) * 100).toFixed(1));
}

function compareByOrder(order: Map<string, number>, left: string, right: string): number {
	const leftIndex = order.get(left) ?? Number.POSITIVE_INFINITY;
	const rightIndex = order.get(right) ?? Number.POSITIVE_INFINITY;
	if (leftIndex === rightIndex) return 0;
	return leftIndex < rightIndex ? -1 : 1;
}

export function findNextUxEpic(
	epics: UxEpicPacket[],
	precedence?: UxWorkpackPrecedence,
): UxEpicPacket | null {
	const completeIds = new Set(
		epics.filter((epic) => epic.status === 'complete').map((epic) => epic.id),
	);
	const candidateRank: Record<string, number> = {
		active: 0,
		approved: 1,
	};
	const phaseOrder = new Map((precedence?.phases ?? []).map((phase, index) => [phase, index]));
	const epicOrder = new Map((precedence?.epics ?? []).map((id, index) => [id, index]));
	const candidates = epics
		.filter((epic) => epic.approved && (epic.status === 'active' || epic.status === 'approved'))
		.filter((epic) => epic.dependencies.every((dependency) => completeIds.has(dependency)))
		.sort((left, right) => {
			const statusRank = (candidateRank[left.status] ?? 99) - (candidateRank[right.status] ?? 99);
			if (statusRank !== 0) return statusRank;
			const epicRank = compareByOrder(epicOrder, left.id, right.id);
			if (epicRank !== 0) return epicRank;
			const phaseRank = compareByOrder(phaseOrder, left.phase, right.phase);
			if (phaseRank !== 0) return phaseRank;
			return left.id.localeCompare(right.id);
		});
	return candidates[0] ?? null;
}

function buildUxWorkpackMetrics(
	pack: UxRequirementPackage,
	epics: UxEpicPacket[],
): Record<string, unknown> {
	const totalRequirements = pack.requirements.length;
	const completedRequirementIds = new Set<string>();
	const deferredRequirementIds = new Set<string>();
	const completeIds = new Set<string>();
	for (const epic of epics) {
		if (epic.status === 'complete') {
			completeIds.add(epic.id);
			for (const requirementId of epic.requirementIds) {
				completedRequirementIds.add(requirementId);
			}
		}
		if (epic.status === 'deferred') {
			for (const requirementId of epic.requirementIds) {
				deferredRequirementIds.add(requirementId);
			}
		}
	}
	const blockedByDependencies = epics.filter(
		(epic) =>
			epic.approved &&
			(epic.status === 'approved' || epic.status === 'active') &&
			epic.dependencies.some((dependency) => !completeIds.has(dependency)),
	).length;
	const promptableEpics = epics.filter(
		(epic) =>
			epic.approved &&
			(epic.status === 'approved' || epic.status === 'active') &&
			epic.dependencies.every((dependency) => completeIds.has(dependency)),
	).length;
	const phases = Array.from(new Set(epics.map((epic) => epic.phase))).map((phase) => {
		const phaseEpics = epics.filter((epic) => epic.phase === phase);
		const phaseRequirementIds = new Set(phaseEpics.flatMap((epic) => epic.requirementIds));
		const phaseCompletedRequirementIds = new Set<string>();
		for (const epic of phaseEpics) {
			if (epic.status !== 'complete') continue;
			for (const requirementId of epic.requirementIds) {
				phaseCompletedRequirementIds.add(requirementId);
			}
		}
		return {
			phase,
			totalEpics: phaseEpics.length,
			complete: phaseEpics.filter((epic) => epic.status === 'complete').length,
			active: phaseEpics.filter((epic) => epic.status === 'active').length,
			approved: phaseEpics.filter((epic) => epic.status === 'approved').length,
			proposed: phaseEpics.filter((epic) => epic.status === 'proposed').length,
			deferred: phaseEpics.filter((epic) => epic.status === 'deferred').length,
			requirementIds: Array.from(phaseRequirementIds).sort(),
			epicCompletionPercent: completionPercent(
				phaseEpics.filter((epic) => epic.status === 'complete').length,
				phaseEpics.length,
			),
			requirementCompletionPercent: completionPercent(
				phaseCompletedRequirementIds.size,
				phaseRequirementIds.size,
			),
		};
	});
	return {
		epicCompletionPercent: completionPercent(
			epics.filter((epic) => epic.status === 'complete').length,
			epics.length,
		),
		requirementCompletionPercent: completionPercent(
			completedRequirementIds.size,
			totalRequirements,
		),
		totalRequirements,
		completedRequirements: completedRequirementIds.size,
		deferredRequirements: deferredRequirementIds.size,
		remainingEpics: epics.filter((epic) => epic.status !== 'complete' && epic.status !== 'deferred')
			.length,
		promptableEpics,
		blockedByDependencies,
		completionEvidenceFiles: epics.filter((epic) => Boolean(epic.completionEvidenceFile)).length,
		phases,
	};
}

function nextUxEpicStatusBlock(nextEpic: UxEpicPacket | null): Record<string, unknown> | null {
	if (!nextEpic) return null;
	return {
		id: nextEpic.id,
		title: nextEpic.title,
		phase: nextEpic.phase,
		status: nextEpic.status,
		requirementIds: [...nextEpic.requirementIds],
		promptCommand: `pnpm v2:ux-prompt -- --epic ${nextEpic.id}`,
		nextPromptCommand: 'pnpm v2:ux-prompt -- --next',
		statusCommand: `pnpm v2:ux-workpack:set-status -- --epic ${nextEpic.id} --status active`,
	};
}

function uxRequirementIndexDocument(pack: UxRequirementPackage, epics: UxEpicPacket[]): string {
	const byDomain = new Map<string, UxRequirementRecord[]>();
	const epicByRequirement = new Map<string, string>();
	for (const epic of epics) {
		for (const requirementId of epic.requirementIds) {
			epicByRequirement.set(requirementId, epic.id);
		}
	}
	for (const requirement of pack.requirements) {
		const current = byDomain.get(requirement.domain) ?? [];
		current.push(requirement);
		byDomain.set(requirement.domain, current);
	}
	return YAML.stringify({
		schemaVersion: 1,
		generatedFrom: 'docs/remake-review/ux-requirements',
		totalRequirements: pack.requirements.length,
		totalMappedRequirements: epicByRequirement.size,
		domains: Array.from(byDomain.entries()).map(([domain, requirements]) => ({
			domain,
			count: requirements.length,
			requirements: requirements.map((requirement) => ({
				id: requirement.id,
				title: requirement.title,
				priority: requirement.priority,
				file: requirement.file,
				line: requirement.line,
				epicId: epicByRequirement.get(requirement.id) ?? null,
			})),
		})),
	});
}

function uxInitiativeMapDocument(pack: UxRequirementPackage, epics: UxEpicPacket[]): string {
	const phases = Array.from(new Set(epics.map((epic) => epic.phase)));
	return YAML.stringify({
		schemaVersion: 1,
		source: 'Generated from v2 UX requirements plus ideal GUI architecture planning definitions.',
		initiatives: phases.map((phase) => {
			const phaseEpics = epics.filter((epic) => epic.phase === phase);
			return {
				id: phase
					.replace(/^\d+\s+/, '')
					.toUpperCase()
					.replace(/[^A-Z0-9]+/g, '-'),
				title: phase,
				status: 'approved',
				requirementIds: phaseEpics.flatMap((epic) => epic.requirementIds),
				epicIds: phaseEpics.map((epic) => epic.id),
			};
		}),
		requirementCount: pack.requirements.length,
	});
}

function uxStatusDocument(
	pack: UxRequirementPackage,
	epics: UxEpicPacket[],
	state: UxWorkpackState,
): string {
	const nextEpic = findNextUxEpic(epics, state.precedence);
	return YAML.stringify({
		schemaVersion: 1,
		sourceOfTruth: {
			requirements: 'docs/remake-review/ux-requirements/',
			mutableState: `docs/planning/v2/ux/${uxStateFileName}`,
			generatedFiles: uxGeneratedWorkpackFiles,
		},
		summary: buildStatusSummary(epics),
		metrics: buildUxWorkpackMetrics(pack, epics),
		nextEpic: nextUxEpicStatusBlock(nextEpic),
		epics: epics.map((epic) => {
			const entry: Record<string, unknown> = {
				id: epic.id,
				title: epic.title,
				phase: epic.phase,
				status: epic.status,
				approved: epic.approved,
				requirementIds: epic.requirementIds,
				expectedAffectedAreas: epic.expectedAffectedAreas,
				dependencies: epic.dependencies,
			};
			if (epic.completionEvidenceFile) {
				entry.completionEvidenceFile = epic.completionEvidenceFile;
			}
			return entry;
		}),
	});
}

function uxParallelBatchesDocument(epics: UxEpicPacket[]): string {
	const remaining = new Map(epics.map((epic) => [epic.id, epic]));
	const completed = new Set<string>();
	const batches: Array<{ id: string; status: string; reason: string; epicIds: string[] }> = [];
	let batchIndex = 1;
	while (remaining.size > 0) {
		const ready = Array.from(remaining.values()).filter((epic) =>
			epic.dependencies.every((dependency) => completed.has(dependency)),
		);
		if (ready.length === 0) {
			batches.push({
				id: `cycle-or-missing-dependency-${batchIndex}`,
				status: 'blocked',
				reason:
					'No dependency-ready UX epics remain. Run validation for unknown dependencies or cycles.',
				epicIds: Array.from(remaining.keys()).sort(),
			});
			break;
		}
		ready.sort((left, right) => left.id.localeCompare(right.id));
		batches.push({
			id: `batch-${String(batchIndex).padStart(2, '0')}`,
			status: 'planned',
			reason:
				'Epics in the same batch have all declared dependencies satisfied by prior batches. They still require file-ownership review before parallel implementation.',
			epicIds: ready.map((epic) => epic.id),
		});
		for (const epic of ready) {
			completed.add(epic.id);
			remaining.delete(epic.id);
		}
		batchIndex += 1;
	}
	return YAML.stringify({ schemaVersion: 1, batches });
}

async function deleteStaleGeneratedUxEpicFiles(
	outputEpicsDir: string,
	expectedEpicIds: Set<string>,
): Promise<void> {
	let entries: string[];
	try {
		entries = await fs.readdir(outputEpicsDir);
	} catch {
		return;
	}
	await Promise.all(
		entries
			.filter((entry) => entry.endsWith('.yaml'))
			.filter((entry) => !expectedEpicIds.has(entry.replace(/\.yaml$/, '')))
			.map((entry) => fs.unlink(path.join(outputEpicsDir, entry))),
	);
}

export async function generateUxWorkpack(
	root = repoRoot,
	definitions = uxEpicDefinitions,
): Promise<{ epics: UxEpicPacket[]; state: UxWorkpackState }> {
	const pack = await parseUxRequirementPackage(root);
	const baseEpics = buildUxEpicPackets(pack, definitions);
	const state = await ensureUxWorkpackState(root, definitions);
	const epics = applyUxWorkpackState(baseEpics, state);
	const outputRoot = path.join(root, 'docs', 'planning', 'v2', 'ux');
	const outputEpicsDir = path.join(outputRoot, 'epics');
	await fs.mkdir(outputEpicsDir, { recursive: true });
	await writeYaml(
		path.join(outputRoot, 'requirements-index.yaml'),
		uxRequirementIndexDocument(pack, epics),
	);
	await writeYaml(
		path.join(outputRoot, 'initiative-map.yaml'),
		uxInitiativeMapDocument(pack, epics),
	);
	await writeYaml(path.join(outputRoot, 'status.yaml'), uxStatusDocument(pack, epics, state));
	await writeYaml(path.join(outputRoot, 'parallel-batches.yaml'), uxParallelBatchesDocument(epics));
	await deleteStaleGeneratedUxEpicFiles(outputEpicsDir, new Set(epics.map((epic) => epic.id)));
	for (const epic of epics) {
		await writeYaml(path.join(outputEpicsDir, `${epic.id}.yaml`), YAML.stringify(epic));
	}
	return { epics, state };
}

async function collectUxEpicFiles(root = repoRoot): Promise<string[]> {
	const dir = path.join(root, 'docs', 'planning', 'v2', 'ux', 'epics');
	try {
		const entries = await fs.readdir(dir);
		return entries
			.filter((entry) => entry.endsWith('.yaml'))
			.map((entry) => path.join(dir, entry))
			.sort();
	} catch {
		return [];
	}
}

async function collectUxCompletionEvidenceFiles(root = repoRoot): Promise<string[]> {
	const dir = path.join(root, 'docs', 'planning', 'v2', 'ux', 'epics');
	try {
		const entries = await fs.readdir(dir);
		return entries
			.filter((entry) => entry.endsWith('.completion.md'))
			.map((entry) => path.join(dir, entry))
			.sort();
	} catch {
		return [];
	}
}

function compareGeneratedFile(
	root: string,
	file: string,
	actual: string,
	expected: string,
): UxWorkpackValidationIssue | null {
	if (actual.trimEnd() === expected.trimEnd()) return null;
	return {
		file: path.relative(root, file).replace(/\\/g, '/'),
		message: 'Generated UX workpack file is stale. Run pnpm v2:ux-workpack:generate.',
	};
}

async function validateGeneratedUxFiles(
	root: string,
	pack: UxRequirementPackage,
	epics: UxEpicPacket[],
	state: UxWorkpackState,
): Promise<UxWorkpackValidationIssue[]> {
	const issues: UxWorkpackValidationIssue[] = [];
	const outputRoot = path.join(root, 'docs', 'planning', 'v2', 'ux');
	const outputEpicsDir = path.join(outputRoot, 'epics');
	const expectedFiles = new Map<string, string>([
		[path.join(outputRoot, 'requirements-index.yaml'), uxRequirementIndexDocument(pack, epics)],
		[path.join(outputRoot, 'initiative-map.yaml'), uxInitiativeMapDocument(pack, epics)],
		[path.join(outputRoot, 'status.yaml'), uxStatusDocument(pack, epics, state)],
		[path.join(outputRoot, 'parallel-batches.yaml'), uxParallelBatchesDocument(epics)],
	]);
	for (const epic of epics) {
		expectedFiles.set(path.join(outputEpicsDir, `${epic.id}.yaml`), YAML.stringify(epic));
	}

	for (const [file, expected] of expectedFiles) {
		try {
			const actual = await fs.readFile(file, 'utf-8');
			const issue = compareGeneratedFile(root, file, actual, expected);
			if (issue) issues.push(issue);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				issues.push({
					file: path.relative(root, file).replace(/\\/g, '/'),
					message: 'Generated UX workpack file is missing. Run pnpm v2:ux-workpack:generate.',
				});
				continue;
			}
			throw error;
		}
	}

	const expectedEpicFiles = new Set(
		epics.map((epic) => path.join(outputEpicsDir, `${epic.id}.yaml`)),
	);
	for (const file of await collectUxEpicFiles(root)) {
		if (expectedEpicFiles.has(file)) continue;
		issues.push({
			file: path.relative(root, file).replace(/\\/g, '/'),
			message: 'Stale generated UX epic file is not produced by current UX workpack definitions.',
		});
	}
	return issues;
}

async function validateUxCompletionEvidence(
	root: string,
	epics: UxEpicPacket[],
): Promise<UxWorkpackValidationIssue[]> {
	const issues: UxWorkpackValidationIssue[] = [];
	const byId = new Map(epics.map((epic) => [epic.id, epic]));
	const completedIds = new Set(
		epics.filter((epic) => epic.status === 'complete').map((epic) => epic.id),
	);
	for (const epic of epics) {
		if (epic.status === 'complete' && !epic.completionEvidenceFile) {
			issues.push({
				file: `docs/planning/v2/ux/epics/${epic.id}.yaml`,
				message:
					'Complete UX epic requires completionEvidenceFile in docs/planning/v2/ux/workpack-state.yaml.',
			});
			continue;
		}
		if (epic.status !== 'complete' && epic.completionEvidenceFile) {
			issues.push({
				file: `docs/planning/v2/ux/epics/${epic.id}.yaml`,
				message: 'Only complete UX epics may reference completionEvidenceFile.',
			});
		}
		if (!epic.completionEvidenceFile) continue;
		const evidencePath = path.resolve(root, epic.completionEvidenceFile);
		try {
			const content = await fs.readFile(evidencePath, 'utf-8');
			if (!content.includes('UX workpack status: `complete`')) {
				issues.push({
					file: epic.completionEvidenceFile,
					message: 'UX completion evidence must state UX workpack status: `complete`.',
				});
			}
			if (!/git status --short/i.test(content)) {
				issues.push({
					file: epic.completionEvidenceFile,
					message: 'UX completion evidence must include final `git status --short` evidence.',
				});
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				issues.push({
					file: epic.completionEvidenceFile,
					message: 'UX completion evidence file does not exist.',
				});
				continue;
			}
			throw error;
		}
	}
	for (const evidenceFile of await collectUxCompletionEvidenceFiles(root)) {
		const epicId = path.basename(evidenceFile).replace(/\.completion\.md$/, '');
		if (completedIds.has(epicId)) continue;
		const status = byId.get(epicId)?.status ?? 'missing';
		issues.push({
			file: path.relative(root, evidenceFile).replace(/\\/g, '/'),
			message: `UX completion evidence exists but epic status is ${status}. Run pnpm v2:ux-workpack:complete -- --epic ${epicId}.`,
		});
	}
	return issues;
}

function detectDependencyCycles(epics: UxEpicPacket[]): UxWorkpackValidationIssue[] {
	const issues: UxWorkpackValidationIssue[] = [];
	const byId = new Map(epics.map((epic) => [epic.id, epic]));
	const visiting = new Set<string>();
	const visited = new Set<string>();

	function visit(epicId: string, pathIds: string[]): void {
		if (visiting.has(epicId)) {
			issues.push({
				file: `docs/planning/v2/ux/epics/${epicId}.yaml`,
				message: `Dependency cycle detected: ${[...pathIds, epicId].join(' -> ')}`,
			});
			return;
		}
		if (visited.has(epicId)) return;
		const epic = byId.get(epicId);
		if (!epic) return;
		visiting.add(epicId);
		for (const dependency of epic.dependencies) {
			visit(dependency, [...pathIds, epicId]);
		}
		visiting.delete(epicId);
		visited.add(epicId);
	}
	for (const epic of epics) {
		visit(epic.id, []);
	}
	return issues;
}

export async function validateUxWorkpack(
	root = repoRoot,
	definitions = uxEpicDefinitions,
): Promise<UxWorkpackValidationIssue[]> {
	const issues: UxWorkpackValidationIssue[] = [];
	const pack = await parseUxRequirementPackage(root);
	const baseEpics = buildUxEpicPackets(pack, definitions);
	const expectedEpicIds = new Set(baseEpics.map((epic) => epic.id));
	const state = await readUxWorkpackState(root);
	if (!state) {
		issues.push({
			file: `docs/planning/v2/ux/${uxStateFileName}`,
			message: 'Missing mutable UX workpack state. Run pnpm v2:ux-workpack:generate.',
		});
	}
	const effectiveState = state
		? normalizeUxWorkpackState(state, definitions)
		: defaultUxWorkpackState(definitions);
	const effectiveEpics = applyUxWorkpackState(baseEpics, effectiveState);
	const requirementIds = new Set(pack.requirements.map((requirement) => requirement.id));
	const mappedRequirementCounts = new Map<string, number>();
	const epicFiles = await collectUxEpicFiles(root);
	const epicIds = new Set<string>();
	const storyIds = new Set<string>();
	const taskIds = new Set<string>();

	for (const file of epicFiles) {
		const relativeFile = path.relative(root, file).replace(/\\/g, '/');
		const parsed = uxEpicPacketSchema.safeParse(await readYamlFile(file));
		if (!parsed.success) {
			issues.push({
				file: relativeFile,
				message: parsed.error.issues.map((issue) => issue.message).join('; '),
			});
			continue;
		}
		const epic = parsed.data;
		if (epicIds.has(epic.id)) {
			issues.push({ file: relativeFile, message: `Duplicate UX epic id: ${epic.id}` });
		}
		epicIds.add(epic.id);
		if (!expectedEpicIds.has(epic.id)) {
			issues.push({
				file: relativeFile,
				message: `UX epic id is not generated from current UX workpack definitions: ${epic.id}`,
			});
		}
		if (epic.approved !== isApprovedStatus(epic.status)) {
			issues.push({
				file: relativeFile,
				message: `approved must be ${String(isApprovedStatus(epic.status))} for status ${epic.status}.`,
			});
		}
		for (const requirementId of epic.requirementIds) {
			if (!requirementIds.has(requirementId)) {
				issues.push({ file: relativeFile, message: `Unknown UX requirement id: ${requirementId}` });
			}
			mappedRequirementCounts.set(
				requirementId,
				(mappedRequirementCounts.get(requirementId) ?? 0) + 1,
			);
		}
		for (const story of epic.stories) {
			if (storyIds.has(story.id)) {
				issues.push({ file: relativeFile, message: `Duplicate UX story id: ${story.id}` });
			}
			storyIds.add(story.id);
			for (const requirementId of story.requirementIds) {
				if (!epic.requirementIds.includes(requirementId)) {
					issues.push({
						file: relativeFile,
						message: `UX story ${story.id} maps requirement outside parent epic: ${requirementId}`,
					});
				}
			}
			for (const task of story.tasks) {
				if (taskIds.has(task.id)) {
					issues.push({ file: relativeFile, message: `Duplicate UX task id: ${task.id}` });
				}
				taskIds.add(task.id);
			}
		}
	}

	if (epicFiles.length === 0) {
		issues.push({
			file: 'docs/planning/v2/ux/epics',
			message: 'No UX epic YAML files found. Run pnpm v2:ux-workpack:generate.',
		});
	}

	if (state) {
		const overrideIds = new Set<string>();
		if (state.defaults.approved !== isApprovedStatus(state.defaults.status)) {
			issues.push({
				file: `docs/planning/v2/ux/${uxStateFileName}`,
				message: `defaults.approved must be ${String(isApprovedStatus(state.defaults.status))} for status ${state.defaults.status}.`,
			});
		}
		for (const override of state.epics) {
			if (overrideIds.has(override.id)) {
				issues.push({
					file: `docs/planning/v2/ux/${uxStateFileName}`,
					message: `Duplicate UX epic state override: ${override.id}`,
				});
			}
			overrideIds.add(override.id);
			if (!expectedEpicIds.has(override.id)) {
				issues.push({
					file: `docs/planning/v2/ux/${uxStateFileName}`,
					message: `UX state references unknown epic id: ${override.id}`,
				});
				continue;
			}
			const status = override.status ?? state.defaults.status;
			const approved = override.approved ?? state.defaults.approved;
			if (approved !== isApprovedStatus(status)) {
				issues.push({
					file: `docs/planning/v2/ux/${uxStateFileName}`,
					message: `UX state approved must be ${String(isApprovedStatus(status))} for ${override.id} status ${status}.`,
				});
			}
			if (status === 'complete' && !override.completionEvidenceFile) {
				issues.push({
					file: `docs/planning/v2/ux/${uxStateFileName}`,
					message: `Complete UX state requires completionEvidenceFile: ${override.id}`,
				});
			}
			if (status !== 'complete' && override.completionEvidenceFile) {
				issues.push({
					file: `docs/planning/v2/ux/${uxStateFileName}`,
					message: `Non-complete UX state cannot keep completionEvidenceFile: ${override.id}`,
				});
			}
		}
		if (state.precedence) {
			const knownPhases = new Set(baseEpics.map((epic) => epic.phase));
			for (const phase of state.precedence.phases) {
				if (!knownPhases.has(phase)) {
					issues.push({
						file: `docs/planning/v2/ux/${uxStateFileName}`,
						message: `UX precedence references unknown phase: ${phase}`,
					});
				}
			}
			for (const epicId of state.precedence.epics) {
				if (!expectedEpicIds.has(epicId)) {
					issues.push({
						file: `docs/planning/v2/ux/${uxStateFileName}`,
						message: `UX precedence references unknown epic id: ${epicId}`,
					});
				}
			}
		}
	}

	for (const requirement of pack.requirements) {
		const count = mappedRequirementCounts.get(requirement.id) ?? 0;
		if (count === 0) {
			issues.push({
				file: requirement.file,
				message: `UX requirement is not mapped to an epic: ${requirement.id}`,
			});
		}
		if (count > 1) {
			issues.push({
				file: requirement.file,
				message: `UX requirement is mapped to more than one epic: ${requirement.id}`,
			});
		}
		if (!requirement.statement) {
			issues.push({ file: requirement.file, message: `Missing UX statement: ${requirement.id}` });
		}
		if (requirement.acceptanceCriteria.length === 0) {
			issues.push({
				file: requirement.file,
				message: `UX requirement has no acceptance criteria: ${requirement.id}`,
			});
		}
	}

	for (const epic of effectiveEpics) {
		for (const dependency of epic.dependencies) {
			if (!expectedEpicIds.has(dependency)) {
				issues.push({
					file: `docs/planning/v2/ux/epics/${epic.id}.yaml`,
					message: `Unknown UX dependency: ${dependency}`,
				});
			}
		}
	}

	issues.push(...detectDependencyCycles(effectiveEpics));
	if (state) {
		issues.push(...(await validateGeneratedUxFiles(root, pack, effectiveEpics, effectiveState)));
		issues.push(...(await validateUxCompletionEvidence(root, effectiveEpics)));
	}
	return issues;
}

export function renderUxPrompt(epic: UxEpicPacket, template: string): string {
	if (!epic.approved || (epic.status !== 'approved' && epic.status !== 'active')) {
		throw new Error(`UX epic ${epic.id} is not approved for prompt generation.`);
	}
	const storySummary = epic.stories
		.map(
			(story) =>
				`- ${story.id}: ${story.title}\n  Requirements: ${story.requirementIds.length > 0 ? story.requirementIds.join(', ') : '(source-doc story)'}\n  Tasks: ${story.tasks.map((task) => task.id).join(', ')}`,
		)
		.join('\n');
	return template
		.replaceAll('{{EPIC_ID}}', epic.id)
		.replaceAll('{{EPIC_TITLE}}', epic.title)
		.replaceAll('{{PHASE}}', epic.phase)
		.replaceAll('{{PRODUCT_PRIORITY}}', epic.productPriority)
		.replaceAll('{{OBJECTIVE}}', epic.objective)
		.replaceAll(
			'{{REQUIREMENT_IDS}}',
			epic.requirementIds.length > 0 ? epic.requirementIds.join(', ') : '(source-doc epic)',
		)
		.replaceAll(
			'{{SOURCE_DOCS}}',
			epic.sourceDocs.map((sourceDoc) => `- \`${sourceDoc}\``).join('\n'),
		)
		.replaceAll('{{EXPECTED_AREAS}}', epic.expectedAffectedAreas.join(', '))
		.replaceAll('{{STORY_SUMMARY}}', storySummary)
		.replaceAll('{{QUALITY_BAR}}', epic.qualityBar.map((item) => `- ${item}`).join('\n'))
		.replaceAll('{{GIT_WORKFLOW}}', epic.gitWorkflow.map((item) => `- ${item}`).join('\n'))
		.replaceAll(
			'{{STATUS_AUTOMATION}}',
			epic.statusAutomation.map((item) => `- ${item}`).join('\n'),
		)
		.replaceAll('{{STOP_CONDITIONS}}', epic.stopConditions.map((item) => `- ${item}`).join('\n'))
		.replaceAll('{{TEST_PLAN}}', epic.testPlan.map((item) => `- ${item}`).join('\n'))
		.replaceAll(
			'{{COMPLETION_EVIDENCE}}',
			epic.completionEvidence.map((item) => `- ${item}`).join('\n'),
		);
}

async function assertUxWorkpackValid(root = repoRoot): Promise<void> {
	const issues = await validateUxWorkpack(root);
	if (issues.length === 0) return;
	const details = issues
		.slice(0, 8)
		.map((issue) => `- ${issue.file}: ${issue.message}`)
		.join('\n');
	throw new Error(
		`v2 UX workpack validation failed; prompt generation is blocked until drift is fixed.\n${details}`,
	);
}

async function loadUxEpicById(epicId: string, root = repoRoot): Promise<UxEpicPacket> {
	const filePath = path.join(root, 'docs', 'planning', 'v2', 'ux', 'epics', `${epicId}.yaml`);
	return uxEpicPacketSchema.parse(await readYamlFile(filePath));
}

export async function updateUxEpicStatus(
	root: string,
	epicId: string,
	status: UxEpicStatus,
	options: { evidenceFile?: string } = {},
	definitions = uxEpicDefinitions,
): Promise<{ epic: UxEpicPacket; epics: UxEpicPacket[]; state: UxWorkpackState }> {
	const pack = await parseUxRequirementPackage(root);
	const baseEpics = buildUxEpicPackets(pack, definitions);
	if (!baseEpics.some((epic) => epic.id === epicId)) {
		throw new Error(`Unknown UX epic id: ${epicId}`);
	}
	const currentState = await ensureUxWorkpackState(root, definitions);
	const approved = isApprovedStatus(status);
	const overrides = currentState.epics.filter((epic) => epic.id !== epicId);
	const override: UxEpicStateOverride = { id: epicId };
	if (status !== currentState.defaults.status) {
		override.status = status;
	}
	if (approved !== currentState.defaults.approved) {
		override.approved = approved;
	}
	if (status === 'complete') {
		const evidenceFile =
			options.evidenceFile ?? `docs/planning/v2/ux/epics/${epicId}.completion.md`;
		try {
			await fs.access(path.resolve(root, evidenceFile));
		} catch {
			throw new Error(
				`UX completion evidence file is required before marking complete: ${evidenceFile}`,
			);
		}
		override.completionEvidenceFile = evidenceFile;
	}
	if (
		override.status ||
		override.approved !== undefined ||
		override.completionEvidenceFile ||
		override.notes
	) {
		overrides.push(override);
	}
	const nextState = normalizeUxWorkpackState({ ...currentState, epics: overrides }, definitions);
	await writeUxWorkpackState(root, nextState, definitions);
	const result = await generateUxWorkpack(root, definitions);
	const epic = result.epics.find((entry) => entry.id === epicId);
	if (!epic) throw new Error(`UX epic disappeared during generation: ${epicId}`);
	return { epic, epics: result.epics, state: result.state };
}

async function loadEffectiveUxWorkpack(root = repoRoot): Promise<{
	pack: UxRequirementPackage;
	state: UxWorkpackState;
	epics: UxEpicPacket[];
}> {
	const pack = await parseUxRequirementPackage(root);
	const state = await readUxWorkpackState(root);
	if (!state) {
		throw new Error(
			`Missing docs/planning/v2/ux/${uxStateFileName}. Run pnpm v2:ux-workpack:generate.`,
		);
	}
	const normalizedState = normalizeUxWorkpackState(state);
	const epics = applyUxWorkpackState(buildUxEpicPackets(pack), normalizedState);
	return { pack, state: normalizedState, epics };
}

function getFlagValue(args: string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	if (index === -1) return undefined;
	return args[index + 1];
}

function parseUxEpicStatus(value: string | undefined): UxEpicStatus {
	if (!value || !uxEpicStatuses.includes(value as UxEpicStatus)) {
		throw new Error(`--status must be one of: ${uxEpicStatuses.join(', ')}`);
	}
	return value as UxEpicStatus;
}

// Best-effort clipboard tools by platform. Prompt text always prints to stdout;
// copy support is a convenience for agent handoff and must not make generation fail.
function clipboardCandidates(): Array<{ cmd: string; args: string[] }> {
	if (process.platform === 'darwin') return [{ cmd: 'pbcopy', args: [] }];
	if (process.platform === 'win32') return [{ cmd: 'clip', args: [] }];
	const wayland = { cmd: 'wl-copy', args: [] };
	const x11 = [
		{ cmd: 'xclip', args: ['-selection', 'clipboard'] },
		{ cmd: 'xsel', args: ['--clipboard', '--input'] },
	];
	return process.env.WAYLAND_DISPLAY ? [wayland, ...x11] : [...x11, wayland];
}

async function copyToClipboard(text: string): Promise<string | null> {
	for (const candidate of clipboardCandidates()) {
		const copied = await new Promise<boolean>((resolve) => {
			const child = spawn(candidate.cmd, candidate.args, {
				stdio: ['pipe', 'ignore', 'ignore'],
			});
			child.on('error', () => resolve(false));
			child.on('close', (code) => resolve(code === 0));
			child.stdin.on('error', () => resolve(false));
			child.stdin.end(text);
		});
		if (copied) return candidate.cmd;
	}
	return null;
}

async function runGenerate(): Promise<void> {
	const result = await generateUxWorkpack();
	console.log(
		`generated ${result.epics.length} v2 UX epic packet(s) in ${path.relative(repoRoot, uxPlanningDir)}`,
	);
}

async function runValidate(): Promise<void> {
	const issues = await validateUxWorkpack();
	if (issues.length > 0) {
		console.error(`v2 UX workpack validation failed with ${issues.length} issue(s):`);
		for (const issue of issues) {
			console.error(`- ${issue.file}: ${issue.message}`);
		}
		process.exit(1);
	}
	console.log('v2 UX workpack validation passed');
}

async function runStatus(): Promise<void> {
	const { pack, epics, state } = await loadEffectiveUxWorkpack();
	console.log(uxStatusDocument(pack, epics, state).trimEnd());
}

async function runNext(): Promise<void> {
	const { pack, epics, state } = await loadEffectiveUxWorkpack();
	const nextEpic = findNextUxEpic(epics, state.precedence);
	console.log(
		YAML.stringify({
			nextEpic: nextUxEpicStatusBlock(nextEpic),
			metrics: buildUxWorkpackMetrics(pack, epics),
		}).trimEnd(),
	);
}

async function runPrompt(args: string[]): Promise<void> {
	const epicId = getFlagValue(args, '--epic');
	const useNext = args.includes('--next');
	if (!epicId && !useNext) {
		throw new Error('Usage: pnpm v2:ux-prompt -- --epic <epic-id> or pnpm v2:ux-prompt -- --next');
	}
	await assertUxWorkpackValid();
	let epic: UxEpicPacket | null;
	if (useNext) {
		const { epics, state } = await loadEffectiveUxWorkpack();
		epic = findNextUxEpic(epics, state.precedence);
	} else {
		epic = await loadUxEpicById(epicId as string);
	}
	if (!epic) {
		throw new Error('No approved or active UX epic is ready for prompt generation.');
	}
	const template = await fs.readFile(path.join(templatesDir, 'ux-epic-coder.prompt.md'), 'utf-8');
	const rendered = renderUxPrompt(epic, template);
	console.log(rendered);
	if (!args.includes('--no-copy')) {
		const tool = await copyToClipboard(rendered);
		if (tool) {
			console.error(`Copied ${epic.id} UX prompt to clipboard via ${tool}.`);
		} else {
			console.error(
				'Clipboard copy skipped: no wl-copy/xclip/xsel/pbcopy found. Pass --no-copy to silence.',
			);
		}
	}
}

async function runSetStatus(args: string[]): Promise<void> {
	const epicId = getFlagValue(args, '--epic');
	if (!epicId) {
		throw new Error('Usage: pnpm v2:ux-workpack:set-status -- --epic <epic-id> --status <status>');
	}
	const status = parseUxEpicStatus(getFlagValue(args, '--status'));
	const evidenceFile = getFlagValue(args, '--evidence');
	const result = await updateUxEpicStatus(repoRoot, epicId, status, { evidenceFile });
	console.log(
		`set ${result.epic.id} to ${result.epic.status}; regenerated ${result.epics.length} v2 UX epic packet(s)`,
	);
}

async function runComplete(args: string[]): Promise<void> {
	const epicId = getFlagValue(args, '--epic');
	if (!epicId) {
		throw new Error('Usage: pnpm v2:ux-workpack:complete -- --epic <epic-id> [--evidence <file>]');
	}
	const result = await updateUxEpicStatus(repoRoot, epicId, 'complete', {
		evidenceFile: getFlagValue(args, '--evidence'),
	});
	console.log(
		`completed ${result.epic.id}; regenerated UX status, metrics, and ${result.epics.length} epic packet(s)`,
	);
}

async function main(): Promise<void> {
	const [command, ...args] = process.argv.slice(2);
	if (command === 'generate') {
		await runGenerate();
		return;
	}
	if (command === 'validate') {
		await runValidate();
		return;
	}
	if (command === 'status') {
		await runStatus();
		return;
	}
	if (command === 'next') {
		await runNext();
		return;
	}
	if (command === 'prompt') {
		await runPrompt(args);
		return;
	}
	if (command === 'set-status') {
		await runSetStatus(args);
		return;
	}
	if (command === 'complete') {
		await runComplete(args);
		return;
	}
	throw new Error(
		'Usage: pnpm v2:ux-workpack:<generate|validate|status|next|prompt|set-status|complete> or pnpm v2:ux-prompt -- --epic <id|--next>',
	);
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (executedPath === modulePath) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
