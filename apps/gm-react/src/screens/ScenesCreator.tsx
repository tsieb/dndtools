import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listScenesForActor } from '@dndtools/core';
import {
	Badge,
	Button,
	Card,
	Dialog,
	Field,
	Icon,
	IconButton,
	Input,
	Select,
	Textarea,
	Toaster,
} from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { Page } from '../app/screen-kit';
import { parseTags, sceneStatus, statusLabel } from '../app/scene-helpers';
import { useI18n } from '../i18n';
import { useViewport } from '../app/useViewport';
import { SceneCardsPanel } from './SceneCardsPanel';

type Visibility = 'dm-only' | 'shared' | 'player-visible';

/**
 * ScenesCreator — the prototype's scene-authoring surface AND the app's one proven write path. It
 * ports the archived Svelte `scenes/+page.svelte` `submit`: a `scene.create` command flows through the
 * single runtime dispatch choke point (`dispatchCommand` → `persistFullState`), and the lifecycle
 * (PLAT-018: pending → confirmed / failed) is reflected on the button. On success the new scene
 * lands in the persisted Core state and reappears in the list + sidebar after a reload — this is the
 * round-trip the foundation gate verifies before any screen fan-out.
 */
export function ScenesCreator() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const navigate = useNavigate();
	const isDesktop = useViewport() === 'desktop';

	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [visibility, setVisibility] = useState<Visibility>('dm-only');
	const [tagsRaw, setTagsRaw] = useState('');
	const [submitting, setSubmitting] = useState(false);
	// The outcome of THIS form's own last submit. It used to be derived from `runtime.lastLifecycle`,
	// which is GLOBAL and survives navigation — so an empty, untouched form wore a green "✓ Saved"
	// tick whenever the most recent command anywhere in the app happened to be a `scene.create`
	// (leaving and returning to /scenes was enough). It also swallowed the rejection reason.
	const [feedback, setFeedback] = useState<{ tone: 'success' | 'failure'; text: string } | null>(
		null,
	);
	// Which scene row (if any) has its metadata editor expanded (scene.update-metadata).
	const [editingId, setEditingId] = useState<string | null>(null);
	// The scene the delete-confirm dialog is open for (scene.delete is destructive — confirm first).
	const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
	const [deleting, setDeleting] = useState(false);

	const actorId = runtime.defaultActorId;
	const activeSceneId = runtime.state.session.activeSceneId;
	const homeSceneId = runtime.state.commandCenter.homeSceneId;
	const scenes = listScenesForActor(
		runtime.state.scenes,
		runtime.state.permissions,
		actorId,
	).filter((scene) => !scene.isTemplate && scene.id !== homeSceneId);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const created = name.trim();
		if (!created || submitting) return;
		setSubmitting(true);
		setFeedback(null);
		try {
			const result = await runtime.dispatch({
				type: 'scene.create',
				actorId,
				payload: {
					name: name.trim(),
					description: description.trim(),
					visibility,
					tags: tagsRaw
						.split(',')
						.map((t) => t.trim())
						.filter(Boolean),
				},
			});
			if (result.status === 'accepted') {
				setName('');
				setDescription('');
				setTagsRaw('');
				setVisibility('dm-only');
				setFeedback({ tone: 'success', text: t('scenes.saved', { name: created }) });
			} else {
				setFeedback({
					tone: 'failure',
					text: result.rejection.message ?? t('scenes.saveFailed'),
				});
			}
		} catch {
			// `SceneRuntime.dispatchNow` RETHROWS after a failed durable persist, so without this the
			// form reset never ran and the button un-busied with no explanation at all.
			setFeedback({ tone: 'failure', text: t('scenes.saveFailed') });
		} finally {
			setSubmitting(false);
		}
	}

	// SCENE METADATA — rename / re-describe / re-tag a scene AFTER creation through the core's
	// `scene.update-metadata`. Returns the rejection message (null on success) for inline display.
	async function saveRowMeta(
		sceneId: string,
		meta: { name: string; description: string; tags: string[] },
	): Promise<string | null> {
		const result = await runtime.dispatch({
			type: 'scene.update-metadata',
			actorId,
			payload: { sceneId, name: meta.name, description: meta.description, tags: meta.tags },
		});
		if (result.status === 'rejected') {
			return result.rejection.message ?? t('scenes.metaSaveFailed');
		}
		setEditingId(null);
		return null;
	}

	// SCENE DELETE — `scene.delete` is the core's recoverable tombstone soft-delete. On success the
	// row leaves the list and an UNDO toast dispatches the counterpart `scene.restore`. The core's
	// fail-closed guards (the ACTIVE scene and the Command Center HOME scene can never be deleted)
	// surface as their honest rejection messages.
	async function confirmDelete() {
		if (!deleteTarget || deleting) return;
		const { id, name } = deleteTarget;
		setDeleting(true);
		try {
			const result = await runtime.dispatch({
				type: 'scene.delete',
				actorId,
				payload: { sceneId: id },
			});
			setDeleteTarget(null);
			if (result.status !== 'accepted') {
				Toaster.error(result.rejection.message ?? t('scenes.deleteFailed'));
				return;
			}
			Toaster.success(t('scenes.deleted', { name }), {
				action: t('common.action.undo'),
				onAction: () => {
					void runtime
						.dispatch({ type: 'scene.restore', actorId, payload: { sceneId: id } })
						.then((restored) => {
							if (restored.status === 'accepted') Toaster.success(t('scenes.restored', { name }));
							else Toaster.error(restored.rejection.message ?? t('scenes.restoreFailed'));
						});
				},
			});
		} finally {
			setDeleting(false);
		}
	}

	return (
		// Every other routed list screen goes through `Page`; without it `/scenes` sat flush against
		// both phone edges and had no clearance over the bottom tab bar. Page also owns the
		// maxWidth/centering this grid was duplicating.
		<Page max={1180}>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: isDesktop ? 'minmax(0, 1fr) minmax(0, 1.2fr)' : 'minmax(0, 1fr)',
					gap: 'var(--space-6)',
					alignItems: 'start',
				}}
			>
				<Card
					elevation="raised"
					padding="lg"
					style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
				>
					<div>
						<div
							style={{
								font: '600 var(--text-2xs) var(--font-sans)',
								letterSpacing: 'var(--tracking-wider)',
								textTransform: 'uppercase',
								color: 'var(--color-text-tertiary)',
							}}
						>
							{t('scenes.create')}
						</div>
						<div
							style={{
								font: '700 var(--text-xl) var(--font-display)',
								color: 'var(--color-text-primary)',
							}}
						>
							{t('scenes.newScene')}
						</div>
					</div>

					<form
						onSubmit={submit}
						style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
					>
						<Field label={t('scenes.name')} htmlFor="scene-name" required>
							<Input
								id="scene-name"
								value={name}
								onChange={(e: { target: { value: string } }) => {
									// A result belongs to the submit that produced it. Starting the next draft
									// retires it, so the tick can never sit above a form it says nothing about.
									setFeedback(null);
									setName(e.target.value);
								}}
								placeholder={t('scenes.namePlaceholder')}
							/>
						</Field>
						<Field label={t('scenes.description')} htmlFor="scene-description">
							<Textarea
								id="scene-description"
								value={description}
								onChange={(e: { target: { value: string } }) => setDescription(e.target.value)}
								placeholder={t('scenes.descriptionPlaceholder')}
							/>
						</Field>
						<Field
							label={t('common.visibility.label')}
							htmlFor="scene-visibility"
							help={t('scenes.visibilityHelp')}
						>
							<Select
								id="scene-visibility"
								value={visibility}
								onChange={(e: { target: { value: string } }) =>
									setVisibility(e.target.value as Visibility)
								}
								options={[
									{ value: 'dm-only', label: t('common.visibility.dmOnly') },
									{ value: 'shared', label: t('common.visibility.shared') },
									{ value: 'player-visible', label: t('common.visibility.playerVisible') },
								]}
							/>
						</Field>
						<Field label={t('scenes.tags')} htmlFor="scene-tags" help={t('scenes.tagsHelp')}>
							<Input
								id="scene-tags"
								value={tagsRaw}
								onChange={(e: { target: { value: string } }) => setTagsRaw(e.target.value)}
								placeholder={t('scenes.tagsPlaceholder')}
							/>
						</Field>

						<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
							<Button
								type="submit"
								variant="primary"
								icon="add"
								disabled={submitting || !name.trim()}
							>
								{submitting ? t('scenes.creating') : t('scenes.createScene')}
							</Button>
							{/* One persistent element rather than two conditional siblings: swapping which of
							    two `{cond && …}` slots renders destroys the first node, and it is the only
							    channel this form has for a rejection reason. `role="status"` is polite and
							    already in the tree, so the text change is the mutation AT gets to hear. */}
							<span
								data-testid="scene-create-feedback"
								role="status"
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 6,
									color:
										feedback?.tone === 'failure'
											? 'var(--color-status-error-text)'
											: 'var(--color-status-success-text)',
									font: 'var(--text-sm) var(--font-sans)',
								}}
							>
								{feedback && (
									<>
										<Icon name={feedback.tone === 'failure' ? 'error' : 'success'} size="sm" />{' '}
										{feedback.text}
									</>
								)}
							</span>
						</div>
					</form>
				</Card>

				<div>
					<div
						style={{
							font: '600 var(--text-2xs) var(--font-sans)',
							letterSpacing: 'var(--tracking-wider)',
							textTransform: 'uppercase',
							color: 'var(--color-text-tertiary)',
							marginBottom: 'var(--space-3)',
						}}
					>
						{t('scenes.count', { count: scenes.length })}
					</div>
					{scenes.length === 0 ? (
						<Card elevation="flat" padding="lg">
							<div
								style={{
									font: 'var(--text-sm) var(--font-sans)',
									color: 'var(--color-text-secondary)',
								}}
							>
								{t('scenes.empty')}
							</div>
						</Card>
					) : (
						<Card
							elevation="flat"
							padding="sm"
							style={{ display: 'flex', flexDirection: 'column' }}
						>
							{scenes.map((scene, i) => {
								const s = sceneStatus(scene, activeSceneId);
								const rowEditing = editingId === scene.id;
								return (
									<div
										key={scene.id}
										style={{ borderTop: i ? '1px solid var(--color-border)' : 'none' }}
									>
										<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
											<button
												type="button"
												onClick={() => navigate(`/scene/${scene.id}`)}
												style={{
													flex: 1,
													minWidth: 0,
													display: 'flex',
													alignItems: 'center',
													gap: 'var(--space-3)',
													padding: 'var(--space-3)',
													border: 'none',
													borderRadius: 'var(--radius-sm)',
													background: 'transparent',
													cursor: 'pointer',
													textAlign: 'left',
												}}
												onMouseEnter={(e) => {
													e.currentTarget.style.background = 'var(--color-interactive-hover)';
												}}
												onMouseLeave={(e) => {
													e.currentTarget.style.background = 'transparent';
												}}
											>
												<Icon
													name={s === 'draft' ? 'lock' : 'atlas-map'}
													size="sm"
													color="var(--color-text-secondary)"
												/>
												<div style={{ flex: 1, minWidth: 0 }}>
													<div
														style={{
															font: '600 var(--text-sm) var(--font-sans)',
															color: 'var(--color-text-primary)',
														}}
													>
														{scene.name}
													</div>
													<div
														style={{
															font: 'var(--text-xs) var(--font-sans)',
															color: 'var(--color-text-tertiary)',
														}}
													>
														{scene.tags?.[0] ?? t('scenes.tagFallback')}
													</div>
												</div>
												<Badge
													status={s === 'live' ? 'success' : s === 'ready' ? 'info' : 'neutral'}
												>
													{t(statusLabel(s))}
												</Badge>
											</button>
											<IconButton
												icon="edit"
												label={t('scenes.editDetailsOf', { name: scene.name })}
												variant="ghost"
												size="sm"
												onClick={() => setEditingId(rowEditing ? null : scene.id)}
												style={{ flex: '0 0 auto' }}
											/>
											<IconButton
												icon="delete"
												label={t('scenes.deleteNamed', { name: scene.name })}
												variant="ghost"
												size="sm"
												onClick={() => setDeleteTarget({ id: scene.id, name: scene.name })}
												style={{ marginRight: 'var(--space-2)', flex: '0 0 auto' }}
											/>
										</div>
										{rowEditing && (
											<SceneRowMetaEditor
												name={scene.name}
												description={runtime.state.scenes.scenes[scene.id]?.description ?? ''}
												tags={scene.tags}
												onSave={(meta) => saveRowMeta(scene.id, meta)}
												onClose={() => setEditingId(null)}
											/>
										)}
									</div>
								);
							})}
						</Card>
					)}
				</div>

				{/* Delete confirm — the DS Dialog manages focus; Delete stays one honest, undoable step. */}
				<Dialog
					open={!!deleteTarget}
					onClose={() => setDeleteTarget(null)}
					title={t('scenes.deleteTitle', { name: deleteTarget?.name ?? '' })}
					description={t('scenes.deleteDescription')}
					icon="delete"
					size="sm"
					footer={
						<>
							<Button
								variant="secondary"
								size="sm"
								disabled={deleting}
								onClick={() => setDeleteTarget(null)}
							>
								{t('common.action.cancel')}
							</Button>
							<Button
								variant="danger"
								size="sm"
								icon="delete"
								disabled={deleting}
								onClick={() => void confirmDelete()}
							>
								{deleting ? t('scenes.deleting') : t('scenes.deleteScene')}
							</Button>
						</>
					}
				>
					<div
						style={{
							font: 'var(--text-sm) var(--font-sans)',
							color: 'var(--color-text-secondary)',
							lineHeight: 1.5,
						}}
					>
						{t('scenes.deleteRefused')}
					</div>
				</Dialog>
			</div>
			<SceneCardsPanel />
		</Page>
	);
}

/**
 * SceneRowMetaEditor — the inline expansion under a scene row for editing name / description / tags
 * after creation (`scene.update-metadata`). `onSave` resolves to a rejection message (shown inline)
 * or null on success; Escape collapses the editor.
 */
function SceneRowMetaEditor({
	name,
	description,
	tags,
	onSave,
	onClose,
}: {
	name: string;
	description: string;
	tags: string[];
	onSave: (meta: { name: string; description: string; tags: string[] }) => Promise<string | null>;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const [draftName, setDraftName] = useState(name);
	const [draftDescription, setDraftDescription] = useState(description);
	const [draftTags, setDraftTags] = useState(tags.join(', '));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function save() {
		if (!draftName.trim() || saving) return;
		setSaving(true);
		try {
			const rejection = await onSave({
				name: draftName.trim(),
				description: draftDescription.trim(),
				tags: parseTags(draftTags),
			});
			setError(rejection);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					onClose();
				}
			}}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				margin: '0 var(--space-3) var(--space-3)',
				padding: 'var(--space-3)',
				borderRadius: 'var(--radius-md)',
				background: 'var(--color-surface-sunken)',
				border: '1px solid var(--color-border)',
			}}
		>
			<Field label={t('scenes.name')} required>
				<Input
					value={draftName}
					onChange={(e: { target: { value: string } }) => setDraftName(e.target.value)}
				/>
			</Field>
			<Field label={t('scenes.description')}>
				<Textarea
					rows={2}
					value={draftDescription}
					onChange={(e: { target: { value: string } }) => setDraftDescription(e.target.value)}
				/>
			</Field>
			<Field label={t('scenes.tags')} help={t('scenes.tagsHelp')}>
				<Input
					value={draftTags}
					onChange={(e: { target: { value: string } }) => setDraftTags(e.target.value)}
					placeholder={t('scenes.tagsPlaceholder')}
				/>
			</Field>
			{error && (
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 6,
						color: 'var(--color-status-error-text)',
						font: 'var(--text-xs) var(--font-sans)',
					}}
				>
					<Icon name="error" size="sm" /> {error}
				</span>
			)}
			<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
				<Button
					variant="primary"
					size="sm"
					icon="check"
					disabled={saving || !draftName.trim()}
					onClick={save}
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
