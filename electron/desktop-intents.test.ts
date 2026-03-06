// @vitest-environment node
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	isVaultDirectoryArg,
	parseDesktopIntentArg,
	parseProtocolIntent,
} from './desktop-intents.js';

describe('desktop intent parsing', () => {
	it('parses note protocol deep links', () => {
		expect(parseProtocolIntent('dndtools://note/note-123')).toEqual({
			kind: 'note',
			noteId: 'note-123',
		});
	});

	it('parses session protocol deep links', () => {
		expect(parseProtocolIntent('dndtools://session/board-42')).toEqual({
			kind: 'session',
			boardId: 'board-42',
		});
	});

	it('rejects malformed protocol deep links', () => {
		expect(parseProtocolIntent('https://example.com')).toBeNull();
		expect(parseProtocolIntent('dndtools://unknown/resource')).toBeNull();
		expect(parseProtocolIntent('dndtools://note/')).toBeNull();
	});

	it('parses markdown file open intents from argv values', () => {
		const parsed = parseDesktopIntentArg('C:/vault/notes/entry.md');
		expect(parsed).toEqual({
			kind: 'file',
			filePath: path.resolve('C:/vault/notes/entry.md'),
		});
	});

	it('ignores non-intent argv values', () => {
		expect(parseDesktopIntentArg('--vault=C:/vault')).toBeNull();
		expect(parseDesktopIntentArg('C:/vault')).toBeNull();
	});

	it('identifies vault directory args separately from deep-link args', () => {
		expect(isVaultDirectoryArg('C:/Users/trent/vault')).toBe(true);
		expect(isVaultDirectoryArg('dndtools://note/n1')).toBe(false);
		expect(isVaultDirectoryArg('C:/vault/notes/a.md')).toBe(false);
	});
});
