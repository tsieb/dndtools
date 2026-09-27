import { useState } from 'react';
import { Button, Dialog, IconButton } from '../../ds';
import { useI18n } from '../../i18n';

/** Keep a failed deletion reviewable and restore focus through the shared dialog. */
export function PrivateDelete({
	name,
	label,
	remove,
}: {
	name: string;
	label: string;
	remove: () => Promise<void>;
}) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);
	const confirm = async () => {
		setBusy(true);
		setError(false);
		try {
			await remove();
			setOpen(false);
		} catch {
			setError(true);
		} finally {
			setBusy(false);
		}
	};
	return (
		<>
			<IconButton icon="delete" size="sm" label={label} onClick={() => setOpen(true)} />
			<Dialog
				open={open}
				title={t('play.polish.deleteTitle', { name })}
				description={t('play.polish.deleteBody')}
				tone="danger"
				size="sm"
				backdropDismissible={false}
				dismissible={!busy}
				initialFocus="[data-cancel-delete]"
				onClose={() => setOpen(false)}
				footer={
					<>
						<Button data-cancel-delete disabled={busy} onClick={() => setOpen(false)}>
							{t('play.polish.cancel')}
						</Button>
						<Button variant="danger" disabled={busy} onClick={confirm}>
							{t(busy ? 'play.polish.working' : 'play.polish.delete')}
						</Button>
					</>
				}
			>
				{error && <p role="alert">{t('play.polish.saveError')}</p>}
			</Dialog>
		</>
	);
}
