import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
	evaluateWidgetPackageAuthorTrust,
	widgetPackageForkIdentity,
	type WidgetLibraryEntry,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Badge, Button, IconButton, Toaster } from '../../ds';
import { Seg, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { registerBackHandler } from '../../platform/backNavigation';
import { isolateModalSiblings } from '../../platform/modalIsolation';
import {
	STEP_LABEL,
	buildPackage,
	draftStorageKey,
	editStepFor,
	emptyDraft,
	isDraftDirty,
	keptDraftStore,
	readPackage,
	readStoredDraft,
	removeStoredDraft,
	resumeDraft,
	widgetEditTarget,
	writeStoredDraft,
	type BuilderStepId,
	type StoredWidgetDraft,
	type WidgetDraft,
} from '../../app/widgetBuilder/draft';
import { firstBlockedStep, validateDraft } from '../../app/widgetBuilder/validate';
import { QuickBuilder } from '../../app/widgetBuilder/QuickBuilder';
import { BuilderPreview } from '../../app/widgetBuilder/BuilderPreview';
import {
	BuilderDraftDialogs,
	BuilderStepRail,
	DefinitionPane,
} from '../../app/widgetBuilder/BuilderPanes';
import { IdentityStep } from '../../app/widgetBuilder/IdentityStep';
import { LayoutStep } from '../../app/widgetBuilder/LayoutStep';
import { DataStep } from '../../app/widgetBuilder/DataStep';
import { ConfigStep } from '../../app/widgetBuilder/ConfigStep';
import { CommandsStep } from '../../app/widgetBuilder/CommandsStep';
import { StyleStep } from '../../app/widgetBuilder/StyleStep';
import { AdvancedStep } from '../../app/widgetBuilder/AdvancedStep';
import { ReviewStep } from '../../app/widgetBuilder/ReviewStep';
import { useI18n } from '../../i18n';
import { AdvancedStepGate, shownBuilderSteps, useSettingsTier } from '../settings/Experience';
import { TrustReviewSheet } from './TrustReviewSheet';

/**
 * The widget builder (RC-WID-2.1) — a full-screen overlay on the same contract as the map editor:
 * `role="dialog" aria-modal`, the rest of the app isolated from assistive tech while it is up,
 * one Tab cycle, Escape and the platform Back gesture both close it, and focus returns to whatever
 * opened it.
 *
 * Three panes: the stepper and the active step on the left, the draft drawn through the real render
 * path in the middle, and the definition JSON on the right. Below the phone/rail breakpoint the
 * three become one pane with a switch, because a three-column authoring screen on a handset is a
 * scroll maze.
 *
 * The draft lives in component state and touches nothing durable. Review is the only step that
 * writes, through `widget.package.install` or `widget.package.upgrade` — the same commands the
 * Plugins panel's JSON box dispatches, so a widget built here is not a special kind of package.
 *
 * RC-WID-6.6 — a changed draft is also kept (`keptDraftStore`) under the id of the package the
 * builder opened on (`draftStorageKey`), until it is installed or discarded. Closing it while it
 * differs from what it opened with asks Keep or Discard, and opening the builder on a package with a
 * kept draft asks whether to resume it. Never the vault: a half-written widget is work in progress,
 * not campaign state.
 *
 * RC-WID-6.2 — a new package the core's author-trust rule clears (template-only, no permission, a
 * "safe to trust" verdict) installs with `authorTrust`, so it is trusted and on at once. Anything
 * else installs on the fail-closed path and the trust sheet opens over the builder, so allowing and
 * enabling it never means a trip to Extensions. Either way an enabled install is handed to
 * `onInstalled` (the gallery that opened the builder places it); one left off gets a toast that
 * opens Extensions.
 */

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function WidgetBuilder({
	/** An installed package to edit. Absent for a new widget. */
	editPackage,
	/**
	 * RC-WID-3.2 — a package the assistant PROPOSED and the DM has not installed. The builder opens
	 * on the Review step with every generated field editable; `editPackage` wins if both are given.
	 */
	generatedPackage,
	initialDraft,
	initialStep,
	onClose,
	onInstalled,
}: {
	editPackage?: WidgetPackageDefinition | null;
	generatedPackage?: WidgetPackageDefinition | null;
	/** A caller-owned draft, captured when this overlay opens. */
	initialDraft?: WidgetDraft;
	initialStep?: BuilderStepId;
	onClose: () => void;
	/** RC-WID-6.2 — a new package that installed enabled; the caller closes the builder and places it. */
	onInstalled?: (pkg: WidgetPackageDefinition) => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const viewport = useViewport();
	const narrow = viewport !== 'desktop';
	const dmId = runtime.defaultActorId;
	const canWrite = runtime.state.permissions.actors[dmId]?.role === 'dm' && !runtime.preview;

	// What the builder opened with: the baseline a change is measured against.
	const [baseline] = useState<WidgetDraft>(
		() =>
			initialDraft ??
			(editPackage
				? readPackage(editPackage)
				: generatedPackage
					? readPackage(generatedPackage, 'proposed')
					: emptyDraft()),
	);
	const [draft, setDraft] = useState<WidgetDraft>(baseline);
	const [draftKey] = useState(() =>
		draftStorageKey(editPackage?.id ?? generatedPackage?.id ?? initialDraft?.packageId),
	);
	// RC-WID-6.6 — a kept draft of this package, offered for resuming before anything is edited.
	const [kept, setKept] = useState<StoredWidgetDraft | null>(() => {
		const stored = readStoredDraft(keptDraftStore.read(), draftKey);
		return stored && isDraftDirty(baseline, stored.draft) ? stored : null;
	});
	const [leaving, setLeaving] = useState(false);
	// Installed, saved or discarded: nothing is kept for this session any more.
	const settledRef = useRef(false);
	// A generated draft starts where a DM reviews it, not where a DM would start typing.
	const [step, setStep] = useState<BuilderStepId>(
		initialStep ?? (!editPackage && generatedPackage ? 'review' : 'identity'),
	);
	// Board/gallery creation starts Quick; Extensions, edits and generated drafts stay Full.
	const [quick, setQuick] = useState(
		!!onInstalled && !initialDraft && !editPackage && !generatedPackage,
	);
	const [pane, setPane] = useState<'edit' | 'preview' | 'json'>('edit');
	const [busy, setBusy] = useState(false);
	const [rejection, setRejection] = useState<string | null>(null);
	// RC-WID-6.2 — the package just installed for review, while the trust sheet is open over the builder.
	const [reviewing, setReviewing] = useState<WidgetPackageDefinition | null>(null);
	const navigate = useNavigate();

	const rootRef = useRef<HTMLDivElement>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	// The open trust sheet or a draft question owns the keyboard: its Escape and Tab, not the builder's.
	const yieldKeysRef = useRef(false);
	yieldKeysRef.current = reviewing !== null || kept !== null || leaving;

	const dirty = useMemo(() => isDraftDirty(baseline, draft), [baseline, draft]);

	// The resume question's own return target is whatever opened the builder, inert behind it; once
	// answered, focus goes to the builder instead of being lost.
	const askedResumeRef = useRef(kept !== null);
	useEffect(() => {
		if (kept || !askedResumeRef.current) return;
		askedResumeRef.current = false;
		rootRef.current?.focus();
	}, [kept]);

	const forgetDraft = useCallback(() => {
		keptDraftStore.write(removeStoredDraft(keptDraftStore.read(), draftKey));
	}, [draftKey]);

	// Keep a changed draft; forget one edited back to where it started. Paused while
	// the resume question is open, so the kept draft is not overwritten before the GM answers.
	useEffect(() => {
		if (kept || settledRef.current) return;
		const raw = keptDraftStore.read();
		if (dirty) {
			const entry = { draft, step, savedAt: new Date().toISOString() };
			keptDraftStore.write(writeStoredDraft(raw, draftKey, entry));
		} else if (readStoredDraft(raw, draftKey)) forgetDraft();
	}, [draft, step, dirty, kept, draftKey, forgetDraft]);

	/** The work is installed or thrown away: drop the kept draft and stop keeping this one. */
	function settle() {
		settledRef.current = true;
		forgetDraft();
	}

	// Escape, Back and the platform Back gesture: a changed draft asks Keep or Discard first.
	const requestClose = () => {
		if (dirty && !settledRef.current) setLeaving(true);
		else onCloseRef.current();
	};
	const requestCloseRef = useRef(requestClose);
	requestCloseRef.current = requestClose;
	// Answered: Keep leaves the draft in the store, Discard forgets it. The builder closes
	// once the question has (an effect, after the Dialog's own cleanup lifts its isolation), so focus
	// can return to whatever opened the builder.
	const [closing, setClosing] = useState(false);
	useEffect(() => {
		if (closing) onCloseRef.current();
	}, [closing]);
	const leave = (discard: boolean) => {
		setLeaving(false);
		if (discard) settle();
		setClosing(true);
	};
	const draftName = (of?: WidgetDraft) => of?.name || t('extensions.builder.newWidget');

	const patch = useCallback(
		(next: Partial<WidgetDraft>) => setDraft((current) => ({ ...current, ...next })),
		[],
	);

	const issues = useMemo(() => validateDraft(draft), [draft]);
	const stepIssues = useMemo(() => issues.filter((issue) => issue.step === step), [issues, step]);
	const json = useMemo(() => JSON.stringify(buildPackage(draft), null, 2), [draft]);

	// A live package already carrying this id can only be UPGRADED — install refuses to overwrite
	// one, and it would reset its trust and disable every placed copy if it did.
	const installed = runtime.state.widgets.packages[draft.packageId];
	const mode: 'install' | 'upgrade' = installed && !installed.removedAt ? 'upgrade' : 'install';

	// Back gesture / hardware back closes the overlay, the same layer the map editor registers on.
	useEffect(
		() =>
			registerBackHandler('fullscreen', () => {
				requestCloseRef.current();
				return true;
			}),
		[],
	);

	// Dialog semantics: isolate the app behind the overlay, focus the shell, restore the opener.
	useEffect(() => {
		if (quick) return;
		const opener = document.activeElement as HTMLElement | null;
		const root = rootRef.current;
		const restoreIsolation = root ? isolateModalSiblings(root) : () => {};
		root?.focus();
		return () => {
			restoreIsolation();
			opener?.focus?.();
		};
	}, [quick]);

	// One Tab cycle inside the overlay (the app shell stays mounted underneath), plus Escape. Heard
	// on the overlay itself, so a host that fences its React tree off from the builder's events (a
	// tile's "Edit widget", RC-WID-6.6) still delivers them, and on the document only for a key
	// pressed outside it (a toast's Dismiss), which is pulled back in.
	useEffect(() => {
		if (quick) return;
		const onKey = (e: KeyboardEvent) => {
			if (yieldKeysRef.current) return;
			if (e.key === 'Escape') {
				e.stopPropagation();
				requestCloseRef.current();
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
		const root = rootRef.current;
		const onOutside = (e: KeyboardEvent) => {
			if (!(e.target instanceof Node && root?.contains(e.target))) onKey(e);
		};
		root?.addEventListener('keydown', onKey);
		document.addEventListener('keydown', onOutside);
		return () => {
			root?.removeEventListener('keydown', onKey);
			document.removeEventListener('keydown', onOutside);
		};
	}, [quick]);

	// RC-UX-6.4 — below its complexity-map gate the stepper skips Advanced (custom code, host
	// access); `shownBuilderSteps` keeps it whenever the draft already has something there.
	const tier = useSettingsTier();
	const steps = shownBuilderSteps(draft, tier, step, issues);
	const stepIndex = steps.indexOf(step);
	const goToStep = (next: BuilderStepId) => {
		setStep(next);
		if (narrow) setPane('edit');
	};

	const submit = () => {
		if (busy || !canWrite) return;
		const blocked = firstBlockedStep(issues);
		if (blocked) {
			goToStep(blocked);
			return;
		}
		setBusy(true);
		setRejection(null);
		const previousMigrations = mode === 'upgrade' ? (installed?.package.migrations ?? []) : [];
		const pkg = buildPackage(draft, previousMigrations);
		// The core holds the same rule and refuses author trust it would not grant; asking only when
		// the rule clears the package keeps a custom-code build on the ordinary install.
		const authorTrust = mode === 'install' && evaluateWidgetPackageAuthorTrust(pkg).eligible;
		void runtime
			.dispatch({
				type: mode === 'upgrade' ? 'widget.package.upgrade' : 'widget.package.install',
				actorId: dmId,
				payload: { package: pkg, ...(authorTrust ? { authorTrust: true } : {}) },
			})
			.then((result) => {
				if (result.status === 'accepted') {
					settle();
					if (mode === 'upgrade') {
						Toaster.success(
							t('extensions.builder.savedUpgrade', { name: draft.name, version: draft.version }),
						);
						onCloseRef.current();
					} else if (authorTrust) {
						finishInstalled(pkg);
					} else {
						setReviewing(pkg);
					}
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

	// An enabled install goes back to the caller to be placed; without one, the toast says it is on.
	const finishInstalled = (pkg: WidgetPackageDefinition) => {
		if (onInstalled) onInstalled(pkg);
		else Toaster.success(t('extensions.builder.installedEnabled', { name: pkg.displayName }));
		onCloseRef.current();
	};

	// The trust sheet closed. Trusted there: enable it here and finish like an author-trusted install.
	// Cancelled or denied: the package stays off, and the toast links to it in Extensions.
	const afterReview = (pkg: WidgetPackageDefinition) => {
		setReviewing(null);
		const leaveOff = () => {
			Toaster.warning(t('extensions.builder.installedNeedsReview', { name: pkg.displayName }), {
				action: t('extensions.builder.openPackage'),
				onAction: () => navigate('/extensions'),
			});
			onCloseRef.current();
		};
		if (runtime.state.widgets.packages[pkg.id]?.trust.state !== 'trusted') {
			leaveOff();
			return;
		}
		setBusy(true);
		void runtime
			.dispatch({ type: 'widget.package.enable', actorId: dmId, payload: { packageId: pkg.id } })
			.then((result) => (result.status === 'accepted' ? finishInstalled(pkg) : leaveOff()))
			.catch(leaveOff)
			.finally(() => setBusy(false));
	};

	const stepProps = { draft, patch, issues: stepIssues };
	const stepRail = (
		<>
			<BuilderStepRail step={step} steps={steps} issues={issues} onGoToStep={goToStep} />
			{!steps.includes('advanced') && <AdvancedStepGate tier={tier} />}
		</>
	);

	const jsonPane = <DefinitionPane json={json} narrow={narrow} />;

	const column = (children: React.ReactNode, extra?: React.CSSProperties) => (
		<div
			style={{
				minWidth: 0,
				minHeight: 0,
				overflow: 'auto',
				padding: narrow
					? 'var(--space-3) var(--space-3) var(--space-6)'
					: 'var(--space-4) var(--space-5) var(--space-8)',
				...extra,
			}}
		>
			{children}
		</div>
	);

	const dialogs = (
		<>
			{reviewing && (
				<TrustReviewSheet packageId={reviewing.id} onClose={() => afterReview(reviewing)} />
			)}
			<BuilderDraftDialogs
				keptName={kept ? draftName(kept.draft) : null}
				leaving={leaving}
				name={draftName(draft)}
				onStartOver={() => {
					forgetDraft();
					setKept(null);
				}}
				onResume={() => {
					if (!kept) return;
					setQuick(false);
					setDraft(resumeDraft(baseline, kept.draft));
					setStep(kept.step);
					setKept(null);
				}}
				onCancelLeave={() => setLeaving(false)}
				onLeave={leave}
			/>
		</>
	);
	if (quick)
		return (
			<QuickBuilder
				draft={draft}
				onChange={patch}
				onMore={(next) => {
					setQuick(false);
					goToStep(next);
				}}
				onAdd={submit}
				onClose={requestClose}
				busy={busy}
				blocked={!canWrite || issues.length > 0}
				error={rejection}
			>
				{dialogs}
			</QuickBuilder>
		);

	return (
		<div
			className="app-fixed-viewport"
			ref={rootRef}
			tabIndex={-1}
			role="dialog"
			aria-modal="true"
			data-fullscreen-overlay="widget-builder"
			aria-label={t('extensions.builder.dialogLabel', {
				name: draft.name || t('extensions.builder.newWidget'),
			})}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: T.z.overlay,
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
					gap: narrow ? 'var(--space-1-5)' : 'var(--space-2)',
					padding: narrow ? 'var(--space-1-5) var(--space-2)' : 'var(--space-2) var(--space-3)',
					borderBottom: `1px solid ${T.bd}`,
					background: T.surf,
					flex: '0 0 auto',
					minWidth: 0,
				}}
			>
				<IconButton
					icon="arrow-left"
					label={t('extensions.builder.back')}
					variant="ghost"
					size="sm"
					onClick={requestClose}
				/>
				<div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
					<h1
						style={{
							margin: 'var(--space-0)',
							font: `600 var(--text-sm) ${T.sans}`,
							color: T.ink,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{draft.name || t('extensions.builder.newWidget')}
					</h1>
					<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
						{t('extensions.builder.stepOf', {
							index: stepIndex + 1,
							total: steps.length,
							label: t(STEP_LABEL[step]),
						})}
					</span>
				</div>
				<Badge status={mode === 'upgrade' ? 'warning' : 'neutral'}>
					{mode === 'upgrade'
						? t('extensions.builder.newVersion')
						: t('extensions.builder.newWidget')}
				</Badge>
			</header>

			{narrow && (
				<div
					style={{
						padding: 'var(--space-2) var(--space-2)',
						borderBottom: `1px solid ${T.bd}`,
						background: T.surf,
						flex: '0 0 auto',
					}}
				>
					<Seg
						ariaLabel={t('extensions.builder.pane')}
						value={pane}
						onChange={(next: string) => setPane(next as typeof pane)}
						options={[
							{ value: 'edit', label: t('extensions.builder.paneEdit') },
							{ value: 'preview', label: t('extensions.builder.panePreview') },
							{ value: 'json', label: t('extensions.builder.definition') },
						]}
					/>
				</div>
			)}

			<div
				style={{
					flex: 1,
					minHeight: 0,
					display: 'grid',
					gridTemplateColumns: narrow
						? '1fr'
						: 'minmax(320px, 400px) minmax(0, 1fr) minmax(280px, 360px)',
				}}
			>
				{(!narrow || pane === 'edit') &&
					column(
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
							{stepRail}
							{step === 'identity' ? (
								<IdentityStep {...stepProps} />
							) : step === 'layout' ? (
								<LayoutStep {...stepProps} />
							) : step === 'data' ? (
								<DataStep {...stepProps} />
							) : step === 'config' ? (
								<ConfigStep {...stepProps} />
							) : step === 'commands' ? (
								<CommandsStep {...stepProps} />
							) : step === 'style' ? (
								<StyleStep {...stepProps} />
							) : step === 'advanced' ? (
								<AdvancedStep {...stepProps} />
							) : (
								<ReviewStep
									draft={draft}
									patch={patch}
									issues={issues}
									mode={mode}
									busy={busy}
									canWrite={canWrite}
									rejection={rejection}
									onGoToStep={goToStep}
									onSubmit={submit}
								/>
							)}
							<div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
								<Button
									variant="secondary"
									size="sm"
									icon="chevron-left"
									disabled={stepIndex === 0}
									onClick={() => goToStep(steps[Math.max(0, stepIndex - 1)]!)}
								>
									{t('common.action.back')}
								</Button>
								<Button
									variant="secondary"
									size="sm"
									disabled={stepIndex === steps.length - 1}
									onClick={() => goToStep(steps[Math.min(steps.length - 1, stepIndex + 1)]!)}
								>
									{t('common.action.next')}
								</Button>
							</div>
						</div>,
						narrow ? undefined : { borderRight: `1px solid ${T.bd}` },
					)}

				{(!narrow || pane === 'preview') &&
					column(
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
							<span style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.sub }}>
								{t('extensions.builder.panePreview')}
							</span>
							<BuilderPreview draft={draft} />
						</div>,
					)}

				{(!narrow || pane === 'json') &&
					column(jsonPane, narrow ? undefined : { borderLeft: `1px solid ${T.bd}` })}
			</div>
			{dialogs}
		</div>
	);
}

/**
 * RC-WID-6.2 — the gallery's in-place "Enable": its own list row under a library row that is dimmed
 * because its package is off. Offered to the DM only for a package already trusted, or one the
 * author-trust rule clears (what this builder would have installed enabled). A package with code or
 * a permission is never switched on from here; it still goes through review.
 */
export function InPlaceEnable({
	entry,
	onEnabled,
}: {
	entry: WidgetLibraryEntry;
	onEnabled: (entry: WidgetLibraryEntry) => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [busy, setBusy] = useState(false);
	const dmId = runtime.defaultActorId;
	const record = runtime.state.widgets.packages[entry.packageId];
	const offer =
		runtime.state.permissions.actors[dmId]?.role === 'dm' &&
		!runtime.preview &&
		!entry.availability.available &&
		!!record &&
		!record.enabled &&
		!record.removedAt &&
		(record.trust.state === 'trusted' ||
			(record.trust.state === 'unreviewed' &&
				evaluateWidgetPackageAuthorTrust(record.package).eligible));
	if (!offer) return null;
	const enable = () => {
		if (busy) return;
		setBusy(true);
		void runtime
			.dispatch({
				type: 'widget.package.enable',
				actorId: dmId,
				payload: { packageId: entry.packageId },
			})
			.then((result) =>
				result.status === 'accepted' ? onEnabled(entry) : Toaster.error(result.rejection.message),
			)
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};
	return (
		<li style={{ paddingLeft: 'var(--space-4)' }}>
			<Button size="sm" variant="secondary" icon="check" disabled={busy} onClick={enable}>
				{t('boardCanvas.add.enable', { name: entry.displayName })}
			</Button>
		</li>
	);
}

/**
 * RC-WID-6.6 — "Edit widget" for a placed tile, shared by the tile menus and the Inspector. What it
 * opens is `widgetEditTarget`'s answer: the GM's own package as it is, an unplaced copy from an
 * earlier edit (so its kept draft resumes), or a new copy made with `widget.package.fork`. The tile
 * moves onto the copy at once with `scene.repoint-widget`. A copy that starts off (custom code is
 * never trusted on the GM's word) reads "disabled, preserved" until the builder saves it, which turns
 * it on and draws the tile afresh from the saved code; closed with the copy still off, the tile goes
 * back to the widget it was copied from. The builder opens on Data, or Advanced for custom code.
 */
export function useEditWidget(widgetInstanceId: string, widgetType: string) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [session, setSession] = useState<{
		packageId: string;
		step: BuilderStepId;
		/** The tile's own type, to go back to if the builder closes with the copy still off. */
		revertTo: string | null;
	} | null>(null);
	const busyRef = useRef(false);
	const dmId = runtime.defaultActorId;
	const target = widgetEditTarget(runtime.state, widgetType);
	const available =
		!runtime.preview && runtime.state.permissions.actors[dmId]?.role === 'dm' && target !== null;

	/** Move this tile onto `type`; a refusal is shown, and the copy is still saved either way. */
	const repoint = async (type: string) => {
		const scene = Object.values(runtime.state.scenes.scenes).find((candidate) =>
			candidate.widgets.some((instance) => instance.id === widgetInstanceId),
		);
		const instance = scene?.widgets.find((candidate) => candidate.id === widgetInstanceId);
		if (!scene || !instance || instance.type === type) return;
		const result = await runtime.dispatch({
			type: 'scene.repoint-widget',
			actorId: dmId,
			payload: { sceneId: scene.id, widgetInstanceId, widgetType: type },
		});
		if (result.status !== 'accepted') Toaster.error(result.rejection.message);
	};

	const open = async () => {
		if (!available || !target || busyRef.current) return;
		busyRef.current = true;
		try {
			let copy = target.kind === 'fork' ? undefined : target.record;
			if (target.kind === 'fork') {
				const identity = widgetPackageForkIdentity(runtime.state.widgets, widgetType);
				const name = target.name;
				const result = await runtime.dispatch({
					type: 'widget.package.fork',
					actorId: dmId,
					payload: {
						packageId: target.source.package.id,
						widgetType,
						forkPackageId: identity.packageId,
						forkWidgetType: identity.widgetType,
						displayName: t('extensions.builder.forkName', { name }),
					},
				});
				if (result.status !== 'accepted') {
					Toaster.error(result.rejection.message);
					return;
				}
				copy = runtime.state.widgets.packages[identity.packageId];
				Toaster.info(t('extensions.builder.forked', { name }));
			}
			if (!copy) return;
			if (target.kind !== 'own') await repoint(copy.package.widgets[0]!.type);
			const step = editStepFor(readPackage(copy.package));
			const revertTo = target.kind === 'own' ? null : widgetType;
			setSession({ packageId: copy.package.id, step, revertTo });
		} finally {
			busyRef.current = false;
		}
	};

	const editing = session ? runtime.state.widgets.packages[session.packageId] : undefined;
	// A portal still bubbles through the React tree, and a tile menu sits inside the canvas: a key in
	// the builder would reach its shortcuts (Ctrl+Z undoes the board) and a wheel would pan it. The
	// fence stops them; the builder hears its own keys on its overlay first.
	const fence = (e: React.SyntheticEvent) => e.stopPropagation();
	const editor =
		session && editing
			? createPortal(
					<div onKeyDown={fence} onKeyUp={fence} onWheel={fence} onContextMenu={fence}>
						<WidgetBuilder
							editPackage={editing.package}
							initialStep={session.step}
							onClose={() => {
								setSession(null);
								if (session.revertTo && !runtime.state.widgets.packages[session.packageId]?.enabled)
									void repoint(session.revertTo);
							}}
						/>
					</div>,
					document.body,
				)
			: null;
	return { available, open, editor };
}
