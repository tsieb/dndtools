import { useMemo, useState } from 'react';
import { Button, Dialog, Toaster } from '../ds';
import { T } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { useI18n, type MessageKey } from '../i18n';
import {
	installPlanItemCount,
	planModuleInstall,
	type InstallPlan,
} from '../screens/community/moduleInstall';
import { clearSharedImport, parseSharedJson, useSharedImport } from './shareTarget';

/**
 * RC-PLT-2.2 — the review a file shared into Lamplight from another Android app must pass.
 *
 * It lives in the platform layer because a share can land on any screen: it is the shell, not a
 * destination, that owns it. The plan and the commands are the SAME ones the Community screen
 * runs for a marketplace install — a shared file gets no shortcut past the core's review.
 */

const KIND_LABEL: Record<InstallPlan['kind'], MessageKey> = {
	'widget-package': 'share.import.kindWidget',
	'content-module': 'share.import.kindContent',
	'system-package': 'share.import.kindSystem',
	unsupported: 'share.import.kindUnsupported',
	'not-a-module': 'share.import.kindUnknown',
};

export function ShareImportDialog() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const pending = useSharedImport();
	const [busy, setBusy] = useState(false);

	const plan = useMemo((): InstallPlan | null => {
		if (!pending) return null;
		const parsed = parseSharedJson(pending.share.text);
		if (!parsed.ok) return { kind: 'not-a-module', reason: t('share.import.notJson') };
		return planModuleInstall(parsed.value, t('share.import.notAPackage'));
	}, [pending, t]);

	const close = () => {
		if (busy) return;
		clearSharedImport();
	};

	const runImport = async () => {
		if (!plan || busy) return;
		const installed =
			plan.kind === 'widget-package' ? runtime.state.widgets.packages[plan.definition.id] : null;
		const isUpgrade = !!installed && !installed.removedAt;
		const command =
			plan.kind === 'widget-package'
				? {
						type: isUpgrade ? 'widget.package.upgrade' : 'widget.package.install',
						payload: { package: plan.definition },
					}
				: plan.kind === 'system-package'
					? { type: 'system.define', payload: { package: plan.systemPackage } }
					: plan.kind === 'content-module'
						? {
								// The same transactional import the Community screen and the Knowledge screen
								// run. `skip` never overwrites a note the DM already has.
								type: 'content.commit-import',
								payload: {
									sourceKind: 'markdown-archive',
									policy: 'skip',
									files: plan.files,
									appliedEntryIds: [],
								},
							}
						: null;
		if (!command) return;
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: command.type as 'widget.package.install',
				actorId: runtime.defaultActorId,
				payload: command.payload,
			});
			if (result.status === 'accepted') {
				Toaster.success(
					t('share.import.done', {
						name: pending?.share.filename ?? '',
						count: installPlanItemCount(plan),
					}),
				);
				clearSharedImport();
			} else {
				Toaster.error(result.rejection.message);
			}
		} catch {
			// `dispatch` rethrows a failed persist; without this the dialog would sit there looking
			// untouched and the DM would press Import again.
			Toaster.error(t('share.import.failed'));
		} finally {
			setBusy(false);
		}
	};

	const importable =
		plan !== null &&
		(plan.kind === 'widget-package' ||
			plan.kind === 'system-package' ||
			plan.kind === 'content-module');

	return (
		<Dialog
			open={pending !== null}
			onClose={close}
			title={t('share.import.title')}
			description={t('share.import.description')}
			icon="import"
			size="sm"
			footer={
				<>
					<Button variant="secondary" size="sm" disabled={busy} onClick={close}>
						{t(importable ? 'common.action.cancel' : 'common.action.close')}
					</Button>
					{importable && (
						<Button
							variant="primary"
							size="sm"
							icon="import"
							disabled={busy}
							onClick={() => void runImport()}
						>
							{busy ? t('share.import.working') : t('share.import.action')}
						</Button>
					)}
				</>
			}
		>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, display: 'grid', gap: 6 }}>
				<strong style={{ color: T.ink }}>{pending?.share.filename}</strong>
				{plan && <span>{t(KIND_LABEL[plan.kind])}</span>}
				{plan?.kind === 'not-a-module' && <span>{plan.reason}</span>}
				{plan?.kind === 'unsupported' && <span>{t('share.import.unsupportedBody')}</span>}
				{importable && plan && (
					<span>{t('share.import.willAdd', { count: installPlanItemCount(plan) })}</span>
				)}
			</div>
		</Dialog>
	);
}
