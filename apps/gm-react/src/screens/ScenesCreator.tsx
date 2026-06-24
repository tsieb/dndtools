import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listScenesForActor } from '@dndtools/core';
import { Badge, Button, Card, Field, Icon, Input, Select, Textarea } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { sceneStatus, statusLabel } from '../app/scene-helpers';

type Visibility = 'dm-only' | 'shared' | 'player-visible';

/**
 * ScenesCreator — the prototype's scene-authoring surface AND the app's one proven write path. It
 * ports the production `scenes/+page.svelte` `submit`: a `scene.create` command flows through the
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
							return (
								<button
									key={scene.id}
									type="button"
									onClick={() => navigate(`/scene/${scene.id}`)}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 'var(--space-3)',
										padding: 'var(--space-3)',
										border: 'none',
										borderTop: i ? '1px solid var(--color-border)' : 'none',
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
							);
						})}
					</Card>
				)}
			</div>
		</div>
	);
}
