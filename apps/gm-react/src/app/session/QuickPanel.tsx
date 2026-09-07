import { useState } from 'react';
import {
	getCombatTrackerForActor,
	getSessionAudioView,
	listAudioAssetsForActor,
	listAudioSourceClassificationsForActor,
} from '@dndtools/core';
import { Button, Icon, IconButton, Input, Sheet, Toaster } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { T } from '../screen-kit';
import { useSessionPosture } from '../shell/session-posture';

/**
 * RC-SES-1.2 — the SESSION QUICK PANEL: the handful of controls a DM reaches for mid-turn, carried
 * on every route while the session is live rather than only on `/session`. Looking something up in
 * the compendium should not cost the party its turn order.
 *
 * The panel owns no state of its own. Every control dispatches the same core command the `/session`
 * console dispatches (`combat.advance-turn`, `dice.roll`, `session.audio.pause/resume`,
 * `session.deliver-handout`) and every readout comes from an actor-scoped query, so a DM previewing
 * as a player sees that player's panel and the panel can never disagree with the console.
 *
 * TWO SURFACES, ONE BODY. Desktop mounts `SessionQuickPanel` inside the right rail (SessionRail);
 * the rail and phone tiers have no width to spare, so they get `SessionQuickSheet` — a trigger in
 * the corner above the navigation that opens the identical body in a bottom sheet. Nothing is
 * duplicated between them and nothing is tier-specific except the container.
 *
 * FAIL CLOSED. A control that cannot work is absent or disabled with the reason shown, never a
 * button that reports success: Next turn only exists while combat is running, the handout push is
 * disabled without an active scene or a player to send it to, and previewing as a player disables
 * every write.
 */

/** The dice bar. `1dN` for each; the die's own number is the glyph, in the die's shape. */
const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

/**
 * The die-face outline for each size: d4 a triangle, d6 a square, d8/d10 diamonds, d12/d20 hexagons,
 * d100 a rounded pill. Drawn with `clip-path` on the button's own background so the glyph is the die
 * rather than a generic chip, and the label inside stays real selectable text for a screen reader.
 */
const DIE_SHAPE: Record<number, string> = {
	4: 'polygon(50% 4%, 96% 96%, 4% 96%)',
	6: 'polygon(8% 8%, 92% 8%, 92% 92%, 8% 92%)',
	8: 'polygon(50% 2%, 92% 50%, 50% 98%, 8% 50%)',
	10: 'polygon(50% 2%, 92% 38%, 74% 98%, 26% 98%, 8% 38%)',
	12: 'polygon(50% 2%, 93% 27%, 93% 73%, 50% 98%, 7% 73%, 7% 27%)',
	20: 'polygon(50% 2%, 93% 27%, 93% 73%, 50% 98%, 7% 73%, 7% 27%)',
	100: 'polygon(50% 2%, 93% 27%, 93% 73%, 50% 98%, 7% 73%, 7% 27%)',
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
			<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{label}</div>
			{children}
		</div>
	);
}

function DieButton({
	sides,
	disabled,
	onRoll,
}: {
	sides: number;
	disabled: boolean;
	onRoll: (expression: string) => void;
}) {
	const { t } = useI18n();
	const expression = `1d${sides}`;
	return (
		<button
			type="button"
			data-testid={`quick-die-d${sides}`}
			disabled={disabled}
			onClick={() => onRoll(expression)}
			aria-label={t('session.quick.rollDie', { expression })}
			style={{
				width: 38,
				height: 38,
				display: 'grid',
				placeItems: 'center',
				border: 'none',
				padding: 0,
				background: disabled ? T.alt : T.accSub,
				clipPath: DIE_SHAPE[sides],
				color: disabled ? T.ter : T.ink,
				font: `700 ${sides === 100 ? 10 : 11.5}px ${T.mono}`,
				cursor: disabled ? 'default' : 'pointer',
			}}
		>
			<span aria-hidden="true" style={{ paddingTop: sides === 4 ? 6 : 0 }}>
				d{sides}
			</span>
		</button>
	);
}

/** The panel body. Renders nothing when the session is not live — the shell mounts it unconditionally. */
export function SessionQuickPanel({ onNavigated }: { onNavigated?: () => void } = {}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const posture = useSessionPosture();
	const [customOpen, setCustomOpen] = useState(false);
	const [customExpr, setCustomExpr] = useState('1d20+5');
	const [handoutTitle, setHandoutTitle] = useState('');

	const actorId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const state = runtime.state;
	const perms = state.permissions;
	const isDm = perms.actors[actorId]?.role === 'dm';

	if (!posture.live) return null;

	// SES-002 — actor-filtered reads only: the panel never decides what this viewer may see.
	const tracker = getCombatTrackerForActor(state.session.combat, perms, actorId);
	const activeCombatant =
		tracker.status === 'running'
			? (tracker.combatants.find((c) => c.id === tracker.activeCombatantId) ?? null)
			: null;
	const audio = getSessionAudioView(state.audio, state.session.audioPlayback, perms, actorId);
	const track = audio.track;
	const trackLabel = track
		? ((track.assetId
				? listAudioAssetsForActor(state.audio, perms, actorId).find((a) => a.id === track.assetId)
						?.title
				: undefined) ??
			listAudioSourceClassificationsForActor(state.audio, perms, actorId).find(
				(s) => s.sourceId === track.sourceId,
			)?.displayName ??
			track.assetId ??
			track.sourceId)
		: null;
	const activeSceneId = state.session.activeSceneId;
	const players = Object.values(perms.actors).filter((a) => a.role === 'player');

	async function dispatch(
		command: Parameters<typeof runtime.dispatch>[0],
		ok?: string,
	): Promise<boolean> {
		const result = await runtime.dispatch(command);
		if (result.status === 'accepted') {
			if (ok) Toaster.success(ok);
			return true;
		}
		Toaster.error(result.rejection.message);
		return false;
	}

	function roll(expression: string): void {
		void dispatch({ type: 'dice.roll', actorId, payload: { expression } });
	}

	async function pushHandout(): Promise<void> {
		const title = handoutTitle.trim();
		if (!title || !activeSceneId || players.length === 0) return;
		const ok = await dispatch(
			{
				type: 'session.deliver-handout',
				actorId,
				payload: {
					title,
					sections: [{ heading: title, body: '', visibility: 'player-visible' as const }],
					sceneId: activeSceneId,
					recipientActorIds: players.map((p) => p.id),
				},
			},
			t('projection.pushed', { title, count: players.length }),
		);
		if (ok) {
			setHandoutTitle('');
			onNavigated?.();
		}
	}

	const writesBlocked = previewing || !isDm;
	const handoutBlocked = writesBlocked || !activeSceneId || players.length === 0;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
			{posture.elapsed && (
				<Section label={t('shell.sessionElapsed')}>
					<div
						data-testid="session-rail-elapsed"
						style={{ font: `600 22px ${T.mono}`, color: T.ink, letterSpacing: '.02em' }}
					>
						{posture.elapsed}
					</div>
				</Section>
			)}

			<Section label={t('shell.sessionTurn')}>
				<div style={{ font: `600 13.5px ${T.sans}`, color: activeCombatant ? T.ink : T.ter }}>
					{activeCombatant ? activeCombatant.name : t('shell.sessionNoTurn')}
				</div>
				{activeCombatant && (
					<>
						<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
							{t('shell.sessionRound', { round: tracker.round })}
						</div>
						<Button
							variant="accent"
							size="sm"
							icon="skip"
							data-testid="quick-next-turn"
							disabled={writesBlocked}
							onClick={() => void dispatch({ type: 'combat.advance-turn', actorId, payload: {} })}
						>
							{t('session.quick.nextTurn')}
						</Button>
					</>
				)}
			</Section>

			<Section label={t('session.quick.dice')}>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{DICE.map((sides) => (
						<DieButton key={sides} sides={sides} disabled={writesBlocked} onRoll={roll} />
					))}
					<IconButton
						icon="dice"
						label={t('session.quick.custom')}
						variant="ghost"
						size="sm"
						aria-expanded={customOpen}
						onClick={() => setCustomOpen((v) => !v)}
					/>
				</div>
				{customOpen && (
					<form
						style={{ display: 'flex', gap: 6 }}
						onSubmit={(e) => {
							e.preventDefault();
							if (writesBlocked || !customExpr.trim()) return;
							roll(customExpr.trim());
						}}
					>
						<Input
							value={customExpr}
							onChange={(e: { target: { value: string } }) => setCustomExpr(e.target.value)}
							aria-label={t('session.dice.expression')}
							style={{ flex: 1, minWidth: 0 }}
						/>
						<Button
							type="submit"
							variant="secondary"
							size="sm"
							disabled={writesBlocked || !customExpr.trim()}
						>
							{t('session.dice.roll')}
						</Button>
					</form>
				)}
			</Section>

			{track && (
				<Section label={t('session.audio.title')}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<Icon name="audio" size="sm" color={track.status === 'playing' ? T.acc : T.sub} />
						<span
							style={{
								flex: 1,
								minWidth: 0,
								font: `12.5px ${T.sans}`,
								color: T.ink,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							{trackLabel}
						</span>
						{isDm && (
							<IconButton
								icon={track.status === 'playing' ? 'pause' : 'play'}
								label={t(
									track.status === 'playing' ? 'session.audio.pause' : 'session.audio.resume',
								)}
								variant="ghost"
								size="sm"
								disabled={previewing}
								onClick={() =>
									void dispatch({
										type:
											track.status === 'playing' ? 'session.audio.pause' : 'session.audio.resume',
										actorId,
										payload: {},
									})
								}
							/>
						)}
					</div>
				</Section>
			)}

			{isDm && (
				<Section label={t('session.quick.handout')}>
					<form
						style={{ display: 'flex', gap: 6 }}
						onSubmit={(e) => {
							e.preventDefault();
							void pushHandout();
						}}
					>
						<Input
							value={handoutTitle}
							onChange={(e: { target: { value: string } }) => setHandoutTitle(e.target.value)}
							placeholder={t('session.quick.handoutPlaceholder')}
							aria-label={t('session.quick.handout')}
							style={{ flex: 1, minWidth: 0 }}
						/>
						<Button
							type="submit"
							variant="secondary"
							size="sm"
							icon="send"
							disabled={handoutBlocked || !handoutTitle.trim()}
						>
							{t('session.quick.push')}
						</Button>
					</form>
					{/* The reason the push is unavailable, rather than a control that silently does nothing. */}
					{!previewing && (!activeSceneId || players.length === 0) && (
						<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
							{activeSceneId ? t('projection.noPlayers') : t('session.goLive.needsSceneShort')}
						</div>
					)}
				</Section>
			)}
		</div>
	);
}

/**
 * The rail/phone surface: a compact trigger pinned above the navigation that opens the same body in
 * a bottom sheet. It exists only while the session is live, so it costs an idle app nothing.
 */
export function SessionQuickSheet({ bottomOffset }: { bottomOffset: number }) {
	const { t } = useI18n();
	const posture = useSessionPosture();
	const [open, setOpen] = useState(false);
	if (!posture.live) return null;
	return (
		<>
			<button
				type="button"
				data-testid="session-quick-trigger"
				onClick={() => setOpen(true)}
				style={{
					position: 'fixed',
					right: 'calc(12px + var(--safe-area-right, 0px))',
					bottom: `calc(${bottomOffset}px + var(--safe-area-bottom, 0px))`,
					zIndex: 40,
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					padding: '8px 12px',
					borderRadius: 999,
					border: `1px solid ${T.accBd}`,
					background: T.acc,
					color: T.accFg,
					font: `600 12px ${T.sans}`,
					boxShadow: T.smd,
					cursor: 'pointer',
				}}
			>
				<Icon name="session-bolt" size="sm" color={T.accFg} />
				{posture.elapsed ?? t('shell.sessionLive')}
			</button>
			<Sheet
				open={open}
				onClose={() => setOpen(false)}
				side="bottom"
				title={t('shell.sessionRail')}
			>
				<div data-testid="session-quick-sheet" style={{ paddingBottom: 8 }}>
					<SessionQuickPanel onNavigated={() => setOpen(false)} />
				</div>
			</Sheet>
		</>
	);
}
