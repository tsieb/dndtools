import {
	linkCalendarDateInputSchema,
	setCampaignDateInputSchema,
	unlinkCalendarDateInputSchema,
} from '../schemas/commands';
import { validateCustomDate, type CustomDate } from '../state/calendar';
import {
	addCalendarLink,
	removeCalendarLink,
	setCampaignDate,
	type CalendarContinuityState,
	type CalendarLink,
	type CalendarLinkTargetKind,
} from '../state/calendar-continuity';
import { calendarById } from '../state/content';
import { isLiveContentItem } from '../state/content';
import type { CommandRejection, CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * SES-012 — the CAMPAIGN CALENDAR CONTINUITY commands (Architecture Contract 1 / Contract 3 / Contract 4).
 *
 * The DM maintains the campaign CURRENT DATE (in custom-calendar terms) and LINKS dates to notes,
 * sessions, maps, events, and handouts. The architecture invariants this slice upholds:
 *
 *   - DM-only (SES-012 authoring is the DM's). Only the DM may set the date or link/unlink; a non-DM is
 *     rejected fail closed.
 *   - REUSE the CONTENT-011 calendar engine: the date is validated against its referenced calendar
 *     definition (`validateCustomDate`) BEFORE any write. An unknown calendar or out-of-range date is
 *     rejected fail closed (`calendar-not-found` / `invalid-calendar-date`) — the campaign never stores an
 *     unrepresentable date. No calendar arithmetic is re-implemented here.
 *   - LINK BY REFERENCE (Contract 4): a link stores ONLY the reference (kind + target id) + the anchoring
 *     date + a DM-authored label — never a copy of the target's content. The link command validates that a
 *     concrete target EXISTS (fail closed: never link to a non-existent note/map/handout), but a
 *     `session`/`event` link MAY be a bare dated marker (no target). The actor-filtered read resolves each
 *     reference LIVE; a hidden/deleted target degrades to `unavailable` at read time (no leak, no clone).
 *
 * Pure Processing-Core policy: the reducers are deterministic; durable writes are op-log entries; the GUI
 * dispatches the intent and renders the actor-filtered read (it never touches storage).
 */

const SESSION_ENTITY_ID = 'session-default';

/** Validate a custom date against its referenced campaign calendar. Null when valid (fail closed). */
function validateCampaignDate(state: CoreStateSlice, date: CustomDate): CommandRejection | null {
	const calendar = calendarById(state.content, date.calendarId);
	if (!calendar) {
		return {
			code: 'calendar-not-found',
			message: `Calendar ${date.calendarId} does not exist.`,
		};
	}
	const validation = validateCustomDate(calendar, date);
	if (!validation.valid) {
		return {
			code: 'invalid-calendar-date',
			message: `The campaign date is invalid: ${validation.message ?? 'out of range'}.`,
		};
	}
	return null;
}

/**
 * Validate that a link's concrete target EXISTS for its kind (fail closed). A `note`/`event` references a
 * LIVE content item; a `map` references a map entity; a `handout` references a session handout; a
 * `session` references a session-archive snapshot. A null target is allowed ONLY for `session`/`event`
 * (a bare dated marker). Returns a rejection on a missing/wrong target, else null.
 *
 * NOTE: this is an EXISTENCE check, not a visibility check — the DM may link to any entity they own. The
 * actor-filtered READ decides whether a viewer sees the linked content (a non-DM never leaks it).
 */
function validateLinkTarget(
	state: CoreStateSlice,
	kind: CalendarLinkTargetKind,
	targetId: string | null,
): CommandRejection | null {
	if (targetId === null) {
		if (kind === 'session' || kind === 'event') return null;
		return {
			code: 'invalid-payload',
			message: `A ${kind} calendar link requires a target id.`,
		};
	}
	switch (kind) {
		case 'note':
		case 'event': {
			const item = state.content.items[targetId];
			if (!item || !isLiveContentItem(item)) {
				return { code: 'content-item-not-found', message: `Content item ${targetId} does not exist.` };
			}
			return null;
		}
		case 'map': {
			if (!state.maps.maps[targetId]) {
				return { code: 'map-not-found', message: `Map ${targetId} does not exist.` };
			}
			return null;
		}
		case 'handout': {
			if (!state.session.handouts[targetId]) {
				return {
					code: 'content-item-not-found',
					message: `Handout ${targetId} does not exist.`,
				};
			}
			return null;
		}
		case 'session': {
			if (!state.session.archives[targetId]) {
				return {
					code: 'invalid-payload',
					message: `Session archive ${targetId} does not exist.`,
				};
			}
			return null;
		}
	}
}

export function handleSetCampaignDate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setCampaignDateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const dateRejection = validateCampaignDate(state, parsed.data.date);
	if (dateRejection) return reject(dateRejection, state);

	const previousRevision = state.session.calendarContinuity.dateRevision;
	const nextContinuity: CalendarContinuityState = setCampaignDate(
		state.session.calendarContinuity,
		parsed.data.date,
	);
	const nextSession = { ...state.session, calendarContinuity: nextContinuity };
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.set-campaign-date',
		path: 'calendarContinuity/currentDate',
		value: { date: parsed.data.date },
		beforeRevision: previousRevision,
		afterRevision: nextContinuity.dateRevision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [
			{
				kind: 'session.campaign-date-set',
				calendarId: parsed.data.date.calendarId,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleLinkCalendarDate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(linkCalendarDateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	const dateRejection = validateCampaignDate(state, input.date);
	if (dateRejection) return reject(dateRejection, state);

	const targetRejection = validateLinkTarget(state, input.kind, input.targetId);
	if (targetRejection) return reject(targetRejection, state);

	const linkId = env.ids();
	const now = env.clock();
	const link: CalendarLink = {
		id: linkId,
		kind: input.kind,
		label: input.label,
		date: { ...input.date },
		targetId: input.targetId,
		createdBy: actor.id,
		createdAt: now,
		revision: 1,
	};
	const nextContinuity = addCalendarLink(state.session.calendarContinuity, link);
	const nextSession = { ...state.session, calendarContinuity: nextContinuity };
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.link-calendar-date',
		path: `calendarContinuity/links/${linkId}`,
		// The op records the REFERENCE (kind + target id + date), never the target's content.
		value: { linkId, kind: link.kind, targetId: link.targetId, date: link.date },
		beforeRevision: 0,
		afterRevision: link.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [
			{
				kind: 'session.calendar-date-linked',
				linkId,
				linkKind: link.kind,
				targetId: link.targetId,
				actorId: actor.id,
			},
		],
		operationIds: [op.id],
	};
}

export function handleUnlinkCalendarDate(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(unlinkCalendarDateInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const link = state.session.calendarContinuity.links[parsed.data.linkId];
	if (!link) {
		return reject(
			{
				code: 'invalid-payload',
				message: `Calendar link ${parsed.data.linkId} does not exist.`,
			},
			state,
		);
	}

	const nextContinuity = removeCalendarLink(state.session.calendarContinuity, link.id);
	const nextSession = { ...state.session, calendarContinuity: nextContinuity };
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: 'session',
		entityId: SESSION_ENTITY_ID,
		opType: 'session.unlink-calendar-date',
		path: `calendarContinuity/links/${link.id}`,
		value: { linkId: link.id },
		beforeRevision: link.revision,
		afterRevision: link.revision + 1,
	});

	return {
		status: 'accepted',
		nextState: { ...state, session: nextSession, sync: nextLog },
		events: [{ kind: 'session.calendar-date-unlinked', linkId: link.id, actorId: actor.id }],
		operationIds: [op.id],
	};
}
