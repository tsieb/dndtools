import { useMemo, useState } from 'react';
import {
	getNoteRelationshipsForActor,
	resolveWikilinkForActor,
	type ContentItemView,
} from '@dndtools/core';
import {
	Button,
	Dialog,
	Icon,
	IconButton,
	Input,
	Textarea,
	Toaster,
	VisibilityChip,
} from '../../ds';
import { BackBar, Page, Panel, Seg, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { VIS_CHIP, VIS_OPTIONS } from './shared';
import { formatStamp, mdToNodes, parseWikilink } from './markdown';

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

export function NoteViewer({
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
	// Widening DM-only content to players is the one visibility move you cannot take back — players
	// may read it the instant it lands — so it stages here and waits for an explicit confirm.
	const [pendingReveal, setPendingReveal] = useState<string | null>(null);

	// CONTENT-006: resolve through the core's ACTOR-FILTERED candidate index, so a wikilink can never
	// open — or even reveal the existence of — a note this actor is not allowed to see.
	const resolveLink = (raw: string): (() => void) | null => {
		const { target, section } = parseWikilink(raw);
		if (!target) return null;
		const res = resolveWikilinkForActor(runtime.state.content, runtime.state.permissions, actorId, {
			target,
			section,
		});
		if (res.status !== 'resolved' || res.targetId === note.id) return null;
		return () => onOpen(res.targetId);
	};

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
		// Clear the previous attempt's message FIRST. Without this a successful save carried the old
		// rejection into view mode, where the note then read as "failed" even though it had been
		// written — the message only looked harmless before because view mode rendered it below the
		// whole note body, out of sight.
		setErr(null);
		if (!title.trim()) {
			setErr('A note needs a title.');
			return;
		}
		setBusy(true);
		// try/finally, not a bare pair of setBusy calls: SceneRuntime.dispatchNow RETHROWS after a
		// failed persist, so a throw here left `busy` true forever — and Save, Cancel AND Delete are
		// all `disabled={busy}`, so the editor became an unrecoverable dead end still holding the
		// DM's typed draft. Same shape as Atlas's `run()`.
		try {
			// content.update-item — the authorized-editor write. Strict payload: itemId/title/body only
			// (visibility is a SEPARATE command; baseRevision omitted exactly as NotesWorkbench does).
			const result = await runtime.dispatch({
				type: 'content.update-item',
				actorId,
				payload: { itemId: note.id, title, body },
			});
			if (result.status === 'accepted') setEditing(false);
			else setErr(result.rejection.message);
		} catch (error) {
			setErr(error instanceof Error ? error.message : 'The note couldn’t be saved — try again.');
		} finally {
			setBusy(false);
		}
	}

	async function setVisibility(visibility: string) {
		// All three entry points (the send IconButton, the "Push to players" Button and the visibility
		// Seg) funnel through here, so gating the reveal direction once covers every one of them.
		if (visibility !== 'dm-only' && note.visibility === 'dm-only') {
			setPendingReveal(visibility);
			return;
		}
		await applyVisibility(visibility);
	}

	async function applyVisibility(visibility: string) {
		setErr(null);
		setBusy(true);
		try {
			// content.set-item-visibility — the cross-surface invalidation trigger. "Push to players" is the
			// same command with `player-visible`.
			const result = await runtime.dispatch({
				type: 'content.set-item-visibility',
				actorId,
				payload: { itemId: note.id, visibility },
			});
			if (result.status !== 'accepted') setErr(result.rejection.message);
			// Success was completely silent: the only change is a chip's colour, and BOTH entry points
			// for this action are conditional on the visibility it just set — so they unmount and the
			// Dialog restores focus to a control that no longer exists. The toast is the app's
			// permanent polite live region, so this is the one announcement that reliably lands.
			else
				Toaster.success(
					visibility === 'dm-only'
						? `“${note.title}” is hidden from players again`
						: `“${note.title}” is now visible to players`,
				);
		} catch (error) {
			setErr(error instanceof Error ? error.message : 'The change couldn’t be saved — try again.');
		} finally {
			setBusy(false);
		}
	}

	async function remove() {
		setErr(null);
		setBusy(true);
		try {
			// content.remove-item — recoverable soft-delete (the item leaves every actor-filtered read),
			// so Delete acts immediately and the toast's Undo dispatches the counterpart
			// content.restore-item (same delete→undo pattern as ScenesCreator).
			const result = await runtime.dispatch({
				type: 'content.remove-item',
				actorId,
				payload: { itemId: note.id },
			});
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
		} catch (error) {
			setErr(error instanceof Error ? error.message : 'The note couldn’t be deleted — try again.');
		} finally {
			setBusy(false);
		}
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
							{err && (
								<span role="alert" style={{ font: `12px ${T.sans}`, color: T.err }}>
									{err}
								</span>
							)}
							<div style={{ display: 'flex', gap: 8 }}>
								<Button variant="primary" size="sm" icon="check" disabled={busy} onClick={save}>
									Save note
								</Button>
								{/* Clearing `err` is not cosmetic: view mode renders the SAME state in its own
								    role=alert above the body, so cancelling out of a failed save left a
								    note that plainly has a title announced as "A note needs a title." */}
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => {
										setErr(null);
										setEditing(false);
									}}
								>
									Cancel
								</Button>
								<div style={{ flex: 1 }} />
								{canAuthor && (
									// A ghost button in the same row as Cancel: the destructive action looked
									// identical to the harmless one. (Soft delete with Undo, so no confirm.)
									<Button variant="danger" size="sm" icon="delete" disabled={busy} onClick={remove}>
										Delete
									</Button>
								)}
							</div>
						</div>
					) : (
						<>
							<h2 style={{ font: `700 22px ${T.disp}`, margin: '0 0 12px' }}>{note.title}</h2>
							{/* ABOVE the body, not below it: the actions that set `err` (Push to players,
							    Delete) live in the header, and a note body is arbitrarily long — an error
							    after it sat below the fold, so a rejected push looked like a successful
							    one. role=alert because nothing else announces the rejection. */}
							{err && (
								<div
									role="alert"
									style={{ marginBottom: 10, font: `12px ${T.sans}`, color: T.err }}
								>
									{err}
								</div>
							)}
							<div>{mdToNodes(note.body, resolveLink)}</div>
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
								<Seg
									ariaLabel="Note visibility"
									options={VIS_OPTIONS}
									value={note.visibility}
									onChange={setVisibility}
								/>
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

			<Dialog
				open={!!pendingReveal}
				onClose={() => setPendingReveal(null)}
				title={`Show “${note.title}” to players?`}
				description="Players can read this note from the moment you share it. Hiding it again later does not un-read what they have already seen."
				icon="send"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setPendingReveal(null)}
						>
							Keep DM only
						</Button>
						<Button
							variant="primary"
							size="sm"
							icon="send"
							disabled={busy}
							onClick={() => {
								const next = pendingReveal;
								setPendingReveal(null);
								if (next) void applyVisibility(next);
							}}
						>
							{pendingReveal === 'shared' ? 'Share' : 'Push to players'}
						</Button>
					</>
				}
			/>
		</Page>
	);
}
