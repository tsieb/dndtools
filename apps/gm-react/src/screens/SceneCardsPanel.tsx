import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { useI18n } from '../i18n';
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
	const { t } = useI18n();
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
			Toaster.error(t('On Android, scene images need a secure https:// link.'));
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
				Toaster.error(
					result.rejection.message ?? t('The scene card couldn’t be created — try again.'),
				);
			}
		} catch {
			// A thrown persist failure left the composer populated and said nothing at all, so the
			// Create button read as simply not registering.
			Toaster.error(t('The scene card couldn’t be created — try again.'));
		} finally {
			setSubmitting(false);
		}
	}

	// Show / Queue / Dequeue / Reorder / Next card / visibility / Delete / Save-edit / transition ALL
	// route through here. `runtime.dispatch` THROWS on a persist failure (SceneRuntime rethrows after
	// `persistFullState`), so without this catch every one of them escaped as an unhandled rejection:
	// the button did nothing and said nothing, and `deleteCard` never reached its Undo toast.
	async function run(type: string, payload: Record<string, unknown>, failMsg: string) {
		try {
			const result = await runtime.dispatch({ type, actorId, payload } as Parameters<
				typeof runtime.dispatch
			>[0]);
			if (result.status !== 'accepted') Toaster.error(result.rejection.message ?? failMsg);
			return result;
		} catch {
			Toaster.error(failMsg);
			return { status: 'rejected' as const, rejection: { message: failMsg } };
		}
	}

	async function deleteCard(card: SceneCardView) {
		const result = await run(
			'scene-card.delete',
			{ cardId: card.id },
			t('The card couldn’t be deleted — try again.'),
		);
		if (result.status !== 'accepted') return;
		Toaster.success(t('“{title}” deleted', { title: card.title }), {
			action: t('Undo'),
			onAction: () =>
				void run(
					'scene-card.restore',
					{ cardId: card.id },
					t('The card couldn’t be restored — try again.'),
				),
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
						{t('Atmosphere')}
					</div>
					<div
						style={{
							font: '700 var(--text-xl) var(--font-display)',
							color: 'var(--color-text-primary)',
						}}
					>
						{t('Scene cards')}
					</div>
				</div>
				<span style={{ flex: '1 1 var(--space-4)' }} />
				<Button
					variant="secondary"
					size="sm"
					icon="display"
					disabled={!capabilities.secondScreen.available}
					title={capabilities.secondScreen.unavailableMessage ?? undefined}
					aria-label={
						capabilities.secondScreen.available
							? t('Open on a second screen')
							: (capabilities.secondScreen.unavailableMessage ??
								t('Second screen is not available on this device'))
					}
					onClick={() => openSecondScreen()}
				>
					{t('Second screen')}
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
						? t('Ctrl+Shift+S fullscreen · Ctrl+→ next card')
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
						{t('New scene card')}
					</div>
					<form
						onSubmit={createCard}
						style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
					>
						<Field label={t('Title')} htmlFor="card-title" required>
							<Input
								id="card-title"
								value={title}
								onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
								placeholder="The Gates of Barovia"
							/>
						</Field>
						<Field label={t('Mood')} htmlFor="card-mood">
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
							label={t('Flavor text')}
							htmlFor="card-flavor"
							help={t('Shown on the display and sent to players (max 500 characters).')}
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
							label={t('Hero image link')}
							htmlFor="card-hero"
							help={
								nativeDesktop
									? t(
											'Remote image links are blocked in the desktop app; scene cards use their mood backdrop.',
										)
									: android
										? t(
												'Optional secure link (https://). Plain http:// images don’t load on Android.',
											)
										: t('Optional image link. Leave blank to use the mood backdrop.')
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
							label={t('Visibility')}
							htmlFor="card-visibility"
							help={t('Player-visible cards appear on player devices when shown.')}
						>
							<Select
								id="card-visibility"
								value={visibility}
								onChange={(e: { target: { value: string } }) =>
									setVisibility(e.target.value as SceneCardVisibility)
								}
								options={[
									{ value: 'dm-only', label: t('DM only') },
									{ value: 'player-visible', label: t('Player visible') },
								]}
							/>
						</Field>
						<Button
							type="submit"
							variant="primary"
							icon="add"
							disabled={submitting || !title.trim()}
						>
							{submitting ? t('Creating…') : t('Create scene card')}
						</Button>
					</form>
				</Card>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
					<SceneQueuePanel
						queue={queue}
						activeCardId={display.active?.id ?? null}
						transitionStyle={display.transitionStyle}
						onAdvance={() =>
							void run('scene-card.advance', {}, t('The queue couldn’t advance — try again.'))
						}
						onDequeue={(id) =>
							void run(
								'scene-card.dequeue',
								{ cardId: id },
								t('The card couldn’t be removed from the queue — try again.'),
							)
						}
						onReorder={(order) =>
							void run(
								'scene-card.reorder-queue',
								{ queue: order },
								t('The queue couldn’t be reordered — try again.'),
							)
						}
						onTransition={(style) =>
							void run(
								'scene-card.set-transition',
								{ transitionStyle: style },
								t('The transition couldn’t be changed — try again.'),
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
							{t('Cards · {count}', { count: cards.length })}
						</div>
						{cards.length === 0 ? (
							<Card elevation="flat" padding="lg">
								<div
									style={{
										font: 'var(--text-sm) var(--font-sans)',
										color: 'var(--color-text-secondary)',
									}}
								>
									{t('No scene cards yet. Create one to set the scene at the table.')}
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
												t('The card couldn’t be shown — try again.'),
											)
										}
										onEnqueue={() =>
											void run(
												'scene-card.enqueue',
												{ cardId: card.id },
												t('The card couldn’t be queued — try again.'),
											)
										}
										onToggleVisibility={() =>
											void run(
												'scene-card.set-visibility',
												{
													cardId: card.id,
													visibility: card.visibility === 'dm-only' ? 'player-visible' : 'dm-only',
												},
												t('Visibility couldn’t be changed — try again.'),
											)
										}
										onDelete={() => void deleteCard(card)}
										onSaveEdit={async (patch) => {
											const result = await run(
												'scene-card.update',
												{ cardId: card.id, ...patch },
												t('The card couldn’t be saved — try again.'),
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
	const { t } = useI18n();
	// Reordering re-renders the whole queue, so the button the DM just pressed is a different element
	// afterwards — and at the ends of the queue it becomes `disabled`, which drops focus to <body>
	// mid-keyboard-interaction. Remember which card moved and restore focus to it after the render.
	const refocus = useRef<{ id: string; dir: -1 | 1; index: number } | null>(null);
	useEffect(() => {
		const want = refocus.current;
		if (!want) return;
		// `onReorder` dispatches asynchronously, so this effect also runs on renders that still show
		// the OLD order. Acting then focuses an arrow that is about to be disabled, and the browser
		// blurs it straight to <body> — the very bug this exists to prevent. Wait until the card has
		// actually landed on its new index. If it never does (a rejected command) nothing is focused,
		// which is the same as the old behaviour rather than a wrong jump.
		if (queue[want.index]?.id !== want.id) return;
		refocus.current = null;
		const pick = (dir: number) =>
			document.querySelector<HTMLButtonElement>(
				`[data-queue-card="${want.id}"][data-queue-move="${dir}"]`,
			);
		// Same direction if it is still usable; otherwise the opposite arrow on the same row, which is
		// guaranteed enabled (a card cannot be at both ends of a queue of two or more).
		const same = pick(want.dir);
		const target = same && !same.disabled ? same : pick(-want.dir);
		if (target && !target.disabled) target.focus();
	}, [queue]);

	function move(index: number, delta: -1 | 1) {
		const order = queue.map((c) => c.id);
		const target = index + delta;
		if (target < 0 || target >= order.length) return;
		refocus.current = { id: order[index]!, dir: delta, index: target };
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
					{t('Queue · {count}', { count: queue.length })}
				</div>
				<span style={{ flex: '1 1 140px', minWidth: 0 }}>
					<Select
						aria-label={t('Transition style')}
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
					{t('Next card')}
				</Button>
			</div>
			{queue.length === 0 ? (
				<div
					style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-tertiary)' }}
				>
					{t(
						'The queue is empty. Queue cards below, then press Next card (Ctrl+→) to play them in order.',
					)}
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
								{activeCardId === card.id && <Badge status="success">{t('On display')}</Badge>}
								<span style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
									<IconButton
										icon="chevron-up"
										label={t('Move {title} up', { title: card.title })}
										variant="ghost"
										size="sm"
										disabled={i === 0}
										data-queue-card={card.id}
										data-queue-move={-1}
										onClick={() => move(i, -1)}
									/>
									<IconButton
										icon="chevron-down"
										label={t('Move {title} down', { title: card.title })}
										variant="ghost"
										size="sm"
										disabled={i === queue.length - 1}
										data-queue-card={card.id}
										data-queue-move={1}
										onClick={() => move(i, 1)}
									/>
									<IconButton
										icon="close"
										label={t('Remove {title} from queue', { title: card.title })}
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
	const { t } = useI18n();
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
			Toaster.error(t('On Android, scene images need a secure https:// link.'));
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
			{/* Without wrapping, the badges + Show button + 4 icon buttons refuse to shrink and crush
			    the title block to a few unreadable pixels on a phone. The queue rows above already
			    wrap for exactly this reason. */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					flexWrap: 'wrap',
				}}
			>
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
				{/* minWidth gives the title a floor to wrap AGAINST — with `minWidth: 0` alone the
				    non-shrinking controls still won the row and squeezed it to nothing. */}
				<div style={{ flex: 1, minWidth: 160 }}>
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
						{card.flavorText || t('No flavor text')}
					</div>
				</div>
				<Badge status={card.visibility === 'player-visible' ? 'info' : 'neutral'}>
					{card.visibility === 'player-visible' ? t('Players') : t('DM only')}
				</Badge>
				{legacyHeroBlocked && <Badge status="warning">{t('Secure image link required')}</Badge>}
				{active && <Badge status="success">{t('On display')}</Badge>}
				<Button
					variant={active ? 'secondary' : 'primary'}
					size="sm"
					icon="play"
					onClick={onActivate}
				>
					{active ? t('Show again') : t('Show')}
				</Button>
				<IconButton
					icon="add"
					label={
						queued
							? t('{title} is queued', { title: card.title })
							: t('Queue {title}', { title: card.title })
					}
					variant="ghost"
					size="sm"
					disabled={queued}
					onClick={onEnqueue}
				/>
				<IconButton
					icon={card.visibility === 'player-visible' ? 'visibility-players' : 'dm-only'}
					label={
						card.visibility === 'player-visible'
							? t('Make {title} DM only', { title: card.title })
							: t('Make {title} player visible', { title: card.title })
					}
					variant="ghost"
					size="sm"
					onClick={onToggleVisibility}
				/>
				<IconButton
					icon="edit"
					label={t('Edit {title}', { title: card.title })}
					variant="ghost"
					size="sm"
					onClick={onEditToggle}
				/>
				<IconButton
					icon="delete"
					label={t('Delete {title}', { title: card.title })}
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
					<Field label={t('Title')} required>
						<Input
							value={draftTitle}
							onChange={(e: { target: { value: string } }) => setDraftTitle(e.target.value)}
						/>
					</Field>
					<Field label={t('Mood')}>
						<Select
							value={draftMood}
							onChange={(e: { target: { value: string } }) =>
								setDraftMood(e.target.value as SceneCardMood)
							}
							options={MOOD_OPTIONS}
						/>
					</Field>
					<Field label={t('Flavor text')}>
						<Textarea
							rows={2}
							value={draftFlavor}
							maxLength={500}
							onChange={(e: { target: { value: string } }) => setDraftFlavor(e.target.value)}
						/>
					</Field>
					<Field
						label={t('Hero image link')}
						help={
							legacyHeroBlocked
								? t(
										'This image link doesn’t load on Android. Replace it with an https:// link or clear it.',
									)
								: allowRemoteHero
									? requireHttpsHero
										? t('On Android, image links must use https://.')
										: undefined
									: t('Remote image links are blocked in the desktop app. Saving clears this link.')
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
							{t('Save')}
						</Button>
						<Button variant="ghost" size="sm" onClick={onEditToggle}>
							{t('Cancel')}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
