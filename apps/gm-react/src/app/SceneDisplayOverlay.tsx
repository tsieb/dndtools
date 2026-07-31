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
import { Button, IconButton, Toaster } from '../ds';
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

	// Both used to discard the CommandResult AND have no catch. The overlay opens on Ctrl/Cmd+Shift+S
	// with no preview guard, and `runtime.dispatch` throws outright while previewing (and rethrows a
	// persist failure) — so "Next card" and "Clear display" simply did nothing, silently.
	async function dispatchDisplay(
		type: 'scene-card.advance' | 'scene-card.activate',
		payload: Record<string, unknown>,
		failMsg: string,
	) {
		try {
			const result = await runtime.dispatch({ type, actorId, payload } as Parameters<
				typeof runtime.dispatch
			>[0]);
			if (result.status !== 'accepted') Toaster.error(result.rejection.message ?? failMsg);
		} catch (err) {
			Toaster.error(err instanceof Error ? err.message : failMsg);
		}
	}
	async function advance() {
		await dispatchDisplay(
			'scene-card.advance',
			{},
			t('The next card couldn’t be shown — try again.'),
		);
	}
	async function clear() {
		await dispatchDisplay(
			'scene-card.activate',
			{ cardId: null },
			t('The display couldn’t be cleared — try again.'),
		);
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
				// The control bar is permanently dark chrome — `rgba(6,9,14,0.72)` over the near-black
				// stage — but the DS Buttons inside it painted whatever the DOCUMENT theme said. In
				// parchment `--color-text-secondary` is `#5c4a39`, i.e. ~2.4:1 on this bar, so the
				// ghost controls of the app's only fullscreen surface were barely legible. Scoping the
				// bar to the dark palette makes its tokens match the background it actually has.
				// (`forced-colors` remaps `:root, [data-theme]` alike, so HC is unaffected.)
				data-theme="tavern"
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
					// Both of these used to hard-`disable` themselves on their OWN last press — playing
					// the final queued card empties the queue, and clearing the display empties it — so
					// focus fell to <body> inside a modal whose siblings are `inert`. This is the same
					// defect run #21 fixed on the sibling call site in `SceneCardsPanel`; the soft form
					// keeps the tab stop, keeps the name, and explains itself. The handler has to guard
					// too: DS `Button` only swallows `aria-disabled={true}`.
					aria-disabled={display.queuedCount === 0 || undefined}
					title={display.queuedCount === 0 ? t('Queue a scene card first') : undefined}
					onClick={() => {
						if (display.queuedCount === 0) return;
						void advance();
					}}
				>
					{display.queuedCount > 0
						? t('Next card ({count} queued)', { count: display.queuedCount })
						: t('Next card')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					aria-disabled={!display.active || undefined}
					title={display.active ? undefined : t('Nothing is on the display')}
					onClick={() => {
						if (!display.active) return;
						void clear();
					}}
				>
					{t('Clear display')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					icon="display"
					// Native `disabled` removes the tab stop AND suppresses the tooltip, so the carefully
					// worded `unavailableMessage` (e.g. "…desktop-only on Android") had no channel left to
					// reach anyone. `aria-disabled` is the DS soft form: focusable, announced, inert.
					aria-disabled={!capabilities.secondScreen.available || undefined}
					title={capabilities.secondScreen.unavailableMessage ?? undefined}
					aria-label={
						capabilities.secondScreen.available
							? t('Open on a second screen')
							: (capabilities.secondScreen.unavailableMessage ??
								t('Second screen is not available on this device'))
					}
					onClick={() => {
						// window.open returns null when the browser blocks the popup — pressing the button
						// then did nothing at all, with no explanation anywhere.
						if (!openSecondScreen())
							Toaster.error(
								t('Your browser blocked the display window — allow pop-ups for this site.'),
							);
					}}
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
