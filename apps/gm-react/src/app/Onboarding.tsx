import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	DEFAULT_FEATURE_TIER,
	listCharactersForActor,
	listMapsForActor,
	listScenesForActor,
	getContentItemsForActor,
	visibleFeatures,
	type FeatureTier,
	type VaultPrivacyMode,
} from '@dndtools/core';
import { Avatar, Badge, Button, Icon, IconButton, Input, Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { registerBackHandler } from '../platform/backNavigation';
import { resetCoreStorage } from '../platform/storage/coreStore';
import { setVaultPrivacyMode, storedVaultPrivacyMode } from '../cloud/vaultMode';
import { T, radioGroupKeyDown } from './screen-kit';
import { useViewport } from './useViewport';
import {
	getAiUsagePreference,
	saveAiUsagePreference,
	type AiUsagePreference,
} from '../ai/usagePreference';

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
 *   • PLAYERS — optional party notes are DEVICE-LOCAL (persisted to localStorage). No invitation is
 *     implied or sent from onboarding; real account-backed invites live in Settings.
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
const MAX_PARTY_NOTES = 20;
const MAX_PARTY_NOTE_CHARS = 120;
// Mirrors Settings' complexity mapping — design vocabulary level → real core FeatureTier.
const LEVEL_TO_TIER: Record<string, FeatureTier> = {
	beginner: 'core',
	standard: 'intermediate',
	expert: 'advanced',
};

// The experience-step card copy (design vocabulary). Each card's REVEALS list stays live — read from
// the Core's `visibleFeatures()` for the mapped tier, never from static copy.
const COMPLEXITY_LEVELS = [
	{
		id: 'beginner',
		name: 'Beginner',
		icon: 'Sprout',
		rec: false,
		blurb:
			'The essentials only. Guided prompts, presets over fields, advanced panels hidden until you ask.',
	},
	{
		id: 'standard',
		name: 'Standard',
		icon: 'SlidersHorizontal',
		rec: true,
		blurb: 'The full table toolkit with sensible defaults. Most DMs live here.',
	},
	{
		id: 'expert',
		name: 'Expert',
		icon: 'Wrench',
		rec: false,
		blurb: 'All advanced controls, automation, permissions, extensions, and diagnostics.',
	},
] as const;

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

function removeStorage(key: string) {
	try {
		window.localStorage.removeItem(key);
	} catch {
		/* private mode — nothing was persisted anyway */
	}
}

/** Reload after a vault reset while preserving a HashRouter destination under both http(s) and file. */
function reloadAtRoute(route?: string) {
	if (route) {
		const next = new URL(window.location.href);
		next.hash = route;
		window.history.replaceState(null, '', next.href);
	}
	window.location.reload();
}

function readStoredTier(): FeatureTier {
	const value = readStorage(TIER_KEY);
	return value === 'core' || value === 'intermediate' || value === 'advanced'
		? value
		: DEFAULT_FEATURE_TIER;
}

function readStoredPartyNotes(): string[] {
	try {
		const value = JSON.parse(readStorage(INVITES_KEY) ?? '[]') as unknown;
		if (!Array.isArray(value)) return [];
		return value
			.filter((entry): entry is string => typeof entry === 'string')
			.map((entry) => entry.trim().slice(0, MAX_PARTY_NOTE_CHARS))
			.filter(Boolean)
			.slice(0, MAX_PARTY_NOTES);
	} catch {
		return [];
	}
}

/** ARIA radio-group contract: arrows move selection (selection follows focus), Tab skips the group. */

const ONB_STEPS = [
	{ id: 'welcome', title: 'Welcome', icon: 'sparkle' },
	{ id: 'vault', title: 'Your vault', icon: 'vault' },
	{ id: 'privacy', title: 'Privacy', icon: 'shield' },
	{ id: 'experience', title: 'Experience', icon: 'sliders' },
	{ id: 'tools', title: 'Tools', icon: 'sparkle' },
	{ id: 'players', title: 'Your party', icon: 'players' },
	{ id: 'ready', title: 'Ready', icon: 'flag' },
] as const;

const PRIVACY_STEP_INDEX = ONB_STEPS.findIndex((s) => s.id === 'privacy');
/** ADR-026 — the typed acknowledgment for choosing Private (E2EE), mirroring AccountDangerPanel. */
export const PRIVACY_ACK_PHRASE = 'i hold the keys';

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Radio-style choice card shared by the vault + privacy + experience steps. */
function ChoiceCard({
	on,
	icon,
	title,
	badge,
	desc,
	children,
	onPick,
	tabbable,
}: {
	on: boolean;
	icon: string;
	title: string;
	badge?: string;
	desc: string;
	children?: React.ReactNode;
	onPick: () => void;
	/** Override for an undefaulted group: with no selection, the first card must stay Tab-reachable. */
	tabbable?: boolean;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={on}
			tabIndex={(tabbable ?? on) ? 0 : -1}
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
				transition:
					'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
			}}
		>
			<span
				style={{
					width: 40,
					height: 40,
					borderRadius: 10,
					flex: '0 0 auto',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: on ? T.acc : T.alt,
					color: on ? T.accFg : T.acc,
				}}
			>
				<Icon name={icon} size="md" />
			</span>
			<span style={{ flex: 1, minWidth: 0 }}>
				<span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
					<span style={{ font: `600 14px ${T.sans}`, color: on ? T.acc : T.ink }}>{title}</span>
					{badge && <Badge status="neutral">{badge}</Badge>}
				</span>
				<span style={{ display: 'block', font: `12px/1.5 ${T.sans}`, color: T.sub, marginTop: 2 }}>
					{desc}
				</span>
				{children}
			</span>
			<span
				aria-hidden="true"
				style={{
					width: 20,
					height: 20,
					borderRadius: '50%',
					flex: '0 0 auto',
					border: `2px solid ${on ? T.acc : T.bdS}`,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					marginTop: 2,
				}}
			>
				{on && <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.acc }} />}
			</span>
		</button>
	);
}

export function Onboarding() {
	const runtime = useRuntime();
	const viewport = useViewport();
	const isPhone = viewport === 'phone';
	const isDesktop = viewport === 'desktop';
	const navigate = useNavigate();
	const [open, setOpen] = useState(() => readStorage(ONBOARDED_KEY) === null);
	const [i, setI] = useState(0);
	const [vault, setVault] = useState<'sample' | 'fresh'>('sample');
	// ADR-026 — the FORCED, undefaulted vault-privacy decision. null until the user explicitly picks;
	// a replayed setup prefills the previously recorded choice (it is a re-read, not a first consent).
	const [privacy, setPrivacy] = useState<VaultPrivacyMode | null>(() => storedVaultPrivacyMode());
	const [ack, setAck] = useState('');
	const [tier, setTier] = useState<FeatureTier>(readStoredTier);
	const [aiUsage, setAiUsage] = useState<AiUsagePreference>(getAiUsagePreference);
	const [emails, setEmails] = useState<string[]>(readStoredPartyNotes);
	const [draft, setDraft] = useState('');
	const [wiping, setWiping] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);

	// Settings' "Replay setup" clears the flag and fires this event so the overlay re-opens live.
	useEffect(() => {
		function onReplay() {
			setI(0);
			setVault(readStorage(VAULT_CHOICE_KEY) === 'fresh' ? 'fresh' : 'sample');
			setPrivacy(storedVaultPrivacyMode());
			setAck('');
			setTier(readStoredTier());
			setAiUsage(getAiUsagePreference());
			setEmails(readStoredPartyNotes());
			setDraft('');
			setOpen(true);
		}
		window.addEventListener(REPLAY_EVENT, onReplay);
		return () => window.removeEventListener(REPLAY_EVENT, onReplay);
	}, []);

	// Choosing Private (E2EE) is an irreversible-in-spirit trust choice with user-held recovery only,
	// so it requires the typed acknowledgment (the AccountDangerPanel consent pattern).
	const ackOk = privacy !== 'private-e2ee' || ack.trim().toLowerCase() === PRIVACY_ACK_PHRASE;
	const privacyDecided = privacy !== null && ackOk;
	const ackErrorId = useId();

	// Announce the current step without arming the nearby "Skip setup" action. The content region is
	// deliberately focused both on first open and after step changes; Tab then enters the controls.
	const contentRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (open) (contentRef.current ?? panelRef.current)?.focus();
	}, [open, i]);
	// ADR-026 — setup can only be dismissed once the forced decisions are made. The privacy step sits
	// after the vault step, so a decided privacy mode implies both forced steps were seen. Skip/Escape/
	// the platform back gesture all route here; until decided they REFUSE to dismiss and land the user
	// on the privacy step instead. Skipping never applies the destructive "start fresh" wipe — that
	// only ever runs from the explicitly labeled finish button.
	const skip = useCallback(() => {
		if (!privacyDecided) {
			setI(PRIVACY_STEP_INDEX);
			Toaster.info('Choose how your vault is stored first — this decision can’t be skipped.');
			return;
		}
		if (privacy) setVaultPrivacyMode(privacy);
		// Skipping ENDS setup, so every decision already made on the steps behind us must persist here
		// too — otherwise the tier, the AI preference and the noted players are silently discarded and
		// the user has no way to get back to them (setup only replays from Settings).
		document.documentElement.setAttribute(TIER_ATTR, tier);
		writeStorage(TIER_KEY, tier);
		saveAiUsagePreference(aiUsage);
		if (emails.length > 0) writeStorage(INVITES_KEY, JSON.stringify(emails));
		else removeStorage(INVITES_KEY);
		writeStorage(ONBOARDED_KEY, 'skipped');
		setOpen(false);
	}, [privacy, privacyDecided, tier, aiUsage, emails]);
	useEffect(() => {
		if (!open) return undefined;
		return registerBackHandler('overlay', () => {
			skip();
			return true;
		});
	}, [open, skip]);

	const actorId = runtime.defaultActorId;
	const vaultFacts = useMemo(() => {
		if (!open) return { scenes: 0, pcs: 0, npcs: 0, maps: 0, notes: 0 };
		const scenes = listScenesForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			actorId,
		).filter((s) => !s.isTemplate);
		const characters = listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
			actorId,
		);
		const maps = listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId);
		const notes = getContentItemsForActor(
			runtime.state.content,
			runtime.state.permissions,
			actorId,
		);
		const pcs = characters.filter((c) => c.kind === 'pc').length;
		return {
			scenes: scenes.length,
			pcs,
			npcs: characters.length - pcs,
			maps: maps.length,
			notes: notes.length,
		};
	}, [open, runtime.state, actorId]);
	// A replayed setup on a device that went fresh sees an EMPTY vault — the step copy must offer to
	// load the sample, not claim it "is already loaded" beside a card full of zeros.
	const vaultEmpty =
		vaultFacts.scenes + vaultFacts.pcs + vaultFacts.npcs + vaultFacts.maps + vaultFacts.notes === 0;

	if (!open) return null;

	const step = ONB_STEPS[i];
	const next = () => setI((x) => Math.min(ONB_STEPS.length - 1, x + 1));
	const back = () => setI((x) => Math.max(0, x - 1));

	// The SINGLE completion path — the ready-step checklist shortcuts route through here too (with
	// their destination), so the vault choice / tier / party notes are never silently discarded.
	async function finish(to?: string) {
		// The forced privacy decision persists on every completion path (ADR-026). The linear flow
		// cannot reach the later steps without it, but guard anyway — never write a null.
		if (privacy) setVaultPrivacyMode(privacy);
		// Apply the experience tier with the same one-source-of-truth convention Settings uses.
		document.documentElement.setAttribute(TIER_ATTR, tier);
		writeStorage(TIER_KEY, tier);
		saveAiUsagePreference(aiUsage);
		if (emails.length > 0) writeStorage(INVITES_KEY, JSON.stringify(emails));
		else removeStorage(INVITES_KEY);
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
			reloadAtRoute(to);
			return;
		}
		// Choosing the sample must UNDO a prior "start fresh" (a replayed setup would otherwise keep
		// suppressing the seed forever): clear the stored choice, and if this device HAD gone fresh,
		// reboot so load() re-seeds the sample campaign it just promised.
		const hadFresh = readStorage(VAULT_CHOICE_KEY) === 'fresh';
		removeStorage(VAULT_CHOICE_KEY);
		if (hadFresh) {
			setWiping(true);
			reloadAtRoute(to);
			return;
		}
		setOpen(false);
		if (to) navigate(to);
		Toaster.success('Setup complete — welcome to the table');
	}

	function addEmail() {
		const v = draft.trim();
		if (!v) return;
		if (v.length > MAX_PARTY_NOTE_CHARS) {
			Toaster.error(`Keep each player note under ${MAX_PARTY_NOTE_CHARS} characters.`);
			return;
		}
		if (emails.length >= MAX_PARTY_NOTES) {
			Toaster.error(`You can note up to ${MAX_PARTY_NOTES} players during setup.`);
			return;
		}
		setEmails((e) => (e.includes(v) ? e : [...e, v]));
		setDraft('');
	}

	const checklist = [
		{
			id: 'scene',
			label: 'A scene is staged',
			done: vaultFacts.scenes > 0,
			to: '/scenes',
			dest: 'Scenes',
		},
		{
			id: 'party',
			label: 'The party is rostered',
			done: vaultFacts.pcs > 0,
			to: '/characters',
			dest: 'Characters',
		},
		{
			id: 'map',
			label: 'A map is in the atlas',
			done: vaultFacts.maps > 0,
			to: '/atlas',
			dest: 'Atlas',
		},
		{
			id: 'notes',
			label: 'Session notes started',
			done: vaultFacts.notes > 0,
			to: '/knowledge',
			dest: 'Knowledge',
		},
		{
			id: 'live',
			label: 'Go live from Session',
			done: runtime.state.session.activeSceneId !== null,
			to: '/session',
			dest: 'Session',
		},
	];
	const tour = [
		{
			id: 'tr1',
			title: 'This is your Command Center',
			body: 'The board of live-play widgets — session, combat, dice, maps. Everything you run at the table starts here.',
		},
		{
			id: 'tr2',
			title: 'Press ⌘K to go anywhere',
			body: 'Search every entity in your vault — notes, maps, handouts, rolls — without leaving the table.',
		},
		{
			id: 'tr3',
			title: 'Player-safe by design',
			body: 'Preview as any player from the top bar. DM-only content stays hidden in that player’s view.',
		},
	];

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			// Escape is bound on the panel, so it also fires from inside the party-name field and the
			// E2EE acknowledgement field — where the browser convention is "revert/leave this field",
			// not "abandon the whole wizard". Skipping there threw away everything the DM had typed.
			// Same typing guard AppShell.tsx:1013-1018 uses for its global shortcuts.
			const el = e.target as HTMLElement | null;
			const typing =
				!!el &&
				(el.tagName === 'INPUT' ||
					el.tagName === 'TEXTAREA' ||
					el.tagName === 'SELECT' ||
					el.isContentEditable);
			if (typing) {
				// Leave the field so a second Escape still dismisses, and keep focus inside the modal.
				panelRef.current?.focus();
				return;
			}
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
			className="app-fixed-viewport"
			data-fullscreen-overlay="onboarding"
			role="dialog"
			aria-modal="true"
			aria-label="First-run setup"
			onKeyDown={onKeyDown}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 400,
				background: 'var(--color-backdrop)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: isPhone
					? 'max(8px, var(--safe-area-top, 0px)) max(8px, var(--safe-area-right, 0px)) max(8px, var(--safe-area-bottom, 0px)) max(8px, var(--safe-area-left, 0px))'
					: 'max(24px, var(--safe-area-top, 0px)) max(24px, var(--safe-area-right, 0px)) max(24px, var(--safe-area-bottom, 0px)) max(24px, var(--safe-area-left, 0px))',
			}}
		>
			<div
				ref={panelRef}
				tabIndex={-1}
				style={{
					width: 880,
					maxWidth: isPhone ? '100%' : '96vw',
					height: isPhone ? '100%' : 560,
					maxHeight: '100%',
					display: 'flex',
					flexDirection: isPhone ? 'column' : 'row',
					background: T.raised,
					border: `1px solid ${T.bdS}`,
					borderRadius: isPhone ? 12 : 18,
					boxShadow: 'var(--shadow-lg)',
					overflow: 'hidden',
					outline: 'none',
				}}
			>
				{/* step rail */}
				<div
					style={{
						width: isPhone ? '100%' : 248,
						flex: isPhone ? '0 0 auto' : '0 0 248px',
						background: `linear-gradient(180deg, ${T.accSub}, ${T.surf})`,
						borderRight: isPhone ? 'none' : `1px solid ${T.bd}`,
						borderBottom: isPhone ? `1px solid ${T.bd}` : 'none',
						padding: isPhone ? '12px 14px' : '24px 20px',
						display: 'flex',
						flexDirection: 'column',
					}}
				>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 9,
							marginBottom: isPhone ? 0 : 24,
						}}
					>
						<span
							style={{
								width: 30,
								height: 30,
								borderRadius: 7,
								background: T.acc,
								color: T.accFg,
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<Icon name="dice" size="sm" />
						</span>
						<div
							style={{
								font: `700 15px ${T.disp}`,
								letterSpacing: '.02em',
								flex: isPhone ? 1 : undefined,
							}}
						>
							DND <span style={{ color: T.acc }}>Tools</span>
						</div>
						{isPhone && (
							<span style={{ font: `600 12px ${T.sans}`, color: T.sub }}>
								{step.title} · {i + 1}/{ONB_STEPS.length}
							</span>
						)}
					</div>
					{!isPhone && (
						<div
							style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}
							aria-hidden="true"
						>
							{ONB_STEPS.map((s, j) => {
								const done = j < i;
								const on = j === i;
								return (
									<div
										key={s.id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 11,
											padding: '9px 10px',
											borderRadius: 9,
											background: on ? T.raised : 'transparent',
											border: `1px solid ${on ? T.accBd : 'transparent'}`,
										}}
									>
										<span
											style={{
												width: 24,
												height: 24,
												borderRadius: '50%',
												flex: '0 0 auto',
												display: 'inline-flex',
												alignItems: 'center',
												justifyContent: 'center',
												background: done ? T.ok : on ? T.acc : T.alt,
												color: done || on ? T.accFg : T.ter,
											}}
										>
											{done ? (
												<Icon name="check" size={13} />
											) : (
												<span style={{ font: `700 11px ${T.mono}` }}>{j + 1}</span>
											)}
										</span>
										<span
											style={{
												font: `${on ? 600 : 500} 13px ${T.sans}`,
												color: on ? T.ink : T.sub,
											}}
										>
											{s.title}
										</span>
									</div>
								);
							})}
						</div>
					)}
					{!isPhone && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 7,
								font: `11.5px ${T.sans}`,
								color: T.ter,
							}}
						>
							<Icon name="recent" size={13} /> About 2 minutes to your first scene
						</div>
					)}
				</div>

				{/* content */}
				<div
					style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}
				>
					<div
						style={{
							display: 'flex',
							justifyContent: 'flex-end',
							padding: isPhone ? '6px 8px 0' : '14px 16px 0',
						}}
					>
						<Button variant="ghost" size="sm" onClick={skip}>
							Skip setup
						</Button>
					</div>
					<div
						ref={contentRef}
						data-onboarding-content
						tabIndex={-1}
						style={{
							flex: 1,
							minHeight: 0,
							overflowY: 'auto',
							padding: isPhone ? '6px 16px 18px' : '8px 36px 24px',
							outline: 'none',
						}}
					>
						{step.id === 'welcome' && (
							<div
								style={{
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'flex-start',
									justifyContent: 'center',
									minHeight: '100%',
									gap: 16,
								}}
							>
								<span
									style={{
										width: 60,
										height: 60,
										borderRadius: 16,
										background: T.acc,
										color: T.accFg,
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
									}}
								>
									<Icon name="sparkle" size="xl" />
								</span>
								<div>
									<h2 style={{ margin: 0, font: `700 28px ${T.disp}`, letterSpacing: '-.01em' }}>
										Run a better table.
									</h2>
									<p
										style={{
											margin: '8px 0 0',
											font: `14px/1.6 ${T.sans}`,
											color: T.sub,
											maxWidth: 440,
										}}
									>
										DND Tools is a candle-lit command center for live play — combat, dice, maps,
										party vitals and what your players see, all in one spatial board. Let's get
										yours set up.
									</p>
								</div>
								<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
									{[
										'Any system — D&D 5e, narrative, or your own',
										'Local-first, cloud backup only when you choose',
										'Player-safe by design',
									].map((t) => (
										<span
											key={t}
											style={{
												display: 'inline-flex',
												alignItems: 'center',
												gap: 7,
												padding: '7px 11px',
												borderRadius: 20,
												background: T.surf,
												border: `1px solid ${T.bd}`,
												font: `12px ${T.sans}`,
												color: T.sub,
											}}
										>
											<Icon name="check" size={13} color={T.acc} />
											{t}
										</span>
									))}
								</div>
							</div>
						)}
						{step.id === 'vault' && (
							<div
								style={{ paddingTop: 14 }}
								role="radiogroup"
								aria-label="Vault choice"
								onKeyDown={radioGroupKeyDown}
							>
								<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
									Where should your world live?
								</h2>
								<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
									{vaultEmpty
										? 'Your vault lives on this device — every note, map, and character. This device started fresh, so the vault is currently empty.'
										: 'Your vault lives on this device — every note, map, and character. The sample campaign is already loaded so nothing starts empty.'}
								</p>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
									<ChoiceCard
										on={vault === 'sample'}
										icon="scene"
										title={vaultEmpty ? 'Load the sample campaign' : 'Keep the sample campaign'}
										badge="Recommended"
										desc={
											vaultEmpty
												? 'Loads the sample table — scenes, party, maps and notes — so you can explore with nothing starting empty. Everything is editable or deletable later.'
												: `Explore with a table already set: ${vaultFacts.scenes} scenes · ${vaultFacts.pcs} PCs · ${vaultFacts.npcs} NPCs · ${vaultFacts.maps} ${vaultFacts.maps === 1 ? 'map' : 'maps'} · ${vaultFacts.notes} notes. Everything is editable or deletable later.`
										}
										onPick={() => setVault('sample')}
									/>
									<ChoiceCard
										on={vault === 'fresh'}
										icon="add"
										title="Start fresh"
										desc={
											vaultEmpty
												? "Keeps this device's vault empty. Your own campaign from a blank page."
												: 'Clears the sample campaign from this device and boots an empty vault. Your own campaign from a blank page.'
										}
										onPick={() => setVault('fresh')}
									/>
								</div>
								<p
									style={{
										margin: '14px 0 0',
										font: `12px ${T.sans}`,
										color: T.ter,
										display: 'flex',
										alignItems: 'center',
										gap: 7,
									}}
								>
									<Icon name="import" size={13} /> Importing from Obsidian, Google Docs or a Roll20
									export lives in Settings → Vault connections.
								</p>
							</div>
						)}
						{step.id === 'privacy' && (
							<div style={{ paddingTop: 14 }}>
								<div
									role="radiogroup"
									aria-label="Vault privacy mode"
									onKeyDown={radioGroupKeyDown}
								>
									<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
										Who can read your world?
									</h2>
									<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
										This decides how your campaign is stored if you ever use cloud features. There
										is no preset — this choice is yours, and you can change it later in Settings →
										Sync.
									</p>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
										<ChoiceCard
											on={privacy === 'private-e2ee'}
											tabbable={privacy === 'private-e2ee' || privacy === null}
											icon="lock"
											title="Private vault (end-to-end encrypted)"
											desc="Your campaign is encrypted on your devices before anything leaves them, and only your devices hold the keys — the service can never read it. Server-powered features (campaign AI, cloud search, opening your campaign from any browser) will not be available to this vault."
											onPick={() => setPrivacy('private-e2ee')}
										/>
										<ChoiceCard
											on={privacy === 'cloud-enhanced'}
											tabbable={privacy === 'cloud-enhanced'}
											icon="unlock"
											title="Cloud-Enhanced vault"
											desc="Encrypted in transit and at rest with service-managed keys, and readable by the service to power upcoming features — campaign AI, cloud search, and access from any browser. Today your data is still end-to-end encrypted; this records your consent for when those features arrive."
											onPick={() => setPrivacy('cloud-enhanced')}
										/>
									</div>
								</div>
								{privacy === 'private-e2ee' && (
									<div
										style={{
											marginTop: 14,
											padding: 12,
											borderRadius: 10,
											background: T.surf,
											border: `1px solid ${T.bdS}`,
										}}
									>
										<div style={{ font: `600 12.5px ${T.sans}`, marginBottom: 4 }}>
											No one can recover this for you
										</div>
										<p style={{ margin: '0 0 10px', font: `12px/1.6 ${T.sans}`, color: T.sub }}>
											Cloud backups of a Private vault can only be opened with keys held on your
											devices. If you lose every device without exporting a recovery key (Settings →
											Sync), the cloud copy is gone for good — the service cannot reset or restore
											it. Type <strong style={{ color: T.ink }}>{PRIVACY_ACK_PHRASE}</strong> to
											confirm you understand.
										</p>
										{/* The field silently gated the whole wizard: a near-miss ("I hold the key")
										    produced no error, no invalid state and no hint that this was what
										    was blocking Continue (WCAG 3.3.1). */}
										<Input
											value={ack}
											onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAck(e.target.value)}
											placeholder={PRIVACY_ACK_PHRASE}
											aria-label={`Type "${PRIVACY_ACK_PHRASE}" to confirm`}
											aria-invalid={ack.trim() !== '' && !ackOk ? true : undefined}
											aria-describedby={ack.trim() !== '' && !ackOk ? ackErrorId : undefined}
											maxLength={PRIVACY_ACK_PHRASE.length}
											style={{ width: '100%' }}
										/>
										{ack.trim() !== '' && !ackOk && (
											<div
												id={ackErrorId}
												role="alert"
												style={{
													marginTop: 6,
													font: `12px ${T.sans}`,
													color: 'var(--color-status-error-text)',
												}}
											>
												That does not match — type “{PRIVACY_ACK_PHRASE}” exactly.
											</div>
										)}
									</div>
								)}
							</div>
						)}
						{step.id === 'experience' && (
							<div
								style={{ paddingTop: 14 }}
								role="radiogroup"
								aria-label="Experience complexity"
								onKeyDown={radioGroupKeyDown}
							>
								<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
									How much do you want on screen?
								</h2>
								<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
									You can change this any time in Settings. It only affects how much is revealed —
									never what you can do.
								</p>
								<div
									style={{
										display: 'grid',
										gridTemplateColumns: isDesktop ? 'repeat(3,minmax(0,1fr))' : '1fr',
										gap: 12,
									}}
								>
									{COMPLEXITY_LEVELS.map((l) => {
										const levelTier = LEVEL_TO_TIER[l.id] ?? DEFAULT_FEATURE_TIER;
										const on = levelTier === tier;
										const reveals = visibleFeatures(levelTier).map((f) => f.label);
										return (
											<button
												key={l.id}
												type="button"
												role="radio"
												aria-checked={on}
												tabIndex={on ? 0 : -1}
												onClick={() => setTier(levelTier)}
												style={{
													textAlign: 'left',
													display: 'flex',
													flexDirection: 'column',
													gap: 9,
													padding: 14,
													borderRadius: 12,
													cursor: 'pointer',
													border: `1px solid ${on ? T.accBd : T.bd}`,
													background: on ? T.accSub : T.surf,
													boxShadow: on ? T.smd : 'none',
												}}
											>
												<span
													style={{
														width: 32,
														height: 32,
														borderRadius: 9,
														display: 'inline-flex',
														alignItems: 'center',
														justifyContent: 'center',
														background: on ? T.acc : T.alt,
														color: on ? T.accFg : T.acc,
													}}
												>
													<Icon name={l.icon} size="sm" />
												</span>
												<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
													<span style={{ font: `700 14px ${T.disp}`, color: on ? T.acc : T.ink }}>
														{l.name}
													</span>
													{l.rec && !on && <Badge status="neutral">Recommended</Badge>}
												</span>
												<span style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>
													{l.blurb}
												</span>
												<span
													style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}
												>
													{reveals.slice(0, 4).map((r) => (
														<span
															key={r}
															style={{
																display: 'flex',
																alignItems: 'center',
																gap: 6,
																font: `11px ${T.sans}`,
																color: T.ter,
															}}
														>
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
						{step.id === 'tools' && (
							<div
								style={{ paddingTop: 14 }}
								role="radiogroup"
								aria-label="Optional tools"
								onKeyDown={radioGroupKeyDown}
							>
								<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
									Which optional tools do you want?
								</h2>
								<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
									Choose what belongs in your workspace. You can change this later only from
									Settings.
								</p>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
									<ChoiceCard
										on={aiUsage === 'complete'}
										icon="sparkle"
										title="Assistant and generators"
										desc="Show the optional campaign assistant and its setup, alongside built-in random generators."
										onPick={() => setAiUsage('complete')}
									/>
									<ChoiceCard
										on={aiUsage === 'generation-only'}
										icon="tool-generate"
										title="Generators only"
										desc="Keep DND Tools’ built-in offline generators, such as map generation. No assistant or model controls are shown."
										onPick={() => setAiUsage('generation-only')}
									/>
									<ChoiceCard
										on={aiUsage === 'none'}
										icon="close"
										title="None"
										badge="Private by default"
										desc="Keep all optional AI tools out of sight. No provider or assistant UI appears anywhere outside Settings."
										onPick={() => setAiUsage('none')}
									/>
								</div>
							</div>
						)}
						{step.id === 'players' && (
							<div style={{ paddingTop: 14 }}>
								<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>Bring your party.</h2>
								<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
									Optionally note who is at your table. These details stay on this device;
									onboarding does not send invitations.
								</p>
								<div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
									<Input
										value={draft}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
										onKeyDown={(e: React.KeyboardEvent) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												addEmail();
											}
										}}
										placeholder="Player name or email"
										aria-label="Player name or email"
										maxLength={MAX_PARTY_NOTE_CHARS}
										style={{ flex: 1, minWidth: 0 }}
									/>
									<Button variant="secondary" icon="add" onClick={addEmail}>
										Add
									</Button>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
									{emails.map((e, j) => (
										<div
											key={e}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 11,
												padding: '9px 12px',
												borderRadius: 10,
												background: T.surf,
												border: `1px solid ${T.bd}`,
											}}
										>
											<Avatar name={e.split('@')[0]} size="sm" />
											<span
												style={{
													flex: 1,
													minWidth: 0,
													font: `12.5px ${T.sans}`,
													overflowWrap: 'anywhere',
												}}
											>
												{e}
											</span>
											<span style={{ flex: '0 0 auto' }}>
												<Badge status="info">Saved on this device</Badge>
											</span>
											<IconButton
												icon="close"
												label={`Remove ${e}`}
												variant="ghost"
												size="sm"
												onClick={() => setEmails((arr) => arr.filter((_, k) => k !== j))}
											/>
										</div>
									))}
									{emails.length === 0 && (
										<div style={{ font: `12.5px ${T.sans}`, color: T.ter, padding: '10px 0' }}>
											No players noted yet — that is fine; you can start with solo prep.
										</div>
									)}
								</div>
							</div>
						)}
						{step.id === 'ready' && (
							<div style={{ paddingTop: 14 }}>
								<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
									You're ready to run.
								</h2>
								<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
									Your table-readiness checklist, read live from the vault — jump to any unfinished
									item.
								</p>
								{vault === 'fresh' && (
									// The checklist is derived from the SAMPLE vault, which finishing is about to erase —
									// saying so here stops the ticked rows from reading as a promise about what survives.
									<div
										style={{
											display: 'flex',
											gap: 9,
											alignItems: 'flex-start',
											padding: '10px 12px',
											borderRadius: 10,
											margin: '0 0 16px',
											background: 'var(--color-status-warning-subtle)',
											border: `1px solid var(--color-status-warning-border)`,
											font: `12.5px ${T.sans}`,
											color: 'var(--color-status-warning-text)',
										}}
									>
										<Icon name="warning" size={15} />
										<span>
											You chose to start fresh, so finishing setup clears the sample campaign. The
											items below describe the sample vault you are about to replace.
										</span>
									</div>
								)}
								<div
									style={{
										display: 'grid',
										gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr',
										gap: 16,
										alignItems: 'start',
									}}
								>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
										{checklist.map((c) => (
											<button
												key={c.id}
												type="button"
												disabled={wiping}
												// The row is a COMPLETION shortcut, not a plain link: it ends setup and, when
												// the user chose "start fresh", applies the sample wipe. "A map is in the
												// atlas" alone announces none of that, so name the consequence.
												aria-label={
													vault === 'fresh'
														? `${c.label} — clear the sample campaign, finish setup and open ${c.dest}`
														: `${c.label} — finish setup and open ${c.dest}`
												}
												onClick={() => void finish(c.to)}
												style={{
													display: 'flex',
													alignItems: 'center',
													gap: 10,
													padding: '10px 12px',
													borderRadius: 10,
													background: T.surf,
													border: `1px solid ${c.done ? T.bd : T.accBd}`,
													cursor: 'pointer',
													textAlign: 'left',
												}}
											>
												<span
													style={{
														width: 20,
														height: 20,
														borderRadius: '50%',
														flex: '0 0 auto',
														display: 'inline-flex',
														alignItems: 'center',
														justifyContent: 'center',
														background: c.done ? T.ok : 'transparent',
														border: `1.5px solid ${c.done ? T.ok : T.bdS}`,
														color: T.accFg,
													}}
												>
													{c.done && <Icon name="check" size={12} />}
												</span>
												<span
													style={{
														flex: 1,
														font: `12.5px ${T.sans}`,
														color: c.done ? T.ter : T.ink,
														textDecoration: c.done ? 'line-through' : 'none',
													}}
												>
													{c.label}
												</span>
												<Icon name="chevron-right" size={13} color={T.ter} />
											</button>
										))}
									</div>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
										{tour.map((t) => (
											<div
												key={t.id}
												style={{
													padding: 12,
													borderRadius: 10,
													background: T.accSub,
													border: `1px solid ${T.accBd}`,
												}}
											>
												<div
													style={{ font: `600 12.5px ${T.sans}`, color: T.acc, marginBottom: 3 }}
												>
													{t.title}
												</div>
												<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>{t.body}</div>
											</div>
										))}
									</div>
								</div>
							</div>
						)}
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							padding: isPhone ? '10px 12px' : '14px 24px',
							borderTop: `1px solid ${T.bd}`,
							flexWrap: 'wrap',
						}}
					>
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
							// Soft-disable: a HARD `disabled` took the button out of the tab order and
							// stripped its title, so a user who picked "Private (E2EE)" and mistyped the
							// acknowledgment phrase faced a plain grey "Continue" with no reachable reason,
							// on the one step of the wizard that cannot be skipped. `aria-disabled` keeps
							// the tab stop and the explanation, and DS Button still swallows the click.
							<Button
								variant="primary"
								icon="chevron-right"
								onClick={next}
								aria-disabled={(step.id === 'privacy' && !privacyDecided) || undefined}
								title={
									step.id === 'privacy' && !privacyDecided
										? privacy === null
											? 'Choose how this vault stores your campaign to continue'
											: `Type "${PRIVACY_ACK_PHRASE}" exactly to continue`
										: undefined
								}
							>
								{step.id === 'welcome'
									? 'Get started'
									: step.id === 'privacy' && privacy === null
										? 'Choose an option to continue'
										: 'Continue'}
							</Button>
						) : (
							<Button
								variant="primary"
								icon="check"
								onClick={() => void finish()}
								disabled={wiping}
							>
								{wiping
									? vault === 'fresh'
										? 'Clearing vault…'
										: 'Restoring sample…'
									: vault === 'fresh'
										? 'Clear sample & start fresh'
										: 'Enter Command Center'}
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
