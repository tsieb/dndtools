/**
 * Accessibility axe gate policy (UX-A11Y-001, UX-A11Y-017).
 *
 * Pure, side-effect-free decision logic shared by the Playwright a11y gate spec
 * (`apps/gm/tests/e2e/a11y-axe-gate.spec.ts`) and the merge/report CLI
 * (`scripts/a11y-axe-report.ts`). Keeping the policy here lets it be unit-tested in isolation
 * (`tests/unit/a11y-axe-policy.test.ts`) so the release gate is provably non-vacuous.
 *
 * Contract (per `docs/remake-review/ux-requirements/03-accessibility.md`):
 *  - `critical` violations always block (zero tolerance).
 *  - `serious` violations block UNLESS matched by an approved known-violation entry whose
 *    `targetResolutionDate` is still in the future.
 *  - `moderate` / `minor` are reported but never block.
 *  - A known-violation entry whose remediation date has PASSED makes the gate fail (forces the
 *    team to resolve the issue or extend the date with owner approval) — UX-A11Y-001 AC3 /
 *    UX-A11Y-017 AC4.
 *  - Worker artifacts are merged and de-duplicated by a normalized fingerprint so two parallel
 *    Playwright workers cannot double-count the same violation (UX-A11Y-017 AC3).
 */

export type ImpactLevel = 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown';

/** Impacts that block a release when not covered by an active known-violation entry. */
export const BLOCKING_IMPACTS: ReadonlySet<ImpactLevel> = new Set<ImpactLevel>([
	'critical',
	'serious',
]);

/** One axe violation node, as collected per route/profile by the Playwright gate. */
export interface AxeViolationInput {
	/** axe rule id, e.g. `color-contrast`, `aria-required-attr`. */
	id: string;
	impact: ImpactLevel | null | undefined;
	/** Route the violation was found on, e.g. `/scenes`. */
	route: string;
	/** Playwright/profile project, e.g. `desktop-chromium`. */
	project: string;
	/** First CSS target selector for the offending node. */
	selector: string;
	help: string;
	helpUrl: string;
}

/** A deliberately approved (or tracked) accessibility shortfall with an owner + remediation date. */
export interface KnownViolation {
	/** axe rule id this entry approves. */
	id: string;
	/** Route this applies to, or `*` for every scanned route. */
	route: string;
	/** Optional impact constraint; when omitted the entry matches any impact. */
	impact?: ImpactLevel;
	/** Optional normalized-selector prefix constraint. */
	selector?: string;
	/** WCAG success criterion reference, e.g. `1.4.11`. */
	wcag?: string;
	owner: string;
	reason: string;
	/** ISO `YYYY-MM-DD`. After this date (end of day) the entry is treated as unapproved. */
	targetResolutionDate: string;
}

export interface KnownViolationRegister {
	version: number;
	violations: KnownViolation[];
}

export interface ClassifiedViolation extends AxeViolationInput {
	fingerprint: string;
	/** Matched an active (non-expired) known-violation entry. */
	known: boolean;
	/** Matched a known-violation entry whose remediation date has passed. */
	expired: boolean;
	/** Counts against the gate. */
	blocking: boolean;
}

export interface ExpiredRegisterEntry {
	entry: KnownViolation;
	daysOverdue: number;
}

export interface GateEvaluation {
	violations: ClassifiedViolation[];
	counts: Record<ImpactLevel, number>;
	blocking: ClassifiedViolation[];
	/** Known-violation register entries whose remediation date has passed. */
	expiredRegisterEntries: ExpiredRegisterEntry[];
	/** True when nothing blocks the release. */
	ok: boolean;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Svelte component scope hashes (`svelte-1l37wk6`) change build-to-build. */
const SVELTE_SCOPE_RE = /\bsvelte-[0-9a-z]+\b/gi;
/** Long hex / numeric runs that look like generated ids (ULIDs, hashes, counters). */
const HEX_RUN_RE = /[0-9a-f]{8,}/gi;
const DIGIT_RUN_RE = /\d{2,}/g;

/**
 * Strip volatile id fragments from a selector so the same logical violation fingerprints
 * identically across runs and across parallel workers (UX-A11Y-017 artifact determinism;
 * extends the v1 `CODEX-PR12-AXE-FINGERPRINTS` fix).
 */
export function normalizeSelector(selector: string): string {
	return selector
		.replace(UUID_RE, '<uuid>')
		.replace(SVELTE_SCOPE_RE, 'svelte-<scope>')
		.replace(HEX_RUN_RE, '<hex>')
		.replace(DIGIT_RUN_RE, '<n>')
		.trim();
}

/** Stable identity for a violation node, independent of worker, profile, and generated ids. */
export function fingerprint(violation: AxeViolationInput): string {
	return `${violation.route}::${violation.id}::${normalizeSelector(violation.selector)}`;
}

function endOfDay(isoDate: string): number {
	// Treat the remediation date as inclusive through the end of that UTC day.
	return Date.parse(`${isoDate}T23:59:59.999Z`);
}

/** True when the entry's remediation date is strictly in the past relative to `now`. */
export function isExpired(entry: KnownViolation, now: Date): boolean {
	const due = endOfDay(entry.targetResolutionDate);
	if (Number.isNaN(due)) return true; // an unparseable date is never a valid approval
	return due < now.getTime();
}

/** Find the matching active (non-expired) known-violation entry, if any. */
export function matchActiveKnown(
	violation: AxeViolationInput,
	register: KnownViolationRegister,
	now: Date,
): KnownViolation | null {
	const normalized = normalizeSelector(violation.selector);
	for (const entry of register.violations) {
		if (entry.id !== violation.id) continue;
		if (entry.route !== '*' && entry.route !== violation.route) continue;
		if (entry.impact && entry.impact !== violation.impact) continue;
		if (entry.selector && !normalized.startsWith(normalizeSelector(entry.selector))) continue;
		if (isExpired(entry, now)) continue;
		return entry;
	}
	return null;
}

function matchesAnyEntry(violation: AxeViolationInput, register: KnownViolationRegister): boolean {
	const normalized = normalizeSelector(violation.selector);
	return register.violations.some((entry) => {
		if (entry.id !== violation.id) return false;
		if (entry.route !== '*' && entry.route !== violation.route) return false;
		if (entry.impact && entry.impact !== violation.impact) return false;
		if (entry.selector && !normalized.startsWith(normalizeSelector(entry.selector))) return false;
		return true;
	});
}

function emptyCounts(): Record<ImpactLevel, number> {
	return { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
}

/** Merge artifacts from every worker/route/profile and drop duplicate fingerprints. */
export function mergeViolations(artifacts: AxeViolationInput[][]): AxeViolationInput[] {
	const byFingerprint = new Map<string, AxeViolationInput>();
	for (const artifact of artifacts) {
		for (const violation of artifact) {
			const key = fingerprint(violation);
			if (!byFingerprint.has(key)) byFingerprint.set(key, violation);
		}
	}
	return [...byFingerprint.values()];
}

/**
 * Apply the release-gate policy to a flat list of violations plus the known-violation register.
 * `now` is injected for deterministic testing of remediation-date expiry.
 */
export function evaluateGate(
	violations: AxeViolationInput[],
	register: KnownViolationRegister,
	now: Date = new Date(),
): GateEvaluation {
	const counts = emptyCounts();
	const classified: ClassifiedViolation[] = violations.map((violation) => {
		const impact: ImpactLevel = (violation.impact ?? 'unknown') as ImpactLevel;
		counts[impact] = (counts[impact] ?? 0) + 1;
		const active = matchActiveKnown(violation, register, now);
		const known = active !== null;
		const expired = !known && matchesAnyEntry(violation, register);
		const blocking = BLOCKING_IMPACTS.has(impact) && !known;
		return { ...violation, fingerprint: fingerprint(violation), known, expired, blocking };
	});

	const expiredRegisterEntries: ExpiredRegisterEntry[] = register.violations
		.filter((entry) => isExpired(entry, now))
		.map((entry) => ({
			entry,
			daysOverdue: Math.max(
				0,
				Math.ceil((now.getTime() - endOfDay(entry.targetResolutionDate)) / 86_400_000),
			),
		}));

	const blocking = classified.filter((violation) => violation.blocking);
	return {
		violations: classified,
		counts,
		blocking,
		expiredRegisterEntries,
		ok: blocking.length === 0 && expiredRegisterEntries.length === 0,
	};
}
