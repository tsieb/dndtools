// Feature-gap drift audit (main-only, pragmatic).
//
// `docs/requirements/FEATURE-GAPS.md` is a *layered, historical* ledger: its old
// gap sections (§3–§7) were remediated by later dated update passes, so parsing
// them naively would report already-fixed work as "missing". This tool instead:
//
//   1. Extracts the LATEST "Honest stubs remaining" list (the authoritative
//      current known-incomplete surfaces — update passes are prepended newest-first).
//   2. Probes live code for stub markers (TODO/placeholder/"not yet"/…) to catch
//      stubs the ledger doesn't mention (drift the other way).
//   3. Probes each React screen for a real core-dispatch wiring reference, flagging
//      any screen with no wiring as "presentation-only — verify".
//
// Output: a structured object (rendered into the HTML report) + a standalone
// markdown/JSON pair under the log dir. Never fails the run — it is informational.

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

function extractHonestStubs(gapsText: string): string[] {
	// Update passes are prepended newest-first, so the FIRST match top-down is latest.
	const m = gapsText.match(/Honest stubs remaining[^:]*:\*\*\s*([\s\S]*?)(?:\n\n|\n\*\*|\n## )/i);
	if (!m) return [];
	return m[1]
		.replace(/\n/g, ' ')
		.split('·')
		.map((s) =>
			s
				.replace(/\*\*/g, '')
				.replace(/\([^)]*\)/g, '')
				.replace(/[.\s]+$/, '')
				.trim(),
		)
		.filter((s) => s.length > 1 && s.length < 120);
}

export interface FeatureAuditResult {
	knownStubs: string[];
	stubMarkers: { file: string; line: number; key: string; text: string }[];
	stubMarkerTotal: number;
	screens: { file: string; wired: boolean }[];
	unwiredScreens: string[];
	generatedFrom: string;
	/** The ledger could not be read. An empty `knownStubs` then means "unknown", not "none". */
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
	const knownStubs = extractHonestStubs(gapsText);

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

	// Screen wiring probe: the route surfaces live in src/screens/*.tsx.
	const appDir = path.join(repoRoot, SRC, 'screens');
	const screens: FeatureAuditResult['screens'] = [];
	try {
		for (const name of readdirSync(appDir)) {
			const full = path.join(appDir, name);
			if (!/\.tsx$/.test(name)) continue;
			if (!statSync(full).isFile()) continue;
			// Screen components are PascalCase; skip obvious non-screens.
			if (!/^[A-Z]/.test(name)) continue;
			const content = readFileSync(full, 'utf8');
			screens.push({ file: path.relative(repoRoot, full), wired: WIRING_RE.test(content) });
		}
	} catch {
		/* app dir shape may differ */
	}

	return {
		knownStubs,
		stubMarkers: stubMarkers.slice(0, 200),
		stubMarkerTotal: stubMarkers.length,
		screens,
		unwiredScreens: screens.filter((s) => !s.wired).map((s) => s.file),
		generatedFrom: GAPS,
		gapsMissing,
	};
}

function toMarkdown(r: FeatureAuditResult): string {
	const lines: string[] = ['# Feature-gap drift audit', ''];
	lines.push(`Source of truth: \`${r.generatedFrom}\` (latest pass) + live code probes.`, '');

	lines.push('## Known remaining stubs (declared, no core backing)', '');
	if (r.gapsMissing) {
		lines.push(
			`⚠ **Ledger not found at \`${r.generatedFrom}\`.** The declared-stub list is UNKNOWN, ` +
				'not empty — fix the path before trusting this section.',
		);
	} else if (r.knownStubs.length) r.knownStubs.forEach((s) => lines.push(`- ${s}`));
	else lines.push('_None declared in the latest FEATURE-GAPS pass._');
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
			: `${r.knownStubs.length} declared stubs`,
		`${r.stubMarkerTotal} code markers`,
		`${r.unwiredScreens.length}/${r.screens.length} screens need wiring review`,
	];
	// Informational: warn if there is anything worth a human glance, else pass.
	const status = r.gapsMissing || r.unwiredScreens.length || r.knownStubs.length ? 'warn' : 'pass';
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
	const declared = r.gapsMissing ? 'ledger MISSING' : `${r.knownStubs.length} declared stubs`;
	console.log(
		`\nSummary: ${declared} · ${r.stubMarkerTotal} code markers · ` +
			`${r.unwiredScreens.length}/${r.screens.length} screens need wiring review`,
	);
	if (r.gapsMissing) process.exitCode = 1;
}
