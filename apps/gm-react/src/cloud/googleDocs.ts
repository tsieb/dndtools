/**
 * googleDocs — the GOOGLE DOCS vault source (WS-7, product decision E). Browser authorization uses
 * Google Identity Services' token client. The access token arrives through the GIS popup callback —
 * never a URL fragment — and there is no client secret in the bundle. Requests ONLY the
 * non-restricted `drive.file` scope, so the app can reach just the Docs it creates for the user.
 * Direct OAuth implicit endpoints are deliberately not used; connecting arbitrary existing Docs
 * remains disabled until a Google Picker grant flow is implemented.
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

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const GOOGLE_IDENTITY_SCRIPT_ID = 'dndtools-google-identity-services';
const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';
/** Per-file access to files the user creates/opens with this app. Non-restricted; never widen it. */
const GOOGLE_DOCS_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// --- encoding helper (pure — unit-testable in Node) -----------------------------------------------

/** RFC 4648 §5 base64url (no padding) of raw bytes. */
export function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// --- token custody (memory + sessionStorage ONLY — never localStorage) ---------------------------

const TOKEN_SESSION_KEY = 'dndtools.gdocs.token';

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

// --- OAuth flow (Google Identity Services token client; popup callback) ---------------------------

export interface GoogleTokenResponse {
	access_token?: string;
	expires_in?: number | string;
	error?: string;
	error_description?: string;
}

export interface GoogleTokenClient {
	requestAccessToken(options?: { prompt?: string }): void;
}

export interface GoogleIdentityApi {
	accounts?: {
		oauth2?: {
			initTokenClient(config: {
				client_id: string;
				scope: string;
				callback(response: GoogleTokenResponse): void;
				error_callback?(error: { type?: string }): void;
			}): GoogleTokenClient;
		};
	};
}

const googleIdentityApi = (): GoogleIdentityApi | undefined =>
	(globalThis as unknown as { google?: GoogleIdentityApi }).google;

let googleIdentityLoad: Promise<GoogleIdentityApi> | null = null;

/** Shared, idempotent GIS script loader — googleCalendar.ts reuses it with its own scope/token. */
export function loadGoogleIdentityServices(): Promise<GoogleIdentityApi> {
	const loaded = googleIdentityApi();
	if (loaded?.accounts?.oauth2) return Promise.resolve(loaded);
	if (googleIdentityLoad) return googleIdentityLoad;
	googleIdentityLoad = new Promise((resolve, reject) => {
		const script =
			(document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null) ??
			document.createElement('script');
		let settled = false;
		let timeout = 0;
		const cleanup = () => {
			window.clearTimeout(timeout);
			script.removeEventListener('load', finish);
			script.removeEventListener('error', onError);
		};
		const fail = (message: string) => {
			if (settled) return;
			settled = true;
			cleanup();
			// A failed script element will not emit another load/error event. Remove it so the next
			// user action creates a fresh request instead of reusing a permanently rejected promise.
			if (!googleIdentityApi()?.accounts?.oauth2) script.remove();
			googleIdentityLoad = null;
			reject(new Error(message));
		};
		const finish = () => {
			const api = googleIdentityApi();
			if (!api?.accounts?.oauth2) {
				fail('Google sign-in did not initialize.');
				return;
			}
			if (settled) return;
			settled = true;
			cleanup();
			resolve(api);
		};
		const onError = () => fail('Google sign-in could not be loaded.');
		timeout = window.setTimeout(() => fail('Google sign-in took too long to load.'), 15_000);
		script.addEventListener('load', finish, { once: true });
		script.addEventListener('error', onError, { once: true });
		if (!script.id) {
			script.id = GOOGLE_IDENTITY_SCRIPT_ID;
			script.src = GOOGLE_IDENTITY_SCRIPT;
			script.async = true;
			script.defer = true;
			document.head.appendChild(script);
		}
	});
	return googleIdentityLoad;
}

/** GIS web clients require a real HTTP(S) origin. Packaged Electron must use a
 * separate installed-app PKCE/loopback client, which is intentionally not faked. */
export function isGoogleDocsRuntimeSupported(protocol: string, origin: string): boolean {
	return (protocol === 'https:' || protocol === 'http:') && origin !== 'null';
}

export type GoogleAuthOutcome =
	| { status: 'signed-in' }
	| { status: 'redirecting' }
	| { status: 'failed'; message: string };

/**
 * Start Google Identity Services' token popup and store the callback token. GIS
 * owns popup messaging and origin validation; no access token ever enters the URL.
 */
export async function connectGoogleAccount(): Promise<GoogleAuthOutcome> {
	if (!isGoogleDocsConfigured) {
		return {
			status: 'failed',
			message: `Google Docs isn’t configured in this build (see ${GOOGLE_DOCS_SETUP_RUNBOOK}).`,
		};
	}
	if (!isGoogleDocsRuntimeSupported(window.location.protocol, window.location.origin)) {
		return {
			status: 'failed',
			message:
				'Google Docs is available in the web app. Desktop authorization needs a separate Google installed-app setup and is disabled in this release.',
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
				scope: GOOGLE_DOCS_SCOPE,
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
	saveConnections(listGdocConnections().map((c) => (c.docId === docId ? { ...c, ...patch } : c)));
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
		const detail = (await response.json().catch(() => null)) as {
			error?: { message?: string };
		} | null;
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
	CONNECTIONS_KEY,
	storeToken,
};
