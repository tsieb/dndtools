import { describe, expect, it } from 'vitest';
import {
	MAX_CONTENT_BODY_BYTES,
	MAX_IMPORT_ENTRIES,
	MAX_IMPORT_FILE_BYTES,
	MAX_IMPORT_TOTAL_BYTES,
	byteLength,
	dispatchCommand,
	hasAsciiControlCharacter,
	validateBodyLimit,
	validateImportLimits,
	type CommandResult,
	type CoreCommand,
} from '../src';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';

/**
 * SEC-006 — BOUNDARY PAYLOAD LIMITS. Adversarial evidence that an input crossing a trust boundary which
 * breaches an explicit size/count ceiling is REJECTED (with a structured, field-path-bearing error) BEFORE
 * allocation-heavy processing (AC1). Under-limit payloads pass; the structured rejection names the field.
 *
 * Also covers AC2: given an enum field contains an unknown value, when parsed, the structured rejection
 * identifies the field PATH — proved end-to-end through dispatchCommand so the Zod schema → parseInput →
 * rejection pipeline is exercised at the boundary, not just in isolation.
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
		const files = Array.from({ length: count }, (_unused, i) => ({
			path: `n-${i}.md`,
			text: half,
		}));
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

	it('detects every ASCII control range while allowing ordinary Unicode text', () => {
		expect(hasAsciiControlCharacter('account\u0000id')).toBe(true);
		expect(hasAsciiControlCharacter('vault\u001fid')).toBe(true);
		expect(hasAsciiControlCharacter('vault\u007fid')).toBe(true);
		expect(hasAsciiControlCharacter('Café campaign')).toBe(false);
	});
});

/**
 * SEC-006 AC2 — ENUM ALLOWLIST + STRUCTURED REJECTION WITH FIELD PATH.
 *
 * The full boundary pipeline: parseInput (Zod safeParse) → structured CommandRejection with `issues`
 * bearing per-field paths. An unknown enum VALUE is rejected with `code: 'invalid-payload'` and
 * `issues[0].path` identifying exactly which field carried the bad value — proving the boundary is
 * not just a boolean gate but a structured, field-path-bearing allowlist enforcer.
 *
 * The `scene.create` command's `visibility` field is a closed enum (`'dm-only' | 'player-visible' |
 * 'shared'`). Passing an unknown string is the minimal adversarial probe for AC2.
 */
describe('SEC-006 AC2 — enum allowlist: unknown value yields structured rejection naming the field path', () => {
	function dispatch(command: CoreCommand): CommandResult {
		return dispatchCommand(buildInitialState(DM_ACTOR), makeEnvironment(), command);
	}

	it('scene.create: unknown `visibility` value is rejected with invalid-payload and path `visibility`', () => {
		const result = dispatch({
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Test Scene', visibility: 'not-a-valid-enum' },
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') throw new Error('expected rejected');
		expect(result.rejection.code).toBe('invalid-payload');
		// The structured rejection must name the offending field path — not just a boolean/generic error.
		expect(result.rejection.issues?.some((issue) => issue.path === 'visibility')).toBe(true);
	});

	it('session.set-workflow: unknown `workflow` enum value names the `workflow` path in the rejection', () => {
		const result = dispatch({
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'not-a-valid-workflow-state' },
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') throw new Error('expected rejected');
		expect(result.rejection.code).toBe('invalid-payload');
		expect(result.rejection.issues?.some((issue) => issue.path === 'workflow')).toBe(true);
	});

	it('a NESTED enum field (`entries[N].visibility`) has its full field path in the rejection', () => {
		// Roll dice with an unknown visibility enum in a deeply-nested position to prove
		// the path extractor (issue.path.map(String).join('.')) reconstructs nested paths correctly.
		const result = dispatch({
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: {
				name: 'Test',
				visualSettings: { background: 'not-a-valid-background-enum' },
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') throw new Error('expected rejected');
		expect(result.rejection.code).toBe('invalid-payload');
		// The path should name the nested field (visualSettings.background), not just `(root)`.
		expect(result.rejection.issues?.some((issue) => issue.path.includes('background'))).toBe(true);
	});
});
