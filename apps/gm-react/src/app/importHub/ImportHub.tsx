import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasDmAuthority } from '@dndtools/core';
import { Button, Dialog } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { isFsSourceSupported } from '../../platform/fsSource';
import { IMPORTERS, IMPORT_HUB_EVENT, type ImporterId } from './registry';

export const IMPORT_HUB_ROWS = {
	'markdown-zip': 'importHub.zip',
	'markdown-folder': 'importHub.folder',
	notes: 'importHub.notes',
	characters: 'importHub.characters',
	maps: 'importHub.maps',
	audio: 'importHub.audio',
	backup: 'importHub.backup',
	module: 'importHub.module',
	scene: 'importHub.scene',
} as const satisfies Record<ImporterId, MessageKey>;

/** `defaultOpen`: the help host mounts the hub on its first open event, so it starts open. */
export function ImportHub({ defaultOpen = false }: { defaultOpen?: boolean }) {
	const [open, setOpen] = useState(defaultOpen);
	const { t } = useI18n();
	const navigate = useNavigate();
	const runtime = useRuntime();
	const actor = runtime.state.permissions.actors[runtime.defaultActorId];
	const canImport = !!actor && hasDmAuthority(actor.role) && !runtime.readOnly;
	useEffect(() => {
		const show = () => setOpen(true);
		window.addEventListener(IMPORT_HUB_EVENT, show);
		return () => window.removeEventListener(IMPORT_HUB_EVENT, show);
	}, []);
	return (
		<Dialog
			open={open}
			onClose={() => setOpen(false)}
			title={t('importHub.title')}
			description={t('importHub.description')}
			size="md"
			icon="import"
		>
			{!canImport && <p>{t('importHub.readOnly')}</p>}
			<ul
				style={{
					listStyle: 'none',
					padding: 'var(--space-0)',
					margin: 'var(--space-0)',
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-4)',
				}}
			>
				{(Object.keys(IMPORTERS) as ImporterId[]).map((id) => {
					const key = IMPORT_HUB_ROWS[id];
					const unsupported = id === 'markdown-folder' && !isFsSourceSupported();
					return (
						<li key={id} data-importer={id}>
							<Button
								variant="secondary"
								icon="import"
								disabled={!canImport || unsupported}
								onClick={() => {
									setOpen(false);
									navigate(IMPORTERS[id], { state: { importer: id } });
								}}
							>
								{t(key)}
							</Button>
							<p style={{ margin: 'var(--space-1) 0', color: 'var(--color-text-secondary)' }}>
								{t(`${key}.description`)}
							</p>
							{unsupported && <p>{t('importHub.folderUnsupported')}</p>}
						</li>
					);
				})}
			</ul>
		</Dialog>
	);
}
