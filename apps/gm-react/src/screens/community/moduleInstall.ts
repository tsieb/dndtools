import {
	MODULE_BUNDLE_FORMAT,
	contentModuleImportFiles,
	importSystemPackageFromBundle,
	moduleBundleItemCount,
	parseModuleBundle,
	type ModuleBundle,
	type ModuleKind,
	type SystemPackage,
	type SystemsState,
	type WidgetPackageDefinition,
} from '@dndtools/core';

/**
 * RC-CLD-4.1 — turn a fetched marketplace payload into an INSTALL PLAN: what the module is, what it
 * would add, and which review flow it runs.
 *
 * Pure and fail-closed. The marketplace serves two shapes: a `.dndmodule` bundle (any of the four
 * listing kinds) and, for listings published before the format existed, a bare widget-package
 * definition. Anything else is `not-a-module` — the screen says so rather than dispatching a guess.
 * A kind with no installer in this release resolves to `unsupported` so the screen can state why
 * instead of offering a button that would fail.
 */

export type InstallPlan =
	| {
			kind: 'widget-package';
			bundle: ModuleBundle | null;
			definition: WidgetPackageDefinition;
			itemCount: number;
	  }
	| { kind: 'content-module'; bundle: ModuleBundle; files: Array<{ path: string; text: string }> }
	| {
			kind: 'system-package';
			bundle: ModuleBundle;
			/** The package as it would be DEFINED — re-homed into `custom:` under a free id. */
			systemPackage: SystemPackage;
			/** The id the file carried, when the install id differs from it. */
			sourcePackageId: string;
			rehomed: boolean;
	  }
	| { kind: 'unsupported'; bundle: ModuleBundle }
	| { kind: 'not-a-module'; reason: string };

function isBundleEnvelope(payload: unknown): boolean {
	return (
		typeof payload === 'object' &&
		payload !== null &&
		(payload as { format?: unknown }).format === MODULE_BUNDLE_FORMAT
	);
}

function widgetPlan(definition: unknown, bundle: ModuleBundle | null, reason: string): InstallPlan {
	const def = definition as WidgetPackageDefinition | null;
	if (!def || typeof def !== 'object' || typeof def.id !== 'string' || !def.id)
		return { kind: 'not-a-module', reason };
	return {
		kind: 'widget-package',
		bundle,
		definition: def,
		itemCount: Array.isArray(def.widgets) ? def.widgets.length : 0,
	};
}

/**
 * RC-SYS-3.4 — a system package is planned against the campaign's INSTALLED systems, because the
 * import re-homes it: a built-in id, or an id the vault already has, would be refused by
 * `system.define` (authoring is confined to `custom:`, and an install adds a system rather than
 * overwriting one). The dialog then shows the id it will really land under.
 */
export function planModuleInstall(
	payload: unknown,
	notAPackageReason: string,
	systems: Pick<SystemsState, 'packages'> = { packages: {} },
): InstallPlan {
	if (!isBundleEnvelope(payload)) return widgetPlan(payload, null, notAPackageReason);
	const parsed = parseModuleBundle(payload);
	if (!parsed.ok) return { kind: 'not-a-module', reason: parsed.reason };
	const bundle = parsed.bundle;
	switch (bundle.manifest.kind) {
		case 'widget-package':
			return widgetPlan(bundle.payload, bundle, notAPackageReason);
		case 'content-module':
			return { kind: 'content-module', bundle, files: contentModuleImportFiles(bundle) };
		case 'system-package': {
			const imported = importSystemPackageFromBundle(bundle, systems);
			if (!imported.ok) return { kind: 'not-a-module', reason: imported.reason };
			return {
				kind: 'system-package',
				bundle,
				systemPackage: imported.import.package,
				sourcePackageId: imported.import.sourcePackageId,
				rehomed: imported.import.rehomed,
			};
		}
		case 'scene-package':
			return { kind: 'unsupported', bundle };
	}
}

/** How many things the plan would add, for the review dialog's honest count. */
export function installPlanItemCount(plan: InstallPlan): number {
	switch (plan.kind) {
		case 'widget-package':
			return plan.itemCount;
		case 'content-module':
			return plan.files.length;
		case 'system-package':
			return 1;
		case 'unsupported':
			return moduleBundleItemCount(plan.bundle);
		case 'not-a-module':
			return 0;
	}
}

/** The listing kind a plan installs as, or null when it is not installable. */
export function installPlanKind(plan: InstallPlan): ModuleKind | null {
	return plan.kind === 'not-a-module'
		? null
		: plan.kind === 'unsupported'
			? 'scene-package'
			: plan.kind;
}

/** The core command an install plan dispatches, and the payload it carries. */
export interface InstallCommand {
	type:
		| 'widget.package.install'
		| 'widget.package.upgrade'
		| 'system.define'
		| 'content.commit-import';
	payload: Record<string, unknown>;
}

/**
 * The command a plan installs through — one place, so the marketplace install and the local
 * `.dndmodule` file install can never drift into two different review flows. Null when the plan has
 * no installer in this release (fail closed: the screen says why instead of dispatching a guess).
 */
export function installPlanCommand(
	plan: InstallPlan,
	options: { isUpgrade?: boolean } = {},
): InstallCommand | null {
	switch (plan.kind) {
		case 'widget-package':
			return {
				type: options.isUpgrade ? 'widget.package.upgrade' : 'widget.package.install',
				payload: { package: plan.definition },
			};
		case 'system-package':
			return { type: 'system.define', payload: { package: plan.systemPackage } };
		case 'content-module':
			// The SAME transactional, resumable import the Knowledge screen runs. `skip` is the
			// non-destructive policy: an installed module never overwrites a DM's own note.
			return {
				type: 'content.commit-import',
				payload: {
					sourceKind: 'markdown-archive',
					policy: 'skip',
					files: plan.files,
					appliedEntryIds: [],
				},
			};
		case 'unsupported':
		case 'not-a-module':
			return null;
	}
}
