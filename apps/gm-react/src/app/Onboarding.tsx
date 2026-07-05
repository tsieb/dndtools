import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	DEFAULT_FEATURE_TIER,
	listCharactersForActor,
	listMapsForActor,
	listScenesForActor,
	getContentItemsForActor,
	visibleFeatures,
	type FeatureTier,
} from '@dndtools/core';
import { Avatar, Badge, Button, Icon, IconButton, Input, Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { DNDAccount } from '../runtime/mockCampaign';
import { resetCoreStorage } from '../platform/storage/coreStore';
import { T } from './screen-kit';

/**
 * Onboarding — the first-run overlay from the design prototype (onboarding.jsx): a fixed split-pane
 * wizard (step rail · content) that walks welcome → vault → experience → players → ready. Ported
 * against the live Processing Core instead of the mock store:
 *
 *   • VAULT — the sample campaign is already seeded by `SceneRuntime.load()` before this overlay can
 *     render, so the step is an honest choice between KEEPING it (recommended; shows the real seeded
 *     counts) and STARTING FRESH (records `dndtools:react:vault-choice=fresh` — which `load()` reads
 *     to skip re-seeding — then wipes local storage via `resetCoreStorage()` and reloads).
 *   • EXPERIENCE — the same device-local feature-tier convention Settings uses (one source of truth:
 *     `dndtools:react:tier` + `data-feature-tier`), with each card's reveals read live from the
 *     Core's `visibleFeatures()` query.
 *   • PLAYERS — invite emails are DEVICE-LOCAL (persisted to localStorage) and say so: the local-first
 *     core has no invite transport, so pretending to send mail would be fiction.
 *   • READY — the checklist is derived from the real vault (scenes/party/maps/notes staged, live
 *     scene not yet started), so it doubles as a truthful "what to do next".
 *
 * Self-gating: renders only while `dndtools:react:onboarded` is unset. Settings can re-open it by
 * clearing the flag and firing the `REPLAY_EVENT` custom event ("Replay setup").
 */

export const ONBOARDED_KEY = 'dndtools:react:onboarded';
export const VAULT_CHOICE_KEY = 'dndtools:react:vault-choice';
export const REPLAY_EVENT = 'dndtools:onboarding-replay';
const INVITES_KEY = 'dndtools:react:invites';
const TIER_KEY = 'dndtools:react:tier';
const TIER_ATTR = 'data-feature-tier';
// Mirrors Settings' complexity mapping — design vocabulary level → real core FeatureTier.
const LEVEL_TO_TIER: Record<string, FeatureTier> = { beginner: 'core', standard: 'intermediate', expert: 'advanced' };

const ACCT = DNDAccount as any;

function readStorage(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: string) {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		/* private mode — the overlay just re-appears next boot */
	}
}

const ONB_STEPS = [
	{ id: 'welcome', title: 'Welcome', icon: 'sparkle' },
	{ id: 'vault', title: 'Your vault', icon: 'vault' },
	{ id: 'experience', title: 'Experience', icon: 'sliders' },
	{ id: 'players', title: 'Invite players', icon: 'players' },
	{ id: 'ready', title: 'Ready', icon: 'flag' },
] as const;

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Radio-style choice card shared by the vault + experience steps. */
function ChoiceCard({
	on,
	icon,
	title,
	badge,
	desc,
	children,
	onPick,
}: {
	on: boolean;
	icon: string;
	title: string;
	badge?: string;
	desc: string;
	children?: React.ReactNode;
	onPick: () => void;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={on}
			onClick={onPick}
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: 14,
				padding: 15,
				borderRadius: 12,
				cursor: 'pointer',
				textAlign: 'left',
				border: `1px solid ${on ? T.accBd : T.bd}`,
				background: on ? T.accSub : T.surf,
				boxShadow: on ? T.smd : 'none',
				transition: 'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
			}}
		>
			<span
				style={{ width: 40, height: 40, borderRadius: 10, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? T.acc : T.alt, color: on ? T.accFg : T.acc }}
			>
				<Icon name={icon} size="md" />
			</span>
			<span style={{ flex: 1, minWidth: 0 }}>
				<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<span style={{ font: `600 14px ${T.sans}`, color: on ? T.acc : T.ink }}>{title}</span>
					{badge && <Badge status="neutral">{badge}</Badge>}
				</span>
				<span style={{ display: 'block', font: `12px/1.5 ${T.sans}`, color: T.sub, marginTop: 2 }}>{desc}</span>
				{children}
			</span>
			<span
				aria-hidden="true"
				style={{ width: 20, height: 20, borderRadius: '50%', flex: '0 0 auto', border: `2px solid ${on ? T.acc : T.bdS}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}
			>
				{on && <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.acc }} />}
			</span>
		</button>
	);
}

export function Onboarding() {
	const runtime = useRuntime();
	const navigate = useNavigate();
	const [open, setOpen] = useState(() => readStorage(ONBOARDED_KEY) === null);
	const [i, setI] = useState(0);
	const [vault, setVault] = useState<'sample' | 'fresh'>('sample');
	const [tier, setTier] = useState<FeatureTier>(DEFAULT_FEATURE_TIER);
	const [emails, setEmails] = useState<string[]>([]);
	const [draft, setDraft] = useState('');
	const [wiping, setWiping] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);

	// Settings' "Replay setup" clears the flag and fires this event so the overlay re-opens live.
	useEffect(() => {
		function onReplay() {
			setI(0);
			setOpen(true);
		}
		window.addEventListener(REPLAY_EVENT, onReplay);
		return () => window.removeEventListener(REPLAY_EVENT, onReplay);
	}, []);

	// Focus the panel when the overlay opens; trap Tab inside it (same contract as the DS Sheet).
	useEffect(() => {
		if (!open) return;
		const panel = panelRef.current;
		if (!panel) return;
		const first = panel.querySelector<HTMLElement>(FOCUSABLE);
		(first ?? panel).focus();
	}, [open, i]);

	const actorId = runtime.defaultActorId;
	const vaultFacts = useMemo(() => {
		if (!open) return { scenes: 0, pcs: 0, npcs: 0, maps: 0, notes: 0 };
		const scenes = listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId).filter((s) => !s.isTemplate);
		const characters = listCharactersForActor(runtime.state.characters, runtime.state.permissions, actorId);
		const maps = listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId);
		const notes = getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId);
		const pcs = characters.filter((c) => c.kind === 'pc').length;
		return { scenes: scenes.length, pcs, npcs: characters.length - pcs, maps: maps.length, notes: notes.length };
	}, [open, runtime.state, actorId]);

	if (!open) return null;

	const step = ONB_STEPS[i];
	const next = () => setI((x) => Math.min(ONB_STEPS.length - 1, x + 1));
	const back = () => setI((x) => Math.max(0, x - 1));

	function skip() {
		writeStorage(ONBOARDED_KEY, 'skipped');
		setOpen(false);
	}

	async function finish() {
		// Apply the experience tier with the same one-source-of-truth convention Settings uses.
		document.documentElement.setAttribute(TIER_ATTR, tier);
		writeStorage(TIER_KEY, tier);
		if (emails.length > 0) writeStorage(INVITES_KEY, JSON.stringify(emails));
		writeStorage(ONBOARDED_KEY, 'done');
		if (vault === 'fresh') {
			// The user explicitly chose to clear the sample campaign. Record the choice FIRST so the
			// post-reload `load()` skips re-seeding, then wipe and reboot into the empty vault.
			writeStorage(VAULT_CHOICE_KEY, 'fresh');
			setWiping(true);
			try {
				await resetCoreStorage();
			} catch {
				/* the reload below re-runs load() either way */
			}
			window.location.reload();
			return;
		}
		setOpen(false);
		Toaster.success('Setup complete — welcome to the table');
	}

	function addEmail() {
		const v = draft.trim();
		if (!v) return;
		setEmails((e) => (e.includes(v) ? e : [...e, v]));
		setDraft('');
	}

	const checklist = [
		{ id: 'scene', label: 'A scene is staged', done: vaultFacts.scenes > 0, to: '/scenes' },
		{ id: 'party', label: 'The party is rostered', done: vaultFacts.pcs > 0, to: '/characters' },
		{ id: 'map', label: 'A map is in the atlas', done: vaultFacts.maps > 0, to: '/atlas' },
		{ id: 'notes', label: 'Session notes started', done: vaultFacts.notes > 0, to: '/knowledge' },
		{ id: 'live', label: 'Go live from Session', done: runtime.state.session.activeSceneId !== null, to: '/session' },
	];
	const tour = [
		{ id: 'tr1', title: 'This is your Command Center', body: 'The board of live-play widgets — session, combat, dice, maps. Everything you run at the table starts here.' },
		{ id: 'tr2', title: 'Press ⌘K to go anywhere', body: 'Search every entity in your vault — notes, maps, handouts, rolls — without leaving the table.' },
		{ id: 'tr3', title: 'Player-safe by design', body: 'Preview as any player from the top bar. DM-only content never renders for a player actor.' },
	];

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			skip();
			return;
		}
		if (e.key !== 'Tab') return;
		const panel = panelRef.current;
		if (!panel) return;
		const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="First-run setup"
			onKeyDown={onKeyDown}
			style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'var(--color-backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
		>
			<div
				ref={panelRef}
				tabIndex={-1}
				style={{ width: 880, maxWidth: '96vw', height: 560, maxHeight: '92vh', display: 'flex', background: T.raised, border: `1px solid ${T.bdS}`, borderRadius: 18, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', outline: 'none' }}
			>
				{/* step rail */}
				<div style={{ width: 248, flex: '0 0 248px', background: `linear-gradient(180deg, ${T.accSub}, ${T.surf})`, borderRight: `1px solid ${T.bd}`, padding: '24px 20px', display: 'flex', flexDirection: 'column' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 24 }}>
						<span style={{ width: 30, height: 30, borderRadius: 7, background: T.acc, color: T.accFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
							<Icon name="dice" size="sm" />
						</span>
						<div style={{ font: `700 15px ${T.disp}`, letterSpacing: '.02em' }}>
							DND<span style={{ color: T.acc }}>Tools</span>
						</div>
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }} aria-hidden="true">
						{ONB_STEPS.map((s, j) => {
							const done = j < i;
							const on = j === i;
							return (
								<div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9, background: on ? T.raised : 'transparent', border: `1px solid ${on ? T.accBd : 'transparent'}` }}>
									<span style={{ width: 24, height: 24, borderRadius: '50%', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done ? T.ok : on ? T.acc : T.alt, color: done || on ? T.accFg : T.ter }}>
										{done ? <Icon name="check" size={13} /> : <span style={{ font: `700 11px ${T.mono}` }}>{j + 1}</span>}
									</span>
									<span style={{ font: `${on ? 600 : 500} 13px ${T.sans}`, color: on ? T.ink : T.sub }}>{s.title}</span>
								</div>
							);
						})}
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 7, font: `11.5px ${T.sans}`, color: T.ter }}>
						<Icon name="recent" size={13} /> About 2 minutes to your first scene
					</div>
				</div>

				{/* content */}
				<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
					<div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 16px 0' }}>
						<Button variant="ghost" size="sm" onClick={skip}>
							Skip setup
						</Button>
					</div>
					<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 36px 24px' }}>
						{step.id === 'welcome' && (
							<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', height: '100%', gap: 16 }}>
								<span style={{ width: 60, height: 60, borderRadius: 16, background: T.acc, color: T.accFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
									<Icon name="sparkle" size="xl" />
								</span>
								<div>
									<h2 style={{ margin: 0, font: `700 28px ${T.disp}`, letterSpacing: '-.01em' }}>Run a better table.</h2>
									<p style={{ margin: '8px 0 0', font: `14px/1.6 ${T.sans}`, color: T.sub, maxWidth: 440 }}>
										DND Tools is a candle-lit command center for live play — combat, dice, maps, party vitals and what your players see, all in one spatial board. Let's get yours set up.
									</p>
								</div>
								<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
									{['Any system — D&D 5e, narrative, or your own', 'Local-first, sync when you want', 'Player-safe by design'].map((t) => (
										<span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 20, background: T.surf, border: `1px solid ${T.bd}`, font: `12px ${T.sans}`, color: T.sub }}>
											<Icon name="check" size={13} color={T.acc} />
											{t}
										</span>
									))}
								</div>
							</div>
						)}
						{step.id === 'vault' && (
							<div style={{ paddingTop: 14 }} role="radiogroup" aria-label="Vault choice">
								<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>Where should your world live?</h2>
								<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
									Your vault lives on this device — every note, map, and character. The sample campaign is already loaded so nothing starts empty.
								</p>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
									<ChoiceCard
										on={vault === 'sample'}
										icon="scene"
										title="Keep the sample campaign"
										badge="Recommended"
										desc={`Explore with a table already set: ${vaultFacts.scenes} scenes · ${vaultFacts.pcs} PCs · ${vaultFacts.npcs} NPCs · ${vaultFacts.maps} ${vaultFacts.maps === 1 ? 'map' : 'maps'} · ${vaultFacts.notes} notes. Everything is editable or deletable later.`}
										onPick={() => setVault('sample')}
									/>
									<ChoiceCard
										on={vault === 'fresh'}
										icon="add"
										title="Start fresh"
										desc="Clears the sample campaign from this device and boots an empty vault. Your own campaign from a blank page."
										onPick={() => setVault('fresh')}
									/>
								</div>
								<p style={{ margin: '14px 0 0', font: `12px ${T.sans}`, color: T.ter, display: 'flex', alignItems: 'center', gap: 7 }}>
									<Icon name="import" size={13} /> Importing from Obsidian, Google Docs or a Roll20 export lives in Settings → Vault connections.
								</p>
							</div>
						)}
						{step.id === 'experience' && (
							<div style={{ paddingTop: 14 }} role="radiogroup" aria-label="Experience complexity">
								<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>How much do you want on screen?</h2>
								<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
									You can change this any time in Settings. It only affects how much is revealed — never what you can do.
								</p>
								<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
									{(ACCT.complexity.levels as any[]).map((l) => {
										const levelTier = LEVEL_TO_TIER[l.id] ?? DEFAULT_FEATURE_TIER;
										const on = levelTier === tier;
										const reveals = visibleFeatures(levelTier).map((f) => f.label);
										return (
											<button
												key={l.id}
												type="button"
												role="radio"
												aria-checked={on}
												onClick={() => setTier(levelTier)}
												style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 9, padding: 14, borderRadius: 12, cursor: 'pointer', border: `1px solid ${on ? T.accBd : T.bd}`, background: on ? T.accSub : T.surf, boxShadow: on ? T.smd : 'none' }}
											>
												<span style={{ width: 32, height: 32, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? T.acc : T.alt, color: on ? T.accFg : T.acc }}>
													<Icon name={l.icon} size="sm" />
												</span>
												<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
													<span style={{ font: `700 14px ${T.disp}`, color: on ? T.acc : T.ink }}>{l.name}</span>
													{l.rec && !on && <Badge status="neutral">Recommended</Badge>}
												</span>
												<span style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>{l.blurb}</span>
												<span style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
													{reveals.slice(0, 4).map((r) => (
														<span key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, font: `11px ${T.sans}`, color: T.ter }}>
															<Icon name="check" size={12} color={on ? T.acc : T.ter} />
															{r}
														</span>
													))}
												</span>
											</button>
										);
									})}
								</div>
							</div>
						)}
						{step.id === 'players' && (
							<div style={{ paddingTop: 14 }}>
								<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>Bring your party.</h2>
								<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
									Note who's at your table — optional, you can run solo prep first. Invites stay on this device: the local-first build has no mail transport, so nothing is sent.
								</p>
								<div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
									<Input
										value={draft}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
										onKeyDown={(e: React.KeyboardEvent) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												addEmail();
											}
										}}
										placeholder="player@email.com"
										aria-label="Player email"
										style={{ flex: 1 }}
									/>
									<Button variant="secondary" icon="add" onClick={addEmail}>
										Add
									</Button>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
									{emails.map((e, j) => (
										<div key={e} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 10, background: T.surf, border: `1px solid ${T.bd}` }}>
											<Avatar name={e.split('@')[0]} size="sm" />
											<span style={{ flex: 1, font: `12.5px ${T.sans}` }}>{e}</span>
											<Badge status="info">Device-local</Badge>
											<IconButton icon="close" label={`Remove ${e}`} variant="ghost" size="sm" onClick={() => setEmails((arr) => arr.filter((_, k) => k !== j))} />
										</div>
									))}
									{emails.length === 0 && <div style={{ font: `12.5px ${T.sans}`, color: T.ter, padding: '10px 0' }}>No invites yet — that's fine, you can run solo prep first.</div>}
								</div>
							</div>
						)}
						{step.id === 'ready' && (
							<div style={{ paddingTop: 14 }}>
								<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>You're ready to run.</h2>
								<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
									Your table-readiness checklist, read live from the vault — jump to any unfinished item.
								</p>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
										{checklist.map((c) => (
											<button
												key={c.id}
												type="button"
												onClick={() => {
													writeStorage(ONBOARDED_KEY, 'done');
													setOpen(false);
													navigate(c.to);
												}}
												style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: T.surf, border: `1px solid ${c.done ? T.bd : T.accBd}`, cursor: 'pointer', textAlign: 'left' }}
											>
												<span style={{ width: 20, height: 20, borderRadius: '50%', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: c.done ? T.ok : 'transparent', border: `1.5px solid ${c.done ? T.ok : T.bdS}`, color: T.accFg }}>
													{c.done && <Icon name="check" size={12} />}
												</span>
												<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: c.done ? T.ter : T.ink, textDecoration: c.done ? 'line-through' : 'none' }}>{c.label}</span>
												<Icon name="chevron-right" size={13} color={T.ter} />
											</button>
										))}
									</div>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
										{tour.map((t) => (
											<div key={t.id} style={{ padding: 12, borderRadius: 10, background: T.accSub, border: `1px solid ${T.accBd}` }}>
												<div style={{ font: `600 12.5px ${T.sans}`, color: T.acc, marginBottom: 3 }}>{t.title}</div>
												<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>{t.body}</div>
											</div>
										))}
									</div>
								</div>
							</div>
						)}
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderTop: `1px solid ${T.bd}` }}>
						{i > 0 && (
							<Button variant="ghost" onClick={back} icon="chevron-left">
								Back
							</Button>
						)}
						<div style={{ flex: 1 }} />
						<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
							Step {i + 1} of {ONB_STEPS.length}
						</span>
						{i < ONB_STEPS.length - 1 ? (
							<Button variant="primary" icon="chevron-right" onClick={next}>
								{step.id === 'welcome' ? 'Get started' : 'Continue'}
							</Button>
						) : (
							<Button variant="primary" icon="check" onClick={() => void finish()} disabled={wiping}>
								{wiping ? 'Clearing vault…' : vault === 'fresh' ? 'Clear sample & start fresh' : 'Enter Command Center'}
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
