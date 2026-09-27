import { useEffect, useState } from 'react';
import { Badge, Icon } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { useAssetObjectUrl } from '../../platform/assetUrl';
import { useViewport } from '../../app/useViewport';
import { PartyBoardTiles } from '../../app/character/PartyPanel';
import { InitiativeCallCard, Panel, PvPage, SectionHead, type LiveData } from './shared';
import { Illustration } from '../../ds/illustrations';
import { StageMap } from './StageMap';
import { useI18n } from '../../i18n';

// 1 · NOW PLAYING — the live stage the DM is projecting + the player's presence row.
export function StageSection({
	data,
	r,
	toast,
	presenceShared,
	selfPresence,
	onPresence,
	onRollInitiative,
}: {
	data: LiveData;
	r: number;
	toast: (m: string, s?: string, i?: string) => void;
	/** True when a live joined transport carries presence beats to the DM. */
	presenceShared: boolean;
	/** Our own entry from the host's replicated presence roster (the table-visible truth), when joined. */
	selfPresence: { hand?: boolean; ready?: boolean } | null;
	onPresence: (hand: boolean, ready: boolean) => void;
	/** RC-SES-5.1 — roll for the DM's initiative call (the request rides the command path). */
	onRollInitiative: () => Promise<void>;
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
				next ? t('play.polish.handUpLive') : t('play.polish.handDownLive'),
				next ? 'info' : 'neutral',
				'flag',
			);
		} else {
			toast(
				next ? t('play.polish.handUpLocal') : t('play.polish.handDownLocal'),
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
							gap: T.space.two,
							padding: `${T.space.oneHalf} ${T.space.three}`,
							borderRadius: T.radius.xl,
							background: live ? 'var(--color-status-success-subtle)' : T.alt,
							border: `1px solid ${live ? 'var(--color-status-success-border)' : T.bd}`,
						}}
					>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: T.radius.full,
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
			{/* RC-SES-5.1 — the call goes above the stage, not into the turn panel beside it: on a phone
			    that panel is a screen's scroll away, and "roll for initiative" is the one thing the
			    player has to do right now. */}
			{data.initiativeCall && (
				<div style={{ marginBottom: T.space.four }}>
					<InitiativeCallCard call={data.initiativeCall} onRoll={onRollInitiative} />
				</div>
			)}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						viewport === 'phone' ? 'minmax(0,1fr)' : 'minmax(0,1.55fr) minmax(0,1fr)',
					gap: T.space.four,
					alignItems: 'start',
				}}
			>
				<div
					style={{
						borderRadius: T.radius.lg,
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
						{/* RC-CLD-3.2 — the projected map with the DM's projection choices on it: the raster
						    (bytes resolve only because the projection gate admitted the id) PLUS the
						    actor-filtered fog, markers and tokens. It used to be the raster alone, so the
						    player's own device showed an unfogged picture of a map the table saw fogged. */}
						{projected && <StageMap projected={projected} rasterUrl={projectedRasterUrl} />}
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
									gap: T.space.oneHalf,
									padding: `${T.space.one} ${T.space.two}`,
									borderRadius: T.radius.md,
									background: 'rgba(8,5,3,.6)',
									font: `11px ${T.sans}`,
									color: 'rgba(243,231,210,.75)',
								}}
							>
								<Icon name="info" size={12} />
								{projected.rasterAssetId
									? t('play.polish.mapMissing')
									: t('play.polish.mapGeometry')}
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
									padding: `${T.space.five} ${T.space.five}`,
									background: 'linear-gradient(transparent, rgba(8,5,3,.85))',
								}}
							>
								<div style={{ font: `600 24px ${T.disp}`, color: '#f3e7d2' }}>
									{sceneName ?? projected?.name}
								</div>
								{projected && sceneName && (
									<div
										style={{
											marginTop: T.space.half,
											font: `13px ${T.sans}`,
											color: 'rgba(243,231,210,.85)',
										}}
									>
										{t('play.stage.map', { name: projected.name })}
									</div>
								)}
								<div
									style={{
										marginTop: T.space.half,
										font: `13px ${T.sans}`,
										color: 'rgba(243,231,210,.7)',
									}}
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
									gap: T.space.two,
									// The stage's own `#0d0906` is unconditional, but T.ter follows the THEME —
									// parchment's `#837057` measures 4.23:1 on it, under WCAG 1.4.3. The
									// populated branch above already paints this backdrop with a fixed light
									// literal (~8:1); use the same one so the empty state matches it.
									color: 'rgba(243,231,210,.7)',
								}}
							>
								<Illustration name="play-waiting" size={80} />
								<span style={{ font: `14px ${T.sans}` }}>{t('play.stage.nothingShown')}</span>
							</div>
						)}
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: T.space.two,
							padding: `${T.space.three} ${T.space.four}`,
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
									className="player-presence-action"
									aria-pressed={hand}
									onClick={toggleHand}
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: T.space.oneHalf,
										padding: `${T.space.two} ${T.space.three}`,
										borderRadius: T.radius.lg,
										cursor: 'pointer',
										font: `600 12.5px ${T.sans}`,
										border: `1px solid ${hand ? T.accBd : T.bd}`,
										background: hand ? T.accSub : T.surf,
										color: hand ? T.acc : T.sub,
									}}
								>
									<Icon name="flag" size={15} />
									{hand ? t('play.polish.handRaised') : t('play.polish.raiseHand')}
								</button>
								<button
									type="button"
									className="player-presence-action"
									aria-pressed={ready}
									onClick={toggleReady}
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: T.space.oneHalf,
										padding: `${T.space.two} ${T.space.three}`,
										borderRadius: T.radius.lg,
										cursor: 'pointer',
										font: `600 12.5px ${T.sans}`,
										border: `1px solid ${ready ? 'var(--color-status-success-border)' : T.bd}`,
										background: ready ? 'var(--color-status-success-subtle)' : T.surf,
										color: ready ? 'var(--color-status-success-text)' : T.sub,
									}}
								>
									<Icon name="check" size={15} />
									{ready ? t('play.polish.ready') : t('play.polish.notReady')}
								</button>
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
									{presenceShared ? t('play.polish.presenceLive') : t('play.polish.presenceLocal')}
								</span>
							</>
						) : (
							<span
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: T.space.oneHalf,
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

				<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.four }}>
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
							<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.oneHalf }}>
								{data.turnOrder.map((c) => (
									<div
										key={c.id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: T.space.two,
											padding: `${T.space.oneHalf} ${T.space.two}`,
											borderRadius: T.radius.md,
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
					{/* RC-CHR-3.1 — the party's live vitals as a board tile row, right beside the turn order,
					    so a player reads who is hurt without leaving the stage. Same shape the Party
					    section paints; absent (not empty) when no party member is visible. */}
					{data.partyVitals.length > 0 && (
						<Panel title={t('play.party.vitals')}>
							<PartyBoardTiles members={data.partyVitals} />
						</Panel>
					)}
					<Panel title={t('play.stage.sharedHandouts')}>
						{data.handouts.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
								{t('play.stage.nothingShared')}
							</div>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}>
								{data.handouts.slice(0, 3).map((h) => (
									<div
										key={h.id}
										style={{ display: 'flex', gap: T.space.two, alignItems: 'center' }}
									>
										<div
											style={{
												width: 40,
												height: 40,
												flex: '0 0 auto',
												borderRadius: T.radius.lg,
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
												title={h.body}
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
