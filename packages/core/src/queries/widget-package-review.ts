import type {
	WidgetCommandDescriptor,
	WidgetDefinition,
	WidgetDiagnostic,
	WidgetHostPermission,
	WidgetNetworkDestinationClass,
	WidgetOutputDestinationClass,
	WidgetPackageDefinition,
	WidgetStyleCapability,
	WidgetStyleIsolation,
} from '../state/widget-package-state';
import { ALL_HOST_PERMISSIONS } from '../state/widget-package-state';
import {
	CUSTOM_WIDGET_HOST_API_VERSION,
	resolveCustomWidgetRuntimePolicy,
	type CustomWidgetRuntimeIssue,
} from '../security/custom-widget-runtime';

export interface WidgetPackageReviewSummary {
	packageId: string;
	displayName: string;
	trustRecommendation: 'trusted-after-review' | 'requires-review' | 'deny-until-fixed';
	customCodeWidgets: string[];
	requestedBindings: { widgetType: string; bindingId: string; label: string; modes: string[] }[];
	requestedCommands: {
		widgetType: string;
		commandType: string;
		writesTo: WidgetCommandDescriptor['writesTo'];
		destinationClass: WidgetOutputDestinationClass;
	}[];
	requestedHostPermissions: WidgetHostPermission[];
	requestedNetworkDestinations: WidgetNetworkDestinationClass[];
	requestedStyleAssets: {
		widgetType: string;
		assetPath: string;
		isolation: WidgetStyleIsolation;
	}[];
	requestedStyleCapabilities: WidgetStyleCapability[];
	playerVisibleOutputs: { widgetType: string; destinationClass: WidgetOutputDestinationClass }[];
	crossPrivilegeWriteRisks: {
		widgetType: string;
		destinationClass: WidgetOutputDestinationClass;
	}[];
	portabilityWarnings: string[];
	runtimeIssues: CustomWidgetRuntimeIssue[];
	diagnostics: WidgetDiagnostic[];
}

const LOWER_PRIVILEGE_DESTINATIONS: readonly WidgetOutputDestinationClass[] = Object.freeze([
	'player-visible-state',
	'player-scene',
	'clipboard',
	'network',
	'exported-package',
]);

function unique<T>(items: readonly T[]): T[] {
	return [...new Set(items)];
}

function commandDestination(command: WidgetCommandDescriptor): WidgetOutputDestinationClass {
	return command.destinationClass ?? command.writesTo;
}

function widgetHasCustomCode(widget: WidgetDefinition): boolean {
	return widget.renderEntrypoint?.runtime === 'custom-html-js';
}

function diagnostic(
	id: string,
	code: string,
	message: string,
	severity: WidgetDiagnostic['severity'] = 'warning',
): WidgetDiagnostic {
	return { id, code, message, severity };
}

export function buildWidgetPackageReviewSummary(
	definition: WidgetPackageDefinition,
): WidgetPackageReviewSummary {
	const customCodeWidgets = definition.widgets
		.filter(widgetHasCustomCode)
		.map((widget) => widget.type);
	const requestedHostPermissions = unique(
		definition.widgets
			.flatMap((widget) => widget.hostPermissions)
			.filter((permission) => ALL_HOST_PERMISSIONS.includes(permission)),
	);
	const requestedNetworkDestinations = unique(
		definition.widgets.flatMap((widget) => widget.networkDestinationClasses ?? []),
	);
	const requestedStyleAssets = definition.widgets.flatMap((widget) =>
		(widget.style?.stylesheetAssetPaths ?? []).map((assetPath) => ({
			widgetType: widget.type,
			assetPath,
			isolation: widget.style?.isolation ?? 'host-scoped',
		})),
	);
	const requestedStyleCapabilities = unique(
		definition.widgets.flatMap((widget) => widget.style?.capabilities ?? []),
	);
	const requestedBindings = definition.widgets.flatMap((widget) =>
		[...widget.requiredBindings, ...widget.optionalBindings].map((binding) => ({
			widgetType: widget.type,
			bindingId: binding.id,
			label: binding.label,
			modes: [binding.mode],
		})),
	);
	const requestedCommands = definition.widgets.flatMap((widget) =>
		widget.commands.map((command) => ({
			widgetType: widget.type,
			commandType: command.type,
			writesTo: command.writesTo,
			destinationClass: commandDestination(command),
		})),
	);
	const outputWrites = definition.widgets.flatMap((widget) =>
		(widget.outputWrites ?? []).map((write) => ({
			widgetType: widget.type,
			destinationClass: write.destinationClass,
		})),
	);
	const commandOutputs = requestedCommands.map((command) => ({
		widgetType: command.widgetType,
		destinationClass: command.destinationClass,
	}));
	const playerVisibleOutputs = [...outputWrites, ...commandOutputs].filter((output) =>
		LOWER_PRIVILEGE_DESTINATIONS.includes(output.destinationClass),
	);
	const runtimeIssueGroups = definition.widgets.map(
		(widget) => resolveCustomWidgetRuntimePolicy(widget, { approvedPermissions: [] }).issues,
	);
	const runtimeIssues = runtimeIssueGroups.flat();
	const diagnostics: WidgetDiagnostic[] = runtimeIssues.map((issue, index) =>
		diagnostic(`review-runtime-${index + 1}`, issue.code, issue.message, 'warning'),
	);
	if (definition.authoring?.source === 'generated') {
		diagnostics.push(
			diagnostic(
				'review-generated-package',
				'review.generated-package',
				'Generated widget packages are staged as unreviewed and require DM review before enabling.',
				'info',
			),
		);
	}

	const denyUntilFixed = runtimeIssues.some(
		(issue) =>
			issue.code === 'custom-runtime-missing-entrypoint' ||
			issue.code === 'custom-runtime-unsupported-host-api',
	);
	const requiresReview =
		customCodeWidgets.length > 0 ||
		requestedHostPermissions.length > 0 ||
		playerVisibleOutputs.length > 0 ||
		definition.authoring?.source === 'generated';

	return {
		packageId: definition.id,
		displayName: definition.displayName,
		trustRecommendation: denyUntilFixed
			? 'deny-until-fixed'
			: requiresReview
				? 'requires-review'
				: 'trusted-after-review',
		customCodeWidgets,
		requestedBindings,
		requestedCommands,
		requestedHostPermissions,
		requestedNetworkDestinations,
		requestedStyleAssets,
		requestedStyleCapabilities,
		playerVisibleOutputs,
		crossPrivilegeWriteRisks: playerVisibleOutputs,
		portabilityWarnings: definition.portabilityWarnings,
		runtimeIssues,
		diagnostics,
	};
}

export interface WidgetWizardDraft {
	state: 'unreviewed';
	provider: {
		id: string;
		kind: 'local-placeholder' | 'mcp-style';
		capabilities: string[];
	};
	package: WidgetPackageDefinition;
	review: WidgetPackageReviewSummary;
}

export function stageWidgetWizardDraft(input: {
	providerId?: string;
	providerKind?: 'local-placeholder' | 'mcp-style';
	capabilities?: readonly string[];
	package: WidgetPackageDefinition;
}): WidgetWizardDraft {
	const provider = {
		id: input.providerId ?? 'local-placeholder',
		kind: input.providerKind ?? 'local-placeholder',
		capabilities: [...(input.capabilities ?? ['structured-widget-package-draft'])],
	};
	const draftPackage: WidgetPackageDefinition = {
		...input.package,
		authoring: input.package.authoring ?? {
			source: 'generated',
			llmProvider: provider.id,
		},
	};
	return {
		state: 'unreviewed',
		provider,
		package: draftPackage,
		review: buildWidgetPackageReviewSummary(draftPackage),
	};
}

function slug(input: string): string {
	const clean = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return clean || 'custom-widget';
}

function pascalWords(input: string): string {
	return input
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

export interface ScaffoldCustomWidgetPackageDraftInput {
	packageId?: string;
	widgetType?: string;
	displayName: string;
	description?: string;
	createdBy?: string;
	llmProvider?: string;
	promptSummary?: string;
	hostPermissions?: readonly WidgetHostPermission[];
	networkDestinationClasses?: readonly WidgetNetworkDestinationClass[];
	styleIsolation?: WidgetStyleIsolation;
	styleCapabilities?: readonly WidgetStyleCapability[];
	styleTokens?: readonly { name: string; value: string; description?: string }[];
	cssVariables?: Record<string, string>;
	html?: string;
	css?: string;
	javascript?: string;
	dataQueries?: WidgetPackageDefinition['widgets'][number]['dataQueries'];
	requiredBindings?: WidgetPackageDefinition['widgets'][number]['requiredBindings'];
	commands?: WidgetPackageDefinition['widgets'][number]['commands'];
	outputWrites?: WidgetPackageDefinition['widgets'][number]['outputWrites'];
}

export function scaffoldCustomWidgetPackageDraft(
	input: ScaffoldCustomWidgetPackageDraftInput,
): WidgetWizardDraft {
	const widgetSlug = slug(input.widgetType ?? input.displayName);
	const packageId = input.packageId ?? `workspace.${widgetSlug}`;
	const widgetType = input.widgetType ?? widgetSlug;
	const displayName = pascalWords(input.displayName);
	const assetBase = `widgets/${widgetSlug}`;
	const styleTokens = [
		...(input.styleTokens ?? [
			{ name: 'accent', value: '#3b82f6', description: 'Primary accent color.' },
			{ name: 'surface', value: '#111827', description: 'Widget surface color.' },
			{ name: 'text', value: '#f9fafb', description: 'Primary text color.' },
		]),
	];
	const cssVariables = {
		...Object.fromEntries(styleTokens.map((token) => [`--widget-${token.name}`, token.value])),
		...(input.cssVariables ?? {}),
	};
	const css =
		input.css ??
		[
			':root {',
			...Object.entries(cssVariables).map(([name, value]) => `  ${name}: ${value};`),
			'}',
			'body { margin: 0; font: 14px system-ui, sans-serif; color: var(--widget-text); background: var(--widget-surface); }',
			'.widget-root { min-height: 100vh; box-sizing: border-box; padding: 12px; display: grid; gap: 8px; align-content: start; }',
			'.widget-title { margin: 0; font-size: 16px; font-weight: 650; }',
			'.widget-panel { border: 1px solid color-mix(in srgb, var(--widget-text), transparent 80%); border-radius: 8px; padding: 10px; }',
			'.widget-button { border: 0; border-radius: 6px; padding: 8px 10px; color: var(--widget-accent-foreground, var(--color-accent-foreground)); background: var(--widget-accent); }',
		].join('\n');
	const js =
		input.javascript ??
		[
			'const app = document.querySelector("[data-widget-root]");',
			'if (app) {',
			`  app.querySelector("[data-title]").textContent = ${JSON.stringify(displayName)};`,
			'  app.querySelector("[data-status]").textContent = "Ready for widget host bindings."; ',
			'}',
			'export function render(payload = {}) {',
			'  const status = app?.querySelector("[data-status]");',
			'  if (status) status.textContent = `Bindings received: ${Object.keys(payload.bindings ?? {}).length}`;',
			'}',
		].join('\n');
	const html =
		input.html ??
		[
			'<!doctype html>',
			'<html lang="en">',
			'<head>',
			'  <meta charset="utf-8" />',
			'  <meta name="viewport" content="width=device-width, initial-scale=1" />',
			'  <link rel="stylesheet" href="./styles.css" />',
			'</head>',
			'<body>',
			'  <main class="widget-root" data-widget-root>',
			'    <h1 class="widget-title" data-title></h1>',
			`    <section class="widget-panel">${input.description ?? 'Custom widget draft.'}</section>`,
			'    <button class="widget-button" type="button" data-status>Loading</button>',
			'    <script type="module" src="./main.js"></script>',
			'  </main>',
			'</body>',
			'</html>',
		].join('\n');
	const packageDefinition: WidgetPackageDefinition = {
		id: packageId,
		version: '1.0.0',
		displayName,
		authoring: {
			source: 'generated',
			createdBy: input.createdBy,
			llmProvider: input.llmProvider ?? 'local-placeholder',
			promptSummary: input.promptSummary ?? input.description,
		},
		widgets: [
			{
				type: widgetType,
				version: '1.0.0',
				displayName,
				author: 'workspace',
				renderEntrypoint: {
					runtime: 'custom-html-js',
					sandbox: 'iframe',
					assetPath: `${assetBase}/index.html`,
					hostApiVersion: CUSTOM_WIDGET_HOST_API_VERSION,
				},
				style: {
					isolation: input.styleIsolation ?? 'iframe-document',
					stylesheetAssetPaths: [`${assetBase}/styles.css`],
					capabilities: [...(input.styleCapabilities ?? ['css-variables', 'custom-stylesheet'])],
					tokens: styleTokens.map((token) => ({ ...token })),
					cssVariables,
				},
				supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
				defaultSize: { width: 360, height: 240 },
				minSize: { width: 220, height: 140 },
				resizePolicy: 'free',
				requiredBindings: [...(input.requiredBindings ?? [])],
				optionalBindings: [],
				dataQueries: input.dataQueries ? [...input.dataQueries] : [],
				outputWrites: input.outputWrites ? [...input.outputWrites] : [],
				configurationSchema: { type: 'object', additionalProperties: true },
				runtimeStateSchema: { type: 'object', additionalProperties: true },
				localStateSchema: { type: 'object', additionalProperties: true },
				capabilitySets: ['manager', 'operator', 'viewer'],
				commands: input.commands ? [...input.commands] : [],
				events: [],
				hostPermissions: [...(input.hostPermissions ?? [])],
				networkDestinationClasses: [...(input.networkDestinationClasses ?? [])],
			},
		],
		migrations: [],
		assets: [
			{ path: `${assetBase}/index.html`, kind: 'html', entrypoint: true, content: html },
			{ path: `${assetBase}/styles.css`, kind: 'css', content: css },
			{ path: `${assetBase}/main.js`, kind: 'javascript', content: js },
		],
		portabilityWarnings: [],
	};
	return stageWidgetWizardDraft({
		providerId: input.llmProvider,
		providerKind: 'local-placeholder',
		package: packageDefinition,
	});
}

export { CUSTOM_WIDGET_HOST_API_VERSION };
