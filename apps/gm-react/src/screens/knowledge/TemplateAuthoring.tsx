import { useState } from 'react';
import { type ContentTemplate } from '@dndtools/core';
import { Button, Dialog, Field, Icon, Input, Select, Textarea, Toaster } from '../../ds';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { BODY, visibilityOptions } from './shared';
import { useI18n } from '../../i18n';

/**
 * RC-KNW-1.3 — the "Your templates" tab: keep your own templates through `content.save-template` /
 * `content.delete-template`. Split out of Templates.tsx (RC-POL-1.11). The draft is validated by the
 * core; a rejection's per-field findings are shown rather than swallowed. Deleting asks first and
 * names the template, because a deleted template has no undo.
 */

/** One row of the variable editor while the DM is authoring a template. */
interface VariableRow {
	name: string;
	label: string;
	required: boolean;
	defaultValue: string;
}

const EMPTY_DRAFT = {
	slug: '',
	name: '',
	description: '',
	titleTemplate: '',
	bodyTemplate: '',
	visibility: 'dm-only',
};

/** A stable, human-typed slug for a new template id (`user:<slug>`). */
function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
}

const ROW = { display: 'flex', alignItems: 'center', gap: T.space.two, flexWrap: 'wrap' } as const;

export function TemplateAuthoring({
	userTemplates,
}: {
	userTemplates: Record<string, ContentTemplate>;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [busy, setBusy] = useState(false);
	const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
	const [variables, setVariables] = useState<VariableRow[]>([]);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState<ContentTemplate | null>(null);
	const authored = Object.values(userTemplates).sort((a, b) => a.id.localeCompare(b.id));

	function loadForEdit(id: string) {
		const template = userTemplates[id];
		if (!template) return;
		setEditingId(id);
		setDraft({
			slug: id.slice('user:'.length),
			name: template.name,
			description: template.description,
			titleTemplate: template.titleTemplate,
			bodyTemplate: template.bodyTemplate,
			visibility: template.defaultVisibility ?? 'dm-only',
		});
		setVariables(
			template.variables.map((variable) => ({
				name: variable.name,
				label: variable.label,
				required: variable.required,
				defaultValue: variable.defaultValue ?? '',
			})),
		);
	}

	function resetDraft() {
		setEditingId(null);
		setDraft({ ...EMPTY_DRAFT });
		setVariables([]);
	}

	async function saveTemplate() {
		const slug = slugify(draft.slug || draft.name);
		const name = draft.name.trim();
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: 'content.save-template',
				actorId,
				payload: {
					id: `user:${slug}`,
					name,
					description: draft.description.trim(),
					titleTemplate: draft.titleTemplate,
					bodyTemplate: draft.bodyTemplate,
					defaultVisibility: draft.visibility,
					variables: variables.map((row) => ({
						name: row.name.trim(),
						label: row.label.trim() || row.name.trim(),
						required: row.required,
						...(row.defaultValue.trim() ? { defaultValue: row.defaultValue.trim() } : {}),
					})),
				},
			});
			if (result.status === 'accepted') {
				resetDraft();
				Toaster.success(t('knowledge.templates.saved', { name }));
			} else {
				// The core names the offending field; show that rather than a generic failure.
				const first = result.rejection.issues?.[0];
				Toaster.error(first ? first.message : result.rejection.message);
			}
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : t('knowledge.templates.saveFailed'));
		} finally {
			setBusy(false);
		}
	}

	async function deleteTemplate(template: ContentTemplate) {
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: 'content.delete-template',
				actorId,
				payload: { templateId: template.id },
			});
			if (result.status !== 'accepted') {
				Toaster.error(result.rejection.message);
				return;
			}
			if (editingId === template.id) resetDraft();
			Toaster.success(t('knowledge.templates.deleted', { name: template.name }));
		} catch (error) {
			// A thrown persist failure used to escape unhandled and leave nothing on screen.
			Toaster.error(error instanceof Error ? error.message : t('knowledge.templates.deleteFailed'));
		} finally {
			setBusy(false);
		}
	}

	const setDraftField = (field: keyof typeof EMPTY_DRAFT) => (e: { target: { value: string } }) =>
		setDraft((prev) => ({ ...prev, [field]: e.target.value }));
	const setVariableField =
		(index: number, field: 'name' | 'label') => (e: { target: { value: string } }) =>
			setVariables((prev) =>
				prev.map((v, i) => (i === index ? { ...v, [field]: e.target.value } : v)),
			);

	return (
		<div style={{ display: 'grid', gap: T.space.three }}>
			{authored.length === 0 ? (
				<p style={{ ...BODY, color: T.ter, margin: T.space.zero }}>
					{t('knowledge.templates.noneYet')}
				</p>
			) : (
				<ul
					style={{
						listStyle: 'none',
						margin: T.space.zero,
						padding: T.space.zero,
						display: 'grid',
						gap: T.space.two,
					}}
				>
					{authored.map((template) => (
						<li key={template.id} style={ROW}>
							<Icon name="duplicate" size="micro" color={T.acc} />
							<span style={{ font: `600 var(--text-sm) ${T.sans}`, flex: 1, minWidth: 0 }}>
								{template.name}
							</span>
							<Button
								variant="ghost"
								size="sm"
								icon="edit"
								disabled={busy}
								aria-label={t('knowledge.templates.editNamed', { name: template.name })}
								onClick={() => loadForEdit(template.id)}
							>
								{t('common.action.edit')}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								icon="delete"
								disabled={busy}
								aria-label={t('knowledge.templates.deleteNamed', { name: template.name })}
								onClick={() => setConfirmDelete(template)}
							>
								{t('common.action.delete')}
							</Button>
						</li>
					))}
				</ul>
			)}

			<Field label={t('knowledge.templates.name')} required>
				<Input value={draft.name} data-testid="template-name" onChange={setDraftField('name')} />
			</Field>
			<Field label={t('knowledge.templates.description')}>
				<Input value={draft.description} onChange={setDraftField('description')} />
			</Field>
			<Field label={t('knowledge.templates.titleTemplate')} required>
				<Input
					value={draft.titleTemplate}
					data-testid="template-title"
					onChange={setDraftField('titleTemplate')}
				/>
			</Field>
			<Field
				label={t('knowledge.templates.bodyTemplate')}
				required
				help={t('knowledge.templates.bodyHelp')}
			>
				<Textarea
					value={draft.bodyTemplate}
					rows={6}
					data-testid="template-body"
					onChange={setDraftField('bodyTemplate')}
				/>
			</Field>
			<Field label={t('knowledge.templates.visibility')}>
				<Select
					value={draft.visibility}
					options={visibilityOptions(t)}
					onChange={setDraftField('visibility')}
				/>
			</Field>

			{variables.map((row, index) => (
				<div
					key={index}
					style={{ display: 'flex', gap: T.space.two, alignItems: 'flex-end', flexWrap: 'wrap' }}
				>
					<Field label={t('knowledge.templates.variableName')} style={{ flex: 1, minWidth: 120 }}>
						<Input value={row.name} onChange={setVariableField(index, 'name')} />
					</Field>
					<Field label={t('knowledge.templates.variableLabel')} style={{ flex: 1, minWidth: 120 }}>
						<Input value={row.label} onChange={setVariableField(index, 'label')} />
					</Field>
					<Button
						variant="ghost"
						size="sm"
						icon="delete"
						onClick={() => setVariables((prev) => prev.filter((_, i) => i !== index))}
					>
						{t('knowledge.templates.removeVariable')}
					</Button>
				</div>
			))}
			<div style={ROW}>
				<Button
					variant="ghost"
					size="sm"
					icon="add"
					data-testid="template-add-variable"
					onClick={() =>
						setVariables((prev) => [
							...prev,
							{ name: '', label: '', required: true, defaultValue: '' },
						])
					}
				>
					{t('knowledge.templates.addVariable')}
				</Button>
				<Button
					variant="primary"
					size="sm"
					icon="check"
					disabled={busy || !draft.name.trim() || !draft.bodyTemplate.trim()}
					data-testid="template-save"
					onClick={saveTemplate}
				>
					{editingId ? t('knowledge.templates.saveChanges') : t('knowledge.templates.saveTemplate')}
				</Button>
				{editingId && (
					<Button variant="ghost" size="sm" disabled={busy} onClick={resetDraft}>
						{t('common.action.cancel')}
					</Button>
				)}
			</div>

			<Dialog
				open={confirmDelete !== null}
				onClose={() => setConfirmDelete(null)}
				tone="danger"
				icon="delete"
				size="sm"
				title={t('knowledge.templates.deleteTitle', { name: confirmDelete?.name ?? '' })}
				description={t('knowledge.templates.deleteBody')}
				footer={
					<>
						<Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="danger"
							size="sm"
							icon="delete"
							disabled={busy}
							onClick={() => {
								const target = confirmDelete;
								setConfirmDelete(null);
								if (target) void deleteTemplate(target);
							}}
						>
							{t('knowledge.templates.deleteConfirm')}
						</Button>
					</>
				}
			/>
		</div>
	);
}
