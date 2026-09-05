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
import { previewSystemPackageSelect } from '../queries/system-switch-query';
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
