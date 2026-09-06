import { useState } from 'react';
import type { JournalEntryView } from '@dndtools/core';
import {
	Badge,
	Button,
	EmptyState,
	Icon,
	IconButton,
	Input,
	Select,
	Textarea,
	Toaster,
} from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { JOURNAL_KINDS, type Dispatch } from './shared';

// ── Journal — real entries with add / edit / remove / share; quests + highlights are entry KINDS ──
export function PlayerJournal({
	charId,
	actorId,
	entries,
	canAuthor,
	compact,
	dispatch,
}: {
	charId: string;
	actorId: string;
	entries: JournalEntryView[];
	canAuthor: boolean;
	compact: boolean;
	dispatch: Dispatch;
}) {
	const [title, setTitle] = useState('');
	const [body, setBody] = useState('');
	const [kind, setKind] = useState('note');
	const [editId, setEditId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState('');
	const [editBody, setEditBody] = useState('');

	const add = async () => {
		if (!title.trim()) return;
		const ok = await dispatch({
			type: 'character.add-journal-entry',
			actorId,
			payload: {
				characterId: charId,
				kind,
				title: title.trim(),
				body: body.trim(),
				visibility: 'dm-only',
			},
		});
		if (ok) {
			setTitle('');
			setBody('');
		}
	};
	// Real visibility toggle: flip between owner-private (`dm-only`) and shared-with-players.
	const toggleShare = (entry: JournalEntryView) =>
		dispatch({
			type: 'character.set-journal-entry-visibility',
			actorId,
			payload: {
				characterId: charId,
				entryId: entry.id,
				visibility: entry.visibility === 'player-visible' ? 'dm-only' : 'player-visible',
				sharedWith: [],
			},
		});
	// Real edit path (CHAR-012 `character.update-journal-entry`).
	const startEdit = (entry: JournalEntryView) => {
		setEditId(entry.id);
		setEditTitle(entry.title);
		setEditBody(entry.body);
	};
	const saveEdit = async () => {
		if (!editId || !editTitle.trim()) return;
		const ok = await dispatch({
			type: 'character.update-journal-entry',
			actorId,
			payload: { characterId: charId, entryId: editId, title: editTitle.trim(), body: editBody },
		});
		if (ok) setEditId(null);
	};
	// Delete is instant with an UNDO toast — the undo re-authors the captured entry through the
	// same add command (kind/title/body/visibility preserved; the restored entry gets a fresh id).
	const remove = async (entry: JournalEntryView) => {
		const ok = await dispatch({
			type: 'character.remove-journal-entry',
			actorId,
			payload: { characterId: charId, entryId: entry.id },
		});
		if (!ok) return;
		const { kind: entryKind, title: entryTitle, body: entryBody, visibility } = entry;
		Toaster.success(`“${entryTitle}” deleted`, {
			action: 'Undo',
			onAction: () => {
				void dispatch({
					type: 'character.add-journal-entry',
					actorId,
					payload: {
						characterId: charId,
						kind: entryKind,
						title: entryTitle,
						body: entryBody,
						visibility,
						sharedWith: [],
					},
				}).then((restored) => {
					if (restored) Toaster.success(`“${entryTitle}” restored`);
				});
			},
		});
	};

	// Quests + highlights are REAL journal-entry kinds (core `journalEntryKindSchema`), projected into
	// their own side panels; the main list carries every entry (the editable source of truth).
	const quests = entries.filter((e) => e.kind === 'personal-quest');
	const highlights = entries.filter((e) => e.kind === 'session-highlight');

	return (
		<div>
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
					Private journal — entries are owner-private until you explicitly share one with the table.
				</span>
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
					gap: 18,
					alignItems: 'start',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel title={`Journal entries (${entries.length})`}>
						{entries.length === 0 ? (
							<EmptyState
								inset
								icon="note-edit"
								title="No entries yet"
								description="Write the first journal entry below — it stays private until shared."
							/>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column' }}>
								{entries.map((im, i) => {
									const shared = im.visibility === 'player-visible';
									const isEditing = editId === im.id;
									return (
										<div
											key={im.id}
											style={{ padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}
										>
											{isEditing ? (
												<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
													<Input
														value={editTitle}
														aria-label="Entry title"
														onChange={(e: any) => setEditTitle(e.target.value)}
													/>
													<Textarea
														rows={2}
														value={editBody}
														aria-label="Entry body"
														onChange={(e: any) => setEditBody(e.target.value)}
													/>
													<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
														<Button variant="ghost" size="sm" onClick={() => setEditId(null)}>
															Cancel
														</Button>
														<Button
															variant="primary"
															size="sm"
															disabled={!editTitle.trim()}
															onClick={saveEdit}
														>
															Save
														</Button>
													</div>
												</div>
											) : (
												<>
													<div
														style={{
															display: 'flex',
															alignItems: 'center',
															gap: 8,
															marginBottom: 4,
														}}
													>
														<span style={{ font: `600 13px ${T.sans}` }}>{im.title}</span>
														<Badge status="neutral">{im.kind}</Badge>
														{canAuthor && (
															<span
																style={{
																	marginLeft: 'auto',
																	display: 'inline-flex',
																	alignItems: 'center',
																	gap: 4,
																}}
															>
																<button
																	type="button"
																	// The only toggle in this file without it; every sibling
																	// (inspiration, equipped, prepared) already announces state.
																	aria-pressed={shared}
																	// Every entry rendered an identically-named toggle, so
																	// browsing by control gave no way to tell which journal
																	// entry was about to be shared with the whole table.
																	aria-label={`${shared ? 'Shared' : 'Private'} — ${im.title}`}
																	onClick={() => toggleShare(im)}
																	style={{
																		display: 'inline-flex',
																		alignItems: 'center',
																		gap: 5,
																		// ~21px before (3px round an 11px line) — under WCAG
																		// 2.5.8. Grown with padding, as the Equip pill was.
																		padding: '6px 10px',
																		minHeight: 24,
																		boxSizing: 'border-box',
																		borderRadius: 16,
																		cursor: 'pointer',
																		font: `11px ${T.sans}`,
																		border: `1px solid ${shared ? T.accBd : T.bd}`,
																		background: shared ? T.accSub : T.surf,
																		color: shared ? T.acc : T.ter,
																	}}
																>
																	<Icon name={shared ? 'visibility-players' : 'hidden'} size={12} />
																	{shared ? 'Shared' : 'Private'}
																</button>
																<IconButton
																	icon="note-edit"
																	label={`Edit ${im.title}`}
																	variant="ghost"
																	size="sm"
																	onClick={() => startEdit(im)}
																/>
																<IconButton
																	icon="close"
																	label={`Delete ${im.title}`}
																	variant="ghost"
																	size="sm"
																	onClick={() => void remove(im)}
																/>
															</span>
														)}
													</div>
													{im.body && (
														<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
															{im.body}
														</div>
													)}
												</>
											)}
										</div>
									);
								})}
							</div>
						)}
						{canAuthor && (
							<div
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 8,
									marginTop: 14,
									paddingTop: 14,
									borderTop: `1px solid ${T.bd}`,
								}}
							>
								<div style={{ display: 'flex', gap: 8 }}>
									<Input
										value={title}
										aria-label="Entry title"
										onChange={(e: any) => setTitle(e.target.value)}
										placeholder="Entry title…"
										style={{ flex: 1 }}
									/>
									<Select
										value={kind}
										onChange={(e: any) => setKind(e.target.value)}
										options={JOURNAL_KINDS}
										aria-label="Entry kind"
										style={{ width: 170 }}
									/>
								</div>
								<Textarea
									value={body}
									aria-label="Entry body"
									onChange={(e: any) => setBody(e.target.value)}
									placeholder="What happened…"
									rows={2}
								/>
								<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
									<Button
										variant="secondary"
										size="sm"
										icon="add"
										disabled={!title.trim()}
										onClick={add}
									>
										Add entry
									</Button>
								</div>
							</div>
						)}
					</Panel>
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					{/* Real projections of the journal's `personal-quest` / `session-highlight` entry kinds. */}
					<Panel title={`Personal quests (${quests.length})`}>
						{quests.length === 0 ? (
							<EmptyState
								inset
								icon="flag"
								title="No personal quests"
								description='Add a journal entry with the "Personal quest" kind to track one here.'
							/>
						) : (
							quests.map((q, i) => (
								<div
									key={q.id}
									style={{
										display: 'flex',
										gap: 10,
										padding: '9px 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
									}}
								>
									<Icon name="flag" size={15} color={T.acc} />
									<div style={{ flex: 1 }}>
										<div style={{ font: `12.5px ${T.sans}`, color: T.ink }}>{q.title}</div>
										{q.body && (
											<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 2 }}>
												{q.body}
											</div>
										)}
									</div>
								</div>
							))
						)}
					</Panel>
					<Panel title={`Session highlights (${highlights.length})`}>
						{highlights.length === 0 ? (
							<EmptyState
								inset
								icon="sparkle"
								title="No highlights yet"
								description='Add a journal entry with the "Session highlight" kind to capture one.'
							/>
						) : (
							highlights.map((h, i) => (
								<div
									key={h.id}
									style={{ padding: '9px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}
								>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
										<Badge status="accent">highlight</Badge>
										<span style={{ marginLeft: 'auto', font: `10.5px ${T.mono}`, color: T.ter }}>
											{new Date(h.updatedAt).toLocaleDateString()}
										</span>
									</div>
									<div style={{ font: `600 12.5px ${T.sans}` }}>{h.title}</div>
									{h.body && (
										<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.sub }}>{h.body}</div>
									)}
								</div>
							))
						)}
					</Panel>
				</div>
			</div>
		</div>
	);
}
