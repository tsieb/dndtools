import { describe, expect, it } from 'vitest';
import { utf8ByteLength } from '../../packages/core/src/platform/service-boundary';

// RC-ENG-3.2: the boundary counts a persisted payload's UTF-8 bytes without encoding a copy; the count
// must be exactly what `TextEncoder` produces for every kind of code unit JSON output can carry.
describe('utf8ByteLength', () => {
	it('matches TextEncoder on ASCII, 2-, 3- and 4-byte text', () => {
		const samples = [
			'',
			'plain ascii {"a":1}',
			'é ß ñ — “quoted” € 中文 日本語',
			'emoji 🐉 and 🧙‍♀️ pairs',
			JSON.stringify({ lone: '\ud800', other: '\udfff', mixed: 'a🐉b' }),
			'\u007f\u0080߿ࠀ퟿￿',
		];
		for (const text of samples)
			expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
	});

	it('matches TextEncoder on random serialized strings', () => {
		let seed = 7;
		const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
		for (let i = 0; i < 200; i += 1) {
			const units = Array.from({ length: 1 + Math.floor(next() * 64) }, () =>
				String.fromCharCode(Math.floor(next() * 0x10000)),
			);
			const text = JSON.stringify(units.join(''));
			expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
		}
	});
});
