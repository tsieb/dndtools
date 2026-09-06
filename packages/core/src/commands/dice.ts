import { hasDmAuthority } from '../state/permission-state';
import {
	appendRollToNoteInputSchema,
	rollDiceInputSchema,
	rollTableInputSchema,
} from '../schemas/commands';
import {
	DICE_SCHEMA_VERSION,
	parseDiceExpression,
	readRollUnderSystem,
	resolveMacro,
	resolveTableDraw,
	rollExpression,
	type DiceMacro,
	type DiceRollResult,
} from '../state/dice';
import type { SystemPackage } from '../state/system-package';
import { activeSystemPackageFor } from './character';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	contentItemById,
	isLiveContentItem,
	updateContentItem,
	type ContentItem,
	type VaultContentState,
} from '../state/content';
import { VAULT_OBJECT_SUBTYPE_KEY } from '../state/vault-object';
import {
	type DiceRollSourceKind,
	type DiceRollVisibility,
	type SessionDiceRoll,
} from '../state/session-state';
import type { CombatLogEntry } from '../state/combat-tracker';
import { hasGrantedCapability } from '../permissions/grants';
import type { Actor } from '../state/permission-state';
import { resolveDeliveryTarget } from '../collab/player-groups';
import type {
	CommandRejection,
	CommandResult,
	CoreEnvironment,
	CoreEvent,
	CoreStateSlice,
} from './types';
import {
	appendOperationDraft,
	ensureContentStateSlice,
	parseInput,
	reject,
	requireActor,
} from './helpers';
import { actorMayEditItem } from './content-edit-authority';

/**
 * SES-003 / SES-008 — the SHARED DICE COMMANDS (Architecture Contract 1 / Contract 2 / Contract 3).
 *
 * A participant rolls DICE EXPRESSIONS, MACROS, INLINE ROLLS, and ROLLABLE TABLES through these
 * commands. The architecture invariants this slice upholds:
 *
 *   - The expression PARSER + roll EVALUATOR are PURE deterministic core functions (`state/dice.ts`).
 *     A malformed expression is rejected FAIL-CLOSED (`invalid-dice-expression`) — never silently
 *     evaluated.
 *   - CRITICAL (Contract 2): the random OUTCOME is computed EXACTLY ONCE here, from a recorded SEED, and
 *     stored in the durable session ROLL HISTORY. The GUI never supplies the result and never re-rolls
 *     per device/render. Replaying `seed` + `expression` reproduces the IDENTICAL result, so every
 *     participant sees the same roll.
 *   - Roll VISIBILITY composes with PERM (Contract 3): a `dm-only`/secret roll is recorded but withheld
 *     from players at the read layer; a `shared` roll is delivered only to the listed participants.
 *   - Authority fails closed: any registered participant may roll (dice are player-safe, SES-003), but
 *     a non-DM may only mark a roll `dm-only` for THEMSELVES is disallowed — only the DM may author a
 *     `dm-only` (secret) roll. Rolling requires an ACTIVE session (the CMD-active-session-control guard).
 *   - SES-008: a rollable TABLE is a `dice-table` Vault Object (declared subtype). Drawing it resolves
 *     deterministically and records the selected row, attributed to the actor. The result may be
 *     APPENDED to a note BY REFERENCE through the EXISTING content write path (`content.update-item`
 *     reducer) — no cloning of unrelated data, and the note history records the actor + source roll.
 */

const SESSION_ENTITY_ID = 'session-default';

/** The session-active guard (fail closed when the workflow is not active). Reused across SES slices. */
function requireActiveSession(state: CoreStateSlice): CommandRejection | null {
	if (state.session.workflow !== 'active') {
		return {
			code: 'invalid-state',
			message: 'Rolling dice requires an active Session workflow.',
		};
	}
	return null;
}

/**
 * Resolve the effective visibility for a roll, fail-closed. Only the DM may author a `dm-only` (secret)
 * roll; a non-DM requesting `dm-only` is rejected so a player cannot hide a roll from the DM/table. A
 * `shared` roll always includes the author so they can still see their own roll.
 */
function resolveRollVisibility(
	actor: Actor,
	requested: DiceRollVisibility,
	sharedWith: string[],
): { visibility: DiceRollVisibility; sharedWith: string[] } | CommandRejection {
	if (requested === 'dm-only' && !hasDmAuthority(actor.role)) {
		return {
			code: 'actor-not-authorized',
			message: 'Only the DM may make a secret (DM-only) roll.',
		};
	}
	if (requested === 'shared') {
		const unique = [...new Set([actor.id, ...sharedWith])];
		return { visibility: 'shared', sharedWith: unique };
	}
	return { visibility: requested, sharedWith: [] };
}

/** Derive a seed when the caller did not supply one. Deterministic per generated op id (recorded). */
function seedFrom(explicit: number | string | undefined, fallback: string): number | string {
	return explicit ?? fallback;
}

/**
 * SES-003 AC4 — expand an optional `groupIds` list into individual actor ids using
 * {@link resolveDeliveryTarget}, then merge with the explicit `sharedWith` list. Unknown group ids are
 * rejected fail-closed (never silently widen the delivery). Returns `null` when expansion fails.
 */
function expandSharedWith(
	state: CoreStateSlice,
	sharedWith: string[],
	groupIds: string[],
): { ok: true; sharedWith: string[] } | { ok: false; rejection: CommandRejection } {
	if (groupIds.length === 0) return { ok: true, sharedWith };
	const resolved = resolveDeliveryTarget(
		{ recipientActorIds: sharedWith, groupIds },
		state.session.playerGroups,
		state.permissions,
	);
	if (resolved.unknownGroupIds.length > 0) {
		return {
			ok: false,
			rejection: {
				code: 'invalid-payload',
				message: `Unknown player group(s): ${resolved.unknownGroupIds.join(', ')}.`,
			},
		};
	}
	return { ok: true, sharedWith: resolved.recipientActorIds };
}

function withSession(state: CoreStateSlice, diceHistory: SessionDiceRoll[]): CoreStateSlice {
	return { ...state, session: { ...state.session, diceHistory } };
}

/**
 * RC-SYS-2.4 — how the encounter log SAYS a roll came out, under the active system package.
 *
 * A total is only the answer in a system that sums its dice. Under a pool package the same recorded
 * draw means a number of SUCCESSES, and a log line that reported the sum would be quietly wrong in
 * the DM's own history. The readout is derived from the recorded dice, so the label is built from
 * what the package says a roll means rather than from a 5e-shaped assumption. Pure.
 */
function rollOutcomeLabel(pkg: SystemPackage, record: SessionDiceRoll): string {
	if (!record.terms || record.seed === undefined) return String(record.total);
	const readout = readRollUnderSystem(pkg, {
		expression: record.expression,
		seed: record.seed,
		terms: record.terms,
		dice: record.dice ?? [],
		kept: record.kept ?? [],
		modifier: record.modifier ?? 0,
		total: record.total,
		schemaVersion: DICE_SCHEMA_VERSION,
	});
	if (readout.headlineKind !== 'successes') return String(readout.total);
	return readout.headline === 1 ? '1 success' : `${readout.headline} successes`;
}

/**
 * SES-002 AC5 — build a `roll` kind {@link CombatLogEntry} recording a dice roll made during active
 * combat. Carries the roll id (for cross-reference), visibility, and shared-with so the query layer
 * can filter the entry per-actor without duplicating the full roll payload.
 */
function buildCombatRollLogEntry(
	pkg: SystemPackage,
	env: CoreEnvironment,
	actor: Actor,
	operationId: string,
	round: number,
	turn: number,
	record: SessionDiceRoll,
): CombatLogEntry {
	const prefix = record.label ? `${record.label}: ` : '';
	const suffix =
		record.sourceKind === 'table' && record.tableRowText ? ` (${record.tableRowText})` : '';
	const label = `${prefix}${record.expression} → ${rollOutcomeLabel(pkg, record)}${suffix}`;
	return {
		id: env.ids(),
		round,
		turn,
		kind: 'roll',
		label,
		combatantId: null,
		delta: null,
		actorActorId: actor.id,
		actorRole: actor.role,
		at: env.clock(),
		operationId,
		rollId: record.id,
		rollVisibility: record.visibility ?? 'dm-only',
		...(record.visibility === 'shared' ? { rollSharedWith: record.sharedWith ?? [] } : {}),
	};
}

/**
 * If combat is currently running, append a `roll` encounter-log entry for `record` and return the
 * updated state (diceHistory + combat.log). Otherwise returns the state with only diceHistory updated.
 * This is the SES-002 AC5 accumulation point: rolls are recorded into the combat log AS THEY HAPPEN,
 * not reconstructed at end, so `handleEndCombat` inherits a complete log automatically.
 */
function withSessionAndCombatRoll(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actor: Actor,
	operationId: string,
	diceHistory: SessionDiceRoll[],
	record: SessionDiceRoll,
): CoreStateSlice {
	const combat = state.session.combat;
	if (combat.status !== 'running') {
		return { ...state, session: { ...state.session, diceHistory } };
	}
	const rollEntry = buildCombatRollLogEntry(
		activeSystemPackageFor(state),
		env,
		actor,
		operationId,
		combat.round,
		combat.turn,
		record,
	);
	const nextCombat = {
		...combat,
		log: [...combat.log, rollEntry],
		revision: combat.revision + 1,
	};
	return { ...state, session: { ...state.session, diceHistory, combat: nextCombat } };
}

/** Build the durable roll record from a recorded evaluation. Pure assembly. */
function buildRollRecord(
	env: CoreEnvironment,
	actor: Actor,
	result: DiceRollResult,
	sourceKind: DiceRollSourceKind,
	visibility: DiceRollVisibility,
	sharedWith: string[],
	label: string | undefined,
	operationId: string,
	extra: Partial<SessionDiceRoll> = {},
): SessionDiceRoll {
	return {
		id: env.ids(),
		actorId: actor.id,
		actorRole: actor.role,
		expression: result.expression,
		total: result.total,
		rolledAt: env.clock(),
		sourceKind,
		seed: result.seed,
		dice: [...result.dice],
		kept: [...result.kept],
		modifier: result.modifier,
		terms: result.terms,
		visibility,
		...(visibility === 'shared' ? { sharedWith } : {}),
		...(label && label.trim() !== '' ? { label: label.trim() } : {}),
		operationId,
		...extra,
	};
}

// --- SES-003 — roll a dice expression / macro / inline roll --------------------------------------

export function handleRollDice(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
	// When the roll is dispatched through the durable `widget.dispatch-command` envelope (the Dice
	// widget), the envelope's idempotency key is threaded in and recorded on the op so a retry under
	// the same key is de-duplicated instead of rolling twice. Top-level `dice.roll` passes none.
	idempotencyKey?: string,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const sessionGuard = requireActiveSession(state);
	if (sessionGuard) return reject(sessionGuard, state);

	const parsed = parseInput(rollDiceInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	// Resolve a macro reference to its underlying expression before parsing, when requested. An unknown
	// macro fails closed (no roll).
	let expressionText = input.expression;
	let sourceKind: DiceRollSourceKind = input.inline ? 'inline' : 'expression';
	if (input.asMacro) {
		const macros: DiceMacro[] = input.macros;
		const resolved = resolveMacro(input.expression, macros);
		if (resolved === null) {
			return reject(
				{ code: 'unknown-macro', message: `No macro named "${input.expression}" is defined.` },
				state,
			);
		}
		expressionText = resolved;
		sourceKind = 'macro';
	}

	// SES-003 AC4: expand any Player Group ids into individual actor ids before visibility resolution.
	const expanded = expandSharedWith(state, input.sharedWith, input.groupIds);
	if (!expanded.ok) return reject(expanded.rejection, state);

	// Visibility fails closed (only the DM may make a secret roll).
	const vis = resolveRollVisibility(actor, input.visibility, expanded.sharedWith);
	if ('code' in vis) return reject(vis, state);

	const operationId = env.ids();
	// The OUTCOME is computed ONCE here from a recorded seed. Malformed ⇒ fail closed (no roll recorded).
	const seed = seedFrom(input.seed, operationId);
	const rolled = rollExpression(expressionText, seed);
	if (!rolled.ok) {
		return reject(
			{
				code: 'invalid-dice-expression',
				message: `Invalid dice expression: ${rolled.error.message}`,
			},
			state,
		);
	}

	const record = buildRollRecord(
		env,
		actor,
		rolled.result,
		sourceKind,
		vis.visibility,
		vis.sharedWith,
		input.label,
		operationId,
	);
	const nextHistory = [...state.session.diceHistory, record];

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.roll-dice',
		path: `diceHistory/${record.id}`,
		// The op carries the recorded draw so the roll replays identically on every device (Contract 2).
		value: {
			expression: record.expression,
			seed: record.seed,
			total: record.total,
			dice: record.dice,
			visibility: record.visibility,
			sourceKind: record.sourceKind,
			...(idempotencyKey ? { idempotencyKey } : {}),
		},
		beforeRevision: state.session.diceHistory.length,
		afterRevision: nextHistory.length,
	});

	return {
		status: 'accepted',
		// SES-002 AC5: if combat is running, also append a visibility-carrying roll entry to the
		// combat encounter log so the log includes visible rolls at/after combat end.
		nextState: {
			...withSessionAndCombatRoll(state, env, actor, operationId, nextHistory, record),
			sync: draft.log,
		},
		events: [diceRecordedEvent(actor.id, record)],
		operationIds: [draft.op.id],
	};
}

// --- SES-008 — draw a rollable table (a declared `dice-table` Vault Object) -----------------------

/** Read the declared `dice` expression + `entries` rows from a `dice-table` content item, fail-closed. */
function readDiceTable(item: ContentItem): { dice: string; entries: string[] } | CommandRejection {
	const subtype = item.fields[VAULT_OBJECT_SUBTYPE_KEY];
	if (subtype !== 'dice-table') {
		return {
			code: 'not-a-dice-table',
			message: `Content item ${item.id} is not a dice-table object.`,
		};
	}
	const dice = item.fields['dice'];
	const entries = item.fields['entries'];
	if (typeof dice !== 'string' || dice.trim() === '') {
		return { code: 'invalid-dice-table', message: 'The table has no dice expression.' };
	}
	if (
		!Array.isArray(entries) ||
		entries.length === 0 ||
		!entries.every((e) => typeof e === 'string')
	) {
		return { code: 'invalid-dice-table', message: 'The table has no result rows.' };
	}
	// Validate the declared dice expression up-front so a malformed table fails closed before any draw.
	if (!parseDiceExpression(dice).ok) {
		return { code: 'invalid-dice-table', message: 'The table dice expression is invalid.' };
	}
	return { dice, entries: entries as string[] };
}

export function handleRollTable(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const sessionGuard = requireActiveSession(state);
	if (sessionGuard) return reject(sessionGuard, state);

	const parsed = parseInput(rollTableInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const now = env.clock();
	const content = ensureContentStateSlice(state.content);
	const item = contentItemById(content, input.tableItemId);
	if (!item || !isLiveContentItem(item)) {
		return reject(
			{
				code: 'content-item-not-found',
				message: `Dice table ${input.tableItemId} does not exist.`,
			},
			state,
		);
	}
	// A rollable table is a DM session asset (SES-008 is DM-only/player-safe: dm-only); only the DM (or an
	// authorized editor of the table) may draw it.
	if (!actorMayUseTable(state, actor, item.id, now)) {
		return reject({ code: 'actor-not-authorized', message: 'You may not draw this table.' }, state);
	}
	const table = readDiceTable(item);
	if ('code' in table) return reject(table, state);

	// SES-003 AC4: expand any Player Group ids into individual actor ids before visibility resolution.
	const expanded = expandSharedWith(state, input.sharedWith, input.groupIds);
	if (!expanded.ok) return reject(expanded.rejection, state);

	const vis = resolveRollVisibility(actor, input.visibility, expanded.sharedWith);
	if ('code' in vis) return reject(vis, state);

	const operationId = env.ids();
	const seed = seedFrom(input.seed, operationId);
	const draw = resolveTableDraw(table.dice, table.entries, seed);
	if (!draw.ok) {
		return reject(
			{ code: 'invalid-dice-table', message: `Cannot draw the table: ${draw.error.message}` },
			state,
		);
	}

	const record = buildRollRecord(
		env,
		actor,
		draw.result.roll,
		'table',
		vis.visibility,
		vis.sharedWith,
		input.label ?? item.title,
		operationId,
		{
			tableItemId: item.id,
			tableRowNumber: draw.result.rowNumber,
			tableRowText: draw.result.rowText,
		},
	);
	const nextHistory = [...state.session.diceHistory, record];

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.roll-table',
		path: `diceHistory/${record.id}`,
		value: {
			tableItemId: item.id,
			seed: record.seed,
			rowNumber: draw.result.rowNumber,
			total: record.total,
			visibility: record.visibility,
		},
		beforeRevision: state.session.diceHistory.length,
		afterRevision: nextHistory.length,
		// The draw depends on the table content item by reference (no clone).
		dependencies: [`content-item:${item.id}`],
	});

	return {
		status: 'accepted',
		// SES-002 AC5: if combat is running, also append a visibility-carrying roll entry to the
		// combat encounter log so the log includes visible rolls at/after combat end.
		nextState: {
			...withSessionAndCombatRoll(state, env, actor, operationId, nextHistory, record),
			sync: draft.log,
		},
		events: [diceRecordedEvent(actor.id, record)],
		operationIds: [draft.op.id],
	};
}

/**
 * Authority to draw a table: the DM, or a player holding a write-capable grant on the table item.
 * `now` (from `env.clock()`) is required so expired grants are treated as inert (PERM-004 AC2).
 */
function actorMayUseTable(
	state: CoreStateSlice,
	actor: Actor,
	itemId: string,
	now: string,
): boolean {
	if (hasDmAuthority(actor.role)) return true;
	if (actor.role === 'observer') return false;
	return (
		hasGrantedCapability(
			state.permissions,
			actor,
			CONTENT_ITEM_ENTITY_TYPE,
			itemId,
			'section-editor',
			now,
		) ||
		hasGrantedCapability(
			state.permissions,
			actor,
			CONTENT_ITEM_ENTITY_TYPE,
			itemId,
			'contributor',
			now,
		)
	);
}

// --- SES-008 — append a recorded result to a note (through the existing content write path) -------

/** Render a recorded roll as a one-line markdown append. Withholds nothing the recipient already has. */
function renderRollLine(roll: SessionDiceRoll): string {
	const prefix = roll.label ? `${roll.label}: ` : '';
	if (roll.sourceKind === 'table' && roll.tableRowText) {
		return `- ${prefix}${roll.expression} → ${roll.total} (table: ${roll.tableRowText})`;
	}
	const diceText = roll.dice && roll.dice.length > 0 ? ` [${roll.dice.join(', ')}]` : '';
	return `- ${prefix}${roll.expression} → ${roll.total}${diceText}`;
}

export function handleAppendRollToNote(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(appendRollToNoteInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const roll = state.session.diceHistory.find((entry) => entry.id === parsed.data.rollId);
	if (!roll) {
		return reject(
			{ code: 'roll-not-found', message: `Roll ${parsed.data.rollId} is not in session history.` },
			state,
		);
	}

	const now = env.clock();
	const content = ensureContentStateSlice(state.content);
	const item: ContentItem | undefined = contentItemById(content, parsed.data.itemId);
	if (!item || !isLiveContentItem(item)) {
		return reject(
			{ code: 'content-item-not-found', message: `Note ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	// The append goes through the EXISTING content write path: it requires the SAME authorized-editor
	// authority as any other note edit (fail closed).
	if (!actorMayEditItem(state, actor, item.id, now)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'You are not an authorized editor of this note.' },
			state,
		);
	}

	const line = renderRollLine(roll);
	const nextBody = item.body.trim() === '' ? line : `${item.body}\n${line}`;
	const nextContent: VaultContentState | null = updateContentItem(
		content,
		item.id,
		{ body: nextBody },
		env.clock(),
	);
	if (!nextContent) {
		return reject(
			{ code: 'content-item-not-found', message: `Note ${parsed.data.itemId} does not exist.` },
			state,
		);
	}
	const updated = contentItemById(nextContent, item.id)!;

	// Record the append attribution on the roll (who/what generated → where it went).
	const nextHistory = state.session.diceHistory.map((entry) =>
		entry.id === roll.id ? { ...entry, appendedToItemId: item.id } : entry,
	);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'content.append-roll',
		path: `content/items/${updated.id}`,
		// Records the actor + SOURCE roll on the note history (SES-008 AC2).
		value: { rollId: roll.id, sourceKind: roll.sourceKind, total: roll.total },
		beforeRevision: item.revision,
		afterRevision: updated.revision,
		dependencies: [`session:diceHistory:${roll.id}`],
	});

	const events: CoreEvent[] = [
		{
			kind: 'content.item-changed',
			itemId: updated.id,
			mutation: 'update',
			visibility: updated.visibility,
			invalidatedActorIds:
				updated.visibility === 'player-visible'
					? ['*']
					: updated.visibility === 'shared'
						? [...updated.sharedWith]
						: [],
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...withSession({ ...state, content: nextContent }, nextHistory), sync: draft.log },
		events,
		operationIds: [draft.op.id],
	};
}

function diceRecordedEvent(actorId: string, roll: SessionDiceRoll): CoreEvent {
	return {
		kind: 'session.roll-recorded',
		actorId,
		rollId: roll.id,
		sourceKind: roll.sourceKind ?? 'expression',
		visibility: roll.visibility ?? 'session-visible',
		total: roll.total,
	};
}
