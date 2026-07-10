import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	bytesToBase64Url,
	createPkcePair,
	docEndIndex,
	docToMarkdown,
	extractDocIdFromInput,
	markdownToDocRequests,
	type GDocDocument,
} from './googleDocs';

// --- PKCE helpers -----------------------------------------------------------------------------------

describe('bytesToBase64Url', () => {
	it('encodes without padding using the url-safe alphabet', () => {
		// 0xfb 0xef 0xff → base64 "++//" → base64url "--__" (padding stripped)
		expect(bytesToBase64Url(new Uint8Array([0xfb, 0xef, 0xff]))).toBe('--__');
		expect(bytesToBase64Url(new Uint8Array([0]))).toBe('AA');
		expect(bytesToBase64Url(new Uint8Array([]))).toBe('');
	});
});

describe('createPkcePair', () => {
	it('derives the S256 challenge from a 43-char base64url verifier', async () => {
		const { verifier, challenge } = await createPkcePair();
		expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const expected = createHash('sha256').update(verifier).digest('base64url');
		expect(challenge).toBe(expected);
	});

	it('uses the injected randomness (deterministic pair for a fixed source)', async () => {
		const fixed: Pick<Crypto, 'getRandomValues' | 'subtle'> = {
			getRandomValues: <T>(array: T): T => {
				(array as unknown as Uint8Array).fill(7);
				return array;
			},
			subtle: globalThis.crypto.subtle,
		};
		const a = await createPkcePair(fixed);
		const b = await createPkcePair(fixed);
		expect(a).toEqual(b);
		expect(a.verifier).toBe(bytesToBase64Url(new Uint8Array(32).fill(7)));
	});
});

// --- doc id parsing -----------------------------------------------------------------------------------

describe('extractDocIdFromInput', () => {
	it('extracts the id from Docs URLs (including /u/N/ and trailing /edit)', () => {
		expect(
			extractDocIdFromInput('https://docs.google.com/document/d/1AbC-def_123456789/edit#heading=h.x'),
		).toBe('1AbC-def_123456789');
		expect(extractDocIdFromInput('https://docs.google.com/document/u/0/d/1AbC-def_123456789/')).toBe(
			'1AbC-def_123456789',
		);
	});

	it('accepts a raw plausible id and rejects everything else', () => {
		expect(extractDocIdFromInput('  1AbC-def_123456789  ')).toBe('1AbC-def_123456789');
		expect(extractDocIdFromInput('')).toBeNull();
		expect(extractDocIdFromInput('not an id')).toBeNull();
		expect(extractDocIdFromInput('short')).toBeNull();
	});
});

// --- Doc → markdown -------------------------------------------------------------------------------------

function para(
	text: string,
	options: { style?: string; bullet?: number; bold?: boolean; italic?: boolean } = {},
) {
	return {
		paragraph: {
			elements: [
				{
					textRun: {
						content: `${text}\n`,
						textStyle: { bold: options.bold, italic: options.italic },
					},
				},
			],
			...(options.style ? { paragraphStyle: { namedStyleType: options.style } } : {}),
			...(options.bullet !== undefined ? { bullet: { nestingLevel: options.bullet } } : {}),
		},
	};
}

describe('docToMarkdown', () => {
	it('maps named heading styles, bullets, and inline bold/italic to markdown', () => {
		const doc: GDocDocument = {
			body: {
				content: [
					para('The Pier', { style: 'HEADING_1' }),
					para('Landmarks', { style: 'HEADING_2' }),
					{
						paragraph: {
							elements: [
								{ textRun: { content: 'Brackish ' } },
								{ textRun: { content: 'water', textStyle: { bold: true } } },
								{ textRun: { content: ' laps ' } },
								{ textRun: { content: 'quietly', textStyle: { italic: true } } },
								{ textRun: { content: '.\n' } },
							],
						},
					},
					para('First item', { bullet: 0 }),
					para('Nested item', { bullet: 1 }),
					para(''),
				],
			},
		};
		expect(docToMarkdown(doc)).toBe(
			'# The Pier\n## Landmarks\nBrackish **water** laps *quietly*.\n- First item\n  - Nested item\n',
		);
	});

	it('flattens tables to pipe rows and keeps whitespace outside bold markers', () => {
		const doc: GDocDocument = {
			body: {
				content: [
					{
						paragraph: {
							elements: [{ textRun: { content: ' padded \n', textStyle: { bold: true } } }],
						},
					},
					{
						table: {
							tableRows: [
								{ tableCells: [{ content: [para('Name')] }, { content: [para('Role')] }] },
							],
						},
					},
				],
			},
		};
		expect(docToMarkdown(doc)).toBe(' **padded** \n| Name | Role |\n');
	});

	it('returns an empty string for an empty document', () => {
		expect(docToMarkdown({ body: { content: [para('')] } })).toBe('');
		expect(docToMarkdown({})).toBe('');
	});
});

describe('docEndIndex', () => {
	it('reads the last structural element end index, defaulting to 1', () => {
		expect(docEndIndex({ body: { content: [{ endIndex: 5 }, { endIndex: 42 }] } })).toBe(42);
		expect(docEndIndex({})).toBe(1);
	});
});

// --- markdown → batchUpdate requests -----------------------------------------------------------------------

describe('markdownToDocRequests', () => {
	it('emits only a delete for empty markdown against a non-empty doc', () => {
		expect(markdownToDocRequests('', 1)).toEqual([]);
		expect(markdownToDocRequests('  \n', 40)).toEqual([
			{ deleteContentRange: { range: { startIndex: 1, endIndex: 39 } } },
		]);
	});

	it('replaces the body: delete, insert, style reset, then headings/bullets/bold', () => {
		const markdown = '# Pier\nBrackish **water**.\n- one\n- two\n';
		const requests = markdownToDocRequests(markdown, 20);
		// Inserted text has markers stripped.
		const insertedText = 'Pier\nBrackish water.\none\ntwo\n';
		expect(requests[0]).toEqual({
			deleteContentRange: { range: { startIndex: 1, endIndex: 19 } },
		});
		expect(requests[1]).toEqual({
			insertText: { location: { index: 1 }, text: insertedText },
		});
		expect(requests[2]).toEqual({
			updateParagraphStyle: {
				range: { startIndex: 1, endIndex: 1 + insertedText.length },
				paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
				fields: 'namedStyleType',
			},
		});
		// Heading covers "Pier\n" → [1, 6).
		expect(requests[3]).toEqual({
			updateParagraphStyle: {
				range: { startIndex: 1, endIndex: 6 },
				paragraphStyle: { namedStyleType: 'HEADING_1' },
				fields: 'namedStyleType',
			},
		});
		// Bold covers "water" within "Brackish water.\n" (line starts at offset 5 → doc index 6).
		expect(requests[4]).toEqual({
			updateTextStyle: {
				range: { startIndex: 1 + 5 + 9, endIndex: 1 + 5 + 14 },
				textStyle: { bold: true },
				fields: 'bold',
			},
		});
		// The two bullet lines form ONE createParagraphBullets run: "one\ntwo\n" at offsets [21, 29).
		expect(requests[5]).toEqual({
			createParagraphBullets: {
				range: { startIndex: 1 + 21, endIndex: 1 + 29 },
				bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
			},
		});
		expect(requests).toHaveLength(6);
	});

	it('skips the delete when the target doc is already empty', () => {
		const requests = markdownToDocRequests('hello\n', 2);
		expect(requests[0]).toEqual({ insertText: { location: { index: 1 }, text: 'hello\n' } });
	});
});
