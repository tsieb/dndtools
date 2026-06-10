import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	MAX_IMPORT_ENTRIES,
	NEUTRALIZED_URL,
	dispatchCommand,
	getContentItemsForActor,
	importItemIdForPath,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';

/**
 * SEC-002 / SEC-003 / SEC-006 — the IMPORT trust boundary, end to end through the `content.commit-import`
 * command. This proves the security gates are WIRED (not just unit-tested in isolation): an unsafe path is
 * rejected before storage access (SEC-002 AC1), an oversized archive is rejected before allocation-heavy
 * processing (SEC-006 AC1), the structured rejection identifies the field path, and content imported from a
 * source is SANITIZED at the boundary so a smuggled `<script>` / `javascript:` URL never reaches storage
 * (SEC-003 AC1). A legitimate archive still imports.
 */

function base(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
}

function commitImport(
	state: CoreStateSlice,
	files: Array<{ path: string; text: string }>,
	actorId = DM_ACTOR.id,
): CommandResult {
	const command: CoreCommand = {
		type: 'content.commit-import',
		actorId,
		payload: { sourceKind: 'obsidian-vault', policy: 'overwrite', files, appliedEntryIds: [] },
	};
	return dispatchCommand(state, makeEnvironment(), command);
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

describe('SEC-002 import boundary — unsafe archive paths are rejected before storage (AC1)', () => {
	it('rejects a `../` traversal path with a structured field-path issue and writes nothing', () => {
		const state = base();
		const before = JSON.stringify(state.content);
		const result = rejected(
			commitImport(state, [{ path: '../../etc/passwd.md', text: 'pwned' }]),
		);
		expect(result.rejection.code).toBe('unsafe-path-input');
		expect(result.rejection.issues?.[0]?.path).toBe('files[0].path');
		// No partial commit: the prior content state is byte-identical.
		expect(JSON.stringify(result.nextState.content)).toBe(before);
	});

	it('rejects an absolute / scheme-prefixed archive path', () => {
		const state = base();
		expect(rejected(commitImport(state, [{ path: '/etc/shadow.md', text: 'x' }])).rejection.code).toBe(
			'unsafe-path-input',
		);
		expect(
			rejected(commitImport(state, [{ path: 'file:///etc/passwd', text: 'x' }])).rejection.code,
		).toBe('unsafe-path-input');
	});

	it('a single unsafe path rejects the WHOLE transactional import (no partial)', () => {
		const state = base();
		const before = JSON.stringify(state.content);
		const result = rejected(
			commitImport(state, [
				{ path: 'lore/Good.md', text: '# Good' },
				{ path: '../escape.md', text: 'bad' },
			]),
		);
		expect(result.rejection.code).toBe('unsafe-path-input');
		expect(JSON.stringify(result.nextState.content)).toBe(before);
	});
});

describe('SEC-006 import boundary — oversized archives are rejected before processing (AC1)', () => {
	it('rejects an import with more entries than the configured maximum, identifying the field path', () => {
		const state = base();
		const files = Array.from({ length: MAX_IMPORT_ENTRIES + 1 }, (_unused, i) => ({
			path: `note-${i}.md`,
			text: 'x',
		}));
		const result = rejected(commitImport(state, files));
		expect(result.rejection.code).toBe('payload-too-large');
		expect(result.rejection.issues?.[0]?.path).toBe('files');
	});
});

describe('SEC-003 import boundary — imported content is sanitized at rest (AC1)', () => {
	it('a `<script>` / `javascript:` URL smuggled via an import never reaches the stored item body', () => {
		const state = base();
		const evil = [
			'# Trap',
			'',
			'<script>alert(document.cookie)</script>',
			'',
			'[steal](javascript:fetch("//evil"))',
		].join('\n');
		const result = accepted(commitImport(state, [{ path: 'lore/Trap.md', text: evil }]));
		const itemId = importItemIdForPath('lore/Trap.md');
		const items = getContentItemsForActor(result.nextState.content, result.nextState.permissions, DM_ACTOR.id);
		const stored = items.find((item) => item.id === itemId);
		expect(stored).toBeDefined();
		expect(stored!.body).not.toContain('<script>');
		expect(stored!.body).not.toContain('javascript:');
		// The neutralized-URL sentinel proves the dangerous link was rewritten (text kept, target inert).
		expect(stored!.body).toContain(NEUTRALIZED_URL);
	});
});

describe('import boundary — a legitimate archive still imports', () => {
	it('a safe markdown archive imports successfully (no false positives)', () => {
		const state = base();
		const result = accepted(
			commitImport(state, [
				{ path: 'lore/Highmoor.md', text: '# Highmoor\n\nAn ancient keep. See [[Bane]].' },
			]),
		);
		expect(result.status).toBe('accepted');
		const items = getContentItemsForActor(result.nextState.content, result.nextState.permissions, DM_ACTOR.id);
		expect(items.some((item) => item.id === importItemIdForPath('lore/Highmoor.md'))).toBe(true);
	});
});
