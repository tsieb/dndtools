import { z } from 'zod';
import { ALL_HOST_PERMISSIONS } from '../state/widget-package-state';

const idSchema = z.string().min(1);

export const widgetHostPermissionSchema = z.enum(ALL_HOST_PERMISSIONS);

export const widgetDataSchemaSchema = z
	.object({
		type: z.literal('object'),
		required: z.array(z.string().min(1)).optional(),
		properties: z
			.record(
				z.string(),
				z.object({
					type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
				}),
			)
			.optional(),
		additionalProperties: z.boolean().optional(),
	})
	.strict();

const widgetBindingDefinitionSchema = z
	.object({
		id: idSchema,
		label: z.string().min(1),
		entityTypes: z.array(z.string().min(1)),
		mode: z.enum(['read', 'operate', 'manage', 'observe']),
		requiredCapability: z.enum(['manager', 'operator', 'viewer']),
	})
	.strict();

const widgetCommandDescriptorSchema = z
	.object({
		type: z.string().min(1),
		displayName: z.string().min(1),
		requiredCapability: z.enum(['manager', 'operator', 'viewer']),
		payloadSchema: widgetDataSchemaSchema,
		writesTo: z.enum(['scene', 'session', 'entity']),
		destinationClass: z
			.enum([
				'scene',
				'session',
				'entity',
				'player-visible-state',
				'player-scene',
				'clipboard',
				'network',
				'exported-package',
			])
			.optional(),
		targetBindingId: idSchema.optional(),
	})
	.strict();

const widgetEventDescriptorSchema = z
	.object({
		type: z.string().min(1),
		category: z.enum(['entity.changed', 'scene.changed', 'session.changed', 'permission.changed']),
	})
	.strict();

const widgetRenderEntrypointSchema = z
	.object({
		runtime: z.enum(['template', 'custom-html-js']),
		sandbox: z.enum(['iframe', 'worker']).optional(),
		template: z
			.enum([
				'data-table',
				'status-list',
				'tracker',
				'action-panel',
				'scene-message',
				'chart',
				'stat-block',
				'form-panel',
			])
			.optional(),
		assetPath: z.string().min(1).optional(),
		exportName: z.string().min(1).optional(),
		hostApiVersion: z.number().int().positive(),
	})
	.strict();

const widgetStyleDefinitionSchema = z
	.object({
		isolation: z.enum(['host-scoped', 'iframe-document', 'shadow-root']),
		stylesheetAssetPaths: z.array(z.string().min(1)).optional(),
		capabilities: z
			.array(
				z.enum([
					'css-variables',
					'custom-stylesheet',
					'responsive-layout',
					'host-theme-tokens',
					'animation',
					'custom-fonts',
				]),
			)
			.optional(),
		tokens: z
			.array(
				z
					.object({
						name: z.string().min(1),
						value: z.string(),
						description: z.string().min(1).optional(),
					})
					.strict(),
			)
			.optional(),
		cssVariables: z.record(z.string(), z.string()).optional(),
	})
	.strict();

const widgetDataQueryDefinitionSchema = z
	.object({
		id: idSchema,
		label: z.string().min(1),
		source: z.enum([
			'current-combatants',
			'visible-characters',
			'selected-scene',
			'session-state',
			'notes',
			'maps',
			'content-objects',
			'binding',
		]),
		bindingIds: z.array(idSchema).optional(),
		requiredCapability: z.enum(['manager', 'operator', 'viewer']),
		audience: z.enum(['dm', 'players', 'shared']),
	})
	.strict();

const widgetComputedFieldDefinitionSchema = z
	.object({
		id: idSchema,
		label: z.string().min(1),
		inputQueryIds: z.array(idSchema),
		valueType: z.enum(['string', 'number', 'boolean', 'object', 'array']),
	})
	.strict();

const widgetOutputWriteDefinitionSchema = z
	.object({
		id: idSchema,
		label: z.string().min(1),
		commandType: z.string().min(1),
		destinationClass: z.enum([
			'scene',
			'session',
			'entity',
			'player-visible-state',
			'player-scene',
			'clipboard',
			'network',
			'exported-package',
		]),
		payloadSchema: widgetDataSchemaSchema,
		requiresConfirmation: z.boolean().optional(),
	})
	.strict();

const widgetDefinitionSchema = z
	.object({
		type: z.string().min(1),
		version: z.string().min(1),
		displayName: z.string().min(1),
		author: z.string().min(1),
		renderEntrypoint: widgetRenderEntrypointSchema.optional(),
		style: widgetStyleDefinitionSchema.optional(),
		supportedProfiles: z.array(z.enum(['desktop', 'tablet', 'mobile', 'web'])).min(1),
		defaultSize: z
			.object({ width: z.number().finite().positive(), height: z.number().finite().positive() })
			.strict(),
		minSize: z
			.object({ width: z.number().finite().positive(), height: z.number().finite().positive() })
			.strict(),
		resizePolicy: z.enum(['fixed', 'axis-locked', 'free']),
		requiredBindings: z.array(widgetBindingDefinitionSchema),
		optionalBindings: z.array(widgetBindingDefinitionSchema),
		dataQueries: z.array(widgetDataQueryDefinitionSchema).optional(),
		computedFields: z.array(widgetComputedFieldDefinitionSchema).optional(),
		outputWrites: z.array(widgetOutputWriteDefinitionSchema).optional(),
		configurationSchema: widgetDataSchemaSchema.optional(),
		runtimeStateSchema: widgetDataSchemaSchema.optional(),
		localStateSchema: widgetDataSchemaSchema.optional(),
		automationSchema: widgetDataSchemaSchema.optional(),
		capabilitySets: z.array(z.enum(['manager', 'operator', 'viewer'])).min(1),
		commands: z.array(widgetCommandDescriptorSchema),
		events: z.array(widgetEventDescriptorSchema),
		hostPermissions: z.array(widgetHostPermissionSchema),
		networkDestinationClasses: z
			.array(z.enum(['vault-sync', 'asset-cdn', 'widget-declared', 'analytics']))
			.optional(),
	})
	.strict();

export const widgetMigrationSchema = z
	.object({
		widgetType: z.string().min(1),
		fromVersion: z.string().min(1),
		toVersion: z.string().min(1),
		renameConfigurationKeys: z.record(z.string(), z.string().min(1)).optional(),
		setConfigurationDefaults: z.record(z.string(), z.unknown()).optional(),
		failWithDiagnostic: z.string().min(1).optional(),
	})
	.strict();

export const widgetPackageDefinitionSchema = z
	.object({
		id: idSchema,
		version: z.string().min(1),
		displayName: z.string().min(1),
		widgets: z.array(widgetDefinitionSchema).min(1),
		migrations: z.array(widgetMigrationSchema).default([]),
		assets: z
			.array(
				z
					.object({
						path: z.string().min(1),
						sha256: z.string().min(1).optional(),
						kind: z.enum(['html', 'javascript', 'css', 'worker', 'module', 'asset']).optional(),
						entrypoint: z.boolean().optional(),
						content: z.string().optional(),
						contentEncoding: z.enum(['utf-8', 'base64']).optional(),
					})
					.strict(),
			)
			.default([]),
		portabilityWarnings: z.array(z.string().min(1)).default([]),
		authoring: z
			.object({
				source: z.enum(['system', 'user-authored', 'workspace', 'generated']),
				createdBy: z.string().min(1).optional(),
				createdAt: z.string().min(1).optional(),
				llmProvider: z.string().min(1).optional(),
				promptSummary: z.string().min(1).optional(),
				reviewNotes: z.array(z.string().min(1)).optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export type WidgetPackageDefinitionInput = z.input<typeof widgetPackageDefinitionSchema>;
export type WidgetPackageDefinitionParsed = z.output<typeof widgetPackageDefinitionSchema>;
