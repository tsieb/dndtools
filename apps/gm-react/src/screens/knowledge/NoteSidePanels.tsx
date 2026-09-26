import { useMemo, useState } from 'react';
import {
	getContentHistoryForActor,
	type ContentItemView,
	type getNoteRelationshipsForActor,
} from '@dndtools/core';
import { Button, Icon, VisibilityChip } from '../../ds';
import { Panel, Seg, T } from '../../app/screen-kit';
import { RestoreNoteRevision } from '../../app/editor/RestoreNoteRevision';
import type { NoteEditorProps } from '../../app/editor/NoteEditor';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import { META, PANEL_TITLE, VIS_CHIP, visibilityOptions } from './shared';

/*
 * The note viewer's supporting column: sharing, history, backlinks and related notes. Split out of
 * NoteViewer.tsx (RC-POL-1.11) so the viewer keeps the reading panel and its writes. These panels are
 * flat supporting tiles beside the raised note panel; none of them writes except through the
 * callbacks the viewer hands in, which all go through `runtime.dispatch`.
 */

type Relationships = ReturnType<typeof getNoteRelationshipsForActor>;

/** A backlink or related-note row. Clickable rows read as links: accent text, underline on hover. */
function RelRow({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
	const [hov, setHov] = useState(false);
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: T.space.two,
				minHeight: T.density.touch,
				padding: `${T.space.oneHalf} ${T.space.zero}`,
				width: '100%',
				border: 'none',
				background: 'transparent',
				textAlign: 'left',
				cursor: 'pointer',
				font: `var(--text-sm) ${T.sans}`,
				color: T.acc,
			}}
		>
			<Icon name={icon} size="micro" color={T.ter} />
			<span
				style={{
					flex: 1,
					minWidth: 0,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					textDecoration: hov ? 'underline' : 'none',
				}}
			>
				{title}
			</span>
		</button>
	);
}

export function SharingPanel({
	note,
	canAuthor,
	busy,
	onSetVisibility,
}: {
	note: ContentItemView;
	canAuthor: boolean;
	busy: boolean;
	onSetVisibility: (visibility: string) => void;
}) {
	const { t } = useI18n();
	return (
		<Panel title={<span style={PANEL_TITLE}>{t('knowledge.sharing')}</span>}>
			<div style={{ display: 'flex', alignItems: 'center', gap: T.space.two, flexWrap: 'wrap' }}>
				<VisibilityChip level={VIS_CHIP[note.visibility] || 'dm-only'} />
				<span style={META}>
					{t(note.visibility === 'dm-only' ? 'knowledge.onlyYou' : 'knowledge.visibleToPlayers')}
				</span>
			</div>
			{canAuthor ? (
				<>
					<Seg
						ariaLabel={t('knowledge.noteVisibility')}
						options={visibilityOptions(t)}
						value={note.visibility}
						onChange={onSetVisibility}
					/>
					{note.visibility !== 'player-visible' && (
						<Button
							variant="secondary"
							size="sm"
							icon="send"
							disabled={busy}
							onClick={() => onSetVisibility('player-visible')}
							style={{ width: '100%' }}
						>
							{t('knowledge.push')}
						</Button>
					)}
				</>
			) : (
				<span style={META}>{t('knowledge.sharedByDm')}</span>
			)}
			{/* no core command — real-time multi-user editing PRESENCE (the prototype's live-collab
			    panel) is not modeled by the Processing Core; this panel surfaces the real, backed
			    visibility/sharing controls instead of a faked presence list. */}
		</Panel>
	);
}

/**
 * The note's recorded revisions (RC-KNW-5.2), read through the actor-filtered history query. Each row
 * names who made the change by their display name, never the raw actor id. Restore is a new revision
 * written through the editor's conflict-aware save.
 */
export function HistoryPanel({
	note,
	canAuthor,
	busy,
	onSave,
}: {
	note: ContentItemView;
	canAuthor: boolean;
	/** True while another write (or the open editor) owns the note. */
	busy: boolean;
	onSave: NoteEditorProps['onSave'];
}) {
	const { t, formatDate } = useI18n();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [open, setOpen] = useState(false);
	const history = useMemo(
		() =>
			open
				? getContentHistoryForActor(
						runtime.state.content,
						runtime.state.permissions,
						runtime.state.sync,
						actorId,
						note.id,
						new Date().toISOString(),
					)
				: [],
		[open, runtime.state, actorId, note.id],
	);
	const actorName = (id: string) => runtime.state.permissions.actors[id]?.displayName ?? id;

	return (
		<Panel title={<span style={PANEL_TITLE}>{t('knowledge.history')}</span>}>
			<div>
				<Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
					{t(open ? 'knowledge.historyHide' : 'knowledge.historyShow')}
				</Button>
			</div>
			{open && (
				<>
					<p style={{ ...META, margin: T.space.zero }}>{t('knowledge.historyLimit')}</p>
					{history.length === 0 && (
						<p style={{ ...META, margin: T.space.zero }}>{t('knowledge.historyEmpty')}</p>
					)}
					<ol
						aria-label={t('knowledge.history')}
						style={{
							listStyle: 'none',
							margin: T.space.zero,
							padding: T.space.zero,
							display: 'grid',
							gap: T.space.three,
						}}
					>
						{history.map((entry) => (
							<li
								key={entry.revision}
								style={{
									display: 'grid',
									gap: T.space.one,
									paddingTop: T.space.three,
									borderTop: `1px solid ${T.bd}`,
								}}
							>
								<span style={{ font: `600 var(--text-sm) ${T.sans}`, color: T.ink }}>
									{t(
										entry.revision === note.revision
											? 'knowledge.historyCurrent'
											: 'knowledge.historyRevision',
										{ revision: entry.revision },
									)}
								</span>
								<span style={META}>
									<time dateTime={entry.issuedAt}>
										{formatDate(new Date(entry.issuedAt), {
											dateStyle: 'medium',
											timeStyle: 'short',
										})}
									</time>
									{' · '}
									{actorName(entry.actorId)}
								</span>
								<span style={{ ...META, fontFamily: T.mono }}>
									{t('knowledge.historyDelta', {
										added: entry.lineDelta.added,
										removed: entry.lineDelta.removed,
									})}
								</span>
								{canAuthor && entry.revision !== note.revision && (
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: T.space.two,
											flexWrap: 'wrap',
										}}
									>
										<RestoreNoteRevision
											snapshot={entry}
											revision={note.revision}
											label={t('knowledge.historyRestoreRevision', { revision: entry.revision })}
											busy={busy}
											onSave={onSave}
										/>
									</div>
								)}
							</li>
						))}
					</ol>
				</>
			)}
		</Panel>
	);
}

/** Backlinks and related notes, both from the actor-filtered relationship graph. */
export function LinkPanels({ rel, onOpen }: { rel: Relationships; onOpen: (id: string) => void }) {
	const { t } = useI18n();
	return (
		<>
			<Panel title={<span style={PANEL_TITLE}>{t('knowledge.backlinks')}</span>}>
				{rel.backlinks.length === 0 ? (
					<span style={META}>{t('knowledge.noBacklinks')}</span>
				) : (
					rel.backlinks.map((b) => (
						<RelRow
							key={b.sourceId}
							icon="link"
							title={b.sourceTitle}
							onClick={() => onOpen(b.sourceId)}
						/>
					))
				)}
			</Panel>
			<Panel title={<span style={PANEL_TITLE}>{t('knowledge.related')}</span>}>
				{rel.related.length === 0 ? (
					<span style={META}>{t('knowledge.noRelated')}</span>
				) : (
					rel.related.map((r) => (
						<RelRow
							key={r.relatedId}
							icon="knowledge-book"
							title={r.relatedTitle}
							onClick={() => onOpen(r.relatedId)}
						/>
					))
				)}
			</Panel>
		</>
	);
}
