import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportWidgetPackage, type WidgetPackageDefinition } from '@dndtools/core';
import { Button, Dialog, EmptyState, Icon, Input, Skeleton, Textarea, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { deleteModule, listModules, publishModule, type ModuleListing } from '../../cloud/appApi';
import { MarketplaceGate, errText } from './shared';

export function CommPublish() {
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const auth = useAuth();
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [mine, setMine] = useState<ModuleListing[] | null>(null);
	// Failure is its own state — `mine === null` means LOADING, so folding errors into it would
	// leave a permanent fake "Loading…" after a failed fetch.
	const [mineFailed, setMineFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [draft, setDraft] = useState<{
		packageId: string;
		name: string;
		summary: string;
		version: string;
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

	if (!cloudReady) return <MarketplaceGate verb="publish" />;

	const openDraft = (def: WidgetPackageDefinition) =>
		setDraft({
			packageId: def.id,
			name: def.displayName ?? def.id,
			summary: '',
			version: def.version,
		});

	const publish = () => {
		if (!draft) return;
		if (!draft.name.trim() || !draft.summary.trim() || !draft.version.trim()) {
			Toaster.error('Name, summary and version are all required.');
			return;
		}
		const exported = exportWidgetPackage(
			runtime.state.widgets,
			{ ids: () => runtime.newId() },
			draft.packageId,
		);
		if ('kind' in exported) {
			Toaster.error(`Package ${draft.packageId} could not be exported (${exported.reason}).`);
			return;
		}
		setBusy(true);
		publishModule({
			name: draft.name.trim(),
			summary: draft.summary.trim(),
			version: draft.version.trim(),
			package: exported.package,
		})
			.then(() => {
				Toaster.success(`Published ${draft.name.trim()} to the marketplace.`);
				setDraft(null);
				loadMine();
			})
			.catch((e: unknown) => Toaster.error(errText(e)))
			.finally(() => setBusy(false));
	};

	const unpublish = (listing: ModuleListing) => {
		setBusy(true);
		deleteModule(listing.moduleId)
			.then(() => {
				setConfirmUnpublish(null);
				Toaster.success('Listing removed from the marketplace.');
				setMine((list) => (list ? list.filter((m) => m.moduleId !== listing.moduleId) : list));
			})
			.catch((e: unknown) => Toaster.error(errText(e)))
			.finally(() => setBusy(false));
	};

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : '1.3fr 1fr',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<Panel title="Publish an installed package">
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					Publishing shares one of your installed widget packages (its full exported definition)
					with every signed-in user. System packages are code-defined and can’t be published.
				</div>
				{packages.length === 0 ? (
					<EmptyState
						icon="widget"
						title="No publishable packages"
						description="Install or author a widget package in Extensions → Plugins first — system packages stay private."
					/>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{packages.map((def, i) => (
							<div
								key={def.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 12,
									padding: '11px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<span
									style={{
										width: 34,
										height: 34,
										borderRadius: 8,
										flex: '0 0 auto',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: T.alt,
										color: T.acc,
									}}
								>
									<Icon name="widget" size="sm" />
								</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{def.displayName ?? def.id}</div>
									<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
										{def.id} · v{def.version} · {def.widgets.length} widget
										{def.widgets.length === 1 ? '' : 's'}
									</div>
								</div>
								<Button
									variant="secondary"
									size="sm"
									icon="upload"
									disabled={busy}
									onClick={() => openDraft(def)}
								>
									Publish
								</Button>
							</div>
						))}
					</div>
				)}
			</Panel>
			<Panel accent title="Your listings">
				{mineFailed ? (
					<EmptyState
						inset
						icon="warning"
						title="Couldn’t load your listings"
						description="Check your connection and try again."
						action={
							<Button variant="secondary" size="sm" icon="retry" onClick={loadMine}>
								Retry
							</Button>
						}
					/>
				) : mine === null ? (
					<LoadingRegion
						label="Loading your listings"
						style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
					>
						<Skeleton height={44} />
						<Skeleton height={44} />
					</LoadingRegion>
				) : mine.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Nothing published yet.</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{mine.map((m, i) => (
							<div
								key={m.moduleId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '10px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{m.name}</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										v{m.version} · {new Date(m.publishedAt).toLocaleDateString()}
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => setConfirmUnpublish(m)}
								>
									Remove
								</Button>
							</div>
						))}
					</div>
				)}
			</Panel>
			<Dialog
				open={confirmUnpublish !== null}
				onClose={() => setConfirmUnpublish(null)}
				title="Remove this listing?"
				description="Deleted from the marketplace server-side — this cannot be undone."
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setConfirmUnpublish(null)}
						>
							Cancel
						</Button>
						<Button
							variant="danger"
							size="sm"
							icon="trash"
							disabled={busy}
							onClick={() => confirmUnpublish && unpublish(confirmUnpublish)}
						>
							{busy ? 'Removing…' : 'Remove listing'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					<strong style={{ color: T.ink }}>{confirmUnpublish?.name}</strong> disappears from
					Discover for everyone. Copies already installed in vaults keep working — your local
					package stays, so you can publish it again later.
				</div>
			</Dialog>
			<Dialog
				open={draft !== null}
				onClose={() => setDraft(null)}
				title="Publish to the marketplace"
				description="Shown to everyone browsing Discover — write it for a stranger’s table."
				icon="upload"
				size="md"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setDraft(null)}>
							Cancel
						</Button>
						<Button variant="primary" size="sm" icon="upload" disabled={busy} onClick={publish}>
							{busy ? 'Publishing…' : 'Publish module'}
						</Button>
					</>
				}
			>
				{draft && (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Input
							value={draft.name}
							onChange={(e: { target: { value: string } }) =>
								setDraft((d) => (d ? { ...d, name: e.target.value } : d))
							}
							placeholder="Module name"
							aria-label="Module name"
							maxLength={80}
						/>
						<Textarea
							value={draft.summary}
							onChange={(e: { target: { value: string } }) =>
								setDraft((d) => (d ? { ...d, summary: e.target.value } : d))
							}
							placeholder="What does this add to a table? (required)"
							aria-label="Module summary"
							rows={3}
							maxLength={280}
						/>
						<Input
							value={draft.version}
							onChange={(e: { target: { value: string } }) =>
								setDraft((d) => (d ? { ...d, version: e.target.value } : d))
							}
							placeholder="Version (e.g. 1.0.0)"
							aria-label="Module version"
							maxLength={20}
						/>
					</div>
				)}
			</Dialog>
		</div>
	);
}
