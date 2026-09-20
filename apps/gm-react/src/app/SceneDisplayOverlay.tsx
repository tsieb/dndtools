import { useEffect, useMemo, useRef, useState } from 'react';
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
import { createAssetObjectUrl, type AssetObjectUrlHandle } from '../platform/assetUrl';
import { registerBackHandler } from '../platform/backNavigation';
import { usePlatformCapabilities } from '../platform/capabilities';
import { isolateModalSiblings } from '../platform/modalIsolation';

declare global {
	interface Window {
		dndtoolsSceneDisplayControl?: { open: () => Promise<boolean> };
	}
}

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
		let generation = 0;
		let hero: AssetObjectUrlHandle | null = null;
		async function publish() {
			const current = ++generation;
			const view = getSceneDisplayForActor(
				runtime.state.session,
				runtime.state.permissions,
				runtime.defaultActorId,
			);
			let resolved: AssetObjectUrlHandle | null = null;
			if (view.active?.heroImage?.kind === 'vault-asset') {
				try {
					resolved = await createAssetObjectUrl(view.active.heroImage.ref);
				} catch {
					/* Missing image leaves the mood backdrop. */
				}
			}
			if (current !== generation) {
				resolved?.revoke();
				return;
			}
			hero?.revoke();
			hero = resolved;
			seq.current += 1;
			postSceneDisplay({
				active:
					view.active && resolved
						? {
								...view.active,
								heroImage: { ...view.active.heroImage!, kind: 'url', ref: resolved.url },
							}
						: view.active,
				transitionStyle: view.transitionStyle,
				seq: seq.current,
			});
		}
		publish();
		const stopDispatch = runtime.onDispatched(() => publish());
		const stopRequests = subscribeSceneDisplayRequests(publish);
		return () => {
			generation += 1;
			hero?.revoke();
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
	const [feedback, setFeedback] = useState('');
	const [pending, setPending] = useState(false);
	const readOnly = runtime.readOnly;
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
		if (readOnly || pending) return;
		setPending(true);
		setFeedback(t('sceneDisplay.saving'));
		try {
			const result = await runtime.dispatch({ type, actorId, payload } as Parameters<
				typeof runtime.dispatch
			>[0]);
			setFeedback(result.status === 'accepted' ? t('sceneDisplay.saved') : failMsg);
		} catch {
			setFeedback(failMsg);
		} finally {
			setPending(false);
		}
	}
	async function advance() {
		await dispatchDisplay('scene-card.advance', {}, t('sceneDisplay.nextFailed'));
	}
	async function clear() {
		await dispatchDisplay('scene-card.activate', { cardId: null }, t('sceneDisplay.clearFailed'));
	}

	return (
		<div
			ref={overlayRef}
			className="app-fixed-viewport scene-display-viewport scene-display-overlay"
			data-scene-display-overlay="true"
			role="dialog"
			aria-modal="true"
			aria-label={t('sceneDisplay.title')}
			tabIndex={-1}
		>
			<SceneDisplaySurface active={display.active} transitionStyle={display.transitionStyle} />
			<div data-theme="tavern" className="scene-display__controls">
				<p className="scene-display__feedback" role="status">
					{readOnly ? t('sceneDisplay.readOnly') : feedback}
				</p>
				<Button
					variant="primary"
					size="sm"
					icon="skip"
					// Both of these used to hard-`disable` themselves on their OWN last press — playing
					// the final queued card empties the queue, and clearing the display empties it — so
					// focus fell to <body> inside a modal whose siblings are `inert`. This is the same
					// defect run #21 fixed on the sibling call site in `SceneCardsPanel`; the soft form
					// keeps the tab stop, keeps the name, and explains itself. The handler has to guard
					// too: DS `Button` only swallows `aria-disabled={true}`.
					aria-disabled={readOnly || pending || display.queuedCount === 0 || undefined}
					title={display.queuedCount === 0 ? t('sceneDisplay.queueFirst') : undefined}
					onClick={() => {
						if (display.queuedCount === 0) return;
						void advance();
					}}
				>
					{display.queuedCount > 0
						? t('sceneDisplay.nextCardQueued', { count: display.queuedCount })
						: t('sceneDisplay.nextCard')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					aria-disabled={readOnly || pending || !display.active || undefined}
					title={display.active ? undefined : t('sceneDisplay.empty')}
					onClick={() => {
						if (!display.active) return;
						void clear();
					}}
				>
					{t('sceneDisplay.clear')}
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
							? t('sceneDisplay.secondScreenOpen')
							: (capabilities.secondScreen.unavailableMessage ??
								t('sceneDisplay.secondScreenUnavailable'))
					}
					onClick={() => {
						// window.open returns null when the browser blocks the popup — pressing the button
						// then did nothing at all, with no explanation anywhere.
						if (!capabilities.secondScreen.available) return;
						if (window.dndtoolsSceneDisplayControl) {
							void window.dndtoolsSceneDisplayControl
								.open()
								.then((opened) => {
									if (!opened) setFeedback(t('sceneDisplay.openFailed'));
								})
								.catch(() => setFeedback(t('sceneDisplay.openFailed')));
						} else if (!openSecondScreen()) setFeedback(t('sceneDisplay.popupBlocked'));
					}}
				>
					{t('sceneDisplay.secondScreen')}
				</Button>
			</div>
			<div className="scene-display__exit" data-theme="tavern">
				<IconButton
					icon="close"
					label={t('sceneDisplay.exit')}
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
			</div>
		</div>
	);
}
