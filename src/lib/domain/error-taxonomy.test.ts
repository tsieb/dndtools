import { describe, expect, it } from 'vitest';
import { toStructuredErrorEvent } from './error-taxonomy.js';

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
});
