// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	auditFeatures,
	checkAnchors,
	extractLimitAnchors,
} from '../../scripts/validate/feature-audit';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LEDGER = path.join(REPO_ROOT, 'docs/requirements/FEATURE-GAPS.md');

describe('RC-STB-3.3 feature inventory audit', () => {
	it('parses honest-limit anchors out of the real inventory tables', () => {
		const anchors = extractLimitAnchors(readFileSync(LEDGER, 'utf8'));
		expect(anchors.length).toBeGreaterThan(20);
		// Every anchor names a repo-relative file and a non-empty evidence string, and belongs to a
		// surface — an anchor with no surface means the row parser drifted off the table.
		for (const a of anchors) {
			expect(a.surface).not.toBe('');
			expect(a.file).toMatch(/^(apps|packages|docs|scripts)\//);
			expect(a.anchor.length).toBeGreaterThan(3);
		}
		expect(anchors.map((a) => a.surface)).toContain('Scene editor');
	});

	it('ignores the anchor grammar documented in the prose outside the markers', () => {
		const text = readFileSync(LEDGER, 'utf8');
		const prose = text.slice(0, text.indexOf('<!-- inventory:start -->'));
		expect(extractLimitAnchors(prose)).toEqual([]);
	});

	it('finds every declared limit still evidenced in the live tree', () => {
		const r = auditFeatures(REPO_ROOT);
		expect(r.gapsMissing).toBe(false);
		expect(r.staleAnchors).toEqual([]);
		expect(r.limitAnchors.length).toBe(extractLimitAnchors(readFileSync(LEDGER, 'utf8')).length);
	});

	it('flags a limit whose evidence string has gone from its file', () => {
		const anchors = extractLimitAnchors(
			[
				'<!-- inventory:start -->',
				'| Surface | What it does | Honest limits | Evidence |',
				'| --- | --- | --- | --- |',
				'| Ghost | nothing | gone — `docs/requirements/FEATURE-GAPS.md` › `a string that is not in the ledger` |  |',
				'<!-- inventory:end -->',
			].join('\n'),
		);
		expect(anchors).toHaveLength(1);
		const checked = checkAnchors(REPO_ROOT, anchors);
		expect(checked[0].present).toBe(false);
		expect(checked[0].reason).toBe('anchor-missing');
	});

	it('flags a limit whose named file has moved away', () => {
		const checked = checkAnchors(REPO_ROOT, [
			{ surface: 'Ghost', file: 'apps/gm-react/src/screens/Deleted.tsx', anchor: 'anything' },
		]);
		expect(checked[0].present).toBe(false);
		expect(checked[0].reason).toBe('file-missing');
	});

	it('treats every route surface as wired, including the split directory screens', () => {
		const r = auditFeatures(REPO_ROOT);
		expect(r.screens.length).toBeGreaterThanOrEqual(20);
		expect(r.unwiredScreens).toEqual([]);
		expect(r.screens.map((s) => s.file)).toContain('apps/gm-react/src/screens/session/index.tsx');
	});

	it('keeps the ledger short enough to stay readable', () => {
		expect(readFileSync(LEDGER, 'utf8').split('\n').length).toBeLessThan(300);
	});
});
