import { allowedTransitionsFrom, type SessionWorkflowState } from '@dndtools/core';
import { Button, Card, Dialog, Icon, StatusDot } from '../../ds';
import { Seg, T, eb } from '../../app/screen-kit';
import { WORKFLOW_LABEL } from '../../app/ProjectionControl';
import { useI18n, type MessageKey } from '../../i18n';

export function SessionHeader({
	workflow,
	sceneName,
	previewing,
	isDm,
	onSetWorkflow,
}: {
	workflow: string;
	sceneName: string | null;
	previewing: boolean;
	isDm: boolean;
	onSetWorkflow: (w: 'idle' | 'prep' | 'active' | 'recap') => void;
}) {
	const { t } = useI18n();
	const phase =
		workflow === 'active'
			? 'active'
			: workflow === 'recap'
				? 'recap'
				: workflow === 'prep'
					? 'prep'
					: 'idle';
	// Only offer phases the core workflow table allows from here, so a click can't fire a rejected
	// transition + error toast (e.g. active→prep, recap→active are not legal). The current phase stays
	// enabled regardless (Seg keeps the checked option active).
	const allowed = new Set<string>(allowedTransitionsFrom(workflow as SessionWorkflowState));
	// One sentence, split around the scene name so the name keeps its emphasis and the sentence
	// keeps its locale's word order.
	const scene = sceneName ?? t('session.header.theScene');
	const playersSee = t('session.header.playersSee', { scene });
	const [playersSeeBefore, playersSeeAfter = ''] = playersSee.split(scene);
	// Previewing as a player (or being a player at all) has to block the rail as well as the core.
	// Without this, ArrowLeft from "Live" while previewing raised the full-red "End the live session?"
	// dialog for a teardown that would then be refused read-only — the loudest possible lie about what
	// a press was going to do.
	const blocked = previewing
		? t('session.header.blockedPreview')
		: !isDm
			? t('session.header.blockedNotDm')
			: null;
	const option = (value: string, label: string, reason: string) => ({
		value,
		label,
		disabled: blocked ? value !== phase : !allowed.has(value),
		title: value === phase ? undefined : (blocked ?? (allowed.has(value) ? undefined : reason)),
	});
	return (
		<div
			style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}
		>
			<div style={{ minWidth: 0 }}>
				<div style={eb}>{t('session.header.eyebrow')}</div>
				<div style={{ font: `700 19px/1.1 ${T.disp}` }}>
					{sceneName ?? t('session.header.noScene')}
				</div>
			</div>
			<Seg
				value={phase}
				ariaLabel={t('session.header.phaseLabel')}
				onChange={(v) => onSetWorkflow(v as 'idle' | 'prep' | 'active' | 'recap')}
				options={[
					// `idle` (Standby) has to be offered. Without it, `recap` — whose only legal moves
					// are recap/archived/idle — had EVERY segment disabled or already checked, and the
					// standby card's Go live was rejected by the core, so a DM who ended one session
					// could not start another without editing IndexedDB.
					option('idle', t('session.state.standby'), t('session.phase.standbyReason')),
					option('prep', t('session.state.prep'), t('session.phase.prepReason')),
					option('active', t('session.state.live'), t('session.phase.liveReason')),
					option('recap', t('session.state.recap'), t('session.phase.recapReason')),
				]}
			/>
			<div style={{ flex: 1 }} />
			<span
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 7,
					font: `12.5px ${T.sans}`,
					color: T.sub,
				}}
			>
				<StatusDot status={workflow === 'active' ? 'live' : 'idle'} pulse={workflow === 'active'} />
				{workflow === 'active' ? (
					<>
						{playersSeeBefore}
						<strong style={{ color: T.ink }}>{scene}</strong>
						{playersSeeAfter}
					</>
				) : (
					// Was a hard-coded "Standby" for all six non-live states, sitting right beside a
					// Seg that showed a different phase — the header and the control disagreed.
					<>{t(WORKFLOW_LABEL[workflow as SessionWorkflowState] ?? 'session.state.standby')}</>
				)}
			</span>
		</div>
	);
}

/**
 * The standby card — the one route back to a live session. Shown for every non-live workflow, it
 * names the real state and either offers "Go live" or says which state has to be left first.
 */
export function StandbyCard({
	workflow,
	canGoLive,
	previewing,
	isDm,
	onGoLive,
	t,
}: {
	workflow: SessionWorkflowState;
	canGoLive: boolean;
	previewing: boolean;
	isDm: boolean;
	onGoLive: () => void;
	t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
	return (
		<Card
			elevation="flat"
			padding="md"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 14,
				marginBottom: 18,
				borderColor: T.accBd,
				background: T.accSub,
				flexWrap: 'wrap',
			}}
		>
			<Icon name="info" size="md" color={T.acc} />
			<div style={{ flex: 1 }}>
				<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>
					{/* This used to read "Session is on standby" for EVERY non-live workflow, so
					    the one state you cannot go live from — Recap — described itself as the
					    one state you can. Name the real state, as ProjectionControl does. */}
					{t('session.state.current', {
						state: t(WORKFLOW_LABEL[workflow] ?? 'session.state.standby'),
					})}
				</div>
				<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
					{canGoLive
						? t('session.goLive.hint')
						: t('session.goLive.returnToStandby', {
								state: t(WORKFLOW_LABEL[workflow] ?? 'session.state.standby'),
							})}
				</div>
			</div>
			<Button
				variant="primary"
				size="sm"
				icon="visibility-players"
				// aria-disabled, not `disabled`: the reason has to stay announceable. And
				// `canGoLive` is the fix for the real defect — from `recap` this button was
				// fully enabled while the core forbids recap→active, so every press produced a
				// guaranteed rejection toast and the screen offered no other way out.
				aria-disabled={previewing || !isDm || !canGoLive || undefined}
				title={
					previewing
						? t('session.goLive.exitPreview')
						: !canGoLive
							? t('session.goLive.finishState', {
									state: t(WORKFLOW_LABEL[workflow] ?? 'session.state.standby'),
								})
							: t('session.goLive.label')
				}
				onClick={onGoLive}
			>
				{t('session.goLive.label')}
			</Button>
		</Card>
	);
}

/**
 * `combat.end` discards the round counter, the initiative order, and every combatant's HP and
 * conditions, and the core has no restore command — so it confirms, like the other irreversible
 * actions in this app.
 */
export function EndCombatDialog({
	open,
	round,
	onClose,
	onConfirm,
}: {
	open: boolean;
	round: number;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const { t } = useI18n();
	return (
		<Dialog
			open={open}
			onClose={onClose}
			title={t('session.endCombat.title')}
			description={t('session.endCombat.body', { round })}
			icon="warning"
			// Without `tone`, Dialog leaves `accent` undefined and the header mark renders gold on
			// --color-accent-subtle — visually identical to an info dialog, on the app's most
			// destructive confirm. The footer button was already `variant="danger"`.
			tone="danger"
			size="sm"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose}>
						{t('session.endCombat.keep')}
					</Button>
					<Button variant="danger" size="sm" icon="close" onClick={onConfirm}>
						{t('session.combat.end')}
					</Button>
				</>
			}
		/>
	);
}

/**
 * Returning to Standby from Live is a strict superset of what `combat.end` throws away and writes
 * no archive, so it confirms too — the phase Seg is selection-follows-focus, one ArrowLeft away.
 */
export function EndSessionDialog({
	open,
	onClose,
	onConfirm,
}: {
	open: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const { t } = useI18n();
	return (
		<Dialog
			open={open}
			onClose={onClose}
			title={t('session.end.confirmTitle')}
			description={t('session.endSession.body')}
			icon="warning"
			tone="danger"
			size="sm"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose}>
						{t('session.end.stay')}
					</Button>
					<Button variant="danger" size="sm" icon="close" onClick={onConfirm}>
						{t('session.end.confirmAction')}
					</Button>
				</>
			}
		/>
	);
}
