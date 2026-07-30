import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
	actorCanAuthorContent,
	getContentItemsForActor,
	getNoteRelationshipsForActor,
	type ContentItemView,
} from '@dndtools/core';
import {
	Button,
	Card,
	EmptyState,
	Icon,
	IconButton,
	Input,
	Select,
	Textarea,
	Toaster,
	VisibilityChip,
} from '../ds';
import { BackBar, Page, Panel, Seg, T } from '../app/screen-kit';
import { useViewport } from '../app/useViewport';
import { useRuntime } from '../runtime/RuntimeContext';
import { pickTextFiles } from '../platform/filePick';
import { ConnectedSourcesPanel } from '../app/ConnectedSources';

/**
 * Knowledge — notes / handouts / read-aloud, wired to the live Processing Core.
 * The list reads the actor-filtered content model (`getContentItemsForActor`); a
 * player/observer therefore sees ONLY the notes shared with them, never the DM's dm-only material.
 * Opening a note gives a real editor whose Save PERSISTS through `content.update-item`; New note and
 * Import dispatch the real `content.create-item` / `content.commit-import` commands; the visibility
 * control + "Push to players" are the real `content.set-item-visibility` (the cross-surface
 * invalidation trigger). Backlinks/Related come from the real `getNoteRelationshipsForActor` graph.
 * Mirrors the production `routes/knowledge` NotesWorkbench wiring.
 */

// Core visibility (`dm-only` / `player-visible` / `shared`) → the safety-critical VisibilityChip level.
// The Core never emits a "hidden" level for a returned item (hidden items are omitted entirely).
const VIS_CHIP: Record<string, string> = {
	'dm-only': 'dm-only',
	'player-visible': 'players',
	shared: 'players',
};
const VIS_OPTIONS = [
	{ value: 'dm-only', label: 'DM only' },
	{ value: 'player-visible', label: 'Players' },
	{ value: 'shared', label: 'Shared' },
];
const IMPORT_POLICIES = [
	{ value: 'skip', label: 'Skip collisions' },
	{ value: 'overwrite', label: 'Overwrite existing' },
	{ value: 'keep-both', label: 'Keep both' },
];

function formatStamp(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A one-line, marker-stripped preview of a note body for the list cards. */
function snippetOf(body: string): string {
	const line = body
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l && !l.startsWith('#'));
	if (!line) return 'Empty note';
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
function parseArchive(raw: string): { path: string; text: string }[] {
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

function boldify(s: string): ReactNode {
	const parts = s.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g);
	return parts.map((p, i) => {
		if (p.startsWith('**'))
			return (
				<strong key={i} style={{ color: T.ink }}>
					{p.slice(2, -2)}
				</strong>
			);
		if (p.startsWith('[['))
			return (
				<span key={i} style={{ color: T.acc }}>
					{p.slice(2, -2)}
				</span>
			);
		return p;
	});
}

function mdToNodes(md: string): ReactNode {
	if (!md.trim())
		return (
			<p style={{ font: `13.5px/1.7 ${T.sans}`, color: T.ter, fontStyle: 'italic' }}>
				This note is empty.
			</p>
		);
	return md.split('\n').map((ln, i) => {
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
					{boldify(ln.slice(2))}
				</blockquote>
			);
		if (ln.startsWith('- '))
			return (
				<li key={i} style={{ font: `13.5px/1.6 ${T.sans}`, color: T.sub, marginLeft: 18 }}>
					{boldify(ln.slice(2))}
				</li>
			);
		if (!ln.trim()) return <div key={i} style={{ height: 6 }} />;
		return (
			<p key={i} style={{ font: `13.5px/1.7 ${T.sans}`, color: T.sub, margin: '0 0 6px' }}>
				{boldify(ln)}
			</p>
		);
	});
}

function RelRow({
	icon,
	title,
	kind,
	onClick,
}: {
	icon: string;
	title: string;
	kind: string;
	onClick?: () => void;
}) {
	const [hov, setHov] = useState(false);
	// Clickable rows read as LINKS (accent + hover underline) — as plain grey text nobody tried them.
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={!onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				padding: '6px 0',
				width: '100%',
				border: 'none',
				background: 'transparent',
				textAlign: 'left',
				cursor: onClick ? 'pointer' : 'default',
				font: `12.5px ${T.sans}`,
				color: onClick ? T.acc : T.sub,
			}}
		>
			<Icon name={icon} size={14} color={T.ter} />
			<span
				style={{
					flex: 1,
					minWidth: 0,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					textDecoration: onClick && hov ? 'underline' : 'none',
				}}
			>
				{title}
			</span>
			<span style={{ font: `11px ${T.sans}`, color: T.ter }}>{kind}</span>
		</button>
	);
}

function NoteViewer({
	note,
	canAuthor,
	onBack,
	onOpen,
}: {
	note: ContentItemView;
	canAuthor: boolean;
	onBack: () => void;
	onOpen: (id: string) => void;
}) {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const isPhone = useViewport() === 'phone';
	const [editing, setEditing] = useState(false);
	const [title, setTitle] = useState(note.title);
	const [body, setBody] = useState(note.body);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	const rel = useMemo(
		() =>
			getNoteRelationshipsForActor(
				runtime.state.content,
				runtime.state.permissions,
				actorId,
				note.id,
			),
		[runtime.state, actorId, note.id],
	);

	function startEdit() {
		setTitle(note.title);
		setBody(note.body);
		setErr(null);
		setEditing(true);
	}

	async function save() {
		if (!title.trim()) {
			setErr('A note needs a title.');
			return;
		}
		setBusy(true);
		// content.update-item — the authorized-editor write. Strict payload: itemId/title/body only
		// (visibility is a SEPARATE command; baseRevision omitted exactly as NotesWorkbench does).
		const result = await runtime.dispatch({
			type: 'content.update-item',
			actorId,
			payload: { itemId: note.id, title, body },
		});
		setBusy(false);
		if (result.status === 'accepted') setEditing(false);
		else setErr(result.rejection.message);
	}

	async function setVisibility(visibility: string) {
		setBusy(true);
		// content.set-item-visibility — the cross-surface invalidation trigger. "Push to players" is the
		// same command with `player-visible`.
		const result = await runtime.dispatch({
			type: 'content.set-item-visibility',
			actorId,
			payload: { itemId: note.id, visibility },
		});
		setBusy(false);
		if (result.status !== 'accepted') setErr(result.rejection.message);
	}

	async function remove() {
		setBusy(true);
		// content.remove-item — recoverable soft-delete (the item leaves every actor-filtered read),
		// so Delete acts immediately and the toast's Undo dispatches the counterpart
		// content.restore-item (same delete→undo pattern as ScenesCreator).
		const result = await runtime.dispatch({
			type: 'content.remove-item',
			actorId,
			payload: { itemId: note.id },
		});
		setBusy(false);
		if (result.status === 'accepted') {
			const itemId = note.id;
			const title = note.title;
			Toaster.success(`“${title}” deleted`, {
				action: 'Undo',
				onAction: () => {
					void runtime
						.dispatch({ type: 'content.restore-item', actorId, payload: { itemId } })
						.then((restored) => {
							if (restored.status === 'accepted') Toaster.success(`“${title}” restored`);
							else
								Toaster.error(
									restored.rejection.message ?? 'The note couldn’t be restored — try again.',
								);
						});
				},
			});
			onBack();
		} else setErr(result.rejection.message);
	}

	return (
		<Page max={1080}>
			<BackBar label="Notes" onClick={onBack} />
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: isPhone ? '1fr' : 'minmax(0,1fr) 280px',
					gap: 20,
					alignItems: 'start',
				}}
			>
				<Panel pad={26}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
						<VisibilityChip level={VIS_CHIP[note.visibility] || 'dm-only'} />
						<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
							Note · updated {formatStamp(note.updatedAt)}
						</span>
						<div style={{ flex: 1 }} />
						{canAuthor && !editing && (
							<>
								<IconButton
									icon="note-edit"
									label="Edit"
									variant="ghost"
									size="sm"
									onClick={startEdit}
								/>
								{note.visibility !== 'player-visible' && (
									<IconButton
										icon="send"
										label="Push to players"
										variant="ghost"
										size="sm"
										onClick={() => setVisibility('player-visible')}
									/>
								)}
							</>
						)}
					</div>

					{editing ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
							<Input
								value={title}
								aria-label="Note title"
								onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
								placeholder="Note title"
							/>
							<Textarea
								value={body}
								aria-label="Note body"
								onChange={(e: { target: { value: string } }) => setBody(e.target.value)}
								rows={18}
								placeholder="Write your note…"
								style={{ fontFamily: T.mono, fontSize: 13, lineHeight: 1.6 }}
							/>
							<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
								Markdown supported — ## headings, &gt; read-aloud, - lists, [[wikilinks]].
							</div>
							{err && <span style={{ font: `12px ${T.sans}`, color: T.err }}>{err}</span>}
							<div style={{ display: 'flex', gap: 8 }}>
								<Button variant="primary" size="sm" icon="check" disabled={busy} onClick={save}>
									Save note
								</Button>
								<Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
									Cancel
								</Button>
								<div style={{ flex: 1 }} />
								{canAuthor && (
									<Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
										Delete
									</Button>
								)}
							</div>
						</div>
					) : (
						<>
							<h2 style={{ font: `700 22px ${T.disp}`, margin: '0 0 12px' }}>{note.title}</h2>
							<div>{mdToNodes(note.body)}</div>
							{err && (
								<div style={{ marginTop: 10, font: `12px ${T.sans}`, color: T.err }}>{err}</div>
							)}
						</>
					)}
				</Panel>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel title="Sharing">
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							<VisibilityChip level={VIS_CHIP[note.visibility] || 'dm-only'} />
							<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
								{note.visibility === 'dm-only' ? 'Only you can see this.' : 'Visible to players.'}
							</span>
						</div>
						{canAuthor ? (
							<>
								<Seg ariaLabel="Note visibility" options={VIS_OPTIONS} value={note.visibility} onChange={setVisibility} />
								{note.visibility !== 'player-visible' && (
									<Button
										variant="secondary"
										size="sm"
										icon="send"
										disabled={busy}
										onClick={() => setVisibility('player-visible')}
										style={{ width: '100%' }}
									>
										Push to players
									</Button>
								)}
							</>
						) : (
							<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
								Shared with you by the DM.
							</span>
						)}
						{/* no core command — real-time multi-user editing PRESENCE (the prototype's live-collab
						    panel) is not modeled by the Processing Core; this panel surfaces the real,
						    backed visibility/sharing controls instead of a faked presence list. */}
					</Panel>

					<Panel title="Backlinks">
						{rel.backlinks.length === 0 ? (
							<span style={{ font: `12px ${T.sans}`, color: T.ter }}>No notes link here yet.</span>
						) : (
							rel.backlinks.map((b) => (
								<RelRow
									key={b.sourceId}
									icon="link"
									title={b.sourceTitle}
									kind="Note"
									onClick={() => onOpen(b.sourceId)}
								/>
							))
						)}
					</Panel>

					<Panel title="Related">
						{rel.related.length === 0 ? (
							<span style={{ font: `12px ${T.sans}`, color: T.ter }}>No linked notes yet.</span>
						) : (
							rel.related.map((r) => (
								<RelRow
									key={r.relatedId}
									icon="knowledge-book"
									title={r.relatedTitle}
									kind="Note"
									onClick={() => onOpen(r.relatedId)}
								/>
							))
						)}
					</Panel>
				</div>
			</div>
		</Page>
	);
}

function Composer({
	onCreate,
	onCancel,
	busy,
}: {
	onCreate: (title: string) => void;
	onCancel: () => void;
	busy: boolean;
}) {
	const [title, setTitle] = useState('');
	return (
		<Card
			elevation="flat"
			padding="md"
			style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}
		>
			<Input
				value={title}
				autoFocus
				aria-label="New note title"
				onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
				placeholder="New note title…"
				style={{ flex: 1 }}
				onKeyDown={(e: { key: string }) => {
					if (e.key === 'Enter' && title.trim()) onCreate(title.trim());
				}}
			/>
			<Button
				variant="primary"
				size="sm"
				icon="check"
				disabled={busy || !title.trim()}
				onClick={() => onCreate(title.trim())}
			>
				Create
			</Button>
			<Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
				Cancel
			</Button>
		</Card>
	);
}

/** Turn picked files into paste-box archive text. A `.json` export bundle (the shape Community's
 * Export downloads) expands into its member files; anything else imports as one markdown note. */
function pickedFilesToArchiveText(files: Array<{ name: string; text: string }>): string {
	const parts: string[] = [];
	for (const file of files) {
		if (file.name.toLowerCase().endsWith('.json')) {
			try {
				const parsed = JSON.parse(file.text) as {
					format?: unknown;
					files?: Array<{ path?: unknown; markdown?: unknown }>;
				};
				if (parsed.format === 'dndtools-content-export' && Array.isArray(parsed.files)) {
					for (const entry of parsed.files) {
						if (typeof entry.path === 'string' && typeof entry.markdown === 'string') {
							parts.push(`===== ${entry.path} =====\n${entry.markdown.trimEnd()}`);
						}
					}
					continue;
				}
			} catch {
				/* not a bundle — fall through and import the raw text as one file */
			}
		}
		parts.push(`===== ${file.name} =====\n${file.text.trimEnd()}`);
	}
	return parts.join('\n\n');
}

function ImportPanel({
	onImport,
	onCancel,
	busy,
	message,
}: {
	onImport: (text: string, policy: string) => void;
	onCancel: () => void;
	busy: boolean;
	message: string | null;
}) {
	const [text, setText] = useState('');
	const [policy, setPolicy] = useState('skip');
	const pickFiles = async () => {
		const files = await pickTextFiles('.md,.markdown,.txt,.json');
		if (files.length === 0) return;
		const archive = pickedFilesToArchiveText(files);
		if (!archive) return;
		// Append into the paste box (never silently dispatch) so the user reviews before importing.
		setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${archive}` : archive));
	};
	return (
		<Card
			elevation="flat"
			padding="md"
			style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
				<div style={{ flex: 1, font: `600 13px ${T.sans}`, color: T.ink }}>
					Import a markdown vault
				</div>
				<Button
					variant="secondary"
					size="sm"
					icon="import"
					disabled={busy}
					onClick={() => void pickFiles()}
				>
					Import files…
				</Button>
			</div>
			<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
				Paste markdown or pick <code style={{ fontFamily: T.mono }}>.md</code> / exported{' '}
				<code style={{ fontFamily: T.mono }}>.json</code> bundles — files land in the box below for
				review. Separate multiple notes with{' '}
				<code style={{ fontFamily: T.mono }}>===== path.md =====</code> headers.
			</div>
			<Textarea
				value={text}
				onChange={(e: { target: { value: string } }) => setText(e.target.value)}
				rows={8}
				placeholder={'===== Lore/The Pier.md =====\nBrackish water laps at rotting planks…'}
				style={{ fontFamily: T.mono, fontSize: 12.5 }}
			/>
			<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
				<Select
					aria-label="Import collision policy"
					options={IMPORT_POLICIES}
					value={policy}
					onChange={(e: { target: { value: string } }) => setPolicy(e.target.value)}
				/>
				<div style={{ flex: 1 }} />
				{message && <span style={{ font: `12px ${T.sans}`, color: T.sub }}>{message}</span>}
				<Button
					variant="primary"
					size="sm"
					icon="import"
					disabled={busy || !text.trim()}
					onClick={() => onImport(text, policy)}
				>
					Import
				</Button>
				<Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
					Close
				</Button>
			</div>
		</Card>
	);
}

export function Knowledge() {
	const runtime = useRuntime();
	const navigate = useNavigate();
	const location = useLocation();
	// URL-driven detail (`/knowledge/:id`) so Story thread cards, palette search hits, and
	// character-sheet mentions can open the exact note.
	const { id: detailId = null } = useParams<{ id: string }>();
	const actorId = runtime.defaultActorId;
	const canAuthor = actorCanAuthorContent(runtime.state.permissions, actorId);

	const notes = useMemo(
		() =>
			getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId).filter(
				(n) => n.kind === 'note',
			),
		[runtime.state, actorId],
	);

	const [composing, setComposing] = useState(false);
	const [importing, setImporting] = useState(false);
	const [showSources, setShowSources] = useState(false);
	const [busy, setBusy] = useState(false);
	const [importMsg, setImportMsg] = useState<string | null>(null);

	// Create-intent handoff from "New note" launchers elsewhere (home hub, ⌘K): open the composer
	// immediately instead of landing the user on the list with nothing happening.
	useEffect(() => {
		const intent = (location.state ?? null) as { create?: boolean } | null;
		if (intent?.create) {
			setComposing(true);
			setImporting(false);
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.state, location.pathname, navigate]);

	const open = detailId ? (notes.find((n) => n.id === detailId) ?? null) : null;
	// `key={open.id}` REMOUNTS the editor when navigating between notes (e.g. via a backlink/related
	// row), resetting the draft/edit state — without it React reuses the instance and a Save could
	// persist note A's draft into note B. Same-note re-renders keep the instance (id unchanged).
	if (open)
		return (
			<NoteViewer
				key={open.id}
				note={open}
				canAuthor={canAuthor}
				onBack={() => navigate('/knowledge')}
				onOpen={(id) => navigate(`/knowledge/${id}`)}
			/>
		);

	async function createNote(title: string) {
		setBusy(true);
		// content.create-item — vault-level authoring (DM only). Strict payload; visibility fails closed
		// to dm-only. The new id is read from the emitted `content.item-changed` event (demo-seed pattern).
		const result = await runtime.dispatch({
			type: 'content.create-item',
			actorId,
			payload: { kind: 'note', title, body: '', visibility: 'dm-only' },
		});
		setBusy(false);
		setComposing(false);
		if (result.status === 'accepted') {
			const created = result.events.find(
				(e) => (e as { kind?: string }).kind === 'content.item-changed',
			) as { itemId?: string } | undefined;
			if (created?.itemId) navigate(`/knowledge/${created.itemId}`);
		}
	}

	async function runImport(text: string, policy: string) {
		setBusy(true);
		setImportMsg(null);
		const files = parseArchive(text);
		// content.commit-import — transactional markdown-archive import (DM only). `appliedEntryIds: []`
		// means "apply every entry" (the field exists for resumed/selective imports).
		const result = await runtime.dispatch({
			type: 'content.commit-import',
			actorId,
			payload: { sourceKind: 'markdown-archive', policy, files, appliedEntryIds: [] },
		});
		setBusy(false);
		if (result.status === 'accepted') {
			const ev = result.events.find(
				(e) => (e as { kind?: string }).kind === 'content.import-committed',
			) as { createdItemIds?: string[]; overwrittenItemIds?: string[] } | undefined;
			const created = ev?.createdItemIds?.length ?? 0;
			const over = ev?.overwrittenItemIds?.length ?? 0;
			setImportMsg(`Imported ${created} new${over ? `, ${over} overwritten` : ''}.`);
		} else {
			setImportMsg(result.rejection.message);
		}
	}

	return (
		<Page max={1180}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'flex-end',
					flexWrap: 'wrap',
					gap: 12,
					marginBottom: 18,
				}}
			>
				{canAuthor && (
					<>
						{/* These three are disclosure toggles that mutually collapse each other, so each
						    needs aria-expanded — open state was otherwise invisible to assistive tech. */}
						<Button
							variant={showSources ? 'secondary' : 'ghost'}
							size="sm"
							icon="vault"
							aria-expanded={showSources}
							onClick={() => {
								setShowSources((v) => !v);
								setComposing(false);
								setImporting(false);
							}}
						>
							Sources
						</Button>
						<Button
							variant={importing ? 'secondary' : 'ghost'}
							size="sm"
							icon="import"
							aria-expanded={importing}
							onClick={() => {
								setImporting((v) => !v);
								setComposing(false);
								setShowSources(false);
							}}
						>
							Import vault
						</Button>
						<Button
							variant="primary"
							size="sm"
							icon="note-edit"
							aria-expanded={composing}
							onClick={() => {
								setComposing((v) => !v);
								setImporting(false);
								setShowSources(false);
							}}
						>
							New note
						</Button>
					</>
				)}
			</div>

			{canAuthor && composing && (
				<Composer busy={busy} onCreate={createNote} onCancel={() => setComposing(false)} />
			)}
			{canAuthor && importing && (
				<ImportPanel
					busy={busy}
					message={importMsg}
					onImport={runImport}
					onCancel={() => {
						setImporting(false);
						setImportMsg(null);
					}}
				/>
			)}
			{/* WS-7 — connected vault sources (local folder / Google Docs) pull+push panel. */}
			{canAuthor && showSources && <ConnectedSourcesPanel />}

			{notes.length === 0 ? (
				<EmptyState
					icon="knowledge-book"
					title="Nothing written down"
					description="Notes, handouts and read-aloud text live here. Backlinks connect them automatically."
					action={
						canAuthor ? (
							<Button
								variant="primary"
								size="sm"
								icon="note-edit"
								onClick={() => setComposing(true)}
							>
								New note
							</Button>
						) : undefined
					}
				/>
			) : (
				<div
					style={{
						display: 'grid',
						// A 320px phone has only 292px after the page gutters.  A fixed 300px
						// minimum track made every populated vault horizontally unreachable there.
						gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 300px),1fr))',
						gap: 14,
					}}
				>
					{notes.map((n) => (
						<Card
							key={n.id}
							elevation="flat"
							interactive
							onClick={() => navigate(`/knowledge/${n.id}`)}
						>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: 8,
									marginBottom: 7,
								}}
							>
								<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
									<Icon name="knowledge-book" size={15} color={T.acc} />
									<span style={{ font: `11px ${T.sans}`, color: T.ter }}>Note</span>
								</span>
								<VisibilityChip level={VIS_CHIP[n.visibility] || 'dm-only'} compact />
							</div>
							<div style={{ font: `600 14.5px ${T.sans}`, marginBottom: 5 }}>{n.title}</div>
							<div
								style={{
									font: `12.5px/1.55 ${T.sans}`,
									color: T.ter,
									display: '-webkit-box',
									WebkitLineClamp: 2,
									WebkitBoxOrient: 'vertical',
									overflow: 'hidden',
								}}
							>
								{snippetOf(n.body)}
							</div>
							<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 9 }}>
								updated {formatStamp(n.updatedAt)}
							</div>
						</Card>
					))}
				</div>
			)}
		</Page>
	);
}
