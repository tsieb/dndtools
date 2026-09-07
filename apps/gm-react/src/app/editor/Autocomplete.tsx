import { useEffect, useRef, type ReactNode } from 'react';
import { T } from '../screen-kit';

/**
 * RC-KNW-1.2 — the `[[` wikilink autocomplete: the trigger detector, and the listbox both this and
 * the slash menu render.
 *
 * The CANDIDATES are not decided here. The screen builds them from the core's actor-scoped
 * `buildQuickSwitcher` read and keeps only the ones `resolveWikilinkForActor` actually resolves, so
 * the menu can never advertise — or even name — a note this actor may not open, and a chosen
 * suggestion can never insert a dead link (guardrails 2 and 8).
 */

/** One offered wikilink target. `title` is what gets written into the note between `[[` and `]]`. */
export interface WikilinkSuggestion {
	id: string;
	title: string;
	/** The already-localized kind word shown on the right of the row (Note, Location, …). */
	kind: string;
}

/** An open autocomplete: where the trigger character sits and what has been typed after it. */
export interface EditorTrigger {
	/** Index of the trigger itself (`[` of `[[`, or the `/`). Replacement starts here. */
	start: number;
	/** The lowercased text typed since the trigger. */
	query: string;
}

/**
 * Find an unterminated `[[` immediately before the caret. Returns `null` when there is none, when
 * the link is already closed, or when a newline intervenes — a wikilink never spans lines, so a
 * stray `[[` two paragraphs up must not keep the menu open while the DM writes prose.
 */
export function findWikilinkTrigger(text: string, caret: number): EditorTrigger | null {
	const open = text.lastIndexOf('[[', Math.max(0, caret - 1));
	if (open === -1) return null;
	const typed = text.slice(open + 2, caret);
	if (typed.includes('\n') || typed.includes(']]') || typed.includes('[')) return null;
	return { start: open, query: typed.toLowerCase() };
}

/** Replace the trigger and everything typed after it with `[[Title]]`, caret after the closer. */
export function completeWikilink(
	text: string,
	trigger: EditorTrigger,
	caret: number,
	title: string,
): { text: string; caret: number } {
	const inserted = `[[${title}]]`;
	return {
		text: text.slice(0, trigger.start) + inserted + text.slice(caret),
		caret: trigger.start + inserted.length,
	};
}

/** Wrap an index into `[0,length)`, so Up on the first row lands on the last. */
export function wrapIndex(index: number, length: number): number {
	if (length === 0) return 0;
	return ((index % length) + length) % length;
}

/** One row of the shared listbox. */
export interface SuggestionRow {
	id: string;
	label: string;
	/** The muted right-hand word (a content kind, or the insert category). */
	meta?: string;
	/** A second line under the label, when the row needs explaining. */
	hint?: string;
}

/**
 * The listbox both autocompletes render. It is deliberately NOT focusable: focus stays in the
 * textarea and the active row is announced through `aria-activedescendant`, which is the ARIA 1.2
 * combobox pattern and the only way `[[` completion stays usable for a keyboard-only author.
 */
export function SuggestionList({
	listId,
	rows,
	activeIndex,
	emptyLabel,
	label,
	onChoose,
}: {
	listId: string;
	rows: SuggestionRow[];
	activeIndex: number;
	emptyLabel: string;
	label: string;
	onChoose: (index: number) => void;
}): ReactNode {
	const activeRef = useRef<HTMLDivElement>(null);
	// Keep the active row in view when the author arrows past the bottom of the 220px scroller.
	useEffect(() => {
		activeRef.current?.scrollIntoView({ block: 'nearest' });
	}, [activeIndex]);

	return (
		<div
			style={{
				position: 'absolute',
				zIndex: 40,
				left: 0,
				right: 0,
				maxHeight: 220,
				overflowY: 'auto',
				background: T.overlay,
				border: `1px solid ${T.bdS}`,
				borderRadius: 8,
				boxShadow: T.smd,
				padding: 4,
			}}
		>
			<div id={listId} role="listbox" aria-label={label}>
				{rows.length === 0 ? (
					<div style={{ font: `12px ${T.sans}`, color: T.ter, padding: '8px 10px' }}>
						{emptyLabel}
					</div>
				) : (
					rows.map((row, index) => (
						<div
							key={row.id}
							id={`${listId}-opt-${index}`}
							ref={index === activeIndex ? activeRef : undefined}
							role="option"
							aria-selected={index === activeIndex}
							// The textarea keeps focus, so this is a mouse affordance only; the keyboard
							// path is Arrow + Enter against the same `onChoose`. `onMouseDown` rather than
							// `onClick` so the textarea never blurs and closes the menu first.
							onMouseDown={(e) => {
								e.preventDefault();
								onChoose(index);
							}}
							style={{
								display: 'flex',
								alignItems: 'baseline',
								gap: 8,
								padding: '6px 10px',
								borderRadius: 6,
								cursor: 'pointer',
								background: index === activeIndex ? T.accSub : 'transparent',
							}}
						>
							<span style={{ flex: 1, minWidth: 0 }}>
								<span
									style={{
										display: 'block',
										font: `12.5px ${T.sans}`,
										color: T.ink,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{row.label}
								</span>
								{row.hint && (
									<span style={{ display: 'block', font: `11px ${T.sans}`, color: T.ter }}>
										{row.hint}
									</span>
								)}
							</span>
							{row.meta && <span style={{ font: `11px ${T.sans}`, color: T.ter }}>{row.meta}</span>}
						</div>
					))
				)}
			</div>
		</div>
	);
}
