import { useEffect, useMemo, useRef } from 'react';
import { getSceneDisplayForActor } from '@dndtools/core';
import type { SceneRuntime } from '../runtime/SceneRuntime';
import { useRuntime } from '../runtime/RuntimeContext';
import { SceneDisplaySurface } from '../screens/SceneDisplay';
import {
	openSecondScreen,
	postSceneDisplay,
	subscribeSceneDisplayRequests,
} from '../platform/sceneDisplayChannel';
import { Button, IconButton } from '../ds';
import { registerBackHandler } from '../platform/backNavigation';
import { usePlatformCapabilities } from '../platform/capabilities';

/**
 * I11 S11.2.2/S11.2.3 — the BROADCAST DRIVER. Mounted once in the primary (DM) window, it pushes the live
 * display view-model to any second-screen window over the BroadcastChannel on every dispatch (and once on
 * mount), so the display window stays in lock-step with the DM's edits without its own state applier.
 */
export function useSceneDisplayBroadcast(runtime: SceneRuntime): void {
	const seq = useRef(0);
	useEffect(() => {
		function publish() {
			const view = getSceneDisplayForActor(
				runtime.state.session,
				runtime.state.permissions,
				runtime.defaultActorId,
			);
			seq.current += 1;
			postSceneDisplay({
				active: view.active,
				transitionStyle: view.transitionStyle,
				seq: seq.current,
			});
		}
		publish();
		const stopDispatch = runtime.onDispatched(() => publish());
		const stopRequests = subscribeSceneDisplayRequests(publish);
		return () => {
			stopDispatch();
			stopRequests();
		};
	}, [runtime]);
}

/**
 * SceneDisplayOverlay — the in-window FULLSCREEN scene display (Ctrl+Shift+S). It renders the shared
 * atmosphere surface over the whole app with a compact DM control bar (advance the queue, clear the
 * display, cast to a second screen, close). DM controls stay in this window; the surface itself is the
 * same one the `/display` second-screen route renders.
 */
export function SceneDisplayOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
	const runtime = useRuntime();
	const capabilities = usePlatformCapabilities();
	const actorId = runtime.defaultActorId;
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	const display = useMemo(
		() => getSceneDisplayForActor(runtime.state.session, runtime.state.permissions, actorId),
		[runtime.state, actorId],
	);
	useEffect(() => {
		if (!open) return undefined;
		return registerBackHandler('fullscreen', () => {
			onCloseRef.current();
			return true;
		});
	}, [open]);

	if (!open) return null;

	async function advance() {
		await runtime.dispatch({ type: 'scene-card.advance', actorId, payload: {} });
	}
	async function clear() {
		await runtime.dispatch({ type: 'scene-card.activate', actorId, payload: { cardId: null } });
	}

	return (
		<div
			className="app-fixed-viewport"
			data-scene-display-overlay="true"
			role="dialog"
			aria-modal="true"
			aria-label="Scene display"
			style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#05070c' }}
		>
			<SceneDisplaySurface active={display.active} transitionStyle={display.transitionStyle} />
			<div
				style={{
					position: 'fixed',
					top: 'max(16px, var(--safe-area-top, 0px))',
					right: 'max(16px, var(--safe-area-right, 0px))',
					left: 'max(16px, var(--safe-area-left, 0px))',
					zIndex: 121,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'flex-end',
					flexWrap: 'wrap',
					gap: 8,
					padding: '8px 10px',
					borderRadius: 10,
					background: 'rgba(6,9,14,0.72)',
					backdropFilter: 'blur(6px)',
					border: '1px solid rgba(255,255,255,0.14)',
				}}
			>
				<Button
					variant="secondary"
					size="sm"
					icon="skip"
					disabled={display.queuedCount === 0}
					onClick={() => void advance()}
				>
					Advance{display.queuedCount > 0 ? ` (${display.queuedCount})` : ''}
				</Button>
				<Button variant="ghost" size="sm" disabled={!display.active} onClick={() => void clear()}>
					Clear
				</Button>
				<Button
					variant="ghost"
					size="sm"
					icon="display"
					disabled={!capabilities.secondScreen.available}
					title={capabilities.secondScreen.unavailableMessage ?? undefined}
					onClick={() => openSecondScreen()}
				>
					Second screen
				</Button>
				<IconButton
					icon="close"
					label="Exit scene display"
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
			</div>
		</div>
	);
}
