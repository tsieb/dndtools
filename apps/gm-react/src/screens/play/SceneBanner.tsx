import { useEffect, useState } from 'react';
import type { SceneCardView } from '@dndtools/core';
import { IconButton } from '../../ds';
import { T } from '../../app/screen-kit';
import { moodTheme } from '../../app/sceneCardMood';
import { useAssetObjectUrl } from '../../platform/assetUrl';
import { useViewport } from '../../app/useViewport';
import { isNetworkDestinationAllowed, usePlatformCapabilities } from '../../platform/capabilities';
import { useI18n } from '../../i18n';

/**
 * I11 S11.2.4 — the dismissible SCENE PUSH banner. When the DM activates a player-visible scene card the
 * actor-filtered view-model carries it here, and this hero+flavor banner appears over the player's screen.
 * It auto-dismisses after 5s (and is manually dismissible immediately); a NEW push (different card or
 * revision) re-shows. `aria-live="polite"` announces it without stealing focus.
 */
export function SceneBanner({ card }: { card: SceneCardView | null }) {
	const { t } = useI18n();
	const viewport = useViewport();
	const capabilities = usePlatformCapabilities();
	const [dismissedKey, setDismissedKey] = useState<string | null>(null);
	// WCAG 2.2.1: a 5s auto-dismiss with no way to pause it is a time limit on reading. Worse, the
	// Dismiss button lives INSIDE the region that unmounts, so a player who tabbed to it and paused
	// to read had the banner vanish under them and focus fall to `<body>` mid-interaction. Pointer
	// hover and keyboard focus both hold the timer open — the standard toast affordance. Unpausing
	// restarts the full 5s rather than resuming the remainder, which errs toward more reading time.
	// Hover and focus are tracked SEPARATELY: with one shared flag, moving the mouse away while the
	// Dismiss button still held keyboard focus cleared the hold and the banner vanished anyway.
	const [hovered, setHovered] = useState(false);
	const [focused, setFocused] = useState(false);
	const paused = hovered || focused;
	const key = card ? `${card.id}:${card.revision}` : null;
	useEffect(() => {
		if (!key || paused) return;
		const timer = window.setTimeout(() => setDismissedKey(key), 5000);
		return () => window.clearTimeout(timer);
	}, [key, paused]);

	const vaultAssetId = card?.heroImage?.kind === 'vault-asset' ? card.heroImage.ref : null;
	const resolvedAsset = useAssetObjectUrl(vaultAssetId);
	const heroUrl = card?.heroImage
		? card.heroImage.kind === 'url'
			? capabilities.runtimeKind !== 'android' ||
				isNetworkDestinationAllowed(card.heroImage.ref, capabilities.runtimeKind)
				? card.heroImage.ref
				: null
			: resolvedAsset
		: null;

	if (!card || !key || dismissedKey === key) return null;
	const theme = moodTheme(card.mood);
	return (
		<div
			role="status"
			aria-live="polite"
			data-testid="scene-banner"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			// React's onFocus/onBlur are focusin/focusout, so they fire for the nested Dismiss button.
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
			style={{
				display: 'flex',
				alignItems: 'stretch',
				gap: T.space.zero,
				margin:
					viewport === 'phone'
						? `${T.space.three} ${T.space.four} 0`
						: `${T.space.four} ${T.space.eight} 0`,
				borderRadius: T.radius.xl,
				overflow: 'hidden',
				border: `1px solid ${theme.accent}`,
				background: `linear-gradient(120deg, ${theme.from}, ${theme.to})`,
				boxShadow: T.smd,
			}}
		>
			{heroUrl ? (
				<img src={heroUrl} alt="" style={{ width: 132, flex: '0 0 auto', objectFit: 'cover' }} />
			) : null}
			<div
				style={{
					flex: 1,
					minWidth: 0,
					padding: `${T.space.three} ${T.space.four}`,
					display: 'flex',
					flexDirection: 'column',
					gap: T.space.oneHalf,
				}}
			>
				<span
					style={{
						alignSelf: 'flex-start',
						padding: `${T.space.half} ${T.space.two}`,
						borderRadius: T.radius.full,
						background: `${theme.accent}22`,
						border: `1px solid ${theme.accent}`,
						color: theme.accent,
						font: `700 10px ${T.sans}`,
						letterSpacing: '0.1em',
						textTransform: 'uppercase',
					}}
				>
					{t('play.stage.nowOnScene', { mood: theme.label })}
				</span>
				<div style={{ font: `800 19px ${T.sans}`, color: theme.ink, lineHeight: 1.15 }}>
					{card.title}
				</div>
				{card.flavorText ? (
					<div
						style={{
							font: `13px/1.5 ${T.sans}`,
							color: theme.ink,
							opacity: 0.92,
							whiteSpace: 'pre-wrap',
						}}
					>
						{card.flavorText}
					</div>
				) : null}
			</div>
			<IconButton
				icon="close"
				label={t('play.stage.dismissBanner')}
				variant="ghost"
				size="sm"
				onClick={() => setDismissedKey(key)}
				style={{ flex: '0 0 auto', margin: T.space.two, color: theme.ink }}
			/>
		</div>
	);
}
