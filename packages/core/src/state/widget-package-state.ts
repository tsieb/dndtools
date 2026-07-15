import type { ActorId } from './ids';
import type { WidgetCapabilitySet } from './permission-state';

export const WIDGET_PACKAGE_STATE_SCHEMA_VERSION = 1 as const;

export type PlatformProfileId = 'desktop' | 'tablet' | 'mobile' | 'web';

export type WidgetHostPermission =
	| 'filesystem'
	| 'clipboard'
	| 'network'
	| 'source-adapter'
	| 'asset'
	| 'external-link';

export type WidgetPackageTrustState = 'trusted' | 'unreviewed' | 'denied';
export type WidgetHostPermissionDecision = 'approved' | 'denied';

export type WidgetSchemaFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';
export type WidgetTemplateKind =
	| 'data-table'
	| 'status-list'
	| 'tracker'
	| 'action-panel'
	| 'scene-message'
	| 'chart'
	| 'stat-block'
	| 'form-panel';
export type WidgetRuntimeKind = 'template' | 'builtin' | 'custom-html-js';
export type WidgetRuntimeSandbox = 'iframe' | 'worker';
export type WidgetStyleIsolation = 'host-scoped' | 'iframe-document' | 'shadow-root';
export type WidgetStyleCapability =
	| 'css-variables'
	| 'custom-stylesheet'
	| 'responsive-layout'
	| 'host-theme-tokens'
	| 'animation'
	| 'custom-fonts';
export type WidgetDataQuerySource =
	| 'current-combatants'
	| 'visible-characters'
	| 'selected-scene'
	| 'session-state'
	| 'notes'
	| 'maps'
	| 'content-objects'
	| 'binding';
export type WidgetOutputDestinationClass =
	| 'scene'
	| 'session'
	| 'entity'
	| 'player-visible-state'
	| 'player-scene'
	| 'clipboard'
	| 'network'
	| 'exported-package';
export type WidgetNetworkDestinationClass =
	| 'vault-sync'
	| 'asset-cdn'
	| 'widget-declared'
	| 'analytics';
export type WidgetAuthoringSource = 'system' | 'user-authored' | 'workspace' | 'generated';

/**
 * The product surfaces a widget can be placed on. A widget declares which surfaces it supports
 * (Contract 4) so the Command Center's own widgets can be real definitions WITHOUT becoming
 * addable to arbitrary scenes. Absent ⇒ a scene widget, listed in the library (back-compat).
 */
export type WidgetSurface = 'scene' | 'command-center' | 'player-view';

export interface WidgetPlacement {
	surfaces: WidgetSurface[];
	/** Whether the widget appears in the add-to-scene library (CMD-005). */
	libraryListed: boolean;
}

/**
 * The control a {@link WidgetConfigField} renders as in the shared Customize panel. This is the
 * data-driven customization surface every widget — system, command-center, and user-authored —
 * shares: declarative config + style tokens + size, never code.
 */
export type WidgetConfigControl = 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'color';
export type WidgetConfigFieldGroup = 'content' | 'display' | 'style';

export interface WidgetConfigFieldOption {
	value: string;
	label: string;
}

export interface WidgetConfigField {
	key: string;
	label: string;
	control: WidgetConfigControl;
	/** Which tab/group the field renders in. Defaults to `content`. */
	group?: WidgetConfigFieldGroup;
	/** For `select`. */
	options?: WidgetConfigFieldOption[];
	/** The system-provided default value (the widget's "default"). */
	default?: unknown;
	/** For `number`. */
	min?: number;
	max?: number;
	step?: number;
	placeholder?: string;
	help?: string;
}

export interface WidgetDataSchema {
	type: 'object';
	required?: string[];
	properties?: Record<string, { type: WidgetSchemaFieldType }>;
	additionalProperties?: boolean;
}

export interface WidgetBindingDefinition {
	id: string;
	label: string;
	entityTypes: string[];
	mode: 'read' | 'operate' | 'manage' | 'observe';
	requiredCapability: WidgetCapabilitySet;
}

export interface WidgetCommandDescriptor {
	type: string;
	displayName: string;
	requiredCapability: WidgetCapabilitySet;
	payloadSchema: WidgetDataSchema;
	writesTo: 'scene' | 'session' | 'entity';
	destinationClass?: WidgetOutputDestinationClass;
	targetBindingId?: string;
}

export interface WidgetEventDescriptor {
	type: string;
	category: 'entity.changed' | 'scene.changed' | 'session.changed' | 'permission.changed';
}

export interface WidgetPackageAsset {
	path: string;
	sha256?: string;
	kind?: 'html' | 'javascript' | 'css' | 'worker' | 'module' | 'asset';
	entrypoint?: boolean;
	content?: string;
	contentEncoding?: 'utf-8' | 'base64';
}

export interface WidgetRenderEntrypoint {
	runtime: WidgetRuntimeKind;
	sandbox?: WidgetRuntimeSandbox;
	template?: WidgetTemplateKind;
	assetPath?: string;
	exportName?: string;
	hostApiVersion: number;
}

export interface WidgetStyleTokenDefinition {
	name: string;
	value: string;
	description?: string;
}

export interface WidgetStyleDefinition {
	isolation: WidgetStyleIsolation;
	stylesheetAssetPaths?: string[];
	capabilities?: WidgetStyleCapability[];
	tokens?: WidgetStyleTokenDefinition[];
	cssVariables?: Record<string, string>;
}

export interface WidgetDataQueryDefinition {
	id: string;
	label: string;
	source: WidgetDataQuerySource;
	bindingIds?: string[];
	requiredCapability: WidgetCapabilitySet;
	audience: 'dm' | 'players' | 'shared';
}

export interface WidgetComputedFieldDefinition {
	id: string;
	label: string;
	inputQueryIds: string[];
	valueType: WidgetSchemaFieldType;
}

export interface WidgetOutputWriteDefinition {
	id: string;
	label: string;
	commandType: string;
	destinationClass: WidgetOutputDestinationClass;
	payloadSchema: WidgetDataSchema;
	requiresConfirmation?: boolean;
}

export interface WidgetAuthoringProvenance {
	source: WidgetAuthoringSource;
	createdBy?: string;
	createdAt?: string;
	llmProvider?: string;
	promptSummary?: string;
	reviewNotes?: string[];
}

export interface WidgetDefinition {
	type: string;
	version: string;
	displayName: string;
	author: 'system' | 'user' | 'workspace' | string;
	/** Library category (e.g. 'Combat', 'Reference'). Optional; used to group the widget library. */
	category?: string;
	/** One-line human description surfaced in the library + Customize panel. */
	description?: string;
	/** A glanceable icon key/emoji for the library + canvas chrome. */
	icon?: string;
	/** Which surfaces the widget may be placed on + whether it is library-listed (default: scene, listed). */
	placement?: WidgetPlacement;
	/** Declarative customization fields rendered by the shared Customize panel (config + defaults). */
	configFields?: WidgetConfigField[];
	renderEntrypoint?: WidgetRenderEntrypoint;
	style?: WidgetStyleDefinition;
	supportedProfiles: PlatformProfileId[];
	defaultSize: { width: number; height: number };
	minSize: { width: number; height: number };
	resizePolicy: 'fixed' | 'axis-locked' | 'free';
	requiredBindings: WidgetBindingDefinition[];
	optionalBindings: WidgetBindingDefinition[];
	dataQueries?: WidgetDataQueryDefinition[];
	computedFields?: WidgetComputedFieldDefinition[];
	outputWrites?: WidgetOutputWriteDefinition[];
	configurationSchema: WidgetDataSchema;
	runtimeStateSchema?: WidgetDataSchema;
	localStateSchema?: WidgetDataSchema;
	automationSchema?: WidgetDataSchema;
	capabilitySets: WidgetCapabilitySet[];
	commands: WidgetCommandDescriptor[];
	events: WidgetEventDescriptor[];
	hostPermissions: WidgetHostPermission[];
	networkDestinationClasses?: WidgetNetworkDestinationClass[];
}

export interface WidgetMigration {
	widgetType: string;
	fromVersion: string;
	toVersion: string;
	renameConfigurationKeys?: Record<string, string>;
	setConfigurationDefaults?: Record<string, unknown>;
	failWithDiagnostic?: string;
}

export interface WidgetPackageDefinition {
	id: string;
	version: string;
	displayName: string;
	widgets: WidgetDefinition[];
	migrations: WidgetMigration[];
	assets: WidgetPackageAsset[];
	portabilityWarnings: string[];
	authoring?: WidgetAuthoringProvenance;
}

export interface WidgetDiagnostic {
	id: string;
	code: string;
	message: string;
	severity: 'error' | 'warning' | 'info';
}

export interface WidgetPackageTrustReview {
	state: WidgetPackageTrustState;
	hostPermissions: Record<WidgetHostPermission, WidgetHostPermissionDecision>;
	reviewedBy: ActorId | null;
	reviewedAt: string | null;
}

export interface WidgetPackageMigrationStatus {
	state: 'none' | 'migrated' | 'failed';
	fromVersion: string | null;
	toVersion: string | null;
	diagnostics: WidgetDiagnostic[];
}

export interface WidgetPackageRecord {
	package: WidgetPackageDefinition;
	trust: WidgetPackageTrustReview;
	enabled: boolean;
	removedAt: string | null;
	installedAt: string;
	updatedAt: string;
	revision: number;
	migrationStatus: WidgetPackageMigrationStatus;
	diagnostics: WidgetDiagnostic[];
}

export interface WidgetPackageState {
	packages: Record<string, WidgetPackageRecord>;
	/**
	 * The ACTIVE campaign SYSTEM PACKAGE (the rules vocabulary the interface reads), by installed
	 * package id. Optional + nullable so a vault persisted before system switching existed hydrates
	 * safely (absent/null ⇒ no explicit system package selected — the built-in default vocabulary).
	 * Changed only by `widget.package.switch-system`, which fail-closed dry-runs the switch first.
	 */
	activeSystemPackageId?: string | null;
	schemaVersion: typeof WIDGET_PACKAGE_STATE_SCHEMA_VERSION;
}

export const ALL_HOST_PERMISSIONS: WidgetHostPermission[] = [
	'filesystem',
	'clipboard',
	'network',
	'source-adapter',
	'asset',
	'external-link',
];

export const EMPTY_WIDGET_PACKAGE_STATE: WidgetPackageState = Object.freeze({
	packages: {},
	schemaVersion: WIDGET_PACKAGE_STATE_SCHEMA_VERSION,
});

const EMPTY_OBJECT_SCHEMA: WidgetDataSchema = Object.freeze({
	type: 'object',
	// Configuration stays permissive so config keys, the layout flags the GUI stores here
	// (visibility / rotation / collapsed), and per-instance `styleTokens` overrides all coexist.
	additionalProperties: true,
});

/** Host API version a built-in (template / builtin) render entrypoint targets. */
export const WIDGET_RENDER_HOST_API_VERSION = 1 as const;

const SCENE_PLACEMENT: WidgetPlacement = { surfaces: ['scene'], libraryListed: true };
const COMMAND_CENTER_PLACEMENT: WidgetPlacement = {
	surfaces: ['command-center'],
	libraryListed: false,
};

/**
 * The default, theme-tracking style every system widget ships with. Token values reference the app
 * theme tokens so a widget blends in by default; the shared Customize panel can override any of them
 * per instance (stored under `configuration.styleTokens`, surfaced as `--widget-<name>` CSS vars).
 *
 * Only tokens that something actually consumes are declared: `accent` and `text` are applied by the
 * host-scoped system renderers, so they are real, functional knobs. A `surface` token used to be
 * declared too, but for host-scoped (template/builtin) system widgets `--widget-surface` is consumed
 * by NOTHING (only the iframe-isolated custom-widget runtime reads it), which made the surface picker
 * a no-op control in the Customize panels — so it is intentionally omitted here.
 */
function defaultWidgetStyle(): WidgetStyleDefinition {
	return {
		isolation: 'host-scoped',
		capabilities: ['css-variables', 'host-theme-tokens', 'responsive-layout'],
		tokens: [
			{
				name: 'accent',
				value: 'var(--color-accent)',
				description: 'Accent color for highlights, links, and actions.',
			},
			{ name: 'text', value: 'var(--color-text-primary)', description: 'Primary text color.' },
		],
	};
}

function templateEntrypoint(template: WidgetTemplateKind): WidgetRenderEntrypoint {
	return { runtime: 'template', template, hostApiVersion: WIDGET_RENDER_HOST_API_VERSION };
}

function builtinEntrypoint(exportName: string): WidgetRenderEntrypoint {
	return { runtime: 'builtin', exportName, hostApiVersion: WIDGET_RENDER_HOST_API_VERSION };
}

function dataQuery(
	id: string,
	label: string,
	source: WidgetDataQuerySource,
	audience: 'dm' | 'players' | 'shared' = 'shared',
): WidgetDataQueryDefinition {
	return { id, label, source, requiredCapability: 'viewer', audience };
}

// --- Config-field shorthands (the customization knobs every Customize panel renders) ---------------
function titleField(): WidgetConfigField {
	return {
		key: 'title',
		label: 'Title override',
		control: 'text',
		group: 'display',
		placeholder: 'Default title',
	};
}
function toggleField(
	key: string,
	label: string,
	def: boolean,
	group: WidgetConfigFieldGroup = 'display',
): WidgetConfigField {
	return { key, label, control: 'toggle', group, default: def };
}
function selectField(
	key: string,
	label: string,
	options: WidgetConfigFieldOption[],
	def: string,
	group: WidgetConfigFieldGroup = 'content',
): WidgetConfigField {
	return { key, label, control: 'select', group, options, default: def };
}
function numberField(
	key: string,
	label: string,
	def: number,
	bounds: { min?: number; max?: number; step?: number } = {},
	group: WidgetConfigFieldGroup = 'content',
): WidgetConfigField {
	return { key, label, control: 'number', group, default: def, ...bounds };
}
function textField(
	key: string,
	label: string,
	group: WidgetConfigFieldGroup = 'content',
): WidgetConfigField {
	return { key, label, control: 'text', group };
}
function textareaField(
	key: string,
	label: string,
	group: WidgetConfigFieldGroup = 'content',
): WidgetConfigField {
	return { key, label, control: 'textarea', group };
}

interface SystemWidgetInput {
	type: string;
	displayName: string;
	category?: string;
	description?: string;
	icon?: string;
	defaultSize: { width: number; height: number };
	minSize?: { width: number; height: number };
	placement?: WidgetPlacement;
	configFields?: WidgetConfigField[];
	renderEntrypoint?: WidgetRenderEntrypoint;
	requiredBindings?: WidgetBindingDefinition[];
	dataQueries?: WidgetDataQueryDefinition[];
	commands?: WidgetCommandDescriptor[];
	events?: WidgetEventDescriptor[];
}

/**
 * Build a system widget definition. Every system widget now ships a render entrypoint, default style
 * tokens, declarative config fields, and a placement — the exact same shape a user-authored widget
 * carries — so the GUI renders them all through one path (Contract 4).
 */
function systemWidget(input: SystemWidgetInput): WidgetDefinition {
	return {
		type: input.type,
		version: '1.0.0',
		displayName: input.displayName,
		author: 'system',
		category: input.category,
		description: input.description,
		icon: input.icon,
		placement: input.placement ?? SCENE_PLACEMENT,
		configFields: input.configFields ?? [],
		renderEntrypoint: input.renderEntrypoint,
		style: defaultWidgetStyle(),
		supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
		defaultSize: input.defaultSize,
		minSize: input.minSize ?? { width: 120, height: 80 },
		resizePolicy: 'free',
		requiredBindings: input.requiredBindings ?? [],
		optionalBindings: [],
		dataQueries: input.dataQueries,
		configurationSchema: EMPTY_OBJECT_SCHEMA,
		capabilitySets: ['manager', 'operator', 'viewer'],
		commands: input.commands ?? [],
		events: input.events ?? [],
		hostPermissions: [],
	};
}

/** An entity-backed required binding (Contract 4: Widget Data Contract). */
function readBinding(id: string, label: string, entityType: string): WidgetBindingDefinition {
	return { id, label, entityTypes: [entityType], mode: 'read', requiredCapability: 'viewer' };
}

/**
 * A Command Center widget: a real definition scoped to the command-center surface and NOT listed in
 * the add-to-scene library (CMD-005). Rendered by a named built-in app component (`exportName`); the
 * spatial board still owns geometry. Every CC widget gets a title-override knob.
 */
function commandCenterWidget(input: {
	type: string;
	displayName: string;
	icon?: string;
	description?: string;
	size: { width: number; height: number };
	configFields?: WidgetConfigField[];
	dataQueries?: WidgetDataQueryDefinition[];
}): WidgetDefinition {
	return systemWidget({
		type: input.type,
		displayName: input.displayName,
		category: 'Command Center',
		description: input.description,
		icon: input.icon,
		defaultSize: input.size,
		minSize: { width: 160, height: 96 },
		placement: COMMAND_CENTER_PLACEMENT,
		renderEntrypoint: builtinEntrypoint(input.type),
		configFields: [titleField(), ...(input.configFields ?? [])],
		dataQueries: input.dataQueries,
	});
}

export function createSystemWidgetPackages(now = '2026-06-03T00:00:00.000Z'): WidgetPackageState {
	// SES-005 — the timer/tool widget's runtime action surface. start/pause/resume/reset/advance are
	// OPERATE actions (require `operator`); set-duration CONFIGURES the timer (requires `manager`). An
	// `operator` grant authorizes every operate action WITHOUT authorizing configure (fail closed).
	const operateDurationPayload: WidgetDataSchema = {
		type: 'object',
		required: ['durationSeconds'],
		properties: { durationSeconds: { type: 'number' } },
		additionalProperties: false,
	};
	const operateNoPayload: WidgetDataSchema = {
		type: 'object',
		properties: {},
		additionalProperties: false,
	};
	const advancePayload: WidgetDataSchema = {
		type: 'object',
		required: ['deltaSeconds'],
		properties: { deltaSeconds: { type: 'number' } },
		additionalProperties: false,
	};
	const rollExpressionPayload: WidgetDataSchema = {
		type: 'object',
		required: ['expression'],
		properties: { expression: { type: 'string' } },
		additionalProperties: true,
	};
	const timerWidget: WidgetDefinition = {
		...systemWidget({
			type: 'timer',
			displayName: 'Timer',
			category: 'Dice & Timers',
			description: 'A session countdown with start/pause/advance controls.',
			icon: 'recent',
			defaultSize: { width: 220, height: 150 },
			minSize: { width: 160, height: 110 },
			renderEntrypoint: templateEntrypoint('tracker'),
			configFields: [
				numberField('durationSeconds', 'Default duration (seconds)', 60, { min: 1, step: 1 }),
			],
		}),
		commands: [
			{
				type: 'timer.start',
				displayName: 'Start timer',
				requiredCapability: 'operator',
				payloadSchema: operateDurationPayload,
				writesTo: 'session',
			},
			{
				type: 'timer.pause',
				displayName: 'Pause timer',
				requiredCapability: 'operator',
				payloadSchema: operateNoPayload,
				writesTo: 'session',
			},
			{
				type: 'timer.resume',
				displayName: 'Resume timer',
				requiredCapability: 'operator',
				payloadSchema: operateNoPayload,
				writesTo: 'session',
			},
			{
				type: 'timer.reset',
				displayName: 'Reset timer',
				requiredCapability: 'operator',
				payloadSchema: operateNoPayload,
				writesTo: 'session',
			},
			{
				type: 'timer.advance',
				displayName: 'Advance timer',
				requiredCapability: 'operator',
				payloadSchema: advancePayload,
				writesTo: 'session',
			},
			{
				// CONFIGURE: change the timer's default duration. Requires `manager` — an `operator` is
				// blocked from this command (SES-005 AC2), proving operate-allowed / configure-denied.
				type: 'timer.set-duration',
				displayName: 'Configure timer duration',
				requiredCapability: 'manager',
				payloadSchema: operateDurationPayload,
				writesTo: 'scene',
			},
		],
		events: [{ type: 'timer.started', category: 'session.changed' }],
	};
	const diceWidget: WidgetDefinition = {
		...systemWidget({
			type: 'dice',
			displayName: 'Dice',
			category: 'Dice & Timers',
			description: 'Quick-roll buttons that record rolls to the session.',
			icon: 'dice',
			defaultSize: { width: 220, height: 160 },
			minSize: { width: 160, height: 120 },
			renderEntrypoint: templateEntrypoint('action-panel'),
			configFields: [textField('formulas', 'Quick-roll formulas (comma separated)')],
		}),
		commands: [
			{
				type: 'dice.roll',
				displayName: 'Roll dice',
				requiredCapability: 'operator',
				payloadSchema: rollExpressionPayload,
				writesTo: 'session',
			},
		],
	};
	const sceneWidgets: WidgetDefinition[] = [
		// `note` stays binding-free: a note widget may render an ad-hoc/quick note,
		// and only binds a stored note on demand.
		systemWidget({
			type: 'note',
			displayName: 'Note',
			category: 'Notes',
			description: 'A free-text note rendered inline on the canvas.',
			icon: 'note-edit',
			defaultSize: { width: 240, height: 180 },
			minSize: { width: 160, height: 120 },
			renderEntrypoint: templateEntrypoint('form-panel'),
			configFields: [textField('heading', 'Heading'), textareaField('body', 'Body')],
		}),
		systemWidget({
			type: 'map',
			displayName: 'Map',
			category: 'Maps',
			description: 'A bound map with its visible layers.',
			icon: 'atlas-map',
			defaultSize: { width: 360, height: 280 },
			minSize: { width: 200, height: 160 },
			renderEntrypoint: builtinEntrypoint('map'),
			requiredBindings: [readBinding('map', 'Map', 'map')],
			dataQueries: [dataQuery('map', 'Bound map', 'binding')],
		}),
		systemWidget({
			type: 'character',
			displayName: 'Character',
			category: 'Characters',
			description: 'A character stat block (HP, AC, abilities).',
			icon: 'characters-person',
			defaultSize: { width: 280, height: 220 },
			minSize: { width: 200, height: 160 },
			renderEntrypoint: templateEntrypoint('stat-block'),
			requiredBindings: [readBinding('character', 'Character', 'character')],
			dataQueries: [dataQuery('character', 'Bound character', 'binding')],
			configFields: [toggleField('showAbilities', 'Ability scores', true)],
		}),
		diceWidget,
		systemWidget({
			type: 'initiative-tracker',
			displayName: 'Initiative Tracker',
			category: 'Combat',
			description: 'The live turn order with round and active turn.',
			icon: 'sword',
			defaultSize: { width: 280, height: 220 },
			minSize: { width: 200, height: 150 },
			renderEntrypoint: templateEntrypoint('status-list'),
			dataQueries: [dataQuery('combatants', 'Current combatants', 'current-combatants', 'dm')],
			configFields: [toggleField('showHp', 'HP column', true)],
		}),
		timerWidget,
		systemWidget({
			type: 'audio',
			displayName: 'Audio',
			category: 'Atmosphere',
			description: 'Ambient audio playback controls.',
			icon: 'audio',
			defaultSize: { width: 240, height: 150 },
			minSize: { width: 180, height: 120 },
			renderEntrypoint: builtinEntrypoint('audio'),
			configFields: [toggleField('loop', 'Loop playback', true)],
		}),
		// SES-004 — a handout is delivered as a Scene widget. It references the handout BY ID through
		// its configuration (never a content clone — Contract 4 embed/projection). Binding-free; the
		// actor-filtered handout read decides which sections each recipient may see.
		systemWidget({
			type: 'handout',
			displayName: 'Handout',
			category: 'Reference',
			description: 'A shareable handout message.',
			icon: 'scroll',
			defaultSize: { width: 300, height: 200 },
			minSize: { width: 180, height: 130 },
			renderEntrypoint: templateEntrypoint('scene-message'),
			configFields: [textField('heading', 'Heading'), textareaField('body', 'Body')],
		}),
		systemWidget({
			type: 'quick-reference',
			displayName: 'Quick Reference',
			category: 'Reference',
			description: 'A compact table of reference content.',
			icon: 'book',
			defaultSize: { width: 280, height: 220 },
			minSize: { width: 180, height: 140 },
			renderEntrypoint: templateEntrypoint('data-table'),
			dataQueries: [dataQuery('content', 'Reference content', 'content-objects', 'dm')],
			configFields: [numberField('count', 'Rows shown', 8, { min: 1, max: 50, step: 1 })],
		}),
		systemWidget({
			type: 'prep',
			displayName: 'Prep',
			category: 'Reference',
			description: 'A checklist of prep notes for the session.',
			icon: 'folder',
			defaultSize: { width: 260, height: 200 },
			minSize: { width: 180, height: 140 },
			renderEntrypoint: templateEntrypoint('status-list'),
			dataQueries: [dataQuery('notes', 'Prep notes', 'notes', 'dm')],
			configFields: [numberField('count', 'Items shown', 5, { min: 1, max: 30, step: 1 })],
		}),
	];
	const commandCenterWidgets: WidgetDefinition[] = [
		commandCenterWidget({
			type: 'session',
			displayName: 'Active Session',
			icon: 'controls',
			description: 'Session status strip, phase controls, and workflow.',
			size: { width: 400, height: 250 },
		}),
		commandCenterWidget({
			type: 'getting-started',
			displayName: 'Getting Started',
			icon: 'sparkle',
			description: 'Onboarding and feature-tier guidance.',
			size: { width: 400, height: 170 },
		}),
		commandCenterWidget({
			type: 'tools',
			displayName: 'Tools & Layouts',
			icon: 'toolbox',
			description: 'Home-scene tools, the widget library, and layout presets.',
			size: { width: 400, height: 212 },
		}),
		commandCenterWidget({
			type: 'data-hub',
			displayName: 'Data Hub',
			icon: 'vault',
			description: 'Tabbed Scenes / Parties / Campaign tables.',
			size: { width: 400, height: 280 },
			configFields: [
				selectField(
					'tabOrder',
					'Tab order',
					[
						{ value: 'scenes-first', label: 'Scenes · Parties · Campaign' },
						{ value: 'parties-first', label: 'Parties · Campaign · Scenes' },
						{ value: 'campaign-first', label: 'Campaign · Scenes · Parties' },
					],
					'scenes-first',
				),
				toggleField('showUpdated', 'Updated column', true),
				toggleField('showVisibility', 'Visibility column', true),
			],
			dataQueries: [
				dataQuery('scenes', 'Scenes', 'selected-scene', 'dm'),
				dataQuery('parties', 'Parties', 'visible-characters', 'dm'),
				dataQuery('campaign', 'Campaign', 'content-objects', 'dm'),
			],
		}),
		commandCenterWidget({
			type: 'atlas',
			displayName: 'Atlas',
			icon: 'atlas-map',
			description: 'Active-map projection plus map thumbnails.',
			size: { width: 400, height: 200 },
			configFields: [
				selectField(
					'thumbnails',
					'Map thumbnails',
					[
						{ value: '3', label: '3 most recent' },
						{ value: '6', label: '6 most recent' },
					],
					'3',
				),
			],
			dataQueries: [dataQuery('maps', 'Maps', 'maps', 'dm')],
		}),
		commandCenterWidget({
			type: 'characters',
			displayName: 'Characters',
			icon: 'characters-person',
			description: 'The party roster as a thumbnail grid.',
			size: { width: 400, height: 152 },
			configFields: [toggleField('showVitals', 'HP / AC vitals', true)],
			dataQueries: [dataQuery('party', 'Party', 'visible-characters', 'dm')],
		}),
		commandCenterWidget({
			type: 'player-views',
			displayName: 'Player Views',
			icon: 'preview',
			description: 'Per-participant Player View assignment + projection.',
			size: { width: 400, height: 300 },
		}),
		commandCenterWidget({
			type: 'combat',
			displayName: 'Combat',
			icon: 'sword',
			description: 'Live tracker glance plus the most recent encounter.',
			size: { width: 194, height: 150 },
			configFields: [toggleField('showChallenge', 'Challenge rating', true)],
			dataQueries: [dataQuery('combat', 'Combat tracker', 'current-combatants', 'dm')],
		}),
		commandCenterWidget({
			type: 'notes',
			displayName: 'Notes',
			icon: 'note-edit',
			description: 'The most recently touched notes.',
			size: { width: 400, height: 182 },
			configFields: [
				selectField(
					'count',
					'Recent notes shown',
					[
						{ value: '3', label: '3 notes' },
						{ value: '5', label: '5 notes' },
						{ value: '8', label: '8 notes' },
					],
					'5',
				),
			],
			dataQueries: [dataQuery('notes', 'Notes', 'notes', 'dm')],
		}),
		commandCenterWidget({
			type: 'search',
			displayName: 'Search',
			icon: 'search',
			description: 'Launch global search from the board.',
			size: { width: 194, height: 150 },
		}),
	];
	const packages: WidgetPackageDefinition[] = [
		{
			id: 'system.scene-widgets',
			version: '1.0.0',
			displayName: 'System Scene Widgets',
			widgets: sceneWidgets,
			migrations: [],
			assets: [],
			portabilityWarnings: [],
		},
		{
			id: 'system.command-center-widgets',
			version: '1.0.0',
			displayName: 'Command Center Widgets',
			widgets: commandCenterWidgets,
			migrations: [],
			assets: [],
			portabilityWarnings: [],
		},
	];
	return {
		schemaVersion: WIDGET_PACKAGE_STATE_SCHEMA_VERSION,
		packages: Object.fromEntries(
			packages.map((definition) => [
				definition.id,
				{
					package: definition,
					trust: {
						state: 'trusted',
						hostPermissions: Object.fromEntries(
							ALL_HOST_PERMISSIONS.map((permission) => [permission, 'denied']),
						) as Record<WidgetHostPermission, WidgetHostPermissionDecision>,
						reviewedBy: 'system',
						reviewedAt: now,
					},
					enabled: true,
					removedAt: null,
					installedAt: now,
					updatedAt: now,
					revision: 1,
					migrationStatus: {
						state: 'none',
						fromVersion: null,
						toVersion: null,
						diagnostics: [],
					},
					diagnostics: [],
				} satisfies WidgetPackageRecord,
			]),
		),
	};
}

export const SYSTEM_WIDGET_PACKAGE_STATE = createSystemWidgetPackages();

export function mergeSystemWidgetPackages(state: WidgetPackageState): WidgetPackageState {
	// Code is the source of truth for system package DEFINITIONS: a persisted system package
	// (saved under an older app version, possibly with a now-stale shape) must NOT shadow the
	// shipped definition, or a widget's renderer/config/style change would never take effect after
	// upgrade. We still honor the one user-owned decision on a system package — its enable/remove
	// state — by overlaying just those flags from the persisted record.
	const merged: Record<string, WidgetPackageRecord> = { ...state.packages };
	for (const [id, systemRecord] of Object.entries(SYSTEM_WIDGET_PACKAGE_STATE.packages)) {
		const persisted = state.packages[id];
		merged[id] = persisted
			? { ...systemRecord, enabled: persisted.enabled, removedAt: persisted.removedAt }
			: systemRecord;
	}
	return {
		schemaVersion: WIDGET_PACKAGE_STATE_SCHEMA_VERSION,
		packages: merged,
	};
}

export function findPackageRecordForWidgetType(
	state: WidgetPackageState,
	widgetType: string,
): WidgetPackageRecord | undefined {
	return Object.values(state.packages).find((record) =>
		record.package.widgets.some((definition) => definition.type === widgetType),
	);
}

export function findWidgetDefinition(
	state: WidgetPackageState,
	widgetType: string,
): WidgetDefinition | undefined {
	return findPackageRecordForWidgetType(state, widgetType)?.package.widgets.find(
		(definition) => definition.type === widgetType,
	);
}

/**
 * Like {@link findWidgetDefinition}, but resolves a definition ONLY when its package is currently
 * active — installed, enabled, and not removed. Render surfaces must use this so a disabled or
 * removed package's widget can never be drawn (its renderer/iframe must not mount or execute). The
 * command path deliberately keeps the raw finders so it can still emit a specific package-disabled
 * vs package-not-found rejection rather than a generic "unknown widget".
 */
export function findActiveWidgetDefinition(
	state: WidgetPackageState,
	widgetType: string,
): WidgetDefinition | undefined {
	const record = findPackageRecordForWidgetType(state, widgetType);
	if (!record || !record.enabled || record.removedAt) return undefined;
	return record.package.widgets.find((definition) => definition.type === widgetType);
}

// --- Placement + customization helpers (shared by every surface, fail-soft to scene defaults) -------

/** The surfaces a widget supports. Absent placement ⇒ a scene widget (back-compat). */
export const DEFAULT_WIDGET_SURFACES: readonly WidgetSurface[] = Object.freeze(['scene']);

export function widgetSurfaces(definition: Pick<WidgetDefinition, 'placement'>): WidgetSurface[] {
	return definition.placement ? [...definition.placement.surfaces] : [...DEFAULT_WIDGET_SURFACES];
}

export function widgetSupportsSurface(
	definition: Pick<WidgetDefinition, 'placement'>,
	surface: WidgetSurface,
): boolean {
	return widgetSurfaces(definition).includes(surface);
}

/** Whether a widget appears in the add-to-scene library. Absent placement ⇒ listed (back-compat). */
export function isWidgetLibraryListed(definition: Pick<WidgetDefinition, 'placement'>): boolean {
	return definition.placement ? definition.placement.libraryListed : true;
}

/**
 * Merge a widget's declared `configField` defaults UNDER an instance's configuration so a renderer
 * always sees every customizable key resolved (the "system defaults" the user can override). The
 * instance's own values win; reserved layout keys (visibility/rotation/collapse) pass through.
 */
export function resolveWidgetConfig(
	definition: Pick<WidgetDefinition, 'configFields'>,
	configuration?: Record<string, unknown> | null,
): Record<string, unknown> {
	const resolved: Record<string, unknown> = {};
	for (const field of definition.configFields ?? []) {
		if (field.default !== undefined) resolved[field.key] = field.default;
	}
	for (const [key, value] of Object.entries(configuration ?? {})) {
		if (value !== undefined) resolved[key] = value;
	}
	return resolved;
}

/**
 * Extract the per-instance style-token overrides stored under `configuration.styleTokens` as a plain
 * `token name → value` map, keeping only string values. This is the raw override map the customize
 * surfaces edit; {@link resolveWidgetStyleVariables} layers it (prefixed + empties dropped) onto the
 * definition's declared tokens for rendering.
 */
export function readStyleTokenOverrides(
	configuration?: Record<string, unknown> | null,
): Record<string, string> {
	const out: Record<string, string> = {};
	const raw = configuration?.styleTokens;
	if (raw && typeof raw === 'object') {
		for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
			if (typeof value === 'string') out[name] = value;
		}
	}
	return out;
}

/**
 * Resolve the CSS custom properties a widget renders with: the definition's declared style tokens +
 * cssVariables, then per-instance overrides stored under `configuration.styleTokens`. Token `name`
 * is exposed as `--widget-<name>` (the convention {@link scaffoldCustomWidgetPackageDraft} uses), so
 * the same accent/surface/text knobs work for system, command-center, and user-authored widgets.
 */
// These resolved variables are serialized onto a NON-sandboxed host element's `style` attribute
// (WidgetView) and injected into the custom-widget iframe's `:root`. A value containing a
// declaration/markup terminator could break out of its single declaration and inject arbitrary CSS
// rules or markup (overlay/clickjacking), and a malformed key is not a real custom property — so an
// unsafe value is dropped entirely (the consumer falls back to its theme default) and a non
// `--custom-property` key is ignored. Token VALUES are author-controlled and may legitimately be
// `var(--color-accent)`, `#abc`, `1rem`, etc.; none of those contain these characters.
const UNSAFE_CSS_VALUE = /[;{}<>]/;
const CSS_CUSTOM_PROPERTY_KEY = /^--[A-Za-z0-9_-]+$/;

export function resolveWidgetStyleVariables(
	definition: Pick<WidgetDefinition, 'style'>,
	configuration?: Record<string, unknown> | null,
): Record<string, string> {
	const vars: Record<string, string> = {};
	const setVar = (key: string, value: string) => {
		if (!UNSAFE_CSS_VALUE.test(value)) vars[key] = value;
	};
	const style = definition.style;
	if (style) {
		for (const token of style.tokens ?? []) {
			setVar(`--widget-${token.name}`, token.value);
		}
		for (const [name, value] of Object.entries(style.cssVariables ?? {})) {
			if (CSS_CUSTOM_PROPERTY_KEY.test(name)) setVar(name, value);
		}
	}
	const overrides = configuration?.styleTokens;
	if (overrides && typeof overrides === 'object') {
		for (const [name, value] of Object.entries(overrides as Record<string, unknown>)) {
			if (typeof value === 'string' && value.trim() !== '') setVar(`--widget-${name}`, value);
		}
	}
	return vars;
}
