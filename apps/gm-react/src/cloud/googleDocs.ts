/**
 * googleDocs — the GOOGLE DOCS vault source (WS-7, product decision E). OAuth 2 authorization-code +
 * PKCE from the browser (no client secret in the bundle — the code exchange carries only the
 * `code_verifier`), requesting ONLY the non-restricted `drive.file` scope, so the app can reach just
 * the Docs the user created through it or explicitly connected.
 *
 * FAIL CLOSED: the entire feature is hidden/disabled until the build carries a client id in
 * `VITE_GOOGLE_CLIENT_ID` ({@link isGoogleDocsConfigured} — same pattern as cloud/config.ts). The
 * one-time Google Cloud console setup is a human step documented in
 * docs/runbooks/google-oauth-setup.md ({@link GOOGLE_DOCS_SETUP_RUNBOOK}); the UI's disabled state
 * points there instead of showing a dead button.
 *
 * TOKEN CUSTODY: access tokens live in module memory + sessionStorage ONLY (never localStorage,
 * never IndexedDB) — a tab close forgets them and the user just signs in again. Connection METADATA
 * (doc ids/titles — not secrets) persists in localStorage so the source list survives a reload.
 *
 * This module is TRANSPORT ONLY (same contract as platform/fsSource.ts): imports feed the core's
 * `content.commit-import`, and a write-back runs only AFTER the core accepted an acknowledged
 * `content.write-to-source` (CONTENT-012 — the core is the authority gate; this module performs the
 * API call its accepted event authorizes). The markdown⇄Doc conversions are PURE functions over
 * minimal structural Doc types, unit-testable in Node.
 */

// --- configuration (fail closed until VITE_GOOGLE_CLIENT_ID is set) ------------------------------

export const GOOGLE_DOCS_SETUP_RUNBOOK = 'docs/runbooks/google-oauth-setup.md';

export const googleDocsClientId: string = (() => {
	const v = import.meta.env.VITE_GOOGLE_CLIENT_ID;
	return typeof v === 'string' ? v.trim() : '';
})();

/** True only when the build carries a Google OAuth client id. Absent ⇒ the feature stays hidden. */
export const isGoogleDocsConfigured: boolean = googleDocsClientId !== '';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';
/** Per-file access to files the user creates/opens with this app. Non-restricted; never widen it. */
const GOOGLE_DOCS_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// --- PKCE helpers (pure over injectable crypto — unit-testable in Node) --------------------------

/** RFC 4648 §5 base64url (no padding) of raw bytes. */
export function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export interface PkcePair {
	verifier: string;
	challenge: string;
}

/**
 * Create an RFC 7636 code_verifier (43-char base64url of 32 random bytes) + S256 code_challenge.
 * Crypto is injectable so the pair is testable in Node (globalThis.crypto is the browser default).
 */
export async function createPkcePair(
	cryptoImpl: Pick<Crypto, 'getRandomValues' | 'subtle'> = globalThis.crypto,
): Promise<PkcePair> {
	const random = new Uint8Array(32);
	cryptoImpl.getRandomValues(random);
	const verifier = bytesToBase64Url(random);
	const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return { verifier, challenge: bytesToBase64Url(new Uint8Array(digest)) };
}

// --- token custody (memory + sessionStorage ONLY — never localStorage) ---------------------------

const TOKEN_SESSION_KEY = 'dndtools.gdocs.token';
const PENDING_AUTH_KEY = 'dndtools.gdocs.pending-auth';

interface StoredToken {
	accessToken: string;
	/** Epoch ms after which the token is treated as expired (with a 60 s safety margin). */
	expiresAt: number;
}

let memoryToken: StoredToken | null = null;

function readSessionToken(): StoredToken | null {
	try {
		const raw = sessionStorage.getItem(TOKEN_SESSION_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as StoredToken;
		if (typeof parsed.accessToken !== 'string' || typeof parsed.expiresAt !== 'number') return null;
		return parsed;
	} catch {
		return null;
	}
}

function storeToken(accessToken: string, expiresInSeconds: number): void {
	const token: StoredToken = {
		accessToken,
		expiresAt: Date.now() + Math.max(0, expiresInSeconds - 60) * 1000,
	};
	memoryToken = token;
	try {
		sessionStorage.setItem(TOKEN_SESSION_KEY, JSON.stringify(token));
	} catch {
		/* sessionStorage unavailable — the in-memory copy still covers this page lifetime */
	}
}

/** The current valid access token, or null (expired/absent ⇒ the caller shows "sign in"). */
export function getGoogleAccessToken(): string | null {
	const token = memoryToken ?? readSessionToken();
	if (!token) return null;
	if (Date.now() >= token.expiresAt) return null;
	memoryToken = token;
	return token.accessToken;
}

export function isGoogleSignedIn(): boolean {
	return getGoogleAccessToken() !== null;
}

/** Forget the session's Google token (sign out of the vault source; connections stay listed). */
export function signOutGoogle(): void {
	memoryToken = null;
	try {
		sessionStorage.removeItem(TOKEN_SESSION_KEY);
	} catch {
		/* nothing to clear */
	}
}

// --- OAuth flow (popup-first authorization-code + PKCE; full-redirect fallback) ------------------

function authRedirectUri(): string {
	// HashRouter: origin + pathname is stable regardless of the in-app route (no fragment allowed
	// in a registered redirect URI).
	return `${window.location.origin}${window.location.pathname}`;
}

function buildAuthUrl(challenge: string, state: string, redirectUri: string): string {
	const params = new URLSearchParams({
		client_id: googleDocsClientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: GOOGLE_DOCS_SCOPE,
		code_challenge: challenge,
		code_challenge_method: 'S256',
		state,
	});
	return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<void> {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		client_id: googleDocsClientId,
		redirect_uri: redirectUri,
		code_verifier: verifier,
	});
	const response = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});
	const payload = (await response.json().catch(() => ({}))) as {
		access_token?: string;
		expires_in?: number;
		error?: string;
		error_description?: string;
	};
	if (!response.ok || typeof payload.access_token !== 'string') {
		throw new GoogleDocsError(
			'auth',
			response.status,
			`Google token exchange failed${payload.error ? ` (${payload.error})` : ''}: ${
				payload.error_description ?? 'no access token returned'
			}.`,
		);
	}
	storeToken(payload.access_token, payload.expires_in ?? 3600);
}

/** Poll a popup until it returns to our origin carrying ?code&state, is closed, or times out. */
function pollPopupForCode(popup: Window, state: string): Promise<string | null> {
	return new Promise((resolve) => {
		const startedAt = Date.now();
		const timer = window.setInterval(() => {
			if (popup.closed) {
				window.clearInterval(timer);
				resolve(null);
				return;
			}
			if (Date.now() - startedAt > 5 * 60_000) {
				window.clearInterval(timer);
				popup.close();
				resolve(null);
				return;
			}
			// Cross-origin access throws while the popup is on accounts.google.com; that's expected.
			try {
				const url = new URL(popup.location.href);
				if (url.origin !== window.location.origin) return;
				const code = url.searchParams.get('code');
				const returnedState = url.searchParams.get('state');
				window.clearInterval(timer);
				popup.close();
				resolve(code && returnedState === state ? code : null);
			} catch {
				/* still on the Google origin */
			}
		}, 250);
	});
}

export type GoogleAuthOutcome =
	| { status: 'signed-in' }
	| { status: 'redirecting' }
	| { status: 'failed'; message: string };

/**
 * Start the sign-in: open the Google consent POPUP and complete the PKCE code exchange when it
 * returns. If the popup is blocked, falls back to a FULL-PAGE redirect (the pending verifier is
 * stashed in sessionStorage and {@link maybeCompleteGoogleAuth} finishes the exchange on return).
 */
export async function connectGoogleAccount(): Promise<GoogleAuthOutcome> {
	if (!isGoogleDocsConfigured) {
		return {
			status: 'failed',
			message: `Google Docs isn’t configured in this build (see ${GOOGLE_DOCS_SETUP_RUNBOOK}).`,
		};
	}
	const { verifier, challenge } = await createPkcePair();
	const state = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
	const redirectUri = authRedirectUri();
	const url = buildAuthUrl(challenge, state, redirectUri);
	const popup = window.open(url, 'dndtools-google-auth', 'popup,width=480,height=680');
	if (!popup) {
		try {
			sessionStorage.setItem(
				PENDING_AUTH_KEY,
				JSON.stringify({ verifier, state, redirectUri, returnHash: window.location.hash }),
			);
		} catch {
			return { status: 'failed', message: 'Sign-in needs sessionStorage, which is unavailable.' };
		}
		window.location.assign(url);
		return { status: 'redirecting' };
	}
	const code = await pollPopupForCode(popup, state);
	if (!code) return { status: 'failed', message: 'Google sign-in was cancelled.' };
	try {
		await exchangeCode(code, verifier, redirectUri);
		return { status: 'signed-in' };
	} catch (error) {
		return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Finish a FULL-REDIRECT sign-in (popup-blocked fallback): if the current URL carries the ?code
 * matching a stashed pending auth, exchange it, scrub the query from the URL, and restore the
 * in-app hash route the user started from. Safe to call on every panel mount (no-op otherwise).
 */
export async function maybeCompleteGoogleAuth(): Promise<boolean> {
	let pendingRaw: string | null;
	try {
		pendingRaw = sessionStorage.getItem(PENDING_AUTH_KEY);
	} catch {
		return false;
	}
	if (!pendingRaw) return false;
	const params = new URLSearchParams(window.location.search);
	const code = params.get('code');
	const state = params.get('state');
	if (!code || !state) return false;
	try {
		const pending = JSON.parse(pendingRaw) as {
			verifier: string;
			state: string;
			redirectUri: string;
			returnHash?: string;
		};
		sessionStorage.removeItem(PENDING_AUTH_KEY);
		if (pending.state !== state) return false;
		await exchangeCode(code, pending.verifier, pending.redirectUri);
		const hash = pending.returnHash || window.location.hash;
		window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
		return true;
	} catch {
		return false;
	}
}

// --- connection registry (doc ids/titles — metadata, NOT tokens; survives reloads) ---------------

const CONNECTIONS_KEY = 'dndtools.gdocs.connections';

export interface GdocConnection {
	docId: string;
	title: string;
	connectedAt: string;
	lastPullAt: string | null;
	lastPushAt: string | null;
}

export function listGdocConnections(): GdocConnection[] {
	try {
		const raw = localStorage.getItem(CONNECTIONS_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as GdocConnection[];
		return Array.isArray(parsed) ? parsed.filter((c) => typeof c?.docId === 'string') : [];
	} catch {
		return [];
	}
}

function saveConnections(connections: GdocConnection[]): void {
	try {
		localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
	} catch {
		/* metadata persistence is best-effort */
	}
}

export function addGdocConnection(docId: string, title: string): GdocConnection {
	const connections = listGdocConnections().filter((c) => c.docId !== docId);
	const record: GdocConnection = {
		docId,
		title,
		connectedAt: new Date().toISOString(),
		lastPullAt: null,
		lastPushAt: null,
	};
	saveConnections([...connections, record]);
	return record;
}

export function removeGdocConnection(docId: string): void {
	saveConnections(listGdocConnections().filter((c) => c.docId !== docId));
}

export function touchGdocConnection(
	docId: string,
	patch: Partial<Pick<GdocConnection, 'title' | 'lastPullAt' | 'lastPushAt'>>,
): void {
	saveConnections(
		listGdocConnections().map((c) => (c.docId === docId ? { ...c, ...patch } : c)),
	);
}

/** Extract a Doc id from a pasted URL or a raw id. Null when the input has no plausible id. */
export function extractDocIdFromInput(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const urlMatch = /\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{10,})/.exec(trimmed);
	if (urlMatch) return urlMatch[1];
	if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
	return null;
}

// --- Docs REST transport (honest, typed errors) ---------------------------------------------------

export type GoogleDocsErrorKind = 'auth' | 'access' | 'api';

export class GoogleDocsError extends Error {
	readonly kind: GoogleDocsErrorKind;
	readonly status: number | null;
	constructor(kind: GoogleDocsErrorKind, status: number | null, message: string) {
		super(message);
		this.name = 'GoogleDocsError';
		this.kind = kind;
		this.status = status;
	}
}

async function docsApi<T>(path: string, init: RequestInit): Promise<T> {
	const token = getGoogleAccessToken();
	if (!token) {
		throw new GoogleDocsError('auth', null, 'Google sign-in expired — sign in again to continue.');
	}
	const response = await fetch(`${DOCS_API_BASE}${path}`, {
		...init,
		headers: {
			...init.headers,
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	});
	if (response.status === 401) {
		signOutGoogle();
		throw new GoogleDocsError('auth', 401, 'Google sign-in expired — sign in again to continue.');
	}
	if (response.status === 403 || response.status === 404) {
		throw new GoogleDocsError(
			'access',
			response.status,
			'This app’s Google access (drive.file) only reaches Docs it created or that were shared to it. Create the Doc from here, or check the id.',
		);
	}
	if (!response.ok) {
		const detail = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
		throw new GoogleDocsError(
			'api',
			response.status,
			`Google Docs API error (${response.status})${detail?.error?.message ? `: ${detail.error.message}` : ''}.`,
		);
	}
	return (await response.json()) as T;
}

export async function fetchGoogleDoc(docId: string): Promise<GDocDocument> {
	return docsApi<GDocDocument>(`/${encodeURIComponent(docId)}`, { method: 'GET' });
}

export async function createGoogleDoc(title: string): Promise<GDocDocument> {
	return docsApi<GDocDocument>('', { method: 'POST', body: JSON.stringify({ title }) });
}

/**
 * Write-back transport (CONTENT-012): replace the Doc's whole body with the note's markdown,
 * rendered as native Docs structure (headings/bullets/bold). Call ONLY after the core accepted the
 * corresponding `content.write-to-source` — the core is the gate, this is the transport.
 */
export async function pushMarkdownToDoc(docId: string, markdown: string): Promise<void> {
	const doc = await fetchGoogleDoc(docId);
	const requests = markdownToDocRequests(markdown, docEndIndex(doc));
	if (requests.length === 0) return;
	await docsApi<unknown>(`/${encodeURIComponent(docId)}:batchUpdate`, {
		method: 'POST',
		body: JSON.stringify({ requests }),
	});
}

// --- minimal structural Doc types (the subset the conversions read) -------------------------------

export interface GDocTextStyle {
	bold?: boolean;
	italic?: boolean;
}

export interface GDocParagraphElement {
	textRun?: { content?: string; textStyle?: GDocTextStyle };
}

export interface GDocParagraph {
	elements?: GDocParagraphElement[];
	paragraphStyle?: { namedStyleType?: string };
	bullet?: { nestingLevel?: number };
}

export interface GDocTable {
	tableRows?: Array<{ tableCells?: Array<{ content?: GDocStructuralElement[] }> }>;
}

export interface GDocStructuralElement {
	endIndex?: number;
	paragraph?: GDocParagraph;
	table?: GDocTable;
}

export interface GDocDocument {
	documentId?: string;
	title?: string;
	body?: { content?: GDocStructuralElement[] };
}

/** The document's end index (the exclusive upper bound of its body content). */
export function docEndIndex(doc: GDocDocument): number {
	const content = doc.body?.content ?? [];
	const last = content[content.length - 1];
	return last?.endIndex ?? 1;
}

// --- Doc → markdown (pure) -------------------------------------------------------------------------

const HEADING_LEVEL: Record<string, number> = {
	TITLE: 1,
	HEADING_1: 1,
	HEADING_2: 2,
	HEADING_3: 3,
	HEADING_4: 4,
	HEADING_5: 5,
	HEADING_6: 6,
};

/** Wrap a run's non-whitespace core in a marker, keeping surrounding whitespace outside it. */
function wrapRun(text: string, marker: string): string {
	const core = text.trim();
	if (!core) return text;
	const lead = text.slice(0, text.indexOf(core[0]!));
	const trail = text.slice(lead.length + core.length);
	return `${lead}${marker}${core}${marker}${trail}`;
}

function paragraphText(paragraph: GDocParagraph): string {
	let out = '';
	for (const element of paragraph.elements ?? []) {
		const run = element.textRun;
		if (!run?.content) continue;
		let text = run.content.replace(/\n/g, '');
		if (!text) continue;
		if (run.textStyle?.bold) text = wrapRun(text, '**');
		else if (run.textStyle?.italic) text = wrapRun(text, '*');
		out += text;
	}
	return out;
}

function paragraphToMarkdownLine(paragraph: GDocParagraph): string {
	const text = paragraphText(paragraph);
	const level = HEADING_LEVEL[paragraph.paragraphStyle?.namedStyleType ?? ''] ?? 0;
	if (level > 0 && text.trim()) return `${'#'.repeat(level)} ${text.trim()}`;
	if (paragraph.bullet) {
		const indent = '  '.repeat(paragraph.bullet.nestingLevel ?? 0);
		return `${indent}- ${text}`;
	}
	return text;
}

function structuralElementsToLines(content: GDocStructuralElement[], lines: string[]): void {
	for (const element of content) {
		if (element.paragraph) {
			lines.push(paragraphToMarkdownLine(element.paragraph));
		} else if (element.table) {
			// Tables flatten to pipe rows — a declared-lossy, honest degradation (Docs tables have no
			// markdown-note equivalent in this app).
			for (const row of element.table.tableRows ?? []) {
				const cells = (row.tableCells ?? []).map((cell) => {
					const cellLines: string[] = [];
					structuralElementsToLines(cell.content ?? [], cellLines);
					return cellLines.join(' ').trim();
				});
				lines.push(`| ${cells.join(' | ')} |`);
			}
		}
		// Section breaks / other structural elements contribute no text.
	}
}

/** Convert a fetched Doc to markdown for `content.commit-import`. Pure. */
export function docToMarkdown(doc: GDocDocument): string {
	const lines: string[] = [];
	structuralElementsToLines(doc.body?.content ?? [], lines);
	while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
	while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
	return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

// --- markdown → Docs batchUpdate requests (pure) ---------------------------------------------------

/** A Docs API batchUpdate request (structural — only the shapes this module emits). */
export type GDocRequest = Record<string, unknown>;

interface ParsedPushLine {
	/** The line's final inserted text (markers stripped). */
	text: string;
	/** 1–6 when the markdown line was a heading. */
	heading: number | null;
	bullet: boolean;
	/** Bold ranges as [start, end) offsets WITHIN this line's stripped text (UTF-16 units). */
	boldRanges: Array<[number, number]>;
}

function parsePushLine(raw: string): ParsedPushLine {
	let text = raw;
	let heading: number | null = null;
	let bullet = false;
	const headingMatch = /^(#{1,6})\s+/.exec(text);
	if (headingMatch) {
		heading = headingMatch[1]!.length;
		text = text.slice(headingMatch[0].length);
	} else {
		const bulletMatch = /^\s*[-*]\s+/.exec(text);
		if (bulletMatch) {
			bullet = true;
			text = text.slice(bulletMatch[0].length);
		}
	}
	// Strip **bold** pairs, recording the resulting ranges.
	const boldRanges: Array<[number, number]> = [];
	let stripped = '';
	let cursor = 0;
	const pattern = /\*\*([^*]+)\*\*/g;
	for (const match of text.matchAll(pattern)) {
		stripped += text.slice(cursor, match.index);
		const start = stripped.length;
		stripped += match[1]!;
		boldRanges.push([start, stripped.length]);
		cursor = match.index + match[0].length;
	}
	stripped += text.slice(cursor);
	return { text: stripped, heading, bullet, boldRanges };
}

/**
 * Build the batchUpdate request list that replaces a Doc's body with a markdown note: delete the
 * existing content, insert the stripped text, then re-apply headings, bullets, and bold as native
 * Docs structure. Deterministic and pure — `docEndIndex` comes from a fresh `documents.get`.
 * Docs indices are UTF-16 code units, which is exactly JS string length arithmetic.
 */
export function markdownToDocRequests(markdown: string, docEndIndex: number): GDocRequest[] {
	const requests: GDocRequest[] = [];
	// A Doc's body always retains its final newline; deletable content is [1, endIndex - 1).
	if (docEndIndex - 1 > 1) {
		requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: docEndIndex - 1 } } });
	}
	const trimmed = markdown.replace(/\s+$/, '');
	if (trimmed === '') return requests;
	const lines = trimmed.split('\n').map(parsePushLine);
	const fullText = `${lines.map((line) => line.text).join('\n')}\n`;
	requests.push({ insertText: { location: { index: 1 }, text: fullText } });
	// Reset the whole inserted range to NORMAL_TEXT first (the surviving final newline may carry an
	// old style), then override heading lines.
	requests.push({
		updateParagraphStyle: {
			range: { startIndex: 1, endIndex: 1 + fullText.length },
			paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
			fields: 'namedStyleType',
		},
	});
	let offset = 0;
	let bulletRunStart: number | null = null;
	const closeBulletRun = (endOffset: number) => {
		if (bulletRunStart === null) return;
		requests.push({
			createParagraphBullets: {
				range: { startIndex: 1 + bulletRunStart, endIndex: 1 + endOffset },
				bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
			},
		});
		bulletRunStart = null;
	};
	for (const line of lines) {
		const lineStart = offset;
		const lineEnd = offset + line.text.length + 1; // includes this line's newline
		if (line.heading) {
			closeBulletRun(lineStart);
			requests.push({
				updateParagraphStyle: {
					range: { startIndex: 1 + lineStart, endIndex: 1 + lineEnd },
					paragraphStyle: { namedStyleType: `HEADING_${Math.min(line.heading, 6)}` },
					fields: 'namedStyleType',
				},
			});
		} else if (line.bullet) {
			if (bulletRunStart === null) bulletRunStart = lineStart;
		} else {
			closeBulletRun(lineStart);
		}
		for (const [start, end] of line.boldRanges) {
			requests.push({
				updateTextStyle: {
					range: { startIndex: 1 + lineStart + start, endIndex: 1 + lineStart + end },
					textStyle: { bold: true },
					fields: 'bold',
				},
			});
		}
		offset = lineEnd;
	}
	closeBulletRun(offset);
	return requests;
}

export const __testing = {
	TOKEN_SESSION_KEY,
	PENDING_AUTH_KEY,
	CONNECTIONS_KEY,
	storeToken,
};
