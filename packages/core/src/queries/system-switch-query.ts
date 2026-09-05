import type { SceneState } from '../state/scene-state';
import { isLiveScene } from '../state/scene-state';
import type { WidgetPackageState } from '../state/widget-package-state';
import {
	planMigration,
	type MigrationDryRunResult,
	type PersistedDocumentVersion,
} from '../migration/dry-run';
import { DURABLE_STATE_DOCUMENT_IDS, TARGET_SCHEMA_VERSIONS } from '../migration/schema-versions';
// RC-SYS-1.3 — the `system.select` dry-run half (see the appended block at the end of this module).
import type { CharacterState } from '../state/character-state';
import { characterAttributeScore } from '../state/character-state';
import type { SystemResource, SystemsState } from '../state/system-package';
import { activeSystemPackage } from '../state/system-package';

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
	/**
	 * RC-SYS-1.1 — the currently selected system, read from `systems.activeWidgetPackageId` (it used
	 * to live on the widget slice as `activeSystemPackageId`). Null when nothing is selected yet.
	 */
	activePackageId: string | null,
	persistedDocuments?: readonly PersistedDocumentVersion[],
): SystemSwitchPreviewResult {
	const target = widgets.packages[toPackageId];
	if (!target) return { kind: 'unavailable', toPackageId, reason: 'package-not-found' };
	if (target.removedAt) return { kind: 'unavailable', toPackageId, reason: 'package-removed' };
	if (!target.enabled) return { kind: 'unavailable', toPackageId, reason: 'package-disabled' };

	const fromPackageId = activePackageId;
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

// --- RC-SYS-1.3 — the SYSTEM PACKAGE select dry-run (append-only block) --------------------------

/**
 * `previewSystemSwitch` above answers "what happens to my WIDGETS", because a widget package is what
 * the pre-SystemPackage build called a system. `system.select` switches the RULES package
 * (`systems.packages`), so it needs the other half of the answer: what happens to the CHARACTERS.
 *
 * The shape mirrors the widget preview deliberately — the same keep/remap/drop vocabulary, the same
 * per-instance counts, the same `destructive`/`clean` gate — so one screen can render both halves of
 * a system change without learning two idioms.
 */
export type SystemPackageFindingCategory = 'attribute' | 'resource' | 'condition' | 'skill';

/** One rules-vocabulary mapping finding: what selecting the target package does to this key. */
export interface SystemPackageSelectFinding {
	category: SystemPackageFindingCategory;
	/** The key as the CURRENT package declares it. */
	key: string;
	/** The current package's label for it, for a screen that must name the loss in the DM's words. */
	label: string;
	/**
	 * `keep` — the target declares this key identically, nothing changes.
	 * `remap` — the target declares the key but defines it differently (relabelled, a different
	 *   resource kind/recovery, a skill hung off another attribute); character data carries over
	 *   under the target's definition.
	 * `drop` — the target does not declare the key at all; character data keyed to it stops being
	 *   readable through the system (it is NOT deleted — the character document keeps it).
	 */
	effect: 'keep' | 'remap' | 'drop';
	/** How many characters carry data under this key (the blast radius of a `drop`). */
	instanceCount: number;
	note: string;
}

export interface SystemPackageSelectPreview {
	kind: 'available';
	fromPackageId: string;
	toPackageId: string;
	findings: SystemPackageSelectFinding[];
	/** True when any `drop` finding has characters behind it (selecting would strand real data). */
	destructive: boolean;
	/** Total characters-times-keys behind the `drop` findings — the headline number for the prompt. */
	droppedInstanceCount: number;
	/** True when the select can apply without acknowledgment. */
	clean: boolean;
}

export type SystemPackageSelectUnavailableReason = 'package-not-found' | 'already-active';

export type SystemPackageSelectPreviewResult =
	| SystemPackageSelectPreview
	| {
			kind: 'unavailable';
			toPackageId: string;
			reason: SystemPackageSelectUnavailableReason;
	  };

/** Characters carrying a score for this attribute key (explicit map or the aliased fixed field). */
function attributeInstanceCount(characters: CharacterState, key: string): number {
	let count = 0;
	for (const character of Object.values(characters.characters)) {
		if (characterAttributeScore(character, key) !== undefined) count += 1;
	}
	return count;
}

/** Characters carrying a class resource under this key. Spell slots are counted for `slots` kinds. */
function resourceInstanceCount(characters: CharacterState, resource: SystemResource): number {
	let count = 0;
	for (const character of Object.values(characters.characters)) {
		const resources = character.resources;
		if (!resources) continue;
		if (resources.classResources?.[resource.key] !== undefined) {
			count += 1;
			continue;
		}
		if (resource.kind === 'slots' && Object.keys(resources.spellSlots ?? {}).length > 0) {
			count += 1;
		}
	}
	return count;
}

/** Characters currently carrying this condition (compared case-insensitively, as the UI writes it). */
function conditionInstanceCount(characters: CharacterState, key: string): number {
	const needle = key.toLowerCase();
	let count = 0;
	for (const character of Object.values(characters.characters)) {
		if (character.combat.conditions.some((entry) => entry.toLowerCase() === needle)) count += 1;
	}
	return count;
}

/** Characters with a recorded proficiency in this skill. */
function skillInstanceCount(characters: CharacterState, key: string): number {
	let count = 0;
	for (const character of Object.values(characters.characters)) {
		if (character.proficiencies?.skills?.[key] !== undefined) count += 1;
	}
	return count;
}

function finding(
	category: SystemPackageFindingCategory,
	key: string,
	label: string,
	effect: SystemPackageSelectFinding['effect'],
	instanceCount: number,
	note: string,
): SystemPackageSelectFinding {
	return { category, key, label, effect, instanceCount, note };
}

/**
 * Classify one key of the current package against the target, using `same` to decide keep vs remap.
 * `declared` is the target's definition, or undefined when the target does not declare the key.
 */
function classify<T>(
	category: SystemPackageFindingCategory,
	key: string,
	label: string,
	declared: T | undefined,
	same: (declared: T) => boolean,
	instanceCount: number,
	noun: string,
): SystemPackageSelectFinding {
	if (!declared) {
		return finding(
			category,
			key,
			label,
			'drop',
			instanceCount,
			instanceCount > 0
				? `${instanceCount} character(s) carry this ${noun}; the target system does not have it, so it stops showing on their sheet.`
				: `The target system does not have this ${noun} (no character uses it).`,
		);
	}
	if (same(declared)) {
		return finding(
			category,
			key,
			label,
			'keep',
			instanceCount,
			`The target system declares this ${noun} the same way.`,
		);
	}
	return finding(
		category,
		key,
		label,
		'remap',
		instanceCount,
		`The target system defines this ${noun} differently; existing values carry over under its definition.`,
	);
}

/**
 * The pure dry-run behind `system.select` (RC-SYS-1.3). Every attribute, resource, condition and
 * skill the ACTIVE package declares is classified against the TARGET package, with a per-key count
 * of how many characters carry data under it. Fail closed: an unknown target, or a target that is
 * already active, yields `unavailable` and the command rejects before any mutation.
 *
 * Pure + deterministic over plain state. No GUI, no storage, no clock.
 */
export function previewSystemPackageSelect(
	systems: SystemsState,
	characters: CharacterState,
	toPackageId: string,
): SystemPackageSelectPreviewResult {
	const target = systems.packages[toPackageId];
	if (!target) return { kind: 'unavailable', toPackageId, reason: 'package-not-found' };
	if (systems.activePackageId === toPackageId) {
		return { kind: 'unavailable', toPackageId, reason: 'already-active' };
	}

	const from = activeSystemPackage(systems);
	const targetAttributes = new Map(target.attributes.map((a) => [a.key, a]));
	const targetResources = new Map(target.resources.map((r) => [r.key, r]));
	const targetConditions = new Map(target.conditions.map((c) => [c.key, c]));
	const targetSkills = new Map(target.skills.map((s) => [s.key, s]));

	const findings: SystemPackageSelectFinding[] = [];
	for (const attribute of from.attributes) {
		findings.push(
			classify(
				'attribute',
				attribute.key,
				attribute.label,
				targetAttributes.get(attribute.key),
				(declared) =>
					declared.label === attribute.label &&
					declared.abbreviation === attribute.abbreviation &&
					declared.derivation.kind === attribute.derivation.kind,
				attributeInstanceCount(characters, attribute.key),
				'attribute',
			),
		);
	}
	for (const resource of from.resources) {
		findings.push(
			classify(
				'resource',
				resource.key,
				resource.label,
				targetResources.get(resource.key),
				(declared) =>
					declared.label === resource.label &&
					declared.kind === resource.kind &&
					declared.recovery === resource.recovery,
				resourceInstanceCount(characters, resource),
				'resource',
			),
		);
	}
	for (const condition of from.conditions) {
		findings.push(
			classify(
				'condition',
				condition.key,
				condition.label,
				targetConditions.get(condition.key),
				(declared) =>
					declared.label === condition.label && declared.severity === condition.severity,
				conditionInstanceCount(characters, condition.key),
				'condition',
			),
		);
	}
	for (const skill of from.skills) {
		findings.push(
			classify(
				'skill',
				skill.key,
				skill.label,
				targetSkills.get(skill.key),
				(declared) => declared.label === skill.label && declared.attribute === skill.attribute,
				skillInstanceCount(characters, skill.key),
				'skill',
			),
		);
	}

	const drops = findings.filter((entry) => entry.effect === 'drop' && entry.instanceCount > 0);
	const droppedInstanceCount = drops.reduce((total, entry) => total + entry.instanceCount, 0);
	return {
		kind: 'available',
		fromPackageId: from.id,
		toPackageId,
		findings,
		destructive: drops.length > 0,
		droppedInstanceCount,
		clean: drops.length === 0,
	};
}
