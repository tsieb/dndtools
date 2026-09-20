/**
 * Character-file import mapper (WS-4). PURE and framework-free: text in → a validated
 * IMPORT PLAN of core dispatch payloads out. The executor (CharBuilder) turns the plan into
 * real commands: `character.quick-create` → `character.set-proficiencies` →
 * `character.set-spell` (per spell) → `character.update-attacks`.
 *
 * Two accepted shapes:
 *   - the D&D Beyond character-export JSON (the character-service document, optionally
 *     wrapped in `{ data: … }`), and
 *   - a simple NATIVE shape (documented on {@link NativeCharacterFile}).
 *
 * FAIL-CLOSED FIELD POLICY — never silent data loss:
 *   - every top-level input field is either CONSUMED (listed in `plan.mapped`) or REPORTED
 *     (listed in `plan.unmapped` with a reason). Nothing is dropped without a line in the
 *     report the user sees before committing.
 *   - sub-field failures (an unrecognized skill key, an attack without a name, a spell
 *     detail structure we can't parse) produce their own `unmapped` entries.
 *   - an unrecognized overall shape or malformed JSON fails the whole parse (`ok: false`).
 *   - imported characters land `dm-only` unless the native file explicitly says otherwise —
 *     visibility never silently widens on import.
 */

import type { ImportParseResult } from './types';
import { isRecord, nonEmptyString } from './helpers';
import { mapNative } from './native';
import { mapDdb } from './ddb';
export type * from './types';
export { applySystemFit, type SystemFitInput } from './systemFit';
// ── Entry point ────────────────────────────────────────────────────────────────────────────────

export function parseCharacterImport(text: string): ImportParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (err) {
		return {
			ok: false,
			error: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
	if (!isRecord(raw)) {
		return {
			ok: false,
			error: 'The file is valid JSON but not a character document (expected an object).',
		};
	}
	// The D&D Beyond character service wraps the document in { data: … }.
	const doc = isRecord(raw.data) && looksLikeDdb(raw.data) ? raw.data : raw;
	if (isRecord(doc) && looksLikeDdb(doc)) return mapDdb(doc);
	if (nonEmptyString((doc as Record<string, unknown>).name))
		return mapNative(doc as Record<string, unknown>);
	return {
		ok: false,
		error:
			'Unrecognized character file — expected a D&D Beyond character export or a dndtools character JSON with at least a "name" field.',
	};
}

function looksLikeDdb(doc: Record<string, unknown>): boolean {
	return Array.isArray(doc.stats) && (Array.isArray(doc.classes) || isRecord(doc.modifiers));
}
