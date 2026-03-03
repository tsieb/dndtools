import type {
	HandoutAgingEffect,
	HandoutData,
	HandoutObject,
	HandoutType,
} from '$lib/types/object.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface HandoutCipherBundle {
	substitutionKey: string;
	encryptedContent: string;
	decodedContent: string;
}

export interface HandoutRenderView {
	content: string;
	locked: boolean;
	decodedVisible: boolean;
}

function normalizeCipherKey(value: string): string | null {
	const letters = value.toUpperCase().replace(/[^A-Z]/g, '');
	if (letters.length !== ALPHABET.length) return null;
	const unique = new Set(letters.split(''));
	if (unique.size !== ALPHABET.length) return null;
	return letters;
}

function randomInt(maxExclusive: number, rng: () => number): number {
	return Math.max(0, Math.min(maxExclusive - 1, Math.floor(rng() * maxExclusive)));
}

function toFileSlug(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '') || 'handout'
	);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function inlineMarkdownToHtml(line: string): string {
	let html = escapeHtml(line);
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
	return html;
}

function markdownToBasicHtml(markdown: string): string {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	const html: string[] = [];
	let inList = false;

	for (const rawLine of lines) {
		const trimmed = rawLine.trimEnd();
		if (!trimmed.trim()) {
			if (inList) {
				html.push('</ul>');
				inList = false;
			}
			continue;
		}

		const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
		if (listMatch) {
			if (!inList) {
				html.push('<ul>');
				inList = true;
			}
			html.push(`<li>${inlineMarkdownToHtml(listMatch[1] ?? '')}</li>`);
			continue;
		}

		if (inList) {
			html.push('</ul>');
			inList = false;
		}

		const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
		if (headingMatch) {
			const level = headingMatch[1]?.length ?? 1;
			html.push(`<h${level}>${inlineMarkdownToHtml(headingMatch[2] ?? '')}</h${level}>`);
			continue;
		}

		html.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
	}

	if (inList) {
		html.push('</ul>');
	}

	return html.length > 0 ? html.join('\n') : '<p></p>';
}

export function handoutTypeLabel(type: HandoutType): string {
	switch (type) {
		case 'map_fragment':
			return 'Map Fragment';
		case 'letter':
			return 'Letter';
		case 'image':
			return 'Image';
		case 'cipher':
			return 'Cipher';
		case 'rumor':
			return 'Rumor';
		case 'document':
			return 'Document';
	}
}

export function generateSubstitutionCipherKey(rng: () => number = Math.random): string {
	const letters = ALPHABET.split('');
	for (let index = letters.length - 1; index > 0; index -= 1) {
		const swapIndex = randomInt(index + 1, rng);
		const current = letters[index];
		letters[index] = letters[swapIndex] ?? letters[index]!;
		letters[swapIndex] = current!;
	}
	// Avoid identity keys so generated ciphers are always transformed.
	if (letters.join('') === ALPHABET) {
		const first = letters.shift();
		if (first) letters.push(first);
	}
	return letters.join('');
}

export function applySubstitutionCipher(
	input: string,
	substitutionKey: string,
	mode: 'encode' | 'decode' = 'encode',
): string {
	const normalizedKey = normalizeCipherKey(substitutionKey);
	if (!normalizedKey || !input) return input;

	const source = mode === 'encode' ? ALPHABET : normalizedKey;
	const target = mode === 'encode' ? normalizedKey : ALPHABET;
	const map = new Map<string, string>();
	for (let index = 0; index < ALPHABET.length; index += 1) {
		map.set(source[index]!, target[index]!);
	}

	return input
		.split('')
		.map((char) => {
			const upper = char.toUpperCase();
			const mapped = map.get(upper);
			if (!mapped) return char;
			return char === upper ? mapped : mapped.toLowerCase();
		})
		.join('');
}

export function buildCipherBundle(
	decodedContent: string,
	substitutionKey?: string,
): HandoutCipherBundle {
	const normalizedDecoded = decodedContent ?? '';
	const key = normalizeCipherKey(substitutionKey ?? '') ?? generateSubstitutionCipherKey();
	return {
		substitutionKey: key,
		encryptedContent: applySubstitutionCipher(normalizedDecoded, key, 'encode'),
		decodedContent: normalizedDecoded,
	};
}

export function resolveHandoutRenderView(
	handout: Pick<HandoutObject, 'type' | 'data'>,
	options?: { preferDecoded?: boolean },
): HandoutRenderView {
	if (handout.type !== 'handout') {
		return {
			content: '',
			locked: false,
			decodedVisible: false,
		};
	}

	if (handout.data.handoutType !== 'cipher' || !handout.data.cipher) {
		return {
			content: handout.data.content,
			locked: false,
			decodedVisible: false,
		};
	}

	const showDecoded = options?.preferDecoded === true || handout.data.cipher.decodedRevealed;
	if (showDecoded) {
		return {
			content: handout.data.cipher.decodedContent || handout.data.content,
			locked: false,
			decodedVisible: true,
		};
	}

	return {
		content: handout.data.cipher.encryptedContent || handout.data.content,
		locked: true,
		decodedVisible: false,
	};
}

export function handoutEffectClassName(effect: HandoutAgingEffect): string {
	return `handout-effect--${effect}`;
}

export function handoutEffectClassNames(data: Pick<HandoutData, 'visualStyle'>): string[] {
	return (data.visualStyle?.effects ?? []).map((effect) => handoutEffectClassName(effect));
}

export function buildHandoutPrintableHtml(
	handout: HandoutObject,
	options?: {
		showDecodedCipher?: boolean;
	},
): string {
	const view = resolveHandoutRenderView(handout, {
		preferDecoded: options?.showDecodedCipher === true,
	});
	const bodyClasses = ['handout-sheet', ...handoutEffectClassNames(handout.data)].join(' ');
	const contentHtml = markdownToBasicHtml(view.content);
	const deliveredAt = handout.data.deliveredAt
		? `<p><strong>Delivered:</strong> ${escapeHtml(handout.data.deliveredAt)}</p>`
		: '';
	const sourceNpc = handout.data.sourceNpcId
		? `<p><strong>Source NPC:</strong> ${escapeHtml(handout.data.sourceNpcId)}</p>`
		: '';
	const sourceLocation = handout.data.sourceLocationId
		? `<p><strong>Source Location:</strong> ${escapeHtml(handout.data.sourceLocationId)}</p>`
		: '';
	const session = handout.data.campaignSession
		? `<p><strong>Campaign Session:</strong> ${escapeHtml(handout.data.campaignSession)}</p>`
		: '';
	const lockBanner = view.locked
		? '<p class="cipher-lock">Cipher locked. Players only see encrypted text.</p>'
		: '';

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(handout.data.title || handout.name)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: #f0ebdc; color: #1f1a15; }
    .wrap { max-width: 860px; margin: 2rem auto; padding: 0 1rem; }
    .handout-sheet { background: #fbf6e7; border: 1px solid #8f8269; box-shadow: 0 24px 40px rgba(0,0,0,0.14); padding: 2rem; position: relative; overflow: hidden; }
    .handout-sheet h1 { margin: 0 0 0.25rem; font-size: 2rem; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.35rem 1.2rem; margin: 0.8rem 0 1.3rem; font-size: 0.95rem; color: #463a2e; }
    .cipher-lock { border: 1px solid #6a1f1f; background: #f7e0de; color: #5f1f1f; padding: 0.45rem 0.6rem; border-radius: 0.35rem; font-weight: 600; }
    .content { line-height: 1.56; font-size: 1.03rem; }
    .content h1, .content h2, .content h3 { margin-top: 1.2rem; margin-bottom: 0.4rem; }
    .content p { margin: 0.4rem 0 0.8rem; }
    .content ul { margin: 0.4rem 0 0.8rem; padding-left: 1.2rem; }
    .content code { font-family: 'Courier New', monospace; font-size: 0.92em; background: rgba(0,0,0,0.06); border-radius: 0.2rem; padding: 0.05rem 0.2rem; }
    .handout-effect--parchment { background-image: radial-gradient(rgba(139, 110, 74, 0.08) 1.5px, transparent 1.5px); background-size: 12px 12px; }
    .handout-effect--torn_edge::before { content: ''; position: absolute; inset: 0; pointer-events: none; border: 10px solid transparent; box-shadow: inset 0 0 0 1px #8f8269; mask: radial-gradient(10px at 8px 8px, transparent 40%, black 41%); }
    .handout-effect--blood_stain::after { content: ''; position: absolute; width: 180px; height: 180px; right: -48px; top: -56px; background: radial-gradient(circle, rgba(110, 15, 15, 0.28) 0, rgba(110, 15, 15, 0) 72%); pointer-events: none; }
    .handout-effect--burned_edge { box-shadow: inset 0 0 0 2px rgba(59, 31, 16, 0.44), inset 0 0 40px rgba(59, 31, 16, 0.24), 0 24px 40px rgba(0,0,0,0.14); }
    .handout-effect--ink_blot::before { content: ''; position: absolute; width: 170px; height: 170px; left: -44px; bottom: -44px; background: radial-gradient(circle, rgba(10, 22, 45, 0.22) 0, rgba(10, 22, 45, 0) 70%); pointer-events: none; }
    @media print {
      body { background: white; }
      .wrap { max-width: none; margin: 0; padding: 0; }
      .handout-sheet { box-shadow: none; border: 0; min-height: 100vh; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <article class="${bodyClasses}">
      <h1>${escapeHtml(handout.data.title || handout.name)}</h1>
      <div class="meta">
        <p><strong>Type:</strong> ${escapeHtml(handoutTypeLabel(handout.data.handoutType))}</p>
        ${session}
        ${sourceNpc}
        ${sourceLocation}
        ${deliveredAt}
      </div>
      ${lockBanner}
      <section class="content">${contentHtml}</section>
    </article>
  </div>
</body>
</html>`;
}

export function downloadHandoutPrintableHtml(
	handout: HandoutObject,
	options?: {
		showDecodedCipher?: boolean;
		filename?: string;
	},
): void {
	if (typeof document === 'undefined') return;
	const html = buildHandoutPrintableHtml(handout, options);
	const filename =
		options?.filename ??
		`${toFileSlug(handout.data.title || handout.name)}${options?.showDecodedCipher ? '-decoded' : ''}.html`;
	const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
