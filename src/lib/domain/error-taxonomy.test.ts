import { describe, expect, it } from 'vitest';
import { ERROR_TAXONOMY, getErrorTaxonomyEntry, toStructuredErrorEvent } from './error-taxonomy.js';

// ─── Registry integrity ───────────────────────────────────────────────────────

describe('ERROR_TAXONOMY registry', () => {
	it('has an entry for every category default code', () => {
		const defaultCodes = [
			'STORAGE_FAILURE',
			'PARSING_FAILURE',
			'IPC_FAILURE',
			'MCP_SIDECAR_FAILURE',
			'UI_RUNTIME_FAILURE',
		];
		for (const code of defaultCodes) {
			expect(ERROR_TAXONOMY[code], `missing default entry for ${code}`).toBeDefined();
		}
	});

	it('every entry has non-empty humanMessage, recoveryHint, severity, and category', () => {
		for (const [code, entry] of Object.entries(ERROR_TAXONOMY)) {
			expect(entry.humanMessage.length, `${code}.humanMessage empty`).toBeGreaterThan(0);
			expect(entry.recoveryHint.length, `${code}.recoveryHint empty`).toBeGreaterThan(0);
			expect(['error', 'warning', 'info'], `${code}.severity invalid`).toContain(entry.severity);
			expect(
				['storage', 'parsing', 'ipc', 'mcp_sidecar', 'ui_runtime'],
				`${code}.category invalid`,
			).toContain(entry.category);
		}
	});

	it('parsing codes default to warning or info severity, never error', () => {
		const parsingCodes = Object.entries(ERROR_TAXONOMY)
			.filter(([, e]) => e.category === 'parsing')
			.map(([code]) => code);
		expect(parsingCodes.length).toBeGreaterThan(0);
		for (const code of parsingCodes) {
			expect(ERROR_TAXONOMY[code]?.severity).not.toBe('error');
		}
	});

	it('PARSING_WIKILINK_FAILED is info severity', () => {
		expect(ERROR_TAXONOMY.PARSING_WIKILINK_FAILED?.severity).toBe('info');
	});

	it('IPC_TIMEOUT is warning severity', () => {
		expect(ERROR_TAXONOMY.IPC_TIMEOUT?.severity).toBe('warning');
	});

	it('UNHANDLED_REJECTION is warning severity', () => {
		expect(ERROR_TAXONOMY.UNHANDLED_REJECTION?.severity).toBe('warning');
	});

	it('MAIN_UNHANDLED_REJECTION is warning severity', () => {
		expect(ERROR_TAXONOMY.MAIN_UNHANDLED_REJECTION?.severity).toBe('warning');
	});
});

// ─── getErrorTaxonomyEntry ────────────────────────────────────────────────────

describe('getErrorTaxonomyEntry', () => {
	it('returns the taxonomy entry for a known code', () => {
		const entry = getErrorTaxonomyEntry('STORAGE_FAILURE');
		expect(entry).not.toBeNull();
		expect(entry?.category).toBe('storage');
		expect(entry?.severity).toBe('error');
		expect(entry?.recoveryHint).toBeTruthy();
	});

	it('returns null for an unknown code', () => {
		expect(getErrorTaxonomyEntry('UNKNOWN_MYSTERY_CODE')).toBeNull();
	});

	it('returns null for an empty string', () => {
		expect(getErrorTaxonomyEntry('')).toBeNull();
	});
});

// ─── toStructuredErrorEvent ───────────────────────────────────────────────────

describe('toStructuredErrorEvent', () => {
	it('uses category defaults and captures Error metadata', () => {
		const error = new Error('Unable to save note');
		const event = toStructuredErrorEvent({
			category: 'storage',
			error,
		});

		expect(event.category).toBe('storage');
		expect(event.code).toBe('STORAGE_FAILURE');
		expect(event.message).toBe('Unable to save note');
		expect(event.severity).toBe('error');
		expect(event.recoveryHint).toBe(ERROR_TAXONOMY.STORAGE_FAILURE?.recoveryHint);
		expect(event.details).toContain('Unable to save note');
		expect(event.context).toEqual({});
		expect(event.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(event.id.length).toBeGreaterThan(4);
	});

	it('supports custom code/context and non-Error input', () => {
		const event = toStructuredErrorEvent({
			category: 'ipc',
			error: 'channel unavailable',
			code: 'IPC_CHANNEL_DOWN',
			context: { channel: 'dndtools:mcp-status' },
		});

		expect(event.code).toBe('IPC_CHANNEL_DOWN');
		expect(event.message).toBe('channel unavailable');
		expect(event.details).toBeNull();
		expect(event.context).toEqual({ channel: 'dndtools:mcp-status' });
	});

	it('derives severity from taxonomy for known codes', () => {
		const warningEvent = toStructuredErrorEvent({
			category: 'parsing',
			error: 'bad markdown',
			code: 'PARSING_MARKDOWN_FAILED',
		});
		expect(warningEvent.severity).toBe('warning');

		const infoEvent = toStructuredErrorEvent({
			category: 'parsing',
			error: 'link not found',
			code: 'PARSING_WIKILINK_FAILED',
		});
		expect(infoEvent.severity).toBe('info');
	});

	it('populates recoveryHint from taxonomy for known codes', () => {
		const event = toStructuredErrorEvent({
			category: 'mcp_sidecar',
			error: 'bundle not found',
			code: 'MCP_SIDECAR_MISSING_BUNDLE',
		});
		expect(event.recoveryHint).toBe(ERROR_TAXONOMY.MCP_SIDECAR_MISSING_BUNDLE?.recoveryHint);
	});

	it('allows caller to override recoveryHint', () => {
		const custom = 'Custom hint for this context.';
		const event = toStructuredErrorEvent({
			category: 'storage',
			error: 'write failed',
			code: 'STORAGE_WRITE_FAILED',
			recoveryHint: custom,
		});
		expect(event.recoveryHint).toBe(custom);
	});

	it('allows caller to pass null recoveryHint to suppress it', () => {
		const event = toStructuredErrorEvent({
			category: 'storage',
			error: 'write failed',
			code: 'STORAGE_WRITE_FAILED',
			recoveryHint: null,
		});
		expect(event.recoveryHint).toBeNull();
	});

	it('allows caller to override severity', () => {
		const event = toStructuredErrorEvent({
			category: 'storage',
			error: 'minor issue',
			code: 'STORAGE_FAILURE',
			severity: 'warning',
		});
		expect(event.severity).toBe('warning');
	});

	it('falls back gracefully for unknown codes', () => {
		const event = toStructuredErrorEvent({
			category: 'ipc',
			error: new Error('mystery error'),
			code: 'IPC_TOTALLY_UNKNOWN_CODE',
		});

		expect(event.code).toBe('IPC_TOTALLY_UNKNOWN_CODE');
		// Falls back to category default severity
		expect(event.severity).toBe('error');
		// Falls back to category default hint
		expect(event.recoveryHint).toBe(ERROR_TAXONOMY.IPC_FAILURE?.recoveryHint);
	});

	it('recoveryHint is present on every event with a known taxonomy code', () => {
		for (const code of Object.keys(ERROR_TAXONOMY)) {
			const event = toStructuredErrorEvent({
				category: ERROR_TAXONOMY[code]!.category,
				error: 'test error',
				code,
			});
			expect(event.recoveryHint, `${code} should have recoveryHint`).not.toBeNull();
		}
	});
});
