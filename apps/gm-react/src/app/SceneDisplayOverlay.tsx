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
import { useI18n } from '../i18n';
import { registerBackHandler } from '../platform/backNavigation';
import { usePlatformCapabilities } from '../platform/capabilities';
import { isolateModalSiblings } from '../platform/modalIsolation';

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const overlayRef = useRef<HTMLDivElement>(null);
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	const display = useMemo(
		() => getSceneDisplayForActor(runtime.state.session, runtime.state.permissions, actorId),
		[runtime.state, actorId],
	);
	useEffect(() => {
		if (!open) return undefined;
		returnFocusRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const overlay = overlayRef.current;
		const restoreIsolation = overlay ? isolateModalSiblings(overlay) : () => {};
		const focusOverlay = () => {
			const first = overlay?.querySelector<HTMLElement>(FOCUSABLE);
			(first ?? overlay)?.focus();
		};
		const focusTimer = window.setTimeout(focusOverlay, 0);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				onCloseRef.current();
				return;
			}
			if (event.key !== 'Tab' || !overlay) return;
			const nodes = Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
				(node) => node.offsetParent !== null,
			);
			if (nodes.length === 0) {
				event.preventDefault();
				overlay.focus();
				return;
			}
			const first = nodes[0]!;
			const last = nodes[nodes.length - 1]!;
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};
		document.addEventListener('keydown', onKeyDown, true);
		const unregisterBack = registerBackHandler('fullscreen', () => {
			onCloseRef.current();
			return true;
		});
		return () => {
			window.clearTimeout(focusTimer);
			document.removeEventListener('keydown', onKeyDown, true);
			unregisterBack();
			restoreIsolation();
			returnFocusRef.current?.focus();
		};
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
			ref={overlayRef}
			className="app-fixed-viewport"
			data-scene-display-overlay="true"
			role="dialog"
			aria-modal="true"
			aria-label={t('Scene display')}
			tabIndex={-1}
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
					{display.queuedCount > 0
						? t('Next card ({count} queued)', { count: display.queuedCount })
						: t('Next card')}
				</Button>
				<Button variant="ghost" size="sm" disabled={!display.active} onClick={() => void clear()}>
					{t('Clear display')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					icon="display"
					disabled={!capabilities.secondScreen.available}
					title={capabilities.secondScreen.unavailableMessage ?? undefined}
					aria-label={
						capabilities.secondScreen.available
							? t('Open on a second screen')
							: (capabilities.secondScreen.unavailableMessage ??
								t('Second screen is not available on this device'))
					}
					onClick={() => openSecondScreen()}
				>
					{t('Second screen')}
				</Button>
				<IconButton
					icon="close"
					label={t('Exit scene display')}
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
			</div>
		</div>
	);
}
