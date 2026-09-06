import {
	allowedTransitionsFrom,
	getPlayerViewController,
	listScenesForActor,
	type SessionWorkflowState,
} from '@dndtools/core';
import { useState } from 'react';
import { Button, Dialog, Select, StatusDot, Toaster } from '../ds';
import { useI18n, type MessageKey } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { SetRow, T } from './screen-kit';

// Every core workflow state gets a spoken label so the status pill never shows a raw enum value.
// Exported so `/session` names the state the same way this control does — it used to call every
// non-live workflow "Standby", including Recap, which is the one state you cannot go live from.
export const WORKFLOW_LABEL: Record<SessionWorkflowState, MessageKey> = {
	idle: 'session.state.standby',
	prep: 'session.state.prep',
	active: 'session.state.live',
	paused: 'session.state.paused',
	ending: 'session.state.wrappingUp',
	recap: 'session.state.recap',
	archived: 'session.state.archived',
};

/**
 * ProjectionControl — the topbar live-session / projection control (was a fake local `useState`
 * toggle in the visual port). It drives the real session lifecycle through `session.set-workflow`:
 * going live (`active`) is the Processing-Core gate that lets combat / dice / handouts / map
 * projection reach players, and ending returns the table to standby (`idle`). The pill reflects the
 * real `session.workflow`, persisted across reload. DM-only; rejected while previewing.
 */
export function ProjectionControl({ compact = false }: { compact?: boolean } = {}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const workflow = runtime.state.session.workflow;
	const live = workflow === 'active';
	const previewing = !!runtime.preview;
	// `active` isn't reachable in one step from every state (e.g. recap → active is illegal). Disable
	// "Go live" when the core would reject the transition, rather than firing a rejected dispatch.
	const canGoLive = allowedTransitionsFrom(workflow as SessionWorkflowState).includes('active');
	// `session.set-workflow {workflow:'idle'}` runs `resetLiveSessionFields`: it nulls the active
	// scene and map and clears combat (round, order, every combatant's HP and conditions), handouts,
	// timers and the dice log, archiving nothing. `/session`'s own Standby control has required a red
	// confirm for that since run #18 — but this button performs the identical teardown from the top
	// bar of EVERY route, and on a phone it is one icon-only tap with no label at all.
	const [endConfirmOpen, setEndConfirmOpen] = useState(false);

	// Going live requires an active Scene (Processing-Core gate): prefer the already-active scene, then
	// the Command Center home scene, then the first scene the DM can see.
	function resolveActiveScene(): string | null {
		const existing = runtime.state.session.activeSceneId ?? runtime.state.commandCenter.homeSceneId;
		if (existing && runtime.state.scenes.scenes[existing]) return existing;
		const first = listScenesForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			runtime.defaultActorId,
		).filter((s) => !s.isTemplate)[0];
		return first?.id ?? null;
	}

	async function setWorkflow(target: 'active' | 'idle', okMessage: string) {
		const payload: { workflow: 'active' | 'idle'; activeSceneId?: string } = { workflow: target };
		if (target === 'active') {
			const sceneId = resolveActiveScene();
			if (!sceneId) {
				Toaster.warning(t('session.goLive.needsScene'));
				return;
			}
			payload.activeSceneId = sceneId;
		}
		// `runtime.dispatch` rethrows on a persist failure, so without this catch the app's single
		// most consequential control — Go live / End session — looked simply dead when storage
		// refused, with no toast and an unhandled rejection.
		try {
			const result = await runtime.dispatch({
				type: 'session.set-workflow',
				actorId: runtime.defaultActorId,
				payload,
			});
			if (result.status === 'accepted') Toaster.success(okMessage);
			else Toaster.error(result.rejection.message);
		} catch (err) {
			Toaster.error(err instanceof Error ? err.message : t('session.updateFailed'));
		}
	}

	return (
		<>
			{!compact && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 9,
						padding: '6px 11px',
						borderRadius: 9,
						background: T.surf,
						border: `1px solid ${live ? T.accBd : T.bd}`,
						flex: '0 0 auto',
					}}
				>
					<StatusDot status={live ? 'live' : 'idle'} pulse={live} label={t('nav.session')} />
					<span style={{ font: `12px ${T.sans}`, color: T.sub, whiteSpace: 'nowrap' }}>
						{t(WORKFLOW_LABEL[workflow as SessionWorkflowState] ?? 'session.state.standby')}
					</span>
				</div>
			)}
			<Button
				variant={live ? 'secondary' : 'primary'}
				size="md"
				// `audio-off` is a muted SPEAKER — on the compact phone form this button is icon-only, so
				// the app's most destructive control read as "mute audio". `close` is the glyph
				// `/session`'s own "End session" already uses for this exact transition.
				icon={live ? 'close' : 'visibility-players'}
				// aria-disabled, NOT disabled: a natively disabled button leaves the tab order, so
				// neither the title nor the aria-label below is ever announced and the carefully
				// worded reason becomes unreachable. Button treats aria-disabled as a soft disable
				// (looks unavailable, swallows the click, stays focusable).
				aria-disabled={previewing || (!live && !canGoLive) || undefined}
				// `previewing` also blocks this button, so it needs its own explanation — otherwise
				// previewing as a player left a dead control whose tooltip still read plain "Go live".
				title={
					previewing
						? t('session.goLive.exitPreview')
						: !live && !canGoLive
							? t('session.goLive.finishState', {
									state: t(
										WORKFLOW_LABEL[workflow as SessionWorkflowState] ?? 'session.state.standby',
									),
								})
							: live
								? t('session.end.liveLabel')
								: t('session.goLive.label')
				}
				// On a phone the `!compact` pill above — the StatusDot and the WORKFLOW_LABEL — is not
				// rendered at all, and the button's own text is dropped too, so the app's most
				// consequential control collapses to one glyph that cannot tell Standby from Prep
				// from Recap. Fold the workflow state into the compact name. (Kept as a SUFFIX: the
				// existing strings stay a prefix, and `getByRole` name matching is substring.)
				aria-label={
					(previewing
						? t('session.goLive.blockedPreview')
						: !live && !canGoLive
							? t('session.goLive.blockedState')
							: live
								? t('session.end.liveLabel')
								: t('session.goLive.label')) +
					(compact
						? ` — ${t(WORKFLOW_LABEL[workflow as SessionWorkflowState] ?? 'session.state.standby')}`
						: '')
				}
				style={compact ? { width: 48, minHeight: 48, padding: 0, flex: '0 0 auto' } : undefined}
				onClick={() =>
					live
						? setEndConfirmOpen(true)
						: void setWorkflow('active', t('session.goLive.announcement'))
				}
			>
				{compact ? null : live ? t('session.end.label') : t('session.goLive.label')}
			</Button>
			<Dialog
				open={endConfirmOpen}
				onClose={() => setEndConfirmOpen(false)}
				title={t('session.end.confirmTitle')}
				description={t('session.end.confirmBody')}
				icon="warning"
				tone="danger"
				size="sm"
				footer={
					<>
						<Button variant="secondary" size="sm" onClick={() => setEndConfirmOpen(false)}>
							{t('session.end.stay')}
						</Button>
						<Button
							variant="danger"
							size="sm"
							icon="close"
							onClick={() => {
								setEndConfirmOpen(false);
								void setWorkflow('idle', t('session.end.announcement'));
							}}
						>
							{t('session.end.confirmAction')}
						</Button>
					</>
				}
			/>
		</>
	);
}

/**
 * PlayerViewAssignments — RC-CAN-6.2. `session.project-player-view` already lets the DM send each
 * player a DIFFERENT scene (`PlayerViewAssignment`/`getPlayerViewController`, RC-WID-4.1's
 * `PlayerViewsBody` widget only ever READS that state), but nothing dispatched it per player: the
 * only control was the Stage panel's single "Project" button, which broadcasts one scene to the
 * whole table. One `Select` per participant, each an independent `session.project-player-view` (or
 * `session.revoke-player-view` for "— none —"), is the per-player assignment surface. Self-contained
 * (reads the runtime and dispatches directly) so it drops into the Stage panel without new props.
 */
export function PlayerViewAssignments({
	isLive,
	previewing,
}: {
	isLive: boolean;
	previewing: boolean;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const controller = getPlayerViewController(runtime.state, runtime.defaultActorId);
	if (controller.kind !== 'available' || controller.participants.length === 0) return null;
	const { sceneOptions, participants } = controller;

	async function assign(playerActorId: string, sceneId: string) {
		const command = sceneId
			? {
					type: 'session.project-player-view' as const,
					actorId: runtime.defaultActorId,
					payload: { playerActorIds: [playerActorId], target: { kind: 'scene' as const, sceneId } },
				}
			: {
					type: 'session.revoke-player-view' as const,
					actorId: runtime.defaultActorId,
					payload: { playerActorIds: [playerActorId] },
				};
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') Toaster.error(result.rejection.message);
	}

	return (
		<div data-testid="player-view-assignments">
			<div
				style={{
					font: `600 11px ${T.sans}`,
					color: T.ter,
					textTransform: 'uppercase',
					letterSpacing: '0.04em',
					marginTop: 8,
				}}
			>
				{t('session.playerViews.title')}
			</div>
			{participants.map((participant) => (
				<SetRow
					key={participant.actorId}
					label={participant.displayName}
					control={
						<Select
							aria-label={t('session.playerViews.assignAria', { name: participant.displayName })}
							value={
								participant.assignment?.kind === 'assigned' ? participant.assignment.sceneId : ''
							}
							disabled={!isLive || previewing}
							options={[
								{ value: '', label: t('session.stage.noneOption') },
								...sceneOptions.map((scene) => ({ value: scene.id, label: scene.name })),
							]}
							onChange={(e: { target: { value: string } }) =>
								void assign(participant.actorId, e.target.value)
							}
						/>
					}
				/>
			))}
		</div>
	);
}
