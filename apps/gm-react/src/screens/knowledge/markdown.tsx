import { type ReactNode } from 'react';
import { T } from '../../app/screen-kit';
import { renderMarkdown } from '../../app/markdown/render';
import type { InlineRollLogger } from '../../app/markdown/RollButton';
import { parseWikilinkToken } from '../../app/markdown/plugins';
import { useAssetObjectUrl } from '../../platform/assetUrl';
import type { MessageKey, MessageValues } from '../../i18n';

/** The catalog lookup the callers thread in, so this module holds no English of its own. */
type Translate = (key: MessageKey, values?: MessageValues) => string;

/* Knowledge's tiny markdown + wikilink renderer and the note-list formatters. Extracted from
 * Knowledge.tsx unchanged (RC-STB-2.6). */

/** `format` is `useI18n().formatDate`, so a stamp follows the language the reader chose rather
 * than whatever the OS is set to. */
export function formatStamp(
	iso: string,
	format: (value: Date, options?: Intl.DateTimeFormatOptions) => string,
): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return format(d, { month: 'short', day: 'numeric' });
}

/** A one-line, marker-stripped preview of a note body for the list cards. */
export function snippetOf(body: string, t: Translate): string {
	const line = body
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l && !l.startsWith('#'));
	if (!line) return t('knowledge.emptyNote');
	return line
		.replace(/^[>\-*]\s+/, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.slice(0, 160);
}

/**
 * Parse a pasted markdown archive into `{ path, text }` files. Mirrors the production importer's
 * `===== path.md =====` header convention; a header-less paste imports as a single note (ADR-014:
 * the importer operates on provided text, never a real filesystem picker).
 */
export function parseArchive(raw: string): { path: string; text: string }[] {
	const header = /^=====\s*(.+?)\s*=====$/;
	const files: { path: string; text: string }[] = [];
	let current: { path: string; text: string } | null = null;
	for (const line of raw.split('\n')) {
		const match = header.exec(line.trim());
		if (match) {
			current = { path: match[1], text: '' };
			files.push(current);
		} else if (current) {
			current.text += current.text ? `\n${line}` : line;
		}
	}
	if (files.length === 0 && raw.trim()) files.push({ path: 'imported-note.md', text: raw });
	return files;
}

/**
 * Split `[[Target#Section|Label]]` into the parts the core's resolver takes. RC-KNW-1.1 moved the
 * grammar into the shared tokenizer; this keeps Knowledge's own name for it (and its test).
 */
export function parseWikilink(raw: string): { target: string; section?: string; label: string } {
	return parseWikilinkToken(raw);
}

/**
 * RC-KNW-1.1 — Knowledge's note bodies render through the SHARED markdown pipeline
 * (`app/markdown/render.tsx`), the same one the public wiki reader and player-facing note bodies
 * use. This wrapper only supplies what is local to Knowledge: the empty-note copy, the actor-scoped
 * wikilink resolver, and the asset-store image resolver. The line-at-a-time renderer that used to
 * live here (headings, `**bold**`, `- ` lists only) is gone — it could not render a table, a
 * callout or an image, and it had drifted from the wiki reader's near-identical copy.
 *
 * `isDm` governs the `[!Secret]` affordance ONLY. A player never receives a secret's bytes at all:
 * the core strips them in `stripSecretCallouts` before the projection reaches any screen.
 *
 * RC-SES-2.2: `logInlineRoll` is how a pressed `[[roll:...]]` reaches the session log. Omit it and
 * the control still rolls — it just says so, instead of pretending the table saw the number.
 */
export function mdToNodes(
	md: string,
	t: Translate,
	resolve?: (raw: string) => (() => void) | null,
	isDm = false,
	logInlineRoll?: InlineRollLogger,
): ReactNode {
	return renderMarkdown(md, {
		t,
		emptyKey: 'knowledge.noteEmpty',
		isDm,
		...(resolve ? { resolveWikilink: resolve } : {}),
		...(logInlineRoll ? { logInlineRoll } : {}),
		renderAssetImage: (assetId, alt) => <NoteAssetImage assetId={assetId} alt={alt} />,
	});
}

/**
 * An `asset:<id>` image in a note body, resolved through the platform asset seam. Renders the alt
 * text while the bytes load or when they are missing — never a broken-image glyph.
 */
function NoteAssetImage({ assetId, alt }: { assetId: string; alt: string }) {
	const url = useAssetObjectUrl(assetId);
	if (!url) {
		return <span style={{ font: `12px ${T.sans}`, color: T.ter, fontStyle: 'italic' }}>{alt}</span>;
	}
	return (
		<img
			src={url}
			alt={alt}
			style={{ display: 'block', maxWidth: '100%', borderRadius: 8, border: `1px solid ${T.bd}` }}
		/>
	);
}
