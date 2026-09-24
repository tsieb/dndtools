import { useMemo, useState } from 'react';
import {
	activeSystemPackage,
	isBuiltInSystemPackageId,
	previewSystemPackageSelect,
	STARTER_SYSTEM_LIBRARY,
	type CommandResult,
	type SystemPackage,
} from '@dndtools/core';
import { chipsFor, sigilFor, tierFor } from './systemVocab';
import { Button, SystemPackageCard, Toaster } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { ContextHelp } from '../../app/help/ContextHelp';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import { ExtSystemWidgetPackage } from './SystemWidgetSwitch';
import { SystemBuilder } from './SystemBuilder';
import { SystemForkDialog, SystemSelectDialog } from './SystemDialogs';
import { BuildYourOwnCard, SystemDetailPanel } from './SystemDetail';
import { eventField, ReadOnlyNote } from './shared';

/* ---- System package picker (RC-SYS-3.1 — the front door).
 *
 * REAL: the gallery lists the packages actually installed in the `systems` slice (the built-ins the
 * build seeds plus every `custom:` package the DM has forked), each card showing what that package
 * DECLARES — attributes, resources, conditions, dice — read off the package itself, never a
 * hard-coded table. Choosing one opens the pure `previewSystemPackageSelect` dry-run and applies
 * through the real `system.select` command, which fails closed when the switch would strand
 * character data unless the DM acknowledges it. "Build your own" dispatches the real `system.fork`:
 * a named copy in the `custom:` namespace, which is the only sanctioned way to base a homebrew on a
 * built-in. RC-SYS-3.3 finished the thought: a fork drops the DM straight into the SYSTEM BUILDER
 * (`SystemBuilder.tsx`), and every DM-authored package in the gallery has an Edit entry back into
 * it. The builder saves through `system.define`/`system.update` and never activates — switching is
 * the dry-run (`SystemDialogs.tsx`), the only path that can say what a switch would drop.
 */

/* ---- the screen -------------------------------------------------------------------------------- */

export function ExtSystem() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const viewport = useViewport();
	const dmId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !previewing;
	const systems = runtime.state.systems;
	const packages = useMemo(
		() =>
			Object.values(systems.packages).sort((a, b) => {
				const builtIn =
					Number(isBuiltInSystemPackageId(b.id)) - Number(isBuiltInSystemPackageId(a.id));
				return builtIn !== 0 ? builtIn : a.displayName.localeCompare(b.displayName);
			}),
		[systems],
	);
	const active = activeSystemPackage(systems);
	// `null` is the gallery; an id is the detail view for that package.
	const [detailId, setDetailId] = useState<string | null>(null);
	const [targetId, setTargetId] = useState<string | null>(null);
	const [forkSourceId, setForkSourceId] = useState<string | null>(null);
	// The DM-authored package open in the system builder (RC-SYS-3.3), by id.
	const [builderId, setBuilderId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const detail = detailId ? (systems.packages[detailId] ?? null) : null;
	const forkSource = forkSourceId ? (systems.packages[forkSourceId] ?? null) : null;
	const builderPackage = builderId ? (systems.packages[builderId] ?? null) : null;
	// The PURE dry-run behind the command — recomputed from the same state the command validates.
	const preview = targetId
		? previewSystemPackageSelect(systems, runtime.state.characters, targetId)
		: null;
	const targetName = targetId ? (systems.packages[targetId]?.displayName ?? targetId) : '';

	const select = (acknowledgeLoss: boolean) => {
		if (!targetId || busy) return;
		setBusy(true);
		void runtime
			.dispatch({
				type: 'system.select',
				actorId: dmId,
				payload: { packageId: targetId, acknowledgeLoss },
			})
			.then((res: CommandResult) => {
				if (res.status === 'accepted') {
					Toaster.success(t('extensions.system.select.done', { name: targetName }));
					setTargetId(null);
				} else {
					Toaster.error(res.rejection.message);
				}
			})
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};

	const fork = (displayName: string) => {
		if (!forkSourceId || busy) return;
		setBusy(true);
		void runtime
			.dispatch({
				type: 'system.fork',
				actorId: dmId,
				payload: { sourcePackageId: forkSourceId, displayName },
			})
			.then((res: CommandResult) => {
				if (res.status === 'accepted') {
					Toaster.success(t('extensions.system.fork.done', { name: displayName }));
					setForkSourceId(null);
					// A fork exists to be edited, so it opens where the editing happens rather than
					// leaving the DM to find their new copy in the gallery.
					const forkedId = eventField(res, 'system.changed', 'packageId');
					if (forkedId) {
						setDetailId(forkedId);
						setBuilderId(forkedId);
					}
				} else {
					Toaster.error(res.rejection.message);
				}
			})
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};

	/* ---- RC-SYS-3.5 — the starter library ------------------------------------------------------
	 *
	 * Samples ship with the build as DATA but are NOT built in: they arrive through the ordinary
	 * `system.define` command into the `custom:` namespace, so an installed sample is the DM's own
	 * copy from the first second — forkable, editable, deletable, exactly like a fork. Only samples
	 * the vault does not already carry are offered, so the section empties itself as it is used.
	 */
	const library = useMemo(
		() => STARTER_SYSTEM_LIBRARY.filter((pkg) => !systems.packages[pkg.id]),
		[systems],
	);

	const installSample = (pkg: SystemPackage) => {
		if (busy) return;
		setBusy(true);
		void runtime
			.dispatch({ type: 'system.define', actorId: dmId, payload: { package: pkg } })
			.then((res: CommandResult) => {
				if (res.status === 'accepted') {
					Toaster.success(t('extensions.system.library.done', { name: pkg.displayName }));
					// It is a real package now, so it opens where every other package opens: the detail
					// view, with the dry-run switch one button away.
					setDetailId(pkg.id);
				} else {
					Toaster.error(res.rejection.message);
				}
			})
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};

	const card = (pkg: SystemPackage, compact: boolean) => (
		<SystemPackageCard
			key={pkg.id}
			name={pkg.displayName}
			tier={tierFor(pkg, t)}
			summary={pkg.summary}
			chips={chipsFor(pkg, t)}
			icon={sigilFor(pkg)}
			active={pkg.id === active.id}
			activeLabel={t('extensions.system.active')}
			current={pkg.id === detailId}
			compact={compact}
			onSelect={() => setDetailId(pkg.id)}
		/>
	);

	/** The "build your own" entry, in both the gallery grid and the detail rail. */
	/** The "build your own" entry, in both the gallery grid and the detail rail. */
	const buildYourOwn = (compact: boolean) => (
		<BuildYourOwnCard
			compact={compact}
			canWrite={canWrite}
			onClick={() => setForkSourceId(detail?.id ?? active.id)}
		/>
	);

	const detailPanel = detail && (
		<SystemDetailPanel
			detail={detail}
			active={active}
			canWrite={canWrite}
			busy={busy}
			onPreviewSelect={() => setTargetId(detail.id)}
			onEdit={() => setBuilderId(detail.id)}
			onFork={() => setForkSourceId(detail.id)}
		/>
	);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			<Panel
				title={t('extensions.system.pickerTitle')}
				action={<ContextHelp topic="systemPicker" />}
				accent
			>
				<div
					style={{
						display: 'flex',
						gap: 'var(--space-4)',
						flexWrap: 'wrap',
						alignItems: 'flex-start',
					}}
				>
					<div style={{ flex: '1 1 320px', font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
						{t('extensions.system.pickerIntro')}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
						<span style={eb}>{t('extensions.system.activePackage')}</span>
						<span style={{ font: `700 var(--text-base) ${T.sans}`, color: T.ink }}>
							{active.displayName}
						</span>
					</div>
				</div>
				{!canWrite && <ReadOnlyNote>{t('extensions.system.readOnly')}</ReadOnlyNote>}
			</Panel>

			{detail ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
					<div>
						<Button
							variant="secondary"
							size="sm"
							icon="chevron-left"
							onClick={() => setDetailId(null)}
						>
							{t('extensions.system.allSystems')}
						</Button>
					</div>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: viewport === 'desktop' ? '272px minmax(0,1fr)' : '1fr',
							gap: 'var(--space-4)',
							alignItems: 'start',
						}}
					>
						{viewport === 'desktop' && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
								{packages.map((pkg) => card(pkg, true))}
								{buildYourOwn(true)}
							</div>
						)}
						{detailPanel}
					</div>
				</div>
			) : (
				<>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fill,minmax(288px,1fr))',
							gap: 'var(--space-3)',
						}}
					>
						{packages.map((pkg) => card(pkg, false))}
						{buildYourOwn(false)}
					</div>
					{/* RC-SYS-3.5 — the starter library, below the gallery: these are not installed yet. */}
					{library.length > 0 && (
						<Panel title={t('extensions.system.library.title')}>
							<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
								{t('extensions.system.library.body')}
							</div>
							<div
								style={{
									display: 'grid',
									gridTemplateColumns: 'repeat(auto-fill,minmax(288px,1fr))',
									gap: 'var(--space-3)',
								}}
							>
								{library.map((pkg) => (
									<SystemPackageCard
										key={pkg.id}
										name={pkg.displayName}
										tier={t('extensions.system.library.tier')}
										summary={pkg.summary}
										chips={chipsFor(pkg, t)}
										icon="wand"
										compact={false}
										aria-label={t('extensions.system.library.install', {
											name: pkg.displayName,
										})}
										disabled={!canWrite || busy}
										onSelect={() => installSample(pkg)}
									/>
								))}
							</div>
						</Panel>
					)}
					<ExtSystemWidgetPackage />
				</>
			)}

			{targetId && preview && (
				<SystemSelectDialog
					targetName={targetName}
					preview={preview}
					busy={busy}
					canWrite={canWrite}
					onApply={select}
					onClose={() => setTargetId(null)}
				/>
			)}
			{builderPackage && (
				<SystemBuilder editPackage={builderPackage} onClose={() => setBuilderId(null)} />
			)}
			{forkSource && (
				<SystemForkDialog
					source={forkSource}
					busy={busy}
					canWrite={canWrite}
					onFork={fork}
					onClose={() => setForkSourceId(null)}
				/>
			)}
		</div>
	);
}
