/**
 * SYNC-001 — the LOCAL-FIRST invariant model.
 *
 * Architecture Contract 2's "Local-First Invariant" makes local-first a PRODUCT invariant, not a
 * platform option (Cross-Contract Non-Negotiable 3): a user can OPEN, READ, SEARCH, EDIT, and RUN core
 * vault/session workflows with ZERO NETWORK for any content already on the device. ADR-014 already
 * makes the first prototype single-device and local-first — every durable mutation flows through the
 * pure Processing Core (`dispatchCommand`) and the local IndexedDB adapter, with no fetch/cloud
 * transport in the path.
 *
 * This module FORMALIZES and makes that invariant TESTABLE. It is pure Processing-Core policy:
 *
 *   - it DECLARES the core workflows that must remain usable offline (read/search/edit/session);
 *   - it computes the OFFLINE AVAILABILITY of a workflow given whether its content is on the device
 *     (Contract 2 offline exception: a device cannot access content NEVER synced/cached to it — that
 *     reports `unavailable`, it does not block the whole vault);
 *   - it computes the COLLABORATION availability offline (remote participants/presence are
 *     network-only — `unavailable` offline; queued local operations stay local until sync resumes);
 *   - `assertNoNetworkDependency` is the fail-closed guard that proves a value carries no network
 *     handle (fetch/XHR/socket/URL), so the offline path can be asserted to resolve from local
 *     storage only.
 *
 * No DOM, Svelte, Node, fetch, or cloud APIs — by construction this module (like the whole core)
 * cannot perform network I/O; that is exactly the invariant it encodes.
 */

/** The core workflows that MUST stay usable offline for content already on the device (SYNC-001 AC1). */
export type LocalFirstWorkflow =
	| 'open' // open the app / load the local vault
	| 'read' // read local notes/objects/characters/maps/scenes
	| 'search' // search the local content index
	| 'edit' // edit notes/objects/characters (durable local write)
	| 'session' // run a session: scenes, dice, combat, handouts already local
	| 'maps' // view/edit maps already on the device
	| 'dice' // roll dice (deterministic, no network)
	| 'combat'; // run combat for combatants already local

/** The canonical ordered list of offline-required workflows. */
export const LOCAL_FIRST_WORKFLOWS: readonly LocalFirstWorkflow[] = Object.freeze([
	'open',
	'read',
	'search',
	'edit',
	'session',
	'maps',
	'dice',
	'combat',
]);

/** Whether a workflow is one of the offline-required core workflows. */
export function isLocalFirstWorkflow(value: string): value is LocalFirstWorkflow {
	return (LOCAL_FIRST_WORKFLOWS as readonly string[]).includes(value);
}

export type WorkflowAvailabilityState = 'available' | 'unavailable';

export interface WorkflowAvailability {
	workflow: LocalFirstWorkflow;
	state: WorkflowAvailabilityState;
	/** A generic, non-leaking explanation. */
	detail: string;
}

export interface LocalFirstWorkflowInput {
	workflow: LocalFirstWorkflow;
	/**
	 * Whether the content this workflow needs is present on the device. The local-first invariant only
	 * promises offline access to content ALREADY on the device (Contract 2 offline exception). Defaults
	 * to true — a core workflow over local content is available offline.
	 */
	contentOnDevice?: boolean;
}

/**
 * Compute a workflow's offline availability. The invariant: a core workflow over content on the device
 * is ALWAYS available with zero network (SYNC-001 AC1). Content that has NEVER synced to this device is
 * reported `unavailable` for the specific workflow that needs it — it never blocks the whole vault
 * (SYNC-001 AC2).
 */
export function evaluateWorkflowAvailability(input: LocalFirstWorkflowInput): WorkflowAvailability {
	const onDevice = input.contentOnDevice ?? true;
	if (onDevice) {
		return {
			workflow: input.workflow,
			state: 'available',
			detail: 'This workflow runs entirely from local storage with no network.',
		};
	}
	return {
		workflow: input.workflow,
		state: 'unavailable',
		detail:
			'The content this needs has not been synced to this device. Other local content remains fully usable.',
	};
}

/**
 * The local-first STATUS the GUI renders when the device is offline. Core workflows over local content
 * stay available; collaboration/presence are network-only and report `unavailable`; queued local
 * operations remain local until sync resumes (SYNC-001 AC3). Never blocks local command execution.
 */
export interface LocalFirstStatus {
	online: boolean;
	/** Core local workflows remain usable offline (the invariant). Always true here by construction. */
	localWorkflowsAvailable: true;
	/** Remote collaboration availability. `unavailable` whenever offline (presence is network-only). */
	collaboration: WorkflowAvailabilityState;
	/** Count of operations queued locally (accepted into the local log) awaiting sync. */
	queuedLocalOperationCount: number;
	/** A generic, action-oriented summary. */
	summary: string;
}

export interface LocalFirstStatusInput {
	online: boolean;
	/** Operations accepted locally but not yet acknowledged by a sync transport. */
	queuedLocalOperationCount?: number;
}

/**
 * Derive the local-first status (SYNC-001 AC3). When offline, collaboration is `unavailable` and any
 * queued local operations are reported as held locally — local work is never blocked. When online,
 * collaboration is `available`. Pure and deterministic.
 */
export function deriveLocalFirstStatus(input: LocalFirstStatusInput): LocalFirstStatus {
	const queued = Math.max(0, Math.trunc(input.queuedLocalOperationCount ?? 0));
	const collaboration: WorkflowAvailabilityState = input.online ? 'available' : 'unavailable';
	const summary = input.online
		? 'Online. Local work is primary; collaboration is available.'
		: queued > 0
			? `Offline. Local work continues; ${queued} change${queued === 1 ? '' : 's'} ${
					queued === 1 ? 'is' : 'are'
				} queued locally until sync resumes. Collaboration is unavailable.`
			: 'Offline. Local work continues with no network. Collaboration is unavailable.';
	return {
		online: input.online,
		localWorkflowsAvailable: true,
		collaboration,
		queuedLocalOperationCount: queued,
		summary,
	};
}

/**
 * A finding from the no-network-dependency guard: a path on a value that carries a network handle.
 * The check is structural (key/string heuristic), so a payload that smuggled a fetch/URL handle into
 * the offline path is caught fail-closed.
 */
export type NetworkDependencyReason =
	| 'function-handle' // a callable (e.g. fetch/XHR/socket) was found in the offline payload
	| 'url-string' // an http(s)/ws(s) URL string was found
	| 'network-key'; // a key named like a network handle was found

export interface NetworkDependencyFinding {
	path: string;
	reason: NetworkDependencyReason;
}

const NETWORK_KEY_PATTERN = /^(fetch|xhr|xmlhttprequest|websocket|socket|httpclient|axios|request)$/i;
const URL_PATTERN = /^(https?|wss?):\/\//i;
const MAX_SCAN_DEPTH = 6;

function scanForNetwork(
	value: unknown,
	path: string,
	depth: number,
	findings: NetworkDependencyFinding[],
	seen: WeakSet<object>,
): void {
	if (depth > MAX_SCAN_DEPTH) return;
	if (typeof value === 'function') {
		findings.push({ path, reason: 'function-handle' });
		return;
	}
	if (typeof value === 'string') {
		if (URL_PATTERN.test(value)) findings.push({ path, reason: 'url-string' });
		return;
	}
	if (value === null || typeof value !== 'object') return;
	if (seen.has(value)) return;
	seen.add(value);
	if (Array.isArray(value)) {
		value.forEach((item, index) => scanForNetwork(item, `${path}[${index}]`, depth + 1, findings, seen));
		return;
	}
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		if (NETWORK_KEY_PATTERN.test(key)) {
			findings.push({ path: path ? `${path}.${key}` : key, reason: 'network-key' });
		}
		scanForNetwork(child, path ? `${path}.${key}` : key, depth + 1, findings, seen);
	}
}

/**
 * Find any network-handle dependencies in a value. Returns the findings (empty ⇒ no network handle).
 * Used to PROVE the offline read/edit/search/session path carries no fetch/XHR/socket/URL handle — it
 * resolves from local storage only.
 */
export function findNetworkDependencies(value: unknown): NetworkDependencyFinding[] {
	const findings: NetworkDependencyFinding[] = [];
	scanForNetwork(value, '', 0, findings, new WeakSet());
	return findings;
}

/** Whether a value is free of any network-handle dependency (the offline-path guarantee). */
export function hasNoNetworkDependency(value: unknown): boolean {
	return findNetworkDependencies(value).length === 0;
}

/**
 * Assert a value carries no network dependency, throwing if it does. The fail-closed guard the
 * zero-network test uses to prove an offline workflow's inputs/outputs resolve from local storage and
 * never reach for a network handle.
 */
export function assertNoNetworkDependency(value: unknown): void {
	const findings = findNetworkDependencies(value);
	if (findings.length > 0) {
		const detail = findings.map((f) => `${f.path || '(root)'}: ${f.reason}`).join('; ');
		throw new Error(`Value carries a network dependency in the local-first path: ${detail}`);
	}
}
