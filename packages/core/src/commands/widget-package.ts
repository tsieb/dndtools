import {
	disableWidgetPackageInputSchema,
	enableWidgetPackageInputSchema,
	installWidgetPackageInputSchema,
	removeWidgetPackageInputSchema,
	// RC-WID-1.5 — the DM's trust decision for an installed package.
	reviewWidgetPackageInputSchema,
	switchSystemPackageInputSchema,
	upgradeWidgetPackageInputSchema,
} from '../schemas/commands';
import { previewSystemSwitch } from '../queries/system-switch-query';
import { buildWidgetPackageReviewSummary } from '../queries/widget-package-review';
import type { WidgetPackageDefinitionParsed } from '../schemas/widget-package';
import type {
	WidgetDataSchema,
	WidgetDefinition,
	WidgetDiagnostic,
	WidgetHostPermission,
	WidgetHostPermissionDecision,
	WidgetPackageDefinition,
	WidgetPackageRecord,
	WidgetPackageState,
} from '../state/widget-package-state';
import {
	ALL_HOST_PERMISSIONS,
	findPackageRecordForWidgetType,
} from '../state/widget-package-state';
import type { SystemsState } from '../state/system-package';
import { resolveCustomWidgetRuntimePolicy } from '../security/custom-widget-runtime';
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
	const assetPaths = new Set(definition.assets.map((asset) => asset.path));
	const assetKindByPath = new Map(definition.assets.map((asset) => [asset.path, asset.kind]));
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
		// SEC — the `builtin` render runtime resolves to a privileged FIRST-PARTY app component by
		// export name (the host's own Session/Tools/Map/… widgets). It is reserved for the in-code
		// system packages, which are constructed directly and never pass through this installer. An
		// installed/imported (i.e. untrusted) package declaring `builtin` could otherwise puppet
		// first-party UI by name, so reject it here — both install and upgrade run this validation.
		if (widget.renderEntrypoint?.runtime === 'builtin') {
			diagnostics.push(
				diagnostic(
					env,
					'schema.builtin-runtime-reserved',
					`Widget ${widget.type} declares the built-in render runtime, which is reserved for first-party system widgets. Use the template or custom-html-js runtime instead.`,
				),
			);
		}
		const bindingIds = new Set(
			[...widget.requiredBindings, ...widget.optionalBindings].map((binding) => binding.id),
		);
		const queryIds = new Set((widget.dataQueries ?? []).map((query) => query.id));
		const commandTypes = new Set(widget.commands.map((command) => command.type));
		const runtimePolicy = resolveCustomWidgetRuntimePolicy(widget as WidgetDefinition, {
			approvedPermissions: [],
		});
		for (const issue of runtimePolicy.issues) {
			diagnostics.push(
				diagnostic(
					env,
					issue.code,
					issue.message,
					issue.code === 'custom-runtime-missing-sandbox' ? 'warning' : 'error',
				),
			);
		}
		if (widget.renderEntrypoint?.assetPath && !assetPaths.has(widget.renderEntrypoint.assetPath)) {
			diagnostics.push(
				diagnostic(
					env,
					'schema.render-entrypoint-asset-missing',
					`Widget ${widget.type} references undeclared entrypoint asset ${widget.renderEntrypoint.assetPath}.`,
				),
			);
		}
		const styleTokenNames = new Set<string>();
		for (const token of widget.style?.tokens ?? []) {
			if (styleTokenNames.has(token.name)) {
				diagnostics.push(
					diagnostic(
						env,
						'schema.style-token-duplicate',
						`Widget ${widget.type} declares style token ${token.name} more than once.`,
					),
				);
			}
			styleTokenNames.add(token.name);
		}
		for (const assetPath of widget.style?.stylesheetAssetPaths ?? []) {
			if (!assetPaths.has(assetPath)) {
				diagnostics.push(
					diagnostic(
						env,
						'schema.stylesheet-asset-missing',
						`Widget ${widget.type} references undeclared stylesheet asset ${assetPath}.`,
					),
				);
			} else if (assetKindByPath.get(assetPath) !== 'css') {
				diagnostics.push(
					diagnostic(
						env,
						'schema.stylesheet-asset-kind',
						`Widget ${widget.type} stylesheet asset ${assetPath} must be declared with kind "css".`,
					),
				);
			}
		}
		if (!widget.configurationSchema) {
			diagnostics.push(
				diagnostic(
					env,
					'schema.missing-configuration-schema',
					`Widget ${widget.type} is missing a configuration schema.`,
				),
			);
		}
		for (const query of widget.dataQueries ?? []) {
			for (const bindingId of query.bindingIds ?? []) {
				if (!bindingIds.has(bindingId)) {
					diagnostics.push(
						diagnostic(
							env,
							'schema.query-binding-missing',
							`Data query ${query.id} references undeclared binding ${bindingId}.`,
						),
					);
				}
			}
		}
		for (const field of widget.computedFields ?? []) {
			for (const queryId of field.inputQueryIds) {
				if (!queryIds.has(queryId)) {
					diagnostics.push(
						diagnostic(
							env,
							'schema.computed-field-query-missing',
							`Computed field ${field.id} references undeclared data query ${queryId}.`,
						),
					);
				}
			}
		}
		for (const write of widget.outputWrites ?? []) {
			if (!commandTypes.has(write.commandType)) {
				diagnostics.push(
					diagnostic(
						env,
						'schema.output-write-command-missing',
						`Output write ${write.id} references undeclared command ${write.commandType}.`,
					),
				);
			}
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
	// RC-WID-1.5 — a package the DM reviewed and DENIED cannot be re-enabled from the package list;
	// the denial has to be reversed by a new review first. Fail closed, and never silently.
	if (existing.trust.state === 'denied') {
		return reject(
			{
				code: 'invalid-state',
				message: `Widget package ${parsed.data.packageId} was denied in review. Review it again before enabling it.`,
			},
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

/**
 * SWITCH the active campaign SYSTEM PACKAGE (DM-only). The handler re-runs the PURE dry-run
 * (`queries/system-switch-query.ts` `previewSystemSwitch`, which wraps the PLAT-008 vault-migration
 * dry-run) and applies the switch ONLY when it is safe, fail-closed:
 *
 *   - An unknown / removed / disabled target package is rejected before any mutation.
 *   - A vault the dry-run cannot migrate (blocking document issues) is rejected (`invalid-state`).
 *   - A DESTRUCTIVE switch (the dry-run reports widget types the target does not declare, with live
 *     Scene instances) is rejected `system-switch-loss-unacknowledged` UNLESS the DM explicitly
 *     acknowledged the loss (`acknowledgeLoss: true`) — never a silent loss.
 *
 * APPLY = (1) point `systems.activeWidgetPackageId` at the target package, and (2) perform the
 * mapping the dry-run planned: instances of DROPPED widget types are marked disabled placeholders
 * (recoverable — the instance record is preserved, exactly like a package disable). `keep`/`remap`
 * types need no instance mutation here: instance config migration is owned by the target package's
 * declared migrations on upgrade (the same seam `widget.package.upgrade` uses).
 *
 * Idempotent: switching to the already-active package is a no-op success with no op.
 */
export function handleSwitchSystemPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(switchSystemPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const preview = previewSystemSwitch(
		state.widgets,
		state.scenes,
		parsed.data.packageId,
		state.systems.activeWidgetPackageId,
	);
	if (preview.kind === 'unavailable') {
		if (preview.reason === 'already-active') {
			// Idempotent: re-selecting the active system is a no-op success (mirrors pause-of-paused).
			return { status: 'accepted', nextState: state, events: [], operationIds: [] };
		}
		if (preview.reason === 'package-not-found') {
			return reject(
				{
					code: 'package-not-found',
					message: `Widget package ${parsed.data.packageId} is not installed.`,
				},
				state,
			);
		}
		return reject(
			{
				code: 'package-disabled',
				message: `Widget package ${parsed.data.packageId} is ${preview.reason === 'package-removed' ? 'removed' : 'disabled'}; enable it before switching.`,
			},
			state,
		);
	}

	// (1) The vault must be migratable (the wrapped PLAT-008 dry-run) — fail closed on blockers.
	if (!preview.vault.canMigrate) {
		return reject(
			{
				code: 'invalid-state',
				message: 'The vault cannot be safely migrated, so the system switch is blocked.',
				issues: preview.vault.blockingIssues.map((issue) => ({
					path: issue.documentId,
					message: issue.message,
				})),
			},
			state,
		);
	}

	// (2) A destructive switch requires the DM's explicit acknowledgment (never a silent loss).
	const drops = preview.findings.filter(
		(finding) => finding.effect === 'drop' && finding.instanceCount > 0,
	);
	if (drops.length > 0 && !parsed.data.acknowledgeLoss) {
		return reject(
			{
				code: 'system-switch-loss-unacknowledged',
				message:
					'Switching systems would disable widget content. Re-run with acknowledgeLoss after reviewing the dry-run.',
				issues: drops.map((finding) => ({ path: finding.widgetType, message: finding.note })),
			},
			state,
		);
	}

	const now = env.clock();
	const previousPackageId = state.systems.activeWidgetPackageId;

	// APPLY the planned mapping: instances of dropped types become disabled placeholders (recoverable).
	const droppedTypes = new Set(drops.map((finding) => finding.widgetType));
	let nextScenes = state.scenes;
	let disabledWidgetCount = 0;
	if (droppedTypes.size > 0) {
		const nextSceneMap = { ...state.scenes.scenes };
		for (const scene of Object.values(state.scenes.scenes)) {
			if (!scene.widgets.some((widget) => droppedTypes.has(widget.type))) continue;
			nextSceneMap[scene.id] = bumpRevision(
				{
					...scene,
					widgets: scene.widgets.map((widget) => {
						if (!droppedTypes.has(widget.type)) return widget;
						disabledWidgetCount += 1;
						return {
							...widget,
							disabled: disabledState(
								env,
								'package-disabled',
								previousPackageId,
								`Disabled by the system switch to ${parsed.data.packageId}: the target system does not declare this widget.`,
								null,
								widget.version,
							),
						};
					}),
				},
				env,
			);
		}
		nextScenes = { ...state.scenes, scenes: nextSceneMap };
	}

	// RC-SYS-1.1: the active system now lives in the `systems` document, not the widget slice.
	const nextSystems: SystemsState = {
		...state.systems,
		activeWidgetPackageId: parsed.data.packageId,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'widget-package',
		entityId: parsed.data.packageId,
		opType: 'widget.package.switch-system',
		path: 'activeWidgetPackageId',
		value: {
			packageId: parsed.data.packageId,
			previousPackageId,
			acknowledgedLoss: parsed.data.acknowledgeLoss,
			droppedWidgetTypes: [...droppedTypes].sort(),
			disabledWidgetCount,
			appliedAt: now,
		},
	});

	return {
		status: 'accepted',
		nextState: { ...state, systems: nextSystems, scenes: nextScenes, sync: nextLog },
		events: [
			{
				kind: 'widget.system-switched',
				packageId: parsed.data.packageId,
				previousPackageId,
				disabledWidgetCount,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

/* ── RC-WID-1.5 — WIDGET PACKAGE TRUST REVIEW ────────────────────────────────────────────────── */

/**
 * RECORD the DM's trust review of an installed widget package (DM-only).
 *
 * An installed package starts `unreviewed` with every host permission denied
 * (`deniedHostPermissions`), and the sandbox host answers `requestPermission` from exactly these
 * decisions — so this command is the ONLY way a third-party widget ever gets a capability.
 *
 * The decision is taken against the pure analysis in `queries/widget-package-review.ts`
 * (`buildWidgetPackageReviewSummary`), which the review sheet shows the DM. Fail closed:
 *
 *   - Only a permission the package actually REQUESTS can be approved. Approving one it never asked
 *     for is rejected `invalid-payload`, so a stale sheet (or a later upgrade that starts asking)
 *     can never carry a pre-granted capability.
 *   - A permission the payload omits keeps its current decision, so an omission never widens access.
 *   - Trusting a package whose summary recommends `deny-until-fixed` requires
 *     `acknowledgeRecommendation: true`; without it the command is rejected
 *     `review-recommendation-unacknowledged`. Denying never needs an acknowledgment — that is the
 *     safe direction.
 *   - A `denied` verdict forces every permission back to denied, disables the package, and marks its
 *     placed widgets as disabled placeholders (recoverable, exactly like `widget.package.disable`).
 */
export function handleReviewWidgetPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(reviewWidgetPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const existing = requirePackage(state, parsed.data.packageId);
	if ('code' in existing) return reject(existing, state);
	if (existing.removedAt) {
		return reject(
			{
				code: 'package-disabled',
				message: `Widget package ${parsed.data.packageId} was removed, so it cannot be reviewed.`,
			},
			state,
		);
	}

	const summary = buildWidgetPackageReviewSummary(existing.package);
	const trustState = parsed.data.trustState;
	const decisions = parsed.data.hostPermissions as Partial<
		Record<WidgetHostPermission, WidgetHostPermissionDecision>
	>;

	// Only a REQUESTED permission can be approved — an approval for a permission the package never
	// asked for is meaningless today and would be a pre-granted capability tomorrow.
	const requested = new Set(summary.requestedHostPermissions);
	const unrequested = (Object.entries(decisions) as [WidgetHostPermission, string][])
		.filter(([permission, decision]) => decision === 'approved' && !requested.has(permission))
		.map(([permission]) => permission);
	if (unrequested.length > 0) {
		return reject(
			{
				code: 'invalid-payload',
				message: `Widget package ${parsed.data.packageId} does not request every permission this review approves.`,
				issues: unrequested.map((permission) => ({
					path: permission,
					message: `The package does not request the ${permission} permission.`,
				})),
			},
			state,
		);
	}

	if (
		trustState === 'trusted' &&
		summary.trustRecommendation === 'deny-until-fixed' &&
		!parsed.data.acknowledgeRecommendation
	) {
		return reject(
			{
				code: 'review-recommendation-unacknowledged',
				message:
					'The review recommends denying this package until it is fixed. Acknowledge that recommendation to trust it anyway.',
				issues: summary.runtimeIssues.map((issue) => ({
					path: issue.code,
					message: issue.message,
				})),
			},
			state,
		);
	}

	const nextPermissions = { ...existing.trust.hostPermissions };
	for (const permission of ALL_HOST_PERMISSIONS) {
		const decision = decisions[permission];
		if (trustState === 'denied') {
			nextPermissions[permission] = 'denied';
		} else if (decision) {
			nextPermissions[permission] = decision;
		}
	}
	const approvedPermissions = ALL_HOST_PERMISSIONS.filter(
		(permission) => nextPermissions[permission] === 'approved',
	);

	const now = env.clock();
	const nextWidgets = updatePackage(state.widgets, parsed.data.packageId, (record) => ({
		...record,
		trust: {
			state: trustState,
			hostPermissions: nextPermissions,
			reviewedBy: actor.id,
			reviewedAt: now,
		},
		enabled: trustState === 'denied' ? false : record.enabled,
		updatedAt: now,
		revision: record.revision + 1,
	}));
	const nextScenes =
		trustState === 'denied'
			? markPackageWidgetsDisabled(
					state.scenes,
					env,
					existing,
					disabledState(
						env,
						'package-disabled',
						parsed.data.packageId,
						'Denied in review; the widget is a disabled placeholder until it is trusted.',
						null,
						existing.package.version,
					),
				)
			: state.scenes;

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'widget-package',
		entityId: parsed.data.packageId,
		opType: 'widget.package.review',
		path: 'trust',
		value: {
			packageId: parsed.data.packageId,
			trustState,
			approvedPermissions,
			recommendation: summary.trustRecommendation,
			acknowledgedRecommendation: parsed.data.acknowledgeRecommendation,
			note: parsed.data.note ?? null,
			reviewedAt: now,
		},
		beforeRevision: existing.revision,
		afterRevision: existing.revision + 1,
	});

	return {
		status: 'accepted',
		nextState: {
			...state,
			widgets: nextWidgets,
			scenes: nextScenes,
			sync: nextLog,
		},
		events: [
			{
				kind: 'widget.package-reviewed',
				packageId: parsed.data.packageId,
				actorId: actor.id,
				trustState,
				approvedPermissions,
			},
		],
		operationIds: [op.id],
	};
}
