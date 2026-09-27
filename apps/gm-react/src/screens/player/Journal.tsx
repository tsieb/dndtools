import { JournalHighlights } from './JournalHighlights';
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
import type { DSChangeEvent } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
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
	const { t } = useI18n();
	const [title, setTitle] = useState('');
	const [body, setBody] = useState('');
	const [kind, setKind] = useState('note');
	const [editId, setEditId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState('');
	const [editBody, setEditBody] = useState('');
	// RC-CHR-2.2 — the downtime entry's structured fields, required only while `kind === 'downtime'`
	// (the core's `addJournalEntryInputSchema` refine rejects the entry without them).
	const [dtActivity, setDtActivity] = useState('');
	const [dtDays, setDtDays] = useState('1');
	const [dtCost, setDtCost] = useState('');
	const [dtOutcome, setDtOutcome] = useState('');

	const isDowntime = kind === 'downtime';
	const add = async () => {
		if (!title.trim()) return;
		if (isDowntime && !dtActivity.trim()) return;
		const days = Math.max(1, Math.trunc(Number(dtDays)) || 1);
		const cost = dtCost.trim() === '' ? undefined : Math.max(0, Math.trunc(Number(dtCost)) || 0);
		const ok = await dispatch({
			type: 'character.add-journal-entry',
			actorId,
			payload: {
				characterId: charId,
				kind,
				title: title.trim(),
				body: body.trim(),
				visibility: 'dm-only',
				...(isDowntime
					? {
							downtime: {
								activityType: dtActivity.trim(),
								days,
								...(cost !== undefined ? { cost } : {}),
								...(dtOutcome.trim() ? { outcome: dtOutcome.trim() } : {}),
							},
						}
					: {}),
			},
		});
		if (ok) {
			setTitle('');
			setBody('');
			setDtActivity('');
			setDtDays('1');
			setDtCost('');
			setDtOutcome('');
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
		Toaster.success(t('player.journal.deleted', { title: entryTitle }), {
			action: t('common.action.undo'),
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
					if (restored) Toaster.success(t('player.journal.restored', { title: entryTitle }));
				});
			},
		});
	};

	// Quests + highlights are REAL journal-entry kinds (core `journalEntryKindSchema`), projected into
	// their own side panels; the main list carries every entry (the editable source of truth).
	const quests = entries.filter((e) => e.kind === 'personal-quest');
	const highlights = entries.filter((e) => e.kind === 'session-highlight');
	const downtimeEntries = entries.filter((e) => e.kind === 'downtime');
	// The kind picker and the per-entry badge read the same catalogued labels, so a kind is spelled
	// once per locale rather than showing the core's enum value on the badge.
	const kindOptions = JOURNAL_KINDS.map((k) => ({ value: k.value, label: t(k.label) }));
	const kindLabel = (value: string) => kindOptions.find((k) => k.value === value)?.label ?? value;

	return (
		<div>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					padding: 'var(--space-2) var(--space-3)',
					borderRadius: 'var(--radius-md)',
					background: 'var(--color-dm-only-subtle)',
					border: `1px solid var(--color-dm-only-badge)`,
					marginBottom: 'var(--space-4)',
				}}
			>
				<Icon name="hidden" size={16} color="var(--color-dm-only-badge)" />
				<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
					{t('player.journal.privateNote')}
				</span>
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
					gap: 'var(--space-4)',
					alignItems: 'start',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
					<Panel title={t('player.journal.entries', { count: entries.length })}>
						{entries.length === 0 ? (
							<EmptyState
								inset
								illustration="journal-empty"
								title={t('player.journal.noEntriesTitle')}
								description={t('player.journal.noEntriesBody')}
							/>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column' }}>
								{entries.map((im, i) => {
									const shared = im.visibility === 'player-visible';
									const isEditing = editId === im.id;
									return (
										<div
											key={im.id}
											style={{
												padding: 'var(--space-2) 0',
												borderTop: i ? `1px solid ${T.bd}` : 'none',
												borderInlineStart: shared
													? undefined
													: 'var(--space-1) solid var(--color-dm-only-badge)',
												paddingInlineStart: 'var(--space-2)',
											}}
										>
											{isEditing ? (
												<div
													style={{
														display: 'flex',
														flexDirection: 'column',
														gap: 'var(--space-2)',
													}}
												>
													<Input
														value={editTitle}
														aria-label={t('player.journal.entryTitle')}
														onChange={(e: DSChangeEvent) => setEditTitle(e.target.value)}
													/>
													<Textarea
														rows={2}
														value={editBody}
														aria-label={t('player.journal.entryBody')}
														onChange={(e: DSChangeEvent) => setEditBody(e.target.value)}
													/>
													<div
														style={{
															display: 'flex',
															justifyContent: 'flex-end',
															gap: 'var(--space-1-5)',
														}}
													>
														<Button variant="ghost" size="sm" onClick={() => setEditId(null)}>
															{t('common.action.cancel')}
														</Button>
														<Button
															variant="primary"
															size="sm"
															disabled={!editTitle.trim()}
															onClick={saveEdit}
														>
															{t('common.action.save')}
														</Button>
													</div>
												</div>
											) : (
												<>
													<div
														style={{
															display: 'flex',
															alignItems: 'center',
															gap: 'var(--space-2)',
															marginBottom: 'var(--space-1)',
														}}
													>
														<span style={{ font: `600 var(--text-sm) ${T.sans}` }}>{im.title}</span>
														<Badge status="neutral">{kindLabel(im.kind)}</Badge>
														{canAuthor && (
															<span
																style={{
																	marginLeft: 'auto',
																	display: 'inline-flex',
																	alignItems: 'center',
																	gap: 'var(--space-1)',
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
																	aria-label={t(
																		shared
																			? 'player.journal.sharedEntry'
																			: 'player.journal.privateEntry',
																		{ title: im.title },
																	)}
																	onClick={() => toggleShare(im)}
																	style={{
																		display: 'inline-flex',
																		alignItems: 'center',
																		gap: 'var(--space-1)',
																		// ~21px before (3px round an 11px line) — under WCAG
																		// 2.5.8. Grown with padding, as the Equip pill was.
																		padding: 'var(--space-1-5) var(--space-2)',
																		minHeight: 24,
																		boxSizing: 'border-box',
																		borderRadius: 'var(--radius-lg)',
																		cursor: 'pointer',
																		font: `var(--text-xs) ${T.sans}`,
																		border: `1px solid ${shared ? T.accBd : T.bd}`,
																		background: shared ? T.accSub : T.surf,
																		color: shared ? T.acc : T.ter,
																	}}
																>
																	<Icon name={shared ? 'visibility-players' : 'hidden'} size={12} />
																	{t(shared ? 'player.journal.shared' : 'player.journal.private')}
																</button>
																<IconButton
																	icon="note-edit"
																	label={t('player.journal.editEntry', { title: im.title })}
																	variant="ghost"
																	size="sm"
																	onClick={() => startEdit(im)}
																/>
																<IconButton
																	icon="close"
																	label={t('player.journal.deleteEntry', { title: im.title })}
																	variant="ghost"
																	size="sm"
																	onClick={() => void remove(im)}
																/>
															</span>
														)}
													</div>
													{im.body && (
														<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
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
									gap: 'var(--space-2)',
									marginTop: 'var(--space-3)',
									paddingTop: 'var(--space-3)',
									borderTop: `1px solid ${T.bd}`,
								}}
							>
								<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
									<Input
										value={title}
										aria-label={t('player.journal.entryTitle')}
										onChange={(e: DSChangeEvent) => setTitle(e.target.value)}
										placeholder={t('player.journal.entryTitlePlaceholder')}
										style={{ flex: 1 }}
									/>
									<Select
										value={kind}
										onChange={(e: DSChangeEvent) => setKind(e.target.value)}
										options={kindOptions}
										aria-label={t('player.journal.entryKind')}
										style={{ width: 170 }}
									/>
								</div>
								{/* RC-CHR-2.2 — the downtime activity's structured fields; only rendered (and
								    only required) while the picked kind is `downtime`. */}
								{isDowntime && (
									<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
										<Input
											value={dtActivity}
											aria-label={t('player.journal.downtime.activity')}
											onChange={(e: DSChangeEvent) => setDtActivity(e.target.value)}
											placeholder={t('player.journal.downtime.activityPlaceholder')}
											style={{ flex: 2 }}
										/>
										<Input
											type="number"
											value={dtDays}
											aria-label={t('player.journal.downtime.days')}
											onChange={(e: DSChangeEvent) => setDtDays(e.target.value)}
											style={{ flex: 1 }}
										/>
										<Input
											type="number"
											value={dtCost}
											aria-label={t('player.journal.downtime.cost')}
											onChange={(e: DSChangeEvent) => setDtCost(e.target.value)}
											placeholder={t('player.journal.downtime.costPlaceholder')}
											style={{ flex: 1 }}
										/>
									</div>
								)}
								{isDowntime && (
									<Input
										value={dtOutcome}
										aria-label={t('player.journal.downtime.outcome')}
										onChange={(e: DSChangeEvent) => setDtOutcome(e.target.value)}
										placeholder={t('player.journal.downtime.outcomePlaceholder')}
									/>
								)}
								<Textarea
									value={body}
									aria-label={t('player.journal.entryBody')}
									onChange={(e: DSChangeEvent) => setBody(e.target.value)}
									placeholder={t('player.journal.entryBodyPlaceholder')}
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
										{t('player.journal.addEntry')}
									</Button>
								</div>
							</div>
						)}
					</Panel>
				</div>
				<JournalHighlights
					quests={quests}
					highlights={highlights}
					downtimeEntries={downtimeEntries}
				/>
			</div>
		</div>
	);
}
