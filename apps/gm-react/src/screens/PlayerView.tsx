import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import {
	getDiceHistoryForActor,
	availableSlots,
	type DiceRollView,
	type EvaluatedDiceTerm,
	type SceneCardView,
} from '@dndtools/core';
import {
	Avatar,
	Badge,
	Chip,
	ConditionBadge,
	CONDITIONS,
	DiceResult,
	HPBar,
	Icon,
	IconButton,
	Stat,
	VisibilityChip,
} from '../ds';
import { T, eb } from '../app/screen-kit';
import { moodTheme } from '../app/sceneCardMood';
import { useAssetObjectUrl } from '../platform/assetUrl';
import { useRuntime } from '../runtime/RuntimeContext';
import { useSession } from '../net/SessionContext';
import { buildPlayerData, type PlayerData } from '../net/viewModels';
import { JoinSessionButton } from '../net/SessionPanel';
import { useViewport } from '../app/useViewport';
import { isNetworkDestinationAllowed, usePlatformCapabilities } from '../platform/capabilities';

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

// The player's device identity. The runtime seeds `actor-player` (Demo Player) as a participant; the
// DM-side ViewAs/Projection controls project the live table to exactly this actor.
const PLAYER_ACTOR_ID = 'actor-player';

const TIERS = ['observer', 'player', 'trusted', 'codm'] as const;
const TIER_META: Record<
	string,
	{ label: string; role: string; badge: any; icon: string; blurb: string }
> = {
	observer: {
		label: 'Observer',
		role: 'Read-only seat',
		badge: 'neutral',
		icon: 'reveal',
		blurb: 'You can watch what the table sees and read shared handouts.',
	},
	player: {
		label: 'Player',
		role: 'Your own character',
		badge: 'success',
		icon: 'characters-person',
		blurb: 'Run your sheet, roll your dice, and read what the DM shares with the table.',
	},
	trusted: {
		label: 'Trusted player',
		role: 'Shared editing granted',
		badge: 'info',
		icon: 'flag',
		blurb: 'A player, plus shared-stash editing and recap posting.',
	},
	codm: {
		label: 'Co-DM',
		role: 'Elevated table tools',
		badge: 'accent',
		icon: 'session-bolt',
		blurb: 'Granted GM tools — the revealed Atlas, the bestiary, and live combat assist.',
	},
};

const NAV = [
	{ id: 'stage', label: 'Now playing', icon: 'home', min: 0 },
	{ id: 'sheet', label: 'My character', icon: 'characters-person', min: 1 },
	{ id: 'dice', label: 'Dice', icon: 'dice', min: 1 },
	{ id: 'party', label: 'Party', icon: 'players', min: 0 },
	{ id: 'handouts', label: 'Handouts', icon: 'knowledge-book', min: 0 },
	{ id: 'journal', label: 'Journal', icon: 'note-edit', min: 1 },
];
const NAV_ELEVATED = [
	{ id: 'atlas', label: 'Maps', icon: 'atlas-map', min: 3 },
	{ id: 'bestiary', label: 'Bestiary', icon: 'campaign-scroll', min: 3 },
	{ id: 'assist', label: 'Combat assist', icon: 'session-bolt', min: 3 },
];
const minTierLabel = (min: number) => TIER_META[TIERS[min]].label;

const ABIL_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABIL_FULL: Record<string, string> = {
	str: 'Strength',
	dex: 'Dexterity',
	con: 'Constitution',
	int: 'Intelligence',
	wis: 'Wisdom',
	cha: 'Charisma',
};
const sgn = (n: number) => (n >= 0 ? '+' : '') + n;
const abilMod = (score: number | undefined) => Math.floor(((score ?? 10) - 10) / 2);
const COND_ALIAS: Record<string, string> = {
	concentrating: 'concentration',
	prone: 'prone',
	poisoned: 'poisoned',
	stunned: 'stunned',
	frightened: 'frightened',
	restrained: 'restrained',
	grappled: 'grappled',
	invisible: 'invisible',
	paralyzed: 'paralyzed',
	unconscious: 'unconscious',
	charmed: 'charmed',
	blinded: 'blinded',
	deafened: 'deafened',
	petrified: 'petrified',
	incapacitated: 'incapacitated',
	exhaustion: 'exhaustion',
};
function condKey(s: string): string | null {
	const C = (CONDITIONS as any) || {};
	const k = String(s).toLowerCase();
	return COND_ALIAS[k] || (C[k] ? k : null);
}

// --- local toasts (the standalone player app has no global toaster) -------------------------------
interface ToastItem {
	id: string;
	msg: string;
	status: string;
	icon?: string;
}
function useToasts() {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	// Every toast armed a setTimeout that was never cleared, so unmounting the player app (or leaving
	// /play) left them running and each one called setState on a dead component. Track them and clear
	// on unmount.
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	useEffect(
		() => () => {
			for (const timer of timers.current) clearTimeout(timer);
			timers.current = [];
		},
		[],
	);
	const toast = (msg: string, status = 'neutral', icon?: string) => {
		const id = Math.random().toString(36).slice(2);
		setToasts((t) => [...t, { id, msg, status, icon }]);
		timers.current.push(setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800));
	};
	return { toasts, toast };
}
const TOAST_TONE: Record<string, { bd: string; bg: string; fg: string }> = {
	success: {
		bd: 'var(--color-status-success-border)',
		bg: 'var(--color-status-success-subtle)',
		fg: 'var(--color-status-success-text)',
	},
	error: {
		bd: 'var(--color-status-error-border)',
		bg: 'var(--color-status-error-subtle)',
		fg: 'var(--color-status-error-text)',
	},
	info: {
		bd: 'var(--color-status-info-border)',
		bg: 'var(--color-status-info-subtle)',
		fg: 'var(--color-status-info-text)',
	},
	neutral: { bd: T.bdS, bg: T.surf, fg: T.ink },
};

// --- shared layout primitives (ported from player-view-app.jsx) -----------------------------------
function Panel({
	title,
	action,
	pad = 16,
	accent,
	children,
}: {
	title?: ReactNode;
	action?: ReactNode;
	pad?: number;
	accent?: boolean;
	children?: ReactNode;
}) {
	return (
		<div
			style={{
				minWidth: 0,
				background: T.surf,
				border: `1px solid ${accent ? T.accBd : T.bd}`,
				borderRadius: 8,
				boxShadow: accent ? T.smd : T.ssm,
			}}
		>
			{title != null && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						flexWrap: 'wrap',
						gap: 10,
						padding: '10px 14px',
						borderBottom: `1px solid ${T.bd}`,
					}}
				>
					<span style={{ font: `600 13px ${T.sans}`, flex: 1, color: T.ink }}>{title}</span>
					{action}
				</div>
			)}
			<div style={{ padding: pad }}>{children}</div>
		</div>
	);
}
function PvPage({ children, max = 1140 }: { children?: ReactNode; max?: number }) {
	const viewport = useViewport();
	return (
		<div
			style={{
				width: '100%',
				minWidth: 0,
				maxWidth: max,
				margin: '0 auto',
				padding: viewport === 'phone' ? '18px 14px 76px' : '26px 28px 60px',
			}}
		>
			{children}
		</div>
	);
}
function SectionHead({
	title,
	sub,
	action,
}: {
	title: string;
	sub?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'flex-end',
				gap: 14,
				marginBottom: 20,
				flexWrap: 'wrap',
			}}
		>
			<div style={{ flex: 1, minWidth: 0 }}>
				<h1 style={{ margin: 0, font: `600 26px ${T.disp}`, color: T.ink }}>{title}</h1>
				{sub && <div style={{ marginTop: 4, font: `13px ${T.sans}`, color: T.ter }}>{sub}</div>}
			</div>
			{action}
		</div>
	);
}
function LockedNote({ what }: { what: string }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				padding: '11px 14px',
				borderRadius: 10,
				background: 'var(--color-dm-only-subtle)',
				border: `1px solid var(--color-dm-only-badge)`,
			}}
		>
			<Icon name="hidden" size={16} color="var(--color-dm-only-badge)" />
			<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
				{what} is a <strong style={{ color: T.ink }}>Co-DM</strong> tool. Your seat is not a Co-DM
				seat — ask your DM to promote you to Co-DM (a plan with Co-DM seats is required) to unlock
				it.
			</span>
		</div>
	);
}

// The player view-model is now the shared `PlayerData` shape (see net/viewModels.ts): identical fields,
// computed once by `buildPlayerData` so the LOCAL (DM preview / offline) path and the REMOTE (joined,
// replicated over P2P) path can never diverge.
type LiveData = PlayerData;

/**
 * I11 S11.2.4 — the dismissible SCENE PUSH banner. When the DM activates a player-visible scene card the
 * actor-filtered view-model carries it here, and this hero+flavor banner appears over the player's screen.
 * It auto-dismisses after 5s (and is manually dismissible immediately); a NEW push (different card or
 * revision) re-shows. `aria-live="polite"` announces it without stealing focus.
 */
function SceneBanner({ card }: { card: SceneCardView | null }) {
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
					{theme.label} · Now on scene
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
				label="Dismiss scene banner"
				variant="ghost"
				size="sm"
				onClick={() => setDismissedKey(key)}
				style={{ flex: '0 0 auto', margin: 8, color: theme.ink }}
			/>
		</div>
	);
}

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
		else if (crit === 'fail') toast('Natural 1 — critical miss', 'error', 'close');
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

// 1 · NOW PLAYING — the live stage the DM is projecting + the player's presence row.
function StageSection({
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
				title="Now playing"
				sub={
					live
						? sceneName
							? `${sceneName} · projected from the table`
							: 'The session is live'
						: 'Waiting for your DM to start the session'
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
							{live ? 'Session live' : 'Standby'}
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
								What the table sees
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
										Map: {projected.name}
									</div>
								)}
								<div
									style={{ marginTop: 3, font: `13px ${T.sans}`, color: 'rgba(243,231,210,.7)' }}
								>
									Projected to your view by the DM
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
								<span style={{ font: `14px ${T.sans}` }}>Nothing is being shown yet.</span>
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
								Watching the table
							</span>
						)}
						<div style={{ flex: 1 }} />
						<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
							Your DM controls what's revealed.
						</span>
					</div>
				</div>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel
						title="This turn"
						accent
						action={
							data.round != null ? <Badge status="neutral">Round {data.round}</Badge> : undefined
						}
					>
						{data.turnOrder.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
								{data.activeName ? `Active: ${data.activeName}` : 'No combat running.'}
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
					<Panel title="Shared handouts">
						{data.handouts.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
								Nothing shared with you yet.
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

// 2 · MY CHARACTER — the player's own sheet, read-only on the live device.
function SheetSection({ data }: { data: LiveData }) {
	const viewport = useViewport();
	const C = data.pc;
	if (!C) {
		return (
			<PvPage max={1140}>
				<SectionHead title="My character" />
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						No character has been assigned to you yet.
					</div>
				</Panel>
			</PvPage>
		);
	}
	const r = data.resources;
	const slots = r ? Object.values(r.spellSlots).sort((a, b) => a.level - b.level) : [];
	// Real sheet identity: the `data.class` field the draft flow writes + the CHAR-009 level.
	const cls = typeof C.data?.class === 'string' && C.data.class.trim() !== '' ? C.data.class : null;
	const clsLabel = cls ? cls.charAt(0).toUpperCase() + cls.slice(1) : 'Adventurer';
	const cardBox: CSSProperties = {
		textAlign: 'center',
		padding: '10px 6px',
		borderRadius: 11,
		border: `1px solid ${T.bd}`,
		background: T.surf,
	};
	return (
		<div>
			<div
				style={{
					position: 'sticky',
					top: 'var(--native-titlebar-height)',
					zIndex: 5,
					display: 'flex',
					alignItems: 'center',
					gap: 16,
					padding: viewport === 'phone' ? '12px 14px' : '12px 28px',
					background: 'color-mix(in srgb, var(--color-surface) 94%, transparent)',
					backdropFilter: 'blur(6px)',
					borderBottom: `1px solid ${T.bd}`,
					flexWrap: 'wrap',
				}}
			>
				<Avatar name={C.name} size="md" ring="active" />
				<div style={{ minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						{/* Every other section renders SectionHead's <h1>; the sheet jumped straight to this
						    strip, so the ONE section a player lives in had no heading at all. */}
						<h1 style={{ margin: 0, font: `700 16px ${T.disp}`, color: T.ink }}>{C.name}</h1>
						<Badge status="success">PC</Badge>
					</div>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						{clsLabel}
						{data.level != null ? ` · Level ${data.level}` : ''}
					</div>
				</div>
				<div
					style={{
						textAlign: 'center',
						minWidth: 70,
						padding: '6px 12px',
						borderRadius: 11,
						background: T.alt,
						border: `1px solid ${T.bd}`,
					}}
				>
					<div
						style={{
							font: `700 18px ${T.mono}`,
							color: C.combat.maxHp > 0 && C.combat.hp / C.combat.maxHp < 0.3 ? T.err : T.ink,
							lineHeight: 1,
						}}
					>
						{C.combat.hp}
						<span style={{ font: `13px ${T.mono}`, color: T.ter }}> / {C.combat.maxHp}</span>
					</div>
					<div style={{ ...eb, color: T.ter }}>Hit points</div>
				</div>
				<Stat label="AC" value={String(C.combat.ac)} icon="shield" />
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					{C.combat.conditions.map((c) => {
						const k = condKey(c);
						return k ? (
							<ConditionBadge key={c} condition={k} compact />
						) : (
							<Chip key={c} tone="accent">
								{c}
							</Chip>
						);
					})}
				</div>
			</div>
			<PvPage max={1140}>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: viewport === 'phone' ? 'minmax(0,1fr)' : 'auto minmax(0,1fr)',
						gap: 18,
						alignItems: 'start',
					}}
				>
					<div
						style={{
							display: viewport === 'phone' ? 'grid' : 'flex',
							gridTemplateColumns: viewport === 'phone' ? 'repeat(3,1fr)' : undefined,
							flexDirection: 'column',
							gap: 10,
							width: viewport === 'phone' ? 'auto' : 116,
						}}
					>
						{ABIL_ORDER.map((key) => {
							const score = (C.abilityScores as Record<string, number | undefined>)[key];
							return (
								<div key={key} style={cardBox}>
									<div style={{ ...eb, color: T.ter }}>{ABIL_FULL[key]}</div>
									<div style={{ font: `700 24px ${T.mono}`, lineHeight: 1, color: T.ink }}>
										{sgn(abilMod(score))}
									</div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 2 }}>
										{score ?? '—'}
									</div>
								</div>
							);
						})}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
						<Panel title="Spell slots">
							{slots.length === 0 ? (
								<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
									No spell slots tracked.
								</div>
							) : (
								<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
									{slots.map((s) => {
										const avail = availableSlots(s);
										return (
											<div key={s.level} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
												<span style={{ font: `600 12px ${T.sans}`, color: T.sub, width: 48 }}>
													Level {s.level}
												</span>
												<div style={{ display: 'flex', gap: 7, flex: 1 }}>
													{Array.from({ length: s.max }).map((_, i) => (
														<span
															key={i}
															style={{
																width: 18,
																height: 18,
																transform: 'rotate(45deg)',
																borderRadius: 3,
																background: i < avail ? T.acc : 'transparent',
																border: `1.5px solid ${i < avail ? T.acc : T.bdS}`,
															}}
														/>
													))}
												</div>
												<span style={{ font: `12px ${T.mono}`, color: T.ter }}>
													{avail}/{s.max}
												</span>
											</div>
										);
									})}
								</div>
							)}
						</Panel>
						<Panel title="Conditions & status">
							<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
								This is your live sheet as the table sees it. Edits are made in your full character
								app.
							</div>
						</Panel>
					</div>
				</div>
			</PvPage>
		</div>
	);
}

// 3 · DICE — the REAL table roller: every roll dispatches `dice.roll` AS the player actor and is
// recorded in the shared, durable session log (the same history the DM's /session panel reads). The
// log below is the actor-filtered `getDiceHistoryForActor` view — the player's own rolls plus every
// session-visible roll at the table. Rolling is session-gated by the Core: on standby the dice
// disable with the honest reason instead of pretending to roll.
const DICE = [20, 12, 10, 8, 6, 4];

/** Natural 20/1 detection on a RECORDED roll: exactly one d20 term keeping a single die. */
function critOf(roll: DiceRollView): 'success' | 'fail' | undefined {
	const diceTerms = roll.terms.filter((t): t is EvaluatedDiceTerm => t.kind === 'dice');
	if (diceTerms.length !== 1) return undefined;
	const term = diceTerms[0];
	if (term.sides !== 20 || term.kept.length !== 1) return undefined;
	return term.kept[0] === 20 ? 'success' : term.kept[0] === 1 ? 'fail' : undefined;
}

function DiceSection({
	rolls,
	sessionActive,
	viewer,
	actorName,
	onRoll,
}: {
	rolls: DiceRollView[];
	sessionActive: boolean;
	viewer: string;
	actorName: (id: string) => string;
	onRoll: (expression: string, label: string) => Promise<DiceRollView | null>;
}) {
	const viewport = useViewport();
	const [mode, setMode] = useState<'normal' | 'adv' | 'dis'>('normal');
	const [mod, setMod] = useState(0);
	// Compose the core dice expression: advantage/disadvantage use the parser's keep syntax
	// (`2d20kh1` / `2d20kl1`) so the RECORDED roll carries both faces and the kept one.
	const rollOne = (faces: number) => {
		const term =
			faces === 20 && mode === 'adv'
				? '2d20kh1'
				: faces === 20 && mode === 'dis'
					? '2d20kl1'
					: `1d${faces}`;
		const expression = `${term}${mod !== 0 ? (mod > 0 ? `+${mod}` : String(mod)) : ''}`;
		const label = `d${faces}${faces === 20 && mode !== 'normal' ? ` · ${mode === 'adv' ? 'advantage' : 'disadvantage'}` : ''}`;
		void onRoll(expression, label);
	};
	// Newest first for display; the query returns the durable log oldest-first.
	const recent = [...rolls].reverse().slice(0, 16);
	const seg = (id: 'normal' | 'adv' | 'dis', label: string) => (
		<button
			type="button"
			aria-pressed={mode === id}
			onClick={() => setMode(id)}
			style={{
				flex: 1,
				padding: '8px 0',
				cursor: 'pointer',
				font: `600 12px ${T.sans}`,
				border: 'none',
				background: mode === id ? T.acc : 'transparent',
				color: mode === id ? T.accFg : T.sub,
			}}
		>
			{label}
		</button>
	);
	return (
		<PvPage max={920}>
			<SectionHead
				title="Dice"
				sub="Rolls are recorded to the table's shared session log, attributed to you"
			/>
			{!sessionActive && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						padding: '10px 14px',
						borderRadius: 10,
						background: 'var(--color-status-warning-subtle)',
						border: `1px solid var(--color-status-warning-border)`,
						marginBottom: 16,
					}}
				>
					<Icon name="hidden" size={15} color="var(--color-status-warning-text)" />
					<span style={{ font: `12.5px ${T.sans}`, color: 'var(--color-status-warning-text)' }}>
						Rolling needs a live session — the dice unlock when your DM starts one.
					</span>
				</div>
			)}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						viewport === 'phone' ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)',
					gap: 18,
					alignItems: 'start',
				}}
			>
				<Panel title="Roll" pad={16}>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
						{DICE.map((f) => (
							<button
								key={f}
								type="button"
								disabled={!sessionActive}
								onClick={() => rollOne(f)}
								style={{
									padding: '16px 0',
									borderRadius: 11,
									cursor: sessionActive ? 'pointer' : 'not-allowed',
									border: `1px solid ${T.bd}`,
									background: T.alt,
									color: sessionActive ? T.ink : T.ter,
									opacity: sessionActive ? 1 : 0.55,
									font: `700 17px ${T.mono}`,
								}}
							>
								d{f}
							</button>
						))}
					</div>
					<div style={{ marginTop: 14 }}>
						<div style={{ ...eb, marginBottom: 6 }}>d20 mode</div>
						<div
							style={{
								display: 'flex',
								borderRadius: 9,
								overflow: 'hidden',
								border: `1px solid ${T.bd}`,
							}}
						>
							{seg('dis', 'Disadvantage')}
							{seg('normal', 'Normal')}
							{seg('adv', 'Advantage')}
						</div>
					</div>
					<div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
						<span style={eb}>Modifier</span>
						<IconButton
							icon="chevron-down"
							label="−1"
							variant="ghost"
							size="sm"
							onClick={() => setMod((m) => m - 1)}
						/>
						<span
							style={{
								font: `700 16px ${T.mono}`,
								color: T.acc,
								minWidth: 34,
								textAlign: 'center',
							}}
						>
							{sgn(mod)}
						</span>
						<IconButton
							icon="chevron-up"
							label="+1"
							variant="ghost"
							size="sm"
							onClick={() => setMod((m) => m + 1)}
						/>
					</div>
				</Panel>
				<Panel
					title="Table roll log"
					pad={14}
					action={<Badge status="neutral">{rolls.length} recorded</Badge>}
				>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 9,
							maxHeight: 460,
							overflow: 'auto',
						}}
					>
						{recent.length === 0 && (
							<div
								style={{
									font: `12.5px ${T.sans}`,
									color: T.ter,
									padding: '14px 0',
									textAlign: 'center',
								}}
							>
								{sessionActive
									? 'No rolls yet — pick a die.'
									: 'The shared roll log fills up during a live session.'}
							</div>
						)}
						{recent.map((d) => (
							<div key={d.id}>
								<div style={{ font: `10.5px ${T.sans}`, color: T.ter, marginBottom: 3 }}>
									{d.actorId === viewer ? 'You' : actorName(d.actorId)}
									{d.label ? ` · ${d.label}` : ''}
								</div>
								<DiceResult
									notation={d.expression}
									total={d.total}
									rolls={d.dice}
									modifier={d.modifier}
									crit={critOf(d)}
								/>
							</div>
						))}
					</div>
				</Panel>
			</div>
		</PvPage>
	);
}

// 4 · PARTY — the visible party (PCs), from the actor-filtered overview.
function PartySection({ data }: { data: LiveData }) {
	const members = data.party.members.filter((m) => m.kind === 'pc');
	return (
		<PvPage max={1140}>
			<SectionHead
				title="Party"
				sub="Live vitals as the DM shares them"
				action={<Badge status="neutral">{members.length} members</Badge>}
			/>
			<Panel title="Roster">
				{members.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						No party members are visible to you yet.
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
						{members.map((p) => {
							const downed = p.hp === 0;
							const self = p.characterId === data.pcId;
							return (
								<div
									key={p.characterId}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 13,
										padding: 12,
										borderRadius: 11,
										border: `1px solid ${downed ? 'var(--color-status-error-border)' : self ? T.accBd : T.bd}`,
										background: downed
											? 'var(--color-status-error-subtle)'
											: self
												? T.accSub
												: T.surf,
									}}
								>
									<Avatar
										name={p.name}
										size="sm"
										ring={downed ? 'danger' : self ? 'active' : 'none'}
									/>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
											<span style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>{p.name}</span>
											{self && <Badge status="accent">You</Badge>}
											<span style={{ font: `11px ${T.sans}`, color: T.ter }}>AC {p.ac}</span>
										</div>
										<div style={{ marginTop: 5, maxWidth: 240 }}>
											<HPBar current={p.hp} max={p.maxHp} size="sm" />
										</div>
									</div>
									<div
										style={{
											display: 'flex',
											flexDirection: 'column',
											gap: 5,
											alignItems: 'flex-end',
										}}
									>
										{p.conditions.length ? (
											p.conditions.map((c) => {
												const k = condKey(c);
												return k ? (
													<ConditionBadge key={c} condition={k} compact />
												) : (
													<Chip key={c} tone="neutral">
														{c}
													</Chip>
												);
											})
										) : (
											<span style={{ font: `11px ${T.sans}`, color: T.ter }}>—</span>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</Panel>
		</PvPage>
	);
}

// 5 · HANDOUTS — everything the DM has shared with this player (visible notes). Read-only.
const HANDOUT_ICON: Record<string, string> = {
	note: 'knowledge-book',
	scene: 'atlas-map',
	recap: 'campaign-scroll',
};
function HandoutsSection({ data }: { data: LiveData }) {
	const shared = data.handouts;
	// undefined means "pick the first available item"; null is an explicit user collapse.
	// Keeping those states distinct lets live data reconcile a removed selection without making
	// the first row impossible to close.
	const [open, setOpen] = useState<string | null | undefined>(undefined);
	const openId =
		open === null ? null : shared.some((item) => item.id === open) ? open : (shared[0]?.id ?? null);
	return (
		<PvPage max={900}>
			<SectionHead
				title="Handouts"
				sub="Notes and props your DM has revealed to you"
				action={<Badge status="neutral">{shared.length} shared</Badge>}
			/>
			{shared.length === 0 ? (
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						Your DM hasn't shared any handouts with you yet.
					</div>
				</Panel>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{shared.map((n) => {
						const isOpen = openId === n.id;
						return (
							<div
								key={n.id}
								style={{
									border: `1px solid ${isOpen ? T.accBd : T.bd}`,
									borderRadius: 10,
									background: T.surf,
									boxShadow: isOpen ? T.ssm : 'none',
									overflow: 'hidden',
								}}
							>
								<button
									type="button"
									aria-expanded={isOpen}
									aria-controls={`handout-${n.id}-panel`}
									onClick={() => setOpen(isOpen ? null : n.id)}
									style={{
										width: '100%',
										display: 'flex',
										alignItems: 'center',
										gap: 12,
										padding: '13px 16px',
										cursor: 'pointer',
										border: 'none',
										background: 'transparent',
										textAlign: 'left',
									}}
								>
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
										<Icon name={HANDOUT_ICON[n.kind] || 'knowledge-book'} size={20} color={T.acc} />
									</div>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
											<span style={{ font: `600 14px ${T.sans}`, color: T.ink }}>{n.title}</span>
											<Badge status="info">{n.kind}</Badge>
										</div>
										<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>
											Updated {new Date(n.updatedAt).toLocaleDateString()}
										</div>
									</div>
									<Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.ter} />
								</button>
								{isOpen && (
									<div
										id={`handout-${n.id}-panel`}
										style={{ padding: '4px 16px 18px clamp(16px, 8vw, 68px)' }}
									>
										<div
											style={{
												minWidth: 0,
												padding: '12px 16px',
												borderRadius: 9,
												background: T.alt,
												borderLeft: `3px solid ${T.acc}`,
												font: `13.5px/1.6 ${T.sans}`,
												color: T.sub,
												whiteSpace: 'pre-wrap',
												overflowWrap: 'anywhere',
											}}
										>
											{n.body}
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</PvPage>
	);
}

// 6 · JOURNAL — the entries the DM has shared with this player (read-only on the device).
function JournalSection({ data }: { data: LiveData }) {
	return (
		<PvPage max={1080}>
			<SectionHead title="Journal" sub="Entries the DM has shared with you" />
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: '10px 14px',
					borderRadius: 10,
					background: 'var(--color-dm-only-subtle)',
					border: `1px solid var(--color-dm-only-badge)`,
					marginBottom: 18,
				}}
			>
				<Icon name="hidden" size={16} color="var(--color-dm-only-badge)" />
				<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
					You see entries shared with you; author private notes in your full character app.
				</span>
			</div>
			<Panel title={`Shared entries (${data.journal.length})`}>
				{data.journal.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						No journal entries have been shared with you.
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{data.journal.map((e, i) => (
							<div
								key={e.id}
								style={{ padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
									<span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{e.title}</span>
									<Badge status="neutral">{e.kind}</Badge>
								</div>
								{e.body && <div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>{e.body}</div>}
							</div>
						))}
					</div>
				)}
			</Panel>
			{/* I11 S11.2.4 — the reviewable SCENE HISTORY: player-visible scene cards the DM has pushed. */}
			<div style={{ marginTop: 18 }} />
			<Panel title={`Scene history (${data.sceneHistory.length})`}>
				{data.sceneHistory.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						No scenes have been shown to the table yet.
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{[...data.sceneHistory].reverse().map((row, i) => {
							const theme = moodTheme(row.card.mood);
							return (
								<div
									key={row.id}
									style={{
										display: 'flex',
										alignItems: 'flex-start',
										gap: 10,
										padding: '10px 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
									}}
								>
									<span
										style={{
											width: 10,
											height: 10,
											marginTop: 4,
											borderRadius: '50%',
											flex: '0 0 auto',
											background: theme.accent,
										}}
									/>
									<div style={{ minWidth: 0, flex: 1 }}>
										<div style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{row.card.title}</div>
										{row.card.flavorText && (
											<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
												{row.card.flavorText}
											</div>
										)}
									</div>
									<span style={{ flex: '0 0 auto' }}>
										<Badge status="neutral">{theme.label}</Badge>
									</span>
								</div>
							);
						})}
					</div>
				)}
			</Panel>
		</PvPage>
	);
}

// ELEVATED fallback — reached only when a non-Co-DM seat somehow routes to an elevated section (the
// nav is gated so this is defensive). A real Co-DM seat renders the live panels below instead.
function ElevatedLocked({ label }: { label: string }) {
	return (
		<PvPage max={900}>
			<SectionHead
				title={label}
				sub="A Co-DM tool — available on a Co-DM seat"
				action={
					<Badge status="accent" icon="session-bolt">
						Co-DM tool
					</Badge>
				}
			/>
			<LockedNote what={label} />
		</PvPage>
	);
}

// ELEVATED · ATLAS — every scene the Co-DM may see, INCLUDING dm-only scenes a player never gets.
function AtlasSection({ data }: { data: LiveData }) {
	const scenes = data.elevated?.scenes ?? [];
	return (
		<PvPage max={1140}>
			<SectionHead
				title="Maps & scenes"
				sub="The full atlas — including scenes your DM keeps hidden from the table"
				action={
					<Badge status="accent" icon="atlas-map">
						{scenes.length} scenes
					</Badge>
				}
			/>
			{scenes.length === 0 ? (
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						No scenes have been authored in this campaign yet.
					</div>
				</Panel>
			) : (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
						gap: 12,
					}}
				>
					{scenes.map((s) => (
						<div
							key={s.id}
							style={{
								padding: 14,
								borderRadius: 11,
								border: `1px solid ${s.visibility === 'dm-only' ? T.accBd : T.bd}`,
								background: s.visibility === 'dm-only' ? T.accSub : T.surf,
							}}
						>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: 8,
								}}
							>
								<span
									style={{
										font: `600 14px ${T.sans}`,
										color: T.ink,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{s.name}
								</span>
								<VisibilityChip level={s.visibility} compact />
							</div>
							<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginTop: 6 }}>
								Updated {new Date(s.updatedAt).toLocaleDateString()}
							</div>
							{s.tags.length > 0 && (
								<div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
									{s.tags.slice(0, 4).map((t) => (
										<Chip key={t} tone="neutral">
											{t}
										</Chip>
									))}
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</PvPage>
	);
}

// ELEVATED · BESTIARY — the DM's creature/NPC roster (non-PC characters) the Co-DM may see.
function BestiarySection({ data }: { data: LiveData }) {
	const creatures = data.elevated?.bestiary ?? [];
	const [open, setOpen] = useState<string | null | undefined>(undefined);
	const openId =
		open === null
			? null
			: creatures.some((creature) => creature.id === open)
				? open
				: (creatures[0]?.id ?? null);
	return (
		<PvPage max={900}>
			<SectionHead
				title="Bestiary"
				sub="NPCs and monsters your DM has authored — hidden from players"
				action={
					<Badge status="accent" icon="campaign-scroll">
						{creatures.length}
					</Badge>
				}
			/>
			{creatures.length === 0 ? (
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						No NPCs or monsters have been authored yet.
					</div>
				</Panel>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{creatures.map((c) => {
						const isOpen = openId === c.id;
						const res = c.combat;
						return (
							<div
								key={c.id}
								style={{
									border: `1px solid ${isOpen ? T.accBd : T.bd}`,
									borderRadius: 10,
									background: T.surf,
									overflow: 'hidden',
								}}
							>
								<button
									type="button"
									aria-expanded={isOpen}
									aria-controls={`bestiary-${c.id}-panel`}
									onClick={() => setOpen(isOpen ? null : c.id)}
									style={{
										width: '100%',
										display: 'flex',
										alignItems: 'center',
										gap: 12,
										padding: '12px 15px',
										cursor: 'pointer',
										border: 'none',
										background: 'transparent',
										textAlign: 'left',
									}}
								>
									<Avatar name={c.name} size="sm" />
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
											<span style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>{c.name}</span>
											<Badge status="neutral">{c.kind}</Badge>
										</div>
										{res && (
											<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginTop: 2 }}>
												HP {res.hp}/{res.maxHp} · AC {res.ac}
											</div>
										)}
									</div>
									<Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.ter} />
								</button>
								{isOpen && (
									<div
										id={`bestiary-${c.id}-panel`}
										style={{
											padding: '0 15px 15px 15px',
											display: 'flex',
											flexWrap: 'wrap',
											gap: 14,
										}}
									>
										{ABIL_ORDER.map((a) => (
											<div key={a} style={{ textAlign: 'center' }}>
												<div
													style={{
														font: `10px ${T.sans}`,
														color: T.ter,
														textTransform: 'uppercase',
														letterSpacing: '.06em',
													}}
												>
													{a}
												</div>
												<div style={{ font: `600 14px ${T.mono}`, color: T.ink }}>
													{c.abilityScores?.[a] ?? '—'}
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</PvPage>
	);
}

// ELEVATED · COMBAT ASSIST — the FULL combat tracker: hidden combatants + real HP a player never sees.
function AssistSection({ data }: { data: LiveData }) {
	const combat = data.elevated?.combat ?? null;
	const running = combat?.status === 'running';
	const combatants = combat?.combatants ?? [];
	return (
		<PvPage max={1000}>
			<SectionHead
				title="Combat assist"
				sub="The live initiative order — including hidden combatants and full stat blocks"
				action={
					<Badge status={running ? 'success' : 'neutral'} icon="session-bolt">
						{running ? `Round ${combat?.round}` : 'No combat'}
					</Badge>
				}
			/>
			{!running || combatants.length === 0 ? (
				<Panel>
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						No combat is running. When the DM starts an encounter the full order appears here.
					</div>
				</Panel>
			) : (
				<Panel title="Initiative order">
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{combatants.map((c) => (
							<div
								key={c.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									flexWrap: 'wrap',
									gap: 12,
									padding: 11,
									borderRadius: 10,
									border: `1px solid ${c.isActive ? T.accBd : T.bd}`,
									background: c.isActive ? T.accSub : c.hidden ? T.alt : T.surf,
								}}
							>
								<div
									style={{
										width: 34,
										textAlign: 'center',
										font: `600 15px ${T.mono}`,
										color: c.isActive ? T.acc : T.sub,
									}}
								>
									{c.statBlock.initiative ?? '—'}
								</div>
								<div style={{ flex: '1 1 180px', minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
										<span
											style={{
												minWidth: 0,
												font: `600 13.5px ${T.sans}`,
												color: T.ink,
												overflowWrap: 'anywhere',
											}}
										>
											{c.name}
										</span>
										{c.hidden && <Badge status="accent">Hidden</Badge>}
										{c.isActive && <Badge status="success">Active</Badge>}
										<Badge status="neutral">{c.kind}</Badge>
									</div>
								</div>
								{c.resources ? (
									<div style={{ flex: '1 1 150px', minWidth: 0 }}>
										<HPBar current={c.resources.hp} max={c.resources.maxHp} size="sm" />
									</div>
								) : (
									<span style={{ font: `11px ${T.sans}`, color: T.ter }}>—</span>
								)}
							</div>
						))}
					</div>
				</Panel>
			)}
		</PvPage>
	);
}
