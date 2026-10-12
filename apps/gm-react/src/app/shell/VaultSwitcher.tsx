import { useEffect, useRef, useState, type FormEvent } from 'react';
import { campaignNameOf } from '@dndtools/core';
import { Badge, Button, Dialog, Field, Icon, Input, type DSChangeEvent } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	LEGACY_LOCAL_VAULT_ID,
	LOCAL_VAULT_RENAMED_EVENT,
	createLocalVault,
	createUnnamedLocalVault,
	findDemoLocalVault,
	forgetLocalVaultPreferences,
	isPlaceholderVaultName,
	listLocalVaults,
	reloadLocalVaultDocument,
	renameLocalVault,
	resetCoreStorage,
	type LocalVault,
} from '../../platform/storage/coreStore';

/** The campaign "Back to my campaign" returns to: the most recently opened one, else the original. */
function ownCampaignVault(vaults: readonly LocalVault[]): LocalVault | undefined {
	const campaigns = vaults.filter((vault) => vault.kind === 'campaign');
	return (
		[...campaigns]
			.filter((vault) => vault.lastOpenedAt)
			.sort((a, b) => b.lastOpenedAt!.localeCompare(a.lastOpenedAt!))[0] ??
		campaigns.find((vault) => vault.id === LEGACY_LOCAL_VAULT_ID)
	);
}

/** Shared management body for the desktop chip, rail and phone More sheet.
 * Opening drains the runtime's writes, stages the choice and reloads the document into that vault.
 * RC-UX-3.7: "Explore the demo campaign" opens ONE separate demo vault (created on first use and
 * seeded on its first load), so the GM's own vaults are never touched. Inside the demo the dialog
 * offers Reset (wipe it and reseed on reload) and the way back to the GM's own campaign.
 * RC-UX-6.8: with one campaign on the device the dialog leads with what a vault is. Outside the demo
 * the demo is the first row, badged; "New campaign" asks for a name and opens the vault it creates.
 * Inside the demo, "Start my own campaign" creates an unnamed vault and opens it in one step.
 */
export function VaultSwitcher({
	onClose,
	onChanged,
	onOpenVault,
	onCreateDemo,
}: {
	onClose: () => void;
	onChanged: () => void;
	onOpenVault?: (id: string) => Promise<void>;
	onCreateDemo?: () => Promise<void>;
}) {
	const { t, formatDate } = useI18n();
	const runtime = useRuntime();
	const openVault =
		onOpenVault ?? ((id: string) => runtime.openLocalVault(id, reloadLocalVaultDocument));
	const [catalog] = useState(() => {
		try {
			return { vaults: listLocalVaults(), error: '' };
		} catch {
			return { vaults: [] as LocalVault[], error: t('vaults.catalogFailed') };
		}
	});
	const [vaults, setVaults] = useState(catalog.vaults);
	const [error, setError] = useState(catalog.error);
	const [name, setName] = useState('');
	const [editing, setEditing] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const body = useRef<HTMLDivElement>(null);
	// Closing the name form removes the focused control, so focus goes back to "New campaign".
	const [refocusNew, setRefocusNew] = useState(false);
	useEffect(() => {
		if (!refocusNew) return;
		setRefocusNew(false);
		body.current?.querySelector<HTMLElement>('[data-vault-new]')?.focus();
	}, [refocusNew]);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState('');
	const [confirmingReset, setConfirmingReset] = useState(false);
	const current = vaults.find((vault) => vault.id === runtime.vaultId);
	const inDemo = current?.kind === 'demo';
	const home = ownCampaignVault(vaults);
	const campaigns = vaults.filter((vault) => vault.kind === 'campaign');
	// Outside the demo, its own row up top opens it; inside, it is listed as the current vault.
	const listed = inDemo ? vaults : campaigns;
	const unavailable = busy || !!catalog.error;
	const campaignName = campaignNameOf(runtime.state.commandCenter);

	/** RC-UX-6.2 — the name a row shows: the open vault's campaign name, another vault's catalog name,
	 * and the placeholder for a vault nobody has named. `null` while unnamed. */
	function storedName(vault: LocalVault): string | null {
		if (vault.id === runtime.vaultId) return campaignName;
		return isPlaceholderVaultName(vault.name) ? null : vault.name;
	}
	const shownName = (vault: LocalVault) => storedName(vault) ?? t('shell.yourCampaign');

	/** Add a campaign vault and open it; the catalog name becomes its campaign's name on load. */
	async function openNewVault(create: () => LocalVault) {
		const vault = create();
		// Created even if opening fails: it is listed, so retrying opens it instead of adding another.
		setCreating(false);
		setName('');
		setVaults(listLocalVaults());
		onChanged();
		await openVault(vault.id);
	}

	async function exploreDemo() {
		const demo = findDemoLocalVault() ?? createLocalVault(t('vaults.demoName'), 'demo');
		setVaults(listLocalVaults());
		onChanged();
		await openVault(demo.id);
	}

	/** Wipe this document's demo vault, then reload: the next load finds it empty and reseeds it. */
	async function resetDemo() {
		const id = runtime.vaultId;
		// Destructive: act only on a vault the catalog positively lists as the demo.
		if (listLocalVaults().find((vault) => vault.id === id)?.kind !== 'demo') {
			throw new Error('Only the demo campaign can be reset.');
		}
		await runtime.runExclusiveMaintenance(async () => {
			await resetCoreStorage();
			forgetLocalVaultPreferences(id);
			// Keep later commands behind the lock until the runtime reflects the empty vault, so a
			// queued write cannot persist the old demo before the reload.
			await runtime.reloadFromStorage();
		});
		// Reset creates a fresh demo, unlike an authoritative backup restore. Stage its default
		// name after empty-state hydration clears the old identity; the next open adopts it.
		renameLocalVault(id, t('vaults.demoName'));
		reloadLocalVaultDocument();
	}

	/** Renaming the open vault names the campaign (every surface follows, the catalog included); any
	 * other vault's catalog entry is renamed and the campaign takes it up when that vault next opens.
	 * A new campaign is created under the typed name and opened. */
	async function save(event: FormEvent) {
		event.preventDefault();
		if (creating) {
			const typed = name;
			await run(() => openNewVault(() => createLocalVault(typed)));
			return;
		}
		setNotice('');
		setBusy(true);
		try {
			if (editing === runtime.vaultId) {
				const result = await runtime.dispatch({
					type: 'campaign.set-identity',
					actorId: runtime.defaultActorId,
					payload: { name },
				});
				if (result.status !== 'accepted') throw new Error(result.rejection.message);
				renameLocalVault(editing, name);
				window.dispatchEvent(new Event(LOCAL_VAULT_RENAMED_EVENT));
			} else if (editing) renameLocalVault(editing, name);
			setVaults(listLocalVaults());
			setName('');
			setEditing(null);
			setRefocusNew(true);
			setError('');
			setNotice(t('vaults.saved'));
			onChanged();
		} catch {
			setError(t('vaults.failed'));
		} finally {
			setBusy(false);
		}
	}

	async function run(action: () => Promise<void>) {
		setBusy(true);
		setNotice('');
		setError('');
		try {
			await action();
			onClose();
		} catch {
			setError(t('vaults.failed'));
		} finally {
			setBusy(false);
		}
	}

	/** A vault row: open it, its badges, rename it, and when it was last opened. */
	function row(vault: LocalVault) {
		return (
			<li key={vault.id} style={{ display: 'grid', gap: 'var(--space-2)' }}>
				<div
					style={{
						display: 'flex',
						gap: 'var(--space-2)',
						flexWrap: 'wrap',
						alignItems: 'center',
					}}
				>
					<Button
						disabled={busy || vault.id === runtime.vaultId}
						aria-label={t('vaults.openNamed', { name: shownName(vault) })}
						onClick={() => void run(() => openVault(vault.id))}
					>
						{shownName(vault)}
					</Button>
					{vault.kind === 'demo' && <Badge status="info">{t('vaults.demoBadge')}</Badge>}
					{vault.id === runtime.vaultId && <Badge>{t('vaults.current')}</Badge>}
					<Button
						variant="ghost"
						disabled={busy}
						aria-label={t('vaults.renameNamed', { name: shownName(vault) })}
						onClick={() => {
							setCreating(false);
							setEditing(vault.id);
							// An unnamed vault starts empty: "Your campaign" is only the placeholder.
							setName(storedName(vault) ?? '');
						}}
					>
						{t('vaults.rename')}
					</Button>
				</div>
				<span>
					{vault.lastOpenedAt
						? t('vaults.lastOpened', {
								date: formatDate(new Date(vault.lastOpenedAt), {
									dateStyle: 'medium',
									timeStyle: 'short',
								}),
							})
						: t('vaults.neverOpened')}
				</span>
			</li>
		);
	}

	function closeForm() {
		setEditing(null);
		setCreating(false);
		setName('');
		setRefocusNew(true);
	}

	return (
		<Dialog
			open
			onClose={onClose}
			title={t('vaults.title')}
			// Until the device holds a second campaign, the dialog leads with what a vault is.
			description={campaigns.length <= 1 ? t('vaults.intro') : t('vaults.description')}
			dismissible={!busy}
		>
			<div ref={body} style={{ display: 'grid', gap: 'var(--space-4)' }}>
				{error && (
					<p role="alert" style={{ display: 'flex', gap: 'var(--space-2)' }}>
						<Icon name="warning" />
						{error}
					</p>
				)}
				<p role="status" style={{ margin: 'var(--space-0)' }}>
					{busy ? t('vaults.working') : notice}
				</p>
				<ul
					aria-label={t('vaults.list')}
					style={{
						display: 'grid',
						gap: 'var(--space-4)',
						listStyle: 'none',
						margin: 'var(--space-0)',
						padding: 'var(--space-0)',
					}}
				>
					{!inDemo && (
						<li data-vault-demo-row style={{ display: 'grid', gap: 'var(--space-2)' }}>
							<div
								style={{
									display: 'flex',
									gap: 'var(--space-2)',
									flexWrap: 'wrap',
									alignItems: 'center',
								}}
							>
								<Button
									disabled={unavailable}
									onClick={() => void run(onCreateDemo ?? exploreDemo)}
								>
									{t('vaults.demo')}
								</Button>
								<Badge status="info">{t('vaults.demoBadge')}</Badge>
							</div>
							<span>{t('vaults.demoHint')}</span>
						</li>
					)}
					{listed.map(row)}
				</ul>
				{editing || creating ? (
					<form
						onSubmit={(event) => void save(event)}
						style={{ display: 'grid', gap: 'var(--space-3)' }}
					>
						<Field label={editing ? t('vaults.rename') : t('vaults.name')}>
							<Input
								value={name}
								placeholder={editing ? t('shell.yourCampaign') : undefined}
								required
								autoFocus
								maxLength={80}
								disabled={unavailable}
								onChange={(event: DSChangeEvent) => setName(event.target.value)}
							/>
						</Field>
						<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
							<Button type="submit" disabled={unavailable || !name.trim()}>
								{editing ? t('common.action.save') : t('vaults.create')}
							</Button>
							<Button variant="ghost" disabled={busy} onClick={closeForm}>
								{t('common.action.cancel')}
							</Button>
						</div>
					</form>
				) : (
					!inDemo && (
						<Button
							data-vault-new
							disabled={unavailable}
							onClick={() => {
								setNotice('');
								setCreating(true);
							}}
						>
							{t('vaults.newCampaign')}
						</Button>
					)
				)}
				{inDemo && (
					<div style={{ display: 'grid', gap: 'var(--space-2)' }}>
						<p>{t('vaults.demoHint')}</p>
						<Button
							variant="primary"
							disabled={unavailable}
							onClick={() => void run(() => openNewVault(createUnnamedLocalVault))}
						>
							{t('vaults.startOwn')}
						</Button>
						{home && (
							<Button disabled={busy} onClick={() => void run(() => openVault(home.id))}>
								{t('vaults.demoLeave')}
							</Button>
						)}
						{confirmingReset ? (
							<div role="group" aria-label={t('vaults.demoReset')}>
								<p>{t('vaults.demoResetConfirm')}</p>
								<div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
									<Button variant="danger" disabled={busy} onClick={() => void run(resetDemo)}>
										{t('vaults.demoResetAction')}
									</Button>
									<Button variant="ghost" disabled={busy} onClick={() => setConfirmingReset(false)}>
										{t('common.action.cancel')}
									</Button>
								</div>
							</div>
						) : (
							<Button variant="ghost" disabled={busy} onClick={() => setConfirmingReset(true)}>
								{t('vaults.demoReset')}
							</Button>
						)}
					</div>
				)}
			</div>
		</Dialog>
	);
}
