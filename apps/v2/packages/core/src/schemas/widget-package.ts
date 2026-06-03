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
		targetBindingId: idSchema.optional(),
	})
	.strict();

const widgetEventDescriptorSchema = z
	.object({
		type: z.string().min(1),
		category: z.enum(['entity.changed', 'scene.changed', 'session.changed', 'permission.changed']),
	})
	.strict();

const widgetDefinitionSchema = z
	.object({
		type: z.string().min(1),
		version: z.string().min(1),
		displayName: z.string().min(1),
		author: z.string().min(1),
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
		configurationSchema: widgetDataSchemaSchema.optional(),
		runtimeStateSchema: widgetDataSchemaSchema.optional(),
		localStateSchema: widgetDataSchemaSchema.optional(),
		automationSchema: widgetDataSchemaSchema.optional(),
		capabilitySets: z.array(z.enum(['manager', 'operator', 'viewer'])).min(1),
		commands: z.array(widgetCommandDescriptorSchema),
		events: z.array(widgetEventDescriptorSchema),
		hostPermissions: z.array(widgetHostPermissionSchema),
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
					})
					.strict(),
			)
			.default([]),
		portabilityWarnings: z.array(z.string().min(1)).default([]),
	})
	.strict();

export type WidgetPackageDefinitionInput = z.input<typeof widgetPackageDefinitionSchema>;
export type WidgetPackageDefinitionParsed = z.output<typeof widgetPackageDefinitionSchema>;
