import type { ActorId } from './ids';
import type { ActorRole } from './permission-state';
import type { Character, CharacterState } from './character-state';
import { CHARACTER_ENTITY_TYPE } from './character-state';

/**
 * CHAR-004 / CHAR-005 / CHAR-014 — COLLABORATIVE character edits + attribution + conflict model.
 *
 * The DM and a character owner edit the SAME canonical character at the same time. This module is
 * the pure Processing-Core policy that decides, per FIELD PATH:
 *
 *   - field-level MERGE: two accepted edits to DIFFERENT field paths both apply (CHAR-004 AC1);
 *   - same-path CONFLICT: two concurrent edits to the SAME scalar path are surfaced as an explicit,
 *     durable, DM-resolvable conflict — never silent last-write-wins (CHAR-004 AC2 / Contract 2
 *     Conflict Model);
 *   - ATTRIBUTION (CHAR-005): every accepted edit records its author (id + role) and lands on ONE
 *     canonical value per path. There is NO separate hidden "DM override" value layer shadowing the
 *     player's value — the v2 contract explicitly retired that interpretation (Architecture Contract
 *     2 research conclusion). The DM edits the same value the owner sees; only authorship differs.
 *
 * Everything here is a pure deterministic function over plain data: no GUI, no storage, no ambient
 * clock/entropy (ids/clock come from the command env). The command handler composes these reducers
 * and appends a durable op; the actor-filtered collaborative PROJECTION lives in
 * `queries/character-collaboration.ts` and reuses the PERM visibility-filter so a non-DM view never
 * leaks a DM-only field's value, path, or attribution (CHAR-014).
 */

export const CHARACTER_COLLABORATION_SCHEMA_VERSION = 1 as const;

/**
 * The set of editable field paths on a character (CHAR-005 "any character field"). A path is one of:
 *   - `name`                       — the character's name.
 *   - `combat.hp` | `combat.maxHp` | `combat.tempHp` | `combat.ac` — a scalar combat field.
 *   - `combat.conditions`          — the conditions array (replaced as a whole).
 *   - `data.<key>`                 — a structured sheet field (backstory, personality, dmNotes, …).
 *
 * Modeled as a typed union of literal-prefixed strings so a malformed/unknown path is rejected
 * fail-closed at validation rather than silently writing an arbitrary key.
 */
export type CharacterFieldPath = 'name' | `combat.${string}` | `data.${string}`;

/** A single scalar/array value an edit may carry. Validated per-path before it is accepted. */
export type CharacterFieldValue = string | number | boolean | null | string[];

/**
 * The canonical authorship of ONE field path (CHAR-005). Recorded ALONGSIDE the single canonical
 * value — it does not create a second value. `authorRole` is the role at authoring time so the
 * collaborative view can flag a value as DM-authored vs player-authored (CHAR-014 AC1) without
 * re-deriving it from the actor table later.
 */
export interface FieldAuthorship {
	path: CharacterFieldPath;
	authorActorId: ActorId;
	authorRole: ActorRole;
	/** The character revision this authorship was stamped at. */
	revision: number;
	at: string;
}

/** One append-only attributed edit in the character's edit history (CHAR-005 / CHAR-014 history). */
export interface CharacterEdit {
	id: string;
	path: CharacterFieldPath;
	authorActorId: ActorId;
	authorRole: ActorRole;
	/** The value WRITTEN by this edit (the new canonical value). */
	value: CharacterFieldValue;
	/** The character revision produced by this edit. */
	revision: number;
	at: string;
}

/**
 * An unresolved same-path conflict (CHAR-004 AC2). Shaped on the Architecture Contract 2
 * `ConflictRecord` (`reason: 'same-scalar-path'`), reduced to the character entity. It is durable
 * and DM-resolvable: until resolved it BLOCKS the path from publishing a single value (the binding
 * resolves `conflicted`, the collaborative view marks the field `conflicted`).
 */
export interface CharacterFieldConflict {
	id: string;
	entityType: typeof CHARACTER_ENTITY_TYPE;
	entityId: string;
	path: CharacterFieldPath;
	reason: 'same-scalar-path';
	/** The common ancestor revision both edits diverged from. */
	ancestorRevision: number;
	/**
	 * The locally-accepted side (the value already on the canonical character). `revision` is the
	 * path's current authorship revision — the diverging local revision the vault conflict lifecycle
	 * (SYNC-006/013) references as a SOURCE REVISION when resolving.
	 */
	local: { value: CharacterFieldValue; revision: number; authorActorId: ActorId; authorRole: ActorRole };
	/**
	 * The concurrently-accepted side that could not be merged. `revision` is the revision this
	 * concurrent edit WOULD have produced had it merged (ancestor + 1) — the diverging remote source
	 * revision the vault conflict lifecycle references when resolving.
	 */
	remote: { value: CharacterFieldValue; revision: number; authorActorId: ActorId; authorRole: ActorRole };
	detectedAt: string;
	resolvedAt: string | null;
	resolutionOperationId: string | null;
}

/**
 * The collaboration sidecar carried on a {@link Character}. Kept as its own optional block so a
 * character created before this slice hydrates safely (no collaboration metadata ⇒ empty), and so
 * the field is structurally distinct from the canonical `data`/`combat` values it annotates.
 */
export interface CharacterCollaboration {
	/** Canonical authorship per field path. Absent path ⇒ original author (creator). */
	fieldAuthors: Record<string, FieldAuthorship>;
	/** Append-only attributed edit history, oldest first. */
	editHistory: CharacterEdit[];
	/** Unresolved + resolved same-path conflicts. A path with an unresolved conflict is blocked. */
	conflicts: CharacterFieldConflict[];
	schemaVersion: typeof CHARACTER_COLLABORATION_SCHEMA_VERSION;
}

export const EMPTY_CHARACTER_COLLABORATION: CharacterCollaboration = Object.freeze({
	fieldAuthors: {},
	editHistory: [],
	conflicts: [],
	schemaVersion: CHARACTER_COLLABORATION_SCHEMA_VERSION,
});

/** Tolerantly hydrate a possibly-absent collaboration sidecar (safe empty default). */
export function ensureCollaboration(
	collaboration: CharacterCollaboration | undefined,
): CharacterCollaboration {
	return {
		fieldAuthors: collaboration?.fieldAuthors ?? {},
		editHistory: collaboration?.editHistory ?? [],
		conflicts: collaboration?.conflicts ?? [],
		schemaVersion: CHARACTER_COLLABORATION_SCHEMA_VERSION,
	};
}

// --- Field-path validation + canonical value read/write (pure) ----------------------------------

const COMBAT_SCALAR_PATHS: ReadonlySet<string> = new Set([
	'combat.hp',
	'combat.maxHp',
	'combat.tempHp',
	'combat.ac',
]);

/** A typed reason an edit was rejected by pure validation (fail closed — CHAR-005 validated commands). */
export type FieldEditError =
	| 'unknown-path'
	| 'invalid-value'
	| 'unknown-data-key';

export type FieldEditValidation =
	| { ok: true; path: CharacterFieldPath; value: CharacterFieldValue }
	| { ok: false; error: FieldEditError; message: string };

/**
 * Validate a single field edit fail-closed (CHAR-005 "validated commands"; invalid field/value
 * rejected). The path must be a known editable path, and its value must match the path's type:
 *   - `name`, `data.*` (string-ish) ⇒ string;
 *   - `combat.hp|maxHp|tempHp|ac`   ⇒ finite number (tempHp non-negative);
 *   - `combat.conditions`           ⇒ array of non-empty strings.
 * A `data.<key>` path requires a non-empty key. Unknown paths are rejected (never write an arbitrary
 * key from adversarial input).
 */
export function validateFieldEdit(rawPath: string, rawValue: unknown): FieldEditValidation {
	if (rawPath === 'name') {
		if (typeof rawValue !== 'string' || rawValue.trim() === '') {
			return { ok: false, error: 'invalid-value', message: 'Name must be a non-empty string.' };
		}
		return { ok: true, path: 'name', value: rawValue };
	}

	if (COMBAT_SCALAR_PATHS.has(rawPath)) {
		if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
			return { ok: false, error: 'invalid-value', message: `${rawPath} must be a finite number.` };
		}
		if (rawPath === 'combat.tempHp' && rawValue < 0) {
			return { ok: false, error: 'invalid-value', message: 'combat.tempHp must be non-negative.' };
		}
		return { ok: true, path: rawPath as CharacterFieldPath, value: rawValue };
	}

	if (rawPath === 'combat.conditions') {
		if (
			!Array.isArray(rawValue) ||
			rawValue.some((entry) => typeof entry !== 'string' || entry.trim() === '')
		) {
			return {
				ok: false,
				error: 'invalid-value',
				message: 'combat.conditions must be an array of non-empty strings.',
			};
		}
		return { ok: true, path: 'combat.conditions', value: [...(rawValue as string[])] };
	}

	if (rawPath.startsWith('data.')) {
		const key = rawPath.slice('data.'.length);
		if (key.trim() === '') {
			return { ok: false, error: 'unknown-data-key', message: 'A data field key is required.' };
		}
		// Structured sheet fields are stored as strings in this slice (backstory/notes/dmNotes/…).
		if (typeof rawValue !== 'string') {
			return { ok: false, error: 'invalid-value', message: `${rawPath} must be a string.` };
		}
		return { ok: true, path: rawPath as CharacterFieldPath, value: rawValue };
	}

	return { ok: false, error: 'unknown-path', message: `Unknown character field path "${rawPath}".` };
}

/** Read the current canonical value at a (validated) field path. Pure. */
export function readFieldValue(
	character: Character,
	path: CharacterFieldPath,
): CharacterFieldValue {
	if (path === 'name') return character.name;
	if (path === 'combat.hp') return character.combat.hp;
	if (path === 'combat.maxHp') return character.combat.maxHp;
	if (path === 'combat.tempHp') return character.combat.tempHp;
	if (path === 'combat.ac') return character.combat.ac;
	if (path === 'combat.conditions') return [...character.combat.conditions];
	if (path.startsWith('data.')) {
		const key = path.slice('data.'.length);
		const value = character.data[key];
		return (value ?? null) as CharacterFieldValue;
	}
	return null;
}

/** Apply a (validated) field value to the canonical character, returning a NEW character. Pure. */
export function writeFieldValue(
	character: Character,
	path: CharacterFieldPath,
	value: CharacterFieldValue,
): Character {
	if (path === 'name') return { ...character, name: value as string };
	if (path === 'combat.hp') return { ...character, combat: { ...character.combat, hp: value as number } };
	if (path === 'combat.maxHp')
		return { ...character, combat: { ...character.combat, maxHp: value as number } };
	if (path === 'combat.tempHp')
		return { ...character, combat: { ...character.combat, tempHp: value as number } };
	if (path === 'combat.ac') return { ...character, combat: { ...character.combat, ac: value as number } };
	if (path === 'combat.conditions')
		return { ...character, combat: { ...character.combat, conditions: [...(value as string[])] } };
	if (path.startsWith('data.')) {
		const key = path.slice('data.'.length);
		return { ...character, data: { ...character.data, [key]: value } };
	}
	return character;
}

/**
 * Resolve a character field path to its canonical (scope, key). A field is addressable in several
 * EQUIVALENT forms: the field-edit convention is `data.<key>` / `combat.<key>`, but a dm-only field
 * may be DECLARED as a bare legacy/schema key (`dmNotes` — e.g. a vault-object schema field, or a
 * CHAR-001 quick-create payload). The plain redactor treats a bare key as a `data` key, so two paths
 * denote the SAME field iff they share scope + key under this canonicalization.
 */
function resolveFieldScope(path: string): { scope: 'data' | 'combat'; key: string } {
	if (path.startsWith('combat.')) return { scope: 'combat', key: path.slice('combat.'.length) };
	if (path.startsWith('data.')) return { scope: 'data', key: path.slice('data.'.length) };
	return { scope: 'data', key: path };
}

/**
 * Whether a field path is among the character's declared DM-only fields (Contract 3 field visibility).
 * Matches across ALL equivalent path forms so a bare-declared dm-only field (`dmNotes`) is recognized
 * when addressed by its namespaced path (`data.dmNotes`), and vice-versa — neither form may leak or be
 * written by a non-DM (CHAR-010 / CHAR-014 non-leak).
 */
export function isDmOnlyFieldPath(character: Character, path: CharacterFieldPath): boolean {
	const target = resolveFieldScope(path);
	return character.dmOnlyFields.some((field) => {
		const ref = resolveFieldScope(field);
		return ref.scope === target.scope && ref.key === target.key;
	});
}

// --- Conflict helpers (pure) --------------------------------------------------------------------

/** Whether a path currently carries an UNRESOLVED conflict (blocks single-value publication). */
export function hasUnresolvedConflict(
	collaboration: CharacterCollaboration,
	path: CharacterFieldPath,
): boolean {
	return collaboration.conflicts.some((c) => c.path === path && c.resolvedAt === null);
}

/** The unresolved conflict for a path, if any. */
export function unresolvedConflictForPath(
	collaboration: CharacterCollaboration,
	path: CharacterFieldPath,
): CharacterFieldConflict | undefined {
	return collaboration.conflicts.find((c) => c.path === path && c.resolvedAt === null);
}

/** The field paths that currently carry an unresolved conflict, in stable order. */
export function unresolvedConflictPaths(collaboration: CharacterCollaboration): CharacterFieldPath[] {
	return collaboration.conflicts.filter((c) => c.resolvedAt === null).map((c) => c.path);
}

function valuesEqual(a: CharacterFieldValue, b: CharacterFieldValue): boolean {
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((entry, index) => entry === b[index]);
	}
	return a === b;
}

// --- The core edit reducer (CHAR-004 merge + conflict; CHAR-005 attribution) --------------------

export interface ApplyFieldEditInput {
	path: CharacterFieldPath;
	value: CharacterFieldValue;
	authorActorId: ActorId;
	authorRole: ActorRole;
	/**
	 * The revision the editor BASED their edit on (the value they read before editing). When this is
	 * older than the path's current authorship revision, a DIFFERENT author changed the SAME path
	 * concurrently ⇒ a same-path conflict (CHAR-004 AC2). When absent, the edit is treated as based on
	 * the current revision (a normal sequential edit — no conflict).
	 */
	baseRevision?: number;
}

export interface ApplyFieldEditMeta {
	editId: string;
	conflictId: string;
	now: string;
	/** The op id recorded on the edit/conflict for traceability. */
	operationId: string;
}

export type ApplyFieldEditResult =
	| {
			outcome: 'applied';
			character: Character;
			collaboration: CharacterCollaboration;
			edit: CharacterEdit;
	  }
	| {
			outcome: 'conflict';
			/** Canonical value/character are UNCHANGED — the conflicting edit does not overwrite. */
			character: Character;
			collaboration: CharacterCollaboration;
			conflict: CharacterFieldConflict;
	  }
	| { outcome: 'noop'; character: Character; collaboration: CharacterCollaboration };

/**
 * Apply ONE attributed field edit to the canonical character (CHAR-004 + CHAR-005).
 *
 * Deterministic merge + conflict detection, keyed by FIELD PATH:
 *
 *   1. No-op: the edit writes the value the path already holds ⇒ nothing changes (idempotent, no
 *      spurious conflict/history entry).
 *   2. Conflict (CHAR-004 AC2): the editor based their edit on an OLDER revision of THIS path than its
 *      current authorship revision, AND a DIFFERENT author last wrote the path. The concurrent edit
 *      is NOT applied; a durable `same-scalar-path` conflict is recorded and the path is blocked until
 *      the DM resolves it. (Different field paths never collide here — each path tracks its own
 *      authorship revision — so edits to different paths always merge: CHAR-004 AC1.)
 *   3. Applied: otherwise the value is written to the ONE canonical field, authorship is stamped
 *      (id + role + revision), and an attributed edit is appended to history (CHAR-005). No second
 *      value layer is created.
 *
 * Pure: returns new character + collaboration; never mutates inputs, never touches storage.
 */
export function applyFieldEdit(
	character: Character,
	collaboration: CharacterCollaboration,
	input: ApplyFieldEditInput,
	meta: ApplyFieldEditMeta,
): ApplyFieldEditResult {
	const current = ensureCollaboration(collaboration);
	const currentValue = readFieldValue(character, input.path);

	// 1. No-op: writing the same value as already present changes nothing.
	if (valuesEqual(currentValue, input.value)) {
		return { outcome: 'noop', character, collaboration: current };
	}

	// 2. Same-path concurrent edit ⇒ conflict. The path's current authorship revision is the version
	//    the editor must have based on; an older base by a DIFFERENT author means a concurrent write.
	const author = current.fieldAuthors[input.path];
	const baseRevision = input.baseRevision;
	if (
		baseRevision !== undefined &&
		author !== undefined &&
		baseRevision < author.revision &&
		author.authorActorId !== input.authorActorId
	) {
		const conflict: CharacterFieldConflict = {
			id: meta.conflictId,
			entityType: CHARACTER_ENTITY_TYPE,
			entityId: character.id,
			path: input.path,
			reason: 'same-scalar-path',
			ancestorRevision: baseRevision,
			local: {
				value: currentValue,
				// The diverging local revision is the path's current authorship revision.
				revision: author.revision,
				authorActorId: author.authorActorId,
				authorRole: author.authorRole,
			},
			remote: {
				value: input.value,
				// The diverging remote revision is the revision this concurrent edit would have produced
				// had it merged off its (stale) base — one past the base the editor built on.
				revision: baseRevision + 1,
				authorActorId: input.authorActorId,
				authorRole: input.authorRole,
			},
			detectedAt: meta.now,
			resolvedAt: null,
			resolutionOperationId: null,
		};
		return {
			outcome: 'conflict',
			character,
			collaboration: { ...current, conflicts: [...current.conflicts, conflict] },
			conflict,
		};
	}

	// 3. Applied: write the single canonical value + stamp attribution + append history.
	const nextRevision = character.revision + 1;
	const nextCharacter: Character = {
		...writeFieldValue(character, input.path, input.value),
		updatedAt: meta.now,
		revision: nextRevision,
	};
	const authorship: FieldAuthorship = {
		path: input.path,
		authorActorId: input.authorActorId,
		authorRole: input.authorRole,
		revision: nextRevision,
		at: meta.now,
	};
	const edit: CharacterEdit = {
		id: meta.editId,
		path: input.path,
		authorActorId: input.authorActorId,
		authorRole: input.authorRole,
		value: input.value,
		revision: nextRevision,
		at: meta.now,
	};
	const nextCollaboration: CharacterCollaboration = {
		...current,
		fieldAuthors: { ...current.fieldAuthors, [input.path]: authorship },
		editHistory: [...current.editHistory, edit],
	};
	return { outcome: 'applied', character: nextCharacter, collaboration: nextCollaboration, edit };
}

// --- Conflict resolution (CHAR-004 — DM resolves; it is itself a command) -----------------------

export type ConflictResolutionChoice = 'local' | 'remote';

export type ResolveConflictError = 'conflict-not-found' | 'conflict-already-resolved';

export type ResolveConflictResult =
	| {
			ok: true;
			character: Character;
			collaboration: CharacterCollaboration;
			edit: CharacterEdit;
			resolvedPath: CharacterFieldPath;
	  }
	| { ok: false; error: ResolveConflictError; message: string };

/**
 * Resolve an unresolved same-path conflict by selecting the local or remote value (CHAR-004 — manual
 * conflict resolution is itself a command that records the selected value and creates a new revision;
 * Contract 2 Conflict Model rule 7). The selected value becomes the single canonical value, attributed
 * to the RESOLVING actor (the DM), and the conflict is marked resolved with its resolution op id.
 * Fail closed: an unknown or already-resolved conflict is rejected.
 */
export function resolveFieldConflict(
	character: Character,
	collaboration: CharacterCollaboration,
	conflictId: string,
	choice: ConflictResolutionChoice,
	resolverActorId: ActorId,
	resolverRole: ActorRole,
	meta: ApplyFieldEditMeta,
): ResolveConflictResult {
	const current = ensureCollaboration(collaboration);
	const conflict = current.conflicts.find((c) => c.id === conflictId);
	if (!conflict) {
		return { ok: false, error: 'conflict-not-found', message: `Conflict ${conflictId} not found.` };
	}
	if (conflict.resolvedAt !== null) {
		return {
			ok: false,
			error: 'conflict-already-resolved',
			message: 'This conflict has already been resolved.',
		};
	}

	const chosen = choice === 'local' ? conflict.local : conflict.remote;
	const nextRevision = character.revision + 1;
	const nextCharacter: Character = {
		...writeFieldValue(character, conflict.path, chosen.value),
		updatedAt: meta.now,
		revision: nextRevision,
	};
	const authorship: FieldAuthorship = {
		path: conflict.path,
		authorActorId: resolverActorId,
		authorRole: resolverRole,
		revision: nextRevision,
		at: meta.now,
	};
	const edit: CharacterEdit = {
		id: meta.editId,
		path: conflict.path,
		authorActorId: resolverActorId,
		authorRole: resolverRole,
		value: chosen.value,
		revision: nextRevision,
		at: meta.now,
	};
	const resolved: CharacterFieldConflict = {
		...conflict,
		resolvedAt: meta.now,
		resolutionOperationId: meta.operationId,
	};
	const nextCollaboration: CharacterCollaboration = {
		...current,
		fieldAuthors: { ...current.fieldAuthors, [conflict.path]: authorship },
		editHistory: [...current.editHistory, edit],
		conflicts: current.conflicts.map((c) => (c.id === conflict.id ? resolved : c)),
	};
	return {
		ok: true,
		character: nextCharacter,
		collaboration: nextCollaboration,
		edit,
		resolvedPath: conflict.path,
	};
}

/** Read the collaboration sidecar carried on a character in state, hydrating safe defaults. */
export function collaborationFor(
	state: CharacterState,
	characterId: string,
): CharacterCollaboration {
	const character = state.characters[characterId];
	return ensureCollaboration(character?.collaboration);
}
