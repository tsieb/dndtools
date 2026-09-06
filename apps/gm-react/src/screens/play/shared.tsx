import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, CONDITIONS, Icon } from '../../ds';
import type { DSBadgeStatus } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import type { PlayerData } from '../../net/viewModels';

/**
 * Shared vocabulary for the standalone player companion app: the seat-tier table, the nav model, the
 * label maps, the toast hook and the four layout primitives (`Panel`, `PvPage`, `SectionHead`,
 * `LockedNote`) every section in this folder composes. Split out of the former 2,282-line
 * `screens/PlayerView.tsx` unchanged.
 */

// The player's device identity. The runtime seeds `actor-player` (Demo Player) as a participant; the
// DM-side ViewAs/Projection controls project the live table to exactly this actor.
export const PLAYER_ACTOR_ID = 'actor-player';

export const TIERS = ['observer', 'player', 'trusted', 'codm'] as const;
export const TIER_META: Record<
	string,
	{ label: MessageKey; role: MessageKey; badge: DSBadgeStatus; icon: string; blurb: MessageKey }
> = {
	observer: {
		label: 'play.tier.observer',
		role: 'play.tier.observerRole',
		badge: 'neutral',
		icon: 'reveal',
		blurb: 'play.tier.observerBlurb',
	},
	player: {
		label: 'play.tier.player',
		role: 'play.tier.playerRole',
		badge: 'success',
		icon: 'characters-person',
		blurb: 'play.tier.playerBlurb',
	},
	trusted: {
		label: 'play.tier.trusted',
		role: 'play.tier.trustedRole',
		badge: 'info',
		icon: 'flag',
		blurb: 'play.tier.trustedBlurb',
	},
	codm: {
		label: 'play.tier.codm',
		role: 'play.tier.codmRole',
		badge: 'accent',
		icon: 'session-bolt',
		blurb: 'play.tier.codmBlurb',
	},
};

type PlayNavItem = { id: string; label: MessageKey; icon: string; min: number };
export const NAV: PlayNavItem[] = [
	{ id: 'stage', label: 'play.nav.stage', icon: 'home', min: 0 },
	{ id: 'sheet', label: 'play.nav.sheet', icon: 'characters-person', min: 1 },
	{ id: 'dice', label: 'play.nav.dice', icon: 'dice', min: 1 },
	{ id: 'party', label: 'play.nav.party', icon: 'players', min: 0 },
	{ id: 'handouts', label: 'play.nav.handouts', icon: 'knowledge-book', min: 0 },
	{ id: 'journal', label: 'play.nav.journal', icon: 'note-edit', min: 1 },
];
export const NAV_ELEVATED: PlayNavItem[] = [
	{ id: 'atlas', label: 'play.nav.atlas', icon: 'atlas-map', min: 3 },
	{ id: 'bestiary', label: 'play.nav.bestiary', icon: 'campaign-scroll', min: 3 },
	{ id: 'assist', label: 'play.nav.assist', icon: 'session-bolt', min: 3 },
];
/** The seat a section needs, as a message key — the caller renders it. */
export const minTierLabel = (min: number): MessageKey => TIER_META[TIERS[min]].label;

export const ABIL_FULL: Record<string, MessageKey> = {
	str: 'play.ability.str',
	dex: 'play.ability.dex',
	con: 'play.ability.con',
	int: 'play.ability.int',
	wis: 'play.ability.wis',
	cha: 'play.ability.cha',
};
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
/**
 * `Combatant['kind']` is a raw core enum (`character` | `npc` | `monster`) and both combat rosters
 * rendered it straight into a Badge, so the table read a lowercase "npc" / "monster" beside properly
 * cased names — and "NPC" lost its capitalisation as an initialism entirely.
 */
/** The creature-kind token as a message key; an unknown token has no key and renders raw. */
export function kindLabelKey(kind: string): MessageKey | null {
	if (kind === 'npc') return 'play.kind.npc';
	if (kind === 'character') return 'play.kind.character';
	if (kind === 'monster') return 'play.kind.monster';
	return null;
}

export function condKey(s: string): string | null {
	const C = CONDITIONS ?? {};
	const k = String(s).toLowerCase();
	return COND_ALIAS[k] || (C[k] ? k : null);
}

// --- local toasts (the standalone player app has no global toaster) -------------------------------
export interface ToastItem {
	id: string;
	msg: string;
	status: string;
	icon?: string;
}
export function useToasts() {
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
export const TOAST_TONE: Record<string, { bd: string; bg: string; fg: string }> = {
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
	// A bad roll is not a system failure. `error` here means role="alert" + aria-live="assertive"
	// (see the viewport below) AND exclusion from the persistent polite region, so "Natural 1 —
	// critical miss" interrupted a screen-reader mid-sentence in the app's red failure skin.
	warning: {
		bd: 'var(--color-status-warning-border)',
		bg: 'var(--color-status-warning-subtle)',
		fg: 'var(--color-status-warning-text)',
	},
	neutral: { bd: T.bdS, bg: T.surf, fg: T.ink },
};

// --- shared layout primitives (ported from player-view-app.jsx) -----------------------------------
export function Panel({
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
export function PvPage({ children, max = 1140 }: { children?: ReactNode; max?: number }) {
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
export function SectionHead({
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
export function LockedNote({ what }: { what: string }) {
	const { t } = useI18n();
	const coDm = t('play.locked.coDm');
	const note = t('play.locked.note', { what, coDm });
	const [noteBefore, noteAfter = ''] = note.split(coDm);
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
				{noteBefore}
				<strong style={{ color: T.ink }}>{coDm}</strong>
				{noteAfter}
			</span>
		</div>
	);
}

// The player view-model is now the shared `PlayerData` shape (see net/viewModels.ts): identical fields,
// computed once by `buildPlayerData` so the LOCAL (DM preview / offline) path and the REMOTE (joined,
// replicated over P2P) path can never diverge.
export type LiveData = PlayerData;

// ELEVATED fallback — reached only when a non-Co-DM seat somehow routes to an elevated section (the
// nav is gated so this is defensive). A real Co-DM seat renders the live panels below instead.
export function ElevatedLocked({ label }: { label: string }) {
	const { t } = useI18n();
	return (
		<PvPage max={900}>
			<SectionHead
				title={label}
				sub={t('play.locked.sub')}
				action={
					<Badge status="accent" icon="session-bolt">
						{t('play.locked.badge')}
					</Badge>
				}
			/>
			<LockedNote what={label} />
		</PvPage>
	);
}
