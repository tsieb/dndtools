import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	VAULT_OBJECT_SUBTYPE_KEY,
	actorCanAuthorContent,
	getCalendarContinuityForActor,
	getCalendarTimelineForActor,
	getContentItemsForActor,
	listCharactersForActor,
	projectObjectFieldsForRole,
	type ContentItemView,
} from '@dndtools/core';
import {
	Badge,
	Button,
	EmptyState,
	Field,
	IconButton,
	Input,
	NpcCard,
	QuestCard,
	Select,
	SessionTimeline,
	Tabs,
	Textarea,
	VisibilityChip,
} from '../ds';
import { Page, Panel, T, eb } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Campaign — the structured-entity / world-model lens, wired to the live Processing Core (was
 * static `mockCampaign`). Mirrors the production `routes/campaign` CampaignOverview reads: NPCs come
 * from `listCharactersForActor`, the Timeline from `getCalendarTimelineForActor` + the campaign date
 * from `getCalendarContinuityForActor`, Quests surface real content notes, and FACTIONS are real
 * note-backed Vault Objects (`kind: 'object'`, subtype `faction`) authored through the real
 * `content.create-object` / `content.update-object` / `content.set-item-visibility` commands. Every
 * read is player-safe: a player/observer sees only their visible items, and the faction dossier's
 * dm-only `secret` field is OMITTED from non-DM projections by `projectObjectFieldsForRole` (the
 * core's CONTENT-013 AC3 projection, not client-side filtering). Campaign-date AUTHORING lives on
 * the Session surface (not here), so this screen never invents an out-of-surface write control.
 */

const STANCE_TONE: Record<string, string> = {
	hostile: 'error',
	neutral: 'neutral',
	friendly: 'success',
	allied: 'accent',
};

const STANCE_OPTIONS = [
	{ value: 'hostile', label: 'Hostile' },
	{ value: 'neutral', label: 'Neutral' },
	{ value: 'friendly', label: 'Friendly' },
	{ value: 'allied', label: 'Allied' },
];

const FACTION_KIND_OPTIONS = [
	{ value: 'cult', label: 'Cult' },
	{ value: 'militia', label: 'Militia' },
	{ value: 'guild', label: 'Guild' },
	{ value: 'party', label: 'Party' },
	{ value: 'order', label: 'Order' },
	{ value: 'other', label: 'Other' },
];

// Core visibility → the safety-critical VisibilityChip level (same map as Knowledge).
const VIS_CHIP: Record<string, string> = { 'dm-only': 'dm-only', 'player-visible': 'players', shared: 'players' };
const VIS_OPTIONS = [
	{ value: 'dm-only', label: 'DM only' },
	{ value: 'player-visible', label: 'Players' },
	{ value: 'shared', label: 'Shared' },
];

const KIND_LABEL: Record<string, string> = { pc: 'PC', npc: 'NPC', monster: 'Monster', sidekick: 'Sidekick' };

/** First non-heading body line, marker-stripped — the one-line summary for list cards. */
function bodySummary(body: string, fallback: string): string {
	const line = body
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l && !l.startsWith('#'));
	if (!line) return fallback;
	return line.replace(/^[>\-*]\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1').slice(0, 180);
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strArray = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((entry): entry is string => typeof entry === 'string') : [];

/** A faction Vault Object row: the raw item view + its role-projected dossier fields. */
interface FactionRow {
	view: ContentItemView;
	fields: Record<string, unknown>;
}

function FactionCard({ row, canAuthor, onEdit }: { row: FactionRow; canAuthor: boolean; onEdit: () => void }) {
	const { view, fields } = row;
	const stance = str(fields.stance) || 'neutral';
	const kind = str(fields.kind);
	const leader = str(fields.leader);
	const goals = strArray(fields.goals);
	// Only present at all for the DM — `projectObjectFieldsForRole` omits dm-only fields for others.
	const secret = str(fields.secret);
	return (
		<Panel style={{ gap: 10 }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
				<span style={{ font: `700 15px ${T.disp}`, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
					{view.title}
				</span>
				<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
					<Badge status={STANCE_TONE[stance] || 'neutral'}>{stance}</Badge>
					{canAuthor && <IconButton icon="note-edit" label={`Edit ${view.title}`} variant="ghost" size="sm" onClick={onEdit} />}
				</div>
			</div>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
				<VisibilityChip level={VIS_CHIP[view.visibility] || 'dm-only'} />
				{(kind || leader) && (
					<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{kind}
						{kind && leader ? ' · ' : ''}
						{leader ? `led by ${leader}` : ''}
					</span>
				)}
			</div>
			<div style={{ font: `13px/1.5 ${T.sans}`, color: T.sub }}>{bodySummary(view.body, 'No dossier written yet.')}</div>
			{goals.length > 0 && (
				<div>
					<div style={{ ...eb, marginBottom: 4 }}>Goals</div>
					{goals.map((goal, i) => (
						<div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 7, font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
							<span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: T.accBd, flexShrink: 0, transform: 'translateY(-2px)' }} />
							<span style={{ minWidth: 0 }}>{goal}</span>
						</div>
					))}
				</div>
			)}
			{secret && (
				<div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 8 }}>
					<div style={{ ...eb, color: T.dm, marginBottom: 3 }}>DM secret</div>
					<div style={{ font: `italic 12.5px/1.5 ${T.sans}`, color: T.sub }}>{secret}</div>
				</div>
			)}
		</Panel>
	);
}

/**
 * Inline create/edit dossier form (DM-only; the caller gates on `actorCanAuthorContent`, and while
 * previewing the runtime rejects every dispatch read-only anyway). Structured card data lives in the
 * subtype's declared frontmatter fields; the prose dossier is the markdown body.
 */
function FactionEditor({ faction, onClose }: { faction: FactionRow | null; onClose: () => void }) {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [name, setName] = useState(faction?.view.title ?? '');
	const [kind, setKind] = useState(str(faction?.fields.kind) || 'other');
	const [stance, setStance] = useState(str(faction?.fields.stance) || 'neutral');
	const [leader, setLeader] = useState(str(faction?.fields.leader));
	const [goalsText, setGoalsText] = useState(strArray(faction?.fields.goals).join('\n'));
	const [secret, setSecret] = useState(str(faction?.fields.secret));
	const [body, setBody] = useState(faction?.view.body ?? '');
	// Widened to string (same as Knowledge's visibility control): the Select yields a string and the
	// core validates the enum fail-closed at dispatch.
	const [visibility, setVisibility] = useState<string>(faction?.view.visibility ?? 'dm-only');
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	async function save() {
		if (!name.trim()) {
			setErr('A faction needs a name.');
			return;
		}
		setBusy(true);
		setErr(null);
		// Exactly the subtype's declared frontmatter fields — the core validates them fail-closed
		// against the `faction` schema before any durable write (an undeclared field is rejected).
		const fields = {
			name: name.trim(),
			kind,
			stance,
			leader: leader.trim(),
			goals: goalsText.split('\n').map((g) => g.trim()).filter(Boolean),
			secret: secret.trim(),
		};
		const result = faction
			? // content.update-object — authorized-editor edit; merged frontmatter is re-validated.
			  await runtime.dispatch({
					type: 'content.update-object',
					actorId,
					payload: { itemId: faction.view.id, title: name.trim(), fields, body },
			  })
			: // content.create-object — DM-only vault authoring; visibility fails closed to dm-only.
			  await runtime.dispatch({
					type: 'content.create-object',
					actorId,
					payload: { subtype: 'faction', title: name.trim(), fields, body, visibility },
			  });
		if (result.status !== 'accepted') {
			setBusy(false);
			setErr(result.rejection.message);
			return;
		}
		// Visibility is a SEPARATE command on edit (same split as Knowledge).
		if (faction && visibility !== faction.view.visibility) {
			const vis = await runtime.dispatch({
				type: 'content.set-item-visibility',
				actorId,
				payload: { itemId: faction.view.id, visibility },
			});
			if (vis.status !== 'accepted') {
				setBusy(false);
				setErr(vis.rejection.message);
				return;
			}
		}
		setBusy(false);
		onClose();
	}

	return (
		<Panel title={faction ? `Edit ${faction.view.title}` : 'New faction'} accent>
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
				<Field label="Name" required>
					<Input value={name} onChange={(e: { target: { value: string } }) => setName(e.target.value)} placeholder="The Brine Hand" />
				</Field>
				<Field label="Kind">
					<Select options={FACTION_KIND_OPTIONS} value={kind} onChange={(e: { target: { value: string } }) => setKind(e.target.value)} />
				</Field>
				<Field label="Stance">
					<Select options={STANCE_OPTIONS} value={stance} onChange={(e: { target: { value: string } }) => setStance(e.target.value)} />
				</Field>
				<Field label="Leader">
					<Input value={leader} onChange={(e: { target: { value: string } }) => setLeader(e.target.value)} placeholder="Mother Sild" />
				</Field>
			</div>
			<Field label="Goals" help="One goal per line.">
				<Textarea value={goalsText} onChange={(e: { target: { value: string } }) => setGoalsText(e.target.value)} rows={3} placeholder={'Wake what sleeps below the vaults\nKeep the shipment route open'} />
			</Field>
			<Field label="Dossier notes" help="Markdown prose — summary, holdings, history.">
				<Textarea value={body} onChange={(e: { target: { value: string } }) => setBody(e.target.value)} rows={5} placeholder="A drowned-god cult that took the Sunken Outpost as a smuggling waypoint…" />
			</Field>
			<Field label="DM secret" help="Never shown to players — omitted from their projection by the Core.">
				<Input value={secret} onChange={(e: { target: { value: string } }) => setSecret(e.target.value)} placeholder="Sild translates for the cult rather than leading it." />
			</Field>
			<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
				<Field label="Visibility">
					<Select options={VIS_OPTIONS} value={visibility} onChange={(e: { target: { value: string } }) => setVisibility(e.target.value)} />
				</Field>
				<div style={{ flex: 1 }} />
				{err && (
					<span role="alert" style={{ font: `12px ${T.sans}`, color: T.err }}>
						{err}
					</span>
				)}
				<Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
					Cancel
				</Button>
				<Button variant="primary" size="sm" icon="check" disabled={busy} onClick={save}>
					{faction ? 'Save faction' : 'Create faction'}
				</Button>
			</div>
		</Panel>
	);
}

export function Campaign() {
	const navigate = useNavigate();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [tab, setTab] = useState('quests');
	// null = closed · { id: null } = composing a new faction · { id } = editing that faction.
	const [factionEditor, setFactionEditor] = useState<{ id: string | null } | null>(null);

	const canAuthor = actorCanAuthorContent(runtime.state.permissions, actorId);

	const data = useMemo(() => {
		const { content, permissions, characters, session, maps } = runtime.state;
		const roster = listCharactersForActor(characters, permissions, actorId);
		const npcs = roster.filter((c) => c.kind !== 'pc');
		const items = getContentItemsForActor(content, permissions, actorId);
		// Quests/threads have no distinct Core entity — surface the real content notes (the production
		// CampaignOverview models quests as linked notes too). // no core command for quests.
		const notes = items.filter((n) => n.kind === 'note');
		// Factions ARE a Core entity: note-backed Vault Objects of subtype `faction`. The dossier fields
		// are projected per the actor's role, so a non-DM never receives the dm-only `secret`.
		const role = permissions.actors[actorId]?.role ?? 'observer';
		const factions: FactionRow[] = items
			.filter((n) => n.kind === 'object' && n.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'faction')
			.map((n) => ({ view: n, fields: projectObjectFieldsForRole('faction', n.fields, role) }));
		const calendarId = Object.values(content.calendars)[0]?.id ?? null;
		const timeline = calendarId ? getCalendarTimelineForActor(content, permissions, actorId, calendarId, 'long') : [];
		const continuity = getCalendarContinuityForActor(session, content, maps, permissions, actorId, 'long');
		return { npcs, notes, factions, timeline, currentDate: continuity.currentDate };
	}, [runtime.state, actorId]);

	const tabs = [
		{ id: 'quests', label: 'Threads', icon: 'flag' },
		{ id: 'npcs', label: 'NPCs' },
		{ id: 'factions', label: 'Factions' },
		{ id: 'timeline', label: 'Timeline', icon: 'recent' },
	];

	const editingFaction = factionEditor?.id ? data.factions.find((f) => f.view.id === factionEditor.id) ?? null : null;

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
									hook={bodySummary(n.body, 'A campaign note.')}
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
				<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
					{canAuthor && !factionEditor && (
						<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
							<Button variant="primary" size="sm" icon="add" onClick={() => setFactionEditor({ id: null })}>
								New faction
							</Button>
						</div>
					)}
					{canAuthor && factionEditor && (
						<FactionEditor key={factionEditor.id ?? 'new'} faction={editingFaction} onClose={() => setFactionEditor(null)} />
					)}
					{data.factions.length === 0 ? (
						<EmptyState
							icon="flag"
							title="No factions yet"
							description={
								canAuthor
									? 'Chart the powers pulling at your table — create the first faction dossier.'
									: 'No factions have been shared with you yet.'
							}
							action={undefined}
						/>
					) : (
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16, alignItems: 'start' }}>
							{data.factions.map((f) => (
								<FactionCard key={f.view.id} row={f} canAuthor={canAuthor} onEdit={() => setFactionEditor({ id: f.view.id })} />
							))}
						</div>
					)}
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
