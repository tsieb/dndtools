import {
	buildContentModuleBundle,
	buildModuleBundle,
	buildPublishChecklist,
	exportWidgetPackage,
	type ContentExport,
	type CoreEvent,
	type PublishChecklistResult,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useViewport } from '../../app/useViewport';
import { deleteModule, listModules, publishModule, type ModuleListing } from '../../cloud/appApi';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { Toaster } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { errText, representativePlayerActorId, slugify } from './shared';

export function usePublishModel() {
	const { t, formatDate } = useI18n();
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const auth = useAuth();
	const dmId = runtime.defaultActorId;
	// A PORTABLE export must name a real player actor or core fails closed to an empty bundle, which
	// made every content-module publish report "nothing to publish" on a vault that had plenty.
	const portableViewerActorId = useMemo(
		() => representativePlayerActorId(runtime.state.permissions),
		[runtime.state.permissions],
	);
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [mine, setMine] = useState<ModuleListing[] | null>(null);
	// Failure is its own state — `mine === null` means LOADING, so folding errors into it would
	// leave a permanent fake "Loading…" after a failed fetch.
	const [mineFailed, setMineFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	// RC-CLD-4.1 — a draft publishes as one of the marketplace's listing KINDS, as a `.dndmodule`
	// bundle either way (RC-CLD-4.3): the widget package's own definition, or the `content.export`
	// result verbatim, each wrapped in a manifest that carries the version/license/changelog the
	// publish checklist requires.
	const [draft, setDraft] = useState<{
		kind: 'widget-package' | 'content-module';
		packageId: string;
		name: string;
		summary: string;
		version: string;
		license: string;
		changelog: string;
		/** RC-CLD-4.3 — cached once so the checklist and the actual publish never disagree. */
		contentExport?: ContentExport;
		widgetPortabilityWarnings?: string[];
	} | null>(null);
	// Unpublishing deletes the listing server-side for everyone (no undo exists), so it confirms first.
	const [confirmUnpublish, setConfirmUnpublish] = useState<ModuleListing | null>(null);

	const packages = useMemo(
		() =>
			Object.values(runtime.state.widgets.packages)
				.filter((rec) => !rec.removedAt && !rec.package.id.startsWith('system.'))
				.map((rec) => rec.package),
		[runtime.state.widgets],
	);

	// RC-CLD-4.3 — the publish checklist, recomputed as the draft changes. `null` until a draft is open.
	const checklist: PublishChecklistResult | null = useMemo(() => {
		if (!draft) return null;
		return buildPublishChecklist({
			version: draft.version,
			license: draft.license,
			changelog: draft.changelog,
			...(draft.kind === 'content-module'
				? { contentModuleFiles: draft.contentExport?.files }
				: { widgetPortabilityWarnings: draft.widgetPortabilityWarnings }),
		});
	}, [draft]);

	const loadMine = useCallback(() => {
		setMineFailed(false);
		setMine(null);
		listModules()
			.then((all) => setMine(all.filter((m) => m.owned)))
			.catch(() => setMineFailed(true));
	}, []);
	useEffect(() => {
		if (cloudReady) loadMine();
	}, [cloudReady, loadMine]);

	const openDraft = (def: WidgetPackageDefinition) => {
		// RC-CLD-4.3 — the SAME export the publish itself uses, computed once up front so the
		// checklist's "missing assets" item (device-local assets the export excluded) reflects exactly
		// what would actually ship rather than a re-derived guess.
		const exported = exportWidgetPackage(
			runtime.state.widgets,
			{ ids: () => runtime.newId() },
			def.id,
		);
		setDraft({
			kind: 'widget-package',
			packageId: def.id,
			name: def.displayName ?? def.id,
			summary: '',
			version: def.version,
			license: '',
			changelog: '',
			widgetPortabilityWarnings:
				'kind' in exported ? [] : [...exported.package.portabilityWarnings],
		});
	};

	// A content module is built from the vault's PORTABLE export — the same visibility-filtered,
	// secret-scrubbed projection the Export tab downloads. DM-only content is never in it.
	const openContentDraft = () => {
		setDraft({
			kind: 'content-module',
			packageId: '',
			name: '',
			summary: '',
			version: '1.0.0',
			license: '',
			changelog: '',
		});
		// RC-CLD-4.3 — fetch the export up front so the checklist can flag broken links / unbundleable
		// assets WHILE the DM is still writing the listing, not only after they hit Publish. Guarded by
		// `kind === 'content-module'` so a fast dialog-switch never overwrites a different draft.
		void runtime
			.dispatch({
				type: 'content.export',
				actorId: dmId,
				payload: { mode: 'portable', portableViewerActorId },
			})
			.then((res) => {
				if (res.status !== 'accepted') return;
				const event = res.events.find(
					(e): e is Extract<CoreEvent, { kind: 'content.exported' }> =>
						e.kind === 'content.exported',
				);
				if (!event) return;
				setDraft((d) =>
					d && d.kind === 'content-module' ? { ...d, contentExport: event.export } : d,
				);
			});
	};

	/** Build the `.dndmodule` payload for the draft, or report why it cannot be built. */
	const buildContentModule = async (
		current: NonNullable<typeof draft>,
	): Promise<{ ok: true; payload: unknown } | { ok: false; message: string }> => {
		const res = await runtime.dispatch({
			type: 'content.export',
			actorId: dmId,
			payload: { mode: 'portable', portableViewerActorId },
		});
		if (res.status !== 'accepted') return { ok: false, message: res.rejection.message };
		const event = res.events.find(
			(e): e is Extract<CoreEvent, { kind: 'content.exported' }> => e.kind === 'content.exported',
		);
		if (!event) return { ok: false, message: t('community.publish.contentEmpty') };
		const exported: ContentExport = event.export;
		if (exported.files.length === 0)
			return { ok: false, message: t('community.publish.contentEmpty') };
		const bundle = buildContentModuleBundle({
			manifest: {
				id: slugify(current.name) || 'content-module',
				name: current.name.trim(),
				summary: current.summary.trim(),
				version: current.version.trim(),
				...(current.license.trim() ? { license: current.license.trim() } : {}),
				...(current.changelog.trim() ? { changelog: current.changelog.trim() } : {}),
			},
			export: exported,
		});
		if (!bundle.ok) return { ok: false, message: bundle.reason };
		return { ok: true, payload: bundle.bundle };
	};

	const publish = () => {
		if (!draft) return;
		if (!draft.name.trim() || !draft.summary.trim() || !draft.version.trim()) {
			Toaster.error(t('community.publish.allRequired'));
			return;
		}
		// RC-CLD-4.3 — the checklist's blocking items (semver/license/changelog) are the fail-closed
		// gate; a warning (broken link / unbundleable asset) is left for the DM to decide, not blocked.
		if (checklist && !checklist.readyToPublish) {
			Toaster.error(t('community.publish.allRequired'));
			return;
		}
		const current = draft;
		setBusy(true);
		void (async () => {
			try {
				let payload: unknown;
				if (current.kind === 'content-module') {
					const built = await buildContentModule(current);
					if (!built.ok) {
						Toaster.error(built.message);
						return;
					}
					payload = built.payload;
				} else {
					const exported = exportWidgetPackage(
						runtime.state.widgets,
						{ ids: () => runtime.newId() },
						current.packageId,
					);
					if ('kind' in exported) {
						Toaster.error(
							t('extensions.plugins.exportFailed', {
								id: current.packageId,
								reason: exported.reason,
							}),
						);
						return;
					}
					// RC-CLD-4.3 — a widget package ships as a `.dndmodule` bundle too, so its manifest can
					// carry the license/changelog the checklist requires (a bare definition has nowhere to
					// put them).
					const bundle = buildModuleBundle({
						manifest: {
							kind: 'widget-package',
							id: current.packageId,
							name: current.name.trim(),
							summary: current.summary.trim(),
							version: current.version.trim(),
							...(current.license.trim() ? { license: current.license.trim() } : {}),
							...(current.changelog.trim() ? { changelog: current.changelog.trim() } : {}),
						},
						payload: exported.package,
					});
					if (!bundle.ok) {
						Toaster.error(bundle.reason);
						return;
					}
					payload = bundle.bundle;
				}
				await publishModule({
					name: current.name.trim(),
					summary: current.summary.trim(),
					version: current.version.trim(),
					kind: current.kind,
					package: payload,
				});
				Toaster.success(t('community.publish.published', { name: current.name.trim() }));
				setDraft(null);
				loadMine();
			} catch (e) {
				Toaster.error(errText(e, t('community.error')));
			} finally {
				setBusy(false);
			}
		})();
	};

	const unpublish = (listing: ModuleListing) => {
		setBusy(true);
		deleteModule(listing.moduleId)
			.then(() => {
				setConfirmUnpublish(null);
				Toaster.success(t('community.discover.listingRemoved'));
				setMine((list) => (list ? list.filter((m) => m.moduleId !== listing.moduleId) : list));
			})
			.catch((e: unknown) => Toaster.error(errText(e, t('community.error'))))
			.finally(() => setBusy(false));
	};

	return {
		t,
		formatDate,
		isPhone,
		cloudReady,
		packages,
		mine,
		mineFailed,
		busy,
		draft,
		setDraft,
		checklist,
		confirmUnpublish,
		setConfirmUnpublish,
		openDraft,
		openContentDraft,
		loadMine,
		unpublish,
		publish,
	};
}
