export interface ExtractedLink {
	title: string;
	displayText: string;
	position: number;
	length: number;
	targetIdHint?: string;
}

interface ExtractWikilinksOptions {
	includeEmbeds?: boolean;
}

function isEscapedAt(input: string, index: number): boolean {
	let backslashes = 0;
	for (let cursor = index - 1; cursor >= 0 && input[cursor] === '\\'; cursor -= 1) {
		backslashes += 1;
	}
	return backslashes % 2 === 1;
}

function findClosingBrackets(input: string, start: number): number {
	for (let cursor = start; cursor < input.length - 1; cursor += 1) {
		if (input[cursor] === ']' && input[cursor + 1] === ']' && !isEscapedAt(input, cursor)) {
			return cursor;
		}
	}
	return -1;
}

function splitTargetAndDisplay(body: string): { target: string; display?: string } {
	for (let cursor = 0; cursor < body.length; cursor += 1) {
		if (body[cursor] === '|' && !isEscapedAt(body, cursor)) {
			return {
				target: body.slice(0, cursor),
				display: body.slice(cursor + 1),
			};
		}
	}
	return { target: body };
}

function unescapeLinkPart(value: string): string {
	return value.replace(/\\([\\|\]])/g, '$1');
}

/** Extract all wikilinks from markdown content */
export function extractWikilinks(
	content: string,
	options: ExtractWikilinksOptions = {},
): ExtractedLink[] {
	const includeEmbeds = options.includeEmbeds ?? true;
	const links: ExtractedLink[] = [];
	for (let cursor = 0; cursor < content.length - 1; cursor += 1) {
		if (content[cursor] !== '[' || content[cursor + 1] !== '[' || isEscapedAt(content, cursor)) {
			continue;
		}

		const linkStart = cursor;
		const closeIndex = findClosingBrackets(content, cursor + 2);
		if (closeIndex < 0) {
			break;
		}

		const isEmbed = cursor > 0 && content[cursor - 1] === '!' && !isEscapedAt(content, cursor - 1);
		if (isEmbed && !includeEmbeds) {
			cursor = closeIndex + 1;
			continue;
		}

		const body = content.slice(cursor + 2, closeIndex);
		const { target, display } = splitTargetAndDisplay(body);
		const rawTarget = unescapeLinkPart(target).trim();
		const rawDisplay = display === undefined ? undefined : unescapeLinkPart(display).trim();
		const displayText = rawDisplay || rawTarget;
		const length = closeIndex + 2 - linkStart;
		cursor = closeIndex + 1;

		if (!rawTarget) continue;
		if (rawTarget.startsWith('obj:')) continue;

		if (rawTarget.startsWith('note:') || rawTarget.startsWith('id:')) {
			const targetIdHint = rawTarget.slice(rawTarget.indexOf(':') + 1).trim();
			if (!targetIdHint) continue;
			links.push({
				title: displayText,
				displayText,
				position: linkStart,
				length,
				targetIdHint,
			});
			continue;
		}

		links.push({
			title: rawTarget,
			displayText,
			position: linkStart,
			length,
		});
	}

	return links;
}
