// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	auth: {
		current: {
			status: 'signed-in' as string,
			user: { sub: 'account-a', email: 'a@example.com' } as {
				sub: string;
				email: string;
			} | null,
		},
	},
	fetchEntitlements: vi.fn(),
	pushPlan: vi.fn(),
}));

vi.mock('./config', () => ({ isAccountApiConfigured: true }));
vi.mock('./AuthContext', () => ({ useAuth: () => mocks.auth.current }));
vi.mock('./appApi', () => ({
	PLAN_IDS: ['hearth', 'lantern', 'beacon'],
	getEntitlements: mocks.fetchEntitlements,
	setPlan: mocks.pushPlan,
}));

import {
	EntitlementsProvider,
	OFFLINE_FALLBACK_MATRIX,
	type EntitlementsValue,
	useEntitlements,
} from './entitlements';
import type { FeatureMatrix, PlanId } from './appApi';

const MATRIX_A: FeatureMatrix = [
	{
		group: 'Account A',
		rows: [{ label: 'A feature', hearth: false, lantern: true, beacon: true }],
	},
];
const MATRIX_B: FeatureMatrix = [
	{
		group: 'Account B',
		rows: [{ label: 'B feature', hearth: false, lantern: false, beacon: true }],
	},
];

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

let latest: EntitlementsValue | null = null;
let root: Root;
let container: HTMLDivElement;

function Probe() {
	latest = useEntitlements();
	return null;
}

function current(): EntitlementsValue {
	if (!latest) throw new Error('Entitlements probe has not rendered.');
	return latest;
}

async function renderProvider() {
	await act(async () => {
		root.render(createElement(EntitlementsProvider, null, createElement(Probe)));
	});
}

function serverAnswer(plan: PlanId, features: FeatureMatrix, canChangePlan = true) {
	return { plan, features, simulated: canChangePlan, canChangePlan };
}

beforeEach(() => {
	(
		globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	window.localStorage.clear();
	mocks.fetchEntitlements.mockReset();
	mocks.pushPlan.mockReset();
	mocks.auth.current = {
		status: 'signed-in',
		user: { sub: 'account-a', email: 'a@example.com' },
	};
	latest = null;
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('account-isolated server entitlements', () => {
	it('stays on the free plan while account hydration is unresolved', async () => {
		window.localStorage.setItem('dndtools:react:plan', 'beacon');
		mocks.auth.current = { status: 'loading', user: null };

		await renderProvider();

		expect(current()).toMatchObject({ plan: 'hearth', loading: true, source: 'local' });
		expect(mocks.fetchEntitlements).not.toHaveBeenCalled();

		mocks.auth.current = { status: 'signed-out', user: null };
		await renderProvider();
		expect(current()).toMatchObject({ plan: 'beacon', loading: false, source: 'local' });
	});

	it('fails closed during an account switch and ignores the stale prior response', async () => {
		const accountA = deferred<ReturnType<typeof serverAnswer>>();
		const accountB = deferred<ReturnType<typeof serverAnswer>>();
		mocks.fetchEntitlements
			.mockImplementationOnce(() => accountA.promise)
			.mockImplementationOnce(() => accountB.promise);

		await renderProvider();
		expect(current()).toMatchObject({ plan: 'hearth', loading: true, source: 'local' });

		mocks.auth.current = {
			status: 'signed-in',
			user: { sub: 'account-b', email: 'b@example.com' },
		};
		await renderProvider();
		expect(current()).toMatchObject({ plan: 'hearth', loading: true, source: 'local' });
		expect(current().features).toBe(OFFLINE_FALLBACK_MATRIX);

		await act(async () => {
			accountA.resolve(serverAnswer('lantern', MATRIX_A));
			await accountA.promise;
		});
		expect(current()).toMatchObject({ plan: 'hearth', loading: true, source: 'local' });
		expect(window.localStorage.getItem('dndtools:react:entitlements:last:account-a')).toBeNull();

		await act(async () => {
			accountB.resolve(serverAnswer('beacon', MATRIX_B));
			await accountB.promise;
		});
		expect(current()).toMatchObject({ plan: 'beacon', loading: false, source: 'server' });
		expect(current().features).toEqual(MATRIX_B);
		expect(
			JSON.parse(window.localStorage.getItem('dndtools:react:entitlements:last:account-b') ?? ''),
		).toEqual({
			plan: 'beacon',
			features: MATRIX_B,
			canChangePlan: true,
			simulated: true,
		});
	});

	it('never falls back to a different account cache', async () => {
		mocks.fetchEntitlements.mockResolvedValueOnce(serverAnswer('lantern', MATRIX_A));
		await renderProvider();
		expect(current()).toMatchObject({ plan: 'lantern', source: 'server' });

		mocks.auth.current = {
			status: 'signed-in',
			user: { sub: 'account-b', email: 'b@example.com' },
		};
		mocks.fetchEntitlements.mockRejectedValueOnce(new Error('offline'));
		await renderProvider();

		expect(current()).toMatchObject({ plan: 'hearth', loading: false, source: 'local' });
		expect(current().features).toBe(OFFLINE_FALLBACK_MATRIX);
	});

	it('uses and caches the feature matrix returned by a plan change', async () => {
		mocks.fetchEntitlements.mockResolvedValueOnce(serverAnswer('lantern', MATRIX_A));
		await renderProvider();
		mocks.pushPlan.mockResolvedValueOnce(serverAnswer('beacon', MATRIX_B));

		await act(async () => current().setPlan('beacon'));

		expect(current()).toMatchObject({ plan: 'beacon', source: 'server', loading: false });
		expect(current().features).toEqual(MATRIX_B);
		expect(
			JSON.parse(window.localStorage.getItem('dndtools:react:entitlements:last:account-a') ?? ''),
		).toEqual({
			plan: 'beacon',
			features: MATRIX_B,
			canChangePlan: true,
			simulated: true,
		});
	});

	it('surfaces a disabled production plan endpoint and never calls it', async () => {
		mocks.fetchEntitlements.mockResolvedValueOnce(serverAnswer('hearth', MATRIX_A, false));
		await renderProvider();

		expect(current()).toMatchObject({
			plan: 'hearth',
			source: 'server',
			canChangePlan: false,
			simulated: false,
		});
		await expect(current().setPlan('lantern')).rejects.toThrow(/not available/i);
		expect(mocks.pushPlan).not.toHaveBeenCalled();
	});
});
