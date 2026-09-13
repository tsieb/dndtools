import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	collectFindings,
	compareToBaseline,
	defaultRoots,
	loadBaseline,
	tally,
	type Baseline,
	type Finding,
	type RuleId,
} from '../../scripts/emphasis-lint';

// RC-ENG-8.4: fixture tests for scripts/emphasis-lint.ts. Each rule is proven to fire on a planted
// violation (naming file and line) and to stay quiet on its exemptions; the last suite holds the
// real tree to the committed baseline, which may only shrink.

// The repo root is three levels up from tests/unit.
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const SRC = 'apps/gm-react/src';
const TYPOGRAPHY =
	':root {\n\t--text-sm: 0.8125rem;\n\t--text-md: 1.0625rem;\n\t--text-xl: 1.5rem;\n}\n';

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Write `files` (paths relative to the app's src) into a temp repo and lint it. */
function lint(files: Record<string, string[]>, rule: RuleId): Finding[] {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emphasis-lint-'));
	tempDirs.push(root);
	const roots = defaultRoots(root);
	fs.mkdirSync(path.dirname(roots.typographyFile), { recursive: true });
	fs.writeFileSync(roots.typographyFile, TYPOGRAPHY);
	for (const [rel, lines] of Object.entries(files)) {
		const full = path.join(roots.srcRoot, rel);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, `${lines.join('\n')}\n`);
	}
	return collectFindings(roots).filter((finding) => finding.rule === rule);
}

describe('display-face-below-24px', () => {
	const rule = 'display-face-below-24px';

	it('flags a font shorthand that sets the display face below 24px, naming file and line', () => {
		const findings = lint(
			{
				'screens/Title.tsx': [
					"import { T } from '../app/screen-kit';",
					'export function Title() {',
					'\treturn <h2 style={{ font: `700 14px ${T.disp}` }}>Title</h2>;',
					'}',
				],
			},
			rule,
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({ file: `${SRC}/screens/Title.tsx`, line: 3, weight: 1 });
		expect(findings[0].message).toMatch(/14px/);
	});

	it('resolves --text-* tokens, fontFamily + fontSize pairs, and either branch of a ternary', () => {
		const findings = lint(
			{
				'ds/Cards.jsx': [
					'export function Cards({ phone }) {',
					'\treturn (',
					'\t\t<div>',
					"\t\t\t<h3 style={{ font: '700 var(--text-md)/1.2 var(--font-display)' }}>A</h3>",
					"\t\t\t<h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)' }}>B</h3>",
					"\t\t\t<h3 style={{ fontFamily: 'Cinzel, serif', fontSize: 12 }}>C</h3>",
					'\t\t\t<h3 style={{ font: `700 ${phone ? 17 : 28}px var(--font-display)` }}>D</h3>',
					'\t\t</div>',
					'\t);',
					'}',
				],
			},
			rule,
		);
		expect(findings.map((f) => [f.line, f.message.match(/set at (\S+);/)?.[1]])).toEqual([
			[4, '17px'],
			[5, '13px'],
			[6, '12px'],
			[7, '17px'],
		]);
	});

	it('stays quiet at heading sizes, in the UI face, and on sizes it cannot resolve', () => {
		const findings = lint(
			{
				'screens/Quiet.tsx': [
					"import { T } from '../app/screen-kit';",
					'export function Quiet({ size }: { size: number }) {',
					'\treturn (',
					'\t\t<div>',
					'\t\t\t<h1 style={{ font: `700 24px ${T.disp}` }}>A</h1>',
					"\t\t\t<h1 style={{ font: '700 var(--text-xl) var(--font-display)' }}>B</h1>",
					"\t\t\t<h1 style={{ font: '800 clamp(30px, 5vw, 76px) var(--font-display, serif)' }}>C</h1>",
					'\t\t\t<span style={{ font: `${size}px var(--font-display)` }}>D</span>',
					'\t\t\t<span style={{ font: `600 12px ${T.sans}` }}>E</span>',
					"\t\t\t<span style={{ fontFamily: 'var(--font-display)' }}>F</span>",
					'\t\t</div>',
					'\t);',
					'}',
				],
			},
			rule,
		);
		expect(findings).toEqual([]);
	});
});

describe('multiple-accent-primaries', () => {
	const rule = 'multiple-accent-primaries';

	it('flags two primaries in one region at the second one, naming both lines', () => {
		const findings = lint(
			{
				'screens/Save.tsx': [
					"import { Button } from '../ds';",
					'export function Save() {',
					'\treturn (',
					'\t\t<div>',
					'\t\t\t<Button variant="primary">Save</Button>',
					'\t\t\t<Button variant="primary">Publish</Button>',
					'\t\t</div>',
					'\t);',
					'}',
				],
			},
			rule,
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({ file: `${SRC}/screens/Save.tsx`, line: 6, weight: 1 });
		expect(findings[0].message).toMatch(/line 5.*line 6/);
	});

	it('counts SegmentedControl, a conditional primary variant and an inline accent-filled button', () => {
		const findings = lint(
			{
				'screens/Tools.tsx': [
					"import { Button, SegmentedControl } from '../ds';",
					"import { T } from '../app/screen-kit';",
					'export function Tools({ live }: { live: boolean }) {',
					'\treturn (',
					'\t\t<div>',
					'\t\t\t<SegmentedControl value="a" options={[]} onChange={() => {}} />',
					"\t\t\t<Button variant={live ? 'secondary' : 'primary'}>Go live</Button>",
					'\t\t\t<button style={{ background: T.acc }}>Roll</button>',
					'\t\t</div>',
					'\t);',
					'}',
				],
			},
			rule,
		);
		expect(findings).toHaveLength(1);
		expect(findings[0].weight).toBe(2);
		expect(findings[0].message).toMatch(/^3 accent-filled primaries/);
	});

	it('judges a screen across components, files and barrel re-exports (Session in Standby)', () => {
		const findings = lint(
			{
				'screens/session/Lifecycle.tsx': [
					"import { Button, Card } from '../../ds';",
					'export function StandbyCard() {',
					'\treturn (',
					'\t\t<Card>',
					'\t\t\t<Button variant="primary">Go live</Button>',
					'\t\t</Card>',
					'\t);',
					'}',
				],
				'screens/session/Combat.tsx': [
					"import { Button, Panel } from '../../ds';",
					'export const CombatPanel = () => (',
					'\t<Panel>',
					'\t\t<Button variant="primary">Build encounter</Button>',
					'\t</Panel>',
					');',
				],
				'screens/session/parts.ts': [
					"export * from './Lifecycle';",
					"export { CombatPanel as Combat } from './Combat';",
				],
				'screens/session/index.tsx': [
					"import { StandbyCard, Combat } from './parts';",
					'export function Session() {',
					'\treturn (',
					'\t\t<main>',
					'\t\t\t<StandbyCard />',
					'\t\t\t<Combat />',
					'\t\t</main>',
					'\t);',
					'}',
				],
			},
			rule,
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({ file: `${SRC}/screens/session/index.tsx`, line: 6 });
		expect(findings[0].message).toContain('screens/session/Lifecycle.tsx:5');
		expect(findings[0].message).toContain('screens/session/Combat.tsx:4');
	});

	it('does not sum alternatives: ternaries, early returns, if/else and tab panes', () => {
		const findings = lint(
			{
				'screens/Alternatives.tsx': [
					"import { Button } from '../ds';",
					'export function Toggle({ live }: { live: boolean }) {',
					'\treturn live ? <Button variant="primary">End</Button> : <Button variant="primary">Go</Button>;',
					'}',
					'export function Loading({ busy }: { busy: boolean }) {',
					'\tif (busy) return <Button variant="primary">Cancel</Button>;',
					'\treturn <Button variant="primary">Start</Button>;',
					'}',
					'export function Branch({ mode }: { mode: string }) {',
					'\tlet action;',
					'\tif (mode === \'a\') action = <Button variant="primary">A</Button>;',
					'\telse action = <Button variant="primary">B</Button>;',
					'\treturn <div>{action}</div>;',
					'}',
					'export function Tabs({ tab }: { tab: string }) {',
					'\treturn (',
					'\t\t<div>',
					'\t\t\t{tab === \'notes\' && <Button variant="primary">New note</Button>}',
					'\t\t\t{tab === \'maps\' && <Button variant="primary">New map</Button>}',
					'\t\t</div>',
					'\t);',
					'}',
				],
			},
			rule,
		);
		expect(findings).toEqual([]);
	});

	it('treats a dialog as its own region', () => {
		const findings = lint(
			{
				'screens/Confirm.tsx': [
					"import { Button, Dialog } from '../ds';",
					'export function Page() {',
					'\treturn (',
					'\t\t<div>',
					'\t\t\t<Button variant="primary">Save</Button>',
					'\t\t\t<Dialog open footer={<Button variant="primary">Confirm</Button>} />',
					'\t\t</div>',
					'\t);',
					'}',
					'export function Crowded() {',
					'\treturn (',
					'\t\t<Dialog open>',
					'\t\t\t<Button variant="primary">One</Button>',
					'\t\t\t<Button variant="primary">Two</Button>',
					'\t\t</Dialog>',
					'\t);',
					'}',
				],
			},
			rule,
		);
		expect(findings).toHaveLength(1);
		expect(findings[0].line).toBe(14);
		expect(findings[0].message).toContain('the <Dialog> at line 12');
	});

	it('ignores tints, decoration and skip links', () => {
		const findings = lint(
			{
				'screens/Quiet.tsx': [
					"import { Button } from '../ds';",
					"import { T } from '../app/screen-kit';",
					'export function Quiet() {',
					'\treturn (',
					'\t\t<div>',
					'\t\t\t<a href="#main" data-skip-link="true" style={{ background: T.acc }}>Skip</a>',
					'\t\t\t<Button variant="primary">Save</Button>',
					'\t\t\t<Button variant="accent">Roll</Button>',
					'\t\t\t<Button variant="secondary">Cancel</Button>',
					"\t\t\t<span style={{ background: 'var(--color-accent)' }} />",
					"\t\t\t<button style={{ background: 'var(--color-accent-subtle)' }}>Tint</button>",
					'\t\t</div>',
					'\t);',
					'}',
				],
			},
			rule,
		);
		expect(findings).toEqual([]);
	});
});

describe('review regressions', () => {
	it.each(['12px / 1.2', '12px/ 1.2', '12px /1.2'])(
		'parses spaced shorthand line-height: %s',
		(size) => {
			const findings = lint(
				{
					'Title.tsx': [
						`export const Title = () => <h2 style={{ font: '700 ${size} var(--font-display)' }} />;`,
					],
				},
				'display-face-below-24px',
			);
			expect(findings).toHaveLength(1);
			expect(findings[0]).toMatchObject({ line: 1, weight: 1 });
		},
	);

	it.each([
		["font: '700 24px var(--font-display)', fontSize: 12", 1],
		["font: '700 12px var(--font-display)', fontSize: 24", 0],
		["fontSize: 12, font: '700 24px var(--font-display)'", 0],
		["fontSize: 24, font: '700 12px var(--font-display)'", 1],
		["font: '700 12px var(--font-display)', fontFamily: 'sans-serif'", 0],
	])('respects font declaration order: %s', (style, count) => {
		expect(
			lint(
				{ 'Title.tsx': [`export const Title = () => <h2 style={{ ${style} }} />;`] },
				'display-face-below-24px',
			),
		).toHaveLength(count);
	});

	it.each([
		["style={{ background: 'var(--color-accent)' }}", 1],
		['variant="secondary" style={{ backgroundColor: \'var(--color-accent)\' }}', 1],
		['variant="primary"', 1],
		["style={{ background: 'var(--color-accent-subtle)' }}", 0],
	])('counts DS inline fills with the real Button: %s', (props, count) => {
		const findings = lint(
			{
				'Button.jsx': fs
					.readFileSync(path.join(REPO_ROOT, SRC, 'ds/components/core/Button.jsx'), 'utf8')
					.split('\n'),
				'Page.tsx': [
					"import { Button } from './Button.jsx';",
					`export const Page = () => <div><Button ${props}>One</Button><Button ${props}>Two</Button></div>;`,
				],
			},
			'multiple-accent-primaries',
		);
		expect(findings).toHaveLength(count);
		if (count) expect(findings[0]).toMatchObject({ file: `${SRC}/Page.tsx`, line: 2, weight: 1 });
	});
});

describe('baseline', () => {
	it('fails a count that rises or a new file, and lets counts shrink', () => {
		const baseline: Baseline = {
			'display-face-below-24px': { 'a.tsx': 2 },
			'multiple-accent-primaries': { 'b.tsx': 1 },
		};
		const current: Baseline = {
			'display-face-below-24px': { 'a.tsx': 1, 'c.tsx': 1 },
			'multiple-accent-primaries': { 'b.tsx': 2 },
		};
		const { regressions, shrinkable } = compareToBaseline(current, baseline);
		expect(regressions).toEqual([
			{ rule: 'display-face-below-24px', file: 'c.tsx', count: 1, allowed: 0 },
			{ rule: 'multiple-accent-primaries', file: 'b.tsx', count: 2, allowed: 1 },
		]);
		expect(shrinkable).toEqual([
			{ rule: 'display-face-below-24px', file: 'a.tsx', count: 1, allowed: 2 },
		]);
	});

	it('counts a region by its surplus primaries', () => {
		const finding = (weight: number): Finding => ({
			rule: 'multiple-accent-primaries',
			file: 'x.tsx',
			line: 1,
			message: '',
			weight,
		});
		expect(tally([finding(2), finding(1)])['multiple-accent-primaries']).toEqual({ 'x.tsx': 3 });
	});

	it('rejects an unknown rule or a bad count', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emphasis-baseline-'));
		tempDirs.push(dir);
		const file = path.join(dir, 'baseline.json');
		fs.writeFileSync(file, JSON.stringify({ 'no-such-rule': {} }));
		expect(() => loadBaseline(file)).toThrow(/Unknown rule/);
		fs.writeFileSync(file, JSON.stringify({ 'display-face-below-24px': { 'a.tsx': 1.5 } }));
		expect(() => loadBaseline(file)).toThrow(/non-negative integer/);
	});

	it('holds the real tree to the committed baseline', () => {
		const roots = defaultRoots(REPO_ROOT);
		const baseline = loadBaseline(roots.baselineFile);
		if (!baseline) throw new Error('scripts/emphasis-baseline.json is missing.');
		const { regressions } = compareToBaseline(tally(collectFindings(roots)), baseline);
		expect(regressions).toEqual([]);
	}, 60_000);
});
