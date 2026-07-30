import {
	allowedTransitionsFrom,
	listScenesForActor,
	type SessionWorkflowState,
} from '@dndtools/core';
import { Button, StatusDot, Toaster } from '../ds';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { T } from './screen-kit';

// Every core workflow state gets a spoken label so the status pill never shows a raw enum value.
const WORKFLOW_LABEL: Record<SessionWorkflowState, string> = {
	idle: 'Standby',
	prep: 'Prep',
	active: 'Live',
	paused: 'Paused',
	ending: 'Wrapping up',
	recap: 'Recap',
	archived: 'Archived',
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
				Toaster.warning(t('Create a scene first — a live session needs an active scene.'));
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
			Toaster.error(
				err instanceof Error ? err.message : t('The session couldn’t be updated — try again.'),
			);
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
					<StatusDot status={live ? 'live' : 'idle'} pulse={live} label={t('Session')} />
					<span style={{ font: `12px ${T.sans}`, color: T.sub, whiteSpace: 'nowrap' }}>
						{t(WORKFLOW_LABEL[workflow as SessionWorkflowState] ?? 'Standby')}
					</span>
				</div>
			)}
			<Button
				variant={live ? 'secondary' : 'primary'}
				size="md"
				icon={live ? 'audio-off' : 'visibility-players'}
				// aria-disabled, NOT disabled: a natively disabled button leaves the tab order, so
				// neither the title nor the aria-label below is ever announced and the carefully
				// worded reason becomes unreachable. Button treats aria-disabled as a soft disable
				// (looks unavailable, swallows the click, stays focusable).
				aria-disabled={previewing || (!live && !canGoLive) || undefined}
				// `previewing` also blocks this button, so it needs its own explanation — otherwise
				// previewing as a player left a dead control whose tooltip still read plain "Go live".
				title={
					previewing
						? t('Exit player preview before going live')
						: !live && !canGoLive
							? t('Finish {state} and return to Standby before going live', {
									state: t(WORKFLOW_LABEL[workflow as SessionWorkflowState] ?? 'Standby'),
								})
							: live
								? t('End live session')
								: t('Go live')
				}
				aria-label={
					previewing
						? t('Go live (unavailable — exit player preview first)')
						: !live && !canGoLive
							? t('Go live (unavailable — return to Standby first)')
							: live
								? t('End live session')
								: t('Go live')
				}
				style={compact ? { width: 48, minHeight: 48, padding: 0, flex: '0 0 auto' } : undefined}
				onClick={() =>
					live
						? setWorkflow('idle', t('Session ended — players returned to standby'))
						: setWorkflow('active', t('You are live — combat, dice, and maps now reach players'))
				}
			>
				{compact ? null : live ? t('End') : t('Go live')}
			</Button>
		</>
	);
}
