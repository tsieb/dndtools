import { useEffect, useRef, useState } from 'react';
import { Badge, IconButton, QuestCard, Select, Toaster, VisibilityChip } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	FACTION_KIND_OPTIONS,
	QUEST_CARD_STATUS,
	QUEST_STATUS_OPTIONS,
	STANCE_OPTIONS,
	STANCE_TONE,
	VIS_CHIP,
	optionLabel,
	options,
} from '../campaignVocab';
import {
	bodySummary,
	objectiveArray,
	str,
	strArray,
	type FactionRow,
	type QuestRow,
} from '../campaignRows';

/**
 * One quest in the Threads list: the DS QuestCard (status header · hook · objective checklist) with
 * the checklist and a status select wired to durable `content.update-object` writes. The update
 * handler merges declared fields, so each write sends ONLY the field it changes — except objectives,
 * which are one declared array and therefore always written whole.
 */
export function QuestCardRow({
	row,
	canAuthor,
	targeted,
	onEdit,
}: {
	row: QuestRow;
	canAuthor: boolean;
	/** RC-WID-5.1 — this quest is where an "open quest" intent landed and no editor is showing it. */
	targeted: boolean;
	onEdit: () => void;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const [busy, setBusy] = useState(false);
	// A ref, not `busy`, gates re-entry: two presses inside one render both see `busy === false`.
	const writing = useRef(false);
	const status = str(row.fields.status) || 'active';
	const objectives = objectiveArray(row.fields.objectives);
	const rowRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!targeted) return;
		rowRef.current?.scrollIntoView({ block: 'center' });
		rowRef.current?.focus({ preventScroll: true });
	}, [targeted]);

	async function update(fields: Record<string, unknown>) {
		if (writing.current) return;
		writing.current = true;
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: 'content.update-object',
				actorId,
				payload: { itemId: row.view.id, fields },
			});
			if (result.status !== 'accepted') Toaster.error(result.rejection.message);
			else Toaster.success(t('campaign.saved', { title: row.view.title }));
		} catch {
			Toaster.error(t('campaign.saveFailed'));
		} finally {
			writing.current = false;
			setBusy(false);
		}
	}

	return (
		<div
			ref={rowRef}
			data-quest-id={row.view.id}
			tabIndex={targeted ? -1 : undefined}
			aria-current={targeted ? 'true' : undefined}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				...(targeted ? { outline: `2px solid ${T.acc}`, outlineOffset: 'var(--space-1)' } : null),
			}}
		>
			<QuestCard
				title={row.view.title}
				status={QUEST_CARD_STATUS[status] ?? 'active'}
				hook={bodySummary(row.view.body, t('campaign.quest.noHook'))}
				objectives={objectives.map((o) => ({ label: o.text, done: o.done }))}
				// Stays mounted while a write is in flight: dropping the handler swaps each objective
				// <button> for plain text, which throws keyboard focus to <body>. `update` drops repeats.
				onToggleObjective={
					canAuthor
						? (i: number) =>
								void update({
									objectives: objectives.map((o, j) => (j === i ? { ...o, done: !o.done } : o)),
								})
						: undefined
				}
				footer={
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
							flexWrap: 'wrap',
						}}
					>
						{/* EVERY quest carries the safety-critical visibility cue (not only dm-only ones) — the
				    same always-on chip FactionCard shows, so a mis-set visibility is visible at a glance. */}
						<VisibilityChip level={VIS_CHIP[row.view.visibility] || 'dm-only'} compact />
						{canAuthor && (
							<>
								<div style={{ flex: 1 }} />
								<IconButton
									style={{ minWidth: 'var(--space-12)', minHeight: 'var(--space-12)' }}
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
									disabled={busy}
									onChange={(e: { target: { value: string } }) =>
										void update({ status: e.target.value })
									}
								/>
							</>
						)}
					</div>
				}
			/>
		</div>
	);
}

export function FactionCard({
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
		<Panel
			style={{
				gap: 'var(--space-2)',
				background: T.surf,
				borderLeft: `var(--space-1) solid ${view.visibility === 'dm-only' ? T.dm : T.accBd}`,
				overflowWrap: 'anywhere',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 'var(--space-2)',
				}}
			>
				{/* <h3> to match NpcCard/QuestCard — the Factions grid was the only one a screen-reader
				    user could not navigate by heading. */}
				<h3
					style={{
						margin: 'var(--space-0, 0)',
						font: `var(--font-weight-bold) var(--text-md)/1.15 ${T.sans}`,
						minWidth: 0,
					}}
				>
					{view.title}
				</h3>
				<div
					style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)', flexShrink: 0 }}
				>
					<Badge
						icon={stance === 'neutral' ? 'remove' : stance === 'allied' ? 'group' : undefined}
						status={STANCE_TONE[stance] || 'neutral'}
					>
						{optionLabel(STANCE_OPTIONS, stance, t)}
					</Badge>
					{canAuthor && (
						<IconButton
							style={{ minWidth: 'var(--space-12)', minHeight: 'var(--space-12)' }}
							icon="note-edit"
							label={t('campaign.edit', { title: view.title })}
							variant="ghost"
							size="sm"
							onClick={onEdit}
						/>
					)}
				</div>
			</div>
			<div
				style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}
			>
				<VisibilityChip level={VIS_CHIP[view.visibility] || 'dm-only'} />
				{(kind || leader) && (
					<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
						{kind ? optionLabel(FACTION_KIND_OPTIONS, kind, t) : ''}
						{kind && leader ? ' · ' : ''}
						{leader ? t('campaign.faction.ledBy', { name: leader }) : ''}
					</span>
				)}
			</div>
			<div style={{ font: `var(--text-sm)/1.5 ${T.sans}`, color: T.sub }}>
				{bodySummary(view.body, t('campaign.faction.noDossier'))}
			</div>
			{goals.length > 0 && (
				<div>
					<div style={{ ...eb, marginBottom: 'var(--space-1)' }}>{t('campaign.faction.goals')}</div>
					{goals.map((goal, i) => (
						<div
							key={i}
							style={{
								display: 'flex',
								alignItems: 'baseline',
								gap: 'var(--space-2)',
								font: `var(--text-sm)/1.6 ${T.sans}`,
								color: T.sub,
							}}
						>
							<span
								aria-hidden
								style={{
									width: 5,
									height: 5,
									borderRadius: 'var(--radius-full)',
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
				<div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 'var(--space-2)' }}>
					<div style={{ ...eb, color: T.ink, marginBottom: 'var(--space-1)' }}>
						{t('campaign.faction.secret')}
					</div>
					<div style={{ font: `italic var(--text-sm)/1.5 ${T.sans}`, color: T.sub }}>{secret}</div>
				</div>
			)}
		</Panel>
	);
}
