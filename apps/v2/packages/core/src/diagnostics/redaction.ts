/**
 * Secret/path redaction for diagnostics and support bundles (PLAT-009 AC2, PLAT-017
 * AC3). Redaction fails closed: anything that looks like a secret or an absolute path is
 * replaced with a stable placeholder by default, and the bundle only includes raw values
 * when the user explicitly opts in.
 */

export const REDACTED_SECRET = '[redacted]' as const;
export const REDACTED_PATH = '[redacted-path]' as const;

// Keys whose values are treated as secrets regardless of content.
const SECRET_KEY_PATTERN =
	/(token|secret|password|passwd|credential|apikey|api[_-]?key|authorization|auth[_-]?token|refresh[_-]?token|access[_-]?token|bearer|cookie|session[_-]?id|private[_-]?key|client[_-]?secret)/i;

// Absolute filesystem paths (POSIX `/Users/...`, Windows `C:\...`) and file URLs.
const ABSOLUTE_PATH_PATTERN = /(^|\s)(file:\/\/\S+|[a-zA-Z]:\\[^\s]+|\/[^\s]+\/[^\s]+)/g;

// Common secret-shaped tokens embedded in free text.
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

// JWT-shaped tokens: three dot-separated base64url segments whose header always begins with
// eyJ (the base64url encoding of `{"` — every standard JWT header is a JSON object). This
// catches raw JWTs NOT prefixed with `Bearer` that may appear in sync-source detail fields,
// error messages, or MCP response context strings.  The eyJ prefix is highly reliable and
// the two-dot requirement keeps false-positive risk negligible in normal prose.
const JWT_VALUE_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

function isSecretKey(key: string): boolean {
	return SECRET_KEY_PATTERN.test(key);
}

/** Redact absolute filesystem paths and file URLs found anywhere in a string. */
export function redactPaths(value: string): string {
	return value.replace(ABSOLUTE_PATH_PATTERN, (_match, lead: string) => `${lead}${REDACTED_PATH}`);
}

/** Redact secret-shaped tokens (bearer tokens and raw JWTs) found in free text. */
export function redactSecretsInText(value: string): string {
	// Apply Bearer pattern first so `Bearer eyJ…` becomes `Bearer [redacted]` in one pass,
	// then catch any remaining standalone JWT-shaped tokens (eyJxxx.yyy.zzz not bearer-prefixed).
	return value
		.replace(BEARER_PATTERN, `Bearer ${REDACTED_SECRET}`)
		.replace(JWT_VALUE_PATTERN, REDACTED_SECRET);
}

function redactStringValue(value: string): string {
	return redactSecretsInText(redactPaths(value));
}

/**
 * Recursively redact a diagnostics value. Keys that name secrets have their entire value
 * replaced; string values are scrubbed of absolute paths and bearer tokens. When
 * `includeSecrets` is true the value is returned unchanged (explicit user opt-in only).
 */
export function redactValue(value: unknown, includeSecrets = false): unknown {
	if (includeSecrets) return value;
	if (typeof value === 'string') return redactStringValue(value);
	if (Array.isArray(value)) return value.map((entry) => redactValue(entry, false));
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			out[key] = isSecretKey(key) ? REDACTED_SECRET : redactValue(entry, false);
		}
		return out;
	}
	return value;
}

/**
 * True when a value still contains an unredacted secret-shaped token or absolute path.
 * A value stored under a secret-named key counts only when it has not already been
 * replaced by the redaction placeholder — so a redacted bundle reads as clean.
 */
export function containsSensitiveData(value: unknown): boolean {
	if (typeof value === 'string') {
		return value !== redactStringValue(value);
	}
	if (Array.isArray(value)) return value.some((entry) => containsSensitiveData(entry));
	if (value && typeof value === 'object') {
		return Object.entries(value as Record<string, unknown>).some(([key, entry]) => {
			if (isSecretKey(key)) {
				// A secret-named key is sensitive only if its value was not redacted.
				return entry !== REDACTED_SECRET;
			}
			return containsSensitiveData(entry);
		});
	}
	return false;
}
