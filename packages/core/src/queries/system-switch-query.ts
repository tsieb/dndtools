import type { SceneState } from '../state/scene-state';
import { isLiveScene } from '../state/scene-state';
import type { WidgetPackageState } from '../state/widget-package-state';
import {
	planMigration,
	type MigrationDryRunResult,
	type PersistedDocumentVersion,
} from '../migration/dry-run';
import {
	DURABLE_STATE_DOCUMENT_IDS,
	TARGET_SCHEMA_VERSIONS,
} from '../migration/schema-versions';

/**
 * PURE campaign-SYSTEM-SWITCH dry-run (`previewSystemSwitch`) — the read model behind
 * `widget.package.switch-system`.
 *
 * Switching the active system package changes the rules VOCABULARY the interface reads. Two things
 * can make a switch unsafe, and this preview surfaces BOTH before anything mutates:
 *
 *   1. THE VAULT ITSELF must be migratable. The preview WRAPS the existing PLAT-008 migration
 *      dry-run (`migration/dry-run.ts` `planMigration`): a vault with an unreadable or
 *      future-version durable document BLOCKS the switch exactly like it blocks an upgrade (fail
 *      closed — a system switch never runs over a vault the build cannot safely rewrite). Callers
 *      normally pass the live document versions; the default assumes the in-memory slices (which are
 *      by construction at the current build's target versions).
 *
 *   2. THE WIDGET VOCABULARY mapping. Every widget TYPE declared by the CURRENT system package is
 *      classified against the TARGET package: `keep` (declared identically), `remap` (declared at a
 *      different version — the target package's migrations apply), or `drop` (not declared by the
 *      target — existing Scene widget instances of that type would be DISABLED by the switch). A
 *      `drop` with live instances is a DESTRUCTIVE finding: the command fails closed on it unless
 *      the DM explicitly acknowledges the loss.
 *
 * Pure + deterministic over plain state. No GUI, no storage, no clock.
 */

/** One widget-type mapping finding: what the switch keeps, remaps, or drops. */
export interface SystemSwitchFinding {
	widgetType: string;
	effect: 'keep' | 'remap' | 'drop';
	/** How many LIVE Scene widget instances of this type exist (the blast radius of a `drop`). */
	instanceCount: number;
	note: string;
}

export interface SystemSwitchPreview {
	kind: 'available';
	fromPackageId: string | null;
	toPackageId: string;
	/** The wrapped PLAT-008 vault migration dry-run. `canMigrate: false` blocks the switch. */
	vault: MigrationDryRunResult;
	findings: SystemSwitchFinding[];
	/** True when any `drop` finding has live instances (the switch would lose widget content). */
	destructive: boolean;
	/** True when the switch can apply without acknowledgment: vault migratable AND non-destructive. */
	clean: boolean;
}

export type SystemSwitchUnavailableReason =
	| 'package-not-found'
	| 'package-removed'
	| 'package-disabled'
	| 'already-active';

export type SystemSwitchPreviewResult =
	| SystemSwitchPreview
	| { kind: 'unavailable'; toPackageId: string; reason: SystemSwitchUnavailableReason };

/** The current build's document versions (every in-memory slice is at its target version). Pure. */
export function currentDocumentVersions(): PersistedDocumentVersion[] {
	return DURABLE_STATE_DOCUMENT_IDS.map((documentId) => ({
		documentId,
		schemaVersion: TARGET_SCHEMA_VERSIONS[documentId],
		present: true,
	}));
}

/** Count LIVE Scene widget instances per widget type (tombstoned scenes excluded). Pure. */
function liveInstanceCounts(scenes: SceneState): Map<string, number> {
	const counts = new Map<string, number>();
	for (const scene of Object.values(scenes.scenes)) {
		if (!isLiveScene(scene)) continue;
		for (const widget of scene.widgets) {
			counts.set(widget.type, (counts.get(widget.type) ?? 0) + 1);
		}
	}
	return counts;
}

/**
 * Compute the system-switch dry-run (see the module doc). Fail closed: an unknown, removed, or
 * disabled target package — or a target that is already active — yields `unavailable` and the
 * command rejects before any mutation.
 */
export function previewSystemSwitch(
	widgets: WidgetPackageState,
	scenes: SceneState,
	toPackageId: string,
	persistedDocuments?: readonly PersistedDocumentVersion[],
): SystemSwitchPreviewResult {
	const target = widgets.packages[toPackageId];
	if (!target) return { kind: 'unavailable', toPackageId, reason: 'package-not-found' };
	if (target.removedAt) return { kind: 'unavailable', toPackageId, reason: 'package-removed' };
	if (!target.enabled) return { kind: 'unavailable', toPackageId, reason: 'package-disabled' };

	const fromPackageId = widgets.activeSystemPackageId ?? null;
	if (fromPackageId === toPackageId) {
		return { kind: 'unavailable', toPackageId, reason: 'already-active' };
	}

	// (1) The wrapped PLAT-008 vault migration dry-run: blocking issues block the switch.
	const vault = planMigration(persistedDocuments ?? currentDocumentVersions());

	// (2) The widget-vocabulary mapping: FROM-package types classified against the TARGET package.
	const findings: SystemSwitchFinding[] = [];
	const from = fromPackageId ? widgets.packages[fromPackageId] : undefined;
	if (from && !from.removedAt) {
		const counts = liveInstanceCounts(scenes);
		const targetByType = new Map(target.package.widgets.map((w) => [w.type, w]));
		for (const widget of from.package.widgets) {
			const instanceCount = counts.get(widget.type) ?? 0;
			const declared = targetByType.get(widget.type);
			if (!declared) {
				findings.push({
					widgetType: widget.type,
					effect: 'drop',
					instanceCount,
					note:
						instanceCount > 0
							? `${instanceCount} widget instance(s) would be disabled — the target system does not declare this widget.`
							: 'The target system does not declare this widget (no live instances).',
				});
			} else if (declared.version !== widget.version) {
				findings.push({
					widgetType: widget.type,
					effect: 'remap',
					instanceCount,
					note: `Remapped ${widget.version} → ${declared.version} via the target package's declared migrations.`,
				});
			} else {
				findings.push({
					widgetType: widget.type,
					effect: 'keep',
					instanceCount,
					note: 'Declared identically by the target system.',
				});
			}
		}
	}

	const destructive = findings.some(
		(finding) => finding.effect === 'drop' && finding.instanceCount > 0,
	);
	return {
		kind: 'available',
		fromPackageId,
		toPackageId,
		vault,
		findings,
		destructive,
		clean: vault.canMigrate && !destructive,
	};
}
