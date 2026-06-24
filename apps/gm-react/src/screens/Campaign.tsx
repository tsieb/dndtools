import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	getCalendarContinuityForActor,
	getCalendarTimelineForActor,
	getContentItemsForActor,
	listCharactersForActor,
} from '@dndtools/core';
import { Badge, EmptyState, NpcCard, QuestCard, SessionTimeline, Tabs } from '../ds';
import { Page, Panel, T, eb } from '../app/screen-kit';
import { DNDGaps } from '../runtime/mockCampaign';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Campaign — the structured-entity / world-model lens, now wired to the live Processing Core (was
 * static `mockCampaign`). Mirrors the production `routes/campaign` CampaignOverview, which is a
 * READ-ONLY actor-filtered lens (it dispatches no commands): NPCs come from `listCharactersForActor`,
 * the Timeline from `getCalendarTimelineForActor` + the campaign date from `getCalendarContinuityForActor`,
 * and Quests surface real content notes (the Core has no distinct quest/faction entity yet — the
 * production app likewise models them as linked notes). Every read is player-safe: a player/observer
 * sees only their own visible characters/notes, never dm-only material. Campaign-date AUTHORING lives
 * on the Session surface (not here), so this screen never invents an out-of-surface write control.
 */

const STANCE_TONE: Record<string, string> = {
	hostile: 'error',
	neutral: 'neutral',
	friendly: 'success',
	allied: 'accent',
};

const KIND_LABEL: Record<string, string> = { pc: 'PC', npc: 'NPC', monster: 'Monster', sidekick: 'Sidekick' };

function questHook(body: string): string {
	const line = body
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l && !l.startsWith('#'));
	if (!line) return 'A campaign note.';
	return line.replace(/^[>\-*]\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1').slice(0, 180);
}

export function Campaign() {
	const navigate = useNavigate();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [tab, setTab] = useState('quests');

	const data = useMemo(() => {
		const { content, permissions, characters, session, maps } = runtime.state;
		const roster = listCharactersForActor(characters, permissions, actorId);
		const npcs = roster.filter((c) => c.kind !== 'pc');
		// Quests/threads have no distinct Core entity — surface the real content notes (the production
		// CampaignOverview models quests/factions as linked notes too). // no core command for quests.
		const notes = getContentItemsForActor(content, permissions, actorId).filter((n) => n.kind === 'note');
		const calendarId = Object.values(content.calendars)[0]?.id ?? null;
		const timeline = calendarId ? getCalendarTimelineForActor(content, permissions, actorId, calendarId, 'long') : [];
		const continuity = getCalendarContinuityForActor(session, content, maps, permissions, actorId, 'long');
		return { npcs, notes, timeline, currentDate: continuity.currentDate };
	}, [runtime.state, actorId]);

	const tabs = [
		{ id: 'quests', label: 'Threads', icon: 'flag' },
		{ id: 'npcs', label: 'NPCs' },
		{ id: 'factions', label: 'Factions' },
		{ id: 'timeline', label: 'Timeline', icon: 'recent' },
	];

	return (
		<Page>
			<div style={{ marginBottom: 18 }}>
				<Tabs value={tab} onChange={setTab} tabs={tabs} />
			</div>

			{tab === 'quests' &&
				(data.notes.length === 0 ? (
					<EmptyState
						icon="campaign-scroll"
						title="No threads yet"
						description="Campaign threads surface your written notes. Create one in Knowledge to see it here."
						action={undefined}
					/>
				) : (
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 16, alignItems: 'start' }}>
						{data.notes.map((n) => (
							<div
								key={n.id}
								role="button"
								tabIndex={0}
								aria-label={`Open “${n.title}” in Knowledge`}
								onClick={() => navigate('/knowledge')}
								onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/knowledge'); } }}
								style={{ cursor: 'pointer' }}
							>
								<QuestCard
									title={n.title}
									status="active"
									hook={questHook(n.body)}
									objectives={[]}
									dmOnly={n.visibility === 'dm-only'}
								/>
							</div>
						))}
					</div>
				))}

			{tab === 'npcs' &&
				(data.npcs.length === 0 ? (
					<EmptyState
						icon="characters-person"
						title="No NPCs yet"
						description="NPCs and monsters you create in Characters appear here."
						action={undefined}
					/>
				) : (
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16, alignItems: 'start' }}>
						{data.npcs.map((n) => (
							<div
								key={n.id}
								role="button"
								tabIndex={0}
								aria-label={`Open ${n.name} in Characters`}
								onClick={() => navigate('/characters')}
								onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/characters'); } }}
								style={{ cursor: 'pointer' }}
							>
								<NpcCard
									name={n.name}
									role={KIND_LABEL[n.kind] ?? n.kind}
									disposition="neutral"
									hook={`AC ${n.combat?.ac ?? '—'} · ${n.combat?.hp ?? '—'} HP`}
									tags={[KIND_LABEL[n.kind] ?? n.kind]}
									dmOnly={n.visibility === 'dm-only'}
								/>
							</div>
						))}
					</div>
				))}

			{tab === 'factions' && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{/* no core command — factions are not yet a distinct Core entity (the production app defers
					    them, modeling relationships as linked notes). Sample data shown for visual fidelity. */}
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						Factions are not yet a campaign entity in the Core — sample data shown.
					</div>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
						{DNDGaps.factions.map((f: any) => (
							<Panel key={f.id} style={{ gap: 10 }}>
								<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
									<span style={{ font: `700 15px ${T.disp}` }}>{f.name}</span>
									<Badge status={STANCE_TONE[f.stance] || 'neutral'}>{f.stance}</Badge>
								</div>
								<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
									{f.kind} · led by {f.leader}
								</div>
								<div style={{ font: `13px/1.5 ${T.sans}`, color: T.sub }}>{f.desc}</div>
								<div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
									<span style={eb}>Power</span>
									{[1, 2, 3].map((i) => (
										<span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i <= f.power ? T.acc : T.bd }} />
									))}
								</div>
							</Panel>
						))}
					</div>
				</div>
			)}

			{tab === 'timeline' && (
				<Panel title="Campaign timeline" style={{ maxWidth: 680 }}>
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub, marginBottom: 4 }}>
						{data.currentDate ? (
							<>
								Current campaign date: <strong style={{ color: T.ink }}>{data.currentDate.display}</strong>
							</>
						) : (
							'No campaign date set — set it from the Session screen.'
						)}
					</div>
					{data.timeline.length === 0 ? (
						<EmptyState
							icon="recent"
							title="No dated events yet"
							description="Notes with calendar dates build the campaign timeline. Add a date to a note to see it here."
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
		</Page>
	);
}
