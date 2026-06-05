/**
 * PLAT-015: generate-and-validate audits for high-churn markdown registers.
 *
 * The product rule (defects `CLAUDE-CODEX-COUNT-MISMATCH`, `CHANGELOG-LOW-SIGNAL`,
 * `AUDIT-21.4-PROJECT-STRUCTURE`): engineering release notes, structure inventories, and
 * defect-count summaries must be GENERATED or VALIDATED from structured sources, never
 * hand-synchronized. These pure functions recompute the truth from structured data and report
 * drift so `docs-validate.ts` can fail CLOSED — mirroring the existing schema-version sync and
 * v2-workpack generate-and-validate pattern.
 *
 * Every function is pure (string/data in, issue list out) so a unit test can plant drift and
 * assert the audit catches it.
 */

export interface DocDriftIssue {
	readonly file: string;
	readonly line: number;
	readonly message: string;
}

const REQUIREMENT_HEADING = /^### ([A-Z0-9]+)-\d+\s*$/;

/**
 * Recompute per-domain requirement counts from `### <DOMAIN>-<n>` headings across the requirement
 * files. The returned map is the structured source of truth for the Count Audit table.
 */
export function computeRequirementCounts(
	requirementFiles: ReadonlyArray<{ readonly content: string }>,
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const file of requirementFiles) {
		for (const rawLine of file.content.split(/\r?\n/)) {
			const match = REQUIREMENT_HEADING.exec(rawLine.trim());
			if (!match) continue;
			const domain = match[1]!;
			counts.set(domain, (counts.get(domain) ?? 0) + 1);
		}
	}
	return counts;
}

interface CountAuditRow {
	domain: string;
	count: number;
	line: number;
}

/**
 * Parse the `## Count Audit` table in `10-requirements.md`. Returns the declared per-domain rows
 * (excluding the Total row) plus the declared total, with line numbers for precise drift reports.
 */
function parseCountAuditTable(markdown: string): {
	rows: CountAuditRow[];
	total: number | null;
	totalLine: number;
	tableFound: boolean;
} {
	const lines = markdown.split(/\r?\n/);
	const rows: CountAuditRow[] = [];
	let total: number | null = null;
	let totalLine = 0;
	let inTable = false;
	let tableFound = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]!;
		if (/^##\s+Count Audit\s*$/.test(line.trim())) {
			inTable = true;
			tableFound = true;
			continue;
		}
		if (!inTable) continue;
		// A new section header ends the table region.
		if (/^##\s+/.test(line.trim())) break;

		const cells = line.split('|').map((cell) => cell.trim());
		// Table rows look like: `| DOMAIN | 18 |` → ['', 'DOMAIN', '18', ''].
		if (cells.length < 4) continue;
		const label = cells[1] ?? '';
		const valueText = (cells[2] ?? '').replace(/\*/g, '').trim();
		if (label === '' || label === 'Domain' || /^-+$/.test(label)) continue;

		if (/total/i.test(label)) {
			const parsed = Number(valueText);
			if (!Number.isNaN(parsed)) {
				total = parsed;
				totalLine = index + 1;
			}
			continue;
		}
		const cleanDomain = label.replace(/\*/g, '').trim();
		const count = Number(valueText);
		if (/^[A-Z0-9]+$/.test(cleanDomain) && !Number.isNaN(count)) {
			rows.push({ domain: cleanDomain, count, line: index + 1 });
		}
	}

	return { rows, total, totalLine, tableFound };
}

/**
 * PLAT-015 AC3: validate the Count Audit table against the recomputed heading counts. Reports a
 * drift issue for every domain whose declared count differs from the computed count, every
 * missing/extra domain, and a wrong total. An empty list means the table is in sync.
 */
export function auditCountTable(
	requirementsDocPath: string,
	requirementsMarkdown: string,
	requirementFiles: ReadonlyArray<{ readonly content: string }>,
): DocDriftIssue[] {
	const issues: DocDriftIssue[] = [];
	const computed = computeRequirementCounts(requirementFiles);
	const { rows, total, totalLine, tableFound } = parseCountAuditTable(requirementsMarkdown);

	if (!tableFound) {
		issues.push({
			file: requirementsDocPath,
			line: 1,
			message: 'Count Audit table not found; it must be present and validated (PLAT-015 AC3).',
		});
		return issues;
	}

	const declared = new Map(rows.map((row) => [row.domain, row]));

	for (const [domain, count] of computed) {
		const row = declared.get(domain);
		if (!row) {
			issues.push({
				file: requirementsDocPath,
				line: 1,
				message: `Count Audit is missing domain "${domain}" (computed ${count} from headings).`,
			});
			continue;
		}
		if (row.count !== count) {
			issues.push({
				file: requirementsDocPath,
				line: row.line,
				message: `Count Audit drift for "${domain}": table=${row.count} computed=${count} (recomputed from requirement headings, PLAT-015 AC3).`,
			});
		}
	}

	for (const row of rows) {
		if (!computed.has(row.domain)) {
			issues.push({
				file: requirementsDocPath,
				line: row.line,
				message: `Count Audit lists domain "${row.domain}" that has no requirement headings.`,
			});
		}
	}

	const computedTotal = [...computed.values()].reduce((sum, count) => sum + count, 0);
	if (total === null) {
		issues.push({
			file: requirementsDocPath,
			line: 1,
			message: `Count Audit has no Total row (computed total ${computedTotal}).`,
		});
	} else if (total !== computedTotal) {
		issues.push({
			file: requirementsDocPath,
			line: totalLine || 1,
			message: `Count Audit Total drift: table=${total} computed=${computedTotal} (PLAT-015 AC3).`,
		});
	}

	return issues;
}

// Tolerant of Prettier's table-cell padding: `| `ID` | P1 |` with any run of spaces.
const SEVERITY_CELL = /^\|\s*`[^`]+`\s*\|\s*(P[123])\s*\|/;

/**
 * Recompute the defect-register severity counts from the `## Defect Register` table rows.
 * Structured source: each row's severity cell. Returns the P1/P2/P3 counts and the total.
 */
export function computeDefectCounts(markdown: string): {
	p1: number;
	p2: number;
	p3: number;
	total: number;
} {
	let p1 = 0;
	let p2 = 0;
	let p3 = 0;
	for (const line of markdown.split(/\r?\n/)) {
		const match = SEVERITY_CELL.exec(line.trim());
		if (!match) continue;
		const severity = match[1];
		if (severity === 'P1') p1 += 1;
		else if (severity === 'P2') p2 += 1;
		else if (severity === 'P3') p3 += 1;
	}
	return { p1, p2, p3, total: p1 + p2 + p3 };
}

/**
 * Parse the declared defect-count summary line. The summary uses an explicit machine-checkable
 * format so the audit can compare it to the recomputed counts:
 *
 *   <!-- defect-count-summary: P1=9 P2=19 P3=8 total=36 -->
 */
function parseDefectSummary(markdown: string): {
	declared: { p1: number; p2: number; p3: number; total: number } | null;
	line: number;
} {
	const lines = markdown.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const match =
			/<!--\s*defect-count-summary:\s*P1=(\d+)\s+P2=(\d+)\s+P3=(\d+)\s+total=(\d+)\s*-->/.exec(
				lines[index]!,
			);
		if (match) {
			return {
				declared: {
					p1: Number(match[1]),
					p2: Number(match[2]),
					p3: Number(match[3]),
					total: Number(match[4]),
				},
				line: index + 1,
			};
		}
	}
	return { declared: null, line: 0 };
}

/**
 * PLAT-015 AC1: validate the defect-count summary against the recomputed register counts. The
 * summary must exist and match the structured table data exactly, or the audit fails closed.
 */
export function auditDefectCounts(docPath: string, markdown: string): DocDriftIssue[] {
	const issues: DocDriftIssue[] = [];
	const computed = computeDefectCounts(markdown);
	const { declared, line } = parseDefectSummary(markdown);

	if (!declared) {
		issues.push({
			file: docPath,
			line: 1,
			message:
				'Defect register is missing the machine-checkable count summary comment ' +
				`(want "<!-- defect-count-summary: P1=${computed.p1} P2=${computed.p2} P3=${computed.p3} total=${computed.total} -->", PLAT-015 AC1).`,
		});
		return issues;
	}

	for (const key of ['p1', 'p2', 'p3', 'total'] as const) {
		if (declared[key] !== computed[key]) {
			issues.push({
				file: docPath,
				line,
				message: `Defect count drift for ${key.toUpperCase()}: summary=${declared[key]} computed=${computed[key]} from register rows (PLAT-015 AC1).`,
			});
		}
	}

	// The human-readable bullet list is derived from the same counts and must agree, so a reader
	// never sees a number that disagrees with the structured source.
	const bullets: Array<{ label: string; key: keyof typeof computed; pattern: RegExp }> = [
		{ label: 'P1', key: 'p1', pattern: /^-\s*P1:\s*(\d+)\s*$/ },
		{ label: 'P2', key: 'p2', pattern: /^-\s*P2:\s*(\d+)\s*$/ },
		{ label: 'P3', key: 'p3', pattern: /^-\s*P3:\s*(\d+)\s*$/ },
		{ label: 'Total', key: 'total', pattern: /^-\s*Total:\s*(\d+)\s*$/ },
	];
	const docLines = markdown.split(/\r?\n/);
	for (const bullet of bullets) {
		for (let index = 0; index < docLines.length; index += 1) {
			const match = bullet.pattern.exec(docLines[index]!.trim());
			if (!match) continue;
			const value = Number(match[1]);
			if (value !== computed[bullet.key]) {
				issues.push({
					file: docPath,
					line: index + 1,
					message: `Defect summary bullet ${bullet.label}=${value} disagrees with recomputed ${computed[bullet.key]} (PLAT-015 AC1).`,
				});
			}
		}
	}

	return issues;
}

/** Parse the top-level directory bullets from the `## Top-Level Layout` section. */
function parseStructureTopLevelDirs(markdown: string): {
	dirs: Map<string, number>;
	found: boolean;
} {
	const lines = markdown.split(/\r?\n/);
	const dirs = new Map<string, number>();
	let inSection = false;
	let found = false;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]!;
		if (/^##\s+Top-Level Layout\s*$/.test(line.trim())) {
			inSection = true;
			found = true;
			continue;
		}
		if (!inSection) continue;
		if (/^##\s+/.test(line.trim())) break;
		// Bullet like: "- `src/`: SvelteKit renderer application."
		const match = /^-\s+`([^`]+)`/.exec(line.trim());
		if (!match) continue;
		const ref = match[1]!;
		// Only consider top-level directory references (single path segment ending in `/`).
		if (/^[^/]+\/$/.test(ref)) {
			dirs.set(ref.replace(/\/$/, ''), index + 1);
		}
	}
	return { dirs, found };
}

/**
 * PLAT-015 AC2: report stale generated structure references. Compares the top-level directories
 * documented in `PROJECT_STRUCTURE.md` against the actual top-level directories present in the
 * repo. A documented directory that no longer exists is stale; a real top-level directory that is
 * undocumented is a missing reference. Build-artifact and dotfile directories are ignored.
 */
export function auditStructureInventory(
	docPath: string,
	markdown: string,
	actualTopLevelDirs: ReadonlySet<string>,
	options: { ignore?: ReadonlySet<string> } = {},
): DocDriftIssue[] {
	const issues: DocDriftIssue[] = [];
	const ignore = options.ignore ?? new Set<string>();
	const { dirs, found } = parseStructureTopLevelDirs(markdown);

	if (!found) {
		issues.push({
			file: docPath,
			line: 1,
			message: 'PROJECT_STRUCTURE.md is missing its "Top-Level Layout" section (PLAT-015 AC2).',
		});
		return issues;
	}

	for (const [dir, line] of dirs) {
		if (!actualTopLevelDirs.has(dir)) {
			issues.push({
				file: docPath,
				line,
				message: `Structure inventory references "${dir}/" which no longer exists at the repository top level (PLAT-015 AC2).`,
			});
		}
	}

	for (const dir of actualTopLevelDirs) {
		if (ignore.has(dir)) continue;
		if (!dirs.has(dir)) {
			issues.push({
				file: docPath,
				line: 1,
				message: `Top-level directory "${dir}/" exists but is not documented in the structure inventory (PLAT-015 AC2).`,
			});
		}
	}

	return issues;
}
