import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommandResult, SystemPackage } from '@dndtools/core';
import { Badge, Button, IconButton, Stepper, Toaster } from '../../ds';
import { T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { registerBackHandler } from '../../platform/backNavigation';
import { isolateModalSiblings } from '../../platform/modalIsolation';
import {
	STEP_IDS,
	STEP_LABEL,
	buildPackage,
	draftFromPackage,
	firstBlockedStep,
	forkOriginId,
	validateDraft,
	type SystemDraft,
	type SystemStepId,
} from '../../app/systemBuilder/draft';
import { IdentityStep } from '../../app/systemBuilder/IdentityStep';
import { AttributesStep } from '../../app/systemBuilder/AttributesStep';
import { ResourcesStep } from '../../app/systemBuilder/ResourcesStep';
import { ConditionsStep } from '../../app/systemBuilder/ConditionsStep';
import { DiceStep } from '../../app/systemBuilder/DiceStep';
import { CreatureStep } from '../../app/systemBuilder/CreatureStep';
import { AdvancementStep } from '../../app/systemBuilder/AdvancementStep';
import { ReviewStep } from '../../app/systemBuilder/ReviewStep';
import { useI18n } from '../../i18n';

/**
 * The system builder (RC-SYS-3.3) — fork and edit a rules system, field by field.
 *
 * A full-screen overlay on the same contract as the widget builder and the map editor:
 * `role="dialog" aria-modal`, the rest of the app isolated from assistive tech while it is up, one
 * Tab cycle, Escape and the platform Back gesture both close it, focus returns to whatever opened
 * it.
 *
 * The draft lives in component state and touches nothing durable until Review saves it through the
 * real `system.define` / `system.update` commands — the same commands an imported package goes
 * through, so a system built here is not a special kind of package. It never activates: switching
 * the campaign's system is the picker's dry-run (RC-SYS-3.2), which is the only path that can tell
 * a DM what a switch would drop.
 */

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SystemBuilder({
	/** The DM-authored package being edited. A fork lands in the slice first, so there is always one. */
	editPackage,
	onClose,
}: {
	editPackage: SystemPackage;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const viewport = useViewport();
	const narrow = viewport !== 'desktop';
	const dmId = runtime.defaultActorId;
	const canWrite = runtime.state.permissions.actors[dmId]?.role === 'dm' && !runtime.preview;

	const [draft, setDraft] = useState<SystemDraft>(() => draftFromPackage(editPackage));
	const [step, setStep] = useState<SystemStepId>('identity');
	const [busy, setBusy] = useState(false);
	const [rejection, setRejection] = useState<string | null>(null);

	const rootRef = useRef<HTMLDivElement>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	const patch = useCallback(
		(next: Partial<SystemDraft>) => setDraft((current) => ({ ...current, ...next })),
		[],
	);

	const issues = useMemo(() => validateDraft(draft), [draft]);
	const stepIssues = useMemo(() => issues.filter((issue) => issue.step === step), [issues, step]);

	// A package already in the slice is UPDATED; one the DM deleted from under the builder is
	// DEFINED again. Either way the id is the draft's, never renamed — `system.update` rejects a
	// rename rather than quietly making a second package.
	const installed = runtime.state.systems.packages[draft.id];
	const mode: 'define' | 'update' = installed ? 'update' : 'define';
	const originName = useMemo(() => {
		const originId = forkOriginId(runtime.state.sync.operations, draft.id);
		if (!originId) return null;
		return runtime.state.systems.packages[originId]?.displayName ?? originId;
	}, [runtime.state.sync.operations, runtime.state.systems.packages, draft.id]);

	// Back gesture / hardware back closes the overlay, the layer the map editor registers on.
	useEffect(
		() =>
			registerBackHandler('fullscreen', () => {
				onCloseRef.current();
				return true;
			}),
		[],
	);

	// Dialog semantics: isolate the app behind the overlay, focus the shell, restore the opener.
	useEffect(() => {
		const opener = document.activeElement as HTMLElement | null;
		const root = rootRef.current;
		const restoreIsolation = root ? isolateModalSiblings(root) : () => {};
		root?.focus();
		return () => {
			restoreIsolation();
			opener?.focus?.();
		};
	}, []);

	// One Tab cycle inside the overlay (the app shell stays mounted underneath), plus Escape.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onCloseRef.current();
				return;
			}
			if (e.key !== 'Tab') return;
			const root = rootRef.current;
			if (!root) return;
			const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
				(node) => node.offsetParent !== null,
			);
			if (nodes.length === 0) {
				e.preventDefault();
				root.focus();
				return;
			}
			const first = nodes[0]!;
			const last = nodes[nodes.length - 1]!;
			const active = document.activeElement;
			if (e.shiftKey && (active === first || active === root)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			} else if (active instanceof HTMLElement && !root.contains(active)) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, []);

	const stepIndex = STEP_IDS.indexOf(step);
	const goToStep = (next: SystemStepId) => setStep(next);

	const submit = () => {
		if (busy || !canWrite) return;
		// Take the DM to the step that can fix the problem — unless that step is Review itself, which
		// is where they already are: bailing there would be a button that does nothing. In that case
		// dispatch anyway and let the core say why, which is the answer that counts.
		const blocked = firstBlockedStep(issues);
		if (blocked && blocked !== 'review') {
			goToStep(blocked);
			return;
		}
		setBusy(true);
		setRejection(null);
		const payload = buildPackage(draft);
		void runtime
			.dispatch({
				type: mode === 'update' ? 'system.update' : 'system.define',
				actorId: dmId,
				payload:
					mode === 'update' ? { packageId: payload.id, package: payload } : { package: payload },
			})
			.then((result: CommandResult) => {
				if (result.status === 'accepted') {
					Toaster.success(t('systemBuilder.saved', { name: payload.displayName }));
					onCloseRef.current();
					return;
				}
				const detail = (result.rejection.issues ?? [])
					.map((issue) => `${issue.path}: ${issue.message}`)
					.join(' · ');
				setRejection(detail ? `${result.rejection.message} ${detail}` : result.rejection.message);
			})
			.catch((error: unknown) =>
				setRejection(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};

	const stepProps = { draft, patch, issues: stepIssues, t };
	const stepBody =
		step === 'identity' ? (
			<IdentityStep {...stepProps} />
		) : step === 'attributes' ? (
			<AttributesStep {...stepProps} />
		) : step === 'resources' ? (
			<ResourcesStep {...stepProps} />
		) : step === 'conditions' ? (
			<ConditionsStep {...stepProps} />
		) : step === 'dice' ? (
			<DiceStep {...stepProps} />
		) : step === 'creature' ? (
			<CreatureStep {...stepProps} />
		) : step === 'advancement' ? (
			<AdvancementStep {...stepProps} />
		) : (
			<ReviewStep
				draft={draft}
				issues={issues}
				mode={mode}
				originName={originName}
				busy={busy}
				canWrite={canWrite}
				rejection={rejection}
				onGoToStep={goToStep}
				onSubmit={submit}
				t={t}
			/>
		);

	/* The DS Stepper is the progress READ-OUT; the buttons under it are how a step is reached, so
	   every step is one keyboard stop away rather than only reachable by walking Next. */
	const stepNav = (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
			{!narrow && (
				<Stepper
					steps={STEP_IDS.map((id) => ({ label: t(STEP_LABEL[id]) }))}
					current={stepIndex}
					ariaLabel={t('systemBuilder.steps')}
					style={{ flexWrap: 'wrap', rowGap: 8 }}
				/>
			)}
			<nav aria-label={t('systemBuilder.steps')}>
				<ol
					style={{
						listStyle: 'none',
						margin: 0,
						padding: 0,
						display: 'flex',
						flexWrap: 'wrap',
						gap: 6,
					}}
				>
					{STEP_IDS.map((id) => {
						const current = id === step;
						const blocked = issues.some((issue) => issue.step === id);
						return (
							<li key={id}>
								<button
									type="button"
									onClick={() => goToStep(id)}
									aria-current={current ? 'step' : undefined}
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 7,
										padding: '6px 10px',
										borderRadius: 999,
										border: `1px solid ${current ? T.accBd : T.bd}`,
										background: current ? T.accSub : 'transparent',
										color: current ? T.ink : T.sub,
										font: `${current ? 600 : 400} 12px ${T.sans}`,
										cursor: 'pointer',
									}}
								>
									{t(STEP_LABEL[id])}
									{blocked && id !== 'review' && (
										<Badge status="warning">{t('systemBuilder.needsAttention')}</Badge>
									)}
								</button>
							</li>
						);
					})}
				</ol>
			</nav>
		</div>
	);

	return (
		<div
			className="app-fixed-viewport"
			ref={rootRef}
			tabIndex={-1}
			role="dialog"
			aria-modal="true"
			data-fullscreen-overlay="system-builder"
			aria-label={t('systemBuilder.overlayLabel', { name: draft.displayName })}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 300,
				display: 'flex',
				flexDirection: 'column',
				background: T.bg,
				color: T.ink,
				fontFamily: T.sans,
				outline: 'none',
			}}
		>
			<header
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: narrow ? 6 : 10,
					padding: narrow ? '7px 8px' : '8px 14px',
					borderBottom: `1px solid ${T.bd}`,
					background: T.surf,
					flex: '0 0 auto',
					minWidth: 0,
				}}
			>
				<IconButton
					icon="arrow-left"
					label={t('systemBuilder.back')}
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
				<div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
					<h1
						style={{
							margin: 0,
							font: `600 14px ${T.disp}`,
							color: T.ink,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{draft.displayName || t('systemBuilder.untitled')}
					</h1>
					<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						{t('systemBuilder.stepOf', {
							index: stepIndex + 1,
							total: STEP_IDS.length,
							label: t(STEP_LABEL[step]),
						})}
					</span>
				</div>
				<Badge status={mode === 'update' ? 'neutral' : 'warning'}>
					{mode === 'update' ? t('systemBuilder.editing') : t('systemBuilder.creating')}
				</Badge>
			</header>

			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflow: 'auto',
					padding: narrow ? '14px 12px 32px' : '18px 22px 40px',
				}}
			>
				<div
					style={{
						maxWidth: 880,
						margin: '0 auto',
						display: 'flex',
						flexDirection: 'column',
						gap: 20,
					}}
				>
					{stepNav}
					{!canWrite && (
						<div role="status" style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{t('systemBuilder.readOnly')}
						</div>
					)}
					{stepBody}
					<div
						style={{
							display: 'flex',
							gap: 8,
							flexWrap: 'wrap',
							borderTop: `1px solid ${T.bd}`,
							paddingTop: 14,
						}}
					>
						<Button
							variant="secondary"
							size="sm"
							icon="chevron-left"
							disabled={stepIndex === 0}
							onClick={() => goToStep(STEP_IDS[Math.max(0, stepIndex - 1)]!)}
						>
							{t('common.action.back')}
						</Button>
						<Button
							variant="secondary"
							size="sm"
							disabled={stepIndex === STEP_IDS.length - 1}
							onClick={() => goToStep(STEP_IDS[Math.min(STEP_IDS.length - 1, stepIndex + 1)]!)}
						>
							{t('common.action.next')}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
