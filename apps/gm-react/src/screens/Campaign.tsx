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
	tabPanelProps,
	Textarea,
	Toaster,
	VisibilityChip,
} from '../ds';
import { Page, Panel, T, eb } from '../app/screen-kit';
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
	VIS_OPTIONS,
	optionLabel,
	options,
} from './campaignVocab';

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

/** First non-heading body line, marker-stripped — the one-line summary for list cards. */
function bodySummary(body: string, fallback: string): string {
	const line = body
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l && !l.startsWith('#'));
	if (!line) return fallback;
	return line
		.replace(/^[>\-*]\s+/, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.slice(0, 180);
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strArray = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((entry): entry is string => typeof entry === 'string') : [];

/** A quest objective as declared by the `quest` subtype schema: `{id, text, done}`, in order. */
interface QuestObjective {
	id: string;
	text: string;
	done: boolean;
}

const objectiveArray = (v: unknown): QuestObjective[] =>
	Array.isArray(v)
		? v.filter(
				(entry): entry is QuestObjective =>
					!!entry &&
					typeof entry === 'object' &&
					typeof (entry as QuestObjective).id === 'string' &&
					typeof (entry as QuestObjective).text === 'string' &&
					typeof (entry as QuestObjective).done === 'boolean',
			)
		: [];

/** A quest Vault Object row: the raw item view + its role-projected tracker fields. */
interface QuestRow {
	view: ContentItemView;
	fields: Record<string, unknown>;
}

/** A faction Vault Object row: the raw item view + its role-projected dossier fields. */
interface FactionRow {
	view: ContentItemView;
	fields: Record<string, unknown>;
}

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

/**
 * Inline create/edit quest form (DM-only; the caller gates on `actorCanAuthorContent`). Structured
 * tracker data (status + objectives) lives in the subtype's declared frontmatter fields; the hook /
 * journal prose is the markdown body. Same shape as the FactionEditor beside it — editing dispatches
 * `content.update-object` so a mis-set visibility or objective list stays correctable.
 */
function QuestEditor({ quest, onClose }: { quest: QuestRow | null; onClose: () => void }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const existingObjectives = objectiveArray(quest?.fields.objectives);
	const [title, setTitle] = useState(quest?.view.title ?? '');
	const [status, setStatus] = useState(str(quest?.fields.status) || 'active');
	const [objectivesText, setObjectivesText] = useState(
		existingObjectives.map((o) => o.text).join('\n'),
	);
	const [body, setBody] = useState(quest?.view.body ?? '');
	const [visibility, setVisibility] = useState<string>(quest?.view.visibility ?? 'dm-only');
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	async function save() {
		if (!title.trim()) {
			setErr(t('campaign.quest.needsTitle'));
			return;
		}
		setBusy(true);
		setErr(null);
		// `runtime.dispatch` RETHROWS on a persist failure (SceneRuntime.dispatchNow), and `busy` also
		// disables this panel's Cancel button — so a throw froze the editor permanently with the DM's
		// typed work unrecoverable and no way out but a reload. Any await inside a busy guard in this
		// app needs `finally`.
		try {
			const stamp = Date.now().toString(36);
			// Line i keeps existing objective i's id + done state (a text edit doesn't reset the checklist);
			// new lines become fresh unchecked objectives.
			const objectives: QuestObjective[] = objectivesText
				.split('\n')
				.map((t) => t.trim())
				.filter(Boolean)
				.map((text, i) =>
					existingObjectives[i]
						? { ...existingObjectives[i], text }
						: { id: `obj-${stamp}-${i}`, text, done: false },
				);
			const result = quest
				? // content.update-object — authorized-editor edit; merged frontmatter is re-validated.
					await runtime.dispatch({
						type: 'content.update-object',
						actorId,
						payload: {
							itemId: quest.view.id,
							title: title.trim(),
							fields: { title: title.trim(), status, objectives },
							body,
						},
					})
				: // content.create-object — DM-only vault authoring against the declared `quest` schema
					// (validated fail-closed before any durable write); visibility fails closed to dm-only.
					await runtime.dispatch({
						type: 'content.create-object',
						actorId,
						payload: {
							subtype: 'quest',
							title: title.trim(),
							fields: { title: title.trim(), status, objectives },
							body,
							visibility,
						},
					});
			if (result.status !== 'accepted') {
				setErr(result.rejection.message);
				return;
			}
			// Visibility is a SEPARATE command on edit (same split as FactionEditor / Knowledge).
			if (quest && visibility !== quest.view.visibility) {
				const vis = await runtime.dispatch({
					type: 'content.set-item-visibility',
					actorId,
					payload: { itemId: quest.view.id, visibility },
				});
				if (vis.status !== 'accepted') {
					setErr(vis.rejection.message);
					return;
				}
			}
			// Confirm the write. `onClose()` unmounts this whole Panel, so with no toast a successful
			// save was indistinguishable from a dead button: the editor vanished, focus fell to <body>,
			// and nothing anywhere said the quest had been stored.
			Toaster.success(
				quest
					? t('campaign.saved', { title: title.trim() })
					: t('campaign.created', { title: title.trim() }),
			);
			onClose();
		} catch {
			setErr(t('campaign.saveFailed'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Panel
			title={quest ? t('campaign.edit', { title: quest.view.title }) : t('campaign.quest.new')}
			accent
		>
			{/* A real <form> so Enter submits — the natural "type a title, press Enter" was a no-op. */}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (busy) return;
					void save();
				}}
				style={{ display: 'contents' }}
			>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
						gap: 12,
					}}
				>
					<Field label={t('common.field.title')} required>
						<Input
							value={title}
							onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
							placeholder={t('campaign.quest.titlePlaceholder')}
						/>
					</Field>
					<Field label={t('campaign.status')}>
						<Select
							options={options(QUEST_STATUS_OPTIONS, t)}
							value={status}
							onChange={(e: { target: { value: string } }) => setStatus(e.target.value)}
						/>
					</Field>
				</div>
				<Field label={t('campaign.quest.objectives')} help={t('campaign.quest.objectivesHelp')}>
					<Textarea
						value={objectivesText}
						onChange={(e: { target: { value: string } }) => setObjectivesText(e.target.value)}
						rows={3}
						placeholder={t('campaign.quest.objectivesPlaceholder')}
					/>
				</Field>
				<Field label={t('campaign.quest.hook')} help={t('campaign.quest.hookHelp')}>
					<Textarea
						value={body}
						onChange={(e: { target: { value: string } }) => setBody(e.target.value)}
						rows={4}
						placeholder={t('campaign.quest.hookPlaceholder')}
					/>
				</Field>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					<Field label={t('common.visibility.label')}>
						<Select
							options={options(VIS_OPTIONS, t)}
							value={visibility}
							onChange={(e: { target: { value: string } }) => setVisibility(e.target.value)}
						/>
					</Field>
					<div style={{ flex: 1 }} />
					{err && (
						<span role="alert" style={{ font: `12px ${T.sans}`, color: T.err }}>
							{err}
						</span>
					)}
					<Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button type="submit" variant="primary" size="sm" icon="check" disabled={busy}>
						{quest ? t('campaign.quest.save') : t('campaign.quest.create')}
					</Button>
				</div>
			</form>
		</Panel>
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

/**
 * Inline create/edit dossier form (DM-only; the caller gates on `actorCanAuthorContent`, and while
 * previewing the runtime rejects every dispatch read-only anyway). Structured card data lives in the
 * subtype's declared frontmatter fields; the prose dossier is the markdown body.
 */
function FactionEditor({ faction, onClose }: { faction: FactionRow | null; onClose: () => void }) {
	const runtime = useRuntime();
	const { t } = useI18n();
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
			setErr(t('campaign.faction.needsName'));
			return;
		}
		setBusy(true);
		setErr(null);
		// `runtime.dispatch` RETHROWS on a persist failure (SceneRuntime.dispatchNow), and `busy` also
		// disables this panel's Cancel button — so a throw froze the editor permanently with the DM's
		// typed work unrecoverable and no way out but a reload. Any await inside a busy guard in this
		// app needs `finally`.
		try {
			// Exactly the subtype's declared frontmatter fields — the core validates them fail-closed
			// against the `faction` schema before any durable write (an undeclared field is rejected).
			const fields = {
				name: name.trim(),
				kind,
				stance,
				leader: leader.trim(),
				goals: goalsText
					.split('\n')
					.map((g) => g.trim())
					.filter(Boolean),
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
					setErr(vis.rejection.message);
					return;
				}
			}
			// Same reason as the quest editor above: the Panel unmounts, so the toast is the only
			// confirmation a successful faction save ever produces.
			Toaster.success(
				faction
					? t('campaign.saved', { title: name.trim() })
					: t('campaign.created', { title: name.trim() }),
			);
			onClose();
		} catch {
			setErr(t('campaign.saveFailed'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Panel
			title={
				faction ? t('campaign.edit', { title: faction.view.title }) : t('campaign.faction.new')
			}
			accent
		>
			{/* See QuestEditor — Enter submits rather than doing nothing. */}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (busy) return;
					void save();
				}}
				style={{ display: 'contents' }}
			>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
						gap: 12,
					}}
				>
					<Field label={t('campaign.faction.name')} required>
						<Input
							value={name}
							onChange={(e: { target: { value: string } }) => setName(e.target.value)}
							placeholder={t('campaign.faction.namePlaceholder')}
						/>
					</Field>
					<Field label={t('campaign.faction.kind')}>
						<Select
							options={options(FACTION_KIND_OPTIONS, t)}
							value={kind}
							onChange={(e: { target: { value: string } }) => setKind(e.target.value)}
						/>
					</Field>
					<Field label={t('campaign.faction.stance')}>
						<Select
							options={options(STANCE_OPTIONS, t)}
							value={stance}
							onChange={(e: { target: { value: string } }) => setStance(e.target.value)}
						/>
					</Field>
					<Field label={t('campaign.faction.leader')}>
						<Input
							value={leader}
							onChange={(e: { target: { value: string } }) => setLeader(e.target.value)}
							placeholder={t('campaign.faction.leaderPlaceholder')}
						/>
					</Field>
				</div>
				<Field label={t('campaign.faction.goals')} help={t('campaign.faction.goalsHelp')}>
					<Textarea
						value={goalsText}
						onChange={(e: { target: { value: string } }) => setGoalsText(e.target.value)}
						rows={3}
						placeholder={t('campaign.faction.goalsPlaceholder')}
					/>
				</Field>
				<Field label={t('campaign.faction.dossier')} help={t('campaign.faction.dossierHelp')}>
					<Textarea
						value={body}
						onChange={(e: { target: { value: string } }) => setBody(e.target.value)}
						rows={5}
						placeholder={t('campaign.faction.dossierPlaceholder')}
					/>
				</Field>
				<Field label={t('campaign.faction.secret')} help={t('campaign.faction.secretHelp')}>
					<Input
						value={secret}
						onChange={(e: { target: { value: string } }) => setSecret(e.target.value)}
						placeholder={t('campaign.faction.secretPlaceholder')}
					/>
				</Field>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					<Field label={t('common.visibility.label')}>
						<Select
							options={options(VIS_OPTIONS, t)}
							value={visibility}
							onChange={(e: { target: { value: string } }) => setVisibility(e.target.value)}
						/>
					</Field>
					<div style={{ flex: 1 }} />
					{err && (
						<span role="alert" style={{ font: `12px ${T.sans}`, color: T.err }}>
							{err}
						</span>
					)}
					<Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button type="submit" variant="primary" size="sm" icon="check" disabled={busy}>
						{faction ? t('campaign.faction.save') : t('campaign.faction.create')}
					</Button>
				</div>
			</form>
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

	return (
		<Page>
			<div style={{ marginBottom: 18 }}>
				<Tabs
					value={tab}
					onChange={setTab}
					tabs={tabs}
					idBase="campaign"
					aria-label={t('campaign.sections')}
				/>
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
						{canAuthor && questEditor && (
							<QuestEditor
								key={questEditor.id ?? 'new'}
								quest={editingQuest}
								onClose={() => setQuestEditor(null)}
							/>
						)}
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
						{canAuthor && !factionEditor && (
							<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
								<Button
									variant="primary"
									size="sm"
									icon="add"
									onClick={() => setFactionEditor({ id: null })}
								>
									{t('campaign.faction.new')}
								</Button>
							</div>
						)}
						{canAuthor && factionEditor && (
							<FactionEditor
								key={factionEditor.id ?? 'new'}
								faction={editingFaction}
								onClose={() => setFactionEditor(null)}
							/>
						)}
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
}
