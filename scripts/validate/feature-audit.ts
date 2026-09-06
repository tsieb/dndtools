// Feature-inventory drift audit.
//
// `docs/requirements/FEATURE-GAPS.md` is a per-surface INVENTORY (RC-STB-3.3): one row per
// reachable surface, and every "honest limit" in a row carries an evidence anchor
// `` `path` › `string` `` — a literal string that must still exist in that file for the limit to
// still be true. This tool:
//
//   1. Parses the inventory tables (the rows between the `inventory:start`/`inventory:end`
//      markers) and ASSERTS every anchor string is still present in its named file. A closed
//      limit, a moved file, or a reworded in-app message fails the check instead of rotting in
//      the ledger.
//   2. Probes live code for stub markers (TODO/placeholder/"not yet"/…) to catch stubs the
//      inventory doesn't mention (drift the other way).
//   3. Probes each React screen for a real core-dispatch wiring reference, flagging any screen
//      with no wiring as "presentation-only — verify".
//   4. Asserts ZERO imports of `runtime/mockCampaign` across apps/gm-react/src — the mock module
//      is deleted and any importer is a real regression.
//
// Output: a structured object (rendered into the HTML report) + a standalone markdown/JSON pair
// under the log dir. Probes 2 and 3 are informational (warn at worst); the anchor assertion and
// the mockCampaign probe FAIL the check outright.

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { CheckOutcome } from './types.ts';

const GM_REACT = 'apps/gm-react';
const SRC = `${GM_REACT}/src`;
const GAPS = 'docs/requirements/FEATURE-GAPS.md';

// High-signal stub phrases only. We deliberately do NOT match a bare "placeholder",
// because in this codebase it is overwhelmingly the HTML `placeholder=` input
// attribute, not a stubbed feature — matching it drowns the real signal.
const STUB_PATTERNS: { key: string; re: RegExp }[] = [
	{ key: 'TODO/FIXME', re: /\b(TODO|FIXME|XXX|HACK)\b/ },
	{ key: 'coming-soon', re: /coming soon/i },
	{ key: 'not-wired', re: /not (yet )?(implemented|wired|available|supported|core-backed)\b/i },
	{ key: 'stub', re: /\bstub(bed)?\b/i },
	{
		key: 'no-backend',
		re: /no (import |generation )?(command|backend)( exists| is wired)|nothing dispatches|no core backing/i,
	},
];

// Files whose stub markers are noise (tests assert on the words; the gaps ledger
// itself is documentation, not a runtime stub).
const NOISE = /\.(test|spec)\.[tj]sx?$/;

const WIRING_RE =
	/useRuntime|useDispatch|useCore|useSession|useCloudSync|useAuth|runtime\.dispatch|\bdispatch\(|__rt\b|from ['"](?:@dndtools\/core|\.\.?\/[^'"]*runtime)/;

// The demo/mock data module being eliminated: any `import … from '…runtime/mockCampaign'` under
// apps/gm-react/src is a regression once the module is deleted. Matches static + dynamic imports.
const MOCK_MODULE = 'runtime/mockCampaign';
const MOCK_IMPORT_RE =
	/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*runtime\/mockCampaign['"]/;

function walk(dir: string, out: string[] = []): string[] {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) {
			if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
			walk(full, out);
		} else if (/\.(tsx?|jsx?)$/.test(e.name)) {
			out.push(full);
		}
	}
	return out;
}

/** One `` `path` › `anchor` `` pair lifted from an inventory row's honest-limits cell. */
export interface LimitAnchor {
	/** The surface (first cell of the row) the limit belongs to. */
	surface: string;
	/** Repo-relative path named by the anchor. */
	file: string;
	/** The literal string that must still exist in `file`. */
	anchor: string;
	/** Set once checked: the anchor string was found in the file. */
	present?: boolean;
	/** Why it failed: the file is unreadable, or the string is gone. */
	reason?: 'file-missing' | 'anchor-missing';
}

const INVENTORY_START = '<!-- inventory:start -->';
const INVENTORY_END = '<!-- inventory:end -->';

// `` `docs/planning/RC_ROADMAP.md` › `Map combat is not on the map.` `` — the anchor grammar the
// ledger documents under "How to read a row". The path half must look like a path (a slash and an
// extension) so ordinary inline code in the prose is not mistaken for one.
const ANCHOR_RE = /`([^`\n]*\/[^`\n]*\.[a-z]+)`\s*›\s*`([^`\n]+)`/g;

/**
 * Lift every limit anchor out of the inventory tables. Rows outside the markers (the prose, the
 * "How to read a row" example) are ignored, so documentation about the grammar never asserts.
 */
export function extractLimitAnchors(gapsText: string): LimitAnchor[] {
	const out: LimitAnchor[] = [];
	let cursor = 0;
	for (;;) {
		const from = gapsText.indexOf(INVENTORY_START, cursor);
		if (from < 0) break;
		const to = gapsText.indexOf(INVENTORY_END, from);
		if (to < 0) break;
		const block = gapsText.slice(from + INVENTORY_START.length, to);
		cursor = to + INVENTORY_END.length;
		for (const line of block.split('\n')) {
			const row = line.trim();
			if (!row.startsWith('|')) continue;
			if (/^\|[\s|:-]+\|$/.test(row)) continue; // separator
			const cells = row.split('|').slice(1, -1);
			const surface = (cells[0] ?? '').replace(/[`*]/g, '').trim();
			if (!surface || /^surface$/i.test(surface) || /^layer$/i.test(surface)) continue;
			ANCHOR_RE.lastIndex = 0;
			let m: RegExpExecArray | null;
			while ((m = ANCHOR_RE.exec(row))) out.push({ surface, file: m[1], anchor: m[2] });
		}
	}
	return out;
}

/** Check each anchor against the tree; returns the same list with `present`/`reason` filled in. */
export function checkAnchors(repoRoot: string, anchors: LimitAnchor[]): LimitAnchor[] {
	const cache = new Map<string, string | null>();
	return anchors.map((a) => {
		if (!cache.has(a.file)) {
			try {
				cache.set(a.file, readFileSync(path.join(repoRoot, a.file), 'utf8'));
			} catch {
				cache.set(a.file, null);
			}
		}
		const text = cache.get(a.file) ?? null;
		if (text === null) return { ...a, present: false, reason: 'file-missing' as const };
		if (!text.includes(a.anchor))
			return { ...a, present: false, reason: 'anchor-missing' as const };
		return { ...a, present: true };
	});
}

export interface FeatureAuditResult {
	/** Every honest-limit anchor in the inventory, checked against the tree. */
	limitAnchors: LimitAnchor[];
	/** Anchors whose string is gone (or whose file is) — a HARD failure. */
	staleAnchors: LimitAnchor[];
	stubMarkers: { file: string; line: number; key: string; text: string }[];
	stubMarkerTotal: number;
	screens: { file: string; wired: boolean }[];
	unwiredScreens: string[];
	/** Files still importing `runtime/mockCampaign` — must be EMPTY (the module is slated for deletion). */
	mockCampaignImporters: string[];
	generatedFrom: string;
	/** The ledger could not be read. An empty `limitAnchors` then means "unknown", not "none". */
	gapsMissing: boolean;
}

export function auditFeatures(repoRoot: string): FeatureAuditResult {
	const gapsPath = path.join(repoRoot, GAPS);
	let gapsText: string;
	let gapsMissing = false;
	try {
		gapsText = readFileSync(gapsPath, 'utf8');
	} catch {
		// A moved/renamed ledger must not read as "no declared stubs" — that is a silent
		// false negative. Surface it; the caller escalates it to a warn.
		gapsText = '';
		gapsMissing = true;
	}
	const limitAnchors = checkAnchors(repoRoot, extractLimitAnchors(gapsText));
	const staleAnchors = limitAnchors.filter((a) => !a.present);

	const files = walk(path.join(repoRoot, SRC));
	const stubMarkers: FeatureAuditResult['stubMarkers'] = [];
	for (const file of files) {
		if (NOISE.test(file)) continue;
		const rel = path.relative(repoRoot, file);
		const lines = readFileSync(file, 'utf8').split('\n');
		lines.forEach((text, i) => {
			for (const { key, re } of STUB_PATTERNS) {
				if (re.test(text)) {
					stubMarkers.push({ file: rel, line: i + 1, key, text: text.trim().slice(0, 140) });
					break;
				}
			}
		});
	}

	// Mock-elimination probe: NOTHING may import runtime/mockCampaign. Scans EVERY source file
	// (including tests — a test importing the mock breaks the moment the module is deleted).
	const mockCampaignImporters: string[] = [];
	for (const file of files) {
		const rel = path.relative(repoRoot, file);
		if (rel.replace(/\\/g, '/').includes(`${MOCK_MODULE}.`)) continue; // the module itself
		if (MOCK_IMPORT_RE.test(readFileSync(file, 'utf8'))) mockCampaignImporters.push(rel);
	}
	mockCampaignImporters.sort();

	// Screen wiring probe. Since the STB-2 splits a route surface is EITHER `screens/Name.tsx` OR
	// `screens/name/index.tsx`; both shapes are scanned so a split screen does not silently drop out
	// of the probe. Test files that happen to sit beside a screen are not surfaces.
	// Allowlist: surfaces that are core-free BY DESIGN. WikiReader is the chrome-less PUBLIC wiki
	// reader — unauthenticated, no local vault/runtime, it only fetches published pages from the
	// app-api. Flagging it as "unwired" is a false positive, so it is excluded from the probe.
	const NON_CORE_SCREENS = new Set(['WikiReader.tsx']);
	const appDir = path.join(repoRoot, SRC, 'screens');
	const screens: FeatureAuditResult['screens'] = [];
	try {
		for (const name of readdirSync(appDir)) {
			const full = path.join(appDir, name);
			if (statSync(full).isDirectory()) {
				const entry = path.join(full, 'index.tsx');
				try {
					if (!statSync(entry).isFile()) continue;
				} catch {
					continue; // a helper directory with no screen entry point
				}
				// A split screen's `index.tsx` is often a barrel that only re-exports; the dispatch
				// lives in the sibling parts. The SURFACE is wired if any of its own files is, so the
				// probe reads the whole directory rather than the entry file alone.
				const parts = walk(full).filter((f) => !NOISE.test(f));
				screens.push({
					file: path.relative(repoRoot, entry),
					wired: parts.some((f) => WIRING_RE.test(readFileSync(f, 'utf8'))),
				});
				continue;
			}
			if (!/\.tsx$/.test(name)) continue;
			if (NOISE.test(name)) continue;
			// Screen components are PascalCase; skip obvious non-screens.
			if (!/^[A-Z]/.test(name)) continue;
			if (NON_CORE_SCREENS.has(name)) continue;
			const content = readFileSync(full, 'utf8');
			screens.push({ file: path.relative(repoRoot, full), wired: WIRING_RE.test(content) });
		}
	} catch {
		/* app dir shape may differ */
	}
	screens.sort((a, b) => a.file.localeCompare(b.file));

	return {
		limitAnchors,
		staleAnchors,
		stubMarkers: stubMarkers.slice(0, 200),
		stubMarkerTotal: stubMarkers.length,
		screens,
		unwiredScreens: screens.filter((s) => !s.wired).map((s) => s.file),
		mockCampaignImporters,
		generatedFrom: GAPS,
		gapsMissing,
	};
}

function toMarkdown(r: FeatureAuditResult): string {
	const lines: string[] = ['# Feature-inventory drift audit', ''];
	lines.push(
		`Source of truth: \`${r.generatedFrom}\` (the surface inventory) + live code probes.`,
		'',
	);

	lines.push(`## Honest-limit anchors (${r.limitAnchors.length} declared)`, '');
	if (r.gapsMissing) {
		lines.push(
			`⚠ **Ledger not found at \`${r.generatedFrom}\`.** The declared-limit list is UNKNOWN, ` +
				'not empty — fix the path before trusting this section.',
		);
	} else if (r.staleAnchors.length) {
		lines.push('✗ **These limits no longer match the tree — update the inventory row:**');
		for (const a of r.staleAnchors)
			lines.push(
				`- **${a.surface}** — \`${a.file}\` ` +
					(a.reason === 'file-missing' ? 'is unreadable' : `no longer contains "${a.anchor}"`),
			);
	} else if (r.limitAnchors.length) {
		lines.push('✓ Every declared honest limit is still evidenced by its named file.');
	} else {
		lines.push('_No honest limits declared — verify the inventory tables are still parseable._');
	}
	lines.push('');

	lines.push(`## Stub markers in code (${r.stubMarkerTotal} total)`, '');
	if (r.stubMarkers.length) {
		const byKey: Record<string, number> = {};
		for (const m of r.stubMarkers) byKey[m.key] = (byKey[m.key] ?? 0) + 1;
		lines.push(
			'Counts: ' +
				Object.entries(byKey)
					.map(([k, n]) => `${k}=${n}`)
					.join(', '),
			'',
		);
		for (const m of r.stubMarkers.slice(0, 60))
			lines.push(`- \`${m.file}:${m.line}\` [${m.key}] ${m.text}`);
		if (r.stubMarkerTotal > 60) lines.push(`- … and ${r.stubMarkerTotal - 60} more (see JSON).`);
	} else lines.push('_No stub markers found._');
	lines.push('');

	lines.push(`## mockCampaign imports (must be zero — module slated for deletion)`, '');
	if (r.mockCampaignImporters.length) {
		lines.push('✗ **These files still import `runtime/mockCampaign`:**');
		r.mockCampaignImporters.forEach((f) => lines.push(`- \`${f}\``));
	} else {
		lines.push('✓ Nothing imports `runtime/mockCampaign`.');
	}
	lines.push('');

	lines.push(`## Screen wiring (${r.screens.length} route surfaces)`, '');
	if (r.unwiredScreens.length) {
		lines.push(
			'⚠ No core-dispatch reference found — verify these are intentionally presentation-only:',
		);
		r.unwiredScreens.forEach((s) => lines.push(`- \`${s}\``));
	} else {
		lines.push('✓ Every scanned screen references a core-dispatch wiring path.');
	}
	lines.push('');
	return lines.join('\n');
}

export async function runFeatureAudit(opts: {
	repoRoot: string;
	writeTo?: string;
}): Promise<CheckOutcome> {
	const r = auditFeatures(opts.repoRoot);
	if (opts.writeTo) {
		mkdirSync(opts.writeTo, { recursive: true });
		writeFileSync(path.join(opts.writeTo, 'feature-audit.md'), toMarkdown(r));
		writeFileSync(path.join(opts.writeTo, 'feature-audit.json'), JSON.stringify(r, null, 2));
	}
	const parts = [
		r.gapsMissing
			? `ledger MISSING at ${r.generatedFrom}`
			: `${r.limitAnchors.length} declared limits (${r.staleAnchors.length} stale)`,
		`${r.stubMarkerTotal} code markers`,
		`${r.unwiredScreens.length}/${r.screens.length} screens need wiring review`,
	];
	if (r.staleAnchors.length) {
		// A limit that no longer matches the tree means the ledger is lying in one direction or the
		// other: either the limit was closed and nobody updated the row, or the evidence moved.
		parts.push(
			`${r.staleAnchors.length} stale honest-limit anchor(s): ` +
				r.staleAnchors.map((a) => `${a.surface} → ${a.file} :: "${a.anchor}"`).join('; '),
		);
		return { status: 'fail', summary: parts.join('; '), detail: r };
	}
	if (r.mockCampaignImporters.length) {
		// The one HARD assertion: the failure message names EXACTLY which files still import it.
		parts.push(
			`runtime/mockCampaign still imported by ${r.mockCampaignImporters.length} file(s): ` +
				r.mockCampaignImporters.join(', '),
		);
		return { status: 'fail', summary: parts.join('; '), detail: r };
	}
	// Informational: warn if there is anything worth a human glance, else pass.
	const status = r.gapsMissing || r.unwiredScreens.length ? 'warn' : 'pass';
	return { status, summary: parts.join('; '), detail: r };
}

// Standalone entrypoint: `pnpm feature-audit` / `tsx scripts/validate/feature-audit.ts`
const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
	const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
	const r = auditFeatures(repoRoot);
	console.log(toMarkdown(r));
	const declared = r.gapsMissing
		? 'ledger MISSING'
		: `${r.limitAnchors.length} declared limits (${r.staleAnchors.length} stale)`;
	console.log(
		`\nSummary: ${declared} · ${r.stubMarkerTotal} code markers · ` +
			`${r.unwiredScreens.length}/${r.screens.length} screens need wiring review`,
	);
	if (r.mockCampaignImporters.length) {
		console.error(
			`\nFAIL: runtime/mockCampaign still imported by ${r.mockCampaignImporters.length} file(s): ` +
				r.mockCampaignImporters.join(', '),
		);
	}
	if (r.staleAnchors.length) {
		console.error(
			`\nFAIL: ${r.staleAnchors.length} honest-limit anchor(s) no longer match the tree:\n` +
				r.staleAnchors
					.map((a) => `  - ${a.surface}: ${a.file} :: "${a.anchor}" (${a.reason})`)
					.join('\n'),
		);
	}
	if (r.gapsMissing || r.mockCampaignImporters.length || r.staleAnchors.length)
		process.exitCode = 1;
}
