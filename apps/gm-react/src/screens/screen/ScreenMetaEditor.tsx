import type React from 'react';
import { useState } from 'react';
import { Button, Field, Icon, Input, TagInput, Textarea } from '../../ds';
import { useI18n } from '../../i18n';
import { T } from '../../app/screen-kit';

/**
 * The inline editor under a library card for renaming a screen and editing its description and tags
 * (`scene.update-metadata`). `onSave` resolves to a rejection message, shown inline, or null on
 * success; Escape collapses the editor. Moved here from the old `/scenes` list, which it served the
 * same way.
 */
export function ScreenMetaEditor({
	idBase,
	name,
	description,
	tags,
	onSave,
	onClose,
}: {
	idBase: string;
	name: string;
	description: string;
	tags: string[];
	onSave: (meta: { name: string; description: string; tags: string[] }) => Promise<string | null>;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const [draftName, setDraftName] = useState(name);
	const [draftDescription, setDraftDescription] = useState(description);
	const [draftTags, setDraftTags] = useState(tags);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function save() {
		if (!draftName.trim() || saving) return;
		setSaving(true);
		try {
			setError(
				await onSave({
					name: draftName.trim(),
					description: draftDescription.trim(),
					tags: draftTags,
				}),
			);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div
			data-testid="screen-meta-editor"
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					onClose();
				}
			}}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.three,
				padding: T.space.three,
				borderRadius: T.radius.md,
				background: T.sunken,
				border: `1px solid ${T.bd}`,
			}}
		>
			<Field label={t('scenes.name')} htmlFor={`${idBase}-name`} required>
				<Input
					id={`${idBase}-name`}
					autoFocus
					value={draftName}
					onChange={(e: { target: { value: string } }) => setDraftName(e.target.value)}
					onKeyDown={(e: React.KeyboardEvent) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							void save();
						}
					}}
				/>
			</Field>
			<Field label={t('scenes.description')} htmlFor={`${idBase}-description`}>
				<Textarea
					id={`${idBase}-description`}
					rows={2}
					value={draftDescription}
					onChange={(e: { target: { value: string } }) => setDraftDescription(e.target.value)}
				/>
			</Field>
			<Field label={t('scenes.tags')} htmlFor={`${idBase}-tags`} help={t('scenes.tagsHelp')}>
				<TagInput
					id={`${idBase}-tags`}
					value={draftTags}
					onChange={setDraftTags}
					placeholder={t('scenes.tagsPlaceholder')}
					removeTagLabel={(tag) => t('common.action.removeTag', { tag })}
				/>
			</Field>
			{error && (
				<span
					role="alert"
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: T.space.oneHalf,
						color: 'var(--color-status-error-text)',
						font: `var(--text-xs) ${T.sans}`,
					}}
				>
					<Icon name="error" size="sm" /> {error}
				</span>
			)}
			<div style={{ display: 'flex', gap: T.space.two }}>
				<Button
					variant="secondary"
					size="sm"
					icon="check"
					disabled={saving || !draftName.trim()}
					// A disabled control names its reason (the RC-ENG-8.1 journey health rule).
					title={
						saving
							? t('scenes.saving')
							: !draftName.trim()
								? `${t('scenes.name')} · ${t('extensions.customTypes.required')}`
								: undefined
					}
					onClick={() => void save()}
				>
					{saving ? t('scenes.saving') : t('scenes.saveDetails')}
				</Button>
				<Button variant="ghost" size="sm" onClick={onClose}>
					{t('common.action.cancel')}
				</Button>
			</div>
		</div>
	);
}
