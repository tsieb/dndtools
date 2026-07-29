import { useEffect, useMemo, useState } from 'react';
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
import { isNativeDesktopRuntime } from '../platform/windowChrome';
import { isNetworkDestinationAllowed, usePlatformCapabilities } from '../platform/capabilities';
import '../styles/scene-display.css';

/** Resolve a card's hero image to a renderable URL (direct for `url`, asset-store for `vault-asset`). */
function useHeroImageUrl(card: SceneCardView | null, resolveVaultAssets: boolean): string | null {
	const capabilities = usePlatformCapabilities();
	const vaultAssetId =
		resolveVaultAssets && card?.heroImage?.kind === 'vault-asset' ? card.heroImage.ref : null;
	const resolved = useAssetObjectUrl(vaultAssetId);
	if (!card?.heroImage) return null;
	if (card.heroImage.kind === 'url') {
		if (isNativeDesktopRuntime()) return null;
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
}: {
	active: SceneCardView | null;
	transitionStyle: SceneCardTransitionStyle;
	resolveVaultAssets?: boolean;
}) {
	const heroUrl = useHeroImageUrl(active, resolveVaultAssets);

	if (!active) {
		return (
			<div className="scene-display" role="img" aria-label="No scene on display">
				<div
					style={{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						color: 'rgba(255,255,255,0.34)',
						font: '500 15px var(--font-sans, system-ui)',
						letterSpacing: '0.04em',
					}}
				>
					No scene on display
				</div>
			</div>
		);
	}

	const theme = moodTheme(active.mood);
	return (
		<div
			className="scene-display"
			role="group"
			aria-label={`${active.title} — ${theme.label} scene`}
		>
			<div
				key={`${active.id}:${transitionStyle}:${active.revision}`}
				className={`scene-display__card scene-display__card--${transitionStyle}`}
				style={{
					background: `radial-gradient(120% 90% at 50% 0%, ${theme.to}, ${theme.from})`,
				}}
			>
				{heroUrl ? (
					<img
						src={heroUrl}
						alt=""
						style={{
							position: 'absolute',
							inset: 0,
							width: '100%',
							height: '100%',
							objectFit: 'cover',
						}}
					/>
				) : null}
				{/* Bottom scrim so title/flavor stay legible over any image. */}
				<div
					style={{
						position: 'absolute',
						inset: 0,
						background: `linear-gradient(to top, ${theme.from}f2 0%, ${theme.from}99 34%, transparent 68%)`,
					}}
				/>
				<div
					style={{
						position: 'relative',
						minWidth: 0,
						padding: 'clamp(28px, 6vw, 88px)',
						display: 'flex',
						flexDirection: 'column',
						gap: 'clamp(10px, 1.6vw, 22px)',
						maxWidth: 1100,
					}}
				>
					<span
						style={{
							alignSelf: 'flex-start',
							padding: '4px 12px',
							borderRadius: 999,
							background: `${theme.accent}22`,
							border: `1px solid ${theme.accent}`,
							color: theme.accent,
							font: '700 clamp(11px, 1.2vw, 14px) var(--font-sans, system-ui)',
							letterSpacing: '0.12em',
							textTransform: 'uppercase',
						}}
					>
						{theme.label}
					</span>
					<h1
						style={{
							margin: 0,
							maxWidth: '100%',
							color: theme.ink,
							font: '800 clamp(30px, 5.4vw, 76px) var(--font-display, Georgia, serif)',
							lineHeight: 1.04,
							overflowWrap: 'anywhere',
							textShadow: '0 2px 24px rgba(0,0,0,0.55)',
						}}
					>
						{active.title}
					</h1>
					{active.flavorText ? (
						<p
							style={{
								margin: 0,
								color: theme.ink,
								opacity: 0.92,
								maxWidth: 820,
								font: '400 clamp(15px, 1.9vw, 26px) var(--font-sans, system-ui)',
								lineHeight: 1.5,
								overflowWrap: 'anywhere',
								textShadow: '0 1px 16px rgba(0,0,0,0.5)',
								whiteSpace: 'pre-wrap',
							}}
						>
							{active.flavorText}
						</p>
					) : null}
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

	useEffect(() => subscribeSceneDisplay(setPayload), []);

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
		<div
			className="app-fixed-viewport"
			style={{ position: 'fixed', inset: 0, background: '#05070c' }}
		>
			<SceneDisplaySurface active={active} transitionStyle={transitionStyle} />
		</div>
	);
}

/**
 * Electron projector receiver. It deliberately has no RuntimeProvider, vault, auth, backup, session,
 * or audio tree; the primary window sends only the already-filtered scene-display DTO. Vault-backed
 * hero bytes are omitted in this isolated surface until they can travel over a dedicated byte channel.
 */
export function StandaloneSceneDisplay() {
	const [payload, setPayload] = useState<SceneDisplayPayload | null>(null);

	useEffect(() => {
		const unsubscribe = subscribeSceneDisplay(setPayload);
		requestSceneDisplay();
		return unsubscribe;
	}, []);

	return (
		<div
			className="app-fixed-viewport"
			style={{ position: 'fixed', inset: 0, background: '#05070c' }}
		>
			<SceneDisplaySurface
				active={payload?.active ?? null}
				transitionStyle={payload?.transitionStyle ?? 'cut'}
				resolveVaultAssets={false}
			/>
		</div>
	);
}
