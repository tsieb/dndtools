/**
 * RC-SYS-1.3 — the SYSTEM PACKAGE commands: `system.select`, `system.define`, `system.update`,
 * `system.delete`, `system.fork`.
 *
 * The rules system a campaign plays is DM-authored durable state on the `systems` slice, so every
 * handler here gates on DM authority (Contract 1: no screen writes state, and a player never
 * re-authors the rules) and every handler fails closed:
 *
 *   - AUTHORING is confined to the `custom:` id namespace (ADR-023's rule, applied to systems). The
 *     built-in packages ship with the BUILD, not the vault — `hydrateSystemsState` re-seeds them from
 *     code on every load — so a define/update/delete that touched one would be silently reverted at
 *     the next hydrate. Rejecting is the honest answer; `system.fork` is the sanctioned way to base a
 *     homebrew on 5e or Generic.
 *   - VALIDATION is the same `.strict()` `systemPackageSchema` the slice persists, so a package that
 *     could not survive a round-trip can never enter the vault in the first place.
 *   - SELECT runs the pure `previewSystemPackageSelect` dry-run and refuses to strand character data:
 *     when the target system drops an attribute, resource, condition or skill that characters carry,
 *     the DM must send `acknowledgeLoss` after reading the preview.
 *   - DELETE is refused while the package is active, and refused while any character carries a
 *     resource it defines, so a delete never orphans a sheet.
 *
 * Every mutation appends one operation to the log and emits one `system.changed` event carrying the
 * mutation kind, so replay and the audit read identically. Pure over `(state, env, actorId, payload)`.
 */
import {
	defineSystemPackageInputSchema,
	deleteSystemPackageInputSchema,
	forkSystemPackageInputSchema,
	selectSystemPackageInputSchema,
	updateSystemPackageInputSchema,
} from '../schemas/commands';
import { systemPackageSchema } from '../schemas/system-package';
import { previewSystemPackageSelect } from '../queries/system-switch-query';
import { isValidSemver } from '../queries/publish-checklist';
import { buildModuleBundle } from '../state/module-bundle';
import type { ModuleBundle, ModuleBundleParseResult } from '../state/module-bundle';
import type { SystemPackage, SystemsState } from '../state/system-package';
import { cloneSystemPackage } from '../state/system-package';
import type { CharacterState } from '../state/character-state';
import type { CommandRejection, CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * The DM-authorable id namespace, mirroring `CUSTOM_OBJECT_TYPE_ID_PATTERN` (ADR-023). The colon is
 * impossible in a built-in package id, so the two namespaces can never overlap.
 */
export const CUSTOM_SYSTEM_PACKAGE_ID_PATTERN = /^custom:[a-z0-9](?:-?[a-z0-9]){0,48}$/;

/** The op-log entity type every system-package mutation records under. */
const SYSTEM_PACKAGE_ENTITY_TYPE = 'system-package';

/** The op type each mutation records, kept explicit so the log reads back as the command name. */
const OP_TYPE_BY_MUTATION = {
	selected: 'system.select',
	defined: 'system.define',
	updated: 'system.update',
	deleted: 'system.delete',
	forked: 'system.fork',
} as const;

/** How a `system.changed` event describes what happened. */
export type SystemChangeMutation = 'selected' | 'defined' | 'updated' | 'deleted' | 'forked';

/**
 * Mint a `custom:` id from a generated one. The environment's id generator is free to emit any shape
 * (a uuid, a sequential test id, a host id), so it is folded to the namespace's alphabet here rather
 * than trusted — a fork must never fail because the host names its ids differently.
 */
function mintForkId(generatedId: string): string {
	const slug = generatedId
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 49)
		.replace(/^-+|-+$/g, '');
	return `custom:${slug.length > 0 ? slug : 'system'}`;
}

function requireCustomNamespace(packageId: string, verb: string): CommandRejection | null {
	if (CUSTOM_SYSTEM_PACKAGE_ID_PATTERN.test(packageId)) return null;
	return {
		code: 'invalid-payload',
		message: `Only a DM-authored system can be ${verb}. Its id must look like "custom:my-system" (lowercase letters, digits, single hyphens); fork a built-in system to base one on it.`,
		issues: [{ path: 'packageId', message: `${packageId} is not in the custom namespace.` }],
	};
}

/** Which characters carry a class resource this package defines (the delete guard's evidence). */
function charactersUsingPackageResources(
	characters: CharacterState,
	pkg: SystemPackage,
): { resourceKey: string; characterCount: number }[] {
	const used: { resourceKey: string; characterCount: number }[] = [];
	for (const resource of pkg.resources) {
		let characterCount = 0;
		for (const character of Object.values(characters.characters)) {
			if (character.resources?.classResources?.[resource.key] !== undefined) characterCount += 1;
		}
		if (characterCount > 0) used.push({ resourceKey: resource.key, characterCount });
	}
	return used;
}

/** Commit one package mutation: write the slice, append the op, emit `system.changed`. */
function commit(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	mutation: SystemChangeMutation,
	packageId: string,
	nextSystems: SystemsState,
	value: Record<string, unknown>,
): CommandResult {
	const { log, op } = appendOperationDraft(env, state.sync, actorId, {
		entityType: SYSTEM_PACKAGE_ENTITY_TYPE,
		entityId: packageId,
		opType: OP_TYPE_BY_MUTATION[mutation],
		path: mutation === 'selected' ? 'activePackageId' : `packages.${packageId}`,
		value: { ...value, mutation, appliedAt: env.clock() },
	});
	return {
		status: 'accepted',
		nextState: { ...state, systems: nextSystems, sync: log },
		events: [
			{
				kind: 'system.changed',
				mutation,
				packageId,
				activePackageId: nextSystems.activePackageId,
				actorId,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * `system.select` — point the campaign at another installed rules system (DM-only).
 *
 * Runs `previewSystemPackageSelect` first and applies only when the dry-run is clean or the DM has
 * acknowledged its drops. Selecting the already-active system is an idempotent no-op success.
 */
export function handleSelectSystemPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(selectSystemPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const preview = previewSystemPackageSelect(
		state.systems,
		state.characters,
		parsed.data.packageId,
	);
	if (preview.kind === 'unavailable') {
		if (preview.reason === 'already-active') {
			return { status: 'accepted', nextState: state, events: [], operationIds: [] };
		}
		return reject(
			{
				code: 'package-not-found',
				message: `System ${parsed.data.packageId} is not installed.`,
			},
			state,
		);
	}

	if (preview.destructive && !parsed.data.acknowledgeLoss) {
		const drops = preview.findings.filter(
			(entry) => entry.effect === 'drop' && entry.instanceCount > 0,
		);
		return reject(
			{
				code: 'system-select-loss-unacknowledged',
				message: `Switching to this system drops ${preview.droppedInstanceCount} piece(s) of character data. Review the preview, then select again with acknowledgeLoss.`,
				issues: drops.map((entry) => ({
					path: `${entry.category}.${entry.key}`,
					message: entry.note,
				})),
			},
			state,
		);
	}

	const previousPackageId = state.systems.activePackageId;
	return commit(
		state,
		env,
		actor.id,
		'selected',
		parsed.data.packageId,
		{ ...state.systems, activePackageId: parsed.data.packageId },
		{
			packageId: parsed.data.packageId,
			previousPackageId,
			acknowledgedLoss: parsed.data.acknowledgeLoss,
			droppedInstanceCount: preview.droppedInstanceCount,
		},
	);
}

/** `system.define` — install a new DM-authored system in the `custom:` namespace (DM-only). */
export function handleDefineSystemPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(defineSystemPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const pkg = parsed.data.package as SystemPackage;
	const namespaceCheck = requireCustomNamespace(pkg.id, 'defined');
	if (namespaceCheck) return reject(namespaceCheck, state);
	if (state.systems.packages[pkg.id]) {
		return reject(
			{
				code: 'system-package-exists',
				message: `System ${pkg.id} already exists. Update it, or fork it under a new id.`,
			},
			state,
		);
	}

	const stored = cloneSystemPackage(pkg);
	return commit(
		state,
		env,
		actor.id,
		'defined',
		stored.id,
		{
			...state.systems,
			packages: { ...state.systems.packages, [stored.id]: stored },
		},
		{ packageId: stored.id, displayName: stored.displayName, version: stored.version },
	);
}

/** `system.update` — replace a DM-authored system's body whole (DM-only). Renaming the id is refused. */
export function handleUpdateSystemPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(updateSystemPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const { packageId } = parsed.data;
	const pkg = parsed.data.package as SystemPackage;
	const namespaceCheck = requireCustomNamespace(packageId, 'updated');
	if (namespaceCheck) return reject(namespaceCheck, state);
	if (!state.systems.packages[packageId]) {
		return reject(
			{ code: 'package-not-found', message: `System ${packageId} is not installed.` },
			state,
		);
	}
	if (pkg.id !== packageId) {
		return reject(
			{
				code: 'invalid-payload',
				message: 'A system keeps its id for its whole life. Fork it to create one under a new id.',
				issues: [{ path: 'package.id', message: `${pkg.id} does not match ${packageId}.` }],
			},
			state,
		);
	}

	const stored = cloneSystemPackage(pkg);
	return commit(
		state,
		env,
		actor.id,
		'updated',
		packageId,
		{ ...state.systems, packages: { ...state.systems.packages, [packageId]: stored } },
		{ packageId, displayName: stored.displayName, version: stored.version },
	);
}

/** `system.delete` — remove a DM-authored system (DM-only), refused while active or still in use. */
export function handleDeleteSystemPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(deleteSystemPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const { packageId } = parsed.data;
	const namespaceCheck = requireCustomNamespace(packageId, 'deleted');
	if (namespaceCheck) return reject(namespaceCheck, state);
	const existing = state.systems.packages[packageId];
	if (!existing) {
		return reject(
			{ code: 'package-not-found', message: `System ${packageId} is not installed.` },
			state,
		);
	}
	if (state.systems.activePackageId === packageId) {
		return reject(
			{
				code: 'invalid-state',
				message: 'This is the system the campaign is playing. Select another system first.',
			},
			state,
		);
	}
	const inUse = charactersUsingPackageResources(state.characters, existing);
	if (inUse.length > 0) {
		return reject(
			{
				code: 'invalid-state',
				message:
					'Characters still carry resources this system defines, so deleting it would leave their sheets without a definition.',
				issues: inUse.map((entry) => ({
					path: `resources.${entry.resourceKey}`,
					message: `${entry.characterCount} character(s) carry ${entry.resourceKey}.`,
				})),
			},
			state,
		);
	}

	const packages = { ...state.systems.packages };
	delete packages[packageId];
	return commit(
		state,
		env,
		actor.id,
		'deleted',
		packageId,
		{ ...state.systems, packages },
		{ packageId, displayName: existing.displayName },
	);
}

/**
 * `system.fork` — copy any installed system (built-in included) into a new DM-authored one (DM-only).
 *
 * The copy is deep and re-idded: a supplied `packageId` must be free and in the `custom:` namespace,
 * and an omitted one is minted from `env.ids()`, so a replayed log forks to the same id every time.
 * The fork does NOT become active — selecting it is a separate, dry-run-gated decision.
 */
export function handleForkSystemPackage(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	const parsed = parseInput(forkSystemPackageInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const source = state.systems.packages[parsed.data.sourcePackageId];
	if (!source) {
		return reject(
			{
				code: 'package-not-found',
				message: `System ${parsed.data.sourcePackageId} is not installed.`,
			},
			state,
		);
	}

	const forkId = parsed.data.packageId ?? mintForkId(env.ids());
	const namespaceCheck = requireCustomNamespace(forkId, 'forked into');
	if (namespaceCheck) return reject(namespaceCheck, state);
	if (state.systems.packages[forkId]) {
		return reject(
			{ code: 'system-package-exists', message: `System ${forkId} already exists.` },
			state,
		);
	}

	const fork: SystemPackage = {
		...cloneSystemPackage(source),
		id: forkId,
		displayName: parsed.data.displayName ?? `${source.displayName} (copy)`,
	};
	return commit(
		state,
		env,
		actor.id,
		'forked',
		forkId,
		{ ...state.systems, packages: { ...state.systems.packages, [forkId]: fork } },
		{ packageId: forkId, sourcePackageId: source.id, displayName: fork.displayName },
	);
}

/* ------------------------------------------------------------------------------------------------
 * RC-SYS-3.4 — EXPORT / IMPORT a system package as a `.dndmodule` bundle.
 *
 * A system package is DATA: a vocabulary, some attributes, resources, conditions and formulas. It
 * runs no code and asks for no host permission, so sharing one needs no sandbox and no permission
 * grant — only the SAME bundle format, the SAME trust review and the SAME install command
 * (`system.define`) a widget package goes through (RC-CLD-4.1, ADR-002: a publisher proposes, the DM
 * disposes). These two helpers are the pure ends of that round trip; the screens compose them.
 * ---------------------------------------------------------------------------------------------- */

/** The manifest version an export falls back to when the package's own is not semver. */
const SYSTEM_PACKAGE_FALLBACK_VERSION = '1.0.0';

/** Bundle-manifest fields a DM may override when exporting; everything else comes from the package. */
export interface SystemPackageExportOverrides {
	id?: string;
	name?: string;
	summary?: string;
	version?: string;
	license?: string;
	changelog?: string;
	authoredAt?: string;
}

/**
 * The module id for a system package: its package id folded to the manifest's alphabet
 * (`^[a-z0-9][a-z0-9._-]*$`), which has no colon, so `custom:my-system` ships as `custom-my-system`.
 */
export function systemPackageModuleId(packageId: string): string {
	const slug = packageId
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^[^a-z0-9]+|[-._]+$/g, '')
		.slice(0, 120);
	return slug.length > 0 ? slug : 'system-package';
}

/**
 * `exportSystemPackageBundle` — project an installed system package into a `.dndmodule` bundle.
 *
 * Built-in packages are exportable too: a package is data, and a DM who wants to hand 5e's shape to
 * a friend as a starting point should not have to fork it first. What it CANNOT do is produce a
 * bundle that would not parse — it builds through `buildModuleBundle`, so a package that could not
 * survive its own schema never reaches a file.
 */
export function exportSystemPackageBundle(
	systems: SystemsState,
	packageId: string,
	overrides: SystemPackageExportOverrides = {},
): ModuleBundleParseResult {
	const pkg = systems.packages[packageId];
	if (!pkg) {
		return {
			ok: false,
			reason: `System ${packageId} is not installed.`,
			issues: [{ path: 'packageId', message: `${packageId} is not in this campaign's systems.` }],
		};
	}
	// A package version is free text (`systemPackageSchema`), a manifest version is semver. Carry the
	// package's own when it already is one rather than inventing a number the DM did not choose.
	const version =
		overrides.version ??
		(isValidSemver(pkg.version) ? pkg.version : SYSTEM_PACKAGE_FALLBACK_VERSION);
	return buildModuleBundle({
		manifest: {
			kind: 'system-package',
			id: overrides.id ?? systemPackageModuleId(pkg.id),
			name: overrides.name ?? pkg.displayName,
			summary: overrides.summary ?? pkg.summary,
			version,
			...(overrides.license ? { license: overrides.license } : {}),
			...(overrides.changelog ? { changelog: overrides.changelog } : {}),
			...(overrides.authoredAt ? { authoredAt: overrides.authoredAt } : {}),
			systems: [pkg.id],
		},
		payload: cloneSystemPackage(pkg),
	});
}

/** What an importable bundle would install, and under which id. */
export interface SystemPackageImport {
	/** The package as it would be defined — ready for `system.define` verbatim. */
	package: SystemPackage;
	/** The id the bundle carried, which may not be the id it installs under. */
	sourcePackageId: string;
	/** True when the install id differs from the bundle's (built-in namespace, or a collision). */
	rehomed: boolean;
}

export type SystemPackageImportResult =
	| { ok: true; import: SystemPackageImport }
	| { ok: false; reason: string };

/**
 * `importSystemPackageFromBundle` — read a parsed `.dndmodule` back into a definable package.
 *
 * The re-id is the whole reason this is not just `bundle.payload`. Authoring is confined to the
 * `custom:` namespace, and the built-in packages are re-seeded from the BUILD on every load, so an
 * import that kept `dnd5e` would either be rejected by `system.define` or silently reverted at the
 * next hydrate. An imported package therefore always lands in `custom:`, under a free id — an
 * install adds a system, it never overwrites one the DM already has.
 */
export function importSystemPackageFromBundle(
	bundle: ModuleBundle,
	systems: Pick<SystemsState, 'packages'>,
): SystemPackageImportResult {
	if (bundle.manifest.kind !== 'system-package') {
		return { ok: false, reason: 'This module does not carry a system package.' };
	}
	const parsed = systemPackageSchema.safeParse(bundle.payload);
	if (!parsed.success) {
		return {
			ok: false,
			reason: 'This module says it is a system package, but its contents are not one.',
		};
	}
	const source = cloneSystemPackage(parsed.data as SystemPackage);
	const installId = freeCustomSystemPackageId(source.id, systems.packages);
	return {
		ok: true,
		import: {
			package: installId === source.id ? source : { ...source, id: installId },
			sourcePackageId: source.id,
			rehomed: installId !== source.id,
		},
	};
}

/**
 * A free id in the `custom:` namespace derived from `packageId`. Already-custom and free is kept
 * as-is (so a package round-trips to itself); otherwise the base is suffixed `-2`, `-3`, … until it
 * is free, which is bounded because each candidate is checked against a finite installed set.
 */
function freeCustomSystemPackageId(
	packageId: string,
	packages: Readonly<Record<string, unknown>>,
): string {
	const base = CUSTOM_SYSTEM_PACKAGE_ID_PATTERN.test(packageId)
		? packageId
		: mintForkId(packageId.replace(/^[a-z0-9]+:/i, ''));
	if (!packages[base]) return base;
	// Trailing hyphens are trimmed before the suffix: the namespace pattern allows single hyphens
	// only, so a truncated `custom:foo-` + `-2` would not be a legal id.
	const stem = base.slice(0, 48 - 4).replace(/-+$/, '');
	for (let suffix = 2; ; suffix += 1) {
		const candidate = `${stem}-${suffix}`;
		if (!packages[candidate]) return candidate;
	}
}
