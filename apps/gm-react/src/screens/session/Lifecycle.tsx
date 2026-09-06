import { useState } from 'react';
import { allowedTransitionsFrom, type SessionWorkflowState } from '@dndtools/core';
import { Button, Card, Dialog, Field, Icon, Input, Select, StatusDot } from '../../ds';
import { Seg, T, eb } from '../../app/screen-kit';
import { WORKFLOW_LABEL } from '../../app/ProjectionControl';
import { useI18n, type MessageKey } from '../../i18n';

export function SessionHeader({
	workflow,
	sceneName,
	sessionTitle,
	previewing,
	isDm,
	onSetWorkflow,
	onEnd,
}: {
	workflow: string;
	sceneName: string | null;
	/** RC-SES-1.3 — the name the start flow gave this session, or null for an unnamed one. */
	sessionTitle: string | null;
	previewing: boolean;
	isDm: boolean;
	onSetWorkflow: (w: 'idle' | 'prep' | 'active' | 'recap') => void;
	/** RC-SES-1.3 — open the end-of-session dialog. Only offered while the session is live. */
	onEnd: () => void;
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
				{/* RC-SES-1.3 — a named session leads with its name and keeps the scene as the second
				    line, so the DM can see both the session they started and what players are looking at. */}
				<div style={{ font: `700 19px/1.1 ${T.disp}` }}>
					{sessionTitle ?? sceneName ?? t('session.header.noScene')}
				</div>
				{sessionTitle ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub, marginTop: 3 }}>
						{t('session.header.sessionScene', { scene: sceneName ?? t('session.header.theScene') })}
					</div>
				) : null}
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
			{/* RC-SES-1.3 — ending a session used to be reachable only by moving the phase rail to a radio
			    labelled "Standby". A live session gets a named control that opens the end dialog. */}
			{workflow === 'active' && !previewing && isDm ? (
				<Button variant="secondary" size="sm" icon="close" onClick={onEnd}>
					{t('session.end.confirmAction')}
				</Button>
			) : null}
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

export interface SessionStartChoice {
	sceneId: string;
	/** The name typed for a new session, or `null` when continuing (the session keeps its own name). */
	title: string | null;
}

/**
 * RC-SES-1.3 START — going live used to be one press that silently picked a scene (the active one,
 * else the home Scene, else the first one in the vault) and never said which. This asks: continue the
 * scene the session was already on, or start a new one on a scene you pick, with a name.
 *
 * The dialog is unmounted while closed, so every open starts from the current session again rather
 * than from whatever the DM half-typed and cancelled last time.
 */
export function StartSessionDialog(props: {
	open: boolean;
	scenes: readonly { id: string; name: string }[];
	/** The scene a "Continue" start would resume, or null when there is nothing to continue. */
	continueSceneId: string | null;
	onClose: () => void;
	onConfirm: (choice: SessionStartChoice) => void;
}) {
	if (!props.open) return null;
	return <StartSessionForm {...props} />;
}

function StartSessionForm({
	scenes,
	continueSceneId,
	onClose,
	onConfirm,
}: {
	scenes: readonly { id: string; name: string }[];
	continueSceneId: string | null;
	onClose: () => void;
	onConfirm: (choice: SessionStartChoice) => void;
}) {
	const { t } = useI18n();
	const continueScene = scenes.find((scene) => scene.id === continueSceneId) ?? null;
	const [mode, setMode] = useState<'continue' | 'new'>(continueScene ? 'continue' : 'new');
	const [sceneId, setSceneId] = useState(continueScene?.id ?? scenes[0]?.id ?? '');
	const [title, setTitle] = useState('');
	const chosenSceneId = mode === 'continue' && continueScene ? continueScene.id : sceneId;
	// Fail closed: with no scene in the vault there is nothing to go live on, so the confirm is
	// disabled and the dialog says what to do instead rather than firing a core rejection.
	const canConfirm = chosenSceneId !== '';
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('session.start.title')}
			description={t('session.start.description')}
			icon="visibility-players"
			size="sm"
			footer={
				<>
					<Button variant="secondary" size="sm" onClick={onClose}>
						{t('session.start.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="visibility-players"
						disabled={!canConfirm}
						onClick={() =>
							canConfirm &&
							onConfirm({
								sceneId: chosenSceneId,
								title: mode === 'new' && title.trim() ? title.trim() : null,
							})
						}
					>
						{t('session.start.confirm')}
					</Button>
				</>
			}
		>
			{scenes.length === 0 ? (
				<div style={{ font: `13px ${T.sans}`, color: T.sub }}>{t('session.start.noScenes')}</div>
			) : (
				<div style={{ display: 'grid', gap: 12 }}>
					{continueScene ? (
						<Seg
							value={mode}
							ariaLabel={t('session.start.modeLabel')}
							onChange={(value) => setMode(value as 'continue' | 'new')}
							options={[
								{ value: 'continue', label: t('session.start.continueOption') },
								{ value: 'new', label: t('session.start.newOption') },
							]}
						/>
					) : null}
					{mode === 'continue' && continueScene ? (
						<div style={{ display: 'grid', gap: 4 }}>
							<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>
								{t('session.start.continueQuestion', { scene: continueScene.name })}
							</div>
							<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
								{t('session.start.continueBody', { scene: continueScene.name })}
							</div>
						</div>
					) : (
						<>
							<Field label={t('session.start.scene')}>
								<Select
									value={sceneId}
									onChange={(e: { target: { value: string } }) => setSceneId(e.target.value)}
									options={scenes.map((scene) => ({ value: scene.id, label: scene.name }))}
								/>
							</Field>
							<Field label={t('session.start.name')} help={t('session.start.nameHint')}>
								<Input
									value={title}
									onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
									placeholder={t('session.start.namePlaceholder')}
									maxLength={120}
								/>
							</Field>
						</>
					)}
				</div>
			)}
		</Dialog>
	);
}

/**
 * RC-SES-1.3 END — ending a session has two honest outcomes and the dialog offers both. "End and
 * review" moves the workflow to `recap`, which ARCHIVES the live session (scene and map, initiative
 * order, handouts, dice log) so it can be written up — the capture note itself is SES-4.1, and the
 * Recap panel on this screen is where it lands today. "End session" runs the core's
 * `resetLiveSessionFields`, which throws all of that away and writes no archive: a strict superset of
 * what `combat.end` discards, so it stays a danger action.
 *
 * `canReview` comes from the core transition table (`allowedTransitionsFrom`): from a state with no
 * legal move to `recap` the button is not offered at all rather than offered and rejected.
 */
export function EndSessionDialog({
	open,
	canReview,
	onClose,
	onReview,
	onConfirm,
}: {
	open: boolean;
	canReview: boolean;
	onClose: () => void;
	onReview: () => void;
	onConfirm: () => void;
}) {
	const { t } = useI18n();
	return (
		<Dialog
			open={open}
			onClose={onClose}
			title={t('session.end.confirmTitle')}
			description={canReview ? t('session.end.chooseBody') : t('session.endSession.body')}
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
					{canReview ? (
						<Button
							variant="primary"
							size="sm"
							icon="note-edit"
							title={t('session.end.reviewHint')}
							onClick={onReview}
						>
							{t('session.end.review')}
						</Button>
					) : null}
				</>
			}
		/>
	);
}
