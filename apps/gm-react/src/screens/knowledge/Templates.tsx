import { useMemo, useState } from 'react';
import {
	listContentSnippets,
	listContentTemplates,
	resolveContentTemplate,
	type ContentTemplate,
	type ContentTemplateSummary,
} from '@dndtools/core';
import {
	Button,
	Card,
	Field,
	Icon,
	Input,
	Select,
	Tabs,
	Textarea,
	Toaster,
	VisibilityChip,
	tabPanelProps,
} from '../../ds';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { VIS_CHIP, visibilityOptions } from './shared';
import { useI18n } from '../../i18n';

/**
 * RC-KNW-1.3 — templates and snippets, wired to the live Processing Core.
 *
 * Three things a DM does here, each of them a real core command and nothing else:
 *
 *   - START A NOTE from a template — `content.create-from-template`. The catalog comes from the core
 *     (`listContentTemplates`), the variable fields come from the selected template's own declared
 *     variables, and the core renders + validates the generated content BEFORE anything is written.
 *     A missing required variable is refused there, so this screen does not need to guess.
 *   - KEEP YOUR OWN TEMPLATES — `content.save-template` / `content.delete-template`. The draft is
 *     validated by the core; a rejection's per-field findings are shown rather than swallowed.
 *   - INSERT A SNIPPET into a note you already have — `content.insert-snippet`. A snippet inherits
 *     the note's visibility and can never widen it; the core enforces that, this screen states it.
 *
 * Nothing here touches storage and nothing reports a success the core did not perform.
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

export function TemplatesPanel({ onCreated }: { onCreated: (itemId: string) => void }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [tab, setTab] = useState('create');
	const [busy, setBusy] = useState(false);

	const userTemplates = runtime.state.content.userTemplates;
	const catalog: ContentTemplateSummary[] = useMemo(
		() => listContentTemplates(userTemplates),
		[userTemplates],
	);
	const notes = useMemo(
		() => Object.values(runtime.state.content.items).filter((item) => item.deletedAt === null),
		[runtime.state.content.items],
	);

	// --- Create from a template ---------------------------------------------------------------------
	const [templateId, setTemplateId] = useState(catalog[0]?.id ?? '');
	const selected: ContentTemplate | null = useMemo(
		() => (templateId ? resolveContentTemplate(userTemplates, templateId) : null),
		[templateId, userTemplates],
	);
	const [values, setValues] = useState<Record<string, string>>({});

	const missingRequired = (selected?.variables ?? []).some(
		(variable) => variable.required && (values[variable.name] ?? '').trim() === '',
	);

	async function createFromTemplate() {
		if (!selected) return;
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: 'content.create-from-template',
				actorId,
				payload: { presetId: selected.id, variables: values },
			});
			if (result.status === 'accepted') {
				const created = result.events.find(
					(e) => (e as { kind?: string }).kind === 'content.item-changed',
				) as { itemId?: string } | undefined;
				setValues({});
				if (created?.itemId) onCreated(created.itemId);
			} else {
				Toaster.error(result.rejection.message);
			}
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : t('knowledge.templates.createFailed'));
		} finally {
			setBusy(false);
		}
	}

	// --- Author your own template -------------------------------------------------------------------
	const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
	const [variables, setVariables] = useState<VariableRow[]>([]);
	const [editingId, setEditingId] = useState<string | null>(null);

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
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: 'content.save-template',
				actorId,
				payload: {
					id: `user:${slug}`,
					name: draft.name.trim(),
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

	async function deleteTemplate(id: string) {
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: 'content.delete-template',
				actorId,
				payload: { templateId: id },
			});
			if (result.status !== 'accepted') Toaster.error(result.rejection.message);
			else if (editingId === id) resetDraft();
		} finally {
			setBusy(false);
		}
	}

	// --- Insert a snippet ---------------------------------------------------------------------------
	const snippets = useMemo(() => listContentSnippets(), []);
	const [snippetId, setSnippetId] = useState(snippets[0]?.id ?? '');
	const [snippetNoteId, setSnippetNoteId] = useState('');
	const snippetTarget = notes.find((note) => note.id === snippetNoteId) ?? null;

	async function insertSnippetInto() {
		if (!snippetTarget) return;
		setBusy(true);
		try {
			const result = await runtime.dispatch({
				type: 'content.insert-snippet',
				actorId,
				payload: { itemId: snippetTarget.id, snippetId, position: 'after' },
			});
			if (result.status === 'accepted') onCreated(snippetTarget.id);
			else Toaster.error(result.rejection.message);
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : t('knowledge.templates.insertFailed'));
		} finally {
			setBusy(false);
		}
	}

	const authored = Object.values(userTemplates).sort((a, b) => a.id.localeCompare(b.id));
	const tabs = [
		{ id: 'create', label: t('knowledge.templates.tabCreate'), icon: 'note-edit' },
		{ id: 'manage', label: t('knowledge.templates.tabManage'), icon: 'duplicate' },
		{ id: 'snippets', label: t('knowledge.templates.tabSnippets'), icon: 'add' },
	];

	return (
		<Card elevation="flat" padding="md" style={{ marginBottom: 14 }} data-testid="templates-panel">
			<div style={{ marginBottom: 14 }}>
				<Tabs
					value={tab}
					onChange={setTab}
					tabs={tabs}
					idBase="knowledge-templates"
					aria-label={t('knowledge.templates.sections')}
				/>
			</div>
			<div {...tabPanelProps('knowledge-templates', tab)}>
				{tab === 'create' && (
					<div style={{ display: 'grid', gap: 12 }}>
						<Field label={t('knowledge.templates.pick')}>
							<Select
								value={templateId}
								data-testid="template-pick"
								options={catalog.map((row) => ({
									value: row.id,
									label:
										row.source === 'user'
											? t('knowledge.templates.yourTemplateOption', { name: row.name })
											: row.name,
								}))}
								onChange={(e: { target: { value: string } }) => {
									setTemplateId(e.target.value);
									setValues({});
								}}
							/>
						</Field>
						{selected && (
							<>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
									<VisibilityChip
										level={VIS_CHIP[selected.defaultVisibility ?? 'dm-only'] || 'dm-only'}
										compact
									/>
									<span style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter }}>
										{selected.description}
									</span>
								</div>
								{selected.variables.map((variable) => (
									<Field
										key={variable.name}
										label={variable.label}
										required={variable.required}
										help={
											variable.defaultValue
												? t('knowledge.templates.defaultsTo', { value: variable.defaultValue })
												: undefined
										}
									>
										<Input
											value={values[variable.name] ?? ''}
											onChange={(e: { target: { value: string } }) =>
												setValues((prev) => ({ ...prev, [variable.name]: e.target.value }))
											}
										/>
									</Field>
								))}
								<div>
									<Button
										variant="primary"
										size="sm"
										icon="check"
										disabled={busy || missingRequired}
										data-testid="template-create"
										onClick={createFromTemplate}
									>
										{t('knowledge.templates.createNote')}
									</Button>
								</div>
							</>
						)}
					</div>
				)}

				{tab === 'manage' && (
					<div style={{ display: 'grid', gap: 12 }}>
						{authored.length === 0 ? (
							<p style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter, margin: 0 }}>
								{t('knowledge.templates.noneYet')}
							</p>
						) : (
							<ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
								{authored.map((template) => (
									<li
										key={template.id}
										style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
									>
										<Icon name="duplicate" size={14} color={T.acc} />
										<span style={{ font: `600 13px ${T.sans}`, flex: 1 }}>{template.name}</span>
										<Button
											variant="ghost"
											size="sm"
											icon="edit"
											disabled={busy}
											onClick={() => loadForEdit(template.id)}
										>
											{t('common.action.edit')}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											icon="delete"
											disabled={busy}
											onClick={() => deleteTemplate(template.id)}
										>
											{t('common.action.delete')}
										</Button>
									</li>
								))}
							</ul>
						)}

						<Field label={t('knowledge.templates.name')} required>
							<Input
								value={draft.name}
								data-testid="template-name"
								onChange={(e: { target: { value: string } }) =>
									setDraft((prev) => ({ ...prev, name: e.target.value }))
								}
							/>
						</Field>
						<Field label={t('knowledge.templates.description')}>
							<Input
								value={draft.description}
								onChange={(e: { target: { value: string } }) =>
									setDraft((prev) => ({ ...prev, description: e.target.value }))
								}
							/>
						</Field>
						<Field label={t('knowledge.templates.titleTemplate')} required>
							<Input
								value={draft.titleTemplate}
								data-testid="template-title"
								onChange={(e: { target: { value: string } }) =>
									setDraft((prev) => ({ ...prev, titleTemplate: e.target.value }))
								}
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
								onChange={(e: { target: { value: string } }) =>
									setDraft((prev) => ({ ...prev, bodyTemplate: e.target.value }))
								}
							/>
						</Field>
						<Field label={t('knowledge.templates.visibility')}>
							<Select
								value={draft.visibility}
								options={visibilityOptions(t)}
								onChange={(e: { target: { value: string } }) =>
									setDraft((prev) => ({ ...prev, visibility: e.target.value }))
								}
							/>
						</Field>

						{variables.map((row, index) => (
							<div
								key={index}
								style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
							>
								<Field
									label={t('knowledge.templates.variableName')}
									style={{ flex: 1, minWidth: 120 }}
								>
									<Input
										value={row.name}
										onChange={(e: { target: { value: string } }) =>
											setVariables((prev) =>
												prev.map((v, i) => (i === index ? { ...v, name: e.target.value } : v)),
											)
										}
									/>
								</Field>
								<Field
									label={t('knowledge.templates.variableLabel')}
									style={{ flex: 1, minWidth: 120 }}
								>
									<Input
										value={row.label}
										onChange={(e: { target: { value: string } }) =>
											setVariables((prev) =>
												prev.map((v, i) => (i === index ? { ...v, label: e.target.value } : v)),
											)
										}
									/>
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
						<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
								{editingId
									? t('knowledge.templates.saveChanges')
									: t('knowledge.templates.saveTemplate')}
							</Button>
							{editingId && (
								<Button variant="ghost" size="sm" disabled={busy} onClick={resetDraft}>
									{t('common.action.cancel')}
								</Button>
							)}
						</div>
					</div>
				)}

				{tab === 'snippets' && (
					<div style={{ display: 'grid', gap: 12 }}>
						<p style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter, margin: 0 }}>
							{t('knowledge.templates.snippetIntro')}
						</p>
						<Field label={t('knowledge.templates.snippet')}>
							<Select
								value={snippetId}
								data-testid="snippet-pick"
								options={snippets.map((snippet) => ({
									value: snippet.id,
									label: snippet.name,
								}))}
								onChange={(e: { target: { value: string } }) => setSnippetId(e.target.value)}
							/>
						</Field>
						<Field label={t('knowledge.templates.snippetNote')}>
							<Select
								value={snippetNoteId}
								data-testid="snippet-note"
								options={[
									{ value: '', label: t('knowledge.templates.snippetPickNote') },
									...notes.map((note) => ({ value: note.id, label: note.title })),
								]}
								onChange={(e: { target: { value: string } }) => setSnippetNoteId(e.target.value)}
							/>
						</Field>
						<div>
							<Button
								variant="primary"
								size="sm"
								icon="check"
								disabled={busy || !snippetTarget || !snippetId}
								data-testid="snippet-insert"
								onClick={insertSnippetInto}
							>
								{t('knowledge.templates.insertSnippet')}
							</Button>
						</div>
					</div>
				)}
			</div>
		</Card>
	);
}
