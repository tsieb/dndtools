import { useMemo, useState } from 'react';
import {
	getContentItemsForActor,
	listCustomObjectTypeSummaries,
	suggestCustomObjectTypeId,
	VAULT_OBJECT_SUBTYPE_KEY,
	type CustomObjectTypeDefinition,
	type VaultObjectFieldType,
} from '@dndtools/core';
import { Badge, Button, Checkbox, EmptyState, Input, Select, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { HelpBeside } from '../../app/help/ContextHelp';
import { useRuntime } from '../../runtime/RuntimeContext';
import { CustomObjectInstanceDialog } from './CustomObjectInstanceDialog';
import { CustomTypeRow } from './CustomTypeRow';
import { ReadOnlyNote } from './shared';
import { useI18n, type MessageKey, type MessageValues } from '../../i18n';

type Translate = (key: MessageKey, values?: MessageValues) => string;

/* ---- Custom object types (REAL — `content.define/update/delete-object-type` + `content.create/update-object`) */

// The field kinds are copy, so they are built per locale rather than frozen at module load.
const fieldKindOptions = (t: Translate): { value: VaultObjectFieldType; label: string }[] => [
	{ value: 'string', label: t('extensions.customTypes.kind.string') },
	{ value: 'number', label: t('extensions.customTypes.kind.number') },
	{ value: 'boolean', label: t('extensions.customTypes.kind.boolean') },
	{ value: 'string-array', label: t('extensions.customTypes.kind.stringArray') },
	{ value: 'object', label: t('extensions.customTypes.kind.object') },
	{ value: 'object-array', label: t('extensions.customTypes.kind.objectArray') },
];

interface FieldDraft {
	key: string;
	type: VaultObjectFieldType;
	required: boolean;
	dmOnly: boolean;
}

const emptyField = (): FieldDraft => ({ key: '', type: 'string', required: false, dmOnly: false });

export function CustomObjectTypes() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[dmId]?.role === 'dm';
	const canWrite = isDm && !previewing;

	const summaries = useMemo(
		() => listCustomObjectTypeSummaries(runtime.state.content.customObjectTypes),
		[runtime.state.content.customObjectTypes],
	);
	const fieldKinds = useMemo(() => fieldKindOptions(t), [t]);
	const items = getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId);
	const countFor = (typeId: string): number =>
		items.filter((i) => i.kind === 'object' && i.fields[VAULT_OBJECT_SUBTYPE_KEY] === typeId)
			.length;

	// The type-authoring form. `editId` non-null ⇒ we are updating an existing type (revision bump) rather
	// than defining a new one.
	const [editId, setEditId] = useState<string | null>(null);
	const [label, setLabel] = useState('');
	const [fields, setFields] = useState<FieldDraft[]>([emptyField()]);
	const [busy, setBusy] = useState(false);
	const [instanceOf, setInstanceOf] = useState<CustomObjectTypeDefinition | null>(null);
	// Deleting a custom type is irreversible and there is no restore command, so it takes the same
	// two-step inline confirm the widget-package remove above uses.
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

	const resetForm = () => {
		setEditId(null);
		setLabel('');
		setFields([emptyField()]);
	};

	const startEdit = (def: CustomObjectTypeDefinition) => {
		setEditId(def.id);
		setLabel(def.label);
		setFields(
			def.fields.length
				? def.fields.map((f) => ({
						key: f.key,
						type: f.type,
						required: f.required,
						dmOnly: f.dmOnly,
					}))
				: [emptyField()],
		);
	};

	const targetId = editId ?? suggestCustomObjectTypeId(label);
	const declaredFields = fields.filter((f) => f.key.trim() !== '');
	const canSubmit = canWrite && !busy && label.trim() !== '' && targetId !== 'custom:';

	const submitType = async () => {
		if (!canSubmit) return;
		setBusy(true);
		try {
			const payload = {
				id: targetId,
				label: label.trim(),
				fields: declaredFields.map((f) => ({
					key: f.key.trim(),
					type: f.type,
					required: f.required,
					dmOnly: f.dmOnly,
				})),
			};
			const res = await runtime.dispatch(
				editId
					? { type: 'content.update-object-type', actorId: dmId, payload }
					: { type: 'content.define-object-type', actorId: dmId, payload },
			);
			if (res.status === 'rejected') {
				const issues = res.rejection.issues?.map((i) => `${i.path}: ${i.message}`).join(' · ');
				Toaster.error(issues ? `${res.rejection.message} ${issues}` : res.rejection.message);
				return;
			}
			Toaster.success(
				t(editId ? 'extensions.customTypes.updated' : 'extensions.customTypes.created', {
					label: payload.label,
				}),
			);
			resetForm();
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	const deleteType = async (def: CustomObjectTypeDefinition) => {
		if (!canWrite || busy) return;
		setConfirmDeleteId(null);
		setBusy(true);
		try {
			const res = await runtime.dispatch({
				type: 'content.delete-object-type',
				actorId: dmId,
				payload: { id: def.id },
			});
			if (res.status === 'rejected') {
				Toaster.error(res.rejection.message);
				return;
			}
			Toaster.success(t('extensions.customTypes.deleted', { label: def.label }));
			if (editId === def.id) resetForm();
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<Panel
				title={t('extensions.customTypes.title')}
				action={
					<HelpBeside topic="customTypes">
						<Badge status={summaries.length ? 'accent' : 'neutral'}>
							{t('extensions.customTypes.definedCount', { count: summaries.length })}
						</Badge>
					</HelpBeside>
				}
			>
				<div
					style={{
						font: `var(--text-xs)/1.6 ${T.sans}`,
						color: T.sub,
						marginBottom: 'var(--space-1-5)',
					}}
				>
					{t('extensions.customTypes.intro')}
				</div>
				{summaries.length === 0 ? (
					<EmptyState icon="tag" title={t('extensions.customTypes.empty')} />
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
						{summaries.map((s) => {
							const def = runtime.state.content.customObjectTypes[s.id];
							return (
								<CustomTypeRow
									key={s.id}
									s={s}
									def={def}
									count={countFor(s.id)}
									canWrite={canWrite}
									busy={busy}
									confirmingDelete={!!def && confirmDeleteId === def.id}
									onNewInstance={() => def && setInstanceOf(def)}
									onEdit={() => def && startEdit(def)}
									onAskDelete={() => def && setConfirmDeleteId(def.id)}
									onDelete={() => def && void deleteType(def)}
									onKeep={() => setConfirmDeleteId(null)}
								/>
							);
						})}
					</div>
				)}
			</Panel>

			<Panel
				title={
					editId
						? t('extensions.customTypes.editType', {
								label: runtime.state.content.customObjectTypes[editId]?.label ?? editId,
							})
						: t('extensions.customTypes.defineTitle')
				}
				accent={!!editId}
			>
				{!canWrite && (
					<ReadOnlyNote>
						{t(previewing ? 'extensions.customTypes.exitPreview' : 'extensions.customTypes.dmOnly')}
					</ReadOnlyNote>
				)}
				<div
					style={{
						display: 'flex',
						gap: 'var(--space-2)',
						alignItems: 'flex-end',
						flexWrap: 'wrap',
					}}
				>
					<span style={{ flex: 1, minWidth: 160 }}>
						<label
							htmlFor="custom-type-label"
							style={{
								font: `var(--text-xs) ${T.sans}`,
								color: T.sub,
								display: 'block',
								marginBottom: 'var(--space-1)',
							}}
						>
							{t('extensions.customTypes.labelField')}
						</label>
						<Input
							id="custom-type-label"
							value={label}
							onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
							placeholder={t('extensions.customTypes.labelPlaceholder')}
							disabled={!canWrite}
						/>
					</span>
					<span
						style={{
							font: `var(--text-xs) ${T.mono}`,
							color: T.sub,
							paddingBottom: 'var(--space-2)',
						}}
					>
						{targetId}
					</span>
				</div>

				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-2)',
						marginTop: 'var(--space-2)',
					}}
				>
					<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
						{t('extensions.customTypes.fields')}
					</span>
					{fields.map((f, i) => (
						<div
							key={i}
							style={{
								display: 'flex',
								gap: 'var(--space-2)',
								alignItems: 'center',
								flexWrap: 'wrap',
							}}
						>
							<span style={{ flex: 1, minWidth: 120 }}>
								<Input
									value={f.key}
									onChange={(e: { target: { value: string } }) =>
										setFields((prev) =>
											prev.map((p, j) => (j === i ? { ...p, key: e.target.value } : p)),
										)
									}
									placeholder={t('extensions.customTypes.fieldKeyPlaceholder')}
									aria-label={t('extensions.customTypes.fieldKey', { index: i + 1 })}
									disabled={!canWrite}
								/>
							</span>
							<span style={{ flex: '0 0 130px' }}>
								<Select
									aria-label={t('extensions.customTypes.fieldKind', { index: i + 1 })}
									options={fieldKinds}
									value={f.type}
									onChange={(e: { target: { value: string } }) =>
										setFields((prev) =>
											prev.map((p, j) =>
												j === i ? { ...p, type: e.target.value as VaultObjectFieldType } : p,
											),
										)
									}
								/>
							</span>
							<Checkbox
								checked={f.required}
								onChange={(v: boolean) =>
									setFields((prev) => prev.map((p, j) => (j === i ? { ...p, required: v } : p)))
								}
								label={t('extensions.customTypes.required')}
							/>
							<Checkbox
								checked={f.dmOnly}
								onChange={(v: boolean) =>
									setFields((prev) => prev.map((p, j) => (j === i ? { ...p, dmOnly: v } : p)))
								}
								label={t('extensions.customTypes.dmOnlyField')}
							/>
							<Button
								variant="ghost"
								size="sm"
								icon="delete"
								disabled={!canWrite || fields.length === 1}
								onClick={() =>
									setFields((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)))
								}
								aria-label={t('extensions.customTypes.removeField', { index: i + 1 })}
							/>
						</div>
					))}
					<span>
						<Button
							variant="ghost"
							size="sm"
							icon="add"
							disabled={!canWrite || fields.length >= 40}
							onClick={() => setFields((prev) => [...prev, emptyField()])}
						>
							{t('extensions.customTypes.addField')}
						</Button>
					</span>
				</div>

				<div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
					<Button
						variant="primary"
						size="sm"
						icon={editId ? 'check' : 'add'}
						disabled={!canSubmit}
						onClick={submitType}
					>
						{busy
							? t('extensions.customTypes.saving')
							: editId
								? t('extensions.customTypes.saveChanges')
								: t('extensions.customTypes.defineType')}
					</Button>
					{editId && (
						<Button variant="ghost" size="sm" onClick={resetForm} disabled={busy}>
							{t('extensions.customTypes.cancelEdit')}
						</Button>
					)}
				</div>
			</Panel>

			{instanceOf && (
				<CustomObjectInstanceDialog def={instanceOf} onClose={() => setInstanceOf(null)} />
			)}
		</>
	);
}
