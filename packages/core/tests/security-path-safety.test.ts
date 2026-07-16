import { describe, expect, it } from 'vitest';
import {
	MAX_PATH_LENGTH,
	MAX_PATH_SEGMENT_LENGTH,
	checkVaultContainment,
	isSafePathInput,
	resolveWithinVaultRoot,
	validateIdInput,
	validatePathInput,
	type PathValidationResult,
} from '../src';

/**
 * SEC-002 — PATH-LIKE INPUT SAFETY. Adversarial evidence: every path-like input crossing a trust boundary
 * is validated against traversal, NUL bytes, control characters, excessive length, unsupported schemes,
 * and absolute paths BEFORE any read/write (AC1), and a resolved path is independently checked for VAULT
 * CONTAINMENT and rejected if it escapes the root even when earlier validation missed it (AC2). Hard
 * negative assertions: each vector REJECTS with the precise reason; legitimate paths still pass.
 */

// Control bytes are constructed from escapes so the test source carries no literal control characters.
const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);

function rejectionReason(result: PathValidationResult): string {
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error('expected rejection');
	return result.rejection.reason;
}

describe('SEC-002 path-safety — traversal rejection (AC1)', () => {
	it('rejects a `../` traversal segment in a note id / folder input', () => {
		expect(rejectionReason(validatePathInput('../secrets/passwords.md'))).toBe('path-traversal');
	});

	it('rejects a `..\\` Windows-style traversal segment', () => {
		expect(rejectionReason(validatePathInput('notes\\..\\..\\system32'))).toBe('path-traversal');
	});

	it('rejects a percent-encoded `%2e%2e` traversal segment', () => {
		expect(rejectionReason(validatePathInput('lore/%2e%2e/escape.md'))).toBe('path-traversal');
	});

	it('rejects a bare `..` and a trailing `/..`', () => {
		expect(validatePathInput('..').ok).toBe(false);
		expect(validatePathInput('lore/..').ok).toBe(false);
	});

	it('does NOT reject a legitimate filename containing dots (no separator) like `note..md`', () => {
		expect(validatePathInput('lore/note..md').ok).toBe(true);
	});
});

describe('SEC-002 path-safety — byte / scheme / absolute rejection (AC1)', () => {
	it('rejects a NUL byte (path truncation guard)', () => {
		expect(rejectionReason(validatePathInput(`lore/note.md${NUL}.png`))).toBe('null-byte');
	});

	it('rejects an embedded control character', () => {
		expect(rejectionReason(validatePathInput(`lore/note${BEL}.md`))).toBe('control-character');
	});

	it('rejects an unsupported URL scheme (`file:`/`http:`/`javascript:`)', () => {
		for (const evil of ['file:///etc/passwd', 'http://evil.example/x', 'javascript:alert(1)']) {
			expect(rejectionReason(validatePathInput(evil))).toBe('unsupported-scheme');
		}
	});

	it('rejects a POSIX-absolute and a Windows-drive-absolute and a UNC path', () => {
		expect(rejectionReason(validatePathInput('/etc/passwd'))).toBe('absolute-path');
		expect(rejectionReason(validatePathInput('C:\\Windows\\system32'))).toBe('absolute-path');
		expect(rejectionReason(validatePathInput('\\\\host\\share'))).toBe('absolute-path');
	});

	it('rejects an empty input', () => {
		expect(rejectionReason(validatePathInput(''))).toBe('empty');
	});
});

describe('SEC-002 path-safety — length bounds (AC1)', () => {
	it('rejects an excessively long whole path before allocation-heavy work', () => {
		const long = `lore/${'a'.repeat(MAX_PATH_LENGTH)}.md`;
		expect(rejectionReason(validatePathInput(long))).toBe('too-long');
	});

	it('rejects an excessively long single segment', () => {
		const segment = 'b'.repeat(MAX_PATH_SEGMENT_LENGTH + 1);
		expect(rejectionReason(validatePathInput(`lore/${segment}/x.md`))).toBe('segment-too-long');
	});
});

describe('SEC-002 path-safety — legitimate paths still pass', () => {
	it('accepts a normal vault-relative markdown path unchanged', () => {
		const result = validatePathInput('lore/factions/The Black Hand.md');
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected acceptance');
		// Validation does not rewrite — the value is returned unchanged.
		expect(result.value).toBe('lore/factions/The Black Hand.md');
	});

	it('isSafePathInput is a thin boolean over validatePathInput', () => {
		expect(isSafePathInput('lore/Highmoor.md')).toBe(true);
		expect(isSafePathInput('../escape')).toBe(false);
	});

	it('validateIdInput rejects an id carrying traversal/scheme/NUL just like a path', () => {
		expect(validateIdInput('note-123').ok).toBe(true);
		expect(validateIdInput('../note').ok).toBe(false);
		expect(validateIdInput('javascript:1').ok).toBe(false);
		expect(validateIdInput(`note${NUL}`).ok).toBe(false);
	});
});

describe('SEC-002 path-safety — vault containment is a SECOND gate (AC2)', () => {
	it('contains a normal relative path beneath the vault root', () => {
		const result = resolveWithinVaultRoot('/vault', 'a/b');
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected acceptance');
		expect(result.value).toBe('/vault/a/b');
	});

	it('contains a path that normalizes back inside the root', () => {
		// `lore/./factions/Bane.md` normalizes to `/vault/lore/factions/Bane.md` — still inside the root.
		const result = resolveWithinVaultRoot('/vault', 'lore/./factions/Bane.md');
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected acceptance');
		expect(result.value).toBe('/vault/lore/factions/Bane.md');
	});

	it('rejects an escape attempt the path validator would also catch (defence in depth)', () => {
		// The relative validator catches the `..` first; the reason is path-traversal.
		expect(rejectionReason(resolveWithinVaultRoot('/vault', '../etc/passwd'))).toBe(
			'path-traversal',
		);
	});
});

describe('SEC-002 path-safety — containment gate fires INDEPENDENTLY of input validation (AC2)', () => {
	// These tests call checkVaultContainment directly — bypassing validatePathInput — to prove that
	// the `escapes-vault-root` rejection is reachable as an INDEPENDENT second gate (SEC-002 AC2:
	// "even if earlier validation missed it"). The reason is `escapes-vault-root`, not `path-traversal`,
	// proving the containment logic is a separate code path and not dead code.

	it('rejects a `..` escape via checkVaultContainment even when input validation is bypassed', () => {
		// Direct call — no validatePathInput. Demonstrates AC2 independence.
		expect(rejectionReason(checkVaultContainment('/vault', '../etc/passwd'))).toBe(
			'escapes-vault-root',
		);
	});

	it('rejects a multi-hop escape via checkVaultContainment', () => {
		expect(rejectionReason(checkVaultContainment('/vault/data', '../../etc/shadow'))).toBe(
			'escapes-vault-root',
		);
	});

	it('keeps every excess parent segment as an escape sentinel', () => {
		expect(rejectionReason(checkVaultContainment('/vault/data', '../../../../etc/shadow'))).toBe(
			'escapes-vault-root',
		);
	});

	it('accepts a safe path via checkVaultContainment', () => {
		const result = checkVaultContainment('/vault', 'lore/Highmoor.md');
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected acceptance');
		expect(result.value).toBe('/vault/lore/Highmoor.md');
	});

	it('resolveWithinVaultRoot composes BOTH gates: input-traversal is caught by gate 1, escapes-vault-root by gate 2', () => {
		// Gate 1 fires when validatePathInput detects `..`.
		expect(rejectionReason(resolveWithinVaultRoot('/vault', '../etc/passwd'))).toBe(
			'path-traversal',
		);
		// Gate 2 (checkVaultContainment alone) fires with the INDEPENDENT `escapes-vault-root` reason.
		expect(rejectionReason(checkVaultContainment('/vault', '../etc/passwd'))).toBe(
			'escapes-vault-root',
		);
	});
});
