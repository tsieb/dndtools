import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listScenesForActor } from '@dndtools/core';
import { Badge, Button, Card, Dialog, Field, Icon, IconButton, Input, Select, Textarea, Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { parseTags, sceneStatus, statusLabel } from '../app/scene-helpers';

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
	const navigate = useNavigate();

	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [visibility, setVisibility] = useState<Visibility>('dm-only');
	const [tagsRaw, setTagsRaw] = useState('');
	const [submitting, setSubmitting] = useState(false);
	// Which scene row (if any) has its metadata editor expanded (scene.update-metadata).
	const [editingId, setEditingId] = useState<string | null>(null);
	// The scene the delete-confirm dialog is open for (scene.delete is destructive — confirm first).
	const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
	const [deleting, setDeleting] = useState(false);

	const actorId = runtime.defaultActorId;
	const activeSceneId = runtime.state.session.activeSceneId;
	const scenes = listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId).filter(
		(scene) => !scene.isTemplate,
	);

	const lifecycle = runtime.lastLifecycle;
	const createLifecycle = lifecycle && lifecycle.commandType === 'scene.create' ? lifecycle : null;

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (!name.trim() || submitting) return;
		setSubmitting(true);
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
			}
		} finally {
			setSubmitting(false);
		}
	}

	const status = createLifecycle?.status;

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
			return result.rejection.message ?? 'The scene details could not be saved.';
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
			const result = await runtime.dispatch({ type: 'scene.delete', actorId, payload: { sceneId: id } });
			setDeleteTarget(null);
			if (result.status !== 'accepted') {
				Toaster.error(result.rejection.message ?? 'The scene could not be deleted.');
				return;
			}
			Toaster.success(`“${name}” deleted`, {
				action: 'Undo',
				onAction: () => {
					void runtime
						.dispatch({ type: 'scene.restore', actorId, payload: { sceneId: id } })
						.then((restored) => {
							if (restored.status === 'accepted') Toaster.success(`“${name}” restored`);
							else Toaster.error(restored.rejection.message ?? 'The scene could not be restored.');
						});
				},
			});
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)',
				gap: 'var(--space-6)',
				maxWidth: 1180,
				margin: '0 auto',
				alignItems: 'start',
			}}
		>
			<Card elevation="raised" padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
				<div>
					<div
						style={{
							font: '600 var(--text-2xs) var(--font-sans)',
							letterSpacing: 'var(--tracking-wider)',
							textTransform: 'uppercase',
							color: 'var(--color-text-tertiary)',
						}}
					>
						Create
					</div>
					<div style={{ font: '700 var(--text-xl) var(--font-display)', color: 'var(--color-text-primary)' }}>
						New scene
					</div>
				</div>

				<form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
					<Field label="Name" htmlFor="scene-name" required>
						<Input
							id="scene-name"
							value={name}
							onChange={(e: { target: { value: string } }) => setName(e.target.value)}
							placeholder="The Sunken Crypt"
						/>
					</Field>
					<Field label="Description" htmlFor="scene-description">
						<Textarea
							id="scene-description"
							value={description}
							onChange={(e: { target: { value: string } }) => setDescription(e.target.value)}
							placeholder="A flooded antechamber beneath the old keep…"
						/>
					</Field>
					<Field label="Visibility" htmlFor="scene-visibility" help="Who can see this scene.">
						<Select
							id="scene-visibility"
							value={visibility}
							onChange={(e: { target: { value: string } }) => setVisibility(e.target.value as Visibility)}
							options={[
								{ value: 'dm-only', label: 'DM only' },
								{ value: 'shared', label: 'Shared' },
								{ value: 'player-visible', label: 'Player visible' },
							]}
						/>
					</Field>
					<Field label="Tags" htmlFor="scene-tags" help="Comma-separated.">
						<Input
							id="scene-tags"
							value={tagsRaw}
							onChange={(e: { target: { value: string } }) => setTagsRaw(e.target.value)}
							placeholder="dungeon, combat"
						/>
					</Field>

					<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
						<Button type="submit" variant="primary" icon="add" disabled={submitting || !name.trim()}>
							{submitting ? 'Creating…' : 'Create scene'}
						</Button>
						{status === 'success' && (
							<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-status-success-text)', font: 'var(--text-sm) var(--font-sans)' }}>
								<Icon name="success" size="sm" /> Saved
							</span>
						)}
						{status === 'failure' && (
							<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-status-error-text)', font: 'var(--text-sm) var(--font-sans)' }}>
								<Icon name="error" size="sm" /> {runtime.lastError ?? 'Failed'}
							</span>
						)}
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
					Scenes · {scenes.length}
				</div>
				{scenes.length === 0 ? (
					<Card elevation="flat" padding="lg">
						<div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>
							No scenes yet. Create one to see it persist across reloads.
						</div>
					</Card>
				) : (
					<Card elevation="flat" padding="sm" style={{ display: 'flex', flexDirection: 'column' }}>
						{scenes.map((scene, i) => {
							const s = sceneStatus(scene, activeSceneId);
							const rowEditing = editingId === scene.id;
							return (
								<div key={scene.id} style={{ borderTop: i ? '1px solid var(--color-border)' : 'none' }}>
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
											<Icon name={s === 'draft' ? 'Lock' : 'atlas-map'} size="sm" color="var(--color-text-secondary)" />
											<div style={{ flex: 1, minWidth: 0 }}>
												<div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>
													{scene.name}
												</div>
												<div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
													{scene.tags?.[0] ?? 'Scene'}
												</div>
											</div>
											<Badge status={s === 'live' ? 'success' : s === 'ready' ? 'info' : 'neutral'}>
												{statusLabel(s)}
											</Badge>
										</button>
										<IconButton
											icon="edit"
											label={`Edit details of ${scene.name}`}
											variant="ghost"
											size="sm"
											onClick={() => setEditingId(rowEditing ? null : scene.id)}
											style={{ flex: '0 0 auto' }}
										/>
										<IconButton
											icon="delete"
											label={`Delete ${scene.name}`}
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
				title={`Delete “${deleteTarget?.name ?? ''}”?`}
				description="The scene leaves every list and board. You can undo right after — it stays recoverable."
				icon="delete"
				size="sm"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={deleting} onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						<Button variant="danger" size="sm" icon="delete" disabled={deleting} onClick={() => void confirmDelete()}>
							{deleting ? 'Deleting…' : 'Delete scene'}
						</Button>
					</>
				}
			>
				<div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
					The live scene and the Command Center home scene can’t be deleted — if this is one of
					those, the delete is refused and nothing changes.
				</div>
			</Dialog>
		</div>
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
			<Field label="Name" required>
				<Input value={draftName} onChange={(e: { target: { value: string } }) => setDraftName(e.target.value)} />
			</Field>
			<Field label="Description">
				<Textarea
					rows={2}
					value={draftDescription}
					onChange={(e: { target: { value: string } }) => setDraftDescription(e.target.value)}
				/>
			</Field>
			<Field label="Tags" help="Comma-separated.">
				<Input
					value={draftTags}
					onChange={(e: { target: { value: string } }) => setDraftTags(e.target.value)}
					placeholder="dungeon, combat"
				/>
			</Field>
			{error && (
				<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-status-error-text)', font: 'var(--text-xs) var(--font-sans)' }}>
					<Icon name="error" size="sm" /> {error}
				</span>
			)}
			<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
				<Button variant="primary" size="sm" icon="check" disabled={saving || !draftName.trim()} onClick={save}>
					{saving ? 'Saving…' : 'Save details'}
				</Button>
				<Button variant="ghost" size="sm" onClick={onClose}>
					Cancel
				</Button>
			</div>
		</div>
	);
}
