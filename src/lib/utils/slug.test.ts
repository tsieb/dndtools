import { describe, it, expect } from 'vitest';
import { slugify } from './slug.js';

describe('slugify', () => {
	it('converts spaces to hyphens', () => {
		expect(slugify('hello world')).toBe('hello-world');
	});

	it('converts to lowercase', () => {
		expect(slugify('Hello World')).toBe('hello-world');
	});

	it('removes special characters', () => {
		expect(slugify("Barthen's Provisions")).toBe('barthens-provisions');
	});

	it('collapses multiple hyphens', () => {
		expect(slugify('hello---world')).toBe('hello-world');
	});

	it('trims leading and trailing hyphens', () => {
		expect(slugify('--hello--')).toBe('hello');
	});

	it('handles empty string', () => {
		expect(slugify('')).toBe('');
	});

	it('handles whitespace-only string', () => {
		expect(slugify('   ')).toBe('');
	});

	it('replaces underscores with hyphens', () => {
		expect(slugify('hello_world')).toBe('hello-world');
	});

	it('handles mixed special characters', () => {
		expect(slugify('NPC: Elminster (Sage)')).toBe('npc-elminster-sage');
	});
});
