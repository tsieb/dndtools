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
import { VIS_CHIP, visibilityOptions } from './shared';
import { useI18n } from '../../i18n';
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
	const { t, formatDate } = useI18n();
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
			setErr(t('knowledge.needsTitle'));
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
			setErr(error instanceof Error ? error.message : t('knowledge.saveFailed'));
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
					t(visibility === 'dm-only' ? 'knowledge.nowHidden' : 'knowledge.nowVisible', {
						title: note.title,
					}),
				);
		} catch (error) {
			setErr(error instanceof Error ? error.message : t('knowledge.changeFailed'));
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
				Toaster.success(t('knowledge.deleted', { title }), {
					action: t('common.action.undo'),
					onAction: () => {
						void runtime
							.dispatch({ type: 'content.restore-item', actorId, payload: { itemId } })
							.then((restored) => {
								if (restored.status === 'accepted')
									Toaster.success(t('knowledge.restored', { title }));
								else Toaster.error(restored.rejection.message ?? t('knowledge.restoreFailed'));
							});
					},
				});
				onBack();
			} else setErr(result.rejection.message);
		} catch (error) {
			setErr(error instanceof Error ? error.message : t('knowledge.deleteFailed'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Page max={1080}>
			<BackBar label={t('knowledge.notes')} onClick={onBack} />
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
							{t('knowledge.noteUpdated', {
								when: formatStamp(note.updatedAt, formatDate),
							})}
						</span>
						<div style={{ flex: 1 }} />
						{canAuthor && !editing && (
							<>
								<IconButton
									icon="note-edit"
									label={t('common.action.edit')}
									variant="ghost"
									size="sm"
									onClick={startEdit}
								/>
								{note.visibility !== 'player-visible' && (
									<IconButton
										icon="send"
										label={t('knowledge.push')}
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
								aria-label={t('knowledge.noteTitle')}
								onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
								placeholder={t('knowledge.noteTitle')}
							/>
							<Textarea
								value={body}
								aria-label={t('knowledge.noteBody')}
								onChange={(e: { target: { value: string } }) => setBody(e.target.value)}
								rows={18}
								placeholder={t('knowledge.notePlaceholder')}
								style={{ fontFamily: T.mono, fontSize: 13, lineHeight: 1.6 }}
							/>
							<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
								{t('knowledge.markdownHint')}
							</div>
							{err && (
								<span role="alert" style={{ font: `12px ${T.sans}`, color: T.err }}>
									{err}
								</span>
							)}
							<div style={{ display: 'flex', gap: 8 }}>
								<Button variant="primary" size="sm" icon="check" disabled={busy} onClick={save}>
									{t('knowledge.saveNote')}
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
									{t('common.action.cancel')}
								</Button>
								<div style={{ flex: 1 }} />
								{canAuthor && (
									// A ghost button in the same row as Cancel: the destructive action looked
									// identical to the harmless one. (Soft delete with Undo, so no confirm.)
									<Button variant="danger" size="sm" icon="delete" disabled={busy} onClick={remove}>
										{t('common.action.delete')}
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
							<div>{mdToNodes(note.body, t, resolveLink)}</div>
						</>
					)}
				</Panel>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel title={t('knowledge.sharing')}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							<VisibilityChip level={VIS_CHIP[note.visibility] || 'dm-only'} />
							<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
								{t(
									note.visibility === 'dm-only'
										? 'knowledge.onlyYou'
										: 'knowledge.visibleToPlayers',
								)}
							</span>
						</div>
						{canAuthor ? (
							<>
								<Seg
									ariaLabel={t('knowledge.noteVisibility')}
									options={visibilityOptions(t)}
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
										{t('knowledge.push')}
									</Button>
								)}
							</>
						) : (
							<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
								{t('knowledge.sharedByDm')}
							</span>
						)}
						{/* no core command — real-time multi-user editing PRESENCE (the prototype's live-collab
						    panel) is not modeled by the Processing Core; this panel surfaces the real,
						    backed visibility/sharing controls instead of a faked presence list. */}
					</Panel>

					<Panel title={t('knowledge.backlinks')}>
						{rel.backlinks.length === 0 ? (
							<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
								{t('knowledge.noBacklinks')}
							</span>
						) : (
							rel.backlinks.map((b) => (
								<RelRow
									key={b.sourceId}
									icon="link"
									title={b.sourceTitle}
									kind={t('knowledge.note')}
									onClick={() => onOpen(b.sourceId)}
								/>
							))
						)}
					</Panel>

					<Panel title={t('knowledge.related')}>
						{rel.related.length === 0 ? (
							<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
								{t('knowledge.noRelated')}
							</span>
						) : (
							rel.related.map((r) => (
								<RelRow
									key={r.relatedId}
									icon="knowledge-book"
									title={r.relatedTitle}
									kind={t('knowledge.note')}
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
				title={t('knowledge.revealTitle', { title: note.title })}
				description={t('knowledge.revealBody')}
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
							{t('knowledge.keepDmOnly')}
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
							{t(pendingReveal === 'shared' ? 'knowledge.share' : 'knowledge.push')}
						</Button>
					</>
				}
			/>
		</Page>
	);
}
