import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WidgetPackageDefinition } from '@dndtools/core';
import { Badge, Button, IconButton, Textarea, Toaster } from '../../ds';
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
	firstBlockedStep,
	readPackage,
	validateDraft,
	type BuilderStepId,
	type WidgetDraft,
} from '../../app/widgetBuilder/draft';
import { BuilderPreview } from '../../app/widgetBuilder/BuilderPreview';
import { IdentityStep } from '../../app/widgetBuilder/IdentityStep';
import { LayoutStep } from '../../app/widgetBuilder/LayoutStep';
import { DataStep } from '../../app/widgetBuilder/DataStep';
import { ConfigStep } from '../../app/widgetBuilder/ConfigStep';
import { CommandsStep } from '../../app/widgetBuilder/CommandsStep';
import { StyleStep } from '../../app/widgetBuilder/StyleStep';
import { AdvancedStep } from '../../app/widgetBuilder/AdvancedStep';
import { ReviewStep } from '../../app/widgetBuilder/ReviewStep';

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
 */

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function WidgetBuilder({
	/** An installed package to edit. Absent for a new widget. */
	editPackage,
	onClose,
}: {
	editPackage?: WidgetPackageDefinition | null;
	onClose: () => void;
}) {
	const runtime = useRuntime();
	const viewport = useViewport();
	const narrow = viewport !== 'desktop';
	const dmId = runtime.defaultActorId;
	const canWrite = runtime.state.permissions.actors[dmId]?.role === 'dm' && !runtime.preview;

	const [draft, setDraft] = useState<WidgetDraft>(() =>
		editPackage ? readPackage(editPackage) : emptyDraft(),
	);
	const [step, setStep] = useState<BuilderStepId>('identity');
	const [pane, setPane] = useState<'edit' | 'preview' | 'json'>('edit');
	const [busy, setBusy] = useState(false);
	const [rejection, setRejection] = useState<string | null>(null);

	const rootRef = useRef<HTMLDivElement>(null);
	const jsonRef = useRef<HTMLTextAreaElement>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

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
		void runtime
			.dispatch({
				type: mode === 'upgrade' ? 'widget.package.upgrade' : 'widget.package.install',
				actorId: dmId,
				payload: { package: buildPackage(draft, previousMigrations) },
			})
			.then((result) => {
				if (result.status === 'accepted') {
					Toaster.success(
						mode === 'upgrade'
							? `Saved ${draft.name} version ${draft.version} and updated every placed copy.`
							: `Installed ${draft.name}. It is disabled until you enable it in Installed packages.`,
					);
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

	const stepProps = { draft, patch, issues: stepIssues };
	const stepBody =
		step === 'identity' ? (
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
				issues={issues}
				mode={mode}
				busy={busy}
				canWrite={canWrite}
				rejection={rejection}
				onGoToStep={goToStep}
				onSubmit={submit}
			/>
		);

	const stepRail = (
		<nav aria-label="Builder steps" data-testid="widget-builder-steps">
			<ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
				{STEP_IDS.map((id, index) => {
					const current = id === step;
					const blocked = issues.some((issue) => issue.step === id);
					return (
						<li key={id}>
							<button
								type="button"
								onClick={() => goToStep(id)}
								// The index badge is decoration; the step's NAME is the button's name.
								aria-label={STEP_LABEL[id]}
								aria-current={current ? 'step' : undefined}
								style={{
									width: '100%',
									display: 'flex',
									alignItems: 'center',
									gap: 9,
									padding: '7px 9px',
									borderRadius: 8,
									border: `1px solid ${current ? T.accBd : 'transparent'}`,
									background: current ? T.accSub : 'transparent',
									color: current ? T.ink : T.sub,
									font: `${current ? 600 : 400} 12.5px ${T.sans}`,
									textAlign: 'left',
									cursor: 'pointer',
								}}
							>
								<span
									aria-hidden="true"
									style={{
										width: 20,
										height: 20,
										flex: '0 0 auto',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										borderRadius: 999,
										border: `1.5px solid ${current ? T.acc : T.bdS}`,
										color: current ? T.acc : T.ter,
										font: `600 10px ${T.mono}`,
									}}
								>
									{index + 1}
								</span>
								<span style={{ flex: 1, minWidth: 0 }}>{STEP_LABEL[id]}</span>
								{blocked && <Badge status="warning">Needs attention</Badge>}
							</button>
						</li>
					);
				})}
			</ol>
		</nav>
	);

	const jsonPane = (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<span style={{ flex: 1, font: `600 12px ${T.sans}`, color: T.sub }}>Definition</span>
				<Button
					variant="ghost"
					size="sm"
					icon="duplicate"
					onClick={() => {
						jsonRef.current?.focus();
						jsonRef.current?.select();
					}}
				>
					Select all
				</Button>
			</div>
			<Textarea
				ref={jsonRef}
				value={json}
				readOnly
				rows={narrow ? 14 : 26}
				aria-label="Widget package definition"
				data-testid="widget-builder-json"
				style={{ fontFamily: T.mono, fontSize: 11.5, flex: 1, minHeight: 0 }}
			/>
			<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
				Read-only. Select it to copy the package elsewhere.
			</span>
		</div>
	);

	const column = (children: React.ReactNode, extra?: React.CSSProperties) => (
		<div
			style={{
				minWidth: 0,
				minHeight: 0,
				overflow: 'auto',
				padding: narrow ? '14px 12px 28px' : '18px 20px 32px',
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
			aria-label={`Widget builder — ${draft.name || 'new widget'}`}
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
					label="Back to Extensions"
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
						{draft.name || 'New widget'}
					</h1>
					<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						Step {stepIndex + 1} of {STEP_IDS.length} · {STEP_LABEL[step]}
					</span>
				</div>
				<Badge status={mode === 'upgrade' ? 'warning' : 'neutral'}>
					{mode === 'upgrade' ? 'New version' : 'New widget'}
				</Badge>
			</header>

			{narrow && (
				<div
					style={{
						padding: '8px 10px',
						borderBottom: `1px solid ${T.bd}`,
						background: T.surf,
						flex: '0 0 auto',
					}}
				>
					<Seg
						ariaLabel="Builder pane"
						value={pane}
						onChange={(next: string) => setPane(next as typeof pane)}
						options={[
							{ value: 'edit', label: 'Edit' },
							{ value: 'preview', label: 'Preview' },
							{ value: 'json', label: 'Definition' },
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
						<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
							{stepRail}
							{stepBody}
							<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
								<Button
									variant="secondary"
									size="sm"
									icon="chevron-left"
									disabled={stepIndex === 0}
									onClick={() => goToStep(STEP_IDS[Math.max(0, stepIndex - 1)]!)}
								>
									Back
								</Button>
								<Button
									variant="secondary"
									size="sm"
									disabled={stepIndex === STEP_IDS.length - 1}
									onClick={() => goToStep(STEP_IDS[Math.min(STEP_IDS.length - 1, stepIndex + 1)]!)}
								>
									Next
								</Button>
							</div>
						</div>,
						narrow ? undefined : { borderRight: `1px solid ${T.bd}` },
					)}

				{(!narrow || pane === 'preview') &&
					column(
						<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
							<span style={{ font: `600 12px ${T.sans}`, color: T.sub }}>Preview</span>
							<BuilderPreview draft={draft} />
						</div>,
					)}

				{(!narrow || pane === 'json') &&
					column(jsonPane, narrow ? undefined : { borderLeft: `1px solid ${T.bd}` })}
			</div>
		</div>
	);
}
