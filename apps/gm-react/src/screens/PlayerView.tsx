import { useMemo, useState, type ReactNode, type CSSProperties } from 'react';
import {
	resolveCommandCenterHome,
	getPartyOverviewForActor,
	getCharacterForActor,
	getCharacterJournalForActor,
	getContentItemsForActor,
	getCombatTrackerForActor,
	listCharactersForActor,
	resourcesOf,
	availableSlots,
	type CommandCenterHomeView,
	type PartyOverview,
	type CharacterView,
	type JournalEntryView,
	type ContentItemView,
} from '@dndtools/core';
import { Avatar, Badge, Button, Chip, ConditionBadge, CONDITIONS, DiceResult, HPBar, Icon, IconButton, Stat } from '../ds';
import { T, eb } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * PlayerView — the STANDALONE, chrome-less player companion app (route `/play`, OUTSIDE the DM
 * AppShell), ported from the design package's `player-view-app.jsx`. It renders its own frame (sidebar
 * + permission banner + section body + toasts) and reads the LIVE table through the actor-filtered
 * Processing Core, as a PLAYER actor — never the DM.
 *
 * Because this is the player's device, every read is made with a player actor id (`PLAYER_ACTOR_ID`),
 * so the Core delivers ONLY player-safe content: the projected scene, the visible party (PCs; DM-only
 * NPCs are absent), shared handouts, and the player's own sheet. It is READ-ONLY — the demo player
 * owns no PC, so writes would be rejected; the live surface displays rather than mutates.
 *
 * Wired reads: {@link resolveCommandCenterHome} (the participant home: assigned scene + session status
 * strip), {@link getCombatTrackerForActor} (the viewer-masked turn order), {@link getPartyOverviewForActor},
 * {@link getCharacterForActor} + {@link resourcesOf}, {@link getCharacterJournalForActor}, and
 * {@link getContentItemsForActor} (shared handouts). Null-safe: when nothing is projected it shows the
 * "waiting for the table" empty state.
 *
 * HONEST-LOCAL (each tagged `// no core command`): the presence affordances (raise hand / ready),
 * the dice roller broadcast, drop-concentration, and the elevated Co-DM tools — none of which a player
 * actor can drive through the Core. The Co-DM / Trusted tiers have NO core role above `player`, so the
 * elevated nav is shown-locked.
 */

// The player's device identity. The runtime seeds `actor-player` (Demo Player) as a participant; the
// DM-side ViewAs/Projection controls project the live table to exactly this actor.
const PLAYER_ACTOR_ID = 'actor-player';

const TIERS = ['observer', 'player', 'trusted', 'codm'] as const;
const TIER_META: Record<string, { label: string; role: string; badge: any; icon: string; blurb: string }> = {
	observer: { label: 'Observer', role: 'Read-only seat', badge: 'neutral', icon: 'reveal', blurb: 'You can watch what the table sees and read shared handouts.' },
	player: { label: 'Player', role: 'Your own character', badge: 'success', icon: 'characters-person', blurb: 'Run your sheet, roll your dice, and read what the DM shares with the table.' },
	trusted: { label: 'Trusted player', role: 'Shared editing granted', badge: 'info', icon: 'flag', blurb: 'A player, plus shared-stash editing and recap posting.' },
	codm: { label: 'Co-DM', role: 'Elevated table tools', badge: 'accent', icon: 'session-bolt', blurb: 'Granted GM tools — the revealed Atlas, the bestiary, and live combat assist.' },
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
	{ id: 'atlas', label: 'Atlas', icon: 'atlas-map', min: 3 },
	{ id: 'bestiary', label: 'Bestiary', icon: 'campaign-scroll', min: 3 },
	{ id: 'assist', label: 'Combat assist', icon: 'session-bolt', min: 3 },
];
const minTierLabel = (min: number) => TIER_META[TIERS[min]].label;

const ABIL_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABIL_FULL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const sgn = (n: number) => (n >= 0 ? '+' : '') + n;
const abilMod = (score: number | undefined) => Math.floor(((score ?? 10) - 10) / 2);
const COND_ALIAS: Record<string, string> = { concentrating: 'concentration', prone: 'prone', poisoned: 'poisoned', stunned: 'stunned', frightened: 'frightened', restrained: 'restrained', grappled: 'grappled', invisible: 'invisible', paralyzed: 'paralyzed', unconscious: 'unconscious', charmed: 'charmed', blinded: 'blinded', deafened: 'deafened', petrified: 'petrified', incapacitated: 'incapacitated', exhaustion: 'exhaustion' };
function condKey(s: string): string | null {
	const C = (CONDITIONS as any) || {};
	const k = String(s).toLowerCase();
	return COND_ALIAS[k] || (C[k] ? k : null);
}

// --- local toasts (the standalone player app has no global toaster) -------------------------------
interface ToastItem { id: string; msg: string; status: string; icon?: string }
function useToasts() {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const toast = (msg: string, status = 'neutral', icon?: string) => {
		const id = Math.random().toString(36).slice(2);
		setToasts((t) => [...t, { id, msg, status, icon }]);
		setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
	};
	return { toasts, toast };
}
const TOAST_TONE: Record<string, { bd: string; bg: string; fg: string }> = {
	success: { bd: 'var(--color-status-success-border)', bg: 'var(--color-status-success-subtle)', fg: 'var(--color-status-success-text)' },
	error: { bd: 'var(--color-status-error-border)', bg: 'var(--color-status-error-subtle)', fg: 'var(--color-status-error-text)' },
	info: { bd: 'var(--color-status-info-border)', bg: 'var(--color-status-info-subtle)', fg: 'var(--color-status-info-text)' },
	neutral: { bd: T.bdS, bg: T.surf, fg: T.ink },
};

// --- shared layout primitives (ported from player-view-app.jsx) -----------------------------------
function Panel({ title, action, pad = 16, accent, children }: { title?: ReactNode; action?: ReactNode; pad?: number; accent?: boolean; children?: ReactNode }) {
	return (
		<div style={{ background: T.surf, border: `1px solid ${accent ? T.accBd : T.bd}`, borderRadius: 8, boxShadow: accent ? T.smd : T.ssm }}>
			{title != null && (
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.bd}` }}>
					<span style={{ font: `600 13px ${T.sans}`, flex: 1, color: T.ink }}>{title}</span>
					{action}
				</div>
			)}
			<div style={{ padding: pad }}>{children}</div>
		</div>
	);
}
function PvPage({ children, max = 1140 }: { children?: ReactNode; max?: number }) {
	return <div style={{ maxWidth: max, margin: '0 auto', padding: '26px 28px 60px' }}>{children}</div>;
}
function SectionHead({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
	return (
		<div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
			<div style={{ flex: 1, minWidth: 0 }}>
				<h1 style={{ margin: 0, font: `600 26px ${T.disp}`, color: T.ink }}>{title}</h1>
				{sub && <div style={{ marginTop: 4, font: `13px ${T.sans}`, color: T.ter }}>{sub}</div>}
			</div>
			{action}
		</div>
	);
}
function LockedNote({ need, what }: { need: string; what: string }) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, background: 'var(--color-visibility-dm-subtle)', border: `1px solid var(--color-visibility-dm)` }}>
			<Icon name="hidden" size={16} color="var(--color-visibility-dm)" />
			<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{what} — your DM grants this at <strong style={{ color: T.ink }}>{need}</strong> permission.</span>
		</div>
	);
}

interface LiveData {
	home: CommandCenterHomeView;
	live: boolean;
	sceneName: string | null;
	turnOrder: { id: string; name: string; init: number | null; hp: number | null; maxHp: number | null; kind: string; active: boolean }[];
	round: number | null;
	activeName: string | null;
	pc: CharacterView | null;
	pcId: string | null;
	resources: ReturnType<typeof resourcesOf> | null;
	party: PartyOverview;
	journal: JournalEntryView[];
	handouts: ContentItemView[];
	displayName: string;
}

export function PlayerView() {
	const runtime = useRuntime();
	const state = runtime.state;
	const viewer = PLAYER_ACTOR_ID;
	const { toasts, toast } = useToasts();
	const [section, setSection] = useState('stage');

	const actor = state.permissions.actors[viewer];
	// Derive the permission rank from the REAL actor role. The Core has no `trusted`/`codm` role, so a
	// player tops out at rank 1 and the elevated tools below stay shown-locked. // no core role above player
	const role = actor?.role === 'observer' ? 'observer' : 'player';
	const r = role === 'observer' ? 0 : 1;
	const meta = TIER_META[role];

	const data = useMemo<LiveData>(() => {
		const home = resolveCommandCenterHome(state, viewer, { widgetPackages: state.widgets });
		const strip = home.kind === 'participant' || home.kind === 'dm' ? home.statusStrip : null;
		const playerView = home.kind === 'participant' ? home.playerView : null;
		const sceneName = playerView && playerView.kind === 'assigned' ? playerView.name : null;
		const live = strip?.phase.tone === 'live' || sceneName !== null;

		const combat = getCombatTrackerForActor(state.session.combat, state.permissions, viewer);
		const turnOrder = combat.status === 'running'
			? combat.combatants.map((c) => ({
				id: c.id,
				name: c.name,
				init: c.statBlock.initiative,
				hp: c.resources?.hp ?? null,
				maxHp: c.resources?.maxHp ?? null,
				kind: c.kind,
				active: c.isActive,
			}))
			: [];

		const pcs = listCharactersForActor(state.characters, state.permissions, viewer).filter((c) => c.kind === 'pc');
		const chosen = pcs[0] ?? null;
		const pc = chosen ? getCharacterForActor(state.characters, state.permissions, viewer, chosen.id) : null;
		const record = chosen ? state.characters.characters[chosen.id] : undefined;
		const resources = record ? resourcesOf(record) : null;
		const journal = chosen ? getCharacterJournalForActor(state.characters, state.permissions, viewer, chosen.id).entries : [];
		const party = getPartyOverviewForActor(state.characters, state.permissions, viewer);
		const handouts = getContentItemsForActor(state.content, state.permissions, viewer);

		return {
			home,
			live: Boolean(live),
			sceneName,
			turnOrder,
			round: strip?.turn.round ?? null,
			activeName: strip?.turn.activeName ?? null,
			pc,
			pcId: chosen?.id ?? null,
			resources,
			party,
			journal,
			handouts,
			displayName: home.kind === 'participant' ? home.displayName : (actor?.displayName ?? 'Player'),
		};
	}, [state, viewer, actor?.displayName]);

	const allItems = [...NAV, ...NAV_ELEVATED];
	const allowedIds = allItems.filter((n) => r >= n.min).map((n) => n.id);
	const current = allowedIds.includes(section) ? section : 'stage';

	const navRow = (n: { id: string; label: string; icon: string; min: number }, locked: boolean) => (
		<button
			key={n.id}
			type="button"
			disabled={locked}
			onClick={() => { if (locked) { toast(`${n.label} needs ${minTierLabel(n.min)} permission`, 'info', 'hidden'); return; } setSection(n.id); }}
			style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 9, cursor: locked ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%', border: 'none', borderLeft: `3px solid ${current === n.id && !locked ? T.acc : 'transparent'}`, background: current === n.id && !locked ? T.accSub : 'transparent', opacity: locked ? 0.42 : 1 }}
		>
			<Icon name={n.icon} size={19} color={current === n.id && !locked ? T.acc : T.ter} />
			<span style={{ flex: 1, font: `${current === n.id && !locked ? 600 : 500} 13.5px ${T.sans}`, color: current === n.id && !locked ? T.ink : T.sub }}>{n.label}</span>
			{locked && <Icon name="hidden" size={14} color={T.ter} />}
		</button>
	);

	let body: ReactNode = null;
	if (current === 'stage') body = <StageSection data={data} r={r} toast={toast} />;
	else if (current === 'sheet') body = <SheetSection data={data} />;
	else if (current === 'dice') body = <DiceSection name={data.displayName} toast={toast} />;
	else if (current === 'party') body = <PartySection data={data} />;
	else if (current === 'handouts') body = <HandoutsSection data={data} />;
	else if (current === 'journal') body = <JournalSection data={data} />;
	else body = <ElevatedLocked label={NAV_ELEVATED.find((n) => n.id === current)?.label ?? 'Tool'} />;

	return (
		<div style={{ minHeight: '100vh', display: 'flex', background: 'radial-gradient(140% 100% at 50% -10%, color-mix(in srgb, var(--color-accent) 6%, var(--color-bg)) 0%, var(--color-bg) 60%)', color: T.ink, font: `14px ${T.sans}` }}>
			{/* sidebar */}
			<aside style={{ width: 248, flex: '0 0 auto', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.bd}`, background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)', backdropFilter: 'blur(4px)', position: 'sticky', top: 0, height: '100vh' }}>
				<div style={{ padding: '18px 18px 14px', borderBottom: `1px solid ${T.bd}` }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
						<div style={{ width: 34, height: 34, borderRadius: 9, background: T.acc, color: T.accFg, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 16px ${T.disp}` }}>P</div>
						<div style={{ minWidth: 0 }}>
							<div style={{ font: `700 14px ${T.disp}`, color: T.ink, lineHeight: 1.1 }}>Player view</div>
							<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{data.live ? 'Live at the table' : 'Standby'}</div>
						</div>
					</div>
				</div>
				<nav style={{ flex: 1, overflow: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
					{NAV.map((n) => navRow(n, r < n.min))}
					<div style={{ ...eb, padding: '14px 12px 6px', display: 'flex', alignItems: 'center', gap: 7 }}>
						<span>Elevated</span><span style={{ flex: 1, height: 1, background: T.bd }} />
						{r < 3 && <Icon name="hidden" size={13} color={T.ter} />}
					</div>
					{NAV_ELEVATED.map((n) => navRow(n, r < n.min))}
				</nav>
				<div style={{ padding: 14, borderTop: `1px solid ${T.bd}` }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 11, borderRadius: 11, background: T.alt, border: `1px solid ${T.bd}` }}>
						<Avatar name={data.displayName} size="sm" ring="none" />
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ font: `600 12.5px ${T.sans}`, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.displayName}</div>
							<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{meta.role}</div>
						</div>
					</div>
				</div>
			</aside>

			{/* main column */}
			<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 28px', borderBottom: `1px solid ${T.bd}`, background: 'color-mix(in srgb, var(--color-surface) 55%, transparent)' }}>
					<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 20, background: T.accSub, border: `1px solid ${T.accBd}` }}>
						<Icon name={meta.icon} size={15} color={T.acc} /><span style={{ font: `600 12.5px ${T.sans}`, color: T.acc }}>{meta.label}</span>
					</span>
					<span style={{ font: `12.5px ${T.sans}`, color: T.sub, flex: 1, minWidth: 0 }}>{meta.blurb}</span>
					<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
						<span style={{ width: 8, height: 8, borderRadius: '50%', background: data.live ? 'var(--color-status-success-text)' : T.ter }} />
						<span style={{ font: `12px ${T.sans}`, color: T.ter }}>{data.live ? 'Session live' : 'Offline'}</span>
					</span>
				</div>
				<main style={{ flex: 1, minWidth: 0 }}>{body}</main>
			</div>

			{/* toasts */}
			<div style={{ position: 'fixed', right: 22, bottom: 22, display: 'flex', flexDirection: 'column', gap: 9, zIndex: 60 }}>
				{toasts.map((t) => { const tone = TOAST_TONE[t.status] || TOAST_TONE.neutral; return (
					<div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, background: tone.bg, border: `1px solid ${tone.bd}`, boxShadow: T.smd, minWidth: 220, maxWidth: 320 }}>
						{t.icon && <Icon name={t.icon} size={16} color={tone.fg} />}
						<span style={{ font: `12.5px ${T.sans}`, color: tone.fg }}>{t.msg}</span>
					</div>
				); })}
			</div>
		</div>
	);
}

// 1 · NOW PLAYING — the live stage the DM is projecting + the player's presence row.
function StageSection({ data, r, toast }: { data: LiveData; r: number; toast: (m: string, s?: string, i?: string) => void }) {
	const { live, sceneName } = data;
	const [hand, setHand] = useState(false);
	const [ready, setReady] = useState(true);
	return (
		<PvPage max={1180}>
			<SectionHead
				title="Now playing"
				sub={live ? (sceneName ? `${sceneName} · projected from the table` : 'The session is live') : 'Waiting for your DM to start the session'}
				action={
					<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 20, background: live ? 'var(--color-status-success-subtle)' : T.alt, border: `1px solid ${live ? 'var(--color-status-success-border)' : T.bd}` }}>
						<span style={{ width: 8, height: 8, borderRadius: '50%', background: live ? 'var(--color-status-success-text)' : T.ter }} />
						<span style={{ font: `600 12px ${T.sans}`, color: live ? 'var(--color-status-success-text)' : T.ter }}>{live ? 'Session live' : 'Not started'}</span>
					</span>
				}
			/>
			<div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, alignItems: 'start' }}>
				<div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.bd}`, boxShadow: T.smd }}>
					<div style={{
						position: 'relative', aspectRatio: '16 / 10',
						background: sceneName
							? `radial-gradient(120% 80% at 50% 8%, color-mix(in srgb, var(--color-accent) 16%, #1a130b) 0%, #100b07 70%), linear-gradient(135deg, #15100a, #0d0906)`
							: '#0d0906',
						backgroundImage: sceneName ? `linear-gradient(color-mix(in srgb, var(--color-accent) 14%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 14%, transparent) 1px, transparent 1px)` : 'none',
						backgroundSize: '38px 38px',
					}}>
						<div style={{ position: 'absolute', top: 14, left: 16 }}>
							<span style={{ ...eb, color: 'color-mix(in srgb, var(--color-accent) 80%, #fff)' }}>What the table sees</span>
						</div>
						{sceneName ? (
							<div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 22px', background: 'linear-gradient(transparent, rgba(8,5,3,.85))' }}>
								<div style={{ font: `600 24px ${T.disp}`, color: '#f3e7d2' }}>{sceneName}</div>
								<div style={{ marginTop: 3, font: `13px ${T.sans}`, color: 'rgba(243,231,210,.7)' }}>Projected to your view by the DM</div>
							</div>
						) : (
							<div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: T.ter }}>
								<Icon name="atlas-map" size="xl" color={T.ter} />
								<span style={{ font: `14px ${T.sans}` }}>Nothing is being shown yet.</span>
							</div>
						)}
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: T.surf, borderTop: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
						{/* no core command — presence (raise hand / ready) is a local affordance */}
						{r >= 1 ? (
							<>
								<button type="button" onClick={() => { setHand((v) => !v); toast(hand ? 'Hand lowered' : 'Hand raised — the DM sees it', hand ? 'neutral' : 'info', 'flag'); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', font: `600 12.5px ${T.sans}`, border: `1px solid ${hand ? T.accBd : T.bd}`, background: hand ? T.accSub : T.surf, color: hand ? T.acc : T.sub }}>
									<Icon name="flag" size={15} />{hand ? 'Hand raised' : 'Raise hand'}</button>
								<button type="button" onClick={() => setReady((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', font: `600 12.5px ${T.sans}`, border: `1px solid ${ready ? 'var(--color-status-success-border)' : T.bd}`, background: ready ? 'var(--color-status-success-subtle)' : T.surf, color: ready ? 'var(--color-status-success-text)' : T.sub }}>
									<Icon name="check" size={15} />{ready ? "I'm ready" : 'Not ready'}</button>
							</>
						) : (
							<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, font: `12.5px ${T.sans}`, color: T.ter }}>
								<Icon name="reveal" size={15} color={T.ter} />Watching the table</span>
						)}
						<div style={{ flex: 1 }} />
						<span style={{ font: `12px ${T.sans}`, color: T.ter }}>Your DM controls what's revealed.</span>
					</div>
				</div>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel title="This turn" accent action={data.round != null ? <Badge status="neutral">Round {data.round}</Badge> : undefined}>
						{data.turnOrder.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{data.activeName ? `Active: ${data.activeName}` : 'No combat running.'}</div>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
								{data.turnOrder.map((c) => (
									<div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 9px', borderRadius: 8, background: c.active ? T.accSub : 'transparent', border: `1px solid ${c.active ? T.accBd : 'transparent'}` }}>
										<span style={{ font: `700 13px ${T.mono}`, width: 22, textAlign: 'center', color: c.active ? T.acc : T.ter }}>{c.init ?? '—'}</span>
										<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: T.sub }}>{c.name}</span>
										{c.kind === 'pc' && c.hp != null && <span style={{ font: `11px ${T.mono}`, color: T.ter }}>{c.hp}/{c.maxHp}</span>}
									</div>
								))}
							</div>
						)}
					</Panel>
					<Panel title="Shared handouts">
						{data.handouts.length === 0 ? (
							<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Nothing shared with you yet.</div>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
								{data.handouts.slice(0, 3).map((h) => (
									<div key={h.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
										<div style={{ width: 40, height: 40, flex: '0 0 auto', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.alt, border: `1px solid ${T.bd}` }}>
											<Icon name="knowledge-book" size="md" color={T.acc} />
										</div>
										<div style={{ flex: 1, minWidth: 0 }}>
											<div style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{h.title}</div>
											<div style={{ font: `12px/1.4 ${T.sans}`, color: T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.body}</div>
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
	const C = data.pc;
	if (!C) {
		return (
			<PvPage max={1140}>
				<SectionHead title="My character" />
				<Panel><div style={{ font: `13px ${T.sans}`, color: T.ter }}>No character has been assigned to you yet.</div></Panel>
			</PvPage>
		);
	}
	const r = data.resources;
	const slots = r ? Object.values(r.spellSlots).sort((a, b) => a.level - b.level) : [];
	const cardBox: CSSProperties = { textAlign: 'center', padding: '10px 6px', borderRadius: 11, border: `1px solid ${T.bd}`, background: T.surf };
	return (
		<div>
			<div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 16, padding: '12px 28px', background: 'color-mix(in srgb, var(--color-surface) 94%, transparent)', backdropFilter: 'blur(6px)', borderBottom: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
				<Avatar name={C.name} size="md" ring="active" />
				<div style={{ minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ font: `700 16px ${T.disp}`, color: T.ink }}>{C.name}</span><Badge status="success">PC</Badge></div>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{String(C.data?.cls ?? 'Adventurer')}</div>
				</div>
				<div style={{ textAlign: 'center', minWidth: 70, padding: '6px 12px', borderRadius: 11, background: T.alt, border: `1px solid ${T.bd}` }}>
					<div style={{ font: `700 18px ${T.mono}`, color: C.combat.maxHp > 0 && C.combat.hp / C.combat.maxHp < 0.3 ? T.err : T.ink, lineHeight: 1 }}>{C.combat.hp}<span style={{ font: `13px ${T.mono}`, color: T.ter }}> / {C.combat.maxHp}</span></div>
					<div style={{ ...eb, color: T.ter }}>Hit points</div>
				</div>
				<Stat label="AC" value={String(C.combat.ac)} icon="shield" />
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					{C.combat.conditions.map((c) => { const k = condKey(c); return k ? <ConditionBadge key={c} condition={k} compact /> : <Chip key={c} tone="accent">{c}</Chip>; })}
				</div>
			</div>
			<PvPage max={1140}>
				<div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'start' }}>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 116 }}>
						{ABIL_ORDER.map((key) => {
							const score = (C.abilityScores as Record<string, number | undefined>)[key];
							return (
								<div key={key} style={cardBox}>
									<div style={{ ...eb, color: T.ter }}>{ABIL_FULL[key]}</div>
									<div style={{ font: `700 24px ${T.mono}`, lineHeight: 1, color: T.ink }}>{sgn(abilMod(score))}</div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter, marginTop: 2 }}>{score ?? '—'}</div>
								</div>
							);
						})}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
						<Panel title="Spell slots">
							{slots.length === 0 ? (
								<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No spell slots tracked.</div>
							) : (
								<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
									{slots.map((s) => {
										const avail = availableSlots(s);
										return (
											<div key={s.level} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
												<span style={{ font: `600 12px ${T.sans}`, color: T.sub, width: 48 }}>Level {s.level}</span>
												<div style={{ display: 'flex', gap: 7, flex: 1 }}>
													{Array.from({ length: s.max }).map((_, i) => (
														<span key={i} style={{ width: 18, height: 18, transform: 'rotate(45deg)', borderRadius: 3, background: i < avail ? T.acc : 'transparent', border: `1.5px solid ${i < avail ? T.acc : T.bdS}` }} />
													))}
												</div>
												<span style={{ font: `12px ${T.mono}`, color: T.ter }}>{avail}/{s.max}</span>
											</div>
										);
									})}
								</div>
							)}
						</Panel>
						<Panel title="Conditions & status">
							<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>This is your live sheet as the table sees it. Edits are made in your full character app.</div>
						</Panel>
					</div>
				</div>
			</PvPage>
		</div>
	);
}

// 3 · DICE — a working local roller. // no core command (player dice broadcast is DM-gated)
const DICE = [20, 12, 10, 8, 6, 4];
interface RollEntry { id: string; notation: string; total: number; rolls: number[]; modifier: number; crit?: 'success' | 'fail'; who: string }
function DiceSection({ name, toast }: { name: string; toast: (m: string, s?: string, i?: string) => void }) {
	const [log, setLog] = useState<RollEntry[]>([]);
	const [mode, setMode] = useState<'normal' | 'adv' | 'dis'>('normal');
	const [mod, setMod] = useState(0);
	const rollOne = (faces: number) => {
		let rolls: number[]; let keep: number; let crit: 'success' | 'fail' | undefined;
		if (faces === 20 && mode !== 'normal') {
			const a = 1 + Math.floor(Math.random() * 20), b = 1 + Math.floor(Math.random() * 20);
			keep = mode === 'adv' ? Math.max(a, b) : Math.min(a, b);
			rolls = [a, b];
		} else {
			keep = 1 + Math.floor(Math.random() * faces);
			rolls = [keep];
		}
		if (faces === 20) crit = keep === 20 ? 'success' : keep === 1 ? 'fail' : undefined;
		const total = keep + mod;
		const entry: RollEntry = { id: Math.random().toString(36).slice(2), notation: `1d${faces}${mod ? sgn(mod) : ''}${faces === 20 && mode !== 'normal' ? ` (${mode})` : ''}`, total, rolls, modifier: mod, crit, who: `${name} · d${faces}` };
		setLog((l) => [entry, ...l].slice(0, 16));
		if (crit === 'success') toast('Natural 20 — critical!', 'success', 'sparkle');
		else if (crit === 'fail') toast('Natural 1 — critical miss', 'error', 'close');
	};
	const seg = (id: 'normal' | 'adv' | 'dis', label: string) => (
		<button type="button" onClick={() => setMode(id)} style={{ flex: 1, padding: '8px 0', cursor: 'pointer', font: `600 12px ${T.sans}`, border: 'none', background: mode === id ? T.acc : 'transparent', color: mode === id ? T.accFg : T.sub }}>{label}</button>
	);
	return (
		<PvPage max={920}>
			<SectionHead title="Dice" sub="Roll for your character (local to your device on the prototype)" />
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
				<Panel title="Roll" pad={16}>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
						{DICE.map((f) => (
							<button key={f} type="button" onClick={() => rollOne(f)} style={{ padding: '16px 0', borderRadius: 11, cursor: 'pointer', border: `1px solid ${T.bd}`, background: T.alt, color: T.ink, font: `700 17px ${T.mono}` }}>d{f}</button>
						))}
					</div>
					<div style={{ marginTop: 14 }}>
						<div style={{ ...eb, marginBottom: 6 }}>d20 mode</div>
						<div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: `1px solid ${T.bd}` }}>
							{seg('dis', 'Disadvantage')}{seg('normal', 'Normal')}{seg('adv', 'Advantage')}
						</div>
					</div>
					<div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
						<span style={eb}>Modifier</span>
						<IconButton icon="chevron-down" label="−1" variant="ghost" size="sm" onClick={() => setMod((m) => m - 1)} />
						<span style={{ font: `700 16px ${T.mono}`, color: T.acc, minWidth: 34, textAlign: 'center' }}>{sgn(mod)}</span>
						<IconButton icon="chevron-up" label="+1" variant="ghost" size="sm" onClick={() => setMod((m) => m + 1)} />
					</div>
				</Panel>
				<Panel title="Roll log" pad={14} action={<Button variant="ghost" size="sm" onClick={() => setLog([])}>Clear</Button>}>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxHeight: 460, overflow: 'auto' }}>
						{log.length === 0 && <div style={{ font: `12.5px ${T.sans}`, color: T.ter, padding: '14px 0', textAlign: 'center' }}>No rolls yet — pick a die.</div>}
						{log.map((d) => (
							<div key={d.id}>
								<div style={{ font: `10.5px ${T.sans}`, color: T.ter, marginBottom: 3 }}>{d.who}</div>
								<DiceResult notation={d.notation} total={d.total} rolls={d.rolls} modifier={d.modifier} crit={d.crit} />
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
			<SectionHead title="Party" sub="Live vitals as the DM shares them" action={<Badge status="neutral">{members.length} members</Badge>} />
			<Panel title="Roster">
				{members.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No party members are visible to you yet.</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
						{members.map((p) => {
							const downed = p.hp === 0;
							const self = p.characterId === data.pcId;
							return (
								<div key={p.characterId} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 12, borderRadius: 11, border: `1px solid ${downed ? 'var(--color-status-error-border)' : self ? T.accBd : T.bd}`, background: downed ? 'var(--color-status-error-subtle)' : self ? T.accSub : T.surf }}>
									<Avatar name={p.name} size="sm" ring={downed ? 'danger' : self ? 'active' : 'none'} />
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>{p.name}</span>{self && <Badge status="accent">You</Badge>}<span style={{ font: `11px ${T.sans}`, color: T.ter }}>AC {p.ac}</span></div>
										<div style={{ marginTop: 5, maxWidth: 240 }}><HPBar current={p.hp} max={p.maxHp} size="sm" /></div>
									</div>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
										{p.conditions.length ? p.conditions.map((c) => { const k = condKey(c); return k ? <ConditionBadge key={c} condition={k} compact /> : <Chip key={c} tone="neutral">{c}</Chip>; }) : <span style={{ font: `11px ${T.sans}`, color: T.ter }}>—</span>}
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
const HANDOUT_ICON: Record<string, string> = { note: 'knowledge-book', scene: 'atlas-map', recap: 'campaign-scroll' };
function HandoutsSection({ data }: { data: LiveData }) {
	const shared = data.handouts;
	const [open, setOpen] = useState<string | null>(shared[0]?.id ?? null);
	return (
		<PvPage max={900}>
			<SectionHead title="Handouts" sub="Notes and props your DM has revealed to you" action={<Badge status="neutral">{shared.length} shared</Badge>} />
			{shared.length === 0 ? (
				<Panel><div style={{ font: `13px ${T.sans}`, color: T.ter }}>Your DM hasn't shared any handouts with you yet.</div></Panel>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{shared.map((n) => {
						const isOpen = open === n.id;
						return (
							<div key={n.id} style={{ border: `1px solid ${isOpen ? T.accBd : T.bd}`, borderRadius: 10, background: T.surf, boxShadow: isOpen ? T.ssm : 'none', overflow: 'hidden' }}>
								<button type="button" onClick={() => setOpen(isOpen ? null : n.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left' }}>
									<div style={{ width: 40, height: 40, flex: '0 0 auto', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.alt, border: `1px solid ${T.bd}` }}>
										<Icon name={HANDOUT_ICON[n.kind] || 'knowledge-book'} size={20} color={T.acc} />
									</div>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ font: `600 14px ${T.sans}`, color: T.ink }}>{n.title}</span><Badge status="info">{n.kind}</Badge></div>
										<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>Updated {new Date(n.updatedAt).toLocaleDateString()}</div>
									</div>
									<Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.ter} />
								</button>
								{isOpen && (
									<div style={{ padding: '4px 16px 18px 68px' }}>
										<div style={{ padding: '12px 16px', borderRadius: 9, background: T.alt, borderLeft: `3px solid ${T.acc}`, font: `13.5px/1.6 ${T.sans}`, color: T.sub, whiteSpace: 'pre-wrap' }}>{n.body}</div>
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
			<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--color-visibility-dm-subtle)', border: `1px solid var(--color-visibility-dm)`, marginBottom: 18 }}>
				<Icon name="hidden" size={16} color="var(--color-visibility-dm)" /><span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>You see entries shared with you; author private notes in your full character app.</span>
			</div>
			<Panel title={`Shared entries (${data.journal.length})`}>
				{data.journal.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No journal entries have been shared with you.</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{data.journal.map((e, i) => (
							<div key={e.id} style={{ padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{e.title}</span><Badge status="neutral">{e.kind}</Badge></div>
								{e.body && <div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>{e.body}</div>}
							</div>
						))}
					</div>
				)}
			</Panel>
		</PvPage>
	);
}

// ELEVATED — Co-DM tools have no Core role above `player`, so they render shown-locked. // no core role
function ElevatedLocked({ label }: { label: string }) {
	return (
		<PvPage max={900}>
			<SectionHead title={label} sub="Granted by your DM at Co-DM permission" action={<Badge status="accent" icon="session-bolt">Co-DM tool</Badge>} />
			<LockedNote need="Co-DM" what={label} />
		</PvPage>
	);
}
