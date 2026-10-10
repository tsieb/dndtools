import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	VAULT_OBJECT_SUBTYPE_KEY,
	actorCanAuthorContent,
	buildWikilinkCandidatesForActor,
	getCalendarContinuityForActor,
	getCalendarTimelineForActor,
	getContentItemsForActor,
	getNoteRelationshipsForActor,
	getTypedRelationshipEdgesForActor,
	listCharactersForActor,
	projectObjectFieldsForRole,
	type CustomDate,
} from '@dndtools/core';
import { Button, EmptyState, NpcCard, SessionTimeline, Tabs, Toaster, tabPanelProps } from '../ds';
import { ListDetail, Page, Panel, T } from '../app/screen-kit';
import { useListDetailSplit } from '../app/useViewport';
import { ContextHelp } from '../app/help/ContextHelp';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { KIND_LABEL } from './campaignVocab';
import {
	edgesTouching,
	mentionsOf,
	npcStoryHome,
	type FactionRow,
	type QuestRow,
} from './campaignRows';
import { FactionCard, QuestCardRow } from './campaign/Cards';
import { StoryLinks } from './campaign/Relationships';
import { CampaignDatePanel } from './session/CampaignDate';
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
 * core's CONTENT-013 AC3 projection, not client-side filtering).
 *
 * RC-KNW-6.6 — every quest, NPC and faction card carries a relationships tray: its typed edges and the
 * notes that link to it (the actor-filtered `getTypedRelationshipEdgesForActor` /
 * `getNoteRelationshipsForActor` reads), with an inline "Add relationship" that writes through the
 * same body write as `/campaign/relationships`. A missing campaign date is set in place with the
 * Session surface's own panel and `session.set-campaign-date` command.
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
	// RC-KNW-6.6 — the Timeline's in-place "Set the campaign date" panel; once a date exists it closes
	// and focus lands on the date line that now shows it.
	const [dateOpen, setDateOpen] = useState(false);
	const dateLine = useRef<HTMLDivElement>(null);

	const restoreLauncher = useRef<'quest' | 'faction' | null>(null);
	// Restore after React commits the closed editor and mounts its launcher. A frame queued
	// from onClose can run before that commit, especially after an asynchronous save.
	useEffect(() => {
		const target = restoreLauncher.current;
		if (!target || (target === 'quest' ? questEditor : factionEditor)) return;
		restoreLauncher.current = null;
		document.querySelector<HTMLButtonElement>(`[data-story-${target}-launch]`)?.focus();
	}, [questEditor, factionEditor]);

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
		return {
			npcs,
			quests,
			factions,
			timeline,
			currentDate: continuity.currentDate,
			calendar: calendarId ? (content.calendars[calendarId] ?? null) : null,
			// `session.set-campaign-date` is DM-only, exactly as the Session panel gates it.
			isDm: role === 'dm',
		};
	}, [runtime.state, actorId]);

	// RC-KNW-6.6 — the open tab's card trays. Each backlink read walks every visible body, so only the
	// entities on screen are read.
	const links = useMemo(() => {
		const { content, permissions } = runtime.state;
		const ids =
			tab === 'quests'
				? data.quests.map((q) => q.view.id)
				: tab === 'factions'
					? data.factions.map((f) => f.view.id)
					: tab === 'npcs'
						? data.npcs.map((n) => n.id)
						: [];
		if (ids.length === 0) return null;
		const candidates = buildWikilinkCandidatesForActor(
			content,
			permissions,
			actorId,
			runtime.state,
		);
		const byId = new Map(candidates.map((c) => [c.id, c]));
		const updatedAt = (id: string) => content.items[id]?.updatedAt ?? '';
		const mentions = new Map(
			ids.map((id) => [
				id,
				mentionsOf(
					getNoteRelationshipsForActor(content, permissions, actorId, id, runtime.state).backlinks,
					byId,
					updatedAt,
				),
			]),
		);
		const edges = getTypedRelationshipEdgesForActor(content, permissions, actorId, runtime.state);
		return { candidates, byId, edges, mentions };
	}, [runtime.state, actorId, tab, data]);
	const linksFor = (entity: { id: string; title: string }, extra?: ReactNode) =>
		links && (
			<StoryLinks
				entity={entity}
				edges={edgesTouching(entity.id, links.edges)}
				mentions={links.mentions.get(entity.id) ?? []}
				candidates={links.candidates}
				canAuthor={canAuthor}
				incomingFirst={tab !== 'npcs'}
			>
				{extra}
			</StoryLinks>
		);
	const cardStack = { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' } as const;

	useEffect(() => {
		if (!dateOpen || !data.currentDate) return;
		setDateOpen(false);
		dateLine.current?.focus();
	}, [dateOpen, data.currentDate]);

	async function setCampaignDate(date: CustomDate, ok: string) {
		try {
			const result = await runtime.dispatch({
				type: 'session.set-campaign-date',
				actorId,
				payload: { date },
			});
			if (result.status === 'accepted') Toaster.success(ok);
			else Toaster.error(result.rejection.message ?? t('campaign.saveFailed'));
		} catch {
			Toaster.error(t('campaign.saveFailed'));
		}
	}

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
				restoreLauncher.current = 'quest';
				setQuestEditor(null);
			}}
		/>
	);
	const factionForm = factionKey !== null && (
		<FactionEditor
			key={factionKey}
			faction={editingFaction}
			draft={factionDraft}
			onClose={() => {
				restoreLauncher.current = 'faction';
				setFactionEditor(null);
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
										<div key={q.view.id} style={cardStack}>
											<QuestCardRow
												row={q}
												canAuthor={canAuthor}
												targeted={questKey === null && questTarget === q.view.id}
												onEdit={() => setQuestEditor({ id: q.view.id })}
											/>
											{linksFor(q.view)}
										</div>
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
							{data.npcs.map((n) => {
								// RC-KNW-6.6 — a narrative NPC's story home: its faction, its place and the note
								// that last mentioned it, all from the relationship reads. AC and HP belong to
								// the sheet, which the name and "Open sheet" both still open.
								const home = links
									? npcStoryHome(n.id, links.edges, links.byId)
									: { faction: null, place: null };
								const last = links?.mentions.get(n.id)?.[0];
								return (
									<div key={n.id} style={cardStack}>
										{/* The card owns its own click: a `role="button"` wrapper's aria-label used to
										    replace the whole subtree, so the role, tags and dm-only chip were
										    inaudible. `disposition` is omitted because nothing in the model backs it,
										    and the kind is not repeated in the tags — `role` already shows it. */}
										<NpcCard
											name={n.name}
											role={KIND_LABEL[n.kind] ? t(KIND_LABEL[n.kind]) : n.kind}
											onClick={() => navigate(`/characters/${n.id}`)}
											tags={[
												home.faction && t('campaign.npc.faction', { name: home.faction }),
												home.place && t('campaign.npc.place', { name: home.place }),
												last && t('campaign.npc.lastMentioned', { title: last.title }),
											].filter((tag): tag is string => !!tag)}
											dmOnly={n.visibility === 'dm-only'}
										/>
										{linksFor(
											{ id: n.id, title: n.name },
											<Button
												variant="ghost"
												size="sm"
												icon="characters-person"
												aria-label={t('campaign.npc.openSheetOf', { name: n.name })}
												onClick={() => navigate(`/characters/${n.id}`)}
											>
												{t('campaign.npc.openSheet')}
											</Button>,
										)}
									</div>
								);
							})}
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
									<div key={f.view.id} style={cardStack}>
										<FactionCard
											row={f}
											canAuthor={canAuthor}
											onEdit={() => setFactionEditor({ id: f.view.id })}
										/>
										{linksFor(f.view)}
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{tab === 'timeline' && (
					<Panel title={t('campaign.timeline.title')}>
						<div
							ref={dateLine}
							tabIndex={-1}
							style={{
								display: 'flex',
								alignItems: 'center',
								flexWrap: 'wrap',
								gap: 'var(--space-2)',
								font: `var(--text-sm) ${T.sans}`,
								color: T.sub,
								marginBottom: 'var(--space-1)',
							}}
						>
							{data.currentDate ? (
								<span>
									{t('campaign.timeline.currentDate')}{' '}
									<strong style={{ color: T.ink }}>{data.currentDate.display}</strong>
								</span>
							) : (
								<>
									<span>{t('campaign.timeline.noDate')}</span>
									{data.isDm && !dateOpen && (
										<Button
											variant="secondary"
											size="sm"
											icon="recent"
											onClick={() => setDateOpen(true)}
										>
											{t('campaign.timeline.setDate')}
										</Button>
									)}
								</>
							)}
						</div>
						{data.isDm && dateOpen && !data.currentDate && (
							<CampaignDatePanel
								calendar={data.calendar}
								current={null}
								previewing={runtime.readOnly}
								onSet={(date, ok) => void setCampaignDate(date, ok)}
							/>
						)}
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
