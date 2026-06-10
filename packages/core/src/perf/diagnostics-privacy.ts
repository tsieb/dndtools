/**
 * PERF-009 — PRIVACY-PRESERVING PERFORMANCE DIAGNOSTICS (Security diagnostics; Feature Inventory
 * instrumentation). This is the DIAGNOSTICS-PRIVACY third of the "bundles, memory, and AI/MCP
 * isolation" capability branch. It is the fail-closed rule that a performance trace, when exported,
 * carries NO hidden player-inaccessible content, raw note bodies, secrets, or absolute paths UNLESS
 * the DM explicitly includes them — and that local UX diagnostics STAY LOCAL unless the user exports
 * them. It COMPOSES the project's existing privacy machinery rather than inventing a parallel scrubber:
 *
 *   - the diagnostics REDACTION guard ({@link redactValue} / {@link containsSensitiveData} from
 *     `../diagnostics/redaction`) — the SAME secret/absolute-path scrubber the support-bundle and
 *     content-export paths already use. PERF-009's "no raw paths / no secrets" requirement is exactly
 *     that scrubber applied to a perf trace; we do not re-implement path/secret detection.
 *   - the STREAM-PRIVACY needle scanner ({@link findStreamPrivacyLeaks} from `../collab/stream-privacy`)
 *     — the SAME adversarial deep-scan that proves a player/observer projection carries no hidden value,
 *     title, id, edge, snippet, or revealing count. PERF-009's "no hidden player-inaccessible content"
 *     requirement is exactly that scan applied to a perf trace.
 *
 * THE MODEL. A {@link RawPerfTrace} is what the instrumentation collects: per-workflow timing SAMPLES
 * (the metric — always safe) plus OPTIONAL human context (a label, a path, free-text notes) that MIGHT
 * carry content/paths/secrets. {@link sanitizePerfTrace} produces a {@link SanitizedPerfTrace} that
 * keeps the timing data verbatim (it is just numbers) and SCRUBS the context fail-closed: paths/secrets
 * redacted, and any planted hidden-content needle OMITTED. By default (`includeRawContext: false`) the
 * raw context is dropped to placeholders; only an EXPLICIT DM opt-in (`includeRawContext: true`) keeps it
 * — mirroring the support-bundle's `includeSecrets` opt-in. {@link certifyPerfTraceExport} is the
 * boundary self-check: it re-scans the sanitized trace and FAILS CLOSED if any secret/path/needle
 * survived, so a regression in any field is caught before the trace leaves the device.
 *
 * THE TWO PERF-009 ACCEPTANCE CRITERIA, enforced HERE:
 *
 *   1. EXPORTED TRACES OMIT RAW CONTENT, SECRETS, HIDDEN TITLES, AND ABSOLUTE PATHS UNLESS THE DM
 *      EXPLICITLY INCLUDES THEM (AC1). {@link sanitizePerfTrace} scrubs by default; the only way raw
 *      context survives is the explicit `includeRawContext` opt-in. {@link certifyPerfTraceExport}
 *      proves a default-mode export is clean.
 *   2. LOCAL UX DIAGNOSTICS STAY LOCAL UNLESS THE USER EXPLICITLY EXPORTS THEM (AC2). {@link PerfDiagnosticsStore}
 *      models the local-only store: a sample is `local` until {@link markExportedByUser} flips it on an
 *      EXPLICIT export. {@link localOnlySamples} is the fail-closed default view, and
 *      {@link assertNoUnexportedLeavesDevice} is the guard that nothing un-exported is in an outbound set.
 *
 * Pure + deterministic: every trace/sample/flag is an EXPLICIT input. No DOM, no Node, no storage, no
 * network, no clock, no entropy — this module decides WHAT is safe to export, never performs the I/O.
 */

import { containsSensitiveData, redactValue } from '../diagnostics/redaction';
import {
	findStreamPrivacyLeaks,
	type StreamPrivacyLeak,
	type StreamPrivacyNeedle,
} from '../collab/stream-privacy';

// ---------------------------------------------------------------------------------------------------
// AC1 — sanitize an exported perf trace (no raw content / secrets / hidden titles / absolute paths).
// ---------------------------------------------------------------------------------------------------

/**
 * The OPTIONAL human-facing context attached to a perf measurement. This is the ONLY part of a trace
 * that can carry sensitive data — the timing samples are pure numbers. It is deliberately small and
 * typed so the scrubber knows exactly what to scan.
 */
export interface PerfTraceContext {
	/** A human label for the workflow (e.g. "Open Scene"). MIGHT embed a hidden title; scrubbed by default. */
	readonly label?: string;
	/** A source path/locator the measurement was taken at. MIGHT be an absolute path; scrubbed by default. */
	readonly sourcePath?: string;
	/** Free-text notes the DM jotted. MIGHT carry raw content/secrets; scrubbed by default. */
	readonly notes?: string;
	/** Arbitrary extra key/value metadata. Scrubbed by the same recursive redactor (secret keys → placeholder). */
	readonly extra?: Record<string, unknown>;
}

/** ONE raw perf measurement the instrumentation collected: a budget id, its timing samples, + optional context. */
export interface RawPerfMeasurement {
	/** The budget id this measurement is for (metadata, never content). */
	readonly budgetId: string;
	/** The observed timing samples in the metric's unit — pure numbers, always safe to export. */
	readonly samples: readonly number[];
	/** Optional human context that MIGHT carry sensitive data. Absent ⇒ nothing to scrub. */
	readonly context?: PerfTraceContext;
}

/** The raw trace the instrumentation produces before it is safe to export. */
export interface RawPerfTrace {
	readonly measurements: readonly RawPerfMeasurement[];
}

/** The sanitized context after scrubbing — the same shape, with sensitive values redacted/omitted. */
export interface SanitizedPerfContext {
	readonly label?: string;
	readonly sourcePath?: string;
	readonly notes?: string;
	readonly extra?: Record<string, unknown>;
}

export interface SanitizedPerfMeasurement {
	readonly budgetId: string;
	/** The timing samples, verbatim (numbers are always safe). */
	readonly samples: readonly number[];
	/** The scrubbed context, or omitted when the raw measurement had none / it scrubbed to nothing. */
	readonly context?: SanitizedPerfContext;
}

export interface SanitizedPerfTrace {
	readonly measurements: readonly SanitizedPerfMeasurement[];
	/** Whether raw context was kept by EXPLICIT DM opt-in (true) or scrubbed by default (false). */
	readonly includedRawContext: boolean;
}

/** Options for {@link sanitizePerfTrace}. */
export interface SanitizePerfTraceOptions {
	/**
	 * EXPLICIT DM opt-in to keep raw context (label/path/notes/extra) verbatim. Default `false` —
	 * fail closed: without an explicit opt-in, sensitive context is scrubbed (AC1). Mirrors the
	 * support-bundle `includeSecrets` opt-in.
	 */
	readonly includeRawContext?: boolean;
	/**
	 * Hidden-content needles to OMIT (AC1). The same {@link StreamPrivacyNeedle} model the stream-privacy
	 * scan uses: the exact hidden titles/values/ids/edges/counts a leak would expose. Any context string
	 * containing a needle's secret is dropped to a placeholder so no hidden, player-inaccessible content
	 * rides along in a perf trace.
	 */
	readonly hiddenContentNeedles?: readonly StreamPrivacyNeedle[];
}

const OMITTED_HIDDEN_CONTENT = '[omitted-hidden-content]' as const;

/** Whether a string contains any of the hidden-content needles (so it must be omitted). */
function carriesHiddenContent(value: string, needles: readonly StreamPrivacyNeedle[]): boolean {
	if (needles.length === 0) return false;
	return findStreamPrivacyLeaks(value, needles).length > 0;
}

/** Scrub one context string fail-closed: omit hidden content, then redact paths/secrets. */
function scrubString(
	value: string | undefined,
	needles: readonly StreamPrivacyNeedle[],
): string | undefined {
	if (value === undefined) return undefined;
	if (carriesHiddenContent(value, needles)) return OMITTED_HIDDEN_CONTENT;
	return redactValue(value, false) as string;
}

/** Scrub the optional context fail-closed; returns `undefined` when there is nothing to carry. */
function sanitizeContext(
	context: PerfTraceContext | undefined,
	includeRaw: boolean,
	needles: readonly StreamPrivacyNeedle[],
): SanitizedPerfContext | undefined {
	if (context === undefined) return undefined;

	// A mutable builder; we freeze the shape into the readonly SanitizedPerfContext on return.
	const out: {
		label?: string;
		sourcePath?: string;
		notes?: string;
		extra?: Record<string, unknown>;
	} = {};

	// EXPLICIT DM opt-in keeps the raw context verbatim (AC1 — "unless explicitly included by the DM").
	if (includeRaw) {
		if (context.label !== undefined) out.label = context.label;
		if (context.sourcePath !== undefined) out.sourcePath = context.sourcePath;
		if (context.notes !== undefined) out.notes = context.notes;
		if (context.extra !== undefined) out.extra = context.extra;
		return Object.keys(out).length > 0 ? out : undefined;
	}

	// Default: fail closed. Omit hidden content, then redact paths/secrets in every text field, and run
	// the recursive secret-key/path redactor over the arbitrary `extra` map.
	const label = scrubString(context.label, needles);
	if (label !== undefined) out.label = label;
	const sourcePath = scrubString(context.sourcePath, needles);
	if (sourcePath !== undefined) out.sourcePath = sourcePath;
	const notes = scrubString(context.notes, needles);
	if (notes !== undefined) out.notes = notes;
	if (context.extra !== undefined) {
		// First omit any needle-bearing values in the map, then redact secret keys / paths recursively.
		const needleScrubbed = scrubExtraForNeedles(context.extra, needles);
		out.extra = redactValue(needleScrubbed, false) as Record<string, unknown>;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

/** Recursively replace any string value carrying a hidden-content needle with the omission placeholder. */
function scrubExtraForNeedles(
	value: unknown,
	needles: readonly StreamPrivacyNeedle[],
): unknown {
	if (typeof value === 'string') {
		return carriesHiddenContent(value, needles) ? OMITTED_HIDDEN_CONTENT : value;
	}
	if (Array.isArray(value)) return value.map((entry) => scrubExtraForNeedles(entry, needles));
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			out[key] = scrubExtraForNeedles(entry, needles);
		}
		return out;
	}
	return value;
}

/**
 * PERF-009 AC1 — sanitize a raw perf trace for export, FAILING CLOSED. The timing samples are kept
 * verbatim (numbers carry no content); the optional human context is, by DEFAULT, scrubbed: hidden
 * content (any planted needle) is OMITTED, and absolute paths / secrets are REDACTED by the shared
 * diagnostics redactor. Raw context survives ONLY when the DM EXPLICITLY opts in via
 * `includeRawContext: true` (AC1 — "unless explicitly included by the DM").
 *
 * Pure + deterministic: identical trace + options ⇒ identical sanitized trace.
 */
export function sanitizePerfTrace(
	trace: RawPerfTrace,
	options?: SanitizePerfTraceOptions,
): SanitizedPerfTrace {
	const includeRaw = options?.includeRawContext === true;
	const needles = options?.hiddenContentNeedles ?? [];

	const measurements = trace.measurements.map((m): SanitizedPerfMeasurement => {
		const context = sanitizeContext(m.context, includeRaw, needles);
		return {
			budgetId: m.budgetId,
			samples: m.samples,
			...(context !== undefined ? { context } : {}),
		};
	});

	return { measurements, includedRawContext: includeRaw };
}

/** A reason a sanitized trace FAILED its export certification (something sensitive survived). */
export type PerfTraceExportProblemKind =
	/** A secret-shaped token or absolute path survived the scrub. */
	| 'sensitive-data-present'
	/** A planted hidden-content needle survived the scrub. */
	| 'hidden-content-present';

export interface PerfTraceExportProblem {
	readonly kind: PerfTraceExportProblemKind;
	/** A non-leaking description (it names the kind + a JSON path, never the secret value). */
	readonly message: string;
	/** For a hidden-content leak, the leak the scan found (path + needle metadata). */
	readonly leak?: StreamPrivacyLeak;
}

export interface PerfTraceExportCertification {
	/** True ⇒ the sanitized trace carries NO secret/path/hidden-content and is safe to export. */
	readonly clean: boolean;
	readonly problems: readonly PerfTraceExportProblem[];
}

/**
 * PERF-009 AC1 — the BOUNDARY SELF-CHECK on a sanitized trace, FAILING CLOSED. It re-scans the trace
 * (after sanitization) and reports every surviving secret/path ({@link containsSensitiveData}) and
 * every surviving hidden-content needle ({@link findStreamPrivacyLeaks}). A clean default-mode export
 * has no problems; a DM-opt-in export (`includedRawContext: true`) is NOT required to be clean (the DM
 * chose to include raw context), so certification is SKIPPED for the opt-in case and reports clean —
 * the explicit opt-in is the user's informed choice (AC1 "unless explicitly included by the DM").
 *
 * Pure + deterministic. This is the guard a transport/exporter runs immediately before writing the
 * trace out, so a regression in any field's scrubbing is caught at the boundary rather than leaking.
 */
export function certifyPerfTraceExport(
	trace: SanitizedPerfTrace,
	hiddenContentNeedles: readonly StreamPrivacyNeedle[] = [],
): PerfTraceExportCertification {
	// An explicit DM opt-in to include raw context is the user's informed choice — there is nothing to
	// fail closed on (AC1 permits raw content "if explicitly included by the DM").
	if (trace.includedRawContext) {
		return { clean: true, problems: [] };
	}

	const problems: PerfTraceExportProblem[] = [];

	if (containsSensitiveData(trace.measurements)) {
		problems.push({
			kind: 'sensitive-data-present',
			message:
				'A sanitized perf trace still contains a secret-shaped token or absolute path; refusing to export (PERF-009 AC1 fail-closed).',
		});
	}

	for (const leak of findStreamPrivacyLeaks(trace.measurements, hiddenContentNeedles)) {
		problems.push({
			kind: 'hidden-content-present',
			message: `A sanitized perf trace still carries hidden ${leak.kind} (domain "${leak.domain}") at ${leak.path}; refusing to export (PERF-009 AC1 fail-closed).`,
			leak,
		});
	}

	return { clean: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------------------------------
// AC2 — local UX diagnostics stay LOCAL unless the user explicitly exports them.
// ---------------------------------------------------------------------------------------------------

/** Where a UX diagnostic sample currently lives. Fail closed: a new sample is `local` until exported. */
export type PerfDiagnosticResidency = 'local' | 'exported';

/**
 * ONE local UX diagnostic sample (PERF-009 AC2 — "task success or time-to-first-value"). It records a
 * coarse metric (a duration / a success flag) keyed by a non-content metric id. `residency` is `local`
 * until the user EXPLICITLY exports it; only metadata + a number is ever stored (no content).
 */
export interface PerfDiagnosticSample {
	/** Stable, non-content metric id (e.g. `time-to-first-value`, `task-success`). */
	readonly metricId: string;
	/** The measured value (a duration in ms, or 1/0 for success). A pure number. */
	readonly value: number;
	/** Whether this sample is still local-only or has been explicitly exported by the user. */
	readonly residency: PerfDiagnosticResidency;
}

/** The local-only UX diagnostics store. A simple ordered list of samples; residency is per-sample. */
export interface PerfDiagnosticsStore {
	readonly samples: readonly PerfDiagnosticSample[];
}

/** The fail-closed empty store. */
export const EMPTY_PERF_DIAGNOSTICS_STORE: PerfDiagnosticsStore = Object.freeze({ samples: [] });

/**
 * PERF-009 AC2 — record a local UX diagnostic. The sample is stored `local` (it does NOT leave the
 * device); the user must explicitly export it later. Returns a NEW store (pure). Fail closed: a
 * recorded sample is ALWAYS `local` regardless of any caller-provided residency, so a sample can never
 * be born already-exported.
 */
export function recordLocalDiagnostic(
	store: PerfDiagnosticsStore,
	sample: { metricId: string; value: number },
): PerfDiagnosticsStore {
	const local: PerfDiagnosticSample = {
		metricId: sample.metricId,
		value: sample.value,
		residency: 'local',
	};
	return { samples: [...store.samples, local] };
}

/**
 * PERF-009 AC2 — the fail-closed DEFAULT VIEW: only the `local` samples. Anything outbound must START
 * from this empty-by-default position — a sample is invisible to any export until the user explicitly
 * promotes it. (Named to mirror the AC: local diagnostics REMAIN local.)
 */
export function localOnlySamples(store: PerfDiagnosticsStore): PerfDiagnosticSample[] {
	return store.samples.filter((s) => s.residency === 'local');
}

/**
 * PERF-009 AC2 — EXPLICITLY export the named local samples (the user's informed action). Each named
 * metric's local samples flip to `exported`; everything else is unchanged. This is the ONLY way a
 * sample leaves `local`. Returns a NEW store (pure). An unknown metric id is a no-op (fail closed:
 * nothing is exported that was not asked for).
 */
export function markExportedByUser(
	store: PerfDiagnosticsStore,
	metricIds: readonly string[],
): PerfDiagnosticsStore {
	const toExport = new Set(metricIds);
	return {
		samples: store.samples.map((s) =>
			s.residency === 'local' && toExport.has(s.metricId) ? { ...s, residency: 'exported' as const } : s,
		),
	};
}

/**
 * PERF-009 AC2 — the boundary guard: assert that an OUTBOUND set of samples contains NOTHING still
 * `local`. A transport runs this before sending UX diagnostics off-device; it THROWS on the first
 * un-exported sample, so a local-only sample can never leave the device by accident (fail closed).
 * Pure apart from throwing.
 */
export function assertNoUnexportedLeavesDevice(outbound: readonly PerfDiagnosticSample[]): void {
	const leak = outbound.find((s) => s.residency === 'local');
	if (leak) {
		throw new Error(
			`Local UX diagnostic "${leak.metricId}" is still local-only and must not leave the device without an explicit user export (PERF-009 AC2).`,
		);
	}
}
