import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	getContentItemsForActor,
	listCustomObjectTypeSummaries,
	suggestCustomObjectTypeId,
	VAULT_OBJECT_SUBTYPE_KEY,
	type CustomObjectTypeDefinition,
	type VaultObjectFieldType,
} from '@dndtools/core';
import { Badge, Button, Checkbox, Dialog, Icon, Input, Select, Toaster } from '../../ds';
import { Panel, T, mono } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { eventField, VISIBILITY_WORD } from './shared';
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
					<Badge status={summaries.length ? 'accent' : 'neutral'}>
						{t('extensions.customTypes.definedCount', { count: summaries.length })}
					</Badge>
				}
			>
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					{t('extensions.customTypes.intro')}
				</div>
				{summaries.length === 0 ? (
					<div style={{ font: `12px ${T.sans}`, color: T.ter, padding: '4px 0' }}>
						{t('extensions.customTypes.empty')}
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						{summaries.map((s) => {
							const def = runtime.state.content.customObjectTypes[s.id];
							const count = countFor(s.id);
							return (
								<div
									key={s.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										// A 36px glyph, the name/meta block, a count and up to three action buttons
										// need ~350px of no-wrap width against ~327px of inner width on a 393px
										// phone. DS Button wraps its own label rather than refusing to shrink, so
										// without this the actions squeezed into unreadable slivers instead of
										// dropping to a second line. Every sibling panel already wraps.
										flexWrap: 'wrap',
										gap: 12,
										padding: 12,
										border: `1px solid ${T.bd}`,
										borderRadius: 10,
										background: T.surf,
									}}
								>
									<span
										style={{
											width: 36,
											height: 36,
											borderRadius: 9,
											background: T.alt,
											color: T.acc,
											display: 'inline-flex',
											alignItems: 'center',
											justifyContent: 'center',
											flex: '0 0 auto',
										}}
									>
										<Icon name="tag" size="md" />
									</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div
											style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
										>
											<span style={{ font: `600 13.5px ${T.sans}` }}>{s.label}</span>
											<Badge status="neutral">{t('extensions.customTypes.custom')}</Badge>
											{s.dmOnlyFields.length > 0 && (
												<Badge status="accent">
													{t('extensions.objects.dmOnlyFields', {
														count: s.dmOnlyFields.length,
													})}
												</Badge>
											)}
										</div>
										<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
											<span style={mono}>{s.id}</span>{' '}
											{t('extensions.customTypes.summaryMeta', {
												fields: s.fieldCount,
												visibility: VISIBILITY_WORD[s.defaultVisibility]
													? t(VISIBILITY_WORD[s.defaultVisibility])
													: s.defaultVisibility,
											})}
										</div>
									</div>
									<span
										style={{
											font: `12px ${T.mono}`,
											color: count ? T.ink : T.ter,
											flex: '0 0 auto',
										}}
									>
										{t('extensions.objects.inVault', { count })}
									</span>
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 8,
											flex: '0 0 auto',
											flexWrap: 'wrap',
										}}
									>
										{def && (
											<Button
												variant="secondary"
												size="sm"
												icon="add"
												disabled={!canWrite || busy}
												onClick={() => setInstanceOf(def)}
											>
												{t('extensions.customTypes.new')}
											</Button>
										)}
										{def && (
											<Button
												variant="ghost"
												size="sm"
												icon="edit"
												disabled={!canWrite || busy}
												onClick={() => startEdit(def)}
											>
												{t('common.action.edit')}
											</Button>
										)}
										{def && confirmDeleteId === def.id && (
											<>
												<Button
													variant="danger"
													size="sm"
													// Same self-unmounting trigger as the package Remove above: without this the
													// confirm renders with focus stranded on <body>.
													autoFocus
													disabled={!canWrite || busy}
													onClick={() => deleteType(def)}
												>
													{count > 0
														? t('extensions.customTypes.confirmDeleteCount', { count })
														: t('extensions.customTypes.confirmDelete')}
												</Button>
												<Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
													{t('extensions.compendium.keep')}
												</Button>
											</>
										)}
										{def && confirmDeleteId !== def.id && (
											<Button
												variant="ghost"
												size="sm"
												icon="delete"
												disabled={!canWrite || busy}
												onClick={() => setConfirmDeleteId(def.id)}
											>
												{t('common.action.delete')}
											</Button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</Panel>

			<Panel
				title={
					editId
						? t('extensions.customTypes.editType', { id: editId })
						: t('extensions.customTypes.defineTitle')
				}
				accent={!!editId}
			>
				{!canWrite && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter, marginBottom: 4 }}>
						{t(previewing ? 'extensions.customTypes.exitPreview' : 'extensions.customTypes.dmOnly')}
					</div>
				)}
				<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
					<span style={{ flex: 1, minWidth: 160 }}>
						<label
							style={{ font: `11.5px ${T.sans}`, color: T.sub, display: 'block', marginBottom: 4 }}
						>
							{t('extensions.customTypes.label')}
						</label>
						<Input
							value={label}
							onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
							placeholder={t('extensions.customTypes.labelPlaceholder')}
							aria-label={t('extensions.customTypes.labelField')}
							disabled={!canWrite}
						/>
					</span>
					<span style={{ font: `11.5px ${T.mono}`, color: T.ter, paddingBottom: 8 }}>
						{targetId}
					</span>
				</div>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
					<span style={{ font: `11.5px ${T.sans}`, color: T.sub }}>
						{t('extensions.customTypes.fields')}
					</span>
					{fields.map((f, i) => (
						<div
							key={i}
							style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
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

				<div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
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

/* ---- Create an instance of a custom type (dispatches `content.create-object` with the custom subtype) */
function CustomObjectInstanceDialog({
	def,
	onClose,
}: {
	def: CustomObjectTypeDefinition;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const dmId = runtime.defaultActorId;
	const [title, setTitle] = useState('');
	const [values, setValues] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);

	const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

	// Coerce a form string into the field's declared kind (fail-closed validation still runs in the Core).
	const coerce = (type: VaultObjectFieldType, raw: string): unknown => {
		const trimmed = raw.trim();
		if (trimmed === '') return undefined;
		// `Number('abc')` is NaN, and NaN passed straight through as the field value: the Core stored
		// it, JSON-serialised it to `null`, and the user got no error. Treat unparseable as absent.
		if (type === 'number') {
			const n = Number(trimmed);
			return Number.isFinite(n) ? n : undefined;
		}
		if (type === 'boolean') return trimmed === 'true';
		if (type === 'string-array')
			return trimmed
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		return trimmed;
	};

	const create = async () => {
		if (busy || title.trim() === '') return;
		setBusy(true);
		try {
			const built: Record<string, unknown> = {};
			for (const f of def.fields) {
				const v = coerce(f.type, values[f.key] ?? '');
				if (v !== undefined) built[f.key] = v;
			}
			const res = await runtime.dispatch({
				type: 'content.create-object',
				actorId: dmId,
				payload: { subtype: def.id, title: title.trim(), fields: built },
			});
			if (res.status === 'rejected') {
				const issues = res.rejection.issues?.map((i) => `${i.path}: ${i.message}`).join(' · ');
				Toaster.error(issues ? `${res.rejection.message} ${issues}` : res.rejection.message);
				return;
			}
			const id = eventField(res, 'content.object-changed', 'itemId');
			Toaster.success(
				t('extensions.customTypes.instanceCreated', { title: title.trim() }),
				id
					? {
							action: t('extensions.compendium.open'),
							onAction: () => navigate(`/knowledge/${id}`),
						}
					: undefined,
			);
			onClose();
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open
			onClose={onClose}
			title={t('extensions.customTypes.newInstance', { label: def.label })}
			description={def.id}
			size="md"
			footer={
				<>
					<Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="add"
						disabled={busy || title.trim() === ''}
						onClick={create}
					>
						{busy ? t('extensions.customTypes.creating') : t('common.action.create')}
					</Button>
				</>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
				<span>
					{/* Orphan label — no `htmlFor`, not wrapping the control — so clicking "Title" focused
					    nothing, the same gap already closed for the custom fields below. */}
					<label
						htmlFor="custom-object-title"
						style={{ font: `11.5px ${T.sans}`, color: T.sub, display: 'block', marginBottom: 4 }}
					>
						{/* Reads "Object title", not "Title": an `aria-label` OVERRIDES a wired <label>, so the
						    visible word and the accessible name disagreed — the label fixed above was
						    announced to nobody, and voice control ("click Title") could not reach the
						    field (WCAG 2.5.3). Matching the two lets the aria-label go. */}
						{t('extensions.customTypes.objectTitle')}
					</label>
					<Input
						id="custom-object-title"
						value={title}
						onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
						placeholder={t('common.field.title')}
					/>
				</span>
				{def.fields.map((f) => (
					<span key={f.key}>
						{/* The label was an ORPHAN (no htmlFor, not wrapping the control) while the control
						 * carried `aria-label={f.key}` — which wins, so "required" and "DM-only" never
						 * reached the accessible name and clicking the label focused nothing. DM-only in
						 * particular decides whether the value reaches players, so it must be announced. */}
						<label
							htmlFor={`custom-field-${f.key}`}
							style={{
								font: `11.5px ${T.sans}`,
								color: T.sub,
								display: 'flex',
								gap: 6,
								marginBottom: 4,
							}}
						>
							{f.key}
							<span style={{ color: T.ter }}>· {f.type}</span>
							{f.required && (
								<span style={{ color: T.acc }}>{t('extensions.customTypes.requiredWord')}</span>
							)}
							{f.dmOnly && (
								<span style={{ color: T.acc }}>{t('extensions.customTypes.dmOnlyWord')}</span>
							)}
						</label>
						{f.type === 'boolean' ? (
							<Select
								id={`custom-field-${f.key}`}
								aria-required={f.required || undefined}
								options={[
									{ value: '', label: '—' },
									{ value: 'true', label: t('extensions.customTypes.true') },
									{ value: 'false', label: t('extensions.customTypes.false') },
								]}
								value={values[f.key] ?? ''}
								onChange={(e: { target: { value: string } }) => setValue(f.key, e.target.value)}
							/>
						) : (
							<Input
								id={`custom-field-${f.key}`}
								aria-required={f.required || undefined}
								// A `number` field was a plain text input: phones raised the alphabetic keyboard
								// and there was no spinner, no step and no rejection of letters.
								type={f.type === 'number' ? 'number' : 'text'}
								inputMode={f.type === 'number' ? 'decimal' : undefined}
								value={values[f.key] ?? ''}
								onChange={(e: { target: { value: string } }) => setValue(f.key, e.target.value)}
								placeholder={
									f.type === 'string-array' ? t('extensions.customTypes.commaSeparated') : f.type
								}
							/>
						)}
					</span>
				))}
			</div>
		</Dialog>
	);
}
