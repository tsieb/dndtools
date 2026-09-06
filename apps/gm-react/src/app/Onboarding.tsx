import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	listCharactersForActor,
	listMapsForActor,
	listScenesForActor,
	getContentItemsForActor,
	type FeatureTier,
	type VaultPrivacyMode,
} from '@dndtools/core';
import { Button, Toaster } from '../ds';
import { useI18n, type MessageKey } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { registerBackHandler } from '../platform/backNavigation';
import { resetCoreStorage } from '../platform/storage/coreStore';
import { setVaultPrivacyMode, storedVaultPrivacyMode } from '../cloud/vaultMode';
import { T } from './screen-kit';
import { useViewport } from './useViewport';
import {
	getAiUsagePreference,
	saveAiUsagePreference,
	type AiUsagePreference,
} from '../ai/usagePreference';
import {
	FOCUSABLE,
	INVITES_KEY,
	MAX_PARTY_NOTES,
	MAX_PARTY_NOTE_CHARS,
	ONBOARDED_KEY,
	ONB_STEPS,
	PRIVACY_ACK_PHRASE,
	PRIVACY_STEP_INDEX,
	REPLAY_EVENT,
	TIER_ATTR,
	TIER_KEY,
	VAULT_CHOICE_KEY,
	readStorage,
	readStoredPartyNotes,
	readStoredTier,
	reloadAtRoute,
	removeStorage,
	writeStorage,
} from './onboarding/shared';
import { StepRail } from './onboarding/StepRail';
import { WelcomeStep } from './onboarding/steps/WelcomeStep';
import { VaultStep } from './onboarding/steps/VaultStep';
import { PrivacyStep } from './onboarding/steps/PrivacyStep';
import { ExperienceStep } from './onboarding/steps/ExperienceStep';
import { ToolsStep } from './onboarding/steps/ToolsStep';
import { PlayersStep } from './onboarding/steps/PlayersStep';
import { ReadyStep } from './onboarding/steps/ReadyStep';

// Settings imports these two by name; they live with the rest of the wizard's storage contract in
// ./onboarding/shared and are re-exported here so that import keeps working.
export {
	ONBOARDED_KEY,
	PRIVACY_ACK_PHRASE,
	REPLAY_EVENT,
	VAULT_CHOICE_KEY,
} from './onboarding/shared';

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

export function Onboarding() {
	const runtime = useRuntime();
	const { t } = useI18n();
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
			// The user explicitly chose to clear the sample campaign: wipe, then record the choice so
			// the post-reload `load()` skips re-seeding, then reboot into the empty vault.
			//
			// The order matters and used to be the other way round, over a bare `catch {}` and an
			// UNCONDITIONAL reload. So a failed wipe told the user they had started fresh, reloaded them
			// into the fully intact sample campaign, and left `VAULT_CHOICE_KEY` set to 'fresh' — which
			// suppresses the seed on every subsequent boot, permanently and silently. Writing the key
			// only once the wipe has actually resolved makes the failure recoverable, and the user is
			// told rather than lied to.
			setWiping(true);
			try {
				await resetCoreStorage();
			} catch {
				setWiping(false);
				Toaster.error('The sample campaign could not be cleared — nothing was changed. Try again.');
				return;
			}
			writeStorage(VAULT_CHOICE_KEY, 'fresh');
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

	const checklist: Array<{
		id: string;
		label: MessageKey;
		done: boolean;
		to: string;
		dest: MessageKey;
	}> = [
		{
			id: 'scene',
			label: 'onboarding.ready.sceneStaged',
			done: vaultFacts.scenes > 0,
			to: '/scenes',
			dest: 'nav.scenes',
		},
		{
			id: 'party',
			label: 'onboarding.ready.partyRostered',
			done: vaultFacts.pcs > 0,
			to: '/characters',
			dest: 'nav.characters',
		},
		{
			id: 'map',
			label: 'onboarding.ready.mapInAtlas',
			done: vaultFacts.maps > 0,
			to: '/atlas',
			dest: 'nav.atlas',
		},
		{
			id: 'notes',
			label: 'onboarding.ready.notesStarted',
			done: vaultFacts.notes > 0,
			to: '/knowledge',
			dest: 'nav.knowledge',
		},
		{
			id: 'live',
			label: 'onboarding.ready.goLive',
			done: runtime.state.session.activeSceneId !== null,
			to: '/session',
			dest: 'nav.session',
		},
	];
	const tour: Array<{ id: string; title: MessageKey; body: MessageKey }> = [
		{
			id: 'tr1',
			title: 'onboarding.ready.tourBoardTitle',
			body: 'onboarding.ready.tourBoardBody',
		},
		{
			id: 'tr2',
			title: 'onboarding.ready.tourPaletteTitle',
			body: 'onboarding.ready.tourPaletteBody',
		},
		{
			id: 'tr3',
			title: 'onboarding.ready.tourPlayerSafeTitle',
			body: 'onboarding.ready.tourPlayerSafeBody',
		},
	];

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			// Escape is bound on the panel, so it also fires from inside the party-name field and the
			// E2EE acknowledgement field — where the browser convention is "revert/leave this field",
			// not "abandon the whole wizard". Skipping there threw away everything the DM had typed.
			// Same typing guard AppShell.tsx:66-73 uses for its global shortcuts.
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
			aria-label={t('onboarding.dialogLabel')}
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
				<StepRail i={i} isPhone={isPhone} step={step} />
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
							{t('onboarding.skip')}
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
						{step.id === 'welcome' && <WelcomeStep />}
						{step.id === 'vault' && (
							<VaultStep
								vault={vault}
								setVault={setVault}
								vaultFacts={vaultFacts}
								vaultEmpty={vaultEmpty}
							/>
						)}
						{step.id === 'privacy' && (
							<PrivacyStep
								privacy={privacy}
								setPrivacy={setPrivacy}
								ack={ack}
								setAck={setAck}
								ackOk={ackOk}
								ackErrorId={ackErrorId}
							/>
						)}
						{step.id === 'experience' && (
							<ExperienceStep isDesktop={isDesktop} tier={tier} setTier={setTier} />
						)}
						{step.id === 'tools' && <ToolsStep aiUsage={aiUsage} setAiUsage={setAiUsage} />}
						{step.id === 'players' && (
							<PlayersStep
								emails={emails}
								setEmails={setEmails}
								draft={draft}
								setDraft={setDraft}
								addEmail={addEmail}
							/>
						)}
						{step.id === 'ready' && (
							<ReadyStep
								isDesktop={isDesktop}
								vault={vault}
								wiping={wiping}
								checklist={checklist}
								tour={tour}
								finish={finish}
							/>
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
								{t('common.action.back')}
							</Button>
						)}
						<div style={{ flex: 1 }} />
						<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
							{t('onboarding.stepCounter', { current: i + 1, total: ONB_STEPS.length })}
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
											? t('onboarding.blockedNoPrivacy')
											: t('onboarding.blockedNoAck', { phrase: PRIVACY_ACK_PHRASE })
										: undefined
								}
							>
								{step.id === 'welcome'
									? t('onboarding.getStarted')
									: step.id === 'privacy' && privacy === null
										? t('onboarding.chooseToContinue')
										: t('onboarding.continue')}
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
										? t('onboarding.clearingVault')
										: t('onboarding.restoringSample')
									: vault === 'fresh'
										? t('onboarding.clearAndStartFresh')
										: t('onboarding.enterCommandCenter')}
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
