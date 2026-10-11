import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
	type KeyboardEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	FEATURE_SPOTLIGHTS,
	SECTION_FEATURE_GATES,
	isFeatureVisible,
	markSpotlightSeen,
	parseSeenSpotlights,
	pendingSpotlights,
	serializeSeenSpotlights,
	spotlightsSeenIn,
	spotlightVaultId,
	type SpotlightDefinition,
} from '@dndtools/core';
import { FeatureSpotlight, IconButton } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import {
	matchesMedia,
	PREFERENCE_KEYS,
	readPreference,
	writePreference,
} from '../../platform/preferences';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useSessionPosture } from '../shell/session-posture';
import { shortcut, activeCanvasSurface, subscribeCanvasSurface } from '../shortcuts/registry';
import { useSettingsTier } from '../../screens/settings/Experience';
import { useViewport } from '../useViewport';

/**
 * RC-UX-3.2 — feature spotlights. The core declares which spotlights exist and when each is due
 * (`FEATURE_SPOTLIGHTS`, `pendingSpotlights`); this component decides when one may appear and
 * remembers which have been shown, per vault, in the device-preferences slice.
 *
 * A spotlight never interrupts. It waits for an idle moment: the DM has interacted at least once
 * this launch, then stopped for `SPOTLIGHT_IDLE_MS` with no dialog, sheet or full-screen editor
 * open and no text field focused. A live session suppresses them entirely. At most one appears per
 * `SPOTLIGHT_COOLDOWN_MS`, so a queue of several never becomes a run of interruptions.
 *
 * A spotlight is marked seen the moment it appears, not when it is dismissed, so reloading with the
 * card still on screen does not bring it back.
 */

/** How long the DM must stop interacting before a pause counts as an idle moment. */
export const SPOTLIGHT_IDLE_MS = 8_000;
/** The least time between two spotlights in one launch. */
export const SPOTLIGHT_COOLDOWN_MS = 5 * 60_000;

/** The vault id the local runtime stamps on every operation (`runtime/environment.ts`). A vault
 * with no operations yet keys its seen record under it too, so the key never moves. */
const LOCAL_VAULT_ID = 'local-default';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

interface SpotlightCopy {
	readonly title: MessageKey;
	readonly body: MessageKey;
	readonly action?: MessageKey;
	/** A registry shortcut whose key legend fills the body's `{keys}` slot. */
	readonly shortcutId?: string;
	readonly icon: string;
}

/** Copy for each declared spotlight. A spotlight without copy here is never shown. */
const COPY: Readonly<Record<string, SpotlightCopy>> = {
	'screen-switcher': {
		title: 'spotlight.screenSwitcher.title',
		body: 'spotlight.screenSwitcher.body',
		action: 'spotlight.screenSwitcher.action',
		icon: 'layers',
	},
	'session-standby': {
		title: 'spotlight.sessionStandby.title',
		body: 'spotlight.sessionStandby.body',
		action: 'spotlight.sessionStandby.action',
		icon: 'info',
	},
	'project-map': {
		title: 'spotlight.projectMap.title',
		body: 'spotlight.projectMap.body',
		action: 'spotlight.projectMap.action',
		icon: 'map',
	},
	'preview-player': {
		title: 'spotlight.previewPlayer.title',
		body: 'spotlight.previewPlayer.body',
		action: 'spotlight.previewPlayer.action',
		icon: 'visibility-players',
	},
	'vault-switcher': {
		title: 'spotlight.vaultSwitcher.title',
		body: 'spotlight.vaultSwitcher.body',
		action: 'spotlight.vaultSwitcher.action',
		icon: 'folder',
	},
	graph: {
		title: 'spotlight.graph.title',
		body: 'spotlight.graph.body',
		action: 'spotlight.graph.action',
		icon: 'link',
	},
	'command-palette': {
		title: 'spotlight.commandPalette.title',
		body: 'spotlight.commandPalette.body',
		shortcutId: 'global.palette',
		icon: 'search',
	},
	shortcuts: {
		title: 'spotlight.shortcuts.title',
		body: 'spotlight.shortcuts.body',
		shortcutId: 'global.help',
		icon: 'info',
	},
};

function copyFor(id: string): SpotlightCopy | undefined {
	return Object.prototype.hasOwnProperty.call(COPY, id) ? COPY[id] : undefined;
}

function readSeen() {
	return parseSeenSpotlights(readPreference(PREFERENCE_KEYS.seenSpotlights));
}

/** Whether the DM can be shown something right now without cutting across what they are doing. */
function interruptible(): boolean {
	if (document.visibilityState === 'hidden' || activeCanvasSurface()?.editing) return false;
	// First-run onboarding still owns the screen until it is finished or skipped.
	if (readPreference(PREFERENCE_KEYS.onboarded) === null) return false;
	// A dialog, sheet, the command palette or a full-screen editor means the DM is mid-task.
	if (document.querySelector('[aria-modal="true"], [data-fullscreen-overlay]')) return false;
	const el = document.activeElement as HTMLElement | null;
	return !(
		el &&
		(el.tagName === 'INPUT' ||
			el.tagName === 'TEXTAREA' ||
			el.tagName === 'SELECT' ||
			el.isContentEditable)
	);
}

/**
 * Call `onIdle` at the next idle moment while `armed`, no earlier than `notBefore`. Activity is
 * recorded for the whole launch, armed or not, so an interaction just before a spotlight falls due
 * still counts; with no interaction at all this launch it keeps waiting.
 */
function useIdleMoment(armed: boolean, notBefore: number, onIdle: () => void): void {
	const lastActivity = useRef<number | null>(null);
	const onIdleRef = useRef(onIdle);
	useEffect(() => {
		onIdleRef.current = onIdle;
	});

	useEffect(() => {
		const record = () => {
			lastActivity.current = Date.now();
		};
		for (const type of ACTIVITY_EVENTS) {
			window.addEventListener(type, record, { capture: true, passive: true });
		}
		return () => {
			for (const type of ACTIVITY_EVENTS) {
				window.removeEventListener(type, record, { capture: true });
			}
		};
	}, []);

	useEffect(() => {
		if (!armed) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const check = (): void => {
			const last = lastActivity.current;
			if (last === null) return; // the first interaction re-arms through `onActivity`
			const wait = Math.max(last + SPOTLIGHT_IDLE_MS, notBefore) - Date.now();
			if (wait > 0) return schedule(wait);
			if (!interruptible()) return schedule(SPOTLIGHT_IDLE_MS);
			onIdleRef.current();
		};
		const schedule = (delay: number): void => {
			clearTimeout(timer);
			timer = setTimeout(check, Math.max(0, delay));
		};
		const onActivity = () => schedule(SPOTLIGHT_IDLE_MS);
		for (const type of ACTIVITY_EVENTS) {
			window.addEventListener(type, onActivity, { capture: true, passive: true });
		}
		check();
		return () => {
			clearTimeout(timer);
			for (const type of ACTIVITY_EVENTS) {
				window.removeEventListener(type, onActivity, { capture: true });
			}
		};
	}, [armed, notBefore]);
}

/** A mounted control may still be hidden by a phone breakpoint, a collapsed panel or scrolling. */
export function visibleSpotlightTarget(
	selector: string,
	labels: readonly string[] = [],
): HTMLElement | null {
	return (
		Array.from(document.querySelectorAll<HTMLElement>(selector)).find((target) => {
			// Reuse the control's localized accessible name or visible label, rather than
			// requiring spotlight-only attributes on surfaces owned by other tasks.
			if (
				labels.length &&
				!labels.some(
					(label) =>
						target.getAttribute('aria-label') === label || target.textContent?.trim() === label,
				)
			)
				return false;
			const rect = target.getBoundingClientRect();
			return (
				!target.closest('[hidden], [inert], [aria-hidden="true"]') &&
				getComputedStyle(target).visibility === 'visible' &&
				rect.width > 0 &&
				rect.height > 0 &&
				rect.bottom > 0 &&
				rect.right > 0 &&
				rect.top < window.innerHeight &&
				rect.left < window.innerWidth
			);
		}) ?? null
	);
}

export function Spotlight() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const targetFor = useCallback(
		(target: string): HTMLElement | null => {
			switch (target) {
				case 'screen-switcher':
					return visibleSpotlightTarget('[data-testid="screen-switcher"]');
				case 'session-standby':
					return visibleSpotlightTarget('button', [t('session.goLive.label')]);
				case 'project-map':
					return visibleSpotlightTarget('button', [t('session.stage.project')]);
				case 'preview-player':
					return visibleSpotlightTarget('button[aria-haspopup="menu"]', [
						t('viewAs.trigger'),
						t('viewAs.sceneTrigger'),
					]);
				case 'vault-switcher':
					return visibleSpotlightTarget('button[aria-haspopup="dialog"]', [t('vaults.title')]);
				default:
					return null;
			}
		},
		[t],
	);
	const navigate = useNavigate();
	const location = useLocation();
	const tier = useSettingsTier();
	const canvas = useSyncExternalStore(subscribeCanvasSurface, activeCanvasSurface);
	const viewport = useViewport();
	const posture = useSessionPosture();
	const [seen, setSeen] = useState(readSeen);
	const [current, setCurrent] = useState<SpotlightDefinition | null>(null);
	const [shownAt, setShownAt] = useState(Number.NEGATIVE_INFINITY);

	// Cheap on purpose: this renders with the shell on every state change, so the render path only
	// asks "is anything left to show in this vault?". Which spotlight is due (the maturity counts
	// walk every note) is resolved once, at the idle moment itself.
	const shown = spotlightsSeenIn(seen, spotlightVaultId(runtime.state, LOCAL_VAULT_ID));
	const anyUnseen = FEATURE_SPOTLIGHTS.some((s) => !shown.includes(s.id));
	const armed =
		anyUnseen && current === null && !posture.live && runtime.preview === null && !canvas?.editing;

	useIdleMoment(armed, shownAt + SPOTLIGHT_COOLDOWN_MS, () => {
		const vaultId = spotlightVaultId(runtime.state, LOCAL_VAULT_ID);
		// Re-read storage so a spotlight another window already showed is not shown again here.
		const stored = readSeen();
		const next = pendingSpotlights(runtime.state, runtime.defaultActorId, vaultId, stored, {
			keyboard: matchesMedia('(pointer: fine)'),
			tier,
			route: location.pathname.replace(/\/$/, '') || '/',
			onboarded: readPreference(PREFERENCE_KEYS.onboarded) !== null,
			editing: activeCanvasSurface()?.editing,
			sheetOpen: !!document.querySelector('[aria-modal="true"], [data-fullscreen-overlay]'),
			visibleTargets: FEATURE_SPOTLIGHTS.flatMap((s) =>
				s.target && targetFor(s.target) ? [s.target] : [],
			),
		}).find((spotlight) => copyFor(spotlight.id));
		if (!next) {
			setSeen(stored);
			return;
		}
		const updated = markSpotlightSeen(stored, vaultId, next.id);
		writePreference(PREFERENCE_KEYS.seenSpotlights, serializeSeenSpotlights(updated));
		// If storage is unavailable or full, defer the tip: showing without a durable seen
		// record would repeat it after a reload.
		if (!spotlightsSeenIn(readSeen(), vaultId).includes(next.id)) return;
		setSeen(updated);
		setShownAt(Date.now());
		setCurrent(next);
	});

	useEffect(() => {
		if (!current) return;
		const check = () => {
			if (
				activeCanvasSurface()?.editing ||
				runtime.preview ||
				posture.live ||
				(current.gate && !isFeatureVisible(current.gate, tier, SECTION_FEATURE_GATES)) ||
				(current.trigger.kind === 'primary-path' &&
					['session', 'map'].includes(current.trigger.event) &&
					location.pathname.replace(/\/$/, '') !== '/session') ||
				document.querySelector('[aria-modal="true"], [data-fullscreen-overlay]') ||
				(current.target && !targetFor(current.target))
			)
				setCurrent(null);
		};
		check();
		const observer = new MutationObserver(check);
		observer.observe(document.body, { childList: true, subtree: true, attributes: true });
		window.addEventListener('resize', check);
		window.addEventListener('scroll', check, true);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', check);
			window.removeEventListener('scroll', check, true);
		};
	}, [current, canvas, runtime.preview, posture.live, location.pathname, tier, targetFor]);

	const copy = current ? copyFor(current.id) : undefined;
	const surface = current?.surface ?? null;
	const dismiss = () => setCurrent(null);
	return (
		// The region is always mounted so screen readers are already watching it when a card lands.
		// It never takes pointer events itself; only the card does.
		<div
			aria-live="polite"
			style={{
				position: 'fixed',
				right: 'max(16px, var(--safe-area-right, 0px))',
				bottom:
					viewport === 'phone' ? 'calc(104px + var(--safe-area-bottom, 0px))' : 'var(--space-4)',
				zIndex: 'var(--z-sticky)',
				width: 'min(22rem, calc(100vw - 32px))',
				pointerEvents: 'none',
			}}
		>
			{current && copy && !posture.live && !canvas?.editing && !runtime.preview && (
				<FeatureSpotlight
					data-spotlight-id={current.id}
					title={t(copy.title)}
					description={t(copy.body, {
						keys: copy.shortcutId ? shortcut(copy.shortcutId).keys : '',
					})}
					icon={copy.icon}
					actionLabel={copy.action && (surface || current.target) ? t(copy.action) : undefined}
					onAction={
						surface || current.target
							? () => {
									dismiss();
									if (current.target) {
										const target = targetFor(current.target);
										target?.scrollIntoView({ block: 'nearest' });
										if (
											current.id === 'screen-switcher' ||
											current.id === 'preview-player' ||
											current.id === 'vault-switcher'
										)
											target?.click();
										else if (target?.matches(':disabled')) {
											// Project is natively disabled in Standby. Focus its explanatory
											// row without changing the control's activation semantics.
											const row = target.parentElement;
											if (row) {
												const previous = row.getAttribute('tabindex');
												row.tabIndex = -1;
												row.addEventListener(
													'blur',
													() => {
														if (previous === null) row.removeAttribute('tabindex');
														else row.setAttribute('tabindex', previous);
													},
													{ once: true },
												);
												row.focus();
											}
										} else target?.focus();
									} else if (surface) navigate(surface);
								}
							: undefined
					}
					onKeyDown={(e: KeyboardEvent) => {
						if (e.key !== 'Escape') return;
						e.stopPropagation();
						dismiss();
					}}
					style={{
						position: 'relative',
						paddingRight: 'calc(var(--space-3) + 2rem)',
						pointerEvents: 'auto',
						boxShadow: 'var(--shadow-lg)',
					}}
				>
					<IconButton
						icon="close"
						label={t('spotlight.dismiss')}
						variant="ghost"
						size="sm"
						onClick={dismiss}
						style={{ position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)' }}
					/>
				</FeatureSpotlight>
			)}
		</div>
	);
}
