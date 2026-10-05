import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, Select, Skeleton, Textarea } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useSession } from '../../net/SessionContext';
import {
	addPrivateNote,
	listPrivateBookmarks,
	listPrivateImpressions,
	listPrivateNotes,
	markImpressionShared,
	putPrivateBookmark,
	putPrivateImpression,
	removePrivateBookmark,
	removePrivateImpression,
	removePrivateNote,
	type PrivateBookmarkRecord,
	type PrivateBookmarkTargetKind,
	type PrivateImpressionRecord,
	type PrivateNoteRecord,
} from '../../platform/storage/privateStore';
import { Panel, PLAYER_ACTOR_ID, type LiveData } from './shared';

import { PrivateDelete } from './PrivateDelete';
import { PrivatePanels, RecordList } from './PrivatePanels';

// --- RC-CHR-4.1 — the player-private half ---------------------------------------------------------

/** One bookmarkable thing the DM has shared with this player. */
interface BookmarkTarget {
	key: string;
	kind: PrivateBookmarkTargetKind;
	id: string;
	title: string;
}

const EMPTY_NOTE = { title: '', body: '' };
const EMPTY_IMPRESSION = { id: '', npcNoteId: '', npcName: '', body: '' };

/** Device-local records stay separate from core; sharing sends only the chosen impression. */
export function PrivateJournal({ data }: { data: LiveData }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const session = useSession();
	const characterId = data.pcId;

	const [notes, setNotes] = useState<PrivateNoteRecord[]>([]);
	const [bookmarks, setBookmarks] = useState<PrivateBookmarkRecord[]>([]);
	const [impressions, setImpressions] = useState<PrivateImpressionRecord[]>([]);
	const [writing, setWriting] = useState(false);
	const [noteDraft, setNoteDraft] = useState(EMPTY_NOTE);
	const [bookmarkDraft, setBookmarkDraft] = useState({ target: '', annotation: '' });
	const [impressionDraft, setImpressionDraft] = useState(EMPTY_IMPRESSION);
	const [status, setStatus] = useState('');
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const run = async (action: () => Promise<void>) => {
		if (busy) return;
		setBusy(true);
		setError(false);
		setStatus(t('play.polish.working'));
		try {
			await action();
		} catch {
			setError(true);
			setStatus(t('play.polish.saveError'));
		} finally {
			setBusy(false);
		}
	};

	const reload = useCallback(async (id: string) => {
		const [n, b, i] = await Promise.all([
			listPrivateNotes(id),
			listPrivateBookmarks(id),
			listPrivateImpressions(id),
		]);
		setNotes(n);
		setBookmarks(b);
		setImpressions(i);
	}, []);

	useEffect(() => {
		if (!characterId) {
			setNotes([]);
			setBookmarks([]);
			setImpressions([]);
			return;
		}
		let live = true;
		setLoading(true);
		setLoadError(false);
		void (async () => {
			try {
				const [n, b, i] = await Promise.all([
					listPrivateNotes(characterId),
					listPrivateBookmarks(characterId),
					listPrivateImpressions(characterId),
				]);
				if (!live) return;
				setNotes(n);
				setBookmarks(b);
				setImpressions(i);
			} catch {
				if (live) setLoadError(true);
			} finally {
				if (live) setLoading(false);
			}
		})();
		return () => {
			live = false;
		};
	}, [characterId, attempt]);

	// Everything the DM has shared with this player, as one flat pick-list for a bookmark.
	const targets = useMemo<BookmarkTarget[]>(() => {
		const rows: BookmarkTarget[] = [];
		for (const entry of data.journal)
			rows.push({
				key: `journal-entry:${entry.id}`,
				kind: 'journal-entry',
				id: entry.id,
				title: entry.title,
			});
		for (const handout of data.handouts)
			rows.push({
				key: `handout:${handout.id}`,
				kind: 'handout',
				id: handout.id,
				title: handout.title,
			});
		for (const push of data.sceneHistory)
			rows.push({
				key: `scene:${push.card.id}`,
				kind: 'scene',
				id: push.card.id,
				title: push.card.title,
			});
		return rows;
	}, [data.journal, data.handouts, data.sceneHistory]);

	// Shared notes are the honest source of "an NPC you have actually met" on a player device: the
	// bestiary is DM-only, so the roster never reaches this seat.
	const npcNotes = data.handouts;

	if (!characterId) {
		return (
			<PrivatePanels
				heading={t('play.journal.private.heading')}
				sub={t('play.journal.private.sub')}
			>
				<Panel>
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{t('play.journal.private.locked')}
					</div>
				</Panel>
			</PrivatePanels>
		);
	}
	if (loading || loadError)
		return (
			<PrivatePanels
				heading={t('play.journal.private.heading')}
				sub={t('play.journal.private.sub')}
			>
				{loading ? (
					<>
						<p role="status">{t('play.polish.loading')}</p>
						<Skeleton variant="list" rows={3} />
					</>
				) : (
					<>
						<p role="alert">{t('play.polish.storeError')}</p>
						<Button onClick={() => setAttempt((a) => a + 1)}>{t('play.polish.retry')}</Button>
					</>
				)}
			</PrivatePanels>
		);
	const id = characterId;

	const saveNote = async () => {
		if (!noteDraft.title.trim()) return;
		await addPrivateNote(id, noteDraft);
		setNoteDraft(EMPTY_NOTE);
		setStatus(t('play.journal.private.savedLocally'));
		await reload(id);
	};

	const saveBookmark = async () => {
		const target = targets.find((row) => row.key === bookmarkDraft.target);
		if (!target) return;
		await putPrivateBookmark(id, {
			targetKind: target.kind,
			targetId: target.id,
			targetTitle: target.title,
			annotation: bookmarkDraft.annotation,
		});
		setBookmarkDraft({ target: '', annotation: '' });
		setStatus(t('play.journal.private.savedLocally'));
		await reload(id);
	};

	const saveImpression = async () => {
		if (!impressionDraft.npcName.trim()) return;
		await putPrivateImpression(id, {
			...(impressionDraft.id ? { id: impressionDraft.id } : {}),
			npcNoteId: impressionDraft.npcNoteId || null,
			npcName: impressionDraft.npcName,
			body: impressionDraft.body,
		});
		setImpressionDraft(EMPTY_IMPRESSION);
		setStatus(t('play.journal.private.savedLocally'));
		await reload(id);
	};

	/**
	 * Share exactly ONE impression. Joined devices send a command request the host authorises;
	 * a solo/preview device dispatches locally as the player actor. The local `sharedAt` stamp is
	 * written only after the table accepted, so a declined share never reads as delivered.
	 */
	const shareImpression = async (impression: PrivateImpressionRecord) => {
		const payload = {
			characterId: id,
			kind: 'npc-impression' as const,
			title: impression.npcName,
			body: impression.body,
			visibility: 'shared' as const,
			sharedWith: [] as string[],
		};
		const viewer =
			session.role === 'joined'
				? (session.client?.identity?.actorId ?? PLAYER_ACTOR_ID)
				: PLAYER_ACTOR_ID;
		let ok: boolean;
		let reason: string;
		if (session.role === 'joined') {
			const ack = await session.requestCommand({ type: 'character.add-journal-entry', payload });
			ok = ack.ok;
			reason = ack.message ?? '';
		} else {
			const result = await runtime.dispatch({
				type: 'character.add-journal-entry',
				actorId: viewer,
				payload,
			});
			ok = result.status === 'accepted';
			reason = result.status === 'rejected' ? result.rejection.message : '';
		}
		if (!ok) {
			setError(true);
			setStatus(t('play.journal.private.shareDeclined', { reason }));
			return;
		}
		await markImpressionShared(id, impression.id);
		setStatus(t('play.journal.private.shareSent', { name: impression.npcName }));
		await reload(id);
	};

	const targetKindLabel = (kind: PrivateBookmarkTargetKind): string =>
		kind === 'handout'
			? t('play.journal.private.targetHandout')
			: kind === 'scene'
				? t('play.journal.private.targetScene')
				: t('play.journal.private.targetJournal');
	const writeToggle = {
		'aria-expanded': writing,
		'aria-controls': 'private-note-editor',
		onClick: () => setWriting(!writing),
	};

	return (
		<PrivatePanels heading={t('play.journal.private.heading')} sub={t('play.journal.private.sub')}>
			<div
				data-testid="private-journal-status"
				role={error ? 'alert' : 'status'}
				aria-live={error ? 'assertive' : 'polite'}
				style={{ font: `12px ${T.sans}`, color: T.sub }}
			>
				{status}
			</div>

			<fieldset
				disabled={busy}
				style={{
					border: 0,
					padding: T.space.zero,
					margin: T.space.zero,
					minWidth: 0,
					display: 'grid',
					gap: T.space.four,
				}}
			>
				<Panel title={t('play.journal.private.notes', { count: notes.length })}>
					{/* One primary at a time: Write a note while collapsed, Save once the editor is open.
					    Both branches lead with the toggle, so React keeps that button (and its focus). */}
					{writing ? (
						<>
							<Button variant="secondary" {...writeToggle}>
								{t('play.journal.private.writeNote')}
							</Button>
							<div
								id="private-note-editor"
								style={{ display: 'grid', gap: T.space.two }}
								data-testid="private-note-form"
							>
								<Field label={t('play.journal.private.noteTitle')}>
									<Input
										value={noteDraft.title}
										onChange={(e: { target: { value: string } }) =>
											setNoteDraft((d) => ({ ...d, title: e.target.value }))
										}
									/>
								</Field>
								<Field label={t('play.journal.private.noteBody')}>
									<Textarea
										rows={3}
										value={noteDraft.body}
										onChange={(e: { target: { value: string } }) =>
											setNoteDraft((d) => ({ ...d, body: e.target.value }))
										}
									/>
								</Field>
								<div>
									<Button
										variant="primary"
										icon="add"
										disabled={!noteDraft.title.trim()}
										onClick={() => run(saveNote)}
									>
										{t('play.journal.private.saveNote')}
									</Button>
								</div>
							</div>
						</>
					) : (
						<>
							<Button variant="primary" {...writeToggle}>
								{t('play.journal.private.writeNote')}
							</Button>
						</>
					)}
					<RecordList
						empty={t('play.journal.private.notesEmpty')}
						rows={notes.map((note) => ({
							id: note.id,
							title: note.title,
							body: note.body,
							testId: 'private-note',
							actions: (
								<PrivateDelete
									name={note.title}
									label={t('play.journal.private.deleteNote', { title: note.title })}
									remove={async () => {
										await removePrivateNote(id, note.id);
										await reload(id);
										setStatus(t('play.polish.deleted'));
									}}
								/>
							),
						}))}
					/>
				</Panel>

				<details>
					<summary>{t('play.journal.private.bookmarks', { count: bookmarks.length })}</summary>
					<Panel>
						{targets.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
								{t('play.journal.private.noTargets')}
							</div>
						) : (
							<div
								style={{ display: 'grid', gap: T.space.two }}
								data-testid="private-bookmark-form"
							>
								<Field label={t('play.journal.private.bookmarkTarget')}>
									<Select
										value={bookmarkDraft.target}
										options={[
											{ value: '', label: '—' },
											...targets.map((row) => ({
												value: row.key,
												label: `${targetKindLabel(row.kind)} · ${row.title}`,
											})),
										]}
										onChange={(e: { target: { value: string } }) =>
											setBookmarkDraft((d) => ({ ...d, target: e.target.value }))
										}
									/>
								</Field>
								<Field label={t('play.journal.private.annotation')}>
									<Textarea
										rows={2}
										value={bookmarkDraft.annotation}
										onChange={(e: { target: { value: string } }) =>
											setBookmarkDraft((d) => ({ ...d, annotation: e.target.value }))
										}
									/>
								</Field>
								<div>
									<Button
										variant="secondary"
										icon="pin"
										disabled={!bookmarkDraft.target}
										onClick={() => run(saveBookmark)}
									>
										{t('play.journal.private.saveBookmark')}
									</Button>
								</div>
							</div>
						)}
						<RecordList
							empty={t('play.journal.private.bookmarksEmpty')}
							rows={bookmarks.map((bookmark) => ({
								id: bookmark.id,
								title: bookmark.targetTitle,
								body: bookmark.annotation,
								testId: 'private-bookmark',
								badge: targetKindLabel(bookmark.targetKind),
								actions: (
									<PrivateDelete
										name={bookmark.targetTitle}
										label={t('play.journal.private.removeBookmark', {
											title: bookmark.targetTitle,
										})}
										remove={async () => {
											await removePrivateBookmark(id, bookmark.id);
											await reload(id);
											setStatus(t('play.polish.deleted'));
										}}
									/>
								),
							}))}
						/>
					</Panel>
				</details>

				<details>
					<summary>{t('play.journal.private.impressions', { count: impressions.length })}</summary>
					<Panel>
						<div
							style={{ display: 'grid', gap: T.space.two }}
							data-testid="private-impression-form"
						>
							<Field label={t('play.journal.private.impressionWho')}>
								<Input
									value={impressionDraft.npcName}
									onChange={(e: { target: { value: string } }) =>
										setImpressionDraft((d) => ({ ...d, npcName: e.target.value }))
									}
								/>
							</Field>
							<Field label={t('play.journal.private.impressionNote')}>
								<Select
									value={impressionDraft.npcNoteId}
									options={[
										{ value: '', label: t('play.journal.private.impressionNoteNone') },
										...npcNotes.map((note) => ({ value: note.id, label: note.title })),
									]}
									onChange={(e: { target: { value: string } }) =>
										setImpressionDraft((d) => ({ ...d, npcNoteId: e.target.value }))
									}
								/>
							</Field>
							<Field label={t('play.journal.private.impressionBody')}>
								<Textarea
									rows={2}
									value={impressionDraft.body}
									onChange={(e: { target: { value: string } }) =>
										setImpressionDraft((d) => ({ ...d, body: e.target.value }))
									}
								/>
							</Field>
							<div>
								<Button
									variant="secondary"
									icon="add"
									disabled={!impressionDraft.npcName.trim()}
									onClick={() => run(saveImpression)}
								>
									{t('play.journal.private.saveImpression')}
								</Button>
							</div>
						</div>
						<RecordList
							empty={t('play.journal.private.impressionsEmpty')}
							rows={impressions.map((impression) => ({
								id: impression.id,
								title: impression.npcName,
								body: impression.body,
								testId: 'private-impression',
								badge: impression.sharedAt ? t('play.journal.private.sharedBadge') : undefined,
								badgeStatus: 'success' as const,
								actions: (
									<span
										style={{ display: 'inline-flex', gap: T.space.oneHalf, alignItems: 'center' }}
									>
										<Button
											size="sm"
											icon="send"
											aria-label={t('play.journal.private.shareOne', { name: impression.npcName })}
											onClick={() => run(() => shareImpression(impression))}
										>
											{t('play.journal.private.share')}
										</Button>
										<PrivateDelete
											name={impression.npcName}
											label={t('play.journal.private.deleteImpression', {
												name: impression.npcName,
											})}
											remove={async () => {
												await removePrivateImpression(id, impression.id);
												await reload(id);
												setStatus(t('play.polish.deleted'));
											}}
										/>
									</span>
								),
							}))}
						/>
					</Panel>
				</details>
			</fieldset>
		</PrivatePanels>
	);
}
