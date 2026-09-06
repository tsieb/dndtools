import { useEffect, useState } from 'react';
import type { SceneCardView } from '@dndtools/core';
import { Badge, Icon, IconButton } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { moodTheme } from '../../app/sceneCardMood';
import { useAssetObjectUrl } from '../../platform/assetUrl';
import { useViewport } from '../../app/useViewport';
import { isNetworkDestinationAllowed, usePlatformCapabilities } from '../../platform/capabilities';
import { Panel, PvPage, SectionHead, type LiveData } from './shared';
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
				gap: 0,
				margin: viewport === 'phone' ? '12px 14px 0' : '14px 28px 0',
				borderRadius: 14,
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
					padding: '14px 16px',
					display: 'flex',
					flexDirection: 'column',
					gap: 6,
				}}
			>
				<span
					style={{
						alignSelf: 'flex-start',
						padding: '2px 9px',
						borderRadius: 999,
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
				<div style={{ font: `800 19px ${T.disp}`, color: theme.ink, lineHeight: 1.15 }}>
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
				style={{ flex: '0 0 auto', margin: 8, color: theme.ink }}
			/>
		</div>
	);
}

// 1 · NOW PLAYING — the live stage the DM is projecting + the player's presence row.
export function StageSection({
	data,
	r,
	toast,
	presenceShared,
	selfPresence,
	onPresence,
}: {
	data: LiveData;
	r: number;
	toast: (m: string, s?: string, i?: string) => void;
	/** True when a live joined transport carries presence beats to the DM. */
	presenceShared: boolean;
	/** Our own entry from the host's replicated presence roster (the table-visible truth), when joined. */
	selfPresence: { hand?: boolean; ready?: boolean } | null;
	onPresence: (hand: boolean, ready: boolean) => void;
}) {
	const { t } = useI18n();
	const viewport = useViewport();
	const { live, sceneName } = data;
	const [hand, setHand] = useState(false);
	const [ready, setReady] = useState(true);
	// Reconcile optimistic local state from the host's echoed roster entry — after our beat round-trips,
	// what we show matches what the DM actually sees (and a host-side reset propagates back honestly).
	const remoteHand = selfPresence?.hand;
	const remoteReady = selfPresence?.ready;
	useEffect(() => {
		if (remoteHand !== undefined) setHand(remoteHand);
		if (remoteReady !== undefined) setReady(remoteReady);
	}, [remoteHand, remoteReady]);
	const toggleHand = () => {
		const next = !hand;
		setHand(next);
		if (presenceShared) {
			onPresence(next, ready);
			toast(
				next ? 'Hand raised — your DM can see it' : 'Hand lowered',
				next ? 'info' : 'neutral',
				'flag',
			);
		} else {
			toast(
				next
					? 'Hand raised on this device — join a table to share it with your DM'
					: 'Hand lowered (this device only)',
				next ? 'info' : 'neutral',
				'flag',
			);
		}
	};
	const toggleReady = () => {
		const next = !ready;
		setReady(next);
		if (presenceShared) onPresence(hand, next);
	};
	// RASTER GATING (player side): `data.projectedMap` is non-null ONLY when the DM actively
	// projected a map to this viewer (`resolveProjectedMapForViewer`), so this is the only state in
	// which the device ever asks the asset store for map image bytes. A missing blob (e.g. a remote
	// device that never held the bytes) renders the honest geometry-name state, never a crash.
	const projected = data.projectedMap;
	const projectedRasterUrl = useAssetObjectUrl(projected?.rasterAssetId ?? null);
	return (
		<PvPage max={1180}>
			<SectionHead
				title={t('play.nav.stage')}
				sub={
					live
						? sceneName
							? t('play.stage.subScene', { scene: sceneName })
							: t('play.stage.subLive')
						: t('play.stage.sub')
				}
				action={
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 8,
							padding: '6px 12px',
							borderRadius: 20,
							background: live ? 'var(--color-status-success-subtle)' : T.alt,
							border: `1px solid ${live ? 'var(--color-status-success-border)' : T.bd}`,
						}}
					>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: '50%',
								background: live ? 'var(--color-status-success-text)' : T.ter,
							}}
						/>
						<span
							style={{
								font: `600 12px ${T.sans}`,
								color: live ? 'var(--color-status-success-text)' : T.ter,
							}}
						>
							{t(live ? 'play.sessionLive' : 'play.standby')}
						</span>
					</span>
				}
			/>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						viewport === 'phone' ? 'minmax(0,1fr)' : 'minmax(0,1.55fr) minmax(0,1fr)',
					gap: 18,
					alignItems: 'start',
				}}
			>
				<div
					style={{
						borderRadius: 12,
						overflow: 'hidden',
						border: `1px solid ${T.bd}`,
						boxShadow: T.smd,
					}}
				>
					<div
						data-testid="player-stage"
						// The class exists only so `@media (forced-colors: active)` can drop the gradients:
						// a media query cannot live in an inline style, and the OS token remap resets
						// background-COLOR only, so this near-black theatre gradient survived while the caption
						// over it was forced to CanvasText — black on black in a light high-contrast theme.
						className="player-stage"
						style={{
							position: 'relative',
							aspectRatio: '16 / 10',
							// These used to be a `background` shorthand carrying the two theatre gradients
							// followed by a `backgroundImage` carrying the grid. React writes style keys in
							// order, so the second declaration REPLACED the first's layers outright — and the
							// shorthand had already reset background-color to transparent. The projected
							// stage therefore rendered as a see-through box with faint grid lines over the
							// page, lightest exactly where it should be darkest (parchment). One layer list.
							//
							// The grid tint is a fixed warm rgba rather than `color-mix(var(--color-accent))`
							// because the stage backdrop is deliberately near-black in every theme: parchment's
							// dark `#9a5418` accent at 14% over `#100b07` composites to invisible.
							backgroundColor: '#0d0906',
							backgroundImage: sceneName
								? `linear-gradient(rgba(224, 176, 111, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(224, 176, 111, 0.16) 1px, transparent 1px), radial-gradient(120% 80% at 50% 8%, color-mix(in srgb, var(--color-accent) 16%, #1a130b) 0%, #100b07 70%), linear-gradient(135deg, #15100a, #0d0906)`
								: 'none',
							backgroundSize: sceneName ? '38px 38px, 38px 38px, auto, auto' : 'auto',
						}}
					>
						{/* projected map raster — bytes resolve only because the projection gate admitted the id */}
						{projectedRasterUrl && (
							<img
								src={projectedRasterUrl}
								alt={projected ? `Map: ${projected.name}` : 'Projected map'}
								style={{
									position: 'absolute',
									inset: 0,
									width: '100%',
									height: '100%',
									objectFit: 'cover',
								}}
							/>
						)}
						<div style={{ position: 'absolute', top: 14, left: 16 }}>
							<span style={{ ...eb, color: 'color-mix(in srgb, var(--color-accent) 80%, #fff)' }}>
								{t('play.stage.whatTheTableSees')}
							</span>
						</div>
						{projected && !projectedRasterUrl && (
							<div
								style={{
									position: 'absolute',
									top: 12,
									right: 14,
									display: 'inline-flex',
									alignItems: 'center',
									gap: 6,
									padding: '4px 10px',
									borderRadius: 8,
									background: 'rgba(8,5,3,.6)',
									font: `11px ${T.sans}`,
									color: 'rgba(243,231,210,.75)',
								}}
							>
								<Icon name="info" size={12} />
								{projected.rasterAssetId
									? 'Map image not on this device — showing the map name'
									: 'Geometric map (no image layer)'}
							</div>
						)}
						{sceneName || projected ? (
							<div
								className="player-stage-scrim"
								style={{
									position: 'absolute',
									left: 0,
									right: 0,
									bottom: 0,
									padding: '20px 22px',
									background: 'linear-gradient(transparent, rgba(8,5,3,.85))',
								}}
							>
								<div style={{ font: `600 24px ${T.disp}`, color: '#f3e7d2' }}>
									{sceneName ?? projected?.name}
								</div>
								{projected && sceneName && (
									<div
										style={{ marginTop: 2, font: `13px ${T.sans}`, color: 'rgba(243,231,210,.85)' }}
									>
										{t('play.stage.map', { name: projected.name })}
									</div>
								)}
								<div
									style={{ marginTop: 3, font: `13px ${T.sans}`, color: 'rgba(243,231,210,.7)' }}
								>
									{t('play.stage.projectedByDm')}
								</div>
							</div>
						) : (
							<div
								style={{
									position: 'absolute',
									inset: 0,
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'center',
									justifyContent: 'center',
									gap: 10,
									// The stage's own `#0d0906` is unconditional, but T.ter follows the THEME —
									// parchment's `#837057` measures 4.23:1 on it, under WCAG 1.4.3. The
									// populated branch above already paints this backdrop with a fixed light
									// literal (~8:1); use the same one so the empty state matches it.
									color: 'rgba(243,231,210,.7)',
								}}
							>
								<Icon name="atlas-map" size="xl" color="rgba(243,231,210,.7)" />
								<span style={{ font: `14px ${T.sans}` }}>{t('play.stage.nothingShown')}</span>
							</div>
						)}
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							padding: '12px 16px',
							background: T.surf,
							borderTop: `1px solid ${T.bd}`,
							flexWrap: 'wrap',
						}}
					>
						{/* Presence (raise hand / ready): over a live joined transport each toggle sends a
						    `presence-beat` side-channel message the host applies as `session.set-presence`
						    (stamped, self-only) — otherwise it stays honestly device-local and says so. */}
						{r >= 1 ? (
							<>
								<button
									type="button"
									aria-pressed={hand}
									onClick={toggleHand}
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 7,
										padding: '8px 13px',
										borderRadius: 9,
										cursor: 'pointer',
										font: `600 12.5px ${T.sans}`,
										border: `1px solid ${hand ? T.accBd : T.bd}`,
										background: hand ? T.accSub : T.surf,
										color: hand ? T.acc : T.sub,
									}}
								>
									<Icon name="flag" size={15} />
									{hand ? 'Hand raised' : 'Raise hand'}
								</button>
								<button
									type="button"
									aria-pressed={ready}
									onClick={toggleReady}
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 7,
										padding: '8px 13px',
										borderRadius: 9,
										cursor: 'pointer',
										font: `600 12.5px ${T.sans}`,
										border: `1px solid ${ready ? 'var(--color-status-success-border)' : T.bd}`,
										background: ready ? 'var(--color-status-success-subtle)' : T.surf,
										color: ready ? 'var(--color-status-success-text)' : T.sub,
									}}
								>
									<Icon name="check" size={15} />
									{ready ? "I'm ready" : 'Not ready'}
								</button>
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
									{presenceShared
										? 'Shared live with your DM'
										: 'Device-local — join a table to share'}
								</span>
							</>
						) : (
							<span
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 7,
									font: `12.5px ${T.sans}`,
									color: T.ter,
								}}
							>
								<Icon name="reveal" size={15} color={T.ter} />
								{t('play.stage.watching')}
							</span>
						)}
						<div style={{ flex: 1 }} />
						<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{t('play.stage.dmControls')}
						</span>
					</div>
				</div>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel
						title={t('play.stage.thisTurn')}
						accent
						action={
							data.round != null ? (
								<Badge status="neutral">{t('play.stage.round', { round: data.round })}</Badge>
							) : undefined
						}
					>
						{data.turnOrder.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
								{data.activeName
									? t('play.stage.activeCombatant', { name: data.activeName })
									: t('play.stage.noCombat')}
							</div>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
								{data.turnOrder.map((c) => (
									<div
										key={c.id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 9,
											padding: '6px 9px',
											borderRadius: 8,
											background: c.active ? T.accSub : 'transparent',
											border: `1px solid ${c.active ? T.accBd : 'transparent'}`,
										}}
									>
										<span
											style={{
												font: `700 13px ${T.mono}`,
												width: 22,
												textAlign: 'center',
												color: c.active ? T.acc : T.ter,
											}}
										>
											{c.init ?? '—'}
										</span>
										<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: T.sub }}>
											{c.name}
										</span>
										{c.kind === 'pc' && c.hp != null && (
											<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
												{c.hp}/{c.maxHp}
											</span>
										)}
									</div>
								))}
							</div>
						)}
					</Panel>
					<Panel title={t('play.stage.sharedHandouts')}>
						{data.handouts.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
								{t('play.stage.nothingShared')}
							</div>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
								{data.handouts.slice(0, 3).map((h) => (
									<div key={h.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
										<div
											style={{
												width: 40,
												height: 40,
												flex: '0 0 auto',
												borderRadius: 9,
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												background: T.alt,
												border: `1px solid ${T.bd}`,
											}}
										>
											<Icon name="knowledge-book" size="md" color={T.acc} />
										</div>
										<div style={{ flex: 1, minWidth: 0 }}>
											<div style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{h.title}</div>
											<div
												style={{
													font: `12px/1.4 ${T.sans}`,
													color: T.sub,
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
												}}
											>
												{h.body}
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</Panel>
				</div>
			</div>
		</PvPage>
	);
}
