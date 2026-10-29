// Turns a message SES received for support@ into one SES may send on to the operator's inbox.
// SES only sends From a verified identity, so the original sender moves to Reply-To and the From
// becomes support@ with the sender's display name. Headers that would be false or fail
// verification after the rewrite are dropped: the original DKIM signature (the headers it signed
// change), Return-Path and Sender (SES sets its own), and Message-ID (SES assigns one).
//
// The message is handled as a latin1 string so every byte of a non-UTF-8 body survives unchanged.

const DROPPED = new Set(['return-path', 'sender', 'message-id', 'dkim-signature']);

/** Splits raw headers into whole header fields, keeping each field's folded continuation lines. */
function headerFields(head) {
	const fields = [];
	for (const line of head.split(/\r?\n/)) {
		if (/^[ \t]/.test(line) && fields.length) fields[fields.length - 1] += `\r\n${line}`;
		else if (line) fields.push(line);
	}
	return fields;
}

const fieldName = (field) => field.slice(0, field.indexOf(':')).trim().toLowerCase();
const fieldValue = (field) =>
	field
		.slice(field.indexOf(':') + 1)
		.replace(/\r?\n[ \t]+/g, ' ')
		.trim();

/** The display name of an address header, or the bare address when there is none. */
export function displayName(from) {
	const named = /^\s*"?([^"<]*?)"?\s*<[^>]*>\s*$/.exec(from);
	const name = named?.[1].trim() || from.replace(/[<>]/g, '').trim();
	// Quotes, backslashes and control characters cannot be trusted inside a quoted display name.
	return name.replace(/["\\\p{Cc}]/gu, '').slice(0, 120) || 'Unknown sender';
}

/**
 * @param {Buffer} raw the message exactly as SES stored it
 * @param {{ supportAddress: string }} options
 * @returns {Buffer} the message to send on
 */
export function rewriteForForward(raw, { supportAddress }) {
	const text = raw.toString('latin1');
	const split = /\r?\n\r?\n/.exec(text);
	const head = split ? text.slice(0, split.index) : text;
	const body = split ? text.slice(split.index + split[0].length) : '';

	const fields = headerFields(head);
	const from = fields.find((field) => fieldName(field) === 'from');
	const hasReplyTo = fields.some((field) => fieldName(field) === 'reply-to');
	const kept = fields.filter(
		(field) => !DROPPED.has(fieldName(field)) && fieldName(field) !== 'from',
	);

	const originalFrom = from ? fieldValue(from) : '';
	kept.unshift(`From: "${displayName(originalFrom)} via Lamplight Support" <${supportAddress}>`);
	if (!hasReplyTo && originalFrom) kept.push(`Reply-To: ${originalFrom}`);

	return Buffer.from(`${kept.join('\r\n')}\r\n\r\n${body}`, 'latin1');
}
