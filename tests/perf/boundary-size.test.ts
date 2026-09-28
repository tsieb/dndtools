import { describe, expect, it } from 'vitest';
import { jsonUtf8Length, utf8ByteLength } from '../../packages/core/src/platform/service-boundary';

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

/** What the boundary used to compute: the payload serialized, then its bytes counted. */
function serializedBytes(value: unknown): number | undefined {
	const text = JSON.stringify(value);
	return text === undefined ? undefined : new TextEncoder().encode(text).length;
}

// RC-ENG-3.2: the boundary now measures a payload without serializing it, remembering each object's
// length by identity. The result must be exactly the serialized byte count, and fail exactly where
// `JSON.stringify` fails.
describe('jsonUtf8Length', () => {
	it('matches JSON.stringify on every value kind', () => {
		class Point {
			constructor(
				public x: number,
				public y: number,
			) {}
		}
		// eslint-disable-next-line no-sparse-arrays -- a hole serializes as null
		const holey = [, 5];
		const hidden = {};
		Object.defineProperty(hidden, 'secret', { value: 1, enumerable: false });
		const samples: unknown[] = [
			null,
			true,
			false,
			0,
			-0,
			1e21,
			5e-7,
			0.1,
			-12.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			'',
			'quote " backslash \\ slash / tab \t newline \n bell \u0007 del \u007f',
			'é ß 中文 🐉 lone \ud800 then \udfff and pair 🧙',
			[],
			{},
			[1, 'two', null, undefined, () => 3, Symbol('s'), holey, { a: undefined }],
			{ a: 1, b: undefined, c: () => 1, d: Symbol('x'), [Symbol('k')]: 1, e: [undefined], 'é"': 2 },
			{ date: new Date(0), boxed: [new Number(4), new String('é'), new Boolean(false)] },
			{ custom: { toJSON: (key: string) => ({ key, nested: [key] }) } },
			{
				same: {
					toJSON() {
						return this.value;
					},
					value: 'self',
				},
			},
			new Map([[1, 2]]),
			new Set([1]),
			new Uint8Array([1, 2, 3]),
			new Point(1, 2),
			hidden,
			Object.assign([1, 2], { extra: 'ignored' }),
		];
		for (const value of samples) expect(jsonUtf8Length(value)).toBe(serializedBytes(value));
	});

	it('returns undefined and throws exactly where JSON.stringify does', () => {
		expect(jsonUtf8Length(undefined)).toBeUndefined();
		expect(jsonUtf8Length(() => 1)).toBeUndefined();
		expect(jsonUtf8Length({ toJSON: () => undefined })).toBeUndefined();
		const cycle: Record<string, unknown> = {};
		cycle.self = { back: cycle };
		expect(() => JSON.stringify(cycle)).toThrow();
		expect(() => jsonUtf8Length(cycle)).toThrow(TypeError);
		expect(() => jsonUtf8Length({ n: 1n })).toThrow(TypeError);
		const getter = Object.defineProperty({}, 'boom', {
			enumerable: true,
			get() {
				throw new Error('boom');
			},
		});
		expect(() => jsonUtf8Length(getter)).toThrow('boom');
		// A shared object is not a cycle.
		const shared = { note: 'shared' };
		expect(jsonUtf8Length({ a: shared, b: [shared, shared] })).toBe(
			serializedBytes({ a: shared, b: [shared, shared] }),
		);
	});

	it('stays exact as a structurally shared state changes commit by commit', () => {
		let seed = 11;
		const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
		const text = () =>
			Array.from({ length: Math.floor(next() * 24) }, () =>
				String.fromCharCode(Math.floor(next() * 0x10000)),
			).join('');
		let state: {
			content: { items: Record<string, { title: string; body: string }> };
			sync: { operations: { id: number; value: string }[] };
		} = { content: { items: {} }, sync: { operations: [] } };
		for (let commit = 0; commit < 60; commit += 1) {
			const id = `item-${Math.floor(next() * 20)}`;
			state = {
				...state,
				content: { items: { ...state.content.items, [id]: { title: text(), body: text() } } },
				sync: { operations: [...state.sync.operations, { id: commit, value: text() }] },
			};
			expect(jsonUtf8Length({ next: state, appended: [] })).toBe(
				serializedBytes({ next: state, appended: [] }),
			);
		}
	});

	it('matches JSON.stringify on random strings', () => {
		let seed = 3;
		const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
		for (let i = 0; i < 300; i += 1) {
			const value = Array.from({ length: 1 + Math.floor(next() * 40) }, () =>
				String.fromCharCode(Math.floor(next() * 0x10000)),
			).join('');
			expect(jsonUtf8Length(value)).toBe(serializedBytes(value));
			expect(jsonUtf8Length({ [value]: value })).toBe(serializedBytes({ [value]: value }));
		}
	});
});
