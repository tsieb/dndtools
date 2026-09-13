import {
	memo,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
	type RefObject,
	type WheelEvent,
} from 'react';
import type { BoardWidget } from '../../board-helpers';
import { Badge } from '../../../ds';
import { useI18n, type MessageKey } from '../../../i18n';
import { renderMarkdown } from '../../markdown/render';
import { Muted, bodyWrap, cfg } from '../../widget-body-kit';

/**
 * RC-CAN-2.3 — the note tile, drawn at the depth the DM picked in the Inspector.
 *
 * - `title`: the heading and nothing else, for a board where the note is a signpost.
 * - `summary`: the heading and the body's first block (up to the first blank line), clipped.
 * - `full`: the whole body in a scroll region. This was the only rendering before this story, so
 *   it stays the default and a note placed earlier looks the way it did.
 *
 * Every depth renders author text through the ONE markdown pipeline (RC-KNW-1.1). No DM authority
 * is asserted here: a tile can be projected to the table, so a `[!Secret]` callout renders as
 * withheld at every depth (fail closed).
 *
 * A long note does not mount all at once. Past {@link VIRTUALIZE_OVER_LINES} source lines the body
 * is cut into windows of about {@link NOTE_CHUNK_LINES} lines, each of which is its own
 * IntersectionObserver sentinel: a window mounts when it comes within one viewport of the scroll
 * region and is replaced by a placeholder of its measured height when it leaves. A 2,000-line note
 * therefore costs what its visible part costs, which is what keeps a widget update on a board with
 * one inside the `widget-update` budget.
 *
 * The depth badge shows only in edit mode, where the DM is deciding how much of each note the board
 * shows. It is only drawn for a widget that declares the `depth` field, so a handout (same body,
 * no depth knob) does not claim a setting it lacks.
 *
 * Moved here from `NoteBody.tsx`, which RC-WID-4.1 split out of `app/widget-bodies.tsx`.
 */

export type NoteDepth = 'title' | 'summary' | 'full';

const NOTE_DEPTHS: readonly NoteDepth[] = ['title', 'summary', 'full'];

const DEPTH_LABEL: Record<NoteDepth, MessageKey> = {
	title: 'widgetBody.note.depthTitle',
	summary: 'widgetBody.note.depthSummary',
	full: 'widgetBody.note.depthFull',
};

/** Past this many source lines, `full` depth mounts the body in windows instead of all at once. */
export const VIRTUALIZE_OVER_LINES = 200;
/** The size a window aims for. A window closes at the first safe boundary after this many lines. */
export const NOTE_CHUNK_LINES = 100;
/** `summary` shows at most this many source lines of the first block. */
const SUMMARY_MAX_LINES = 12;

/**
 * The same tests `parseBlocks` uses for a fence line and a heading (`app/markdown/plugins.ts`). A
 * window must never close inside a fence, or the rest of the code block would render as prose.
 */
const FENCE_LINE = /^\s*(?:```|~~~)\s*([A-Za-z0-9+#-]*)\s*$/;
const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

type Translate = ReturnType<typeof useI18n>['t'];

/** The configured depth; anything unrecognised is `full`, the rendering every note had before. */
export function noteDepth(widget: BoardWidget): NoteDepth {
	const raw = cfg<string>(widget, 'depth');
	return NOTE_DEPTHS.find((depth) => depth === raw) ?? 'full';
}

function lineCount(text: string): number {
	return text.split(/\r?\n/).length;
}

/**
 * True when the parser starts a new block at `next` whatever line came before it: after a closing
 * fence, or at an opening fence or a heading. No block `parseBlocks` builds (paragraph, list, quote,
 * callout, table, figure caption) takes a fence or a heading as its next line, except that a table
 * takes any line with a `|` in it as a row, so a heading with one is not trusted.
 */
function startsBlock(next: string, afterClosingFence: boolean): boolean {
	return (
		afterClosingFence || FENCE_LINE.test(next) || (HEADING_LINE.test(next) && !next.includes('|'))
	);
}

/**
 * Cut a long body into windows that parse the same way apart as they do together.
 *
 * A window prefers to close on a blank line outside a fence. The parser ends every block there, so
 * that cut changes nothing. A body with no such line for {@link NOTE_CHUNK_LINES} × 2 lines may
 * also close a window where the parser starts a new block regardless ({@link startsBlock}). Any
 * other cut would split one block into two, each rendered on its own: the tail of a `[!Secret]`
 * callout would show as an ordinary quote on a board the players can see, a numbered list would
 * restart at 1, a table would lose its header. A run with no legal cut stays in one window: correct
 * rendering matters more than a fast one.
 *
 * The one difference apart is heading `id`s: a repeated heading is numbered `-2`, `-3` from the
 * start of its own window. Nothing links into a board tile by anchor.
 *
 * Joining the result with `\n` gives back the body (line endings normalised).
 */
export function splitNoteChunks(body: string, target: number = NOTE_CHUNK_LINES): string[] {
	const lines = body.split(/\r?\n/);
	const chunks: string[] = [];
	let start = 0;
	let inFence = false;
	for (let i = 0; i < lines.length - 1; i += 1) {
		const line = lines[i]!;
		const fence = FENCE_LINE.test(line);
		if (fence) inFence = !inFence;
		const size = i + 1 - start;
		if (inFence || size < target) continue;
		// Past the `inFence` guard, a fence line is one that just closed its block.
		const blank = line.trim() === '';
		if (blank || (size >= target * 2 && startsBlock(lines[i + 1]!, fence))) {
			chunks.push(lines.slice(start, i + 1).join('\n'));
			start = i + 1;
		}
	}
	chunks.push(lines.slice(start).join('\n'));
	return chunks;
}

/**
 * The body's first block: everything up to the first blank line outside a fence, capped at
 * {@link SUMMARY_MAX_LINES}. Cutting from the end keeps a leading callout marker in place, so a
 * summary that opens with `[!Secret]` is still withheld rather than shown as a quote.
 */
export function noteSummary(body: string): string {
	const lines = body.split(/\r?\n/);
	let first = 0;
	while (first < lines.length && lines[first]!.trim() === '') first += 1;
	let end = first;
	let inFence = false;
	while (end < lines.length && end - first < SUMMARY_MAX_LINES) {
		const line = lines[end]!;
		if (FENCE_LINE.test(line)) inFence = !inFence;
		else if (!inFence && line.trim() === '') break;
		end += 1;
	}
	return lines.slice(first, end).join('\n');
}

const HEADER_ROW: CSSProperties = {
	display: 'flex',
	alignItems: 'flex-start',
	gap: 'var(--space-2)',
	minWidth: 0,
	flex: '0 0 auto',
};

const HEADING_STYLE: CSSProperties = {
	flex: 1,
	minWidth: 0,
	font: '700 var(--text-sm) var(--font-display)',
	color: 'var(--color-text-primary)',
	overflowWrap: 'anywhere',
};

const PROSE_STYLE: CSSProperties = {
	flex: '1 1 auto',
	minHeight: 0,
	font: 'var(--text-xs)/1.6 var(--font-sans)',
	color: 'var(--color-text-secondary)',
};

const BADGE_STYLE: CSSProperties = { marginLeft: 'auto', flex: '0 0 auto' };

/** One block of author text through the shared pipeline, memoised on the text itself. */
const NoteMarkdown = memo(function NoteMarkdown({
	markdown,
	t,
}: {
	markdown: string;
	t: Translate;
}) {
	return markdown.trim() ? <>{renderMarkdown(markdown, { t })}</> : null;
});

/**
 * A wheel over a note that can still scroll belongs to the note. Without this the canvas's own wheel
 * handler pans the board under the pointer while the note scrolls. Ctrl/⌘+wheel is zoom and stays
 * the canvas's.
 */
function keepWheelInside(event: WheelEvent<HTMLDivElement>) {
	if (event.ctrlKey || event.metaKey) return;
	const el = event.currentTarget;
	const room =
		event.deltaY < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
	if (room) event.stopPropagation();
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** With the region focused, the arrow keys scroll the note; the frame binds them to the widget. */
function keepScrollKeysInside(event: KeyboardEvent<HTMLDivElement>) {
	if (event.target === event.currentTarget && SCROLL_KEYS.has(event.key)) event.stopPropagation();
}

interface WindowView {
	mounted: ReadonlySet<number>;
	/** Last measured layout height of a window, so its placeholder holds the same space. */
	heights: ReadonlyMap<number, number>;
}

function initialView(chunkCount: number): WindowView {
	// With no observer (a very old WebView) nothing would ever mount past the first window, so mount
	// them all: slow but complete beats fast and missing text.
	const all = typeof IntersectionObserver === 'undefined';
	return {
		mounted: new Set(all ? Array.from({ length: chunkCount }, (_, i) => i) : [0]),
		heights: new Map(),
	};
}

function NoteWindows({
	chunks,
	regionRef,
	t,
}: {
	chunks: readonly string[];
	regionRef: RefObject<HTMLDivElement | null>;
	t: Translate;
}) {
	const [view, setView] = useState<WindowView>(() => initialView(chunks.length));

	useEffect(() => {
		const root = regionRef.current;
		if (!root || typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(
			(entries) => {
				const enter: number[] = [];
				const leave: [number, number][] = [];
				for (const entry of entries) {
					const el = entry.target as HTMLElement;
					const index = Number(el.dataset.noteChunk);
					if (entry.isIntersecting) enter.push(index);
					// A window holding keyboard focus (a link inside it) stays, or focus would drop to <body>.
					else if (!el.contains(document.activeElement)) leave.push([index, el.offsetHeight]);
				}
				setView((previous) => {
					let changed = false;
					const mounted = new Set(previous.mounted);
					const heights = new Map(previous.heights);
					for (const [index, height] of leave) {
						if (!mounted.delete(index)) continue;
						changed = true;
						// `offsetHeight` is layout size, so the board's zoom transform does not skew it.
						if (height > 0) heights.set(index, height);
					}
					for (const index of enter) {
						if (mounted.has(index)) continue;
						mounted.add(index);
						changed = true;
					}
					return changed ? { mounted, heights } : previous;
				});
			},
			{ root, rootMargin: '100% 0px' },
		);
		for (const el of root.querySelectorAll<HTMLElement>('[data-note-chunk]')) observer.observe(el);
		return () => observer.disconnect();
	}, [chunks, regionRef]);

	return chunks.map((markdown, index) => {
		const live = view.mounted.has(index);
		const measured = view.heights.get(index);
		return (
			<div
				key={index}
				data-note-chunk={index}
				data-mounted={live ? 'true' : 'false'}
				style={
					live
						? undefined
						: { height: measured ? `${measured}px` : `${lineCount(markdown) * 1.6}em` }
				}
			>
				{live && <NoteMarkdown markdown={markdown} t={t} />}
			</div>
		);
	});
}

function FullNote({ body, label, t }: { body: string; label: string; t: Translate }) {
	const regionRef = useRef<HTMLDivElement>(null);
	const chunks = useMemo(
		() => (lineCount(body) > VIRTUALIZE_OVER_LINES ? splitNoteChunks(body) : null),
		[body],
	);
	return (
		// A scroll region has to be reachable from the keyboard (axe `scrollable-region-focusable`),
		// and a labelled region tells a screen-reader user whose text they have landed in.
		<div
			ref={regionRef}
			role="region"
			aria-label={label}
			tabIndex={0}
			data-testid="note-scroll-region"
			onWheel={keepWheelInside}
			onKeyDown={keepScrollKeysInside}
			style={{ ...PROSE_STYLE, overflowY: 'auto', overscrollBehavior: 'contain' }}
		>
			{chunks ? (
				<NoteWindows chunks={chunks} regionRef={regionRef} t={t} />
			) : (
				<NoteMarkdown markdown={body} t={t} />
			)}
		</div>
	);
}

export function NoteTile({ widget, editing = false }: { widget: BoardWidget; editing?: boolean }) {
	const { t } = useI18n();
	const heading = cfg<string>(widget, 'heading');
	const body = cfg<string>(widget, 'body') ?? '';
	const depth = noteDepth(widget);
	const summary = useMemo(() => (depth === 'summary' ? noteSummary(body) : ''), [depth, body]);

	const badge =
		editing && widget.configFields.some((field) => field.key === 'depth') ? (
			<Badge data-testid="note-depth-badge" style={BADGE_STYLE}>
				{t('widgetBody.note.depthBadge', { depth: t(DEPTH_LABEL[depth]) })}
			</Badge>
		) : null;

	if (!heading && !body) {
		return (
			<div data-note-depth={depth} style={bodyWrap}>
				{badge && <div style={HEADER_ROW}>{badge}</div>}
				<Muted>{t('widgetBody.note.empty')}</Muted>
			</div>
		);
	}

	const title = heading ? (
		<div style={HEADING_STYLE}>{heading}</div>
	) : depth === 'title' ? (
		<Muted>{t('widgetBody.note.untitled')}</Muted>
	) : null;

	return (
		<div data-note-depth={depth} style={{ ...bodyWrap, gap: 'var(--space-1)' }}>
			{(title || badge) && (
				<div style={HEADER_ROW}>
					{title}
					{badge}
				</div>
			)}
			{depth === 'summary' && body && (
				<div style={{ ...PROSE_STYLE, overflow: 'hidden' }}>
					<NoteMarkdown markdown={summary} t={t} />
				</div>
			)}
			{depth === 'full' && body && (
				<FullNote
					body={body}
					label={t('widgetBody.note.region', { title: heading || widget.title })}
					t={t}
				/>
			)}
		</div>
	);
}
