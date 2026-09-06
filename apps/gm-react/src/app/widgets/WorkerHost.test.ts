import { createContext, runInContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CUSTOM_WIDGET_HOST_API_VERSION,
	dispatchCommand,
	findWidgetDefinition,
	type CoreStateSlice,
	type WidgetDefinition,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { WIDGET_HOST_API_VERSION, WIDGET_HOST_CHANNEL } from './hostBridge';
import {
	MAX_WORKER_ROWS,
	MAX_WORKER_TEXT,
	WORKER_COPY,
	WORKER_RESULT_TIMEOUT_MS,
	WidgetWorkerSession,
	assembleWorkerScript,
	normalizeWorkerResult,
	parseWorkerMessage,
	workerResultToTemplateData,
	workerTemplateFor,
	type WidgetWorkerLike,
	type WorkerHostState,
} from './WorkerHost';

/**
 * RC-WID-1.4 — the data-only sandbox, asserted where a worker cannot lie about it.
 *
 * The interesting cases are all failures: a widget that never starts, a widget that never answers, a
 * widget that asks for a permission nobody granted it, a widget that dispatches a command its package
 * never declared, and a widget that returns a hundred thousand rows of nonsense. None of them needs a
 * real thread to prove — the session takes its worker from a factory and its clock from the test's —
 * which is the reason the lifecycle is a class and not a component.
 */

const WORKER_ASSET = 'widgets/tally/worker.js';

function workerPackage(overrides: Partial<WidgetDefinition> = {}): WidgetPackageDefinition {
	return {
		id: 'workspace.tally',
		version: '1.0.0',
		displayName: 'Party tally',
		migrations: [],
		portabilityWarnings: [],
		assets: [
			{
				path: WORKER_ASSET,
				kind: 'worker',
				entrypoint: true,
				content: 'function render(props) { return { rows: [] }; }',
				contentEncoding: 'utf-8',
			},
		],
		widgets: [
			{
				type: 'party-tally',
				version: '1.0.0',
				displayName: 'Party tally',
				author: 'workspace',
				renderEntrypoint: {
					runtime: 'custom-html-js',
					sandbox: 'worker',
					template: 'data-table',
					assetPath: WORKER_ASSET,
					hostApiVersion: CUSTOM_WIDGET_HOST_API_VERSION,
				},
				supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
				defaultSize: { width: 320, height: 200 },
				minSize: { width: 160, height: 100 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				dataQueries: [
					{
						id: 'party',
						label: 'Party',
						source: 'visible-characters',
						requiredCapability: 'viewer',
						audience: 'shared',
					},
				],
				configurationSchema: { type: 'object', additionalProperties: true },
				capabilitySets: ['viewer', 'operator'],
				commands: [
					{
						type: 'session.set-workflow',
						displayName: 'Set workflow',
						requiredCapability: 'operator',
						payloadSchema: { type: 'object', additionalProperties: true },
						writesTo: 'session',
					},
				],
				events: [],
				hostPermissions: [],
				...overrides,
			},
		],
	};
}

/** Install the fixture the way a DM would, so the schema validates the worker entrypoint for real. */
function installed(pkg: WidgetPackageDefinition): {
	state: CoreStateSlice;
	definition: WidgetDefinition;
} {
	const result = dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), makeEnvironment(), {
		type: 'widget.package.install',
		actorId: DM_ACTOR.id,
		payload: { package: pkg },
	});
	if (result.status !== 'accepted') {
		throw new Error(`fixture rejected: ${JSON.stringify(result.rejection)}`);
	}
	const definition = findWidgetDefinition(result.nextState.widgets, pkg.widgets[0].type);
	if (!definition) throw new Error('fixture did not install');
	return { state: result.nextState, definition };
}

/** The other side of the protocol: a worker that only does what a test tells it to. */
class FakeWorker implements WidgetWorkerLike {
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	readonly sent: Record<string, unknown>[] = [];
	terminated = 0;

	postMessage(message: unknown): void {
		this.sent.push(message as Record<string, unknown>);
	}

	terminate(): void {
		this.terminated += 1;
	}

	/** Speak as the guest would. */
	say(kind: string, body: Record<string, unknown> = {}): void {
		this.onmessage?.({
			data: {
				channel: WIDGET_HOST_CHANNEL,
				hostApiVersion: WIDGET_HOST_API_VERSION,
				kind,
				...body,
			},
		});
	}

	kinds(): string[] {
		return this.sent.map((message) => String(message.kind));
	}

	last(kind: string): Record<string, unknown> | undefined {
		return [...this.sent].reverse().find((message) => message.kind === kind);
	}
}

function session(
	definition: WidgetDefinition,
	overrides: Partial<ConstructorParameters<typeof WidgetWorkerSession>[0]> = {},
): { session: WidgetWorkerSession; worker: FakeWorker; states: WorkerHostState[] } {
	const worker = new FakeWorker();
	const states: WorkerHostState[] = [];
	const created = new WidgetWorkerSession({
		widgetInstanceId: 'widget-1',
		siblingInstanceIds: ['widget-1', 'widget-2'],
		definition,
		approvedPermissions: [],
		code: 'noop',
		module: false,
		createWorker: () => worker,
		onChange: (state) => states.push(state),
		...overrides,
	});
	return { session: created, worker, states };
}

describe('assembleWorkerScript', () => {
	it('wraps the package entrypoint in the guest protocol and the render shim', () => {
		const pkg = workerPackage();
		const { definition } = installed(pkg);
		const assembled = assembleWorkerScript(pkg, definition);
		expect(assembled.problem).toBeNull();
		expect(assembled.code).toContain('self.dndtoolsWidget');
		expect(assembled.code).toContain('function render(props)');
		expect(assembled.code).toContain("typeof render === 'function'");
		expect(assembled.module).toBe(false);
	});

	it('runs an ESM entrypoint as a module worker', () => {
		const pkg = workerPackage();
		pkg.assets[0].content = 'export function render() { return { rows: [] }; }';
		const { definition } = installed(pkg);
		expect(assembleWorkerScript(pkg, definition).module).toBe(true);
	});

	it('reports a package that names no code, names missing code, or ships empty code', () => {
		const pkg = workerPackage();
		const { definition } = installed(pkg);
		const undeclared = { ...definition, renderEntrypoint: undefined };
		expect(assembleWorkerScript(pkg, undeclared).problem).toBe('entrypoint-not-declared');
		expect(assembleWorkerScript({ ...pkg, assets: [] }, definition).problem).toBe(
			'entrypoint-missing',
		);
		const empty = { ...pkg, assets: [{ ...pkg.assets[0], content: '   ' }] };
		expect(assembleWorkerScript(empty, definition).problem).toBe('no-code');
	});
});

describe('parseWorkerMessage', () => {
	it('drops anything that is not a v1 message of a known kind', () => {
		expect(parseWorkerMessage(null)).toEqual({ drop: 'not-host-protocol' });
		expect(parseWorkerMessage({ kind: 'ready' })).toEqual({ drop: 'not-host-protocol' });
		expect(
			parseWorkerMessage({ channel: WIDGET_HOST_CHANNEL, hostApiVersion: 2, kind: 'ready' }),
		).toEqual({ drop: 'version-mismatch' });
		expect(
			parseWorkerMessage({
				channel: WIDGET_HOST_CHANNEL,
				hostApiVersion: WIDGET_HOST_API_VERSION,
				kind: 'resize',
				height: 40,
			}),
		).toEqual({ drop: 'unknown-kind' });
		expect(
			parseWorkerMessage({
				channel: WIDGET_HOST_CHANNEL,
				hostApiVersion: WIDGET_HOST_API_VERSION,
				kind: 'dispatch',
				commandType: 'session.set-workflow',
			}),
		).toEqual({ drop: 'malformed' });
	});

	it('accepts a result and the three request kinds', () => {
		const envelope = { channel: WIDGET_HOST_CHANNEL, hostApiVersion: WIDGET_HOST_API_VERSION };
		expect(parseWorkerMessage({ ...envelope, kind: 'result', result: { rows: [] } })).toEqual({
			kind: 'result',
			result: { rows: [] },
		});
		expect(
			parseWorkerMessage({
				...envelope,
				kind: 'requestPermission',
				requestId: 'w1',
				capability: 'clipboard',
			}),
		).toEqual({ kind: 'requestPermission', requestId: 'w1', capability: 'clipboard' });
		expect(
			parseWorkerMessage({ ...envelope, kind: 'outbound', requestId: 'w2', url: 'https://x.test' }),
		).toEqual({
			kind: 'outbound',
			requestId: 'w2',
			url: 'https://x.test',
			destinationClass: null,
			payload: null,
		});
	});
});

describe('normalizeWorkerResult', () => {
	it('clamps the row count, truncates the strings and drops rows with no name', () => {
		const rows = Array.from({ length: MAX_WORKER_ROWS + 50 }, (_, index) => ({
			id: `r${index}`,
			primary: 'x'.repeat(MAX_WORKER_TEXT + 100),
		}));
		const result = normalizeWorkerResult({ rows: [...rows, { primary: '' }, 'not a row'] });
		expect(result.rows).toHaveLength(MAX_WORKER_ROWS);
		expect(result.rows[0].primary).toHaveLength(MAX_WORKER_TEXT);
	});

	it('keeps only the fields a row has, and only when they are usable', () => {
		const result = normalizeWorkerResult({
			header: 'Round 2',
			rows: [
				{ primary: 'Brannor', value: 18, max: 24, active: true, secondary: 'Bloodied', meta: 'PC' },
				{ primary: 'Ghost', value: Number.NaN, active: 'yes', extra: 'ignored' },
			],
		});
		expect(result.header).toBe('Round 2');
		expect(result.rows[0]).toEqual({
			id: 'row-0',
			primary: 'Brannor',
			secondary: 'Bloodied',
			meta: 'PC',
			value: 18,
			max: 24,
			active: true,
		});
		expect(result.rows[1]).toEqual({ id: 'row-1', primary: 'Ghost' });
	});

	it('gives a nameless result an honest empty label rather than a blank frame', () => {
		expect(normalizeWorkerResult(undefined).emptyLabel).toBe(
			'This widget returned nothing to show.',
		);
	});
});

describe('workerResultToTemplateData', () => {
	it('reports the result under the source the package declared and withholds nothing', () => {
		const { definition } = installed(workerPackage());
		const data = workerResultToTemplateData(
			normalizeWorkerResult({ rows: [{ primary: 'Brannor' }] }),
			definition,
			true,
		);
		expect(data.primary?.source).toBe('visible-characters');
		expect(data.primary?.withheld).toBeNull();
		expect(data.primary?.rows).toHaveLength(1);
		expect(data.isDm).toBe(true);
	});

	it('draws through the declared template, and a table when none is declared', () => {
		const { definition } = installed(workerPackage());
		expect(workerTemplateFor(definition)).toBe('data-table');
		expect(
			workerTemplateFor({
				...definition,
				renderEntrypoint: { runtime: 'custom-html-js', sandbox: 'worker', hostApiVersion: 1 },
			}),
		).toBe('data-table');
		expect(
			workerTemplateFor({
				...definition,
				renderEntrypoint: {
					runtime: 'custom-html-js',
					sandbox: 'worker',
					template: 'tracker',
					hostApiVersion: 1,
				},
			}),
		).toBe('tracker');
	});
});

describe('WidgetWorkerSession', () => {
	let definition: WidgetDefinition;

	beforeEach(() => {
		vi.useFakeTimers();
		definition = installed(workerPackage()).definition;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('sends the props once the worker says it is ready, and renders what comes back', () => {
		const { session: host, worker, states } = session(definition);
		host.start();
		host.render({ isDm: true });
		expect(worker.kinds()).toEqual([]);
		worker.say('ready');
		expect(worker.kinds()).toEqual(['render']);
		worker.say('result', { result: { rows: [{ primary: 'Brannor', value: 18 }] } });
		const last = states[states.length - 1];
		expect(last.phase).toBe('ready');
		expect(last.phase === 'ready' ? last.result?.rows[0].primary : null).toBe('Brannor');
	});

	it('terminates a worker that loops instead of answering, and shows the placeholder', () => {
		const { session: host, worker, states } = session(definition);
		host.start();
		worker.say('ready');
		host.render({ isDm: true });
		vi.advanceTimersByTime(WORKER_RESULT_TIMEOUT_MS + 1);
		expect(worker.terminated).toBe(1);
		const last = states[states.length - 1];
		expect(last).toEqual({ phase: 'failed', diagnostic: WORKER_COPY.timedOut });
		// The failure is isolated to this instance: its neighbour on the scene keeps rendering.
		expect(host.isolatedFrom()?.survivingWidgetInstanceIds).toEqual(['widget-2']);
		expect(host.isolatedFrom()?.coreStateAvailable).toBe(true);
		// A terminated worker is not spoken to again, whatever it manages to say afterwards.
		worker.say('result', { result: { rows: [{ primary: 'Too late' }] } });
		expect(states[states.length - 1].phase).toBe('failed');
	});

	it('terminates a worker that never starts', () => {
		const { session: host, worker, states } = session(definition);
		host.start();
		vi.advanceTimersByTime(60_000);
		expect(worker.terminated).toBe(1);
		expect(states[states.length - 1]).toEqual({
			phase: 'failed',
			diagnostic: WORKER_COPY.timedOut,
		});
	});

	it('says so plainly when the platform will not run a worker at all', () => {
		const { session: host, states } = session(definition, {
			createWorker: () => {
				throw new Error('worker-src blocked');
			},
		});
		host.start();
		expect(states[states.length - 1]).toEqual({
			phase: 'failed',
			diagnostic: WORKER_COPY.unsupported,
		});
	});

	it('shows a worker that threw as stopped rather than as empty', () => {
		const { session: host, worker, states } = session(definition);
		host.start();
		worker.say('ready');
		worker.say('error', { message: 'boom' });
		expect(worker.terminated).toBe(1);
		expect(states[states.length - 1]).toEqual({ phase: 'failed', diagnostic: WORKER_COPY.crashed });
	});

	it('refuses a capability nobody granted, and one no review could grant', () => {
		const { session: host, worker } = session(definition);
		host.start();
		worker.say('ready');
		worker.say('requestPermission', { requestId: 'w1', capability: 'clipboard' });
		expect(worker.last('result')?.result).toMatchObject({ decision: 'undeclared' });
		worker.say('requestPermission', { requestId: 'w2', capability: 'raw-vault-file' });
		expect(worker.last('result')?.result).toMatchObject({ decision: 'forbidden' });
		worker.say('requestPermission', { requestId: 'w3', capability: 'telepathy' });
		expect(worker.last('result')?.result).toMatchObject({ decision: 'unknown-capability' });
	});

	it('relays a declared command and refuses an undeclared one', () => {
		const relayed: string[] = [];
		const { session: host, worker } = session(definition, {
			onCommand: (type) => relayed.push(type),
		});
		host.start();
		worker.say('ready');
		worker.say('dispatch', { requestId: 'w1', commandType: 'session.set-workflow', payload: {} });
		expect(relayed).toEqual(['session.set-workflow']);
		expect(worker.last('result')?.result).toMatchObject({ accepted: true });
		worker.say('dispatch', { requestId: 'w2', commandType: 'vault.wipe', payload: {} });
		expect(relayed).toEqual(['session.set-workflow']);
		expect(worker.last('result')?.result).toMatchObject({ accepted: false });
	});

	it('evaluates an outbound request and never claims it was sent', () => {
		const { session: host, worker } = session(definition);
		host.start();
		worker.say('ready');
		worker.say('outbound', { requestId: 'w1', url: 'https://example.test/steal' });
		expect(worker.last('result')?.result).toMatchObject({ sent: false });
	});

	it('stops the worker when the widget goes away', () => {
		const { session: host, worker } = session(definition);
		host.start();
		worker.say('ready');
		host.stop();
		expect(worker.terminated).toBe(1);
	});
});

/**
 * Run an assembled script the way a worker would, in a context whose only globals are the ones a
 * worker has. This is what keeps the guest preamble honest: it is a STRING in the host's source, so
 * nothing else in the toolchain would ever notice a typo in it, and every data-only widget in the
 * app depends on it parsing and running.
 */
function runGuestScript(code: string): {
	posted: Record<string, unknown>[];
	send: (message: Record<string, unknown>) => void;
} {
	const posted: Record<string, unknown>[] = [];
	const sandbox: Record<string, unknown> = {
		postMessage: (message: Record<string, unknown>) => posted.push(message),
	};
	sandbox.self = sandbox;
	createContext(sandbox);
	runInContext(code, sandbox);
	return {
		posted,
		send: (message) => {
			const onmessage = sandbox.onmessage as ((event: { data: unknown }) => void) | undefined;
			onmessage?.({ data: message });
		},
	};
}

describe('the assembled worker script', () => {
	const envelope = { channel: WIDGET_HOST_CHANNEL, hostApiVersion: WIDGET_HOST_API_VERSION };

	it('announces itself and answers a render with its rows', () => {
		const pkg = workerPackage();
		pkg.assets[0].content =
			'function render(props) { return { rows: props.queries[0].rows, header: "Party" }; }';
		const { definition } = installed(pkg);
		const guest = runGuestScript(assembleWorkerScript(pkg, definition).code ?? '');
		expect(guest.posted[0]).toMatchObject({ ...envelope, kind: 'ready' });
		guest.send({
			...envelope,
			kind: 'render',
			props: { queries: [{ rows: [{ primary: 'Brannor' }] }] },
		});
		expect(guest.posted[1]).toMatchObject({ kind: 'result' });
		expect(normalizeWorkerResult((guest.posted[1] as { result: unknown }).result).rows[0]).toEqual({
			id: 'row-0',
			primary: 'Brannor',
		});
	});

	it('turns a thrown render into an error message rather than a silent stall', () => {
		const pkg = workerPackage();
		pkg.assets[0].content = 'function render() { throw new Error("no data"); }';
		const { definition } = installed(pkg);
		const guest = runGuestScript(assembleWorkerScript(pkg, definition).code ?? '');
		guest.send({ ...envelope, kind: 'render', props: {} });
		expect(guest.posted[1]).toMatchObject({ kind: 'error' });
	});

	it('drives a real session end to end, from installed package to rendered rows', () => {
		const pkg = workerPackage();
		pkg.assets[0].content =
			'function render(props) { return { rows: [{ primary: props.title }] }; }';
		const { definition } = installed(pkg);
		const code = assembleWorkerScript(pkg, definition).code ?? '';
		const states: WorkerHostState[] = [];
		// The guest posts synchronously as it runs, so its outbox is drained into the host by hand.
		let pump = () => {};
		const host = new WidgetWorkerSession({
			widgetInstanceId: 'widget-1',
			siblingInstanceIds: ['widget-1'],
			definition,
			approvedPermissions: [],
			code,
			module: false,
			createWorker: (script) => {
				const running = runGuestScript(script);
				const worker: WidgetWorkerLike = {
					postMessage: (message) => {
						running.send(message as Record<string, unknown>);
						pump();
					},
					terminate: () => {},
					onmessage: null,
					onerror: null,
				};
				pump = () => {
					while (running.posted.length > 0) {
						worker.onmessage?.({ data: running.posted.shift() });
					}
				};
				return worker;
			},
			onChange: (state) => states.push(state),
		});
		host.start();
		pump();
		host.render({ title: 'Party tally' });
		const last = states[states.length - 1];
		expect(last.phase).toBe('ready');
		expect(last.phase === 'ready' ? last.result?.rows[0].primary : null).toBe('Party tally');
		host.stop();
	});
});
