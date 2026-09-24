// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots: string[] = [];

/**
 * A stub `sdkmanager` that logs each call and fails the first `failures` calls of the given
 * kind, the way a truncated dl.google.com download does. It stages a partial download on
 * every failed install so the test can see the script clear it before retrying.
 */
function fixture(options: { installFailures?: number; licenceFailures?: number } = {}) {
	const root = mkdtempSync(join(tmpdir(), 'android-sdk-install-'));
	roots.push(root);
	const bin = join(root, 'bin');
	const sdk = join(root, 'sdk');
	mkdirSync(bin);
	mkdirSync(sdk);
	writeFileSync(
		join(bin, 'sdkmanager'),
		`#!/usr/bin/env bash
log=${JSON.stringify(join(root, 'calls.log'))}
if [[ "$1" == --licenses ]]; then
	kind=licences
	limit=${options.licenceFailures ?? 0}
	# Like the real tool, read an answer and close stdin so \`yes\` stops.
	read -r _ || true
else
	kind=install
	limit=${options.installFailures ?? 0}
	[[ -e "$ANDROID_HOME/.temp" ]] && echo "stale-temp" >>"$log"
fi
echo "$kind $*" >>"$log"
seen=$(grep -c "^$kind " "$log")
if ((seen <= limit)); then
	[[ "$kind" == install ]] && mkdir -p "$ANDROID_HOME/.temp/PackageOperation01"
	echo "Error reading Zip content from a SeekableByteChannel." >&2
	exit 1
fi
`,
		{ mode: 0o755 },
	);
	return { root, sdk, bin };
}

function run(env: ReturnType<typeof fixture>, packages = ['platforms;android-36', 'emulator']) {
	const result = spawnSync('bash', [resolve('scripts/android-sdk-install.sh'), ...packages], {
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${env.bin}:${process.env.PATH ?? ''}`,
			ANDROID_HOME: env.sdk,
			ANDROID_SDK_ROOT: env.sdk,
			ANDROID_SDK_INSTALL_RETRY_DELAY: '0',
		},
	});
	const logPath = join(env.root, 'calls.log');
	const calls = existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n') : [];
	return { ...result, calls };
}

afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('Android SDK install script', () => {
	it('accepts licences and installs every requested package in one call', () => {
		const result = run(fixture());
		expect(result.status, result.stderr).toBe(0);
		expect(result.calls).toEqual(['licences --licenses', 'install platforms;android-36 emulator']);
	});

	it('retries a truncated download after dropping the staged partial package', () => {
		const env = fixture({ installFailures: 2 });
		const result = run(env);
		expect(result.status, result.stderr).toBe(0);
		expect(result.calls.filter((call) => call.startsWith('install '))).toHaveLength(3);
		expect(result.calls).not.toContain('stale-temp');
		expect(result.stdout).toContain(
			'::warning::Android SDK package install failed (attempt 1 of 3)',
		);
	});

	it('still fails the job when every install attempt fails', () => {
		const result = run(fixture({ installFailures: 99 }));
		expect(result.status).not.toBe(0);
		expect(result.calls.filter((call) => call.startsWith('install '))).toHaveLength(3);
		expect(result.stderr).toContain('Android SDK package install failed after 3 attempts');
	});

	it('does not install anything when licence acceptance keeps failing', () => {
		const result = run(fixture({ licenceFailures: 99 }));
		expect(result.status).not.toBe(0);
		expect(result.calls.filter((call) => call.startsWith('install '))).toHaveLength(0);
		expect(result.stderr).toContain('Android SDK licence acceptance failed after 3 attempts');
	});

	it('refuses to run without a package list', () => {
		const result = run(fixture(), []);
		expect(result.status).toBe(2);
		expect(result.calls).toEqual([]);
	});
});
