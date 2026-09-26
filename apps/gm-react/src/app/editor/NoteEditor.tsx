import {
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
} from 'react';
import { Button, Input } from '../../ds';
import { ConflictNotice } from './ConflictNotice';
import { useNoteAutosave, type NoteSaveOutcome } from './useNoteAutosave';
import { Seg, T } from '../screen-kit';
import { useViewport } from '../useViewport';
import { useI18n } from '../../i18n';
import { applyToolbarAction, EditorToolbar, type ToolbarAction } from './Toolbar';
import {
	completeWikilink,
	findWikilinkTrigger,
	SuggestionList,
	wrapIndex,
	type EditorTrigger,
	type SuggestionRow,
	type WikilinkSuggestion,
} from './Autocomplete';
import {
	completeSlash,
	filterSlashItems,
	findSlashTrigger,
	slashItems,
	slashRows,
	type SlashItem,
} from './SlashMenu';

/**
 * RC-KNW-1.2 — the note body editor.
 *
 * A plain `<textarea>`, deliberately: a contenteditable rich-text engine would be a second markdown
 * model to keep in step with the core's (`state/markdown.ts`) and the shared renderer's, and the
 * vault is markdown either way. Everything layered on top — toolbar, `[[` completion, the `/` insert
 * menu, the live preview — reads and writes that one string.
 *
 * The textarea is hand-rolled rather than the DS `Textarea` for one reason: this component needs the
 * element itself (`selectionStart` / `setSelectionRange`) to place the caret after every insert, and
 * React 18 function components do not forward refs. It uses the same semantic tokens — including the
 * same field background and border tokens — as the DS field.
 *
 * SAVING is conflict-safe. Every write carries the `baseRevision` the draft diverged from, so when
 * the note changed elsewhere the core records a `content.item-conflicted` operation and leaves the
 * item ALONE (`packages/core/src/commands/content.ts`). The editor then says exactly that and offers
 * the choice, rather than reporting a save that did not happen.
 */

export type { NoteSaveOutcome } from './useNoteAutosave';

export interface NoteEditorProps {
	/** The PERSISTED title/body/revision, straight off the actor-filtered read. */
	title: string;
	body: string;
	revision: number;
	/** Actor-scoped `[[` candidates for a query; already narrowed to links that resolve. */
	suggest: (query: string) => WikilinkSuggestion[];
	/** Renders the live preview through the shared RC-KNW-1.1 pipeline. */
	renderPreview: (body: string) => ReactNode;
	onSave: (draft: {
		title: string;
		body: string;
		baseRevision: number;
	}) => Promise<NoteSaveOutcome>;
	/** Leave the editor. Edits made since the last write are dropped. */
	onCancel: () => void;
	onDelete?: () => void;
	busy?: boolean;
}

const LIST_ID = 'note-editor-suggestions';
const MAX_WIKILINK_ROWS = 8;

export function NoteEditor({
	title,
	body,
	revision,
	suggest,
	renderPreview,
	onSave,
	onCancel,
	onDelete,
	busy = false,
}: NoteEditorProps) {
	const { t, formatDate, formatTime } = useI18n();
	const splitPane = useViewport() === 'desktop';

	const [draftTitle, setDraftTitle] = useState(title);
	const [draftBody, setDraftBody] = useState(body);
	const [tab, setTab] = useState<'write' | 'preview'>('write');
	const [trigger, setTrigger] = useState<{ kind: 'wikilink' | 'slash'; at: EditorTrigger } | null>(
		null,
	);
	const [active, setActive] = useState(0);

	const areaRef = useRef<HTMLTextAreaElement>(null);
	const caretRef = useRef<number | null>(null);
	const caretEndRef = useRef<number | null>(null);
	const {
		dirty,
		state,
		setState,
		savedAt,
		error,
		setError,
		setBase,
		write,
		saveAndClose,
		discard,
	} = useNoteAutosave({ title, body, revision, draftTitle, draftBody, onSave, onCancel, busy });

	const items = useMemo(
		() => slashItems(t, formatDate(new Date(), { year: 'numeric', month: 'long', day: 'numeric' })),
		[t, formatDate],
	);

	const wikilinkHits: WikilinkSuggestion[] = useMemo(
		() =>
			trigger?.kind === 'wikilink' ? suggest(trigger.at.query).slice(0, MAX_WIKILINK_ROWS) : [],
		[trigger, suggest],
	);

	const slashHits: SlashItem[] = useMemo(
		() => (trigger?.kind === 'slash' ? filterSlashItems(items, trigger.at.query) : []),
		[trigger, items],
	);

	const rows: SuggestionRow[] =
		trigger?.kind === 'wikilink'
			? wikilinkHits.map((hit) => ({ id: hit.id, label: hit.title, meta: hit.kind }))
			: slashRows(slashHits);

	/** Write new body text and remember where the caret must land once React has painted. */
	function applyEdit(next: string, caret: number, selectionEnd = caret) {
		setDraftBody(next);
		caretRef.current = caret;
		caretEndRef.current = selectionEnd;
	}

	useLayoutEffect(() => {
		const area = areaRef.current;
		if (!area || caretRef.current === null) return;
		area.setSelectionRange(caretRef.current, caretEndRef.current ?? caretRef.current);
		caretRef.current = null;
		caretEndRef.current = null;
	});

	/** Recompute which menu (if any) the caret is currently inside. */
	function syncTrigger(text: string, caret: number) {
		const wikilink = findWikilinkTrigger(text, caret);
		if (wikilink) {
			setTrigger({ kind: 'wikilink', at: wikilink });
			setActive(0);
			return;
		}
		const slash = findSlashTrigger(text, caret);
		if (slash) {
			setTrigger({ kind: 'slash', at: slash });
			setActive(0);
			return;
		}
		setTrigger(null);
	}

	function choose(index: number) {
		const area = areaRef.current;
		if (!area || !trigger) return;
		const caret = area.selectionStart;
		const next =
			trigger.kind === 'wikilink'
				? (() => {
						const hit = wikilinkHits[index];
						return hit ? completeWikilink(draftBody, trigger.at, caret, hit.title) : null;
					})()
				: (() => {
						const item = slashHits[index];
						return item ? completeSlash(draftBody, trigger.at, caret, item) : null;
					})();
		if (!next) return;
		applyEdit(next.text, next.caret);
		setTrigger(null);
		area.focus();
	}

	function runAction(action: ToolbarAction) {
		const area = areaRef.current;
		if (!area) return;
		const edit = applyToolbarAction(action, draftBody, area.selectionStart, area.selectionEnd, {
			linkText: t('editor.linkText'),
			column: t('editor.tableColumn'),
		});
		applyEdit(edit.text, edit.start, edit.end);
		setTrigger(null);
		area.focus();
	}

	function onAreaKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
		if (trigger && rows.length > 0) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				setActive((i) => wrapIndex(i + (e.key === 'ArrowDown' ? 1 : -1), rows.length));
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				choose(active);
				return;
			}
		}
		if (trigger && e.key === 'Escape') {
			// Stop here: Escape must dismiss the menu WITHOUT also reaching the shell, where it closes
			// panels and would drop the author out of the editor in a single press.
			e.preventDefault();
			e.stopPropagation();
			setTrigger(null);
			return;
		}
		const mod = e.metaKey || e.ctrlKey;
		if (mod && !e.altKey && (e.key === 'b' || e.key === 'i')) {
			// Ctrl/Cmd+B and +I only. Ctrl+K belongs to the command palette
			// (`app/shortcuts/registry.ts`) and is not taken back here.
			e.preventDefault();
			runAction(e.key === 'b' ? 'bold' : 'italic');
		}
	}

	const statusText =
		state === 'saving'
			? t('editor.statusSaving')
			: state === 'conflict'
				? t('editor.statusConflict')
				: state === 'failed'
					? t('editor.statusFailed')
					: dirty
						? t('editor.statusUnsaved')
						: savedAt
							? t('editor.statusSaved', { when: formatTime(savedAt) })
							: t('editor.statusUpToDate');

	const preview = (
		<div
			aria-label={t('editor.preview')}
			style={{
				border: `1px solid ${T.bd}`,
				borderRadius: T.radius.md,
				background: T.surf,
				padding: `${T.space.three} ${T.space.four}`,
				minHeight: 180,
				overflowWrap: 'anywhere',
			}}
		>
			{renderPreview(draftBody)}
		</div>
	);

	const writer = (
		<div style={{ position: 'relative' }}>
			<textarea
				ref={areaRef}
				value={draftBody}
				aria-label={t('knowledge.noteBody')}
				placeholder={t('knowledge.notePlaceholder')}
				rows={splitPane ? 18 : 12}
				// A multiline textbox with list autocompletion, not a `combobox`: ARIA allows no role
				// override on <textarea> (axe `aria-allowed-role`), and a combobox is single-line.
				// `aria-controls` + `aria-activedescendant` still name the open list and its active
				// option while focus stays in the text.
				aria-autocomplete="list"
				{...(trigger && rows.length > 0
					? { 'aria-controls': LIST_ID, 'aria-activedescendant': `${LIST_ID}-opt-${active}` }
					: {})}
				onChange={(e) => {
					setDraftBody(e.target.value);
					syncTrigger(e.target.value, e.target.selectionStart);
				}}
				onKeyUp={(e) => {
					// Arrowing or clicking out of a `[[` closes the menu. The change handler alone cannot
					// see caret moves that type nothing.
					if (!e.metaKey && !e.ctrlKey) {
						syncTrigger(e.currentTarget.value, e.currentTarget.selectionStart);
					}
				}}
				onKeyDown={onAreaKeyDown}
				onBlur={() => setTrigger(null)}
				style={{
					width: '100%',
					boxSizing: 'border-box',
					font: `var(--text-sm)/1.6 ${T.mono}`,
					color: T.ink,
					background: 'var(--color-surface-sunken)',
					border: '1px solid var(--color-border-strong)',
					borderRadius: 'var(--radius-sm)',
					padding: 'var(--component-input-py) var(--component-input-px)',
					resize: 'vertical',
				}}
			/>
			{trigger && (
				<SuggestionList
					listId={LIST_ID}
					rows={rows}
					activeIndex={active}
					label={t(trigger.kind === 'wikilink' ? 'editor.suggestions' : 'editor.insertMenu')}
					emptyLabel={t('editor.noMatches')}
					onChoose={choose}
				/>
			)}
		</div>
	);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}>
			<Input
				value={draftTitle}
				aria-label={t('knowledge.noteTitle')}
				onChange={(e: { target: { value: string } }) => setDraftTitle(e.target.value)}
				placeholder={t('knowledge.noteTitle')}
			/>

			<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two, flexWrap: 'wrap' }}>
				<EditorToolbar onAction={runAction} disabled={busy} />
				<div style={{ flex: 1 }} />
				{/* Live status, never a toast: an autosave that fired while you were typing has to be
				    readable at a glance, and role=status announces it without stealing focus. */}
				<span
					role="status"
					style={{ font: `var(--text-xs) ${T.sans}`, color: state === 'failed' ? T.err : T.ter }}
				>
					{statusText}
				</span>
			</div>

			{splitPane ? (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
						gap: T.space.three,
						alignItems: 'start',
					}}
				>
					{writer}
					{preview}
				</div>
			) : (
				<>
					<Seg
						ariaLabel={t('editor.viewLabel')}
						options={[
							{ value: 'write', label: t('editor.write') },
							{ value: 'preview', label: t('editor.preview') },
						]}
						value={tab}
						onChange={(next: string) => setTab(next === 'preview' ? 'preview' : 'write')}
					/>
					{tab === 'write' ? writer : preview}
				</>
			)}

			<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>{t('editor.hint')}</div>

			{state === 'conflict' && (
				<ConflictNotice
					busy={busy}
					onKeepMine={() => void write(true)}
					onUseSaved={() => {
						setDraftTitle(title);
						setDraftBody(body);
						setBase(revision);
						setState('clean');
						setError(null);
					}}
				/>
			)}

			{error && (
				<span role="alert" style={{ font: `var(--text-sm) ${T.sans}`, color: T.err }}>
					{error}
				</span>
			)}

			<div style={{ display: 'flex', gap: T.space.two, flexWrap: 'wrap' }}>
				<Button
					variant="primary"
					size="sm"
					icon="check"
					disabled={busy}
					onClick={() => void saveAndClose()}
				>
					{t('knowledge.saveNote')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() => {
						discard();
						setError(null);
						onCancel();
					}}
				>
					{t('common.action.cancel')}
				</Button>
				<div style={{ flex: 1 }} />
				{onDelete && (
					<Button
						variant="danger"
						size="sm"
						icon="delete"
						disabled={busy}
						onClick={() => {
							discard();
							onDelete();
						}}
					>
						{t('common.action.delete')}
					</Button>
				)}
			</div>
		</div>
	);
}
