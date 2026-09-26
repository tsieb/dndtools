import { useMemo, useState } from 'react';
import {
	getContentItemsForActor,
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
	Input,
	Select,
	Tabs,
	Toaster,
	VisibilityChip,
	tabPanelProps,
} from '../../ds';
import { T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { BODY, VIS_CHIP } from './shared';
import { TemplateAuthoring } from './TemplateAuthoring';
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
 *   - KEEP YOUR OWN TEMPLATES — `content.save-template` / `content.delete-template`, in
 *     TemplateAuthoring.tsx.
 *   - INSERT A SNIPPET into a note you already have — `content.insert-snippet`. A snippet inherits
 *     the note's visibility and can never widen it; the core enforces that, this screen states it.
 *
 * Nothing here touches storage and nothing reports a success the core did not perform.
 */

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
	// The snippet targets come from the same actor-filtered read as the note list, never from the
	// raw item table, so this picker can only name what the list beside it already shows.
	const notes = useMemo(
		() =>
			getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId).filter(
				(item) => item.kind === 'note',
			),
		[runtime.state, actorId],
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
			if (result.status === 'accepted') {
				Toaster.success(t('knowledge.templates.snippetAdded', { title: snippetTarget.title }));
				onCreated(snippetTarget.id);
			} else Toaster.error(result.rejection.message);
		} catch (error) {
			Toaster.error(error instanceof Error ? error.message : t('knowledge.templates.insertFailed'));
		} finally {
			setBusy(false);
		}
	}

	const tabs = [
		{ id: 'create', label: t('knowledge.templates.tabCreate'), icon: 'note-edit' },
		{ id: 'manage', label: t('knowledge.templates.tabManage'), icon: 'duplicate' },
		{ id: 'snippets', label: t('knowledge.templates.tabSnippets'), icon: 'add' },
	];

	return (
		<Card
			elevation="flat"
			padding="md"
			style={{ marginBottom: T.space.four }}
			data-testid="templates-panel"
		>
			<div style={{ marginBottom: T.space.four }}>
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
					<div style={{ display: 'grid', gap: T.space.three }}>
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
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: T.space.two,
										flexWrap: 'wrap',
									}}
								>
									<VisibilityChip
										level={VIS_CHIP[selected.defaultVisibility ?? 'dm-only'] || 'dm-only'}
										compact
									/>
									<span style={{ ...BODY, color: T.ter }}>{selected.description}</span>
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

				{tab === 'manage' && <TemplateAuthoring userTemplates={userTemplates} />}

				{tab === 'snippets' && (
					<div style={{ display: 'grid', gap: T.space.three }}>
						<p style={{ ...BODY, color: T.ter, margin: T.space.zero }}>
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
