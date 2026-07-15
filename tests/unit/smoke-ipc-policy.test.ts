// @vitest-environment node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { STARTUP_REQUIRED_IPC, buildSmokeIpcPolicy, extractInvokeChannels, evaluateSmokeOutcome } =
	require('../../apps/gm-react/scripts/smoke-ipc-policy.cjs') as {
		STARTUP_REQUIRED_IPC: Record<string, boolean>;
		extractInvokeChannels(source: string): string[];
		buildSmokeIpcPolicy(source: string): Array<{
			channel: string;
			startupRequired: boolean;
			response: boolean | undefined;
		}>;
		evaluateSmokeOutcome(input: { consoleErrors: string[]; unexpectedPrivilegedCalls: string[] }): {
			ok: boolean;
			error?: string;
		};
	};

const preloadSource = fs.readFileSync(
	path.join(process.cwd(), 'apps', 'gm-react', 'electron', 'preload.cjs'),
	'utf8',
);

describe('desktop smoke IPC policy', () => {
	it('normally responds only to IPC required for renderer startup', () => {
		expect(STARTUP_REQUIRED_IPC).toEqual({
			'secure-store:available': false,
			'window:set-theme': true,
		});
		const policy = buildSmokeIpcPolicy(preloadSource);
		expect(policy.filter((entry) => entry.startupRequired).map((entry) => entry.channel)).toEqual(
			Object.keys(STARTUP_REQUIRED_IPC),
		);
		expect(policy.find((entry) => entry.channel === 'secure-store:set')?.startupRequired).toBe(
			false,
		);
		expect(
			policy.find((entry) => entry.channel === 'network-policy:allow-ai-origin')?.startupRequired,
		).toBe(false);
	});

	it('classifies every literal preload invocation and turns new capabilities into tripwires', () => {
		const source = `${preloadSource}\nipcRenderer.invoke('future:privileged', { value: true });`;
		const policy = buildSmokeIpcPolicy(source);
		expect(extractInvokeChannels(source)).toContain('future:privileged');
		expect(policy.find((entry) => entry.channel === 'future:privileged')).toMatchObject({
			startupRequired: false,
		});
	});

	it('rejects a dynamic invoke channel instead of leaving it untracked', () => {
		expect(() => buildSmokeIpcPolicy(`${preloadSource}\nipcRenderer.invoke(channelName);`)).toThrow(
			/string literal/,
		);
	});

	it('fails either desktop pass on console errors or unexpected privileged IPC', () => {
		expect(
			evaluateSmokeOutcome({
				consoleErrors: ['renderer exploded'],
				unexpectedPrivilegedCalls: [],
			}),
		).toEqual({ ok: false, error: 'renderer emitted console errors' });
		expect(
			evaluateSmokeOutcome({
				consoleErrors: [],
				unexpectedPrivilegedCalls: ['secure-store:get'],
			}),
		).toEqual({
			ok: false,
			error: 'unexpected privileged IPC during smoke: secure-store:get',
		});
		expect(evaluateSmokeOutcome({ consoleErrors: [], unexpectedPrivilegedCalls: [] })).toEqual({
			ok: true,
		});
	});
});
