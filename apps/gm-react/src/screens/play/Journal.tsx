import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Field, Icon, IconButton, Input, Select, Textarea } from '../../ds';
import { T } from '../../app/screen-kit';
import { moodTheme } from '../../app/sceneCardMood';
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
import { Panel, PLAYER_ACTOR_ID, PvPage, SectionHead, type LiveData } from './shared';

// 6 · JOURNAL — the entries the DM has shared with this player, and (RC-CHR-4.1) the player's own
// private notes, which live in a separate device-local database and never reach the table.
export function JournalSection({ data }: { data: LiveData }) {
	const { t } = useI18n();
	return (
		<PvPage max={1080}>
			<SectionHead title={t('play.journal.title')} sub={t('play.journal.sub')} />
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: '10px 14px',
					borderRadius: 10,
					background: 'var(--color-dm-only-subtle)',
					border: `1px solid var(--color-dm-only-badge)`,
					marginBottom: 18,
				}}
			>
				<Icon name="hidden" size={16} color="var(--color-dm-only-badge)" />
				<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
					{t('play.journal.privateNote')}
				</span>
			</div>
			<Panel title={t('play.journal.sharedEntries', { count: data.journal.length })}>
				{data.journal.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('play.journal.empty')}</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{data.journal.map((e, i) => (
							<div
								key={e.id}
								style={{ padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
									<span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{e.title}</span>
									<Badge status="neutral">{e.kind}</Badge>
								</div>
								{e.body && <div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>{e.body}</div>}
							</div>
						))}
					</div>
				)}
			</Panel>
			{/* I11 S11.2.4 — the reviewable SCENE HISTORY: player-visible scene cards the DM has pushed. */}
			<div style={{ marginTop: 18 }} />
			<Panel title={t('play.journal.sceneHistory', { count: data.sceneHistory.length })}>
				{data.sceneHistory.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('play.journal.noScenes')}</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{[...data.sceneHistory].reverse().map((row, i) => {
							const theme = moodTheme(row.card.mood);
							return (
								<div
									key={row.id}
									style={{
										display: 'flex',
										alignItems: 'flex-start',
										gap: 10,
										padding: '10px 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
									}}
								>
									<span
										style={{
											width: 10,
											height: 10,
											marginTop: 4,
											borderRadius: '50%',
											flex: '0 0 auto',
											background: theme.accent,
										}}
									/>
									<div style={{ minWidth: 0, flex: 1 }}>
										<div style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{row.card.title}</div>
										{row.card.flavorText && (
											<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
												{row.card.flavorText}
											</div>
										)}
									</div>
									<span style={{ flex: '0 0 auto' }}>
										<Badge status="neutral">{theme.label}</Badge>
									</span>
								</div>
							);
						})}
					</div>
				)}
			</Panel>
			<PrivateJournal data={data} />
		</PvPage>
	);
}

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

/**
 * The private journal: notes nobody else can read, private annotations on shared material, and NPC
 * impressions the player may choose — one at a time — to hand the DM.
 *
 * The records live in `platform/storage/privateStore` (ADR-035): a device-local Dexie database per
 * character, never replicated, never in a backup, never in an MCP read. The ONLY thing that ever
 * crosses to the table is a single impression the player explicitly shares, and it crosses as a
 * `character.add-journal-entry` command request like any other player write — the DM's authority
 * decides, exactly as guardrail 8 requires.
 *
 * Reads its own session/runtime rather than taking props, so the shared `Frame.tsx` router is
 * untouched.
 */
function PrivateJournal({ data }: { data: LiveData }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const session = useSession();
	const characterId = data.pcId;

	const [notes, setNotes] = useState<PrivateNoteRecord[]>([]);
	const [bookmarks, setBookmarks] = useState<PrivateBookmarkRecord[]>([]);
	const [impressions, setImpressions] = useState<PrivateImpressionRecord[]>([]);
	const [noteDraft, setNoteDraft] = useState(EMPTY_NOTE);
	const [bookmarkDraft, setBookmarkDraft] = useState({ target: '', annotation: '' });
	const [impressionDraft, setImpressionDraft] = useState(EMPTY_IMPRESSION);
	const [status, setStatus] = useState('');

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
		void (async () => {
			const [n, b, i] = await Promise.all([
				listPrivateNotes(characterId),
				listPrivateBookmarks(characterId),
				listPrivateImpressions(characterId),
			]);
			if (!live) return;
			setNotes(n);
			setBookmarks(b);
			setImpressions(i);
		})();
		return () => {
			live = false;
		};
	}, [characterId]);

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

	return (
		<PrivatePanels heading={t('play.journal.private.heading')} sub={t('play.journal.private.sub')}>
			<div
				data-testid="private-journal-status"
				role="status"
				aria-live="polite"
				style={{ font: `12px ${T.sans}`, color: T.sub }}
			>
				{status}
			</div>

			<Panel title={t('play.journal.private.notes', { count: notes.length })}>
				<div style={{ display: 'grid', gap: 10 }} data-testid="private-note-form">
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
						<Button variant="primary" icon="add" onClick={saveNote}>
							{t('play.journal.private.saveNote')}
						</Button>
					</div>
				</div>
				<RecordList
					empty={t('play.journal.private.notesEmpty')}
					rows={notes.map((note) => ({
						id: note.id,
						title: note.title,
						body: note.body,
						testId: 'private-note',
						actions: (
							<IconButton
								icon="delete"
								size="sm"
								label={t('play.journal.private.deleteNote', { title: note.title })}
								onClick={async () => {
									await removePrivateNote(id, note.id);
									await reload(id);
								}}
							/>
						),
					}))}
				/>
			</Panel>

			<Panel title={t('play.journal.private.bookmarks', { count: bookmarks.length })}>
				{targets.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{t('play.journal.private.noTargets')}
					</div>
				) : (
					<div style={{ display: 'grid', gap: 10 }} data-testid="private-bookmark-form">
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
							<Button variant="primary" icon="pin" onClick={saveBookmark}>
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
							<IconButton
								icon="delete"
								size="sm"
								label={t('play.journal.private.removeBookmark', { title: bookmark.targetTitle })}
								onClick={async () => {
									await removePrivateBookmark(id, bookmark.id);
									await reload(id);
								}}
							/>
						),
					}))}
				/>
			</Panel>

			<Panel title={t('play.journal.private.impressions', { count: impressions.length })}>
				<div style={{ display: 'grid', gap: 10 }} data-testid="private-impression-form">
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
						<Button variant="primary" icon="add" onClick={saveImpression}>
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
							<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
								<Button
									size="sm"
									icon="send"
									aria-label={t('play.journal.private.shareOne', { name: impression.npcName })}
									onClick={() => shareImpression(impression)}
								>
									{t('play.journal.private.share')}
								</Button>
								<IconButton
									icon="delete"
									size="sm"
									label={t('play.journal.private.deleteImpression', { name: impression.npcName })}
									onClick={async () => {
										await removePrivateImpression(id, impression.id);
										await reload(id);
									}}
								/>
							</span>
						),
					}))}
				/>
			</Panel>
		</PrivatePanels>
	);
}

/** The "only you" heading plus the safety line every private panel sits under. */
function PrivatePanels({
	heading,
	sub,
	children,
}: {
	heading: string;
	sub: string;
	children: ReactNode;
}) {
	return (
		<section
			data-testid="private-journal"
			style={{ marginTop: 26, display: 'grid', gap: 14 }}
			aria-label={heading}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
				<Icon name="lock" size={16} color={T.ter} />
				<h2 style={{ margin: 0, font: `600 17px ${T.disp}`, color: T.ink }}>{heading}</h2>
			</div>
			<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.sub, marginTop: -6 }}>{sub}</div>
			{children}
		</section>
	);
}

/** The one list shape all three private collections render. */
function RecordList({
	rows,
	empty,
}: {
	empty: string;
	rows: {
		id: string;
		title: string;
		body: string;
		testId: string;
		badge?: string;
		badgeStatus?: 'success' | 'neutral';
		actions: ReactNode;
	}[];
}) {
	if (rows.length === 0) {
		return <div style={{ marginTop: 14, font: `12.5px ${T.sans}`, color: T.ter }}>{empty}</div>;
	}
	return (
		<div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
			{rows.map((row) => (
				<div
					key={row.id}
					data-testid={row.testId}
					style={{
						display: 'flex',
						alignItems: 'flex-start',
						gap: 10,
						padding: '10px 0',
						// Every row keeps a top rule, including the first: it also separates the list from
						// the draft form above it.
						borderTop: `1px solid ${T.bd}`,
					}}
				>
					<div style={{ minWidth: 0, flex: 1 }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
							<span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{row.title}</span>
							{row.badge && <Badge status={row.badgeStatus ?? 'neutral'}>{row.badge}</Badge>}
						</div>
						{row.body && (
							<div style={{ marginTop: 4, font: `12px/1.5 ${T.sans}`, color: T.sub }}>
								{row.body}
							</div>
						)}
					</div>
					<span style={{ flex: '0 0 auto' }}>{row.actions}</span>
				</div>
			))}
		</div>
	);
}
