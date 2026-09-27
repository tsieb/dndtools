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
import { Button, EmptyState, NpcCard, SessionTimeline, Tabs, tabPanelProps } from '../ds';
import { ListDetail, Page, Panel, T } from '../app/screen-kit';
import { useListDetailSplit } from '../app/useViewport';
import { ContextHelp } from '../app/help/ContextHelp';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { KIND_LABEL } from './campaignVocab';
import { type FactionRow, type QuestRow } from './campaignRows';
import { FactionCard, QuestCardRow } from './campaign/Cards';
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
	// RC-WID-5.1 — the quest an "open quest" intent asked for. A reader who cannot author it has no
	// editor to land in, so the card itself is scrolled to, focused and marked current.
	const [questTarget, setQuestTarget] = useState<string | null>(null);

	const canAuthor = actorCanAuthorContent(runtime.state.permissions, actorId);
	const split = useListDetailSplit();

	// Create-intent handoff from "New faction" launchers (⌘K): land on the Factions tab with the
	// editor already open. Consumed once, then cleared.
	useEffect(() => {
		const intent = (location.state ?? null) as {
			createFaction?: boolean;
			openQuestId?: string;
		} | null;
		if (intent?.createFaction) {
			setTab('factions');
			setFactionEditor({ id: null });
			navigate(location.pathname, { replace: true, state: null });
		} else if (typeof intent?.openQuestId === 'string') {
			// RC-WID-5.1 — a widget's "open quest" intent (already read-gated by the core): land on
			// the Quests tab with that quest open. The editor itself still mounts only for an author;
			// everyone else gets the card (`questTarget`).
			setTab('quests');
			setQuestEditor({ id: intent.openQuestId });
			setQuestTarget(intent.openQuestId);
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
			onClose={() => {
				setQuestEditor(null);
				requestAnimationFrame(() =>
					document.querySelector<HTMLButtonElement>('[data-story-quest-launch]')?.focus(),
				);
			}}
		/>
	);
	const factionForm = factionKey !== null && (
		<FactionEditor
			key={factionKey}
			faction={editingFaction}
			draft={factionDraft}
			onClose={() => {
				setFactionEditor(null);
				requestAnimationFrame(() =>
					document.querySelector<HTMLButtonElement>('[data-story-faction-launch]')?.focus(),
				);
			}}
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
					gap: 'var(--space-3)',
					flexWrap: 'wrap',
					marginBottom: 'var(--space-5)',
				}}
			>
				<Tabs
					value={tab}
					onChange={(next: string) => {
						setTab(next);
						setQuestTarget(null);
					}}
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
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
						{!split && questForm}
						{/* "Create the first quest" and the header's "New quest" are ONE accent action in two
						    places, and they are guarded by opposite quest counts — so they live in the two
						    branches of that one condition. As siblings they read as two gold primaries that
						    can show at once (RC-ENG-8.4's emphasis lint), which neither the DM nor the rail
						    tier's editor pane beside them ever sees. */}
						{data.quests.length === 0 ? (
							<EmptyState
								icon="campaign-scroll"
								illustration="quests-empty"
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
											data-story-quest-launch
											onClick={() => setQuestEditor({ id: null })}
										>
											{t('campaign.quest.createFirst')}
										</Button>
									) : undefined
								}
							/>
						) : (
							<>
								{canAuthor && !questEditor && (
									<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
										<Button
											variant="primary"
											size="sm"
											icon="add"
											data-story-quest-launch
											onClick={() => setQuestEditor({ id: null })}
										>
											{t('campaign.quest.new')}
										</Button>
									</div>
								)}
								<div
									style={{
										display: 'grid',
										// Keep a single card within the usable width on narrow phones.
										gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 330px),1fr))',
										gap: 'var(--space-4)',
										alignItems: 'start',
									}}
								>
									{data.quests.map((q) => (
										<QuestCardRow
											key={q.view.id}
											row={q}
											canAuthor={canAuthor}
											targeted={questKey === null && questTarget === q.view.id}
											onEdit={() => setQuestEditor({ id: q.view.id })}
										/>
									))}
								</div>
							</>
						)}
					</div>
				)}

				{tab === 'npcs' &&
					(data.npcs.length === 0 ? (
						<EmptyState
							icon="characters-person"
							illustration="npcs-empty"
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
								gap: 'var(--space-4)',
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
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
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
									data-story-faction-launch
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
								illustration="factions-empty"
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
									gap: 'var(--space-4)',
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
					<Panel title={t('campaign.timeline.title')}>
						<div
							style={{
								font: `var(--text-sm) ${T.sans}`,
								color: T.sub,
								marginBottom: 'var(--space-1)',
							}}
						>
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
								illustration="timeline-empty"
								title={t('campaign.timeline.emptyTitle')}
								description={t('campaign.timeline.emptyDesc')}
								action={undefined}
								inset
							/>
						) : (
							<SessionTimeline
								layout="arc"
								aria-label={t('campaign.timeline.title')}
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
