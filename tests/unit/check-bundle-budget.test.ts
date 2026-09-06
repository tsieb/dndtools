import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
	analyzeBundleDist,
	classifyBundleAssets,
	totalCoreGzipBytes,
	type BundleAsset,
} from '../../scripts/check-bundle-budget';

// RC-ENG-1.2 — the bundle budget gate must classify assets from the BUILT html (what the browser
// actually fetches eagerly), never guess from filenames, and it must fail closed on a missing/empty
// build rather than silently grading zero bytes as a pass.

describe('classifyBundleAssets — route-level classification from the built index.html', () => {
	it('treats a module script and a modulepreload link as CORE (eager)', () => {
		const html = `
			<script type="module" crossorigin src="/assets/index-abc.js"></script>
			<link rel="modulepreload" crossorigin href="/assets/vendor-react-xyz.js">
			<link rel="stylesheet" href="/assets/index.css">
		`;
		const eager = classifyBundleAssets(html, [
			'index-abc.js',
			'vendor-react-xyz.js',
			'lazy-chunk.js',
		]);
		expect(eager).toEqual(new Set(['index-abc.js', 'vendor-react-xyz.js']));
	});

	it('never classifies a chunk absent from the html as core, even if it is a valid asset file', () => {
		const html = `<script type="module" src="/assets/index-abc.js"></script>`;
		const eager = classifyBundleAssets(html, ['index-abc.js', 'route-chunk.js']);
		expect(eager.has('route-chunk.js')).toBe(false);
	});
});

describe('analyzeBundleDist + totalCoreGzipBytes — real filesystem fixture', () => {
	let distDir: string;

	afterEach(() => {
		if (distDir) rmSync(distDir, { recursive: true, force: true });
	});

	function makeDist(): string {
		const dir = mkdtempSync(join(tmpdir(), 'bundle-budget-test-'));
		mkdirSync(join(dir, 'assets'));
		writeFileSync(join(dir, 'assets', 'index-abc.js'), 'x'.repeat(1000));
		writeFileSync(join(dir, 'assets', 'lazy-route.js'), 'y'.repeat(5000));
		writeFileSync(
			join(dir, 'index.html'),
			`<!doctype html><script type="module" src="/assets/index-abc.js"></script>`,
		);
		return dir;
	}

	it('classifies the entry script as core and the unreferenced chunk as lazy, gzip-sized', () => {
		distDir = makeDist();
		const assets = analyzeBundleDist(distDir);
		const byFile = new Map(assets.map((a: BundleAsset) => [a.file, a]));
		expect(byFile.get('index-abc.js')?.category).toBe('core');
		expect(byFile.get('lazy-route.js')?.category).toBe('lazy');
		expect(byFile.get('index-abc.js')?.gzipBytes).toBe(
			gzipSync(Buffer.from('x'.repeat(1000))).length,
		);
	});

	it('sums only CORE assets for the budget-graded total', () => {
		distDir = makeDist();
		const assets = analyzeBundleDist(distDir);
		const core = assets.filter((a) => a.category === 'core');
		expect(totalCoreGzipBytes(assets)).toBe(core.reduce((sum, a) => sum + a.gzipBytes, 0));
		expect(totalCoreGzipBytes(assets)).toBeLessThan(
			assets.reduce((sum, a) => sum + a.gzipBytes, 0),
		);
	});

	it('fails closed on a directory with no build output (missing assets/)', () => {
		const emptyDir = mkdtempSync(join(tmpdir(), 'bundle-budget-empty-'));
		try {
			expect(() => analyzeBundleDist(emptyDir)).toThrow(/not a built app/);
		} finally {
			rmSync(emptyDir, { recursive: true, force: true });
		}
	});

	it('fails closed on an assets directory with no JS files', () => {
		const dir = mkdtempSync(join(tmpdir(), 'bundle-budget-nojs-'));
		try {
			mkdirSync(join(dir, 'assets'));
			writeFileSync(join(dir, 'index.html'), '<!doctype html>');
			expect(() => analyzeBundleDist(dir)).toThrow(/no JS assets/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
