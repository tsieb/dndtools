import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CustomObjectTypeDefinition, VaultObjectFieldType } from '@dndtools/core';
import { Button, Dialog, Input, Select, Toaster } from '../../ds';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import { eventField } from './shared';

/* ---- Create an instance of a custom type (dispatches `content.create-object` with the custom subtype) */
export function CustomObjectInstanceDialog({
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
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
				<span>
					{/* Orphan label — no `htmlFor`, not wrapping the control — so clicking "Title" focused
					    nothing, the same gap already closed for the custom fields below. */}
					<label
						htmlFor="custom-object-title"
						style={{
							font: `var(--text-xs) ${T.sans}`,
							color: T.sub,
							display: 'block',
							marginBottom: 'var(--space-1)',
						}}
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
								font: `var(--text-xs) ${T.sans}`,
								color: T.sub,
								display: 'flex',
								gap: 'var(--space-1-5)',
								marginBottom: 'var(--space-1)',
							}}
						>
							{f.key}
							<span>· {f.type}</span>
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
