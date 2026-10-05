import { useState } from 'react';
import { Button, DefinitionList, Field, HelpTip, Input, Textarea } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import { Panel, T } from '../../../app/screen-kit';
import { useI18n, type MessageKey } from '../../../i18n';
import { cap } from '../../player/shared';
import type { SheetIO, SheetSubject } from './subject';

const IDENTITY_FIELDS: { key: string; label: MessageKey; hint?: MessageKey }[] = [
	{ key: 'race', label: 'player.sheet.race' },
	{ key: 'subclass', label: 'player.sheet.subclass' },
	{ key: 'background', label: 'player.sheet.background' },
	{ key: 'speed', label: 'player.sheet.speed' },
	{ key: 'init', label: 'player.sheet.init', hint: 'player.sheet.initHint' },
];

const dataString = (subject: SheetSubject, key: string): string | null => {
	const v = subject.view.data?.[key];
	return typeof v === 'string' && v.trim() !== '' ? v : null;
};

/**
 * Class, level and the identity strings (`character.edit-field` on `data.*`). Editing is the
 * owner-or-DM write, so the Edit action is drawn only for `canEdit`.
 */
export function IdentityPanel({
	subject,
	actorId,
	canEdit,
	compact,
	io,
}: {
	subject: SheetSubject;
	actorId: string;
	canEdit: boolean;
	compact: boolean;
	io: SheetIO;
}) {
	const { t } = useI18n();
	const [drafts, setDrafts] = useState<Record<string, string> | null>(null);
	const startEdit = () =>
		setDrafts(
			Object.fromEntries(IDENTITY_FIELDS.map((f) => [f.key, dataString(subject, f.key) ?? ''])),
		);
	// Save each CHANGED field; stop on the first refusal, keeping the draft so nothing typed is lost.
	const saveEdit = async () => {
		if (!drafts) return;
		for (const f of IDENTITY_FIELDS) {
			const next = (drafts[f.key] ?? '').trim();
			if (next === (dataString(subject, f.key) ?? '')) continue;
			const ok = await io.dispatch({
				type: 'character.edit-field',
				actorId,
				payload: { characterId: subject.id, path: `data.${f.key}`, value: next },
			});
			if (!ok) return;
		}
		setDrafts(null);
	};
	const cls = dataString(subject, 'class');
	return (
		<Panel
			title={t('player.sheet.identity')}
			pad={14}
			action={
				canEdit ? (
					drafts ? (
						<div style={{ display: 'flex', gap: 'var(--space-1-5)' }}>
							<Button variant="ghost" size="sm" onClick={() => setDrafts(null)}>
								{t('common.action.cancel')}
							</Button>
							<Button variant="secondary" size="sm" onClick={saveEdit}>
								{t('common.action.save')}
							</Button>
						</div>
					) : (
						<Button variant="secondary" size="sm" icon="note-edit" onClick={startEdit}>
							{t('common.action.edit')}
						</Button>
					)
				) : undefined
			}
		>
			{drafts ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
					{IDENTITY_FIELDS.map((f) => (
						<Field key={f.key} label={t(f.label)}>
							<Input
								value={drafts[f.key] ?? ''}
								placeholder={f.hint ? t(f.hint) : undefined}
								onChange={(e: DSChangeEvent) =>
									setDrafts((d) => ({ ...d, [f.key]: e.target.value }))
								}
							/>
						</Field>
					))}
					<HelpTip>{t('player.sheet.editNote')}</HelpTip>
				</div>
			) : (
				<DefinitionList
					layout={compact ? 'stacked' : 'rows'}
					items={[
						{ label: t('player.sheet.class'), value: cls ? cap(cls) : '—' },
						{
							label: t('player.sheet.level'),
							value: subject.level != null ? String(subject.level) : '—',
							mono: true,
						},
						...IDENTITY_FIELDS.map((f) => ({
							label: t(f.label),
							value: dataString(subject, f.key) ? cap(dataString(subject, f.key)!) : '—',
						})),
					]}
				/>
			)}
		</Panel>
	);
}

/** The backstory (`data.backstory`, a narrative field the owner or DM may write). */
export function BackstoryPanel({
	subject,
	actorId,
	canEdit,
	io,
}: {
	subject: SheetSubject;
	actorId: string;
	canEdit: boolean;
	io: SheetIO;
}) {
	const { t } = useI18n();
	const [draft, setDraft] = useState<string | null>(null);
	const backstory = dataString(subject, 'backstory');
	const save = async () => {
		if (draft === null) return;
		if (
			await io.dispatch({
				type: 'character.edit-field',
				actorId,
				payload: { characterId: subject.id, path: 'data.backstory', value: draft.trim() },
			})
		)
			setDraft(null);
	};
	return (
		<Panel
			title={t('player.sheet.backstory')}
			action={
				canEdit && draft === null ? (
					<Button
						variant="secondary"
						size="sm"
						icon="note-edit"
						onClick={() => setDraft(backstory ?? '')}
					>
						{t('common.action.edit')}
					</Button>
				) : undefined
			}
		>
			{draft !== null ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
					<Textarea
						rows={4}
						aria-label={t('player.sheet.backstory')}
						value={draft}
						onChange={(e: DSChangeEvent) => setDraft(e.target.value)}
						placeholder={t('player.sheet.backstoryPlaceholder')}
					/>
					<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-1-5)' }}>
						<Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
							{t('common.action.cancel')}
						</Button>
						<Button variant="secondary" size="sm" onClick={save}>
							{t('common.action.save')}
						</Button>
					</div>
				</div>
			) : backstory ? (
				<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub, whiteSpace: 'pre-wrap' }}>
					{backstory}
				</div>
			) : (
				<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
					{t('player.sheet.noBackstory')}
				</div>
			)}
		</Panel>
	);
}
