/**
 * SEC-006 — BOUNDARY PAYLOAD LIMITS. Input payloads that cross a trust boundary (IPC dispatch, sync replay,
 * widget host, MCP, IMPORT, cloud) must have EXPLICIT size limits, schema validation, enum allowlists, and
 * STRUCTURED rejection errors. Zod already gives schema validation + enum allowlists + field-path-bearing
 * rejections (`commands/helpers.ts` `parseInput`); this module adds the SIZE/COUNT ceilings that Zod does
 * not express, enforced BEFORE allocation-heavy processing so an oversized payload is rejected cheaply
 * rather than after the system has already materialized it (Security "Large File DoS").
 *
 * FAIL CLOSED: a payload at or over a ceiling is REJECTED with a structured error that names the field
 * PATH and the limit it breached — never silently truncated or partially processed. Pure + deterministic:
 * the limits are constants and the checks are simple arithmetic, so the same payload is judged identically
 * on every device. This module owns no storage; the import command composes it before it plans/applies.
 */

export const PAYLOAD_LIMITS_SCHEMA_VERSION = 1 as const;

/**
 * The maximum number of entries an IMPORT archive may contain. An archive larger than this is rejected
 * before the (allocation-heavy) parse/plan/apply pipeline runs (SEC-006 AC1).
 */
export const MAX_IMPORT_ENTRIES = 5000 as const;

/** The maximum byte length of a SINGLE imported file's text. A larger file is rejected before parsing. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB

/** The maximum TOTAL byte length across all files in one import archive. */
export const MAX_IMPORT_TOTAL_BYTES = 64 * 1024 * 1024; // 64 MiB

/** The maximum byte length of a single note/handout/object body crossing a boundary. */
export const MAX_CONTENT_BODY_BYTES = 2 * 1024 * 1024; // 2 MiB

/** Which ceiling a payload breached. Stable machine codes the GUI can localize/group. */
export type PayloadLimitReason =
	| 'too-many-entries'
	| 'entry-too-large'
	| 'total-too-large'
	| 'body-too-large';

/** A single structured limit rejection: the machine `reason`, the offending `path`, and a message. */
export interface PayloadLimitRejection {
	reason: PayloadLimitReason;
	/** The field path the breach occurred at (e.g. `files`, `files[12].text`) — structured, like Zod's. */
	path: string;
	message: string;
}

/** The result of a payload-limit check. `ok` is false with a structured `rejection` when over a ceiling. */
export type PayloadLimitResult = { ok: true } | { ok: false; rejection: PayloadLimitRejection };

/**
 * The UTF-8 byte length of a string. A string's `.length` counts UTF-16 code units, which undercounts
 * multi-byte content, so the DoS ceiling is measured in BYTES (the unit that actually bounds memory/IO).
 * Pure — uses the platform `TextEncoder` when present (browser + Node), falling back to a manual UTF-8
 * byte count so the function stays usable in any environment.
 */
export function byteLength(value: string): number {
	if (typeof TextEncoder !== 'undefined') {
		return new TextEncoder().encode(value).length;
	}
	// Manual UTF-8 byte count fallback (no ambient state).
	let bytes = 0;
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);
		if (code < 0x80) bytes += 1;
		else if (code < 0x800) bytes += 2;
		else if (code >= 0xd800 && code <= 0xdbff) {
			bytes += 4; // a surrogate PAIR is one 4-byte code point
			i += 1;
		} else bytes += 3;
	}
	return bytes;
}

/** One file in an import archive, for the limit check (a relative path + its raw text). */
export interface BoundedImportFile {
	path: string;
	text: string;
}

/**
 * SEC-006 AC1 — validate an IMPORT archive against the entry-count + per-file + total-size ceilings BEFORE
 * any allocation-heavy parse/plan/apply. FAILS CLOSED at the FIRST breach with a structured rejection that
 * names the path (`files` for the count, `files[i].text` for a file) and the limit. Pure.
 *
 * Order matters: the cheap COUNT check runs first (it bounds how many files we even iterate), then each
 * file's size, accumulating the total as we go so we also reject an archive whose files are individually
 * fine but collectively oversized.
 */
export function validateImportLimits(files: readonly BoundedImportFile[]): PayloadLimitResult {
	if (files.length > MAX_IMPORT_ENTRIES) {
		return {
			ok: false,
			rejection: {
				reason: 'too-many-entries',
				path: 'files',
				message: `Import contains ${files.length} entries, exceeding the maximum of ${MAX_IMPORT_ENTRIES}.`,
			},
		};
	}
	let total = 0;
	for (let i = 0; i < files.length; i += 1) {
		const fileBytes = byteLength(files[i]!.text);
		if (fileBytes > MAX_IMPORT_FILE_BYTES) {
			return {
				ok: false,
				rejection: {
					reason: 'entry-too-large',
					path: `files[${i}].text`,
					message: `File "${files[i]!.path}" is ${fileBytes} bytes, exceeding the per-file maximum of ${MAX_IMPORT_FILE_BYTES} bytes.`,
				},
			};
		}
		total += fileBytes;
		if (total > MAX_IMPORT_TOTAL_BYTES) {
			return {
				ok: false,
				rejection: {
					reason: 'total-too-large',
					path: 'files',
					message: `Import total exceeds the maximum of ${MAX_IMPORT_TOTAL_BYTES} bytes.`,
				},
			};
		}
	}
	return { ok: true };
}

/**
 * SEC-006 — validate a single content/handout/object BODY against the body-size ceiling. The structured
 * rejection names the supplied `path` (e.g. `body`, `noteText`) so the boundary error points at the field.
 * Pure.
 */
export function validateBodyLimit(body: string, path = 'body'): PayloadLimitResult {
	const bytes = byteLength(body);
	if (bytes > MAX_CONTENT_BODY_BYTES) {
		return {
			ok: false,
			rejection: {
				reason: 'body-too-large',
				path,
				message: `Content body is ${bytes} bytes, exceeding the maximum of ${MAX_CONTENT_BODY_BYTES} bytes.`,
			},
		};
	}
	return { ok: true };
}
