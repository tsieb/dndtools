// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { displayName, rewriteForForward } from '../../infra/support-mail/forwarder/rewrite.mjs';

const SUPPORT = 'support@lamplight.click';

const message = (headers: string[], body = 'Hello\r\n') =>
	Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'latin1');

const forward = (raw: Buffer) =>
	rewriteForForward(raw, { supportAddress: SUPPORT }).toString('latin1');

const headersOf = (text: string) => text.slice(0, text.indexOf('\r\n\r\n')).split('\r\n');

describe('support mail forwarding rewrite', () => {
	it('sends from the support address under the sender name and replies to the sender', () => {
		const out = forward(
			message([
				'From: "Ada Player" <ada@example.com>',
				'To: support@lamplight.click',
				'Subject: Help',
			]),
		);
		const headers = headersOf(out);
		expect(headers).toContain('From: "Ada Player via Lamplight Support" <support@lamplight.click>');
		expect(headers).toContain('Reply-To: "Ada Player" <ada@example.com>');
		expect(headers).toContain('Subject: Help');
		expect(headers.filter((h) => /^from:/i.test(h))).toHaveLength(1);
	});

	it('keeps an existing Reply-To instead of adding a second one', () => {
		const out = forward(
			message(['From: ada@example.com', 'Reply-To: replies@example.com', 'Subject: x']),
		);
		expect(headersOf(out).filter((h) => /^reply-to:/i.test(h))).toEqual([
			'Reply-To: replies@example.com',
		]);
	});

	it('drops headers that are false or unverifiable after the rewrite, including folded ones', () => {
		const out = forward(
			message([
				'Return-Path: <bounce@example.com>',
				'DKIM-Signature: v=1; a=rsa-sha256; d=example.com;',
				'\tb=abc123',
				'Sender: list@example.com',
				'Message-ID: <1@example.com>',
				'From: ada@example.com',
				'Subject: x',
			]),
		);
		expect(out).not.toMatch(/^(Return-Path|DKIM-Signature|Sender|Message-ID):/im);
		expect(out).not.toContain('b=abc123');
	});

	it('leaves the body byte-for-byte unchanged, including 8-bit content', () => {
		const body = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0d, 0x0a, 0xff, 0x00, 0x41]);
		const raw = Buffer.concat([
			Buffer.from('From: a@example.com\r\nSubject: x\r\n\r\n', 'latin1'),
			body,
		]);
		const out = rewriteForForward(raw, { supportAddress: SUPPORT });
		expect(out.subarray(out.length - body.length).equals(body)).toBe(true);
	});

	it('cannot be steered into a different From by a hostile display name', () => {
		const name = displayName('"Evil\\" <x@evil.test>\r\nBcc: y@evil.test" <a@example.com>');
		expect(name).not.toMatch(/["\\\r\n]/);
		const out = forward(
			message(['From: "Mallory\r\n Bcc: y@evil.test" <m@example.com>', 'Subject: x']),
		);
		expect(headersOf(out).filter((h) => /^bcc:/i.test(h))).toEqual([]);
	});

	it('falls back to the bare address, then to a placeholder name', () => {
		expect(displayName('ada@example.com')).toBe('ada@example.com');
		expect(displayName('<ada@example.com>')).toBe('ada@example.com');
		expect(displayName('')).toBe('Unknown sender');
	});
});
