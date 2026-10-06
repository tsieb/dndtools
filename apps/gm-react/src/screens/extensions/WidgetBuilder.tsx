import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	evaluateWidgetPackageAuthorTrust,
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
	STEP_IDS,
	STEP_LABEL,
	buildPackage,
	emptyDraft,
	readPackage,
	type BuilderStepId,
	type WidgetDraft,
} from '../../app/widgetBuilder/draft';
import { firstBlockedStep, validateDraft } from '../../app/widgetBuilder/validate';
import { BuilderPreview } from '../../app/widgetBuilder/BuilderPreview';
import { BuilderStepRail, DefinitionPane } from '../../app/widgetBuilder/BuilderPanes';
import { IdentityStep } from '../../app/widgetBuilder/IdentityStep';
import { LayoutStep } from '../../app/widgetBuilder/LayoutStep';
import { DataStep } from '../../app/widgetBuilder/DataStep';
import { ConfigStep } from '../../app/widgetBuilder/ConfigStep';
import { CommandsStep } from '../../app/widgetBuilder/CommandsStep';
import { StyleStep } from '../../app/widgetBuilder/StyleStep';
import { AdvancedStep } from '../../app/widgetBuilder/AdvancedStep';
import { ReviewStep } from '../../app/widgetBuilder/ReviewStep';
import { useI18n } from '../../i18n';
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

	const [draft, setDraft] = useState<WidgetDraft>(
		() =>
			initialDraft ??
			(editPackage
				? readPackage(editPackage)
				: generatedPackage
					? readPackage(generatedPackage, 'proposed')
					: emptyDraft()),
	);
	// A generated draft starts where a DM reviews it, not where a DM would start typing.
	const [step, setStep] = useState<BuilderStepId>(
		initialStep ?? (!editPackage && generatedPackage ? 'review' : 'identity'),
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
	// The open trust sheet owns the keyboard: its Escape and Tab cycle, not the builder's.
	const reviewingRef = useRef(false);
	reviewingRef.current = reviewing !== null;

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
			if (reviewingRef.current) return;
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
	const stepRail = <BuilderStepRail step={step} issues={issues} onGoToStep={goToStep} />;

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
					onClick={onClose}
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
							total: STEP_IDS.length,
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
			{reviewing && (
				<TrustReviewSheet packageId={reviewing.id} onClose={() => afterReview(reviewing)} />
			)}
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
