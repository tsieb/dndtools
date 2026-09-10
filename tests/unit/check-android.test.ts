import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots: string[] = [];
function fixture(xml = '<resources/>', java = 'class Example {}', version = '0.3.5') {
	const root = mkdtempSync(join(tmpdir(), 'android-preflight-'));
	roots.push(root);
	const android = join(root, 'apps/gm-react/android');
	mkdirSync(join(android, 'app/src/main/res/values'), { recursive: true });
	writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
	writeFileSync(join(root, 'apps/gm-react/package.json'), JSON.stringify({ version }));
	writeFileSync(
		join(android, 'app/build.gradle'),
		String.raw`def androidVersionParts = (androidVersionName =~ /^(\d+)\.(\d+)\.(\d+)$/)`,
	);
	writeFileSync(join(android, 'app/src/main/res/values/colors.xml'), xml);
	writeFileSync(join(android, 'Example.java'), java);
	return root;
}
function run(root: string) {
	return spawnSync(process.execPath, [resolve('scripts/check-android.mjs'), root], {
		encoding: 'utf8',
	});
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('Android static preflight CLI', () => {
	it('accepts XML and unrelated catches without Java or an SDK', () => {
		const result = run(
			fixture(
				'<resources><!-- color-bg --></resources>',
				'catch (IOException | RuntimeException error) {}',
			),
		);
		expect(result.status, result.stderr).toBe(0);
	});
	it.each([
		'<!-- --color-bg --><resources/>',
		'<resources><color></resources>',
		'<resources value="&unknown;"/>',
	])('rejects malformed XML: %s', (xml) => {
		const result = run(fixture(xml));
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('colors.xml: invalid XML');
	});
	it.each([
		'IOException | SecurityException | RuntimeException',
		'java.lang.RuntimeException | java.lang.SecurityException',
		'Exception | IOException',
	])('rejects related catch alternatives: %s', (types) => {
		const result = run(fixture(undefined, `catch (\n${types}\n error) {}`));
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('invalid multi-catch');
	});
	it('ignores catches inside comments and string literals', () => {
		expect(
			run(
				fixture(
					undefined,
					'// catch (SecurityException | RuntimeException e) {}\nString s = "catch (SecurityException | RuntimeException e)";',
				),
			).status,
		).toBe(0);
	});
	it.each(['0.3.5-alpha.1', '0.3', 'v0.3.5', '0.3.5\n'])(
		'rejects non-contract versions: %s',
		(version) => {
			expect(run(fixture(undefined, undefined, version)).status).toBe(1);
		},
	);
	it('rejects root/app version divergence', () => {
		const root = fixture();
		writeFileSync(join(root, 'package.json'), '{"version":"0.3.6"}');
		expect(run(root).stderr).toContain('differs from root');
	});
	it('fails closed when Gradle stops enforcing the version contract', () => {
		// The preflight only stands in for Gradle while Gradle still asserts the same shape.
		// If build.gradle's own regex drifts, say so instead of silently checking the wrong thing.
		const root = fixture();
		writeFileSync(
			join(root, 'apps/gm-react/android/app/build.gradle'),
			String.raw`def androidVersionParts = (androidVersionName =~ /(\d+)\.(\d+)/)`,
		);
		const result = run(root);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('expected anchored major.minor.patch version contract');
	});
	it('fails closed on a missing Android tree', () => {
		const root = fixture();
		rmSync(join(root, 'apps/gm-react/android'), { recursive: true });
		expect(run(root).status).toBe(1);
	});
});
