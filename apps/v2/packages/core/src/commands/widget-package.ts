import {
	disableWidgetPackageInputSchema,
	enableWidgetPackageInputSchema,
	installWidgetPackageInputSchema,
	removeWidgetPackageInputSchema,
	upgradeWidgetPackageInputSchema,
} from '../schemas/commands';
import type { WidgetPackageDefinitionParsed } from '../schemas/widget-package';
import type {
	WidgetDataSchema,
	WidgetDefinition,
	WidgetDiagnostic,
	WidgetHostPermission,
	WidgetPackageDefinition,
	WidgetPackageRecord,
	WidgetPackageState,
} from '../state/widget-package-state';
import {
	ALL_HOST_PERMISSIONS,
	findPackageRecordForWidgetType,
} from '../state/widget-package-state';
import type { Scene, WidgetDisabledState, WidgetInstance } from '../state/scene-state';
import type { CommandRejection, CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	bumpRevision,
	parseInput,
	reject,
	requireActor,
	requireDm,
	validateObjectAgainstSchema,
} from './helpers';

function diagnostic(
	env: CoreEnvironment,
	code: string,
	message: string,
	severity: WidgetDiagnostic['severity'] = 'error',
): WidgetDiagnostic {
	return { id: env.ids(), code, message, severity };
}

function validateWidgetPackageDefinition(
	env: CoreEnvironment,
	definition: WidgetPackageDefinitionParsed,
): WidgetDiagnostic[] {
	const diagnostics: WidgetDiagnostic[] = [];
	const widgetTypes = new Set<string>();
	for (const widget of definition.widgets) {
		if (widgetTypes.has(widget.type)) {
			diagnostics.push(
				diagnostic(
					env,
					'schema.duplicate-widget-type',
					`Widget type ${widget.type} is declared more than once.`,
				),
			);
		}
		widgetTypes.add(widget.type);
		if (!widget.configurationSchema) {
			diagnostics.push(
				diagnostic(
					env,
					'schema.missing-configuration-schema',
					`Widget ${widget.type} is missing a configuration schema.`,
				),
			);
		}
		for (const command of widget.commands) {
			if (
				command.targetBindingId &&
				![...widget.requiredBindings, ...widget.optionalBindings].some(
					(binding) => binding.id === command.targetBindingId,
				)
			) {
				diagnostics.push(
					diagnostic(
						env,
						'schema.command-target-binding-missing',
						`Command ${command.type} targets undeclared binding ${command.targetBindingId}.`,
					),
				);
			}
		}
	}
	for (const migration of definition.migrations) {
		if (!widgetTypes.has(migration.widgetType)) {
			diagnostics.push(
				diagnostic(
					env,
					'schema.migration-widget-missing',
					`Migration targets undeclared widget type ${migration.widgetType}.`,
				),
			);
		}
		if (migration.toVersion !== definition.version) {
			diagnostics.push(
				diagnostic(
					env,
					'schema.migration-target-version-mismatch',
					`Migration for ${migration.widgetType} does not target package version ${definition.version}.`,
				),
			);
		}
	}
	return diagnostics;
}

function normalizeDefinition(definition: WidgetPackageDefinitionParsed): WidgetPackageDefinition {
	return {
		...definition,
		widgets: definition.widgets.map((widget) => ({
			...widget,
			author: widget.author,
			configurationSchema: widget.configurationSchema as WidgetDataSchema,
		})) as WidgetDefinition[],
	};
}

// Newly installed packages are unreviewed, so every host permission starts denied and
// fails closed until an explicit trust review approves it.
function deniedHostPermissions(): Record<WidgetHostPermission, 'approved' | 'denied'> {
	return Object.fromEntries(
		ALL_HOST_PERMISSIONS.map((permission) => [permission, 'denied']),
	) as Record<WidgetHostPermission, 'approved' | 'denied'>;
}

function recordFromPackage(
	env: CoreEnvironment,
	actorId: string,
	definition: WidgetPackageDefinition,
	diagnostics: WidgetDiagnostic[],
): WidgetPackageRecord {
	const now = env.clock();
	return {
		package: definition,
		trust: {
			state: 'unreviewed',
			hostPermissions: deniedHostPermissions(),
			reviewedBy: actorId,
			reviewedAt: now,
		},
		enabled: false,
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
		diagnostics,
	};
}

function updatePackage(
	state: WidgetPackageState,
	packageId: string,
	updater: (record: WidgetPackageRecord) => WidgetPackageRecord,
): WidgetPackageState {
	const record = state.packages[packageId];
	if (!record) return state;
	return {
		...state,
		packages: { ...state.packages, [packageId]: updater(record) },
	};
}

function requirePackage(
	state: CoreStateSlice,
	packageId: string,
): WidgetPackageRecord | CommandRejection {
	const record = state.widgets.packages[packageId];
	if (!record) {
		return { code: 'package-not-found', message: `Widget package ${packageId} is not installed.` };
	}
	return record;
}

function sceneContainsPackageWidget(scene: Scene, packageRecord: WidgetPackageRecord): boolean {
	const types = new Set(packageRecord.package.widgets.map((widget) => widget.type));
	return scene.widgets.some((widget) => types.has(widget.type));
}

function disabledState(
	env: CoreEnvironment,
	reason: WidgetDisabledState['reason'],
	packageId: string | null,
	message: string,
	diagnosticId: string | null,
	previousVersion: string | null,
): WidgetDisabledState {
	return {
		reason,
		packageId,
		diagnosticId,
		message,
		previousVersion,
		disabledAt: env.clock(),
	};
}

function markPackageWidgetsDisabled(
	scenes: CoreStateSlice['scenes'],
	env: CoreEnvironment,
	packageRecord: WidgetPackageRecord,
	state: WidgetDisabledState,
): CoreStateSlice['scenes'] {
	const types = new Set(packageRecord.package.widgets.map((widget) => widget.type));
	const nextScenes = { ...scenes.scenes };
	for (const scene of Object.values(scenes.scenes)) {
		if (!sceneContainsPackageWidget(scene, packageRecord)) continue;
		nextScenes[scene.id] = bumpRevision(
			{
				...scene,
				widgets: scene.widgets.map((widget) =>
					types.has(widget.type) ? { ...widget, disabled: state } : widget,
				),
			},
			env,
		);
	}
	return { ...scenes, scenes: nextScenes };
}

function applyMigration(
	widget: WidgetInstance,
	targetDefinition: WidgetPackageDefinition,
): { ok: true; widget: WidgetInstance } | { ok: false; message: string } {
	const migration = targetDefinition.migrations.find(
		(candidate) =>
			candidate.widgetType === widget.type &&
			candidate.fromVersion === widget.version &&
			candidate.toVersion === targetDefinition.version,
	);
	if (!migration) {
		return {
			ok: false,
			message: `No migration from ${widget.version} to ${targetDefinition.version} for ${widget.type}.`,
		};
	}
	if (migration.failWithDiagnostic) {
		return { ok: false, message: migration.failWithDiagnostic };
	}
	const nextConfig: Record<string, unknown> = { ...widget.configuration };
	for (const [from, to] of Object.entries(migration.renameConfigurationKeys ?? {})) {
		if (from in nextConfig) {
			nextConfig[to] = nextConfig[from];
			delete nextConfig[from];
		}
	}
	for (const [key, value] of Object.entries(migration.setConfigurationDefaults ?? {})) {
		if (!(key in nextConfig)) nextConfig[key] = value;
	}
	const definition = targetDefinition.widgets.find((candidate) => candidate.type === widget.type);
	if (!definition) return { ok: false, message: `Definition for ${widget.type} is missing.` };
	const issues = validateObjectAgainstSchema(definition.configurationSchema, nextConfig);
	if (issues.length > 0) {
		return {
			ok: false,
			message: issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
		};
	}
	return {
		ok: true,
		widget: {
			...widget,
			version: targetDefinition.version,
			configuration: nextConfig,
			disabled: null,
		},
	};
}

export function handleInstallWidgetPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(installWidgetPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const installed = state.widgets.packages[parsed.data.package.id];
	if (installed && !installed.removedAt) {
		// Re-installing over a live package would silently reset its trust, enabled flag, and
		// revision, disabling every existing instance. Updates must go through upgrade.
		return reject(
			{
				code: 'invalid-state',
				message: `Widget package ${parsed.data.package.id} is already installed. Use widget.package.upgrade to update it.`,
			},
			state,
		);
	}

	const diagnostics = validateWidgetPackageDefinition(env, parsed.data.package);
	if (diagnostics.some((item) => item.severity === 'error')) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'Widget package failed schema validation.',
				issues: diagnostics.map((item) => ({ path: item.code, message: item.message })),
			},
			state,
		);
	}

	const definition = normalizeDefinition(parsed.data.package);
	const record = recordFromPackage(env, actor.id, definition, diagnostics);
	const nextWidgets: WidgetPackageState = {
		...state.widgets,
		packages: { ...state.widgets.packages, [definition.id]: record },
	};
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'widget-package',
		entityId: definition.id,
		opType: 'widget.package.install',
		value: { packageId: definition.id, version: definition.version },
		beforeRevision: 0,
		afterRevision: record.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...state, widgets: nextWidgets, sync: nextLog },
		events: [{ kind: 'widget.package-installed', packageId: definition.id, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export function handleEnableWidgetPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(enableWidgetPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const existing = requirePackage(state, parsed.data.packageId);
	if ('code' in existing) return reject(existing, state);
	if (existing.removedAt) {
		return reject(
			{ code: 'package-disabled', message: `Widget package ${parsed.data.packageId} was removed.` },
			state,
		);
	}
	const now = env.clock();
	const nextWidgets = updatePackage(state.widgets, parsed.data.packageId, (record) => ({
		...record,
		enabled: true,
		updatedAt: now,
		revision: record.revision + 1,
	}));
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'widget-package',
		entityId: parsed.data.packageId,
		opType: 'widget.package.enable',
		value: { packageId: parsed.data.packageId },
		beforeRevision: existing.revision,
		afterRevision: existing.revision + 1,
	});
	return {
		status: 'accepted',
		nextState: { ...state, widgets: nextWidgets, sync: nextLog },
		events: [
			{ kind: 'widget.package-enabled', packageId: parsed.data.packageId, actorId: actor.id },
		],
		operationIds: [op.id],
	};
}

export function handleDisableWidgetPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(disableWidgetPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const existing = requirePackage(state, parsed.data.packageId);
	if ('code' in existing) return reject(existing, state);
	const now = env.clock();
	const nextWidgets = updatePackage(state.widgets, parsed.data.packageId, (record) => ({
		...record,
		enabled: false,
		updatedAt: now,
		revision: record.revision + 1,
	}));
	const nextScenes = markPackageWidgetsDisabled(
		state.scenes,
		env,
		existing,
		disabledState(
			env,
			'package-disabled',
			parsed.data.packageId,
			parsed.data.reason,
			null,
			existing.package.version,
		),
	);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'widget-package',
		entityId: parsed.data.packageId,
		opType: 'widget.package.disable',
		value: { packageId: parsed.data.packageId, reason: parsed.data.reason },
		beforeRevision: existing.revision,
		afterRevision: existing.revision + 1,
	});
	return {
		status: 'accepted',
		nextState: { ...state, widgets: nextWidgets, scenes: nextScenes, sync: nextLog },
		events: [
			{ kind: 'widget.package-disabled', packageId: parsed.data.packageId, actorId: actor.id },
		],
		operationIds: [op.id],
	};
}

export function handleRemoveWidgetPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(removeWidgetPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const existing = requirePackage(state, parsed.data.packageId);
	if ('code' in existing) return reject(existing, state);
	const now = env.clock();
	const nextWidgets = updatePackage(state.widgets, parsed.data.packageId, (record) => ({
		...record,
		enabled: false,
		removedAt: now,
		updatedAt: now,
		revision: record.revision + 1,
	}));
	const nextScenes = markPackageWidgetsDisabled(
		state.scenes,
		env,
		existing,
		disabledState(
			env,
			'package-removed',
			parsed.data.packageId,
			'Package was removed; widget instance is a disabled placeholder.',
			null,
			existing.package.version,
		),
	);
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'widget-package',
		entityId: parsed.data.packageId,
		opType: 'widget.package.remove',
		value: { packageId: parsed.data.packageId },
		beforeRevision: existing.revision,
		afterRevision: existing.revision + 1,
	});
	return {
		status: 'accepted',
		nextState: { ...state, widgets: nextWidgets, scenes: nextScenes, sync: nextLog },
		events: [
			{ kind: 'widget.package-removed', packageId: parsed.data.packageId, actorId: actor.id },
		],
		operationIds: [op.id],
	};
}

export function handleUpgradeWidgetPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(upgradeWidgetPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const existing = requirePackage(state, parsed.data.package.id);
	if ('code' in existing) return reject(existing, state);

	const diagnostics = validateWidgetPackageDefinition(env, parsed.data.package);
	if (diagnostics.some((item) => item.severity === 'error')) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'Widget package update failed schema validation.',
				issues: diagnostics.map((item) => ({ path: item.code, message: item.message })),
			},
			state,
		);
	}

	const definition = normalizeDefinition(parsed.data.package);
	const targetTypes = new Set(definition.widgets.map((widget) => widget.type));
	const nextScenes = { ...state.scenes.scenes };
	const migrationDiagnostics: WidgetDiagnostic[] = [];
	let failed = false;
	for (const scene of Object.values(state.scenes.scenes)) {
		let changed = false;
		const widgets = scene.widgets.map((widget) => {
			if (!targetTypes.has(widget.type)) return widget;
			if (widget.version === definition.version) return widget;
			const migrated = applyMigration(widget, definition);
			changed = true;
			if (migrated.ok) return migrated.widget;
			failed = true;
			const item = diagnostic(
				env,
				'migration.failed',
				`${widget.type} ${widget.id}: ${migrated.message}`,
			);
			migrationDiagnostics.push(item);
			return {
				...widget,
				disabled: disabledState(
					env,
					'migration-failed',
					definition.id,
					migrated.message,
					item.id,
					widget.version,
				),
			};
		});
		if (changed) nextScenes[scene.id] = bumpRevision({ ...scene, widgets }, env);
	}
	const now = env.clock();
	const nextWidgets = updatePackage(state.widgets, definition.id, (record) => ({
		...record,
		package: definition,
		enabled: !failed,
		removedAt: null,
		updatedAt: now,
		revision: record.revision + 1,
		migrationStatus: {
			state: failed ? 'failed' : 'migrated',
			fromVersion: existing.package.version,
			toVersion: definition.version,
			diagnostics: migrationDiagnostics,
		},
		diagnostics: [...diagnostics, ...migrationDiagnostics],
	}));
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'widget-package',
		entityId: definition.id,
		opType: 'widget.package.upgrade',
		value: {
			packageId: definition.id,
			fromVersion: existing.package.version,
			toVersion: definition.version,
		},
		beforeRevision: existing.revision,
		afterRevision: existing.revision + 1,
	});
	return {
		status: 'accepted',
		nextState: {
			...state,
			widgets: nextWidgets,
			scenes: { ...state.scenes, scenes: nextScenes },
			sync: nextLog,
		},
		events: [{ kind: 'widget.package-upgraded', packageId: definition.id, actorId: actor.id }],
		operationIds: [op.id],
	};
}

export interface WidgetPackageExport {
	package: WidgetPackageDefinition;
	trust: WidgetPackageRecord['trust'];
	migrationStatus: WidgetPackageRecord['migrationStatus'];
	portabilityDiagnostics: WidgetDiagnostic[];
}

function isDeviceLocalPath(assetPath: string): boolean {
	return assetPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(assetPath);
}

export function exportWidgetPackage(
	state: WidgetPackageState,
	env: Pick<CoreEnvironment, 'ids'>,
	packageId: string,
): WidgetPackageExport | { kind: 'missing'; reason: string } {
	const record = state.packages[packageId];
	if (!record || record.removedAt) {
		return { kind: 'missing', reason: 'package-not-found' };
	}
	const portabilityDiagnostics: WidgetDiagnostic[] = [];
	const assets = record.package.assets.filter((asset) => {
		if (!isDeviceLocalPath(asset.path)) return true;
		portabilityDiagnostics.push({
			id: env.ids(),
			code: 'portability.device-local-asset-path',
			message: `Device-local asset path ${asset.path} was excluded from export.`,
			severity: 'warning',
		});
		return false;
	});
	return {
		package: {
			...record.package,
			assets,
			portabilityWarnings: [
				...record.package.portabilityWarnings,
				...portabilityDiagnostics.map((item) => item.message),
			],
		},
		trust: record.trust,
		migrationStatus: record.migrationStatus,
		portabilityDiagnostics,
	};
}

export function getPackageRecordForWidgetType(
	state: WidgetPackageState,
	widgetType: string,
): WidgetPackageRecord | undefined {
	return findPackageRecordForWidgetType(state, widgetType);
}
