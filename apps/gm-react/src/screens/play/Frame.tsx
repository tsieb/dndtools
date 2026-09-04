import { useMemo, useState, type ReactNode } from 'react';
import { getDiceHistoryForActor, type DiceRollView } from '@dndtools/core';
import { Avatar, Icon } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useSession } from '../../net/SessionContext';
import { buildPlayerData } from '../../net/viewModels';
import { JoinSessionButton } from '../../net/SessionPanel';
import { useViewport } from '../../app/useViewport';
import {
	ElevatedLocked,
	minTierLabel,
	NAV,
	NAV_ELEVATED,
	PLAYER_ACTOR_ID,
	TIER_META,
	TOAST_TONE,
	useToasts,
	type LiveData,
} from './shared';
import { SceneBanner, StageSection } from './Home';
import { SheetSection } from './Sheet';
import { critOf, DiceSection } from './Dice';
import { PartySection } from './Presence';
import { HandoutsSection } from './Handouts';
import { JournalSection } from './Journal';
import { AssistSection, AtlasSection, BestiarySection } from './Elevated';

/**
 * PlayerView — the STANDALONE, chrome-less player companion app (route `/play`, OUTSIDE the DM
 * AppShell), ported from the design package's `player-view-app.jsx`. It renders its own frame (sidebar
 * + permission banner + section body + toasts) and reads the LIVE table through the actor-filtered
 * Processing Core, as a PLAYER actor — never the DM.
 *
 * Because this is the player's device, every read is made with a player actor id (`PLAYER_ACTOR_ID`),
 * so the Core delivers ONLY player-safe content: the projected scene, the visible party (PCs; DM-only
 * NPCs are absent), shared handouts, and the player's own sheet.
 *
 * Wired reads: {@link resolveCommandCenterHome} (the participant home: assigned scene + session status
 * strip), {@link getCombatTrackerForActor} (the viewer-masked turn order), {@link getPartyOverviewForActor},
 * {@link getCharacterForActor} + {@link resourcesOf} + {@link advancementStateOf},
 * {@link getCharacterJournalForActor}, {@link getContentItemsForActor} (shared handouts), and
 * {@link getDiceHistoryForActor} (the actor-filtered SHARED roll log). Null-safe: when nothing is
 * projected it shows the "waiting for the table" empty state.
 *
 * REAL write: the Dice tab dispatches `dice.roll` AS the player actor — each roll is recorded in the
 * durable session dice history (the same log the DM's /session dice panel reads), attributed to this
 * player, and session-gated by the Core (no live session ⇒ the rejection surfaces as a toast).
 *
 * REAL presence (when joined): the raise-hand / ready affordances send an ephemeral `presence-beat`
 * over the live transport (a SIDE-CHANNEL — never the command-request path). The host stamps the
 * authenticated identity, applies `session.set-presence` into the core presence model, and echoes the
 * roster back in its `presence` broadcast — the local optimistic state reconciles from that echo. On a
 * solo/preview device the toggles stay honestly device-local and the copy says so.
 * The Co-DM tier is a REAL core role (`co-dm`): a co-DM seat unlocks the elevated nav (Maps, Bestiary,
 * Combat assist), fed by the `elevated` payload on the actor-filtered snapshot. A player/observer seat
 * still shows those entries locked (they carry no elevated payload). The Trusted tier remains aspirational.
 */

export function PlayerView() {
	const runtime = useRuntime();
	const viewport = useViewport();
	const session = useSession();
	const { toasts, toast } = useToasts();
	const [section, setSection] = useState('stage');

	// Two data sources, one shape (PlayerData):
	//  - JOINED over P2P → the host's replicated, player-safe snapshot (never the local vault),
	//  - otherwise (solo / DM previewing this route on their own device) → computed locally from the
	//    actor-filtered Core, exactly as before.
	const joined = session.role === 'joined' && session.client?.data != null;
	const remoteData = session.client?.data ?? null;
	const viewer = joined ? (session.client?.identity?.actorId ?? PLAYER_ACTOR_ID) : PLAYER_ACTOR_ID;

	const state = runtime.state;
	const localData = useMemo<LiveData>(() => buildPlayerData(state, viewer), [state, viewer]);
	const data: LiveData = joined && remoteData ? remoteData : localData;

	const role = data.role;
	// Tier index: observer 0, player 1, co-DM 3 (the elevated seat — unlocks NAV_ELEVATED). The
	// `co-dm` core role maps to the `codm` tier metadata key.
	const r = role === 'observer' ? 0 : role === 'co-dm' ? 3 : 1;
	const meta = TIER_META[role === 'co-dm' ? 'codm' : role];

	// Dice write. JOINED → send a command REQUEST to the host (which stamps our authenticated identity,
	// dispatches, and replicates the updated log back in the next snapshot); a rejection surfaces as a
	// toast. SOLO/preview → the original local dispatch, which also returns the recorded roll for crit
	// detection. Either way the roll lands in the shared, durable session log at the table.
	const rollDice = async (expression: string, label: string): Promise<DiceRollView | null> => {
		if (joined) {
			const ack = await session.requestCommand({
				type: 'dice.roll',
				payload: { expression, label },
			});
			if (!ack.ok) toast(ack.message ?? 'The table declined the roll.', 'error', 'hidden');
			return null; // the recorded roll arrives via the next replicated snapshot
		}
		const result = await runtime.dispatch({
			type: 'dice.roll',
			actorId: viewer,
			payload: { expression, label },
		});
		if (result.status === 'rejected') {
			toast(result.rejection.message, 'error', 'hidden');
			return null;
		}
		const after = getDiceHistoryForActor(runtime.state.session, runtime.state.permissions, viewer);
		const recorded = after.rolls.length > 0 ? after.rolls[after.rolls.length - 1] : null;
		const crit = recorded ? critOf(recorded) : undefined;
		if (crit === 'success') toast('Natural 20 — critical hit', 'success', 'sparkle');
		else if (crit === 'fail') toast('Natural 1 — critical miss', 'warning', 'close');
		return recorded;
	};
	// Resolve a roller's display name. Joined devices have no full roster, so map self → "You" and fall
	// back to the presence roster / the roll's own attribution; solo reads the local actor roster.
	const actorName = (id: string): string => {
		if (id === viewer) return 'You';
		if (joined) {
			const entry = session.client?.presence.find((p) => p.actorId === id);
			return entry?.displayName ?? 'Player';
		}
		return runtime.state.permissions.actors[id]?.displayName ?? 'Player';
	};

	// Presence wiring. Shared only over a LIVE joined transport; the beat is a dedicated side-channel
	// message (never a command request). The host's `presence` broadcast echoes our own entry back —
	// that echo is the table-visible truth StageSection reconciles its optimistic state from.
	const presenceShared = joined && session.client?.status === 'live';
	const selfPresence = presenceShared
		? (session.client?.presence.find((p) => p.actorId === viewer) ?? null)
		: null;
	const sendPresence = (hand: boolean, ready: boolean) => {
		if (!presenceShared) return;
		session.sendPresenceBeat({ status: 'online', hand, ready });
	};

	const allItems = [...NAV, ...NAV_ELEVATED];
	const allowedIds = allItems.filter((n) => r >= n.min).map((n) => n.id);
	const current = allowedIds.includes(section) ? section : 'stage';

	const navRow = (n: { id: string; label: string; icon: string; min: number }, locked: boolean) => (
		<button
			className={`player-view-nav-row${n.min >= 3 ? ' player-view-nav-elevated' : ''}`}
			key={n.id}
			type="button"
			aria-label={locked ? `${n.label} — requires the ${minTierLabel(n.min)} seat` : n.label}
			// The active section was signalled by border/background/weight only, so AT and
			// high-contrast users had no way to tell which of the nine sections they were in.
			aria-current={!locked && current === n.id ? 'page' : undefined}
			title={locked ? `${n.label} requires ${minTierLabel(n.min)}` : n.label}
			// `disabled` made the lock-reason toast below unreachable dead code AND removed the row
			// from the tab order, so the aria-label explaining the seat requirement could never be
			// read. aria-disabled keeps it focusable and lets the explanation fire.
			aria-disabled={locked || undefined}
			onClick={() => {
				if (locked) {
					// Honest lock reason: the Trusted/Co-DM tiers do not EXIST in the core roles yet, so
					// there is nothing the DM could grant — say so instead of implying a grantable permission.
					toast(
						n.min >= 2
							? `${n.label} needs the ${minTierLabel(n.min)} seat — ask your DM to promote you`
							: `${n.label} needs ${minTierLabel(n.min)} permission`,
						'info',
						'hidden',
					);
					return;
				}
				setSection(n.id);
			}}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 12,
				padding: '10px 12px',
				borderRadius: 9,
				cursor: locked ? 'not-allowed' : 'pointer',
				textAlign: 'left',
				width: '100%',
				border: 'none',
				borderLeft: `3px solid ${current === n.id && !locked ? T.acc : 'transparent'}`,
				background: current === n.id && !locked ? T.accSub : 'transparent',
				// A locked row is still focusable and still ACTS (it explains the lock), so the
				// "inactive component" contrast exemption does not apply — 0.42 dropped the label to
				// ~2.5:1. 0.7 clears 4.5:1; the lock is carried by the trailing hidden icon + label.
				opacity: locked ? 0.7 : 1,
			}}
		>
			<Icon name={n.icon} size={19} color={current === n.id && !locked ? T.acc : T.ter} />
			<span
				style={{
					flex: 1,
					font: `${current === n.id && !locked ? 600 : 500} 13.5px ${T.sans}`,
					color: current === n.id && !locked ? T.ink : T.sub,
				}}
			>
				{n.label}
			</span>
			{locked && <Icon name="hidden" size={14} color={T.ter} />}
		</button>
	);

	let body: ReactNode;
	if (current === 'stage')
		body = (
			<StageSection
				data={data}
				r={r}
				toast={toast}
				presenceShared={presenceShared}
				selfPresence={selfPresence}
				onPresence={sendPresence}
			/>
		);
	else if (current === 'sheet') body = <SheetSection data={data} />;
	else if (current === 'dice')
		body = (
			<DiceSection
				rolls={data.diceRolls}
				sessionActive={data.sessionActive}
				viewer={viewer}
				actorName={actorName}
				onRoll={rollDice}
			/>
		);
	else if (current === 'party') body = <PartySection data={data} />;
	else if (current === 'handouts') body = <HandoutsSection data={data} />;
	else if (current === 'journal') body = <JournalSection data={data} />;
	// ELEVATED (Co-DM tier) — real DM-grade panels, fed by `data.elevated` (present only for a co-DM).
	else if (current === 'atlas') body = <AtlasSection data={data} />;
	else if (current === 'bestiary') body = <BestiarySection data={data} />;
	else if (current === 'assist') body = <AssistSection data={data} />;
	else
		body = <ElevatedLocked label={NAV_ELEVATED.find((n) => n.id === current)?.label ?? 'Tool'} />;

	return (
		<div
			className="player-view-shell"
			style={{
				width: '100%',
				minWidth: 0,
				minHeight: '100%',
				display: 'flex',
				background:
					'radial-gradient(140% 100% at 50% -10%, color-mix(in srgb, var(--color-accent) 6%, var(--color-bg)) 0%, var(--color-bg) 60%)',
				color: T.ink,
				font: `14px ${T.sans}`,
			}}
		>
			<a
				href="#player-main"
				data-skip-link="true"
				// HashRouter: the hash IS the route, so following this href would rewrite `#/play`.
				// Move focus ourselves, exactly as AppShell's skip link does.
				onClick={(e) => {
					e.preventDefault();
					document.getElementById('player-main')?.focus();
				}}
				style={{
					position: 'fixed',
					left: 8,
					top: -48,
					zIndex: 100,
					padding: '8px 14px',
					borderRadius: 8,
					background: 'var(--color-accent)',
					color: 'var(--color-accent-foreground)',
					font: `600 13px ${T.sans}`,
					textDecoration: 'none',
					transition: 'top var(--duration-fast) var(--easing-standard)',
				}}
				onFocus={(e) => (e.currentTarget.style.top = '8px')}
				onBlur={(e) => (e.currentTarget.style.top = '-48px')}
			>
				Skip to content
			</a>
			{/* sidebar */}
			<aside
				className="player-view-sidebar"
				style={{
					width: 248,
					flex: '0 0 auto',
					display: 'flex',
					flexDirection: 'column',
					borderRight: `1px solid ${T.bd}`,
					background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)',
					backdropFilter: 'blur(4px)',
					position: 'sticky',
					top: 'var(--native-titlebar-height)',
					height: 'var(--app-viewport-height)',
				}}
			>
				<div
					className="player-view-brand"
					style={{ padding: '18px 18px 14px', borderBottom: `1px solid ${T.bd}` }}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
						<div
							style={{
								width: 34,
								height: 34,
								borderRadius: 9,
								background: T.acc,
								color: T.accFg,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								font: `700 16px ${T.disp}`,
							}}
						>
							P
						</div>
						<div className="player-view-brand-copy" style={{ minWidth: 0 }}>
							<div style={{ font: `700 14px ${T.disp}`, color: T.ink, lineHeight: 1.1 }}>
								Player view
							</div>
							<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
								{data.live ? 'Session live' : 'Standby'}
							</div>
						</div>
					</div>
				</div>
				<nav
					className="player-view-nav"
					aria-label="Player sections"
					style={{
						flex: 1,
						overflow: 'auto',
						padding: '12px 10px',
						display: 'flex',
						flexDirection: 'column',
						gap: 2,
					}}
				>
					{NAV.map((n) => navRow(n, r < n.min))}
					<div
						className="player-view-elevated-label"
						style={{
							...eb,
							padding: '14px 12px 6px',
							display: 'flex',
							alignItems: 'center',
							gap: 7,
						}}
					>
						<span>Elevated</span>
						<span style={{ flex: 1, height: 1, background: T.bd }} />
						{r < 3 && <Icon name="hidden" size={13} color={T.ter} />}
					</div>
					{NAV_ELEVATED.map((n) => navRow(n, r < n.min))}
				</nav>
				<div className="player-view-footer" style={{ padding: 14, borderTop: `1px solid ${T.bd}` }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							padding: 11,
							borderRadius: 11,
							background: T.alt,
							border: `1px solid ${T.bd}`,
						}}
					>
						<Avatar name={data.displayName} size="sm" ring="none" />
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									font: `600 12.5px ${T.sans}`,
									color: T.ink,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								}}
							>
								{data.displayName}
							</div>
							<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{meta.role}</div>
						</div>
					</div>
				</div>
			</aside>

			{/* main column */}
			<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
				<div
					className="player-view-toolbar"
					style={{
						display: 'flex',
						alignItems: 'center',
						flexWrap: 'wrap',
						gap: 14,
						padding: viewport === 'phone' ? '10px 14px' : '12px 28px',
						borderBottom: `1px solid ${T.bd}`,
						background: 'color-mix(in srgb, var(--color-surface) 55%, transparent)',
					}}
				>
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 8,
							padding: '6px 12px',
							borderRadius: 20,
							background: T.accSub,
							border: `1px solid ${T.accBd}`,
						}}
					>
						<Icon name={meta.icon} size={15} color={T.acc} />
						<span style={{ font: `600 12.5px ${T.sans}`, color: T.acc }}>{meta.label}</span>
					</span>
					<span style={{ font: `12.5px ${T.sans}`, color: T.sub, flex: 1, minWidth: 0 }}>
						{meta.blurb}
					</span>
					<JoinSessionButton />
					<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: '50%',
								background: data.live ? 'var(--color-status-success-text)' : T.ter,
							}}
						/>
						<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{joined
								? 'Connected to table'
								: data.live
									? 'Session live — this device'
									: 'Not connected'}
						</span>
					</span>
				</div>
				<SceneBanner card={data.activeSceneCard} />
				<main id="player-main" tabIndex={-1} style={{ flex: 1, minWidth: 0 }}>
					{body}
				</main>
			</div>

			{/* A role="status" node that mounts WITH its text is usually never announced, so the polite
			    toasts (raise-hand confirmation, nat-20, lock reasons) were silent. This region is always
			    mounted and only its TEXT changes, which is what screen readers actually pick up. */}
			<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
				{[...toasts].reverse().find((t) => t.status !== 'error')?.msg ?? ''}
			</div>

			{/* toasts */}
			<div
				className="player-view-toast-viewport"
				style={{
					position: 'fixed',
					right: 22,
					bottom: 22,
					display: 'flex',
					flexDirection: 'column',
					gap: 9,
					zIndex: 60,
				}}
			>
				{toasts.map((t) => {
					const tone = TOAST_TONE[t.status] || TOAST_TONE.neutral;
					return (
						<div
							key={t.id}
							// Errors keep role="alert" (announced on insertion regardless); the polite ones are
							// announced by the persistent region below, so they must not also claim one here.
							role={t.status === 'error' ? 'alert' : undefined}
							aria-live={t.status === 'error' ? 'assertive' : undefined}
							aria-atomic={t.status === 'error' ? 'true' : undefined}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								padding: '11px 14px',
								borderRadius: 10,
								background: tone.bg,
								border: `1px solid ${tone.bd}`,
								boxShadow: T.smd,
								minWidth: 220,
								maxWidth: 320,
							}}
						>
							{t.icon && <Icon name={t.icon} size={16} color={tone.fg} />}
							<span style={{ font: `12.5px ${T.sans}`, color: tone.fg }}>{t.msg}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
