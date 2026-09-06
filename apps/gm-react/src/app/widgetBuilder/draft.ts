import {
	CUSTOM_WIDGET_HOST_API_VERSION,
	type PlatformProfileId,
	type WidgetBindingDefinition,
	type WidgetCommandDescriptor,
	type WidgetComputedFieldDefinition,
	type WidgetConfigField,
	type WidgetDataQueryDefinition,
	type WidgetDataSchema,
	type WidgetDefinition,
	type WidgetHostPermission,
	type WidgetMigration,
	type WidgetPackageDefinition,
	type WidgetStyleCapability,
	type WidgetStyleIsolation,
	type WidgetStyleTokenDefinition,
	type WidgetSurface,
	type WidgetTemplateKind,
	isValidFormula,
	widgetFormulaIdentifiers,
	widgetQueryFormulaIdentifier,
} from '@dndtools/core';

/**
 * The widget builder's draft model (RC-WID-2.1) — the whole of the builder that is not React.
 *
 * The stepper edits ONE plain object. `buildPackage` turns it into the real
 * `WidgetPackageDefinition` the Review step dispatches through `widget.package.install` /
 * `widget.package.upgrade`, and `readPackage` turns an installed package back into a draft so
 * "edit an existing widget" is the same screen. Both directions are pure and framework-free, so the
 * round trip and every validation rule is unit-tested without a DOM (`draft.test.ts`).
 *
 * Nothing here writes state. The core still decides whether a package is acceptable: `buildPackage`
 * produces a candidate, the install/upgrade command validates it, and the Review step prints the
 * core's own rejection rather than pre-judging it. `validateDraft` exists only so the builder can
 * point at the step that needs attention BEFORE a dispatch, never instead of one.
 */

export const STEP_IDS = [
	'identity',
	'layout',
	'data',
	'config',
	'commands',
	'style',
	'advanced',
	'review',
] as const;

export type BuilderStepId = (typeof STEP_IDS)[number];

export const STEP_LABEL: Record<BuilderStepId, string> = {
	identity: 'Identity',
	layout: 'Layout',
	data: 'Data',
	config: 'Config fields',
	commands: 'Commands',
	style: 'Style',
	advanced: 'Advanced',
	review: 'Review',
};

/** Where a widget prefers to sit on a surface that docks widgets. See `buildPackage`. */
export type DockPreference = 'canvas' | 'left' | 'right' | 'bottom';

export const DOCK_PREFERENCE_LABEL: Record<DockPreference, string> = {
	canvas: 'Free on the canvas',
	left: 'Left dock',
	right: 'Right dock',
	bottom: 'Bottom dock',
};

/** The config-field key the Layout step's dock preference is declared under. */
export const DOCK_PREFERENCE_KEY = 'dockPreference';

export interface WidgetDraft {
	/* Identity */
	packageId: string;
	typeId: string;
	name: string;
	description: string;
	category: string;
	icon: string;
	version: string;
	surfaces: WidgetSurface[];
	libraryListed: boolean;
	supportedProfiles: PlatformProfileId[];
	/* Layout */
	defaultSize: { width: number; height: number };
	minSize: { width: number; height: number };
	resizePolicy: 'fixed' | 'axis-locked' | 'free';
	dockPreference: DockPreference;
	/* Data */
	template: WidgetTemplateKind;
	dataQueries: WidgetDataQueryDefinition[];
	computedFields: WidgetComputedFieldDefinition[];
	requiredBindings: WidgetBindingDefinition[];
	optionalBindings: WidgetBindingDefinition[];
	/* Config fields + commands */
	configFields: WidgetConfigField[];
	commands: WidgetCommandDescriptor[];
	/* Style */
	styleTokens: WidgetStyleTokenDefinition[];
	styleIsolation: WidgetStyleIsolation;
	styleCapabilities: WidgetStyleCapability[];
	/* Advanced */
	hostPermissions: WidgetHostPermission[];
	portabilityWarnings: string[];
	/* Provenance of the package this draft was read from, when it is an edit rather than a new one. */
	baseVersion: string | null;
	baseConfigKeys: string[];
}

/** Slug rules for a package id and a widget type id: lowercase words, `-` or `.` separated. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

export function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9.]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^[-.]+|[-.]+$/g, '');
}

/** Bump the patch component. Used when the builder opens an installed package for editing. */
export function bumpPatch(version: string): string {
	const match = SEMVER_PATTERN.exec(version);
	if (!match) return version;
	const [major, minor, patch] = version.split('.').map((part) => Number.parseInt(part, 10));
	return `${major}.${minor}.${(patch ?? 0) + 1}`;
}

export function emptyDraft(): WidgetDraft {
	return {
		packageId: '',
		typeId: '',
		name: '',
		description: '',
		category: 'Custom',
		icon: 'widget',
		version: '1.0.0',
		surfaces: ['scene'],
		libraryListed: true,
		supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
		defaultSize: { width: 360, height: 260 },
		minSize: { width: 220, height: 160 },
		resizePolicy: 'free',
		dockPreference: 'canvas',
		template: 'status-list',
		dataQueries: [],
		computedFields: [],
		requiredBindings: [],
		optionalBindings: [],
		configFields: [],
		commands: [],
		styleTokens: [],
		styleIsolation: 'host-scoped',
		styleCapabilities: ['css-variables', 'host-theme-tokens'],
		hostPermissions: [],
		portabilityWarnings: [],
		baseVersion: null,
		baseConfigKeys: [],
	};
}

/** The JSON-schema `type` a declared config control stores. */
function schemaTypeFor(control: WidgetConfigField['control']): 'string' | 'number' | 'boolean' {
	if (control === 'number') return 'number';
	if (control === 'toggle') return 'boolean';
	return 'string';
}

function configurationSchemaFor(fields: WidgetConfigField[]): WidgetDataSchema {
	const properties: Record<string, { type: 'string' | 'number' | 'boolean' }> = {};
	for (const field of fields) properties[field.key] = { type: schemaTypeFor(field.control) };
	return {
		type: 'object',
		properties,
		// Open on purpose: a placed instance also carries the host's own instance settings (title,
		// visibility) in the same record, and `scene.add-widget` validates the whole record against
		// this schema. Declared keys are still type-checked; undeclared ones are not rejected.
		additionalProperties: true,
	};
}

/** The dock preference, expressed as a declared display config field so it round-trips. */
function dockPreferenceField(preference: DockPreference): WidgetConfigField {
	return {
		key: DOCK_PREFERENCE_KEY,
		label: 'Dock preference',
		control: 'select',
		group: 'display',
		default: preference,
		help: 'Where this widget prefers to sit on a surface that docks widgets.',
		options: (Object.keys(DOCK_PREFERENCE_LABEL) as DockPreference[]).map((value) => ({
			value,
			label: DOCK_PREFERENCE_LABEL[value],
		})),
	};
}

/** Every config key the built definition declares, in declaration order. */
export function draftConfigKeys(draft: WidgetDraft): string[] {
	return buildWidgetDefinition(draft).configFields?.map((field) => field.key) ?? [];
}

function buildWidgetDefinition(draft: WidgetDraft): WidgetDefinition {
	const configFields = [
		...draft.configFields.filter((field) => field.key !== DOCK_PREFERENCE_KEY),
		dockPreferenceField(draft.dockPreference),
	];
	const definition: WidgetDefinition = {
		type: draft.typeId,
		// Locked to the package version on purpose: `scene.add-widget` requires an instance to be
		// created at the definition's version, and `applyMigration` matches an instance's version
		// against the PACKAGE version. Letting the two drift is how a placed widget becomes
		// unmigratable.
		version: draft.version,
		displayName: draft.name,
		author: 'user',
		category: draft.category || undefined,
		description: draft.description || undefined,
		icon: draft.icon || undefined,
		placement: { surfaces: [...draft.surfaces], libraryListed: draft.libraryListed },
		configFields,
		renderEntrypoint: {
			runtime: 'template',
			template: draft.template,
			hostApiVersion: CUSTOM_WIDGET_HOST_API_VERSION,
		},
		style: {
			isolation: draft.styleIsolation,
			capabilities: [...draft.styleCapabilities],
			tokens: draft.styleTokens.map((token) => ({ ...token })),
			cssVariables: Object.fromEntries(
				draft.styleTokens.map((token) => [`--widget-${token.name}`, token.value]),
			),
		},
		supportedProfiles: [...draft.supportedProfiles],
		defaultSize: { ...draft.defaultSize },
		minSize: { ...draft.minSize },
		resizePolicy: draft.resizePolicy,
		requiredBindings: draft.requiredBindings.map((binding) => ({ ...binding })),
		optionalBindings: draft.optionalBindings.map((binding) => ({ ...binding })),
		dataQueries: draft.dataQueries.map((query) => ({ ...query })),
		computedFields: draft.computedFields.map((field) => ({ ...field })),
		configurationSchema: configurationSchemaFor(configFields),
		capabilitySets: ['manager', 'operator', 'viewer'],
		commands: draft.commands.map((command) => ({ ...command })),
		events: [],
		hostPermissions: [...draft.hostPermissions],
	};
	return definition;
}

/**
 * The migration carried when an edit changes the version.
 *
 * The core disables every placed instance it cannot migrate, so a migration is emitted for ANY
 * version change, not only for a renamed key: without one, upgrading a widget that gained a single
 * option would silently pause every copy already on a scene. Added keys get their declared default
 * so an existing instance keeps working; a key that disappeared is left alone, because the
 * configuration schema stays open and dropping the value would lose the DM's typing.
 */
export function generateMigration(draft: WidgetDraft): WidgetMigration | null {
	if (!draft.baseVersion || draft.baseVersion === draft.version) return null;
	const fields = buildWidgetDefinition(draft).configFields ?? [];
	const added = fields.filter(
		(field) => !draft.baseConfigKeys.includes(field.key) && field.default !== undefined,
	);
	const migration: WidgetMigration = {
		widgetType: draft.typeId,
		fromVersion: draft.baseVersion,
		toVersion: draft.version,
	};
	if (added.length > 0) {
		migration.setConfigurationDefaults = Object.fromEntries(
			added.map((field) => [field.key, field.default]),
		);
	}
	return migration;
}

/**
 * Build the package this draft describes. `previousMigrations` carries the installed package's own
 * migration history forward, so an instance placed two versions ago still has a path.
 */
export function buildPackage(
	draft: WidgetDraft,
	previousMigrations: WidgetMigration[] = [],
): WidgetPackageDefinition {
	const migration = generateMigration(draft);
	const migrations = [...previousMigrations];
	if (migration) {
		const index = migrations.findIndex(
			(candidate) =>
				candidate.widgetType === migration.widgetType &&
				candidate.fromVersion === migration.fromVersion &&
				candidate.toVersion === migration.toVersion,
		);
		if (index >= 0) migrations[index] = migration;
		else migrations.push(migration);
	}
	return {
		id: draft.packageId,
		version: draft.version,
		displayName: draft.name,
		widgets: [buildWidgetDefinition(draft)],
		// A migration that does not target the package version is rejected by the installer, so a
		// carried-forward entry from an older version is dropped rather than shipped broken.
		migrations: migrations.filter((entry) => entry.toVersion === draft.version),
		assets: [],
		portabilityWarnings: [...draft.portabilityWarnings],
		authoring: { source: 'user-authored', createdBy: 'widget-builder' },
	};
}

/** Read an installed package back into a draft, so editing one is the same screen as building one. */
export function readPackage(pkg: WidgetPackageDefinition): WidgetDraft {
	const base = emptyDraft();
	const widget = pkg.widgets[0];
	if (!widget) return { ...base, packageId: pkg.id, name: pkg.displayName };
	const dock = widget.configFields?.find((field) => field.key === DOCK_PREFERENCE_KEY);
	const dockValue = typeof dock?.default === 'string' ? (dock.default as DockPreference) : 'canvas';
	return {
		...base,
		packageId: pkg.id,
		typeId: widget.type,
		name: widget.displayName,
		description: widget.description ?? '',
		category: widget.category ?? '',
		icon: widget.icon ?? 'widget',
		version: bumpPatch(pkg.version),
		surfaces: [...(widget.placement?.surfaces ?? base.surfaces)],
		libraryListed: widget.placement?.libraryListed ?? true,
		supportedProfiles: [...widget.supportedProfiles],
		defaultSize: { ...widget.defaultSize },
		minSize: { ...widget.minSize },
		resizePolicy: widget.resizePolicy,
		dockPreference: dockValue in DOCK_PREFERENCE_LABEL ? dockValue : 'canvas',
		template: widget.renderEntrypoint?.template ?? base.template,
		dataQueries: (widget.dataQueries ?? []).map((query) => ({ ...query })),
		computedFields: (widget.computedFields ?? []).map((field) => ({ ...field })),
		requiredBindings: widget.requiredBindings.map((binding) => ({ ...binding })),
		optionalBindings: widget.optionalBindings.map((binding) => ({ ...binding })),
		configFields: (widget.configFields ?? [])
			.filter((field) => field.key !== DOCK_PREFERENCE_KEY)
			.map((field) => ({ ...field })),
		commands: widget.commands.map((command) => ({ ...command })),
		styleTokens: (widget.style?.tokens ?? []).map((token) => ({ ...token })),
		styleIsolation: widget.style?.isolation ?? base.styleIsolation,
		styleCapabilities: [...(widget.style?.capabilities ?? base.styleCapabilities)],
		hostPermissions: [...widget.hostPermissions],
		portabilityWarnings: [...pkg.portabilityWarnings],
		baseVersion: pkg.version,
		baseConfigKeys: (widget.configFields ?? []).map((field) => field.key),
	};
}

export interface DraftIssue {
	step: BuilderStepId;
	field: string;
	message: string;
}

/**
 * Problems the builder can name before dispatching. Deliberately narrow: it covers what the DM can
 * fix in a step, and leaves everything else to the core's own validation on Review.
 */
export function validateDraft(draft: WidgetDraft): DraftIssue[] {
	const issues: DraftIssue[] = [];
	const add = (step: BuilderStepId, field: string, message: string) =>
		issues.push({ step, field, message });

	if (!draft.name.trim()) add('identity', 'name', 'Give the widget a name.');
	if (!draft.packageId) add('identity', 'packageId', 'Give the package an id.');
	else if (!SLUG_PATTERN.test(draft.packageId))
		add(
			'identity',
			'packageId',
			'Use lowercase letters, numbers, dots and hyphens, for example workspace.party-status.',
		);
	if (!draft.typeId) add('identity', 'typeId', 'Give the widget a type id.');
	else if (!SLUG_PATTERN.test(draft.typeId))
		add(
			'identity',
			'typeId',
			'Use lowercase letters, numbers, dots and hyphens, for example party-status.',
		);
	if (!SEMVER_PATTERN.test(draft.version))
		add('identity', 'version', 'Use a three-part version, for example 1.0.0.');
	if (draft.surfaces.length === 0) add('identity', 'surfaces', 'Choose at least one surface.');
	if (draft.supportedProfiles.length === 0)
		add('identity', 'supportedProfiles', 'Choose at least one device profile.');

	for (const axis of ['width', 'height'] as const) {
		if (draft.defaultSize[axis] <= 0)
			add('layout', `defaultSize.${axis}`, `Default ${axis} must be greater than zero.`);
		if (draft.minSize[axis] <= 0)
			add('layout', `minSize.${axis}`, `Minimum ${axis} must be greater than zero.`);
		if (draft.minSize[axis] > draft.defaultSize[axis])
			add(
				'layout',
				`minSize.${axis}`,
				`Minimum ${axis} cannot be larger than the default ${axis}.`,
			);
	}

	const bindingIds = new Set<string>();
	for (const binding of [...draft.requiredBindings, ...draft.optionalBindings]) {
		if (!binding.id) add('data', 'bindings', 'Every binding needs an id.');
		else if (bindingIds.has(binding.id))
			add('data', 'bindings', `Binding ${binding.id} is declared more than once.`);
		else if (!SLUG_PATTERN.test(binding.id))
			add(
				'data',
				'bindings',
				`Binding id ${binding.id} must be lowercase words joined by hyphens.`,
			);
		bindingIds.add(binding.id);
		if (binding.entityTypes.length === 0)
			add(
				'data',
				'bindings',
				`Binding ${binding.id || 'without an id'} needs at least one entity type.`,
			);
	}

	const queryIds = new Set<string>();
	// Two ids that differ only in punctuation fold to ONE formula identifier, so a formula naming it
	// would silently read the wrong query. Caught here rather than surprising the author at render.
	const identifierOwners = new Map<string, string>();
	for (const query of draft.dataQueries) {
		if (!query.id) add('data', 'dataQueries', 'Every data query needs an id.');
		else if (queryIds.has(query.id))
			add('data', 'dataQueries', `Data query ${query.id} is declared more than once.`);
		queryIds.add(query.id);
		if (query.source === 'binding') {
			for (const id of query.bindingIds ?? []) {
				if (!bindingIds.has(id))
					add(
						'data',
						'dataQueries',
						`Data query ${query.id} reads a binding that is not declared.`,
					);
			}
		}
		const identifier = widgetQueryFormulaIdentifier(query.id, 'count');
		const owner = identifierOwners.get(identifier);
		if (owner !== undefined && owner !== query.id)
			add(
				'data',
				'dataQueries',
				`Data queries ${owner} and ${query.id} would share one name in a formula. Make the ids differ by more than punctuation.`,
			);
		else identifierOwners.set(identifier, query.id);
	}

	const identifiers = widgetFormulaIdentifiers(draft.dataQueries);
	for (const field of draft.computedFields) {
		for (const inputId of field.inputQueryIds) {
			if (!queryIds.has(inputId))
				add('data', 'computedFields', `Computed field ${field.id} reads a query that is gone.`);
		}
		if (field.formula !== undefined && field.valueType === 'number') {
			if (!field.formula.trim())
				add('data', 'computedFields', `Computed field ${field.id} has an empty formula.`);
			else if (!isValidFormula(field.formula, identifiers))
				add(
					'data',
					'computedFields',
					`Computed field ${field.id} has a formula that cannot be read. Use the names listed under the formula.`,
				);
		}
	}

	const configKeys = new Set<string>();
	for (const field of draft.configFields) {
		if (!field.key) add('config', 'configFields', 'Every config field needs a key.');
		else if (configKeys.has(field.key))
			add('config', 'configFields', `Config key ${field.key} is declared more than once.`);
		configKeys.add(field.key);
	}

	const commandTypes = new Set<string>();
	for (const command of draft.commands) {
		if (!command.type) add('commands', 'commands', 'Every command needs a type.');
		else if (commandTypes.has(command.type))
			add('commands', 'commands', `Command ${command.type} is declared more than once.`);
		commandTypes.add(command.type);
	}

	const tokenNames = new Set<string>();
	for (const token of draft.styleTokens) {
		if (!token.name) add('style', 'styleTokens', 'Every style token needs a name.');
		else if (tokenNames.has(token.name))
			add('style', 'styleTokens', `Style token ${token.name} is declared more than once.`);
		tokenNames.add(token.name);
	}

	return issues;
}

/** The first step with an unresolved issue, so "Review" can send the DM back to the right place. */
export function firstBlockedStep(issues: DraftIssue[]): BuilderStepId | null {
	for (const step of STEP_IDS) {
		if (issues.some((issue) => issue.step === step)) return step;
	}
	return null;
}
