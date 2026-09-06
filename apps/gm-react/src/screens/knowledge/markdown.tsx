import { type ReactNode } from 'react';
import { T } from '../../app/screen-kit';
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

/** Split `[[Target#Section|Label]]` into the parts the core's resolver takes. */
export function parseWikilink(raw: string): { target: string; section?: string; label: string } {
	const inner = raw.slice(2, -2);
	const [addr, alias] = inner.split('|');
	const [target, section] = (addr ?? '').split('#');
	const label = (alias ?? inner).trim();
	return {
		target: (target ?? '').trim(),
		section: section?.trim() || undefined,
		label: label || (target ?? '').trim(),
	};
}

/**
 * `resolve` turns a wikilink into a navigation callback. A resolvable link becomes a real button —
 * keyboard-reachable and announced — instead of the accent-coloured span that LOOKED like a link
 * and did nothing. An unresolvable one is drawn as a visibly broken link, which is the honest
 * signal: the core's resolver is actor-filtered, so "unresolved" can also mean "not yours to see".
 */
function boldify(
	s: string,
	t: Translate,
	resolve?: (raw: string) => (() => void) | null,
): ReactNode {
	const parts = s.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g);
	return parts.map((p, i) => {
		if (p.startsWith('**'))
			return (
				<strong key={i} style={{ color: T.ink }}>
					{p.slice(2, -2)}
				</strong>
			);
		if (p.startsWith('[[')) {
			const { label } = parseWikilink(p);
			const go = resolve ? resolve(p) : null;
			if (!go)
				return (
					<span
						key={i}
						title={t('knowledge.brokenLink')}
						style={{ color: T.ter, textDecoration: 'underline dotted', textDecorationColor: T.bdS }}
					>
						{label}
					</span>
				);
			return (
				<button
					key={i}
					type="button"
					onClick={go}
					style={{
						font: 'inherit',
						padding: 0,
						border: 'none',
						background: 'none',
						color: T.acc,
						textDecoration: 'underline',
						cursor: 'pointer',
					}}
				>
					{label}
				</button>
			);
		}
		return p;
	});
}

export function mdToNodes(
	md: string,
	t: Translate,
	resolve?: (raw: string) => (() => void) | null,
): ReactNode {
	if (!md.trim())
		return (
			<p style={{ font: `13.5px/1.7 ${T.sans}`, color: T.ter, fontStyle: 'italic' }}>
				{t('knowledge.noteEmpty')}
			</p>
		);
	// Bare <li>s used to be returned straight into a <div> — invalid HTML, and a screen reader never
	// announced "list, N items". Group each run of `- ` lines into one <ul>.
	const lines = md.split('\n');
	const out: ReactNode[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		if (lines[i]!.startsWith('- ')) {
			const items: ReactNode[] = [];
			const start = i;
			while (i < lines.length && lines[i]!.startsWith('- ')) {
				items.push(renderLine(lines[i]!, i, t, resolve));
				i += 1;
			}
			i -= 1;
			out.push(
				<ul
					key={`ul-${start}`}
					style={{ margin: '2px 0', paddingLeft: 0, listStylePosition: 'inside' }}
				>
					{items}
				</ul>,
			);
			continue;
		}
		out.push(renderLine(lines[i]!, i, t, resolve));
	}
	return out;
}

function renderLine(
	ln: string,
	i: number,
	t: Translate,
	resolve?: (raw: string) => (() => void) | null,
): ReactNode {
	{
		if (ln.startsWith('### '))
			return (
				<h4 key={i} style={{ font: `700 14px ${T.disp}`, margin: '14px 0 4px' }}>
					{ln.slice(4)}
				</h4>
			);
		if (ln.startsWith('## '))
			return (
				<h3 key={i} style={{ font: `700 18px ${T.disp}`, margin: '4px 0 8px' }}>
					{ln.slice(3)}
				</h3>
			);
		// `# ` is the title level every imported Obsidian/markdown vault uses, and it had no branch
		// at all — the raw "# The Sunken Crypt" showed up as body text once the note was opened.
		if (ln.startsWith('# '))
			return (
				<h2 key={i} style={{ font: `700 22px ${T.disp}`, margin: '18px 0 8px' }}>
					{ln.slice(2)}
				</h2>
			);
		if (ln.startsWith('> '))
			return (
				<blockquote
					key={i}
					style={{
						margin: '10px 0',
						padding: '10px 14px',
						borderLeft: `3px solid ${T.accBd}`,
						background: T.alt,
						borderRadius: '0 8px 8px 0',
						font: `italic 13.5px/1.6 ${T.sans}`,
						color: T.sub,
					}}
				>
					{/* Read-aloud text is the most-read content in the app; it was the one branch that
					    skipped boldify, so **emphasis** rendered as literal asterisks. */}
					{boldify(ln.slice(2), t, resolve)}
				</blockquote>
			);
		if (ln.startsWith('- '))
			return (
				<li key={i} style={{ font: `13.5px/1.6 ${T.sans}`, color: T.sub, marginLeft: 18 }}>
					{boldify(ln.slice(2), t, resolve)}
				</li>
			);
		if (!ln.trim()) return <div key={i} style={{ height: 6 }} />;
		return (
			<p key={i} style={{ font: `13.5px/1.7 ${T.sans}`, color: T.sub, margin: '0 0 6px' }}>
				{boldify(ln, t, resolve)}
			</p>
		);
	}
}
