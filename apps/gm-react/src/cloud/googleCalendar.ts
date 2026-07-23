/**
 * googleCalendar — client-side session scheduling (cloud-tier roadmap P2 #8, the Calendar half).
 * Creates a real-world Google Calendar event for the next play session — attendee invites plus a
 * Calendar-native reminder — through the SAME fail-closed Google client id used by googleDocs
 * (`VITE_GOOGLE_CLIENT_ID`; absent ⇒ the feature stays disabled and points at the setup runbook).
 *
 * METADATA ONLY by design: the event carries a session title, a time, attendee emails, and an
 * optional freeform note the DM types — never vault content. That keeps scheduling equally
 * available to Private (E2EE) vaults (ADR-026): it reveals scheduling metadata and nothing else.
 * Reminders are Calendar-native (popup/email at the attendee's own settings), so the feature needs
 * no FCM/server infrastructure — the FCM push half of roadmap #8 stays independently blocked.
 *
 * TOKEN CUSTODY mirrors googleDocs: memory + sessionStorage ONLY, and a SEPARATE token under the
 * `calendar.events` scope — the Docs `drive.file` grant is never widened (its module says "never
 * widen it"; this module honors that by asking Google for its own narrowly-scoped token instead).
 */
import {
	GOOGLE_DOCS_SETUP_RUNBOOK,
	googleDocsClientId,
	isGoogleDocsConfigured,
	isGoogleDocsRuntimeSupported,
	loadGoogleIdentityServices,
	type GoogleAuthOutcome,
} from './googleDocs';

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const TOKEN_SESSION_KEY = 'dndtools.gcal.token';

/** The feature rides the same build-time client id as Google Docs (one console setup). */
export const isGoogleCalendarConfigured: boolean = isGoogleDocsConfigured;
export const GOOGLE_CALENDAR_SETUP_RUNBOOK = GOOGLE_DOCS_SETUP_RUNBOOK;

// --- token custody (memory + sessionStorage ONLY — never localStorage) ---------------------------

interface StoredToken {
	accessToken: string;
	expiresAt: number;
}

let memoryToken: StoredToken | null = null;

function storeToken(accessToken: string, expiresInSeconds: number): void {
	const token: StoredToken = {
		accessToken,
		expiresAt: Date.now() + Math.max(0, expiresInSeconds - 60) * 1000,
	};
	memoryToken = token;
	try {
		sessionStorage.setItem(TOKEN_SESSION_KEY, JSON.stringify(token));
	} catch {
		/* memory copy still works for this tab */
	}
}

function readToken(): StoredToken | null {
	if (memoryToken && memoryToken.expiresAt > Date.now()) return memoryToken;
	try {
		const raw = sessionStorage.getItem(TOKEN_SESSION_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as StoredToken;
		if (typeof parsed?.accessToken !== 'string' || typeof parsed?.expiresAt !== 'number')
			return null;
		if (parsed.expiresAt <= Date.now()) return null;
		memoryToken = parsed;
		return parsed;
	} catch {
		return null;
	}
}

export function isGoogleCalendarSignedIn(): boolean {
	return readToken() !== null;
}

export function signOutGoogleCalendar(): void {
	memoryToken = null;
	try {
		sessionStorage.removeItem(TOKEN_SESSION_KEY);
	} catch {
		/* nothing to clear */
	}
}

// --- OAuth (its own narrowly-scoped token via the shared GIS loader) -----------------------------

export async function connectGoogleCalendar(): Promise<GoogleAuthOutcome> {
	if (!isGoogleCalendarConfigured) {
		return {
			status: 'failed',
			message: `Google Calendar isn’t configured in this build (see ${GOOGLE_CALENDAR_SETUP_RUNBOOK}).`,
		};
	}
	if (!isGoogleDocsRuntimeSupported(window.location.protocol, window.location.origin)) {
		return {
			status: 'failed',
			message:
				'Scheduling is available in the web app. Desktop authorization needs a separate Google installed-app setup and is disabled in this release.',
		};
	}
	try {
		const api = await loadGoogleIdentityServices();
		return await new Promise<GoogleAuthOutcome>((resolve) => {
			let settled = false;
			const finish = (outcome: GoogleAuthOutcome) => {
				if (settled) return;
				settled = true;
				resolve(outcome);
			};
			const client = api.accounts!.oauth2!.initTokenClient({
				client_id: googleDocsClientId,
				scope: GOOGLE_CALENDAR_SCOPE,
				callback: (response) => {
					if (response.error || !response.access_token) {
						finish({ status: 'failed', message: 'Google sign-in was cancelled or denied.' });
						return;
					}
					const expiresIn = Number(response.expires_in);
					storeToken(
						response.access_token,
						Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
					);
					finish({ status: 'signed-in' });
				},
				error_callback: () =>
					finish({
						status: 'failed',
						message: 'Google sign-in was cancelled or the popup was blocked.',
					}),
			});
			client.requestAccessToken({ prompt: '' });
		});
	} catch (error) {
		return {
			status: 'failed',
			message: error instanceof Error ? error.message : 'Google sign-in could not be started.',
		};
	}
}

// --- pure event assembly (unit-testable in Node) -------------------------------------------------

export interface SessionEventInput {
	/** Event title, e.g. "D&D — Saltreach, session 7". */
	summary: string;
	/** Local start as an ISO string WITH offset (from `new Date(...).toISOString()` or equivalent). */
	startIso: string;
	durationMinutes: number;
	/** Already-validated attendee emails; non-emails must be filtered out by the caller. */
	attendeeEmails: string[];
	/** Optional freeform note typed by the DM. NEVER auto-filled from vault content. */
	details?: string;
	/** Reminder lead time in minutes; ≤0 disables the explicit override. */
	reminderMinutes: number;
}

export interface CalendarEventPayload {
	summary: string;
	description?: string;
	start: { dateTime: string };
	end: { dateTime: string };
	attendees?: Array<{ email: string }>;
	reminders: { useDefault: boolean; overrides?: Array<{ method: 'popup'; minutes: number }> };
}

/** Conservative email shape check for roster entries (the onboarding roster mixes names and emails). */
export function isLikelyEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function buildSessionEventPayload(input: SessionEventInput): CalendarEventPayload {
	const start = new Date(input.startIso);
	if (Number.isNaN(start.getTime())) throw new Error('Invalid session start time.');
	const minutes = Math.min(Math.max(Math.round(input.durationMinutes), 15), 24 * 60);
	const end = new Date(start.getTime() + minutes * 60_000);
	const reminder = Math.round(input.reminderMinutes);
	const payload: CalendarEventPayload = {
		summary: input.summary.trim() || 'Game session',
		start: { dateTime: start.toISOString() },
		end: { dateTime: end.toISOString() },
		reminders:
			reminder > 0
				? {
						useDefault: false,
						overrides: [{ method: 'popup', minutes: Math.min(reminder, 40_320) }],
					}
				: { useDefault: true },
	};
	const details = input.details?.trim();
	if (details) payload.description = details;
	const attendees = input.attendeeEmails.filter(isLikelyEmail).map((email) => ({ email }));
	if (attendees.length) payload.attendees = attendees;
	return payload;
}

// --- API call ------------------------------------------------------------------------------------

export type GoogleCalendarErrorKind = 'auth' | 'access' | 'api';

export class GoogleCalendarError extends Error {
	readonly kind: GoogleCalendarErrorKind;
	constructor(kind: GoogleCalendarErrorKind, message: string) {
		super(message);
		this.kind = kind;
	}
}

export interface CreatedCalendarEvent {
	id: string;
	htmlLink: string;
}

/**
 * Create the event on the signed-in user's primary calendar. `sendUpdates=all` makes Google email
 * the attendee invitations — the entire "reminder" story with zero server infrastructure.
 */
export async function createSessionEvent(input: SessionEventInput): Promise<CreatedCalendarEvent> {
	const token = readToken();
	if (!token) throw new GoogleCalendarError('auth', 'Google Calendar sign-in has expired.');
	const response = await fetch(`${CALENDAR_API_BASE}?sendUpdates=all`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${token.accessToken}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify(buildSessionEventPayload(input)),
	});
	if (response.status === 401) {
		signOutGoogleCalendar();
		throw new GoogleCalendarError('auth', 'Google Calendar sign-in has expired.');
	}
	if (response.status === 403)
		throw new GoogleCalendarError(
			'access',
			'Google rejected the calendar request — the OAuth consent screen may not include the calendar.events scope yet.',
		);
	if (!response.ok)
		throw new GoogleCalendarError('api', `Calendar request failed (${response.status}).`);
	const data = (await response.json()) as { id?: string; htmlLink?: string };
	if (!data.id) throw new GoogleCalendarError('api', 'Calendar returned no event id.');
	return { id: data.id, htmlLink: data.htmlLink ?? '' };
}
