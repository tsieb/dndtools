import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUILT_IN_SYSTEM_PACKAGES, type FeatureTier, type VaultPrivacyMode } from '@dndtools/core';
import { Button, Input } from '../ds';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { registerBackHandler } from '../platform/backNavigation';
import { listLocalVaults, renameLocalVault } from '../platform/storage/coreStore';
import { PREFERENCE_KEYS, readPreference, removePreference } from '../platform/preferences';
import { recordNewVaultPrivacyMode, storedVaultPrivacyMode } from '../cloud/vaultMode';
import { setDocAttr } from '../screens/settings/shared';
import { T } from './screen-kit';
import { useViewport } from './useViewport';
import {
	FOCUSABLE,
	ONBOARDED_KEY,
	ONB_STEPS,
	PRIVACY_ACK_PHRASE,
	REPLAY_EVENT,
	TIER_ATTR,
	TIER_KEY,
	readStorage,
	readStoredTier,
	writeStorage,
} from './onboarding/shared';
import { ExperienceStep, TIER_NAMES } from './onboarding/steps/ExperienceStep';

export {
	ONBOARDED_KEY,
	PRIVACY_ACK_PHRASE,
	REPLAY_EVENT,
	VAULT_CHOICE_KEY,
} from './onboarding/shared';

/** Three steps to a named, empty campaign. Replay changes presentation, never vault privacy. */
export function Onboarding() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const navigate = useNavigate();
	const isPhone = useViewport() === 'phone';
	const [open, setOpen] = useState(() => readStorage(ONBOARDED_KEY) === null);
	const [step, setStep] = useState(0);
	const [name, setName] = useState('');
	const [system, setSystem] = useState(runtime.state.systems.activePackageId);
	const [tier, setTier] = useState<FeatureTier>(readStoredTier);
	const [privacy, setPrivacy] = useState<VaultPrivacyMode | null>(null);
	const [ack, setAck] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const panel = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const saving = useRef(false);
	const completed = useRef(false);
	const isNew = readPreference(PREFERENCE_KEYS.onboardingCampaign) === 'pending';
	const existingMode = storedVaultPrivacyMode();
	const chooseMode = isNew && existingMode === null && tier === 'advanced';
	const mode =
		existingMode ?? (isNew && tier !== 'advanced' ? 'cloud-enhanced' : (privacy ?? 'private-e2ee'));
	const ackOk = ack.trim().toLowerCase() === PRIVACY_ACK_PHRASE;
	const waiting =
		step === 0 && !name.trim()
			? t('onboarding.v3.waitName')
			: step === 1 && chooseMode && !privacy
				? t('onboarding.v3.waitMode')
				: step === 1 && chooseMode && privacy === 'private-e2ee' && !ackOk
					? t('onboarding.v3.waitAck', { phrase: PRIVACY_ACK_PHRASE })
					: '';

	useEffect(() => {
		const replay = () => {
			setStep(0);
			setName('');
			setSystem(runtime.state.systems.activePackageId);
			setTier(readStoredTier());
			setPrivacy(null);
			setAck('');
			setError('');
			setOpen(true);
		};
		window.addEventListener(REPLAY_EVENT, replay);
		return () => window.removeEventListener(REPLAY_EVENT, replay);
	}, [runtime]);
	useEffect(() => {
		if (open) content.current?.focus();
	}, [open, step]);
	// Finish after the overlay has unmounted, so its focus trap cannot recapture focus.
	useEffect(() => {
		if (open || !completed.current) return;
		completed.current = false;
		const frame = requestAnimationFrame(() =>
			document.querySelector<HTMLElement>('#main-content')?.focus(),
		);
		return () => cancelAnimationFrame(frame);
	}, [open]);

	const finish = useCallback(
		async (skipped = false, destination = '/') => {
			if (saving.current) return;
			if (
				!skipped &&
				(!name.trim() || (chooseMode && (!privacy || (privacy === 'private-e2ee' && !ackOk))))
			)
				return;
			saving.current = true;
			setBusy(true);
			setError('');
			try {
				const currentName =
					listLocalVaults().find((v) => v.id === runtime.vaultId)?.name || 'Your campaign';
				const campaignName = skipped ? currentName : name.trim();
				const result = await runtime.dispatch({
					type: 'system.select',
					actorId: runtime.defaultActorId,
					payload: { packageId: skipped ? runtime.state.systems.activePackageId : system },
				});
				if (result.status !== 'accepted')
					throw new Error(result.rejection?.message ?? t('onboarding.v3.systemFailed'));
				renameLocalVault(runtime.vaultId, campaignName);
				window.dispatchEvent(new Event('dndtools:local-vault-renamed'));
				if (isNew && !(skipped && tier === 'advanced')) recordNewVaultPrivacyMode(mode);
				setDocAttr(TIER_ATTR, TIER_KEY, tier);
				writeStorage(ONBOARDED_KEY, skipped ? 'skipped' : 'done');
				removePreference(PREFERENCE_KEYS.onboardingCampaign);
				navigate(destination);
				completed.current = true;
				setOpen(false);
			} catch (e) {
				setError(e instanceof Error ? e.message : t('onboarding.v3.saveFailed'));
			} finally {
				saving.current = false;
				setBusy(false);
			}
		},
		[runtime, name, system, tier, isNew, mode, chooseMode, privacy, ackOk, navigate, t],
	);
	useEffect(() => {
		if (!open) return;
		return registerBackHandler('overlay', () => {
			void finish(true);
			return true;
		});
	}, [open, finish]);

	if (!open) return null;
	const settingsLink = (
		<a
			href="#/settings?tab=sync"
			onClick={(event) => {
				event.preventDefault();
				void finish(step !== 2, '/settings?tab=sync');
			}}
		>
			{t('onboarding.v3.settings')}
		</a>
	);
	return (
		<div
			className="app-fixed-viewport"
			data-fullscreen-overlay="onboarding"
			role="dialog"
			aria-modal="true"
			aria-label={t('onboarding.dialogLabel')}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					void finish(true);
				}
				if (event.key !== 'Tab') return;
				const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
				const first = items[0],
					last = items[items.length - 1];
				if (
					event.shiftKey &&
					(document.activeElement === first || document.activeElement === content.current)
				) {
					event.preventDefault();
					last?.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first?.focus();
				}
			}}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 400,
				background: 'var(--color-backdrop)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: isPhone ? T.space.two : T.space.six,
			}}
		>
			<div
				ref={panel}
				style={{
					width: 760,
					maxWidth: '100%',
					height: isPhone ? '100%' : 560,
					maxHeight: '100%',
					background: T.raised,
					color: T.ink,
					border: `1px solid ${T.bd}`,
					borderRadius: T.radius.lg,
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden',
					font: `14px/1.5 ${T.sans}`,
				}}
			>
				<header
					style={{
						padding: `${T.space.four} ${T.space.six}`,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						flexShrink: 0,
					}}
				>
					<span>{t('onboarding.v3.progress', { current: step + 1, total: ONB_STEPS.length })}</span>
					<Button variant="ghost" disabled={busy} onClick={() => void finish(true)}>
						{t('onboarding.skip')}
					</Button>
				</header>
				<div
					ref={content}
					tabIndex={-1}
					aria-labelledby="onboarding-heading"
					data-onboarding-content
					style={{
						flex: 1,
						minHeight: 0,
						padding: `${T.space.zero} ${T.space.six}`,
						// The 560px desktop panel fits its content; shorter windows scroll here, never clip.
						overflowY: 'auto',
						outline: 'none',
					}}
				>
					<h1
						id="onboarding-heading"
						style={{
							font: `700 26px ${T.disp}`,
							margin: `${T.space.zero} ${T.space.zero} ${T.space.four}`,
						}}
					>
						{t(ONB_STEPS[step].title)}
					</h1>
					{step === 0 && (
						<>
							<p>{t('onboarding.v3.intro')}</p>
							<label htmlFor="campaign-name">{t('onboarding.v3.name')}</label>
							<Input
								id="campaign-name"
								value={name}
								required
								maxLength={80}
								placeholder={t('onboarding.v3.nameExample')}
								onChange={(e) => setName(e.target.value)}
								style={{ width: '100%', marginBottom: T.space.four }}
							/>
							<label htmlFor="campaign-system" style={{ display: 'block' }}>
								{t('onboarding.v3.system')}
							</label>
							<select
								id="campaign-system"
								value={system}
								onChange={(e) => setSystem(e.target.value)}
								style={{
									width: '100%',
									minHeight: 44,
									background: T.surf,
									color: T.ink,
									border: `1px solid ${T.bd}`,
									borderRadius: T.radius.md,
									padding: T.space.two,
								}}
							>
								{BUILT_IN_SYSTEM_PACKAGES.map((pkg) => (
									<option key={pkg.id} value={pkg.id}>
										{pkg.displayName}
									</option>
								))}
							</select>
							{isNew && tier !== 'advanced' && (
								<p style={{ fontSize: 12 }}>
									{t('onboarding.v3.defaultStorage')} {t('onboarding.v3.cloudDisclosure')}{' '}
									{t('onboarding.v3.manage')} {settingsLink}.
								</p>
							)}
						</>
					)}
					{step === 1 && (
						<>
							<ExperienceStep isDesktop={!isPhone} tier={tier} setTier={setTier} />
							{chooseMode && (
								<fieldset
									style={{
										margin: `${T.space.four} ${T.space.zero} ${T.space.zero}`,
										padding: `${T.space.two} ${T.space.three}`,
										border: `1px solid ${T.bd}`,
										borderRadius: T.radius.md,
									}}
								>
									<legend>{t('onboarding.v3.chooseStorage')}</legend>
									<div style={{ display: 'flex', gap: T.space.four, flexWrap: 'wrap' }}>
										<label>
											<input
												type="radio"
												name="storage"
												checked={privacy === 'private-e2ee'}
												onChange={() => setPrivacy('private-e2ee')}
											/>{' '}
											{t('onboarding.v3.private')}
										</label>
										<label>
											<input
												type="radio"
												name="storage"
												checked={privacy === 'cloud-enhanced'}
												onChange={() => setPrivacy('cloud-enhanced')}
											/>{' '}
											{t('onboarding.v3.cloud')}
										</label>
									</div>
									{privacy === 'cloud-enhanced' && (
										<p style={{ marginBottom: T.space.zero }}>
											{t('onboarding.v3.cloudDisclosure')}
										</p>
									)}
									{privacy === 'private-e2ee' && (
										<>
											<p style={{ margin: `${T.space.two} ${T.space.zero}` }}>
												{t('onboarding.v3.recovery')}
											</p>
											<label htmlFor="privacy-ack">
												{t('onboarding.v3.ack', { phrase: PRIVACY_ACK_PHRASE })}
											</label>
											<Input
												id="privacy-ack"
												value={ack}
												onChange={(e) => setAck(e.target.value)}
												aria-invalid={ack.length > 0 && !ackOk}
												aria-describedby="onboarding-waiting"
												style={{ width: '100%' }}
											/>
											{ack.length > 0 && !ackOk && (
												<div role="alert">
													{t('onboarding.v3.mismatch', { phrase: PRIVACY_ACK_PHRASE })}
												</div>
											)}
										</>
									)}
								</fieldset>
							)}
						</>
					)}
					{step === 2 && (
						<p>
							{t('onboarding.v3.summary', { name: name.trim(), tier: t(TIER_NAMES[tier]) })}{' '}
							{mode === 'cloud-enhanced' ? (
								<>
									{t('onboarding.v3.cloudSummary')} {t('onboarding.v3.cloudDisclosure')}
								</>
							) : (
								t('onboarding.v3.privateSummary')
							)}{' '}
							{t('onboarding.v3.manage')} {settingsLink}.
						</p>
					)}
				</div>
				<footer
					style={{ padding: `${T.space.three} ${T.space.six} ${T.space.five}`, flexShrink: 0 }}
				>
					<div
						id="onboarding-waiting"
						aria-live="polite"
						style={{ minHeight: 21, marginBottom: T.space.two }}
					>
						{error || waiting}
					</div>
					<div style={{ display: 'flex', justifyContent: 'space-between', gap: T.space.three }}>
						{step > 0 ? (
							<Button variant="ghost" disabled={busy} onClick={() => setStep(step - 1)}>
								{t('common.action.back')}
							</Button>
						) : (
							<span />
						)}
						<Button
							variant="primary"
							disabled={busy || !!waiting}
							aria-describedby={waiting || error ? 'onboarding-waiting' : undefined}
							onClick={() => (step < 2 ? setStep(step + 1) : void finish())}
						>
							{busy
								? t('onboarding.v3.saving')
								: step === 2
									? t('onboarding.v3.open')
									: t('onboarding.continue')}
						</Button>
					</div>
				</footer>
			</div>
		</div>
	);
}
