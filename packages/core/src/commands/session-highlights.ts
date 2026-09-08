import { compileSessionHighlightsInputSchema } from '../schemas/commands';
import { hasDmAuthority } from '../state/permission-state';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	addContentItem,
	buildContentItem,
	calendarById,
} from '../state/content';
import { validateCustomDate, type CalendarDefinition } from '../state/calendar';
import { journalsOf } from '../state/character-state';
import { journalForCharacter } from '../state/character-journal';
import {
	SESSION_HIGHLIGHTS_SUBTYPE,
	composeSessionHighlightsMarkdown,
	isEmptyHighlightsCompile,
	type CharacterHighlights,
} from '../state/session-highlights';
import { VAULT_OBJECT_SUBTYPE_KEY } from '../state/vault-object';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	ensureContentStateSlice,
	parseInput,
	reject,
	requireActor,
} from './helpers';

/**
 * RC-CHR-4.2 — HIGHLIGHT COMPILATION (DM-only). Gathers every character's `session-highlight` journal
 * entries — a DM-authority read of the whole party, not the actor-filtered single-character query, since
 * a compile is exactly the DM auditing the table — composes them into one shared "Session highlights"
 * note (`state/session-highlights.ts` owns the pure markdown), and writes it through the SAME
 * `content.create-item`-shaped path CONTENT-011 already validates (custom-date fields checked against
 * their calendar before commit — DATA SAFETY, mirrors `commands/content.ts`).
 *
 * DM PIN-TO-TIMELINE: an optional `occurred` custom date dates the note, which — exactly as RC-SES-4.1's
 * session-log note documents — is what places a note on the Campaign timeline. No separate "pin" command
 * exists because none is needed: `content.update-item` already lets a later edit add or change that date
 * (the ordinary content-editing path, unchanged by this story).
 */
export function handleCompileSessionHighlights(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!hasDmAuthority(actor.role)) {
		return reject(
			{ code: 'actor-not-authorized', message: 'Only the DM may compile session highlights.' },
			state,
		);
	}

	const parsed = parseInput(compileSessionHighlightsInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const journals = journalsOf(state.characters);
	// Default to EVERY registered character, not just `kind: 'pc'`: a sidekick or NPC the DM plays can
	// carry the same journal (`character-journal.ts` scopes by character, not by kind), and an explicit
	// `characterIds` list is how a caller narrows it deliberately.
	const candidateIds = parsed.data.characterIds ?? Object.keys(state.characters.characters);

	const sections: CharacterHighlights[] = candidateIds
		.map((characterId): CharacterHighlights | null => {
			const record = state.characters.characters[characterId];
			if (!record) return null;
			const highlights = journalForCharacter(journals, characterId)
				.entries.filter((e) => e.kind === 'session-highlight')
				.map((e) => ({ title: e.title, body: e.body }));
			return { characterId, characterName: record.name, highlights };
		})
		.filter((section): section is CharacterHighlights => section !== null);

	if (isEmptyHighlightsCompile(sections)) {
		return reject(
			{ code: 'invalid-state', message: 'No session highlights have been recorded yet.' },
			state,
		);
	}

	const content = ensureContentStateSlice(state.content);
	if (parsed.data.occurred) {
		const calendar: CalendarDefinition | undefined = calendarById(
			content,
			parsed.data.occurred.calendarId,
		);
		if (!calendar) {
			return reject(
				{
					code: 'calendar-not-found',
					message: `Calendar ${parsed.data.occurred.calendarId} does not exist.`,
				},
				state,
			);
		}
		const validation = validateCustomDate(calendar, parsed.data.occurred);
		if (!validation.valid) {
			return reject(
				{
					code: 'invalid-calendar-date',
					message: `The date is invalid: ${validation.message ?? 'out of range'}.`,
				},
				state,
			);
		}
	}

	const contributing = sections.filter((s) => s.highlights.length > 0);
	const highlightCount = contributing.reduce((sum, s) => sum + s.highlights.length, 0);
	const title = parsed.data.title ?? 'Session highlights';

	const item = buildContentItem(
		{
			kind: 'note',
			title,
			body: composeSessionHighlightsMarkdown(sections),
			fields: {
				[VAULT_OBJECT_SUBTYPE_KEY]: SESSION_HIGHLIGHTS_SUBTYPE,
				title,
				...(parsed.data.sessionArchiveId ? { sessionArchiveId: parsed.data.sessionArchiveId } : {}),
				characterIds: contributing.map((s) => s.characterId),
				highlightCount,
			},
			// The compile hands the party a note by design (RC-CHR-4.2: "a shared Session highlights
			// note") — an explicit, deliberate visibility choice by this command, not the subtype
			// catalog's fail-closed `dm-only` authoring default.
			visibility: 'player-visible',
			...(parsed.data.occurred ? { dateFields: { occurred: parsed.data.occurred } } : {}),
		},
		{ id: env.ids(), authorActorId: actor.id, now: env.clock() },
	);

	const nextContent = addContentItem(content, item);
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CONTENT_ITEM_ENTITY_TYPE,
		entityId: item.id,
		opType: 'session.compile-highlights',
		path: `content/items/${item.id}`,
		value: { characterCount: contributing.length, highlightCount },
		afterRevision: item.revision,
	});

	const event: CoreEvent = {
		kind: 'content.item-changed',
		itemId: item.id,
		mutation: 'create',
		visibility: item.visibility,
		// `player-visible` is always delivered to every player (mirrors `deliveryAudience` in
		// `commands/content.ts`); this command never creates any other visibility.
		invalidatedActorIds: ['*'],
		actorId: actor.id,
	};

	return {
		status: 'accepted',
		nextState: { ...state, content: nextContent, sync: draft.log },
		events: [event],
		operationIds: [draft.op.id],
	};
}
