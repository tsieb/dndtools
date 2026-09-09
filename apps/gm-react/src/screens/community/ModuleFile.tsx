import { useMemo, useState } from 'react';
import {
	buildContentModuleBundle,
	exportSystemPackageBundle,
	moduleBundleFileName,
	type ContentExport,
	type CoreEvent,
} from '@dndtools/core';
import { Button, Dialog, Input, Select, Toaster } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { downloadJsonFile } from '../../platform/download';
import { pickTextFile } from '../../platform/filePick';
import { errText, representativePlayerActorId, slugify } from './shared';
import {
	installPlanCommand,
	installPlanItemCount,
	planModuleInstall,
	type InstallPlan,
} from './moduleInstall';
import { useI18n, type MessageKey } from '../../i18n';

/**
 * RC-CLD-4.1 — the `.dndmodule` bundle as a FILE, without the marketplace.
 *
 * The bundle format, the manifest and the per-kind install review are the marketplace's
 * (Discover/Publish), but they need a cloud account to reach. A creator sharing a module by hand —
 * and every local-only build — gets the same round trip here: save the campaign's player-visible
 * content as a content module, and install someone else's module through the SAME review and the
 * SAME core commands (`installPlanCommand`). Nothing installs without a review (ADR-002).
 */

const MAX_MODULE_FILE_BYTES = 8 * 1024 * 1024;

/** The listing kinds, in the DM's words (shared vocabulary with Discover). */
const KIND_LABEL: Record<string, MessageKey> = {
	'widget-package': 'community.discover.kindWidget',
	'system-package': 'community.discover.kindSystem',
	'scene-package': 'community.discover.kindScene',
	'content-module': 'community.discover.kindContent',
};

export function ModuleFilePanel() {
	const { t } = useI18n();
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const portableViewerActorId = useMemo(
		() => representativePlayerActorId(runtime.state.permissions),
		[runtime.state.permissions],
	);
	// RC-SYS-3.4 — which installed system the "save a system" half would write out. Defaults to the
	// one the campaign is playing, which is what a DM sharing a system almost always means.
	const [systemId, setSystemId] = useState(runtime.state.systems.activePackageId);
	const [name, setName] = useState('');
	const [summary, setSummary] = useState('');
	const [version, setVersion] = useState('1.0.0');
	const [busy, setBusy] = useState(false);
	// A plan that could not be understood never reaches the review: it is reported and dropped.
	const [review, setReview] = useState<{
		fileName: string;
		plan: Exclude<InstallPlan, { kind: 'not-a-module' }>;
	} | null>(null);

	const saveModule = async () => {
		if (busy) return;
		if (!name.trim() || !summary.trim() || !version.trim()) {
			Toaster.error(t('community.publish.allRequired'));
			return;
		}
		setBusy(true);
		try {
			// The PORTABLE export — the visibility-filtered, secret-scrubbed projection. DM-only
			// content is never in a module built here.
			const res = await runtime.dispatch({
				type: 'content.export',
				actorId: dmId,
				payload: { mode: 'portable', portableViewerActorId },
			});
			if (res.status !== 'accepted') {
				Toaster.error(res.rejection.message);
				return;
			}
			const event = res.events.find(
				(e): e is Extract<CoreEvent, { kind: 'content.exported' }> => e.kind === 'content.exported',
			);
			const exported: ContentExport | undefined = event?.export;
			if (!exported || exported.files.length === 0) {
				Toaster.error(t('community.publish.contentEmpty'));
				return;
			}
			const built = buildContentModuleBundle({
				manifest: {
					id: slugify(name) || 'content-module',
					name: name.trim(),
					summary: summary.trim(),
					version: version.trim(),
				},
				export: exported,
			});
			if (!built.ok) {
				Toaster.error(built.reason);
				return;
			}
			const fileName = moduleBundleFileName(built.bundle.manifest);
			const saved = await downloadJsonFile(
				fileName,
				built.bundle,
				t('community.moduleFile.saveTitle'),
			);
			if (saved.status === 'cancelled') return;
			Toaster.success(t('community.moduleFile.saved', { file: fileName }));
		} catch (error) {
			Toaster.error(errText(error, t('community.moduleFile.saveError')));
		} finally {
			setBusy(false);
		}
	};

	/**
	 * RC-SYS-3.4 — write an installed system out as a `.dndmodule`. The manifest comes from the
	 * package itself (its display name, summary and version), so sharing a system needs no form: a
	 * system package is data, and everything a listing must say about it is already in it.
	 */
	const saveSystemPackage = async () => {
		if (busy) return;
		setBusy(true);
		try {
			const built = exportSystemPackageBundle(runtime.state.systems, systemId);
			if (!built.ok) {
				Toaster.error(built.reason);
				return;
			}
			const fileName = moduleBundleFileName(built.bundle.manifest);
			const saved = await downloadJsonFile(
				fileName,
				built.bundle,
				t('community.moduleFile.systemSaveTitle'),
			);
			if (saved.status === 'cancelled') return;
			Toaster.success(t('community.moduleFile.saved', { file: fileName }));
		} catch (error) {
			Toaster.error(errText(error, t('community.moduleFile.systemSaveError')));
		} finally {
			setBusy(false);
		}
	};

	const openModuleFile = async () => {
		if (busy) return;
		setBusy(true);
		try {
			const picked = await pickTextFile('.dndmodule,application/json', MAX_MODULE_FILE_BYTES);
			if (!picked) return;
			let parsed: unknown;
			try {
				parsed = JSON.parse(picked.text);
			} catch {
				Toaster.error(t('community.moduleFile.invalidJson'));
				return;
			}
			const plan = planModuleInstall(
				parsed,
				t('community.moduleFile.notAModule'),
				runtime.state.systems,
			);
			if (plan.kind === 'not-a-module') {
				Toaster.error(plan.reason);
				return;
			}
			setReview({ fileName: picked.name, plan });
		} catch (error) {
			Toaster.error(errText(error, t('community.moduleFile.openError')));
		} finally {
			setBusy(false);
		}
	};

	const confirmInstall = async () => {
		if (!review) return;
		const { plan } = review;
		const command = installPlanCommand(plan);
		if (!command) return;
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: command.type as 'widget.package.install',
				actorId: dmId,
				payload: command.payload,
			});
			if (result.status !== 'accepted') {
				Toaster.error(result.rejection.message);
				return;
			}
			Toaster.success(
				t('community.moduleFile.installed', {
					name: plan.kind === 'widget-package' ? plan.definition.id : plan.bundle.manifest.name,
					count: installPlanItemCount(plan),
				}),
			);
			setReview(null);
		} catch (error) {
			// `dispatchNow` rethrows a failed persist; without this the dialog would sit there looking
			// untouched and the DM would press Install again.
			Toaster.error(errText(error, t('community.moduleFile.installFailed')));
		} finally {
			setBusy(false);
		}
	};

	const files = review?.plan.kind === 'content-module' ? review.plan.files : [];

	return (
		<Panel title={t('community.moduleFile.title')} style={{ marginTop: 18 }}>
			<div style={{ ...eb }}>{t('community.moduleFile.hint')}</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr 140px',
					gap: 10,
				}}
			>
				<Input
					value={name}
					onChange={(e: { target: { value: string } }) => setName(e.target.value)}
					placeholder={t('community.moduleFile.namePlaceholder')}
					aria-label={t('community.moduleFile.name')}
					maxLength={80}
				/>
				<Input
					value={summary}
					onChange={(e: { target: { value: string } }) => setSummary(e.target.value)}
					placeholder={t('community.moduleFile.summaryPlaceholder')}
					aria-label={t('community.moduleFile.summary')}
					maxLength={280}
				/>
				<Input
					value={version}
					onChange={(e: { target: { value: string } }) => setVersion(e.target.value)}
					placeholder={t('community.publish.versionPlaceholder')}
					aria-label={t('community.moduleFile.version')}
					maxLength={40}
				/>
			</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
				<Button
					variant="secondary"
					size="md"
					icon="download"
					disabled={busy}
					onClick={() => void saveModule()}
				>
					{t('community.moduleFile.saveAction')}
				</Button>
				<Button
					variant="secondary"
					size="md"
					icon="import"
					disabled={busy}
					onClick={() => void openModuleFile()}
				>
					{t('community.moduleFile.installAction')}
				</Button>
			</div>
			{/* RC-SYS-3.4 — the other thing worth sharing by hand: the rules system itself. */}
			<div style={{ ...eb }}>{t('community.moduleFile.systemHint')}</div>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					alignItems: 'center',
					gap: 10,
				}}
			>
				<label htmlFor="module-file-system" style={{ font: `600 12px ${T.sans}`, color: T.sub }}>
					{t('community.moduleFile.systemLabel')}
				</label>
				<Select
					id="module-file-system"
					value={systemId}
					onChange={(e: { target: { value: string } }) => setSystemId(e.target.value)}
					style={{ maxWidth: 280 }}
					options={Object.values(runtime.state.systems.packages).map((pkg) => ({
						value: pkg.id,
						label: pkg.displayName,
					}))}
				/>
				<Button
					variant="secondary"
					size="md"
					icon="download"
					disabled={busy}
					onClick={() => void saveSystemPackage()}
				>
					{t('community.moduleFile.systemSaveAction')}
				</Button>
			</div>
			<Dialog
				open={review !== null}
				onClose={() => setReview(null)}
				title={t('community.moduleFile.reviewTitle')}
				description={t('community.moduleFile.reviewDescription')}
				icon="import"
				size="md"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setReview(null)}>
							{t('common.action.cancel')}
						</Button>
						{review?.plan.kind !== 'unsupported' && (
							<Button
								variant="primary"
								size="sm"
								icon="import"
								disabled={busy}
								onClick={() => void confirmInstall()}
							>
								{busy ? t('community.discover.working') : t('community.moduleFile.installConfirm')}
							</Button>
						)}
					</>
				}
			>
				{review && (
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
							font: `12.5px/1.6 ${T.sans}`,
							color: T.sub,
						}}
					>
						<div>
							<strong style={{ color: T.ink }}>
								{review.plan.kind === 'widget-package' && !review.plan.bundle
									? (review.plan.definition.displayName ?? review.plan.definition.id)
									: review.plan.bundle?.manifest.name}
							</strong>{' '}
							·{' '}
							{t(
								KIND_LABEL[review.plan.kind === 'unsupported' ? 'scene-package' : review.plan.kind],
							)}
						</div>
						<div>
							{t('community.moduleFile.fromFile')}{' '}
							<code style={{ font: `11.5px ${T.mono}` }}>{review.fileName}</code> ·{' '}
							{t('community.moduleFile.itemCount', { count: installPlanItemCount(review.plan) })}
						</div>
						{/* What lands, named, before anything is written. The DM reviews, then disposes. */}
						{files.length > 0 && (
							<ul style={{ margin: 0, paddingInlineStart: 18, color: T.ter }}>
								{files.slice(0, 8).map((file) => (
									<li key={file.path} style={{ font: `11.5px/1.6 ${T.mono}` }}>
										{file.path}
									</li>
								))}
								{files.length > 8 && (
									<li style={{ font: `11.5px/1.6 ${T.sans}` }}>
										{t('community.discover.moreFiles', { count: files.length - 8 })}
									</li>
								)}
							</ul>
						)}
						<div style={{ color: T.ter, font: `11.5px/1.5 ${T.sans}` }}>
							{t(
								review.plan.kind === 'unsupported'
									? 'community.discover.sceneUnsupported'
									: review.plan.kind === 'content-module'
										? 'community.discover.contentInstallNote'
										: review.plan.kind === 'system-package'
											? 'community.discover.systemInstallNote'
											: 'community.discover.installDisabledNote',
							)}
						</div>
					</div>
				)}
			</Dialog>
		</Panel>
	);
}
