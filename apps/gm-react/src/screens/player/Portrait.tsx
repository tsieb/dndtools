import { useId, useState } from 'react';
import type { CharacterView } from '@dndtools/core';
import { useI18n } from '../../i18n';
import { Avatar } from '../../ds';
import { useAssetObjectUrl } from '../../platform/assetUrl';
import { putAssetBytes } from '../../platform/storage/assetStore';
import type { Dispatch } from './shared';

/** Only the content-addressed ID enters the character record; bytes stay in the asset store. */
export function Portrait({
	character,
	actorId,
	canEdit,
	dispatch,
}: {
	character: CharacterView;
	actorId: string;
	canEdit: boolean;
	dispatch: Dispatch;
}) {
	const inputId = useId();
	const { t } = useI18n();
	const assetId =
		typeof character.data.portraitAssetId === 'string' ? character.data.portraitAssetId : null;
	const src = useAssetObjectUrl(assetId);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function upload(file: File) {
		setError(null);
		if (
			!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
			file.size > 5 * 1024 * 1024
		) {
			setError(t('player.portrait.invalid'));
			return;
		}
		setBusy(true);
		try {
			const bitmap = await createImageBitmap(file);
			bitmap.close();
			const id = await putAssetBytes(new Uint8Array(await file.arrayBuffer()), file.type);
			await dispatch({
				type: 'character.edit-field',
				actorId,
				payload: { characterId: character.id, path: 'data.portraitAssetId', value: id },
			});
		} catch {
			setError(t('player.portrait.failed'));
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="character-sheet-portrait">
			<Avatar name={character.name} src={src ?? undefined} size="xl" ring="active" />
			{canEdit && (
				<label className="character-sheet-portrait-upload" htmlFor={inputId}>
					{t('player.portrait.label')}
					<input
						id={inputId}
						className="visually-hidden"
						type="file"
						accept="image/png,image/jpeg,image/webp"
						disabled={busy}
						onChange={(event) => {
							const file = event.target.files?.[0];
							event.target.value = '';
							if (file) void upload(file);
						}}
					/>
				</label>
			)}
			{busy && <span role="status">{t('player.portrait.saving')}</span>}
			{error && <span role="alert">{error}</span>}
		</div>
	);
}
