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
export type WidgetRuntimeKind = 'template' | 'custom-html-js';
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
	additionalProperties: true,
});

function systemWidget(type: string, displayName: string): WidgetDefinition {
	return {
		type,
		version: '1.0.0',
		displayName,
		author: 'system',
		supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
		defaultSize: { width: 240, height: 160 },
		minSize: { width: 120, height: 80 },
		resizePolicy: 'free',
		requiredBindings: [],
		optionalBindings: [],
		configurationSchema: EMPTY_OBJECT_SCHEMA,
		capabilitySets: ['manager', 'operator', 'viewer'],
		commands: [],
		events: [],
		hostPermissions: [],
	};
}

/**
 * An entity-backed system widget declares the one data binding it needs to render
 * (Contract 4: Widget Data Contract). The widget library surfaces these required
 * bindings so the DM can see what a widget needs before adding it (CMD-005).
 */
function entityBackedWidget(
	type: string,
	displayName: string,
	binding: { id: string; label: string; entityType: string },
): WidgetDefinition {
	return {
		...systemWidget(type, displayName),
		requiredBindings: [
			{
				id: binding.id,
				label: binding.label,
				entityTypes: [binding.entityType],
				mode: 'read',
				requiredCapability: 'viewer',
			},
		],
	};
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
	const timerWidget: WidgetDefinition = {
		...systemWidget('timer', 'Timer'),
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
	const packages: WidgetPackageDefinition[] = [
		{
			id: 'system.scene-widgets',
			version: '1.0.0',
			displayName: 'System Scene Widgets',
			widgets: [
				// `note` stays binding-free: a note widget may render an ad-hoc/quick note,
				// and only binds a stored note on demand.
				systemWidget('note', 'Note'),
				entityBackedWidget('map', 'Map', { id: 'map', label: 'Map', entityType: 'map' }),
				entityBackedWidget('character', 'Character', {
					id: 'character',
					label: 'Character',
					entityType: 'character',
				}),
				systemWidget('dice', 'Dice'),
				systemWidget('initiative-tracker', 'Initiative Tracker'),
				timerWidget,
				systemWidget('audio', 'Audio'),
				// SES-004 — a handout is delivered as a Scene widget. It references the handout BY ID through
				// its configuration (never a content clone — Contract 4 embed/projection). Binding-free; the
				// actor-filtered handout read decides which sections each recipient may see.
				systemWidget('handout', 'Handout'),
				systemWidget('quick-reference', 'Quick Reference'),
				systemWidget('prep', 'Prep'),
			],
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
	return {
		schemaVersion: WIDGET_PACKAGE_STATE_SCHEMA_VERSION,
		packages: { ...SYSTEM_WIDGET_PACKAGE_STATE.packages, ...state.packages },
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
