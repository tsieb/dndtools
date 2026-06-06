import { describe, expect, it } from 'vitest';
import {
	MAX_CONTENT_BODY_BYTES,
	MAX_IMPORT_ENTRIES,
	MAX_IMPORT_FILE_BYTES,
	MAX_IMPORT_TOTAL_BYTES,
	byteLength,
	validateBodyLimit,
	validateImportLimits,
} from '../src';

/**
 * SEC-006 — BOUNDARY PAYLOAD LIMITS. Adversarial evidence that an input crossing a trust boundary which
 * breaches an explicit size/count ceiling is REJECTED (with a structured, field-path-bearing error) BEFORE
 * allocation-heavy processing (AC1). Under-limit payloads pass; the structured rejection names the field.
 */

function reject(result: ReturnType<typeof validateImportLimits>) {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error('expected rejection');
	return result.rejection;
}

describe('SEC-006 payload-limits — import entry-count ceiling (AC1)', () => {
	it('rejects an import with more entries than the configured maximum, naming the `files` path', () => {
		const files = Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, (_unused, i) => ({
			path: `note-${i}.md`,
			text: 'x',
		}));
		const rejection = reject(validateImportLimits(files));
		expect(rejection.reason).toBe('too-many-entries');
		expect(rejection.path).toBe('files');
	});

	it('accepts an import exactly at the entry-count maximum', () => {
		const files = Array.from({ length: MAX_IMPORT_ENTRIES }, (_unused, i) => ({
			path: `note-${i}.md`,
			text: '',
		}));
		expect(validateImportLimits(files).ok).toBe(true);
	});
});

describe('SEC-006 payload-limits — per-file and total-size ceilings (AC1)', () => {
	it('rejects a single oversized file, naming the offending `files[i].text` path', () => {
		const files = [
			{ path: 'ok.md', text: 'fine' },
			{ path: 'huge.md', text: 'a'.repeat(MAX_IMPORT_FILE_BYTES + 1) },
		];
		const rejection = reject(validateImportLimits(files));
		expect(rejection.reason).toBe('entry-too-large');
		expect(rejection.path).toBe('files[1].text');
	});

	it('rejects an archive whose files are individually fine but collectively oversized', () => {
		// Each file is half the per-file limit; enough of them exceed the total ceiling.
		const half = 'a'.repeat(Math.floor(MAX_IMPORT_FILE_BYTES / 2));
		const count = Math.ceil(MAX_IMPORT_TOTAL_BYTES / half.length) + 1;
		const files = Array.from({ length: count }, (_unused, i) => ({ path: `n-${i}.md`, text: half }));
		const rejection = reject(validateImportLimits(files));
		expect(rejection.reason).toBe('total-too-large');
		expect(rejection.path).toBe('files');
	});
});

describe('SEC-006 payload-limits — body ceiling + byte measurement', () => {
	it('rejects an oversized content body, naming the supplied field path', () => {
		const result = validateBodyLimit('a'.repeat(MAX_CONTENT_BODY_BYTES + 1), 'noteText');
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.rejection.reason).toBe('body-too-large');
		expect(result.rejection.path).toBe('noteText');
	});

	it('accepts an under-limit body', () => {
		expect(validateBodyLimit('a short note').ok).toBe(true);
	});

	it('measures size in UTF-8 BYTES, not UTF-16 code units (multi-byte content is not undercounted)', () => {
		// A 2-char string of 3-byte code points is 6 bytes, not 2.
		expect(byteLength('€€')).toBe(6);
		expect(byteLength('abc')).toBe(3);
	});
});
