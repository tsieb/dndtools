import { useState } from 'react';
import {
	exportWidgetPackage,
	type CommandResult,
	type StarterWidgetEntry,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { downloadJsonFile, FileExportError } from '../../platform/download';
import { useI18n } from '../../i18n';

/**
 * The Plugins tab's writes: every one is a real `widget.package.*` command (DM-only), one at a time
 * behind a shared busy flag, with the outcome surfaced through the app-wide Toaster.
 */
export function usePackageActions() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const [busy, setBusy] = useState(false);
	const [jsonDraft, setJsonDraft] = useState('');

	// Shared result surfacing — transient outcomes go through the app-wide Toaster (like every other
	// tab): success copy on accept, the Core rejection (with its per-field zod/validation issues) on
	// reject. A thrown dispatch (failed durable write) also lands here.
	const finish = (result: CommandResult, okText: string) => {
		if (result.status === 'accepted') {
			Toaster.success(okText);
		} else {
			const issues = (result.rejection.issues ?? [])
				.map((i) => `${i.path}: ${i.message}`)
				.join(' · ');
			Toaster.error(issues ? `${result.rejection.message} ${issues}` : result.rejection.message);
		}
	};
	const guard = (fn: () => Promise<void>) => {
		if (busy) return;
		setBusy(true);
		void fn()
			.catch((error: unknown) =>
				Toaster.error(error instanceof Error ? error.message : String(error)),
			)
			.finally(() => setBusy(false));
	};

	const setEnabled = (packageId: string, enabled: boolean) =>
		guard(async () => {
			if (enabled) {
				finish(
					await runtime.dispatch({
						type: 'widget.package.enable',
						actorId: dmId,
						payload: { packageId },
					}),
					t('extensions.plugins.enabled', { id: packageId }),
				);
			} else {
				finish(
					await runtime.dispatch({
						type: 'widget.package.disable',
						actorId: dmId,
						payload: { packageId, reason: 'Disabled by widget manager.' },
					}),
					t('extensions.plugins.disabled', { id: packageId }),
				);
			}
		});

	const removePackage = (packageId: string) =>
		guard(async () => {
			finish(
				await runtime.dispatch({
					type: 'widget.package.remove',
					actorId: dmId,
					payload: { packageId },
				}),
				t('extensions.plugins.removed', { id: packageId }),
			);
		});

	const installStarter = (entry: StarterWidgetEntry) =>
		guard(async () => {
			finish(
				await runtime.dispatch({
					type: 'widget.package.install',
					actorId: dmId,
					payload: { package: entry.build() },
				}),
				t('extensions.plugins.installedStarter', { name: entry.name }),
			);
		});

	// RC-WID-2.7 — Export downloads the real package definition as a file, through the same
	// `exportFile` path every other export in the app uses (browser download, or the Android
	// share sheet); nothing here hand-builds the payload, `exportWidgetPackage` is the core's own.
	const exportPackage = (packageId: string) =>
		guard(async () => {
			const exported = exportWidgetPackage(
				runtime.state.widgets,
				{ ids: () => runtime.newId() },
				packageId,
			);
			if ('kind' in exported) {
				Toaster.error(
					t('extensions.plugins.exportFailed', { id: packageId, reason: exported.reason }),
				);
				return;
			}
			const filename = `${packageId.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}-${exported.package.version}.json`;
			try {
				const result = await downloadJsonFile(
					filename,
					exported.package,
					t('extensions.plugins.exportTitle', { name: exported.package.displayName }),
				);
				if (result.status === 'exported') {
					Toaster.success(t('extensions.plugins.exported', { id: packageId }));
				}
			} catch (error) {
				Toaster.error(error instanceof FileExportError ? error.message : String(error));
			}
		});

	const applyJson = () =>
		guard(async () => {
			if (jsonDraft.length > 1024 * 1024) {
				Toaster.error(t('extensions.plugins.tooLarge'));
				return;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(jsonDraft);
			} catch (error) {
				Toaster.error(
					t('extensions.plugins.badJson', {
						reason: error instanceof Error ? error.message : String(error),
					}),
				);
				return;
			}
			// Accept a raw package definition or the { package: ... } export wrapper.
			const definition = (
				parsed && typeof parsed === 'object' && 'package' in parsed
					? (parsed as { package: unknown }).package
					: parsed
			) as WidgetPackageDefinition;
			const id = definition && typeof definition === 'object' ? definition.id : undefined;
			if (typeof id !== 'string' || !id) {
				Toaster.error(t('extensions.plugins.missingId'));
				return;
			}
			const existing = runtime.state.widgets.packages[id];
			const isUpgrade = !!existing && !existing.removedAt;
			if (isUpgrade && id.startsWith('system.')) {
				Toaster.error(t('extensions.plugins.systemLocked'));
				return;
			}
			const result = await runtime.dispatch({
				type: isUpgrade ? 'widget.package.upgrade' : 'widget.package.install',
				actorId: dmId,
				payload: { package: definition },
			});
			finish(
				result,
				isUpgrade
					? t('extensions.plugins.upgraded', { id })
					: t('extensions.plugins.installedPackage', { id }),
			);
			if (result.status === 'accepted') setJsonDraft('');
		});

	return {
		busy,
		jsonDraft,
		setJsonDraft,
		setEnabled,
		removePackage,
		installStarter,
		exportPackage,
		applyJson,
	};
}
