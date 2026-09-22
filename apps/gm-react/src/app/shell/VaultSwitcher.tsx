import { useState, type FormEvent } from 'react';
import { Badge, Button, Dialog, Field, Input, type DSChangeEvent } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	createLocalVault,
	listLocalVaults,
	reloadLocalVaultDocument,
	renameLocalVault,
	type LocalVault,
} from '../../platform/storage/coreStore';

/** Shared management body for the desktop chip, rail and phone More sheet.
 * Opening drains the runtime's writes, stages the choice and reloads the document into that vault.
 * UX-3.7 supplies the demo action; it must create a separate vault before populating it.
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
		} catch (error) {
			return { vaults: [] as LocalVault[], error: String(error) };
		}
	});
	const [vaults, setVaults] = useState(catalog.vaults);
	const [error, setError] = useState(catalog.error);
	const [name, setName] = useState('');
	const [editing, setEditing] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	function save(event: FormEvent) {
		event.preventDefault();
		try {
			if (editing) renameLocalVault(editing, name);
			else createLocalVault(name);
			setVaults(listLocalVaults());
			setName('');
			setEditing(null);
			setError('');
			onChanged();
		} catch (failure) {
			setError(String(failure));
		}
	}

	async function run(action: () => Promise<void>) {
		setBusy(true);
		setError('');
		try {
			await action();
			onClose();
		} catch (failure) {
			setError(String(failure));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open
			onClose={onClose}
			title={t('vaults.title')}
			description={t('vaults.description')}
			dismissible={!busy}
		>
			<div style={{ display: 'grid', gap: 'var(--space-4)' }}>
				{error && <p role="alert">{error}</p>}
				{vaults.map((vault) => (
					<div key={vault.id} style={{ display: 'grid', gap: 'var(--space-2)' }}>
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
								aria-label={t('vaults.openNamed', { name: vault.name })}
								onClick={() => void run(() => openVault(vault.id))}
							>
								{vault.name}
							</Button>
							{vault.id === runtime.vaultId && <Badge>{t('vaults.current')}</Badge>}
							<Button
								variant="ghost"
								disabled={busy}
								aria-label={t('vaults.renameNamed', { name: vault.name })}
								onClick={() => {
									setEditing(vault.id);
									setName(vault.name);
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
					</div>
				))}
				<form onSubmit={save} style={{ display: 'grid', gap: 'var(--space-3)' }}>
					<Field label={editing ? t('vaults.rename') : t('vaults.name')}>
						<Input
							value={name}
							required
							maxLength={80}
							disabled={busy || !!catalog.error}
							onChange={(event: DSChangeEvent) => setName(event.target.value)}
						/>
					</Field>
					<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
						<Button type="submit" disabled={busy || !name.trim() || !!catalog.error}>
							{editing ? t('common.action.save') : t('vaults.create')}
						</Button>
						{editing && (
							<Button
								variant="ghost"
								onClick={() => {
									setEditing(null);
									setName('');
								}}
							>
								{t('common.action.cancel')}
							</Button>
						)}
					</div>
				</form>
				{onCreateDemo ? (
					<Button disabled={busy} onClick={() => void run(onCreateDemo)}>
						{t('vaults.demo')}
					</Button>
				) : (
					<p>{t('vaults.demoUnavailable')}</p>
				)}
			</div>
		</Dialog>
	);
}
