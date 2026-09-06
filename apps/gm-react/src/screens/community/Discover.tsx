import { useCallback, useEffect, useState } from 'react';
import { type WidgetPackageDefinition } from '@dndtools/core';
import { Badge, Button, Dialog, EmptyState, Skeleton, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { deleteModule, getModule, listModules, type ModuleListing } from '../../cloud/appApi';
import { MarketplaceGate, errText, kb } from './shared';

export function CommDiscover() {
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const auth = useAuth();
	const dmId = runtime.defaultActorId;
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [modules, setModules] = useState<ModuleListing[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [selId, setSelId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [review, setReview] = useState<{
		listing: ModuleListing;
		definition: WidgetPackageDefinition;
		isUpgrade: boolean;
	} | null>(null);
	// Removing a listing deletes it server-side for everyone (no undo exists), so it confirms first.
	const [confirmRemove, setConfirmRemove] = useState<ModuleListing | null>(null);

	const load = useCallback(() => {
		setFailed(false);
		listModules()
			.then(setModules)
			.catch(() => setFailed(true));
	}, []);
	useEffect(() => {
		if (cloudReady) load();
	}, [cloudReady, load]);

	if (!cloudReady) return <MarketplaceGate verb="browse and install" />;

	const sel = modules?.find((m) => m.moduleId === selId) ?? modules?.[0] ?? null;

	// Fetch the payload, sanity-check the definition shape, then hand off to the review dialog. The
	// core install command re-validates the full definition fail-closed — this check is only so the
	// dialog can show honest facts (id/widget count) before the user commits.
	const startInstall = (listing: ModuleListing) => {
		setBusy(true);
		getModule(listing.moduleId)
			.then((full) => {
				const def = full.package as WidgetPackageDefinition;
				if (!def || typeof def !== 'object' || typeof def.id !== 'string' || !def.id) {
					Toaster.error('This module is not a valid widget package.');
					return;
				}
				const existing = runtime.state.widgets.packages[def.id];
				const isUpgrade = !!existing && !existing.removedAt;
				if (isUpgrade && def.id.startsWith('system.')) {
					Toaster.error(
						'This module clashes with a code-defined system package and can’t be installed.',
					);
					return;
				}
				setReview({ listing, definition: def, isUpgrade });
			})
			.catch((e: unknown) => Toaster.error(errText(e)))
			.finally(() => setBusy(false));
	};

	const confirmInstall = async () => {
		if (!review) return;
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: review.isUpgrade ? 'widget.package.upgrade' : 'widget.package.install',
				actorId: dmId,
				payload: { package: review.definition },
			});
			if (result.status === 'accepted') {
				Toaster.success(
					review.isUpgrade
						? `Upgraded ${review.definition.id} — declared migrations ran against placed widgets.`
						: `Installed ${review.definition.id} in a disabled, restricted state. Review its permissions in Extensions → Plugins before enabling it.`,
				);
				setReview(null);
			} else {
				Toaster.error(result.rejection.message);
			}
		} catch (e) {
			// `dispatchNow` RETHROWS a failed persist. Without this the review Dialog just sat there
			// looking untouched and the user re-pressed Install — `runExport` below already gets this
			// right.
			Toaster.error(e instanceof Error ? e.message : 'Could not install that package.');
		} finally {
			setBusy(false);
		}
	};

	const removeListing = (listing: ModuleListing) => {
		setBusy(true);
		deleteModule(listing.moduleId)
			.then(() => {
				setConfirmRemove(null);
				Toaster.success('Listing removed from the marketplace.');
				setModules((list) => (list ? list.filter((m) => m.moduleId !== listing.moduleId) : list));
			})
			.catch((e: unknown) => Toaster.error(errText(e)))
			.finally(() => setBusy(false));
	};

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : '1.5fr 1fr',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
				{failed ? (
					<Panel title="Modules">
						<EmptyState
							inset
							icon="warning"
							title="Couldn’t load the marketplace"
							description="Check your connection and try again."
							action={
								<Button variant="secondary" size="sm" icon="retry" onClick={load}>
									Retry
								</Button>
							}
						/>
					</Panel>
				) : modules === null ? (
					<Panel title="Modules">
						<LoadingRegion
							label="Loading modules"
							style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
						>
							<Skeleton height={96} />
							<Skeleton height={96} />
						</LoadingRegion>
					</Panel>
				) : modules.length === 0 ? (
					<EmptyState
						icon="globe"
						title="No modules published yet"
						description="Anything you publish from the Publish tab appears here for every signed-in player and DM."
					/>
				) : (
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 250px),1fr))',
							gap: 14,
						}}
					>
						{modules.map((m) => (
							<button
								key={m.moduleId}
								type="button"
								// Selection was border+shadow only, so a screen-reader user pressing these cards
								// got no confirmation that anything changed (the detail panel is elsewhere in
								// the DOM). `aria-pressed` makes the toggle state part of the button's name.
								aria-pressed={sel?.moduleId === m.moduleId}
								onClick={() => setSelId(m.moduleId)}
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 8,
									padding: 14,
									borderRadius: 12,
									cursor: 'pointer',
									textAlign: 'left',
									border: `1px solid ${sel?.moduleId === m.moduleId ? T.accBd : T.bd}`,
									background: T.surf,
									boxShadow: sel?.moduleId === m.moduleId ? T.smd : 'none',
								}}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<span style={{ font: `700 14px ${T.disp}`, flex: 1, minWidth: 0 }}>{m.name}</span>
									{m.owned && <Badge status="accent">Yours</Badge>}
								</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									v{m.version} · {kb(m.size)} · {new Date(m.publishedAt).toLocaleDateString()}
								</div>
								<div style={{ font: `12px/1.45 ${T.sans}`, color: T.sub, flex: 1 }}>
									{m.summary}
								</div>
							</button>
						))}
					</div>
				)}
			</div>
			{sel && (
				<Panel accent title={sel.name} action={<Badge status="neutral">v{sel.version}</Badge>}>
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						published {new Date(sel.publishedAt).toLocaleDateString()} · {kb(sel.size)} ·
						fingerprint {sel.contentHash.slice(0, 12)}…
					</div>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>{sel.summary}</div>
					<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
						Installing runs the standard package review flow: the package arrives disabled and
						unreviewed, with every host permission denied until you enable it in Extensions →
						Plugins.
					</div>
					<Button
						variant="primary"
						size="md"
						icon="import"
						disabled={busy}
						onClick={() => startInstall(sel)}
					>
						Install to vault
					</Button>
					{sel.owned && (
						<Button
							variant="ghost"
							size="sm"
							icon="trash"
							disabled={busy}
							onClick={() => setConfirmRemove(sel)}
						>
							Remove listing
						</Button>
					)}
				</Panel>
			)}
			<Dialog
				open={confirmRemove !== null}
				onClose={() => setConfirmRemove(null)}
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
							onClick={() => setConfirmRemove(null)}
						>
							Cancel
						</Button>
						<Button
							variant="danger"
							size="sm"
							icon="trash"
							disabled={busy}
							onClick={() => confirmRemove && removeListing(confirmRemove)}
						>
							{busy ? 'Removing…' : 'Remove listing'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					<strong style={{ color: T.ink }}>{confirmRemove?.name}</strong> disappears from Discover
					for everyone. Copies already installed in vaults keep working — you can publish it again
					later.
				</div>
			</Dialog>
			<Dialog
				open={review !== null}
				onClose={() => setReview(null)}
				title={review?.isUpgrade ? 'Upgrade this package?' : 'Install this package?'}
				description="Review what you’re adding to the vault before it lands."
				icon="import"
				size="md"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setReview(null)}>
							Cancel
						</Button>
						<Button
							variant="primary"
							size="sm"
							icon="import"
							disabled={busy}
							onClick={() => void confirmInstall()}
						>
							{busy ? 'Working…' : review?.isUpgrade ? 'Upgrade package' : 'Install package'}
						</Button>
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
								{review.definition.displayName ?? review.definition.id}
							</strong>{' '}
							· v{review.definition.version}
						</div>
						<div>
							{Array.isArray(review.definition.widgets) ? review.definition.widgets.length : 0}{' '}
							widget
							{Array.isArray(review.definition.widgets) && review.definition.widgets.length === 1
								? ''
								: 's'}{' '}
							· package id <code style={{ font: `11.5px ${T.mono}` }}>{review.definition.id}</code>
						</div>
						<div style={{ color: T.ter, font: `11.5px/1.5 ${T.sans}` }}>
							{review.isUpgrade
								? 'This upgrades your installed copy — declared migrations run against every placed widget.'
								: 'It will be installed disabled, with all host permissions blocked until you review and enable it.'}
						</div>
					</div>
				)}
			</Dialog>
		</div>
	);
}
