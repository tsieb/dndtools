import { useState } from 'react';
import { Button, Chip, TagInput } from '../../../ds';
import { Panel, T } from '../../../app/screen-kit';
import { type CharacterView } from '@dndtools/core';
import { useI18n } from '../../../i18n';
import { serializeTags, tagsOf } from '../roster';

/**
 * The character's roster tags (RC-CHR-5.3). They are what the roster's Tag filter offers, stored on
 * `data.tags` through the validated `character.edit-field` write — `data.*` fields are strings, so
 * the list is saved comma-separated and `tagsOf` reads it back. Editable behind Edit for an actor who
 * may write the field (`canEdit`, owner or DM); everyone else sees the saved tags, and nothing at all
 * when there are none.
 */
export function TagsPanel({
	view,
	canEdit,
	onSave,
}: {
	view: CharacterView;
	canEdit: boolean;
	onSave: (value: string) => Promise<boolean>;
}) {
	const { t } = useI18n();
	const saved = tagsOf(view);
	const [draft, setDraft] = useState<string[] | null>(null);
	const [editing, setEditing] = useState(false);
	const editMode = canEdit && editing;
	if (!canEdit && saved.length === 0) return null;
	const tags = draft ?? saved;
	const dirty = draft !== null && serializeTags(draft) !== serializeTags(saved);
	return (
		<Panel
			title={t('characters.tags')}
			action={
				canEdit ? (
					<Button
						variant="secondary"
						size="sm"
						icon="note-edit"
						onClick={() => {
							setEditing(!editing);
							setDraft(null);
						}}
					>
						{t(editing ? 'common.action.done' : 'common.action.edit')}
					</Button>
				) : undefined
			}
		>
			{editMode ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.two }}>
					<TagInput
						value={tags}
						onChange={setDraft}
						placeholder={t('characters.tagsPlaceholder')}
						aria-label={t('characters.tags')}
						removeTagLabel={(tag) => t('common.action.removeTag', { tag })}
					/>
					<div>
						<Button
							variant="secondary"
							size="sm"
							disabled={!dirty}
							onClick={async () => {
								if (await onSave(serializeTags(tags))) setDraft(null);
							}}
						>
							{t('characters.saveTags')}
						</Button>
					</div>
				</div>
			) : saved.length === 0 ? (
				<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
					{t('characters.none')}
				</span>
			) : (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: T.space.oneHalf }}>
					{saved.map((tag) => (
						<Chip key={tag} icon="tag">
							{tag}
						</Chip>
					))}
				</div>
			)}
		</Panel>
	);
}
