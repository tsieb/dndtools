import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
	getSceneDisplayForActor,
	type SceneCardTransitionStyle,
	type SceneCardView,
} from '@dndtools/core';
import { useRuntime } from '../runtime/RuntimeContext';
import { useAssetObjectUrl } from '../platform/assetUrl';
import {
	requestSceneDisplay,
	subscribeSceneDisplay,
	type SceneDisplayPayload,
} from '../platform/sceneDisplayChannel';
import { moodTheme } from '../app/sceneCardMood';
import { useI18n } from '../i18n';
import { isNativeDesktopRuntime } from '../platform/windowChrome';
import { isNetworkDestinationAllowed, usePlatformCapabilities } from '../platform/capabilities';
import { Illustration } from '../ds/illustrations';
import '../styles/scene-display.css';

/** Resolve a card's hero image to a renderable URL (direct for `url`, asset-store for `vault-asset`). */
function useHeroImageUrl(card: SceneCardView | null, resolveVaultAssets: boolean): string | null {
	const capabilities = usePlatformCapabilities();
	const vaultAssetId =
		resolveVaultAssets && card?.heroImage?.kind === 'vault-asset' ? card.heroImage.ref : null;
	const resolved = useAssetObjectUrl(vaultAssetId);
	if (!card?.heroImage) return null;
	if (card.heroImage.kind === 'url') {
		if (
			isNativeDesktopRuntime() &&
			!card.heroImage.ref.startsWith(`blob:${window.location.origin}/`)
		)
			return null;
		if (
			capabilities.runtimeKind === 'android' &&
			!isNetworkDestinationAllowed(card.heroImage.ref, capabilities.runtimeKind)
		)
			return null;
		return card.heroImage.ref;
	}
	return resolved;
}

/**
 * SceneDisplaySurface — the shared, full-bleed atmosphere layout (hero image + title + flavor, mood
 * themed). Used by BOTH the in-window fullscreen overlay (Ctrl+Shift+S) and the `/display` second-screen
 * route. Fills its positioned parent. The transition class re-keys on the active card id so a queue
 * advance re-triggers the enter animation (crossfade/slide/cut). Reduced-motion is handled by the
 * app-wide token contract — no query here.
 */
export function SceneDisplaySurface({
	active,
	transitionStyle,
	resolveVaultAssets = true,
	waiting = false,
}: {
	active: SceneCardView | null;
	transitionStyle: SceneCardTransitionStyle;
	resolveVaultAssets?: boolean;
	waiting?: boolean;
}) {
	const heroUrl = useHeroImageUrl(active, resolveVaultAssets);
	const [failedHero, setFailedHero] = useState<string | null>(null);
	const { t } = useI18n();

	if (!active) {
		return (
			<div className="scene-display scene-display--empty" data-theme="tavern" tabIndex={0}>
				<div className="scene-display__empty-copy">
					<Illustration name="scenes-empty" />
					<h1>{t(waiting ? 'sceneDisplay.waiting' : 'sceneDisplay.noScene')}</h1>
					{waiting ? <p>{t('sceneDisplay.waitingHelp')}</p> : null}
				</div>
			</div>
		);
	}

	const theme = moodTheme(active.mood);
	return (
		<div className="scene-display" role="group" aria-label={active.title} tabIndex={0}>
			<div
				key={`${active.id}:${transitionStyle}:${active.revision}`}
				className={`scene-display__card scene-display__card--${transitionStyle}`}
				style={
					{
						'--scene-from': theme.from,
						'--scene-to': theme.to,
						'--scene-ink': theme.ink,
					} as CSSProperties
				}
			>
				{heroUrl && failedHero !== heroUrl ? (
					<img
						className="scene-display__hero"
						src={heroUrl}
						alt=""
						onError={() => setFailedHero(heroUrl)}
					/>
				) : null}
				<div className="scene-display__copy">
					<span className="scene-display__mood">{t(`sceneDisplay.mood.${active.mood}`)}</span>
					<h1>{active.title}</h1>
					{active.flavorText ? <p>{active.flavorText}</p> : null}
				</div>
			</div>
		</div>
	);
}

/**
 * SceneDisplay — the chrome-less `/display` route rendered in the second-screen window. It prefers the
 * live view-model BROADCAST from the primary window (the DM's edits arrive instantly); until the first
 * broadcast it falls back to this window's own last-loaded runtime state, so opening the window shows the
 * current card even before the next dispatch.
 */
export function SceneDisplay() {
	const runtime = useRuntime();
	const [payload, setPayload] = useState<SceneDisplayPayload | null>(null);

	useEffect(() => {
		const unsubscribe = subscribeSceneDisplay(setPayload);
		requestSceneDisplay();
		return unsubscribe;
	}, []);

	const local = useMemo(
		() =>
			getSceneDisplayForActor(
				runtime.state.session,
				runtime.state.permissions,
				runtime.defaultActorId,
			),
		[runtime.state, runtime.defaultActorId],
	);

	const active = payload ? payload.active : local.active;
	const transitionStyle = payload ? payload.transitionStyle : local.transitionStyle;

	return (
		<div className="app-fixed-viewport scene-display-viewport" role="main">
			<SceneDisplaySurface active={active} transitionStyle={transitionStyle} />
		</div>
	);
}

/**
 * Electron projector receiver. It deliberately has no RuntimeProvider, vault, auth, backup, session,
 * or audio tree; the primary window sends only the already-filtered scene-display DTO. Vault-backed
 * images arrive as same-origin object URLs owned and released by the primary broadcaster.
 */
export function StandaloneSceneDisplay() {
	const [payload, setPayload] = useState<SceneDisplayPayload | null>(null);

	useEffect(() => {
		const unsubscribe = subscribeSceneDisplay(setPayload);
		requestSceneDisplay();
		return unsubscribe;
	}, []);

	return (
		<div className="app-fixed-viewport scene-display-viewport" role="main">
			<SceneDisplaySurface
				active={payload?.active ?? null}
				transitionStyle={payload?.transitionStyle ?? 'cut'}
				resolveVaultAssets={false}
				waiting={!payload}
			/>
		</div>
	);
}
