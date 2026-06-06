import { describe, expect, it } from 'vitest';
import {
	EMPTY_PERF_DIAGNOSTICS_STORE,
	REDACTED_PATH,
	assertNoUnexportedLeavesDevice,
	certifyPerfTraceExport,
	localOnlySamples,
	markExportedByUser,
	recordLocalDiagnostic,
	sanitizePerfTrace,
	type RawPerfTrace,
	type StreamPrivacyNeedle,
} from '../src/index';

// A trace salted with sensitive context: an absolute path, a hidden title, and a bearer secret.
const HIDDEN_TITLE = 'Secret Villain Lair';
const ABSOLUTE_PATH = '/Users/dm/vault/campaign/secret-notes.md';
const RAW_TRACE: RawPerfTrace = {
	measurements: [
		{
			budgetId: 'scene-first-render',
			samples: [1200, 1300],
			context: {
				label: `Open ${HIDDEN_TITLE}`,
				sourcePath: ABSOLUTE_PATH,
				notes: 'Loaded with Bearer abc123def456 from the source.',
				extra: { token: 'sk-supersecret', plain: 'safe metadata' },
			},
		},
		{
			budgetId: 'search',
			samples: [120, 130], // no context at all — nothing to scrub
		},
	],
};

const NEEDLES: StreamPrivacyNeedle[] = [
	{ domain: 'notes', kind: 'title', secret: HIDDEN_TITLE },
];

describe('PERF-009 AC1 — exported traces omit raw content/secrets/hidden titles/absolute paths by default', () => {
	it('keeps timing samples verbatim (numbers are always safe)', () => {
		const sanitized = sanitizePerfTrace(RAW_TRACE, { hiddenContentNeedles: NEEDLES });
		expect(sanitized.measurements[0]?.samples).toEqual([1200, 1300]);
		expect(sanitized.measurements[1]?.samples).toEqual([120, 130]);
	});

	it('OMITS a hidden title planted as a needle (no hidden player-inaccessible content)', () => {
		const sanitized = sanitizePerfTrace(RAW_TRACE, { hiddenContentNeedles: NEEDLES });
		const serialized = JSON.stringify(sanitized);
		expect(serialized).not.toContain(HIDDEN_TITLE);
	});

	it('REDACTS an absolute path and a bearer secret (composes the diagnostics redactor)', () => {
		const sanitized = sanitizePerfTrace(RAW_TRACE, { hiddenContentNeedles: NEEDLES });
		const serialized = JSON.stringify(sanitized);
		expect(serialized).not.toContain(ABSOLUTE_PATH);
		expect(serialized).toContain(REDACTED_PATH);
		expect(serialized).not.toContain('abc123def456');
		expect(serialized).not.toContain('sk-supersecret'); // secret-named key fully redacted
		expect(serialized).toContain('safe metadata'); // a non-sensitive value survives
	});

	it('a default-mode sanitized trace CERTIFIES clean (fail-closed boundary self-check)', () => {
		const sanitized = sanitizePerfTrace(RAW_TRACE, { hiddenContentNeedles: NEEDLES });
		const cert = certifyPerfTraceExport(sanitized, NEEDLES);
		expect(cert.clean).toBe(true);
		expect(cert.problems).toEqual([]);
	});

	it('the EXPLICIT DM opt-in keeps raw context verbatim (AC1 — "unless explicitly included by the DM")', () => {
		const sanitized = sanitizePerfTrace(RAW_TRACE, {
			includeRawContext: true,
			hiddenContentNeedles: NEEDLES,
		});
		expect(sanitized.includedRawContext).toBe(true);
		const serialized = JSON.stringify(sanitized);
		expect(serialized).toContain(HIDDEN_TITLE); // raw context is present by explicit choice
		expect(serialized).toContain(ABSOLUTE_PATH);
		// Certification is skipped for the informed opt-in (the DM chose to include it).
		expect(certifyPerfTraceExport(sanitized, NEEDLES).clean).toBe(true);
	});

	it('certification FAILS CLOSED when a secret/path survives a (mislabelled) default-mode trace', () => {
		// Construct a default-mode trace that still carries an absolute path (simulating a scrubbing miss).
		const leaky = {
			includedRawContext: false as const,
			measurements: [{ budgetId: 'x', samples: [1], context: { sourcePath: ABSOLUTE_PATH } }],
		};
		const cert = certifyPerfTraceExport(leaky, NEEDLES);
		expect(cert.clean).toBe(false);
		expect(cert.problems.some((p) => p.kind === 'sensitive-data-present')).toBe(true);
	});

	it('certification FAILS CLOSED when a hidden-content needle survives a default-mode trace', () => {
		const leaky = {
			includedRawContext: false as const,
			measurements: [{ budgetId: 'x', samples: [1], context: { label: HIDDEN_TITLE } }],
		};
		const cert = certifyPerfTraceExport(leaky, NEEDLES);
		expect(cert.clean).toBe(false);
		expect(cert.problems.some((p) => p.kind === 'hidden-content-present')).toBe(true);
	});

	it('is deterministic — identical trace + options yield an identical sanitized trace', () => {
		const a = sanitizePerfTrace(RAW_TRACE, { hiddenContentNeedles: NEEDLES });
		const b = sanitizePerfTrace(RAW_TRACE, { hiddenContentNeedles: NEEDLES });
		expect(a).toEqual(b);
	});

	it('a measurement with no context yields no context field (nothing to carry)', () => {
		const sanitized = sanitizePerfTrace(RAW_TRACE);
		expect(sanitized.measurements[1]?.context).toBeUndefined();
	});
});

describe('PERF-009 AC2 — local UX diagnostics stay local unless the user explicitly exports them', () => {
	it('a recorded sample is LOCAL by default and does not appear as exportable', () => {
		const store = recordLocalDiagnostic(EMPTY_PERF_DIAGNOSTICS_STORE, {
			metricId: 'time-to-first-value',
			value: 850,
		});
		expect(store.samples[0]?.residency).toBe('local');
		expect(localOnlySamples(store)).toHaveLength(1);
	});

	it('only an EXPLICIT export flips a sample to exported (the sole way it leaves the device)', () => {
		let store = recordLocalDiagnostic(EMPTY_PERF_DIAGNOSTICS_STORE, { metricId: 'task-success', value: 1 });
		store = recordLocalDiagnostic(store, { metricId: 'time-to-first-value', value: 850 });
		const exported = markExportedByUser(store, ['task-success']);
		expect(exported.samples.find((s) => s.metricId === 'task-success')?.residency).toBe('exported');
		expect(exported.samples.find((s) => s.metricId === 'time-to-first-value')?.residency).toBe('local');
		expect(localOnlySamples(exported).map((s) => s.metricId)).toEqual(['time-to-first-value']);
	});

	it('exporting an unknown metric id is a no-op (fail closed: nothing un-asked-for is exported)', () => {
		const store = recordLocalDiagnostic(EMPTY_PERF_DIAGNOSTICS_STORE, { metricId: 'a', value: 1 });
		expect(markExportedByUser(store, ['does-not-exist'])).toEqual(store);
	});

	it('the boundary guard THROWS if a still-local sample is in an outbound set', () => {
		const store = recordLocalDiagnostic(EMPTY_PERF_DIAGNOSTICS_STORE, { metricId: 'a', value: 1 });
		expect(() => assertNoUnexportedLeavesDevice(store.samples)).toThrow(/must not leave the device/);
	});

	it('the boundary guard ALLOWS an outbound set of only explicitly-exported samples', () => {
		let store = recordLocalDiagnostic(EMPTY_PERF_DIAGNOSTICS_STORE, { metricId: 'a', value: 1 });
		store = markExportedByUser(store, ['a']);
		expect(() => assertNoUnexportedLeavesDevice(store.samples)).not.toThrow();
	});

	it('a sample can never be born already-exported (recording forces local residency)', () => {
		const store = recordLocalDiagnostic(EMPTY_PERF_DIAGNOSTICS_STORE, {
			metricId: 'a',
			value: 1,
		});
		expect(store.samples.every((s) => s.residency === 'local')).toBe(true);
	});
});
