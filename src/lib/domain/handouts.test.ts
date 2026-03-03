import { describe, expect, it } from 'vitest';
import {
	applySubstitutionCipher,
	buildCipherBundle,
	buildHandoutPrintableHtml,
	generateSubstitutionCipherKey,
	resolveHandoutRenderView,
} from '$lib/domain/handouts.js';
import { createVaultObjectId, type HandoutObject } from '$lib/types/object.js';

function makeHandout(overrides?: Partial<HandoutObject>): HandoutObject {
	const now = '2026-03-03T00:00:00.000Z';
	return {
		id: createVaultObjectId('handout-1'),
		type: 'handout',
		name: 'Ancient Letter',
		summary: '',
		tags: ['handout'],
		visibility: 'shared',
		relationships: [],
		data: {
			title: 'Ancient Letter',
			content: 'Meet at dawn.',
			handoutType: 'document',
			delivered: false,
		},
		createdAt: now,
		updatedAt: now,
		...overrides,
	} as HandoutObject;
}

describe('cipher helpers', () => {
	it('generates a non-identity 26-letter substitution key', () => {
		const key = generateSubstitutionCipherKey(() => 0.37);
		expect(key).toHaveLength(26);
		expect(new Set(key.split('')).size).toBe(26);
		expect(key).not.toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
	});

	it('round-trips encoded text through decode mode', () => {
		const key = 'QWERTYUIOPASDFGHJKLZXCVBNM';
		const plain = 'Meet me at 7PM by the river.';
		const encrypted = applySubstitutionCipher(plain, key, 'encode');
		const decoded = applySubstitutionCipher(encrypted, key, 'decode');
		expect(decoded).toBe(plain);
	});

	it('builds cipher bundle with decoded and encrypted payload', () => {
		const bundle = buildCipherBundle('Decoded secret text', 'QWERTYUIOPASDFGHJKLZXCVBNM');
		expect(bundle.decodedContent).toBe('Decoded secret text');
		expect(bundle.substitutionKey).toBe('QWERTYUIOPASDFGHJKLZXCVBNM');
		expect(bundle.encryptedContent).not.toBe(bundle.decodedContent);
	});
});

describe('handout rendering', () => {
	it('shows encrypted content until cipher is revealed', () => {
		const handout = makeHandout({
			data: {
				title: 'Cipher',
				content: 'ENCRYPTED',
				handoutType: 'cipher',
				delivered: true,
				cipher: {
					encryptedContent: 'ENCRYPTED',
					decodedContent: 'DECODED',
					substitutionKey: 'QWERTYUIOPASDFGHJKLZXCVBNM',
					decodedRevealed: false,
				},
			},
		});
		expect(resolveHandoutRenderView(handout)).toEqual({
			content: 'ENCRYPTED',
			locked: true,
			decodedVisible: false,
		});
	});

	it('builds printable html with effect classes and decoded content when requested', () => {
		const handout = makeHandout({
			data: {
				title: 'Recovered Letter',
				content: 'ENCRYPTED',
				handoutType: 'cipher',
				delivered: true,
				visualStyle: { effects: ['parchment', 'ink_blot'] },
				cipher: {
					encryptedContent: 'ENCRYPTED',
					decodedContent: 'Decoded **message**',
					substitutionKey: 'QWERTYUIOPASDFGHJKLZXCVBNM',
					decodedRevealed: false,
				},
			},
		});
		const html = buildHandoutPrintableHtml(handout, { showDecodedCipher: true });
		expect(html).toContain('handout-effect--parchment');
		expect(html).toContain('handout-effect--ink_blot');
		expect(html).toContain('<strong>message</strong>');
		expect(html).not.toContain('Cipher locked');
	});
});
