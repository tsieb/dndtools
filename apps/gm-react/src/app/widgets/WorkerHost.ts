import { createElement, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
	findPackageRecordForWidgetType,
	findWidgetDefinition,
	type WidgetDataQuerySource,
	type WidgetDefinition,
	type WidgetHostPermission,
	type WidgetPackageAsset,
	type WidgetPackageDefinition,
	type WidgetIsolationResult,
	type WidgetPackageRecord,
	type WidgetTemplateKind,
} from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { BoardWidget } from '../board-helpers';
import type { WidgetCommandHandler } from '../widget-bodies';
import {
	resolveWidgetTemplateData,
	type WidgetComputedValue,
	type WidgetDataRow,
	type WidgetQueryResult,
	type WidgetTemplateData,
} from './dataEnvironment';
import {
	READY_TIMEOUT_MS,
	WIDGET_HOST_API_VERSION,
	WIDGET_HOST_CHANNEL,
	approvedHostPermissions,
	decideDispatch,
	decideOutbound,
	decidePermission,
	isolateFrame,
	type GuestOutbound,
} from './hostBridge';
import { WidgetPlaceholder } from './WidgetPlaceholder';
import { ActionPanelTemplate } from './templates/ActionPanel';
import { ChartTemplate } from './templates/Chart';
import { DataTableTemplate } from './templates/DataTable';
import { FormPanelTemplate } from './templates/FormPanel';
import { SceneMessageTemplate } from './templates/SceneMessage';
import { StatBlockTemplate } from './templates/StatBlock';
import { StatusListTemplate } from './templates/StatusList';
import { TrackerTemplate } from './templates/Tracker';
import type { WidgetTemplateProps } from './templates/shared';

/**
 * WorkerHost — where a DATA-ONLY custom widget runs (RC-WID-1.4, ADR-031 §1).
 *
 * A package declares this by pairing the `custom-html-js` runtime with `sandbox: 'worker'` (the field
 * the package schema has always carried). The widget then ships code but no interface: it is handed
 * the same actor-filtered props the iframe host hands its frame, it computes, it posts back rows and
 * computed fields, and one of the eight declarative templates from WID-1.2 draws them. Nothing the
 * widget wrote reaches the page as markup, because the widget never writes markup — which is the
 * point. A worker has no DOM, no document, no parent window and no way to reach the host's, so the
 * whole class of "what did this untrusted string do to my page" questions does not arise for it.
 *
 * The protocol is host API v1, unchanged: `ready` / `render(props)` / `configChanged` /
 * `bindingChanged` in, `dispatch` / `requestPermission` / `outbound` / `error` out, every one of them
 * answered by the SAME `hostBridge` decision functions the iframe host uses, so there is exactly one
 * policy and no second one to drift. The one addition is `result`, which is how a widget with no DOM
 * says what it drew.
 *
 * Two things a worker can do that a frame cannot, and both are handled here rather than hoped about:
 *
 *   - **It can loop forever.** A frame that hangs hangs itself; a worker that hangs holds a thread and
 *     never answers again. So every exchange is on a clock: the worker gets {@link READY_TIMEOUT_MS} to
 *     start and {@link WORKER_RESULT_TIMEOUT_MS} per render to answer, and when the clock runs out it is
 *     `terminate()`d — not asked to stop, not awaited — and the widget shows the same "disabled,
 *     preserved" placeholder every other unavailable renderer shows.
 *   - **It can say anything at all about its result.** So nothing it says is believed as typed:
 *     {@link normalizeWorkerResult} coerces every field, clamps the row count and truncates the strings
 *     before a template is allowed to see them.
 *
 * The session is a plain class over an injected worker factory and injected timers, so all of the
 * above is asserted in a unit test with no browser, no bundler and no real thread — including the one
 * case that would otherwise be untestable, a widget that never comes back.
 */

/** How long one `render` may take before the worker is terminated. Generous for data, fatal for a loop. */
export const WORKER_RESULT_TIMEOUT_MS = 3000;

/** Nothing a worker says is trusted for size. A result is clamped to this many rows. */
export const MAX_WORKER_ROWS = 200;

/** …and every string it contains to this many characters. */
export const MAX_WORKER_TEXT = 240;

/** Copy for every state a data-only widget can end up in. Sentence case, no engine jargon. */
export const WORKER_COPY = {
	unsupported: 'Background widgets do not run on this build yet.',
	entrypointNotDeclared: 'This widget package does not name code to run.',
	entrypointMissing: 'The code this widget package names is not in the package.',
	noCode: 'This widget package ships no code to run.',
	timedOut: 'This widget kept working past its time limit and was stopped.',
	crashed: 'This widget stopped while working.',
	packageMissing: "This widget's package is no longer installed.",
} as const;

// --- Assembling the worker script -------------------------------------------------------------------

export type WorkerAssemblyProblem = 'entrypoint-not-declared' | 'entrypoint-missing' | 'no-code';

export interface WorkerAssemblyResult {
	code: string | null;
	/** Whether the code must be run as a module worker (it uses `import`/`export`). */
	module: boolean;
	problem: WorkerAssemblyProblem | null;
}

/** Assembly problems in the DM's words, so the placeholder never prints an error code. */
export const WORKER_ASSEMBLY_COPY: Record<WorkerAssemblyProblem, string> = {
	'entrypoint-not-declared': WORKER_COPY.entrypointNotDeclared,
	'entrypoint-missing': WORKER_COPY.entrypointMissing,
	'no-code': WORKER_COPY.noCode,
};

const ESM_SYNTAX = /^\s*(?:export|import)\s/m;

/**
 * The guest half of the protocol, prepended to the package's own code.
 *
 * It is deliberately tiny and deliberately the only thing in the worker that knows the wire format: a
 * package author writes `export function render(props) { return { rows: [...] } }` (or calls
 * `dndtoolsWidget.result(...)` for an async one) and never sees a `postMessage`. `requestPermission`
 * and `outbound` are promises resolved by the host's answer, which is always the core's answer.
 */
const GUEST_PREAMBLE = `
(function () {
	var CHANNEL = ${JSON.stringify(WIDGET_HOST_CHANNEL)};
	var VERSION = ${WIDGET_HOST_API_VERSION};
	var pending = {};
	var sequence = 0;
	var renderFn = null;
	var post = function (kind, body) {
		var message = { channel: CHANNEL, hostApiVersion: VERSION, kind: kind };
		for (var key in body) message[key] = body[key];
		self.postMessage(message);
	};
	var ask = function (kind, body) {
		var requestId = 'w' + ++sequence;
		return new Promise(function (resolve) {
			pending[requestId] = resolve;
			body.requestId = requestId;
			post(kind, body);
		});
	};
	var api = {
		onRender: function (fn) { renderFn = fn; },
		result: function (result) { post('result', { result: result }); },
		dispatch: function (commandType, payload) {
			return ask('dispatch', { commandType: commandType, payload: payload || {} });
		},
		requestPermission: function (capability) {
			return ask('requestPermission', { capability: capability });
		},
		outbound: function (request) {
			request = request || {};
			return ask('outbound', {
				url: request.url || null,
				destinationClass: request.destinationClass || null,
				payload: request.payload === undefined ? null : request.payload,
			});
		},
	};
	self.dndtoolsWidget = api;
	var run = function (props) {
		if (!renderFn) return;
		var value = renderFn(props);
		if (value && typeof value.then === 'function') {
			value.then(function (settled) { if (settled) api.result(settled); },
				function (error) { post('error', { message: String(error && error.message ? error.message : error) }); });
		} else if (value) {
			api.result(value);
		}
	};
	var props = null;
	self.onmessage = function (event) {
		var data = event && event.data;
		if (!data || data.channel !== CHANNEL || data.hostApiVersion !== VERSION) return;
		try {
			if (data.kind === 'result') {
				var resolve = pending[data.requestId];
				if (resolve) { delete pending[data.requestId]; resolve(data.result); }
				return;
			}
			if (data.kind === 'render') { props = data.props; run(props); return; }
			if (data.kind === 'configChanged' && props) {
				props = Object.assign({}, props, { configuration: data.configuration });
				run(props);
				return;
			}
			if (data.kind === 'bindingChanged' && props) {
				props = Object.assign({}, props, { binding: data.binding });
				run(props);
				return;
			}
		} catch (error) {
			post('error', { message: String(error && error.message ? error.message : error) });
		}
	};
	self.onerror = function (error) {
		post('error', { message: String(error && error.message ? error.message : error) });
	};
	post('ready', {});
})();
`;

/**
 * The counterpart of the iframe host's export shim: a `render` declared with `export function` is
 * module-scoped and invisible to the preamble, so the SAME module hands it over at the end.
 */
const RENDER_EXPORT_SHIM = `
;try { if (typeof render === 'function') self.dndtoolsWidget.onRender(render); } catch (error) { /* no render export */ }
`;

function assetText(asset: WidgetPackageAsset | undefined): string | null {
	if (!asset || typeof asset.content !== 'string') return null;
	if (asset.contentEncoding !== 'base64') return asset.content;
	if (typeof atob !== 'function') return null;
	try {
		return atob(asset.content);
	} catch {
		return null;
	}
}

/**
 * Turn a package into the one script a worker runs: the guest protocol, the package's entrypoint code,
 * and the export shim. Unlike the iframe host there is no markup to lift and no stylesheet to inline —
 * a data-only widget's entrypoint is a JavaScript asset and nothing else, which is most of why this
 * host is small.
 */
export function assembleWorkerScript(
	pkg: WidgetPackageDefinition,
	definition: WidgetDefinition,
): WorkerAssemblyResult {
	const entrypointPath = definition.renderEntrypoint?.assetPath;
	if (!entrypointPath) return { code: null, module: false, problem: 'entrypoint-not-declared' };
	const source = assetText(pkg.assets.find((asset) => asset.path === entrypointPath));
	if (source === null) return { code: null, module: false, problem: 'entrypoint-missing' };
	if (source.trim() === '') return { code: null, module: false, problem: 'no-code' };
	return {
		code: `${GUEST_PREAMBLE}\n${source}\n${RENDER_EXPORT_SHIM}`,
		module: ESM_SYNTAX.test(source),
		problem: null,
	};
}

// --- Messages ---------------------------------------------------------------------------------------

export interface WorkerReady {
	kind: 'ready';
}
export interface WorkerResultMessage {
	kind: 'result';
	result: unknown;
}
export interface WorkerDispatch {
	kind: 'dispatch';
	requestId: string;
	commandType: string;
	payload: Record<string, unknown>;
}
export interface WorkerRequestPermission {
	kind: 'requestPermission';
	requestId: string;
	capability: string;
}
export interface WorkerOutbound extends GuestOutbound {
	kind: 'outbound';
}
export interface WorkerError {
	kind: 'error';
	message: string;
}

export type WorkerGuestMessage =
	| WorkerReady
	| WorkerResultMessage
	| WorkerDispatch
	| WorkerRequestPermission
	| WorkerOutbound
	| WorkerError;

export type WorkerMessageDrop =
	| 'not-host-protocol'
	| 'unknown-kind'
	| 'malformed'
	| 'version-mismatch';

/**
 * Validate one message from the worker. Same rule as the frame's parser and for the same reason:
 * anything that is not exactly a v1 message of a known kind is dropped with a reason rather than
 * guessed at. `resize` is absent here — a widget with no DOM has no content height to report.
 */
export function parseWorkerMessage(
	data: unknown,
): WorkerGuestMessage | { drop: WorkerMessageDrop } {
	if (typeof data !== 'object' || data === null) return { drop: 'not-host-protocol' };
	const raw = data as Record<string, unknown>;
	if (raw.channel !== WIDGET_HOST_CHANNEL) return { drop: 'not-host-protocol' };
	if (raw.hostApiVersion !== WIDGET_HOST_API_VERSION) return { drop: 'version-mismatch' };
	const requestId = typeof raw.requestId === 'string' ? raw.requestId : null;
	switch (raw.kind) {
		case 'ready':
			return { kind: 'ready' };
		case 'result':
			return { kind: 'result', result: raw.result ?? null };
		case 'dispatch':
			if (!requestId || typeof raw.commandType !== 'string') return { drop: 'malformed' };
			return {
				kind: 'dispatch',
				requestId,
				commandType: raw.commandType,
				payload:
					typeof raw.payload === 'object' && raw.payload !== null
						? (raw.payload as Record<string, unknown>)
						: {},
			};
		case 'requestPermission':
			if (!requestId || typeof raw.capability !== 'string') return { drop: 'malformed' };
			return { kind: 'requestPermission', requestId, capability: raw.capability };
		case 'outbound':
			if (!requestId) return { drop: 'malformed' };
			return {
				kind: 'outbound',
				requestId,
				url: typeof raw.url === 'string' ? raw.url : null,
				destinationClass: typeof raw.destinationClass === 'string' ? raw.destinationClass : null,
				payload: raw.payload ?? null,
			};
		case 'error':
			return {
				kind: 'error',
				message: typeof raw.message === 'string' ? raw.message : WORKER_COPY.crashed,
			};
		default:
			return { drop: 'unknown-kind' };
	}
}

// --- The result, believed only after it has been checked ---------------------------------------------

export interface WorkerResultPayload {
	header: string | null;
	emptyLabel: string;
	rows: WidgetDataRow[];
	computed: WidgetComputedValue[];
}

function text(value: unknown, fallback = ''): string {
	if (typeof value === 'string') return value.slice(0, MAX_WORKER_TEXT);
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return fallback;
}

function measure(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Coerce whatever the worker posted into the row shape every template already reads.
 *
 * This is the trust boundary for the data path, and it is a whitelist: fields the row shape does not
 * have are dropped, strings are truncated, numbers that are not numbers become absent, and a widget
 * that returns a hundred thousand rows gets {@link MAX_WORKER_ROWS} of them. A row with no usable name
 * is dropped entirely rather than drawn as a blank line, because a blank line reads as data.
 */
export function normalizeWorkerResult(raw: unknown): WorkerResultPayload {
	const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	const rawRows = Array.isArray(value.rows) ? value.rows.slice(0, MAX_WORKER_ROWS) : [];
	const rows: WidgetDataRow[] = [];
	rawRows.forEach((entry, index) => {
		if (typeof entry !== 'object' || entry === null) return;
		const record = entry as Record<string, unknown>;
		const primary = text(record.primary);
		if (primary === '') return;
		const row: WidgetDataRow = { id: text(record.id, `row-${index}`), primary };
		const secondary = text(record.secondary);
		if (secondary !== '') row.secondary = secondary;
		const meta = text(record.meta);
		if (meta !== '') row.meta = meta;
		const numeric = measure(record.value);
		if (numeric !== undefined) row.value = numeric;
		const max = measure(record.max);
		if (max !== undefined) row.max = max;
		if (record.active === true) row.active = true;
		rows.push(row);
	});

	const rawComputed = Array.isArray(value.computed) ? value.computed.slice(0, MAX_WORKER_ROWS) : [];
	const computed: WidgetComputedValue[] = [];
	rawComputed.forEach((entry, index) => {
		if (typeof entry !== 'object' || entry === null) return;
		const record = entry as Record<string, unknown>;
		const label = text(record.label);
		if (label === '') return;
		const numeric = measure(record.value);
		computed.push({
			id: text(record.id, `computed-${index}`),
			label,
			valueType: numeric === undefined ? 'string' : 'number',
			value: numeric === undefined ? text(record.value) : numeric,
			display: text(record.display, numeric === undefined ? text(record.value) : String(numeric)),
		});
	});

	return {
		header: typeof value.header === 'string' ? text(value.header) : null,
		emptyLabel: text(value.emptyLabel, 'This widget returned nothing to show.'),
		rows,
		computed,
	};
}

/**
 * Project a checked result into the shape the eight templates read.
 *
 * The single query is reported under the source the definition's first `dataQuery` declares, because
 * that is what the widget was given to work with; a definition that declares none gets
 * `content-objects`, the neutral source. `withheld` is always null: a worker is fed data that has
 * ALREADY been filtered for the viewing actor, so anything it can echo is something this actor may
 * see, and claiming otherwise would be the dishonest empty state.
 */
export function workerResultToTemplateData(
	payload: WorkerResultPayload,
	definition: WidgetDefinition | null,
	isDm: boolean,
): WidgetTemplateData {
	const source: WidgetDataQuerySource = definition?.dataQueries?.[0]?.source ?? 'content-objects';
	const query: WidgetQueryResult = {
		id: 'worker-result',
		label: definition?.displayName ?? 'Result',
		source,
		rows: payload.rows,
		header: payload.header,
		emptyLabel: payload.emptyLabel,
		withheld: null,
	};
	return { queries: [query], computed: payload.computed, primary: query, isDm };
}

// --- The session: one worker, on a clock -------------------------------------------------------------

/** The part of `Worker` this host uses. Narrow on purpose, so a test can be the other side of it. */
export interface WidgetWorkerLike {
	postMessage(message: unknown): void;
	terminate(): void;
	onmessage: ((event: { data: unknown }) => void) | null;
	onerror: ((event: unknown) => void) | null;
}

export type WorkerFactory = (code: string, module: boolean) => WidgetWorkerLike;

export type WorkerHostState =
	| { phase: 'starting' }
	| { phase: 'ready'; result: WorkerResultPayload | null }
	| { phase: 'failed'; diagnostic: string };

export interface WorkerSessionOptions {
	widgetInstanceId: string;
	siblingInstanceIds: readonly string[];
	definition: WidgetDefinition;
	approvedPermissions: readonly WidgetHostPermission[];
	code: string;
	module: boolean;
	createWorker: WorkerFactory;
	onChange: (state: WorkerHostState) => void;
	onCommand?: WidgetCommandHandler;
	readyTimeoutMs?: number;
	resultTimeoutMs?: number;
}

/**
 * One worker's whole life: start it, feed it, hold it to its deadlines, and take it down.
 *
 * Every deadline ends the same way — `terminate()` first, then the placeholder — because a worker
 * that missed one is by definition not listening. Termination is also final for the session: a
 * widget that failed is not restarted behind the DM's back, it is shown as stopped, and re-placing or
 * reloading it is what starts a new one.
 */
export class WidgetWorkerSession {
	private worker: WidgetWorkerLike | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private state: WorkerHostState = { phase: 'starting' };
	private started = false;
	private stopped = false;
	private queuedProps: unknown = null;
	private isolation: WidgetIsolationResult | null = null;
	private readonly options: WorkerSessionOptions;

	constructor(options: WorkerSessionOptions) {
		this.options = options;
	}

	/** Spawn the worker and give it {@link READY_TIMEOUT_MS} to say hello. */
	start(): void {
		if (this.started || this.stopped) return;
		this.started = true;
		try {
			this.worker = this.options.createWorker(this.options.code, this.options.module);
		} catch {
			// A platform that refuses to make the worker at all (no `Worker`, or a content policy that
			// will not run one) is a build this widget does not run on. Say that, do not pretend.
			this.fail(WORKER_COPY.unsupported);
			return;
		}
		this.worker.onmessage = (event) => this.receive(event.data);
		this.worker.onerror = () => this.fail(WORKER_COPY.crashed);
		this.arm(this.options.readyTimeoutMs ?? READY_TIMEOUT_MS);
	}

	/** Hand the worker its actor-filtered props and start the render clock. */
	render(props: unknown): void {
		this.queuedProps = props;
		if (this.state.phase !== 'ready') return;
		this.send('render', { props });
		this.arm(this.options.resultTimeoutMs ?? WORKER_RESULT_TIMEOUT_MS);
	}

	/** Tell a running widget one setting moved, without tearing it down and rebuilding it. */
	configChanged(configuration: unknown): void {
		if (this.state.phase !== 'ready') return;
		this.send('configChanged', { configuration });
		this.arm(this.options.resultTimeoutMs ?? WORKER_RESULT_TIMEOUT_MS);
	}

	/** The same for its binding. */
	bindingChanged(binding: unknown): void {
		if (this.state.phase !== 'ready') return;
		this.send('bindingChanged', { binding });
		this.arm(this.options.resultTimeoutMs ?? WORKER_RESULT_TIMEOUT_MS);
	}

	/** Take the worker down for good — unmount, failure, or a missed deadline. */
	stop(): void {
		this.stopped = true;
		this.disarm();
		this.worker?.terminate();
		this.worker = null;
	}

	current(): WorkerHostState {
		return this.state;
	}

	private receive(data: unknown): void {
		if (this.stopped) return;
		const message = parseWorkerMessage(data);
		if ('drop' in message) return;
		switch (message.kind) {
			case 'ready': {
				this.disarm();
				this.publish({ phase: 'ready', result: null });
				if (this.queuedProps !== null) this.render(this.queuedProps);
				return;
			}
			case 'result': {
				this.disarm();
				this.publish({ phase: 'ready', result: normalizeWorkerResult(message.result) });
				return;
			}
			case 'requestPermission': {
				this.answer(
					message.requestId,
					decidePermission(
						this.options.widgetInstanceId,
						message.capability,
						this.options.approvedPermissions,
					),
				);
				return;
			}
			case 'outbound': {
				this.answer(
					message.requestId,
					decideOutbound(
						this.options.widgetInstanceId,
						message,
						this.options.definition,
						this.options.approvedPermissions,
					),
				);
				return;
			}
			case 'dispatch': {
				const decision = decideDispatch(this.options.definition, message.commandType);
				if (decision.accepted) this.options.onCommand?.(message.commandType, message.payload);
				this.answer(message.requestId, decision);
				return;
			}
			case 'error':
				this.fail(WORKER_COPY.crashed);
				return;
		}
	}

	private send(kind: string, body: Record<string, unknown>): void {
		this.worker?.postMessage({
			channel: WIDGET_HOST_CHANNEL,
			hostApiVersion: WIDGET_HOST_API_VERSION,
			kind,
			...body,
		});
	}

	private answer(requestId: string, result: unknown): void {
		this.send('result', { requestId, result });
	}

	/** (Re)start the clock. There is only ever one deadline outstanding, the most recent. */
	private arm(ms: number): void {
		this.disarm();
		this.timer = setTimeout(() => {
			this.timer = null;
			this.fail(WORKER_COPY.timedOut);
		}, ms);
	}

	private disarm(): void {
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	/**
	 * Stop the worker AND record the isolation through the core's primitive, so what the placeholder
	 * implies — the other widgets and the session are untouched — is the core's statement rather than
	 * this host's opinion. The diagnostic stays the specific one (timed out, crashed), because
	 * `isolateWidgetFailure`'s message is deliberately generic and the DM deserves the reason.
	 */
	private fail(diagnostic: string): void {
		this.isolation = isolateFrame(
			this.options.widgetInstanceId,
			this.options.siblingInstanceIds,
			'crashed',
		);
		this.stop();
		this.publish({ phase: 'failed', diagnostic });
	}

	/** The isolation record for a session that failed, or null while it is still running. */
	isolatedFrom(): WidgetIsolationResult | null {
		return this.isolation;
	}

	private publish(state: WorkerHostState): void {
		this.state = state;
		this.options.onChange(state);
	}
}

/**
 * The default factory: a classic or module worker built from a blob of the assembled script.
 *
 * A blob URL is the only way to run code that arrived as package data rather than as a file the build
 * shipped, and the worker it creates has no DOM and no reference to anything of the host's. Note that
 * the packaged shell's content policy has no `worker-src` yet, so there the constructor throws and the
 * widget shows the "does not run on this build" placeholder — fail closed, and visibly.
 */
export function createBlobWorker(code: string, module: boolean): WidgetWorkerLike {
	const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
	try {
		const worker = new Worker(url, module ? { type: 'module' } : undefined);
		// Structurally narrower than `Worker` (its handlers are typed against `MessageEvent`), so the
		// host talks to the small surface it actually uses and a test can be the other side of it.
		return worker as unknown as WidgetWorkerLike;
	} finally {
		// The worker has already been given the blob; holding the URL open would leak it for the session.
		URL.revokeObjectURL(url);
	}
}

// --- Drawing the result ------------------------------------------------------------------------------

/** The eight pure templates, addressed by kind. Same components the `template` branch renders. */
const WORKER_TEMPLATES: Record<
	WidgetTemplateKind,
	(props: WidgetTemplateProps) => ReactElement | null
> = {
	'data-table': DataTableTemplate,
	'status-list': StatusListTemplate,
	tracker: TrackerTemplate,
	'action-panel': ActionPanelTemplate,
	'scene-message': SceneMessageTemplate,
	chart: ChartTemplate,
	'stat-block': StatBlockTemplate,
	'form-panel': FormPanelTemplate,
};

/** The template a data-only widget's result is drawn through; a table when it names none. */
export function workerTemplateFor(definition: WidgetDefinition | null): WidgetTemplateKind {
	const declared = definition?.renderEntrypoint?.template;
	return declared && declared in WORKER_TEMPLATES ? declared : 'data-table';
}

/**
 * The React half: resolve the package, assemble the script, keep one session alive for the widget's
 * lifetime, and draw whatever came back through the declared template.
 *
 * It is deliberately the thin part. Everything decidable without a browser is above, which is why this
 * file is `.ts` and builds its element without JSX — the component is three states and a lifecycle.
 */
export function WorkerHost({
	widget,
	onCommand,
	createWorker = createBlobWorker,
}: {
	widget: BoardWidget;
	onCommand?: WidgetCommandHandler;
	/** Injected by tests; the app always uses the blob worker. */
	createWorker?: WorkerFactory;
}): ReactElement {
	const runtime = useRuntime();
	const [state, setState] = useState<WorkerHostState>({ phase: 'starting' });
	const sessionRef = useRef<WidgetWorkerSession | null>(null);
	const commandRef = useRef<WidgetCommandHandler | undefined>(onCommand);
	commandRef.current = onCommand;

	const definition = findWidgetDefinition(runtime.state.widgets, widget.type) ?? null;
	const record: WidgetPackageRecord | null =
		findPackageRecordForWidgetType(runtime.state.widgets, widget.type) ?? null;

	// The worker is fed from the SAME actor-filtered resolution the templates use, so a `dm` audience
	// query is withheld before it reaches untrusted code rather than after.
	const data = resolveWidgetTemplateData(runtime.state, runtime.activeActorId, definition, widget);

	const assembly = useMemo(
		() => (definition && record ? assembleWorkerScript(record.package, definition) : null),
		[definition, record],
	);

	const siblingIds = useMemo(() => {
		for (const scene of Object.values(runtime.state.scenes.scenes)) {
			if (scene.widgets.some((instance) => instance.id === widget.id)) {
				return scene.widgets.map((instance) => instance.id);
			}
		}
		return [widget.id];
	}, [runtime.state.scenes.scenes, widget.id]);

	const props = useMemo(
		() => ({
			widget: {
				id: widget.id,
				type: widget.type,
				title: widget.title,
				visibility: widget.visibility,
				width: widget.w,
				height: widget.h,
			},
			configuration: widget.configuration,
			binding: widget.bindingRef
				? {
						entityType: widget.bindingRef.entityType,
						entityId: widget.bindingRef.entityId,
						status: widget.status,
						statusNote: widget.statusNote,
					}
				: null,
			queries: data.queries,
			computed: data.computed,
			isDm: data.isDm,
		}),
		[widget, data],
	);

	const code = assembly?.code ?? null;
	const isModule = assembly?.module ?? false;
	const approved = useMemo(() => approvedHostPermissions(record), [record]);

	useEffect(() => {
		if (!definition || code === null) return;
		const session = new WidgetWorkerSession({
			widgetInstanceId: widget.id,
			siblingInstanceIds: siblingIds,
			definition,
			approvedPermissions: approved,
			code,
			module: isModule,
			createWorker,
			onChange: setState,
			onCommand: (type, payload) => commandRef.current?.(type, payload),
		});
		sessionRef.current = session;
		setState({ phase: 'starting' });
		session.start();
		return () => {
			session.stop();
			sessionRef.current = null;
		};
	}, [definition, code, isModule, widget.id, siblingIds, approved, createWorker]);

	// Props are compared serialized, not by identity: the runtime rebuilds them on every state change
	// anywhere in the vault, and a worker should only be woken when what it can SEE moved.
	const serialized = JSON.stringify(props);
	useEffect(() => {
		// The session holds the latest props and replays them itself once the worker says `ready`, so
		// this effect does not need to know which phase the session is in.
		sessionRef.current?.render(JSON.parse(serialized) as unknown);
	}, [serialized]);

	if (!definition || !record) {
		return createElement(WidgetPlaceholder, { diagnostic: WORKER_COPY.packageMissing });
	}
	if (assembly?.problem) {
		return createElement(WidgetPlaceholder, {
			diagnostic: WORKER_ASSEMBLY_COPY[assembly.problem],
		});
	}
	if (state.phase === 'failed') {
		return createElement(WidgetPlaceholder, { diagnostic: state.diagnostic });
	}

	const result = state.phase === 'ready' ? state.result : null;
	const Template = WORKER_TEMPLATES[workerTemplateFor(definition)];
	return createElement(Template, {
		widget,
		definition,
		data: workerResultToTemplateData(
			result ?? { header: null, emptyLabel: 'Working…', rows: [], computed: [] },
			definition,
			data.isDm,
		),
		onCommand,
	});
}
