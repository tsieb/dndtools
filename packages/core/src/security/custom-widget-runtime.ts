import type {
	WidgetDefinition,
	WidgetRuntimeKind,
	WidgetRuntimeSandbox,
	WidgetStyleCapability,
	WidgetStyleIsolation,
} from '../state/widget-package-state';
import {
	FORBIDDEN_HOST_CAPABILITIES,
	PERMISSION_GATED_CAPABILITIES,
	resolveHostCapability,
	type HostCapabilityGrant,
	type WidgetHostCapability,
} from './widget-host-api';

export const CUSTOM_WIDGET_HOST_API_VERSION = 1 as const;

export interface CustomWidgetRuntimePolicy {
	widgetType: string;
	runtime: WidgetRuntimeKind;
	sandbox: WidgetRuntimeSandbox;
	hostApiVersion: number;
	assetPath: string | null;
	styleIsolation: WidgetStyleIsolation;
	stylesheetAssetPaths: string[];
	styleCapabilities: WidgetStyleCapability[];
	exposedCapabilities: WidgetHostCapability[];
	forbiddenCapabilities: readonly WidgetHostCapability[];
	isolated: true;
	rawAppStateAvailable: false;
	rawStorageAvailable: false;
	rawIpcAvailable: false;
	requiresReview: boolean;
}

export interface CustomWidgetRuntimeIssue {
	code:
		| 'custom-runtime-missing-entrypoint'
		| 'custom-runtime-unsupported-host-api'
		| 'custom-runtime-missing-sandbox';
	message: string;
}

export interface CustomWidgetRuntimePolicyResult {
	policy: CustomWidgetRuntimePolicy;
	issues: CustomWidgetRuntimeIssue[];
}

function defaultSandbox(widget: WidgetDefinition): WidgetRuntimeSandbox {
	return widget.renderEntrypoint?.sandbox ?? 'iframe';
}

function defaultStyleIsolation(widget: WidgetDefinition): WidgetStyleIsolation {
	if (widget.style?.isolation) return widget.style.isolation;
	return widget.renderEntrypoint?.runtime === 'custom-html-js' ? 'iframe-document' : 'host-scoped';
}

export function resolveCustomWidgetRuntimePolicy(
	widget: WidgetDefinition,
	grant: HostCapabilityGrant,
): CustomWidgetRuntimePolicyResult {
	const entrypoint = widget.renderEntrypoint;
	const runtime = entrypoint?.runtime ?? 'template';
	const hostApiVersion = entrypoint?.hostApiVersion ?? CUSTOM_WIDGET_HOST_API_VERSION;
	const issues: CustomWidgetRuntimeIssue[] = [];

	if (runtime === 'custom-html-js' && !entrypoint?.assetPath) {
		issues.push({
			code: 'custom-runtime-missing-entrypoint',
			message: `Custom widget ${widget.type} must declare an entrypoint asset path.`,
		});
	}
	if (hostApiVersion > CUSTOM_WIDGET_HOST_API_VERSION) {
		issues.push({
			code: 'custom-runtime-unsupported-host-api',
			message: `Custom widget ${widget.type} requires host API v${hostApiVersion}, but this core supports v${CUSTOM_WIDGET_HOST_API_VERSION}.`,
		});
	}
	if (runtime === 'custom-html-js' && !entrypoint?.sandbox) {
		issues.push({
			code: 'custom-runtime-missing-sandbox',
			message: `Custom widget ${widget.type} did not declare a sandbox; iframe isolation will be used.`,
		});
	}

	const exposedCapabilities = Object.values(PERMISSION_GATED_CAPABILITIES).filter(
		(capability) => resolveHostCapability(widget.type, capability, grant).decision === 'available',
	);

	return {
		policy: {
			widgetType: widget.type,
			runtime,
			sandbox: defaultSandbox(widget),
			hostApiVersion,
			assetPath: entrypoint?.assetPath ?? null,
			styleIsolation: defaultStyleIsolation(widget),
			stylesheetAssetPaths: widget.style?.stylesheetAssetPaths ?? [],
			styleCapabilities: widget.style?.capabilities ?? [],
			exposedCapabilities,
			forbiddenCapabilities: FORBIDDEN_HOST_CAPABILITIES,
			isolated: true,
			rawAppStateAvailable: false,
			rawStorageAvailable: false,
			rawIpcAvailable: false,
			requiresReview: runtime === 'custom-html-js' || widget.hostPermissions.length > 0,
		},
		issues,
	};
}
