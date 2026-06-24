import { allowedTransitionsFrom, listScenesForActor, type SessionWorkflowState } from '@dndtools/core';
import { Button, StatusDot, Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { T } from './screen-kit';

/**
 * ProjectionControl — the topbar live-session / projection control (was a fake local `useState`
 * toggle in the visual port). It drives the real session lifecycle through `session.set-workflow`:
 * going live (`active`) is the Processing-Core gate that lets combat / dice / handouts / map
 * projection reach players, and ending returns the table to standby (`idle`). The pill reflects the
 * real `session.workflow`, persisted across reload. DM-only; rejected while previewing.
 */
export function ProjectionControl() {
	const runtime = useRuntime();
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
		const first = listScenesForActor(runtime.state.scenes, runtime.state.permissions, runtime.defaultActorId).filter(
			(s) => !s.isTemplate,
		)[0];
		return first?.id ?? null;
	}

	async function setWorkflow(target: 'active' | 'idle', okMessage: string) {
		const payload: { workflow: 'active' | 'idle'; activeSceneId?: string } = { workflow: target };
		if (target === 'active') {
			const sceneId = resolveActiveScene();
			if (!sceneId) {
				Toaster.warning('Create a scene first — a live session needs an active scene.');
				return;
			}
			payload.activeSceneId = sceneId;
		}
		const result = await runtime.dispatch({
			type: 'session.set-workflow',
			actorId: runtime.defaultActorId,
			payload,
		});
		if (result.status === 'accepted') Toaster.success(okMessage);
		else Toaster.error(result.rejection.message);
	}

	return (
		<>
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
				<StatusDot status={live ? 'live' : 'idle'} pulse={live} label="Session" />
				<span style={{ font: `12px ${T.sans}`, color: T.sub, whiteSpace: 'nowrap' }}>
					{live ? 'Live' : workflow === 'idle' ? 'Standby' : workflow}
				</span>
			</div>
			<Button
				variant={live ? 'secondary' : 'primary'}
				size="md"
				icon={live ? 'audio-off' : 'visibility-players'}
				disabled={previewing || (!live && !canGoLive)}
				title={!live && !canGoLive ? `Can’t go live directly from ${workflow} — return to standby first` : undefined}
				onClick={() =>
					live
						? setWorkflow('idle', 'Session ended — players returned to standby')
						: setWorkflow('active', 'You are live — combat, dice & projection now reach players')
				}
			>
				{live ? 'End' : 'Go live'}
			</Button>
		</>
	);
}
