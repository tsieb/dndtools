/** Expand literal text by 40% (rounded up), excluding the diagnostic brackets.
 * Keep ICU argument headers, selectors and formatting styles byte-for-byte intact. */
export function pseudoMessage(message: string): string {
	const accent = (text: string) =>
		text.replace(/[a-zA-Z]/g, (letter) => {
			const source = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
			const target = 'áƀçďéƒğĥíĵķľḿñóƥɋŕšţúṽŵẋýžÁƁÇĎÉƑĞĤÍĴĶĽḾÑÓƤɊŔŠŢÚṼŴẊÝŽ';
			return target[source.indexOf(letter)];
		});
	const expand = (text: string) =>
		text.replace(/[^{}]+/g, (literal) => {
			if (!literal.trim()) return literal;
			// Long messages must retain ordinary word wrapping: padding is a sequence of
			// short words, not one artificial sentence-length unbreakable token.
			return (
				accent(literal) + '~'.repeat(Math.ceil(literal.length * 0.4)).replace(/~{5}/g, '~~~~ ')
			);
		});
	const closeBrace = (text: string, start: number) => {
		let depth = 1;
		let end = start + 1;
		for (; end < text.length && depth; end++) {
			if (text[end] === '{') depth++;
			if (text[end] === '}') depth--;
		}
		if (depth) throw new Error('Unbalanced ICU message');
		return end - 1;
	};
	const transform = (text: string): string => {
		let result = '';
		let cursor = 0;
		while (cursor < text.length) {
			const open = text.indexOf('{', cursor);
			if (open < 0) return result + expand(text.slice(cursor));
			result += expand(text.slice(cursor, open));
			const close = closeBrace(text, open);
			const argument = text.slice(open + 1, close);
			const header = argument.match(/^\s*\w+\s*,\s*(?:plural|selectordinal|select)\s*,/);
			if (!header) result += text.slice(open, close + 1);
			else {
				result += '{' + header[0];
				let pos = header[0].length;
				while (pos < argument.length) {
					const branch = argument.indexOf('{', pos);
					if (branch < 0) {
						result += argument.slice(pos);
						break;
					}
					const end = closeBrace(argument, branch);
					result +=
						argument.slice(pos, branch + 1) + transform(argument.slice(branch + 1, end)) + '}';
					pos = end + 1;
				}
				result += '}';
			}
			cursor = close + 1;
		}
		return result;
	};
	return '[' + transform(message) + ']';
}
