import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	VAULT_OBJECT_SUBTYPE_KEY,
	actorCanAuthorContent,
	getCalendarContinuityForActor,
	getCalendarTimelineForActor,
	getContentItemsForActor,
	listCharactersForActor,
	projectObjectFieldsForRole,
} from '@dndtools/core';
import {
	Badge,
	Button,
	EmptyState,
	IconButton,
	NpcCard,
	QuestCard,
	Select,
	SessionTimeline,
	Tabs,
	tabPanelProps,
	Toaster,
	VisibilityChip,
} from '../ds';
import { ListDetail, Page, Panel, T, eb } from '../app/screen-kit';
import { useListDetailSplit } from '../app/useViewport';
import { ContextHelp } from '../app/help/ContextHelp';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import {
	FACTION_KIND_OPTIONS,
	KIND_LABEL,
	QUEST_CARD_STATUS,
	QUEST_STATUS_OPTIONS,
	STANCE_OPTIONS,
	STANCE_TONE,
	VIS_CHIP,
	optionLabel,
	options,
} from './campaignVocab';
import {
	bodySummary,
	objectiveArray,
	str,
	strArray,
	type FactionRow,
	type QuestRow,
} from './campaignRows';
import { useDraftSlot } from './campaign/draftSlot';
import { FactionEditor, type FactionDraft } from './campaign/FactionEditor';
import { QuestEditor, type QuestDraft } from './campaign/QuestEditor';

/**
 * Campaign — the structured-entity / world-model lens, wired to the live Processing Core.
 * Mirrors the production `routes/campaign` CampaignOverview reads: NPCs come
 * from `listCharactersForActor`, the Timeline from `getCalendarTimelineForActor` + the campaign date
 * from `getCalendarContinuityForActor`, and QUESTS and FACTIONS are real note-backed Vault Objects
 * (`kind: 'object'`, subtypes `quest` / `faction`) authored through the real `content.create-object`
 * / `content.update-object` / `content.set-item-visibility` commands. A quest carries its lifecycle
 * status + `{id, text, done}` objectives as declared frontmatter fields, so the status select and
 * the objective checklist are durable writes, not display state. Every
 * read is player-safe: a player/observer sees only their visible items, and the faction dossier's
 * dm-only `secret` field is OMITTED from non-DM projections by `projectObjectFieldsForRole` (the
 * core's CONTENT-013 AC3 projection, not client-side filtering). Campaign-date AUTHORING lives on
 * the Session surface (not here), so this screen never invents an out-of-surface write control.
 */

/**
 * One quest in the Threads list: the DS QuestCard (status header · hook · objective checklist) with
 * the checklist and a status select wired to durable `content.update-object` writes. The update
 * handler merges declared fields, so each write sends ONLY the field it changes — except objectives,
 * which are one declared array and therefore always written whole.
 */
function QuestCardRow({
	row,
	canAuthor,
	onEdit,
}: {
	row: QuestRow;
	canAuthor: boolean;
	onEdit: () => void;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const status = str(row.fields.status) || 'active';
	const objectives = objectiveArray(row.fields.objectives);

	async function update(fields: Record<string, unknown>) {
		// content.update-object — authorized-editor edit; merged frontmatter is re-validated fail-closed.
		const result = await runtime.dispatch({
			type: 'content.update-object',
			actorId,
			payload: { itemId: row.view.id, fields },
		});
		if (result.status !== 'accepted') Toaster.error(result.rejection.message);
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
			<QuestCard
				title={row.view.title}
				status={QUEST_CARD_STATUS[status] ?? 'active'}
				hook={bodySummary(row.view.body, t('campaign.quest.noHook'))}
				objectives={objectives.map((o) => ({ label: o.text, done: o.done }))}
				onToggleObjective={
					canAuthor
						? (i: number) =>
								void update({
									objectives: objectives.map((o, j) => (j === i ? { ...o, done: !o.done } : o)),
								})
						: undefined
				}
			/>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
				{/* EVERY quest carries the safety-critical visibility cue (not only dm-only ones) — the
				    same always-on chip FactionCard shows, so a mis-set visibility is visible at a glance. */}
				<VisibilityChip level={VIS_CHIP[row.view.visibility] || 'dm-only'} compact />
				{canAuthor && (
					<>
						<div style={{ flex: 1 }} />
						<IconButton
							icon="note-edit"
							label={t('campaign.edit', { title: row.view.title })}
							variant="ghost"
							size="sm"
							onClick={onEdit}
						/>
						<span style={{ ...eb }}>{t('campaign.status')}</span>
						<Select
							aria-label={t('campaign.statusOf', { title: row.view.title })}
							options={options(QUEST_STATUS_OPTIONS, t)}
							value={status}
							onChange={(e: { target: { value: string } }) =>
								void update({ status: e.target.value })
							}
						/>
					</>
				)}
			</div>
		</div>
	);
}

function FactionCard({
	row,
	canAuthor,
	onEdit,
}: {
	row: FactionRow;
	canAuthor: boolean;
	onEdit: () => void;
}) {
	const { t } = useI18n();
	const { view, fields } = row;
	const stance = str(fields.stance) || 'neutral';
	const kind = str(fields.kind);
	const leader = str(fields.leader);
	const goals = strArray(fields.goals);
	// Only present at all for the DM — `projectObjectFieldsForRole` omits dm-only fields for others.
	const secret = str(fields.secret);
	return (
		<Panel style={{ gap: 10 }}>
			<div
				style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
			>
				{/* <h3> to match NpcCard/QuestCard — the Factions grid was the only one a screen-reader
				    user could not navigate by heading. */}
				<h3
					style={{
						margin: 0,
						font: `700 15px ${T.disp}`,
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{view.title}
				</h3>
				<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
					<Badge status={STANCE_TONE[stance] || 'neutral'}>
						{optionLabel(STANCE_OPTIONS, stance, t)}
					</Badge>
					{canAuthor && (
						<IconButton
							icon="note-edit"
							label={t('campaign.edit', { title: view.title })}
							variant="ghost"
							size="sm"
							onClick={onEdit}
						/>
					)}
				</div>
			</div>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
				<VisibilityChip level={VIS_CHIP[view.visibility] || 'dm-only'} />
				{(kind || leader) && (
					<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{kind ? optionLabel(FACTION_KIND_OPTIONS, kind, t) : ''}
						{kind && leader ? ' · ' : ''}
						{leader ? t('campaign.faction.ledBy', { name: leader }) : ''}
					</span>
				)}
			</div>
			<div style={{ font: `13px/1.5 ${T.sans}`, color: T.sub }}>
				{bodySummary(view.body, t('campaign.faction.noDossier'))}
			</div>
			{goals.length > 0 && (
				<div>
					<div style={{ ...eb, marginBottom: 4 }}>{t('campaign.faction.goals')}</div>
					{goals.map((goal, i) => (
						<div
							key={i}
							style={{
								display: 'flex',
								alignItems: 'baseline',
								gap: 7,
								font: `12.5px/1.6 ${T.sans}`,
								color: T.sub,
							}}
						>
							<span
								aria-hidden
								style={{
									width: 5,
									height: 5,
									borderRadius: '50%',
									background: T.accBd,
									flexShrink: 0,
									transform: 'translateY(-2px)',
								}}
							/>
							<span style={{ minWidth: 0 }}>{goal}</span>
						</div>
					))}
				</div>
			)}
			{secret && (
				<div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 8 }}>
					<div style={{ ...eb, color: T.dm, marginBottom: 3 }}>{t('campaign.faction.secret')}</div>
					<div style={{ font: `italic 12.5px/1.5 ${T.sans}`, color: T.sub }}>{secret}</div>
				</div>
			)}
		</Panel>
	);
}

export function Campaign() {
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const [tab, setTab] = useState('quests');
	// null = closed · { id: null } = composing a new faction · { id } = editing that faction.
	const [factionEditor, setFactionEditor] = useState<{ id: string | null } | null>(null);
	// null = closed · { id: null } = composing a new quest · { id } = editing that quest.
	const [questEditor, setQuestEditor] = useState<{ id: string | null } | null>(null);

	const canAuthor = actorCanAuthorContent(runtime.state.permissions, actorId);
	const split = useListDetailSplit();

	// Create-intent handoff from "New faction" launchers (⌘K): land on the Factions tab with the
	// editor already open. Consumed once, then cleared.
	useEffect(() => {
		const intent = (location.state ?? null) as { createFaction?: boolean } | null;
		if (intent?.createFaction) {
			setTab('factions');
			setFactionEditor({ id: null });
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.state, location.pathname, navigate]);

	const data = useMemo(() => {
		const { content, permissions, characters, session, maps } = runtime.state;
		const roster = listCharactersForActor(characters, permissions, actorId);
		const npcs = roster.filter((c) => c.kind !== 'pc');
		const items = getContentItemsForActor(content, permissions, actorId);
		const role = permissions.actors[actorId]?.role ?? 'observer';
		// Quests ARE a Core entity now: note-backed Vault Objects of subtype `quest` carrying the
		// declared status + objectives tracker fields (role-projected like every object read).
		const quests: QuestRow[] = items
			.filter((n) => n.kind === 'object' && n.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'quest')
			.map((n) => ({ view: n, fields: projectObjectFieldsForRole('quest', n.fields, role) }));
		// Factions: note-backed Vault Objects of subtype `faction`. The dossier fields are projected
		// per the actor's role, so a non-DM never receives the dm-only `secret`.
		const factions: FactionRow[] = items
			.filter((n) => n.kind === 'object' && n.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'faction')
			.map((n) => ({ view: n, fields: projectObjectFieldsForRole('faction', n.fields, role) }));
		const calendarId = Object.values(content.calendars)[0]?.id ?? null;
		const timeline = calendarId
			? getCalendarTimelineForActor(content, permissions, actorId, calendarId, 'long')
			: [];
		const continuity = getCalendarContinuityForActor(
			session,
			content,
			maps,
			permissions,
			actorId,
			'long',
		);
		return { npcs, quests, factions, timeline, currentDate: continuity.currentDate };
	}, [runtime.state, actorId]);

	const tabs = [
		{ id: 'quests', label: t('campaign.tab.quests'), icon: 'flag' },
		{ id: 'npcs', label: t('campaign.tab.npcs') },
		{ id: 'factions', label: t('campaign.tab.factions') },
		{ id: 'timeline', label: t('campaign.tab.timeline'), icon: 'recent' },
	];

	const editingFaction = factionEditor?.id
		? (data.factions.find((f) => f.view.id === factionEditor.id) ?? null)
		: null;
	const editingQuest = questEditor?.id
		? (data.quests.find((q) => q.view.id === questEditor.id) ?? null)
		: null;
	// The open editor's identity — also what keys its surviving draft (`useDraftSlot`).
	const questKey = canAuthor && questEditor ? (questEditor.id ?? 'new') : null;
	const factionKey = canAuthor && factionEditor ? (factionEditor.id ?? 'new') : null;
	const questDraft = useDraftSlot<QuestDraft>(questKey);
	const factionDraft = useDraftSlot<FactionDraft>(factionKey);
	const questForm = questKey !== null && (
		<QuestEditor
			key={questKey}
			quest={editingQuest}
			draft={questDraft}
			onClose={() => setQuestEditor(null)}
		/>
	);
	const factionForm = factionKey !== null && (
		<FactionEditor
			key={factionKey}
			faction={editingFaction}
			draft={factionDraft}
			onClose={() => setFactionEditor(null)}
		/>
	);
	// RC-UX-4.3 — on the rail tier the open editor takes the detail pane BESIDE the cards instead of
	// pushing them down the page; everywhere else it stays inline above them, as before.
	const paneTab =
		split && ((tab === 'quests' && questForm) || (tab === 'factions' && factionForm)) ? tab : null;
	const paneRow = paneTab === 'quests' ? editingQuest : editingFaction;

	const cards = (
		<Page>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 12,
					flexWrap: 'wrap',
					marginBottom: 18,
				}}
			>
				<Tabs
					value={tab}
					onChange={setTab}
					tabs={tabs}
					idBase="campaign"
					aria-label={t('campaign.sections')}
				/>
				{/* RC-KNW-3.3 — the relationship editor is a sub-route of Story, same pattern as the
				    calendar editor: no nav.ts entry, reached from a button on the surface it complements. */}
				<Button
					variant="ghost"
					size="sm"
					icon="group"
					onClick={() => navigate('/campaign/relationships')}
				>
					{t('campaign.relationships.entry')}
				</Button>
			</div>
			<h2 className="visually-hidden">
				{tabs.find((item) => item.id === tab)?.label ?? t('campaign.title')}
			</h2>

			{/* One panel element, re-labelled per active tab — only one body is ever mounted. */}
			<div {...tabPanelProps('campaign', tab)}>
				{tab === 'quests' && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
						{canAuthor && !questEditor && data.quests.length > 0 && (
							<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
								<Button
									variant="primary"
									size="sm"
									icon="add"
									onClick={() => setQuestEditor({ id: null })}
								>
									{t('campaign.quest.new')}
								</Button>
							</div>
						)}
						{!split && questForm}
						{data.quests.length === 0 ? (
							<EmptyState
								icon="campaign-scroll"
								title={t('campaign.quest.emptyTitle')}
								description={
									canAuthor ? t('campaign.quest.emptyDm') : t('campaign.quest.emptyPlayer')
								}
								action={
									canAuthor && !questEditor ? (
										<Button
											variant="primary"
											size="sm"
											icon="add"
											onClick={() => setQuestEditor({ id: null })}
										>
											{t('campaign.quest.createFirst')}
										</Button>
									) : undefined
								}
							/>
						) : (
							<div
								style={{
									display: 'grid',
									// Keep a single card within the usable width on narrow phones.
									gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 330px),1fr))',
									gap: 16,
									alignItems: 'start',
								}}
							>
								{data.quests.map((q) => (
									<QuestCardRow
										key={q.view.id}
										row={q}
										canAuthor={canAuthor}
										onEdit={() => setQuestEditor({ id: q.view.id })}
									/>
								))}
							</div>
						)}
					</div>
				)}

				{tab === 'npcs' &&
					(data.npcs.length === 0 ? (
						<EmptyState
							icon="characters-person"
							title={t('campaign.npc.emptyTitle')}
							description={t('campaign.npc.emptyDesc')}
							action={
								canAuthor ? (
									<Button
										variant="primary"
										size="sm"
										icon="new-character"
										onClick={() =>
											navigate('/characters', { state: { create: true, kind: 'npc' } })
										}
									>
										{t('campaign.npc.new')}
									</Button>
								) : undefined
							}
						/>
					) : (
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 320px),1fr))',
								gap: 16,
								alignItems: 'start',
							}}
						>
							{data.npcs.map((n) => (
								// The card owns its own click now. It used to be wrapped in a `role="button"` div
								// whose aria-label ("Open X’s sheet in Characters") replaced the whole descendant
								// subtree, so the role, the stats, the tags and the dm-only chip were all
								// inaudible — and because NpcCard keys its hover/cursor affordance off its OWN
								// `onClick`, the wrapper also left a navigating card looking inert.
								<NpcCard
									key={n.id}
									name={n.name}
									role={KIND_LABEL[n.kind] ? t(KIND_LABEL[n.kind]) : n.kind}
									onClick={() => navigate(`/characters/${n.id}`)}
									// `disposition` is deliberately omitted: nothing in the model backs it, and the
									// previous hard-coded "neutral" asserted a disposition for every NPC including
									// hostile ones.
									//
									// AC/HP used to be passed as `hook`, which NpcCard renders in italics behind a
									// dm-only Eye glyph — presenting a monster's public combat stats as a DM
									// secret. They are plain tags now.
									// The kind is NOT repeated here: `role` above already renders it directly under
									// the name, so every card read "NPC / NPC · AC 13 · 8 HP".
									tags={[
										t('campaign.npc.ac', { value: n.combat?.ac ?? '—' }),
										t('campaign.npc.hp', { value: n.combat?.hp ?? '—' }),
									]}
									dmOnly={n.visibility === 'dm-only'}
								/>
							))}
						</div>
					))}

				{tab === 'factions' && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
						{/* One visibility tip for the list, not one per card: every FactionCard carries the
						    same chip, and a row of identical explain buttons reads as noise (and repeats one
						    accessible name down the page). Kept for players too — they see the chips. */}
						<div
							style={{
								display: 'flex',
								justifyContent: 'flex-end',
								alignItems: 'center',
								gap: 'var(--space-2)',
							}}
						>
							<ContextHelp topic="visibility" />
							{canAuthor && !factionEditor && (
								<Button
									variant="primary"
									size="sm"
									icon="add"
									onClick={() => setFactionEditor({ id: null })}
								>
									{t('campaign.faction.new')}
								</Button>
							)}
						</div>
						{!split && factionForm}
						{data.factions.length === 0 ? (
							<EmptyState
								icon="flag"
								title={t('campaign.faction.emptyTitle')}
								description={
									canAuthor ? t('campaign.faction.emptyDm') : t('campaign.faction.emptyPlayer')
								}
								action={undefined}
							/>
						) : (
							<div
								style={{
									display: 'grid',
									gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 300px),1fr))',
									gap: 16,
									alignItems: 'start',
								}}
							>
								{data.factions.map((f) => (
									<FactionCard
										key={f.view.id}
										row={f}
										canAuthor={canAuthor}
										onEdit={() => setFactionEditor({ id: f.view.id })}
									/>
								))}
							</div>
						)}
					</div>
				)}

				{tab === 'timeline' && (
					<Panel title={t('campaign.timeline.title')} style={{ maxWidth: 680 }}>
						<div style={{ font: `12.5px ${T.sans}`, color: T.sub, marginBottom: 4 }}>
							{data.currentDate ? (
								<>
									{t('campaign.timeline.currentDate')}{' '}
									<strong style={{ color: T.ink }}>{data.currentDate.display}</strong>
								</>
							) : (
								t('campaign.timeline.noDate')
							)}
						</div>
						{data.timeline.length === 0 ? (
							<EmptyState
								icon="recent"
								title={t('campaign.timeline.emptyTitle')}
								description={t('campaign.timeline.emptyDesc')}
								action={undefined}
								inset
							/>
						) : (
							<SessionTimeline
								entries={data.timeline.map((row, i) => ({
									time: row.date.display,
									title: row.title,
									detail: '',
									icon: 'campaign-scroll',
									tone: 'info',
									active: i === 0,
								}))}
							/>
						)}
					</Panel>
				)}
			</div>
		</Page>
	);

	return (
		<ListDetail
			list={cards}
			detail={paneTab && <Page>{paneTab === 'quests' ? questForm : factionForm}</Page>}
			detailKey={paneTab && `${paneTab}:${paneRow?.view.id ?? 'new'}`}
			detailLabel={
				paneRow
					? t('campaign.edit', { title: paneRow.view.title })
					: t(paneTab === 'quests' ? 'campaign.quest.new' : 'campaign.faction.new')
			}
		/>
	);
}
