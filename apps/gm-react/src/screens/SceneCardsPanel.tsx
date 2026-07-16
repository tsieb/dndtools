import { useEffect, useState, type FormEvent } from 'react';
import {
	getSceneDisplayForActor,
	getSceneCardQueueForActor,
	listSceneCardsForActor,
	type SceneCardMood,
	type SceneCardTransitionStyle,
	type SceneCardVisibility,
	type SceneCardView,
} from '@dndtools/core';
import { Badge, Button, Card, Field, IconButton, Input, Select, Textarea, Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { moodTheme, SCENE_MOOD_THEME } from '../app/sceneCardMood';
import { useViewport } from '../app/useViewport';
import { openSecondScreen } from '../platform/sceneDisplayChannel';
import { isNativeDesktopRuntime } from '../platform/windowChrome';
import { isNetworkDestinationAllowed, usePlatformCapabilities } from '../platform/capabilities';

/**
 * I11 S11.2.1–S11.2.3 — the DM authoring + control surface for ATMOSPHERE SCENE CARDS, embedded in
 * ScenesCreator (`/scenes`). Create a card (title/mood/hero image URL/flavor/visibility), then from the
 * card list activate it onto the display, queue it, toggle its player visibility, edit, or delete. The
 * queue panel reorders/advances and picks the transition. All actions dispatch `scene-card.*` commands
 * through the single runtime write path; the fullscreen display (Ctrl+Shift+S) and the second-screen
 * window read the same core state.
 */

const MOOD_OPTIONS = (Object.keys(SCENE_MOOD_THEME) as SceneCardMood[]).map((m) => ({
	value: m,
	label: SCENE_MOOD_THEME[m].label,
}));

const TRANSITION_OPTIONS: { value: SceneCardTransitionStyle; label: string }[] = [
	{ value: 'crossfade', label: 'Crossfade' },
	{ value: 'slide', label: 'Slide' },
	{ value: 'cut', label: 'Cut' },
];

export function SceneCardsPanel() {
	const runtime = useRuntime();
	const isDesktop = useViewport() === 'desktop';
	const capabilities = usePlatformCapabilities();
	const android = capabilities.runtimeKind === 'android';
	const actorId = runtime.defaultActorId;
	const nativeDesktop = isNativeDesktopRuntime();
	const { session, permissions } = runtime.state;

	const cards = listSceneCardsForActor(session, permissions, actorId);
	const queue = getSceneCardQueueForActor(session, permissions, actorId);
	const display = getSceneDisplayForActor(session, permissions, actorId);
	const queuedIds = new Set(queue.map((c) => c.id));

	const [title, setTitle] = useState('');
	const [mood, setMood] = useState<SceneCardMood>('exploration');
	const [flavor, setFlavor] = useState('');
	const [heroUrl, setHeroUrl] = useState('');
	const [visibility, setVisibility] = useState<SceneCardVisibility>('dm-only');
	const [submitting, setSubmitting] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	async function createCard(event: FormEvent) {
		event.preventDefault();
		if (!title.trim() || submitting) return;
		const requestedHero = heroUrl.trim();
		if (
			android &&
			requestedHero &&
			!isNetworkDestinationAllowed(requestedHero, capabilities.runtimeKind)
		) {
			Toaster.error('Android scene images must use a valid HTTPS URL.');
			return;
		}
		setSubmitting(true);
		try {
			const result = await runtime.dispatch({
				type: 'scene-card.create',
				actorId,
				payload: {
					title: title.trim(),
					mood,
					flavorText: flavor.trim(),
					visibility,
					heroImage: !nativeDesktop && requestedHero ? { kind: 'url', ref: requestedHero } : null,
				},
			});
			if (result.status === 'accepted') {
				setTitle('');
				setFlavor('');
				setHeroUrl('');
				setMood('exploration');
				setVisibility('dm-only');
			} else {
				Toaster.error(result.rejection.message ?? 'The scene card could not be created.');
			}
		} finally {
			setSubmitting(false);
		}
	}

	async function run(type: string, payload: Record<string, unknown>, failMsg: string) {
		const result = await runtime.dispatch({ type, actorId, payload } as Parameters<
			typeof runtime.dispatch
		>[0]);
		if (result.status !== 'accepted') Toaster.error(result.rejection.message ?? failMsg);
		return result;
	}

	async function deleteCard(card: SceneCardView) {
		const result = await run(
			'scene-card.delete',
			{ cardId: card.id },
			'The card could not be deleted.',
		);
		if (result.status !== 'accepted') return;
		Toaster.success(`“${card.title}” deleted`, {
			action: 'Undo',
			onAction: () =>
				void run('scene-card.restore', { cardId: card.id }, 'The card could not be restored.'),
		});
	}

	return (
		<div style={{ maxWidth: 1180, margin: 'var(--space-8) auto 0' }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-3)',
					marginBottom: 'var(--space-4)',
					flexWrap: 'wrap',
				}}
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
						Atmosphere
					</div>
					<div
						style={{
							font: '700 var(--text-xl) var(--font-display)',
							color: 'var(--color-text-primary)',
						}}
					>
						Scene cards
					</div>
				</div>
				<span style={{ flex: '1 1 var(--space-4)' }} />
				<Button
					variant="secondary"
					size="sm"
					icon="display"
					disabled={!capabilities.secondScreen.available}
					title={capabilities.secondScreen.unavailableMessage ?? undefined}
					onClick={() => openSecondScreen()}
				>
					Second screen
				</Button>
				<span
					style={{
						font: 'var(--text-xs) var(--font-sans)',
						color: 'var(--color-text-tertiary)',
						whiteSpace: isDesktop ? 'nowrap' : 'normal',
						flexBasis: isDesktop ? 'auto' : '100%',
					}}
				>
					{capabilities.secondScreen.available
						? 'Ctrl+Shift+S fullscreen · Ctrl+→ advance'
						: capabilities.secondScreen.unavailableMessage}
				</span>
			</div>

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
					<div
						style={{
							font: '700 var(--text-lg) var(--font-display)',
							color: 'var(--color-text-primary)',
						}}
					>
						New scene card
					</div>
					<form
						onSubmit={createCard}
						style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
					>
						<Field label="Title" htmlFor="card-title" required>
							<Input
								id="card-title"
								value={title}
								onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
								placeholder="The Gates of Barovia"
							/>
						</Field>
						<Field label="Mood" htmlFor="card-mood">
							<Select
								id="card-mood"
								value={mood}
								onChange={(e: { target: { value: string } }) =>
									setMood(e.target.value as SceneCardMood)
								}
								options={MOOD_OPTIONS}
							/>
						</Field>
						<Field
							label="Flavor text"
							htmlFor="card-flavor"
							help="Shown on the display and pushed to players (max 500)."
						>
							<Textarea
								id="card-flavor"
								value={flavor}
								maxLength={500}
								onChange={(e: { target: { value: string } }) => setFlavor(e.target.value)}
								placeholder="Mist coils between iron spikes…"
							/>
						</Field>
						<Field
							label="Hero image URL"
							htmlFor="card-hero"
							help={
								nativeDesktop
									? 'Remote image links are blocked in the desktop app; scene cards use their mood backdrop.'
									: android
										? 'Optional HTTPS link. Android blocks cleartext HTTP images.'
										: 'Optional. A link; leave blank for a mood backdrop.'
							}
						>
							<Input
								id="card-hero"
								value={heroUrl}
								disabled={nativeDesktop}
								onChange={(e: { target: { value: string } }) => setHeroUrl(e.target.value)}
								placeholder="https://…"
							/>
						</Field>
						<Field
							label="Visibility"
							htmlFor="card-visibility"
							help="Player-visible cards push a banner to player devices when activated."
						>
							<Select
								id="card-visibility"
								value={visibility}
								onChange={(e: { target: { value: string } }) =>
									setVisibility(e.target.value as SceneCardVisibility)
								}
								options={[
									{ value: 'dm-only', label: 'DM only' },
									{ value: 'player-visible', label: 'Player visible' },
								]}
							/>
						</Field>
						<Button
							type="submit"
							variant="primary"
							icon="add"
							disabled={submitting || !title.trim()}
						>
							{submitting ? 'Creating…' : 'Create scene card'}
						</Button>
					</form>
				</Card>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
					<SceneQueuePanel
						queue={queue}
						activeCardId={display.active?.id ?? null}
						transitionStyle={display.transitionStyle}
						onAdvance={() => void run('scene-card.advance', {}, 'The queue could not advance.')}
						onDequeue={(id) =>
							void run('scene-card.dequeue', { cardId: id }, 'The card could not be removed.')
						}
						onReorder={(order) =>
							void run(
								'scene-card.reorder-queue',
								{ queue: order },
								'The queue could not be reordered.',
							)
						}
						onTransition={(style) =>
							void run(
								'scene-card.set-transition',
								{ transitionStyle: style },
								'The transition could not be set.',
							)
						}
					/>

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
							Cards · {cards.length}
						</div>
						{cards.length === 0 ? (
							<Card elevation="flat" padding="lg">
								<div
									style={{
										font: 'var(--text-sm) var(--font-sans)',
										color: 'var(--color-text-secondary)',
									}}
								>
									No scene cards yet. Create one to display it or push it to players.
								</div>
							</Card>
						) : (
							<Card
								elevation="flat"
								padding="sm"
								style={{ display: 'flex', flexDirection: 'column' }}
							>
								{cards.map((card, i) => (
									<SceneCardRow
										key={card.id}
										card={card}
										first={i === 0}
										active={display.active?.id === card.id}
										queued={queuedIds.has(card.id)}
										editing={editingId === card.id}
										allowRemoteHero={!nativeDesktop}
										requireHttpsHero={android}
										onEditToggle={() => setEditingId((prev) => (prev === card.id ? null : card.id))}
										onActivate={() =>
											void run(
												'scene-card.activate',
												{ cardId: card.id },
												'The card could not be activated.',
											)
										}
										onEnqueue={() =>
											void run(
												'scene-card.enqueue',
												{ cardId: card.id },
												'The card could not be queued.',
											)
										}
										onToggleVisibility={() =>
											void run(
												'scene-card.set-visibility',
												{
													cardId: card.id,
													visibility: card.visibility === 'dm-only' ? 'player-visible' : 'dm-only',
												},
												'Visibility could not change.',
											)
										}
										onDelete={() => void deleteCard(card)}
										onSaveEdit={async (patch) => {
											const result = await run(
												'scene-card.update',
												{ cardId: card.id, ...patch },
												'The card could not be saved.',
											);
											if (result.status === 'accepted') setEditingId(null);
										}}
									/>
								))}
							</Card>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function SceneQueuePanel({
	queue,
	activeCardId,
	transitionStyle,
	onAdvance,
	onDequeue,
	onReorder,
	onTransition,
}: {
	queue: SceneCardView[];
	activeCardId: string | null;
	transitionStyle: SceneCardTransitionStyle;
	onAdvance: () => void;
	onDequeue: (id: string) => void;
	onReorder: (order: string[]) => void;
	onTransition: (style: SceneCardTransitionStyle) => void;
}) {
	function move(index: number, delta: number) {
		const order = queue.map((c) => c.id);
		const target = index + delta;
		if (target < 0 || target >= order.length) return;
		[order[index], order[target]] = [order[target], order[index]];
		onReorder(order);
	}

	return (
		<Card
			elevation="raised"
			padding="md"
			style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-3)',
					flexWrap: 'wrap',
				}}
			>
				<div
					style={{
						font: '700 var(--text-md) var(--font-display)',
						color: 'var(--color-text-primary)',
						flex: '1 1 100px',
					}}
				>
					Queue · {queue.length}
				</div>
				<span style={{ flex: '1 1 140px', minWidth: 0 }}>
					<Select
						aria-label="Transition style"
						value={transitionStyle}
						onChange={(e: { target: { value: string } }) =>
							onTransition(e.target.value as SceneCardTransitionStyle)
						}
						options={TRANSITION_OPTIONS}
					/>
				</span>
				<Button
					variant="primary"
					size="sm"
					icon="skip"
					disabled={queue.length === 0}
					onClick={onAdvance}
				>
					Advance
				</Button>
			</div>
			{queue.length === 0 ? (
				<div
					style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-tertiary)' }}
				>
					The queue is empty. Queue cards below, then advance (Ctrl+→) to play them in order.
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{queue.map((card, i) => {
						const theme = moodTheme(card.mood);
						return (
							<div
								key={card.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-2)',
									padding: 'var(--space-2)',
									borderTop: i ? '1px solid var(--color-border)' : 'none',
									flexWrap: 'wrap',
								}}
							>
								<span
									style={{
										width: 9,
										height: 9,
										borderRadius: '50%',
										flex: '0 0 auto',
										background: theme.accent,
									}}
								/>
								<span
									style={{
										flex: 1,
										minWidth: 0,
										font: '600 var(--text-sm) var(--font-sans)',
										color: 'var(--color-text-primary)',
									}}
								>
									{i + 1}. {card.title}
								</span>
								{activeCardId === card.id && <Badge status="success">On display</Badge>}
								<span style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
									<IconButton
										icon="chevron-up"
										label={`Move ${card.title} up`}
										variant="ghost"
										size="sm"
										onClick={() => move(i, -1)}
									/>
									<IconButton
										icon="chevron-down"
										label={`Move ${card.title} down`}
										variant="ghost"
										size="sm"
										onClick={() => move(i, 1)}
									/>
									<IconButton
										icon="close"
										label={`Remove ${card.title} from queue`}
										variant="ghost"
										size="sm"
										onClick={() => onDequeue(card.id)}
									/>
								</span>
							</div>
						);
					})}
				</div>
			)}
		</Card>
	);
}

function SceneCardRow({
	card,
	first,
	active,
	queued,
	editing,
	allowRemoteHero,
	requireHttpsHero,
	onEditToggle,
	onActivate,
	onEnqueue,
	onToggleVisibility,
	onDelete,
	onSaveEdit,
}: {
	card: SceneCardView;
	first: boolean;
	active: boolean;
	queued: boolean;
	editing: boolean;
	allowRemoteHero: boolean;
	requireHttpsHero: boolean;
	onEditToggle: () => void;
	onActivate: () => void;
	onEnqueue: () => void;
	onToggleVisibility: () => void;
	onDelete: () => void;
	onSaveEdit: (patch: {
		title: string;
		mood: SceneCardMood;
		flavorText: string;
		heroImage: { kind: 'url'; ref: string } | null;
	}) => void;
}) {
	const theme = moodTheme(card.mood);
	const [draftTitle, setDraftTitle] = useState(card.title);
	const [draftMood, setDraftMood] = useState<SceneCardMood>(card.mood);
	const [draftFlavor, setDraftFlavor] = useState(card.flavorText);
	const [draftHero, setDraftHero] = useState(
		card.heroImage?.kind === 'url' ? card.heroImage.ref : '',
	);
	useEffect(() => {
		if (editing) return;
		setDraftTitle(card.title);
		setDraftMood(card.mood);
		setDraftFlavor(card.flavorText);
		setDraftHero(card.heroImage?.kind === 'url' ? card.heroImage.ref : '');
	}, [editing, card.title, card.mood, card.flavorText, card.heroImage]);
	const legacyHeroBlocked =
		requireHttpsHero &&
		!!draftHero.trim() &&
		!isNetworkDestinationAllowed(draftHero.trim(), 'android');
	const saveEdit = () => {
		if (legacyHeroBlocked) {
			Toaster.error('Android scene images must use a valid HTTPS URL.');
			return;
		}
		onSaveEdit({
			title: draftTitle.trim(),
			mood: draftMood,
			flavorText: draftFlavor.trim(),
			heroImage:
				allowRemoteHero && draftHero.trim() ? { kind: 'url', ref: draftHero.trim() } : null,
		});
	};

	return (
		<div
			style={{
				borderTop: first ? 'none' : '1px solid var(--color-border)',
				padding: 'var(--space-2) var(--space-1)',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span
					style={{
						width: 10,
						height: 10,
						borderRadius: 3,
						flex: '0 0 auto',
						background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
						border: `1px solid ${theme.accent}`,
					}}
				/>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							font: '600 var(--text-sm) var(--font-sans)',
							color: 'var(--color-text-primary)',
						}}
					>
						{card.title}
					</div>
					<div
						style={{
							font: 'var(--text-xs) var(--font-sans)',
							color: 'var(--color-text-tertiary)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{card.flavorText || 'No flavor text'}
					</div>
				</div>
				<Badge status={card.visibility === 'player-visible' ? 'info' : 'neutral'}>
					{card.visibility === 'player-visible' ? 'Players' : 'DM only'}
				</Badge>
				{legacyHeroBlocked && <Badge status="warning">HTTPS image required</Badge>}
				{active && <Badge status="success">On display</Badge>}
				<Button
					variant={active ? 'secondary' : 'primary'}
					size="sm"
					icon="play"
					onClick={onActivate}
				>
					{active ? 'Re-show' : 'Display'}
				</Button>
				<IconButton
					icon="add"
					label={queued ? `${card.title} is queued` : `Queue ${card.title}`}
					variant="ghost"
					size="sm"
					disabled={queued}
					onClick={onEnqueue}
				/>
				<IconButton
					icon={card.visibility === 'player-visible' ? 'visibility-players' : 'dm-only'}
					label={`Make ${card.title} ${card.visibility === 'player-visible' ? 'DM only' : 'player visible'}`}
					variant="ghost"
					size="sm"
					onClick={onToggleVisibility}
				/>
				<IconButton
					icon="edit"
					label={`Edit ${card.title}`}
					variant="ghost"
					size="sm"
					onClick={onEditToggle}
				/>
				<IconButton
					icon="delete"
					label={`Delete ${card.title}`}
					variant="ghost"
					size="sm"
					onClick={onDelete}
				/>
			</div>
			{editing && (
				<div
					onKeyDown={(e: React.KeyboardEvent) => {
						if (e.key === 'Escape') {
							e.stopPropagation();
							onEditToggle();
						}
					}}
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-3)',
						margin: 'var(--space-3) 0',
						padding: 'var(--space-3)',
						borderRadius: 'var(--radius-md)',
						background: 'var(--color-surface-sunken)',
						border: '1px solid var(--color-border)',
					}}
				>
					<Field label="Title" required>
						<Input
							value={draftTitle}
							onChange={(e: { target: { value: string } }) => setDraftTitle(e.target.value)}
						/>
					</Field>
					<Field label="Mood">
						<Select
							value={draftMood}
							onChange={(e: { target: { value: string } }) =>
								setDraftMood(e.target.value as SceneCardMood)
							}
							options={MOOD_OPTIONS}
						/>
					</Field>
					<Field label="Flavor text">
						<Textarea
							rows={2}
							value={draftFlavor}
							maxLength={500}
							onChange={(e: { target: { value: string } }) => setDraftFlavor(e.target.value)}
						/>
					</Field>
					<Field
						label="Hero image URL"
						help={
							legacyHeroBlocked
								? 'This legacy cleartext or invalid image URL is blocked on Android. Replace it with HTTPS or clear it.'
								: allowRemoteHero
									? requireHttpsHero
										? 'Android scene images must use HTTPS.'
										: undefined
									: 'Remote image links are blocked in the desktop app. Saving clears this link.'
						}
					>
						<Input
							value={draftHero}
							disabled={!allowRemoteHero}
							onChange={(e: { target: { value: string } }) => setDraftHero(e.target.value)}
							placeholder="https://…"
						/>
					</Field>
					<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
						<Button
							variant="primary"
							size="sm"
							icon="check"
							disabled={!draftTitle.trim()}
							onClick={saveEdit}
						>
							Save
						</Button>
						<Button variant="ghost" size="sm" onClick={onEditToggle}>
							Cancel
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
