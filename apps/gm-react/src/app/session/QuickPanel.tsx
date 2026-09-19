import { useEffect, useMemo, useState } from 'react';
import {
	DICE_SCHEMA_VERSION,
	getActiveSystemForActor,
	getCombatTrackerForActor,
	getDiceHistoryForActor,
	getQuickTimerForActor,
	getSessionAudioView,
	listAudioAssetsForActor,
	listAudioSourceClassificationsForActor,
	parseDiceExpression,
	readRollUnderSystem,
	type EvaluatedDiceTerm,
	type EvaluatedTerm,
	type SystemPackage,
	type SystemRollReadout,
} from '@dndtools/core';
import {
	Button,
	DiceResult,
	Icon,
	IconButton,
	Input,
	SegmentedControl,
	Sheet,
	Toaster,
} from '../../ds';
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

/** RC-SES-4.4 — the quick-panel timer's urgency-band numeral color (mirrors `TimerBody`'s widget). */
const URGENCY_COLOR: Record<string, string> = {
	danger: T.err,
	warning: T.warn,
	normal: T.ink,
};

/** What a recorded roll carries that its readout needs — a `DiceRollView` and the tray's rows both fit. */
export interface RecordedRoll {
	expression: string;
	total: number;
	dice: number[];
	modifier: number;
	terms?: EvaluatedTerm[];
}

/** A recorded roll as `DiceResult` props. */
export interface RollChipProps {
	notation: string;
	total: number;
	rolls: number[];
	modifier: number;
	model?: SystemRollReadout['model'];
	dice?: SystemRollReadout['dice'];
	successes?: number | null;
	successThreshold?: number | null;
	tier?: SystemRollReadout['tier'];
	crit: 'success' | 'fail' | undefined;
	critNatural: number | null;
}

/** The sides of the package's CORE die: the die in `dice.notation` (5e's `1d20`, Generic's `1d6`). */
function coreDieSides(pkg: SystemPackage): number | null {
	const parsed = parseDiceExpression(pkg.dice.notation);
	if (!parsed.ok) return null;
	const term = parsed.expression.terms.find((t) => t.kind === 'dice');
	return term?.kind === 'dice' ? term.sides : null;
}

/**
 * RC-SES-2.4 — a recorded roll as `DiceResult` props, read through the ACTIVE system package
 * (RC-SYS-2.4): the package's model and headline, and crit/fumble by its own `dice.crit` rules. The
 * quick panel and the /session tray both read rolls through here, so the two readouts of one roll
 * cannot disagree.
 *
 * A natural is judged on the package's CORE die only. `readRollUnderSystem` reads naturals off the
 * widest die in the expression, so under 5e a `2d6+3` damage roll showing a 1 reads as a fumble, and
 * `1d20+1d100` crits whenever the d100 clears 20 — true to the numbers, wrong at the table. A 5e
 * roll crits off its d20, a Generic pool off its d6, and a roll without the core die has no natural
 * to celebrate. A tiered (2d6-pbta) package spends its bounds on the tier, as the core does. A legacy
 * record with no `terms` has no faces to read and stays plain.
 */
export function diceResultProps(pkg: SystemPackage, roll: RecordedRoll): RollChipProps {
	const base = {
		notation: roll.expression,
		total: roll.total,
		rolls: roll.dice,
		modifier: roll.modifier,
	};
	const terms = roll.terms ?? [];
	const diceTerms = terms.filter((t): t is EvaluatedDiceTerm => t.kind === 'dice');
	if (diceTerms.length === 0) return { ...base, crit: undefined, critNatural: null };
	const read = readRollUnderSystem(pkg, {
		expression: roll.expression,
		seed: 0,
		terms,
		dice: roll.dice,
		kept: diceTerms.flatMap((t) => t.kept),
		modifier: roll.modifier,
		total: roll.total,
		schemaVersion: DICE_SCHEMA_VERSION,
	});
	const sides = coreDieSides(pkg);
	const faces = diceTerms.filter((t) => t.sides === sides).flatMap((t) => t.kept);
	const { naturalHigh, naturalLow } = pkg.dice.crit;
	const judged = read.tier === null;
	const high = judged && naturalHigh !== null ? faces.filter((f) => f >= naturalHigh) : [];
	const low = judged && naturalLow !== null ? faces.filter((f) => f <= naturalLow) : [];
	const crit = high.length > 0 ? 'success' : low.length > 0 ? 'fail' : undefined;
	return {
		...base,
		model: read.model,
		dice: read.dice,
		successes: read.headlineKind === 'successes' ? read.headline : null,
		successThreshold: read.successThreshold,
		tier: read.tier,
		crit,
		critNatural: crit === 'success' ? Math.max(...high) : crit === 'fail' ? Math.min(...low) : null,
	};
}

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
	const [timerMode, setTimerMode] = useState<'countdown' | 'break'>('countdown');
	const [timerMinutes, setTimerMinutes] = useState('5');
	const [timerLabel, setTimerLabel] = useState('');
	const [nowIso, setNowIso] = useState(() => new Date().toISOString());

	const actorId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const state = runtime.state;
	const perms = state.permissions;
	const isDm = perms.actors[actorId]?.role === 'dm';
	// RC-SES-2.4 — the roll already showing when the panel mounts RESTS; only a roll that lands while
	// it is open plays its drama, so a route change or reopening the sheet never replays an old nat 20.
	const [settledRollId] = useState(() => {
		const rolls = getDiceHistoryForActor(state.session, perms, actorId).rolls;
		return rolls[rolls.length - 1]?.id ?? null;
	});
	const activePackage = useMemo(
		() => getActiveSystemForActor(state.systems, perms, actorId).activePackage,
		[state.systems, perms, actorId],
	);

	// RC-SES-4.4 — the quick-panel timer ticks only while it is actually running (an idle/paused
	// panel schedules no timer), mirroring the Timer widget body's own tick discipline.
	const timerTicking = state.session.quickTimer?.status === 'running';
	useEffect(() => {
		if (!timerTicking) return;
		setNowIso(new Date().toISOString());
		const id = window.setInterval(() => setNowIso(new Date().toISOString()), 500);
		return () => window.clearInterval(id);
	}, [timerTicking]);

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
	// SES-002 — actor-scoped: a countdown is DM-only tooling, a break additionally projects a "Back
	// in M:SS" card to a player (`queries/session-quick-timer.ts` decides which, never this component).
	const quickTimerView = getQuickTimerForActor(state.session.quickTimer, perms, actorId, nowIso);
	// `getDiceHistoryForActor` appends, so the newest visible roll is the last one.
	const diceRolls = getDiceHistoryForActor(state.session, perms, actorId).rolls;
	const lastRoll = diceRolls[diceRolls.length - 1];

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

	function startTimer(): void {
		const minutes = Number(timerMinutes);
		if (!Number.isFinite(minutes) || minutes <= 0) return;
		void dispatch({
			type: 'session.quick-timer.start',
			actorId,
			payload: {
				kind: timerMode,
				durationSeconds: Math.round(minutes * 60),
				...(timerLabel.trim() ? { label: timerLabel.trim() } : {}),
			},
		});
		setTimerLabel('');
	}

	function operateTimer(
		type:
			| 'session.quick-timer.pause'
			| 'session.quick-timer.resume'
			| 'session.quick-timer.reset'
			| 'session.quick-timer.lap',
	): void {
		void dispatch({ type, actorId, payload: {} });
	}

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

			{/* RC-SES-4.4 — a DM sees the full control surface (either kind); a player/preview sees only
			    the "Back in M:SS" break card, never a countdown (a countdown is DM-only pacing). */}
			{(quickTimerView.control || quickTimerView.breakCard || (isDm && !writesBlocked)) && (
				<Section label={t('session.quick.timer')}>
					{quickTimerView.control ? (
						<>
							<div
								data-testid="quick-timer-display"
								style={{
									font: `700 22px ${T.mono}`,
									color: URGENCY_COLOR[quickTimerView.control.countdown.urgency] ?? T.ink,
									letterSpacing: '.02em',
								}}
							>
								{quickTimerView.control.countdown.display}
							</div>
							<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
								{quickTimerView.control.timer.label ??
									t(
										quickTimerView.control.timer.kind === 'break'
											? 'session.quick.timerModeBreak'
											: 'session.quick.timerModeCountdown',
									)}
							</div>
							<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
								<Button
									variant="secondary"
									size="sm"
									icon={quickTimerView.control.countdown.status === 'running' ? 'pause' : 'play'}
									disabled={writesBlocked}
									onClick={() =>
										operateTimer(
											quickTimerView.control!.countdown.status === 'running'
												? 'session.quick-timer.pause'
												: 'session.quick-timer.resume',
										)
									}
								>
									{t(
										quickTimerView.control.countdown.status === 'running'
											? 'session.quick.timerPause'
											: 'session.quick.timerResume',
									)}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									icon="retry"
									disabled={writesBlocked}
									onClick={() => operateTimer('session.quick-timer.reset')}
								>
									{t('session.quick.timerReset')}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									data-testid="quick-timer-lap"
									disabled={writesBlocked || quickTimerView.control.countdown.status !== 'running'}
									onClick={() => operateTimer('session.quick-timer.lap')}
								>
									{t('session.quick.timerLap')}
								</Button>
							</div>
							{quickTimerView.control.timer.laps.length > 0 && (
								<div
									data-testid="quick-timer-laps"
									style={{ font: `11.5px ${T.sans}`, color: T.ter }}
								>
									{t('session.quick.timerLapCount', {
										count: quickTimerView.control.timer.laps.length,
									})}
								</div>
							)}
						</>
					) : quickTimerView.breakCard ? (
						<div
							data-testid="quick-timer-break-card"
							style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
						>
							<div style={{ font: `600 16px ${T.mono}`, color: T.ink }}>
								{t('session.quick.timerBackIn', { display: quickTimerView.breakCard.display })}
							</div>
							{quickTimerView.breakCard.label && (
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									{quickTimerView.breakCard.label}
								</div>
							)}
						</div>
					) : (
						<form
							style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
							onSubmit={(e) => {
								e.preventDefault();
								startTimer();
							}}
						>
							<SegmentedControl
								size="sm"
								ariaLabel={t('session.quick.timerModeLabel')}
								value={timerMode}
								onChange={(v: 'countdown' | 'break') => setTimerMode(v)}
								options={[
									{ value: 'countdown', label: t('session.quick.timerModeCountdown') },
									{ value: 'break', label: t('session.quick.timerModeBreak') },
								]}
							/>
							<div style={{ display: 'flex', gap: 6 }}>
								<Input
									type="number"
									min={1}
									value={timerMinutes}
									onChange={(e: { target: { value: string } }) => setTimerMinutes(e.target.value)}
									aria-label={t('session.quick.timerMinutes')}
									style={{ width: 64 }}
								/>
								<Input
									value={timerLabel}
									onChange={(e: { target: { value: string } }) => setTimerLabel(e.target.value)}
									placeholder={t('session.quick.timerLabelPlaceholder')}
									aria-label={t('session.quick.timerLabelPlaceholder')}
									style={{ flex: 1, minWidth: 0 }}
								/>
							</div>
							<Button
								type="submit"
								variant="secondary"
								size="sm"
								data-testid="quick-timer-start"
								disabled={!Number(timerMinutes)}
							>
								{t('session.quick.timerStart')}
							</Button>
						</form>
					)}
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
				{/* RC-SES-2.4 — the roll that just landed, with its drama, so a roll from the quick panel is
				    seen on every route rather than only recorded. Keyed by roll: each new one replays. */}
				{lastRoll && (
					<DiceResult
						key={lastRoll.id}
						data-testid="quick-last-roll"
						{...diceResultProps(activePackage, lastRoll)}
						drama={lastRoll.id === settledRollId ? 'static' : 'play'}
						style={{ flexWrap: 'wrap', padding: 'var(--space-2) var(--space-3)' }}
					/>
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
