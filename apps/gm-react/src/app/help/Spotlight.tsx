import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	FEATURE_SPOTLIGHTS,
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
import { shortcut } from '../shortcuts/registry';
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
	if (document.visibilityState === 'hidden') return false;
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

export function Spotlight() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
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
	const armed = anyUnseen && current === null && !posture.live && runtime.preview === null;

	useIdleMoment(armed, shownAt + SPOTLIGHT_COOLDOWN_MS, () => {
		const vaultId = spotlightVaultId(runtime.state, LOCAL_VAULT_ID);
		// Re-read storage so a spotlight another window already showed is not shown again here.
		const stored = readSeen();
		const next = pendingSpotlights(runtime.state, runtime.defaultActorId, vaultId, stored, {
			keyboard: matchesMedia('(pointer: fine)'),
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
			{current && copy && !posture.live && (
				<FeatureSpotlight
					data-spotlight-id={current.id}
					title={t(copy.title)}
					description={t(copy.body, {
						keys: copy.shortcutId ? shortcut(copy.shortcutId).keys : '',
					})}
					icon={copy.icon}
					actionLabel={copy.action && surface ? t(copy.action) : undefined}
					onAction={
						surface
							? () => {
									dismiss();
									navigate(surface);
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
