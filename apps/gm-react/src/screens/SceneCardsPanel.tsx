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
			Toaster.error(t('sceneCards.androidSecureLink'));
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
				Toaster.error(result.rejection.message ?? t('sceneCards.createFailed'));
			}
		} catch {
			// A thrown persist failure left the composer populated and said nothing at all, so the
			// Create button read as simply not registering.
			Toaster.error(t('sceneCards.createFailed'));
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
			t('sceneCards.deleteFailed'),
		);
		if (result.status !== 'accepted') return;
		Toaster.success(t('sceneCards.deleted', { title: card.title }), {
			action: t('common.action.undo'),
			onAction: () =>
				void run('scene-card.restore', { cardId: card.id }, t('sceneCards.restoreFailed')),
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
						{t('sceneCards.atmosphere')}
					</div>
					<div
						style={{
							font: '700 var(--text-xl) var(--font-display)',
							color: 'var(--color-text-primary)',
						}}
					>
						{t('sceneCards.title')}
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
							? t('sceneDisplay.secondScreenOpen')
							: (capabilities.secondScreen.unavailableMessage ??
								t('sceneDisplay.secondScreenUnavailable'))
					}
					onClick={() => openSecondScreen()}
				>
					{t('sceneDisplay.secondScreen')}
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
						? t('sceneCards.shortcuts')
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
						{t('sceneCards.new')}
					</div>
					<form
						onSubmit={createCard}
						style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
					>
						<Field label={t('common.field.title')} htmlFor="card-title" required>
							<Input
								id="card-title"
								value={title}
								onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
								placeholder={t('sceneCards.titlePlaceholder')}
							/>
						</Field>
						<Field label={t('sceneCards.mood')} htmlFor="card-mood">
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
							label={t('sceneCards.flavorText')}
							htmlFor="card-flavor"
							help={t('sceneCards.flavorTextHelp')}
						>
							<Textarea
								id="card-flavor"
								value={flavor}
								maxLength={500}
								onChange={(e: { target: { value: string } }) => setFlavor(e.target.value)}
								placeholder={t('sceneCards.flavorPlaceholder')}
							/>
						</Field>
						<Field
							label={t('sceneCards.heroImage')}
							htmlFor="card-hero"
							help={
								nativeDesktop
									? t('sceneCards.heroImageDesktopBlocked')
									: android
										? t('sceneCards.heroImageSecureHelp')
										: t('sceneCards.heroImageHelp')
							}
						>
							<Input
								id="card-hero"
								value={heroUrl}
								disabled={nativeDesktop}
								onChange={(e: { target: { value: string } }) => setHeroUrl(e.target.value)}
								placeholder={t('sceneCards.urlPlaceholder')}
							/>
						</Field>
						<Field
							label={t('common.visibility.label')}
							htmlFor="card-visibility"
							help={t('sceneCards.visibilityHelp')}
						>
							<Select
								id="card-visibility"
								value={visibility}
								onChange={(e: { target: { value: string } }) =>
									setVisibility(e.target.value as SceneCardVisibility)
								}
								options={[
									{ value: 'dm-only', label: t('common.visibility.dmOnly') },
									{ value: 'player-visible', label: t('common.visibility.playerVisible') },
								]}
							/>
						</Field>
						<Button
							type="submit"
							variant="primary"
							icon="add"
							disabled={submitting || !title.trim()}
						>
							{submitting ? t('sceneCards.creating') : t('sceneCards.create')}
						</Button>
					</form>
				</Card>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
					<SceneQueuePanel
						queue={queue}
						activeCardId={display.active?.id ?? null}
						transitionStyle={display.transitionStyle}
						onAdvance={() => void run('scene-card.advance', {}, t('sceneCards.advanceFailed'))}
						onDequeue={(id) =>
							void run('scene-card.dequeue', { cardId: id }, t('sceneCards.removeFailed'))
						}
						onReorder={(order) =>
							void run('scene-card.reorder-queue', { queue: order }, t('sceneCards.reorderFailed'))
						}
						onTransition={(style) =>
							void run(
								'scene-card.set-transition',
								{ transitionStyle: style },
								t('sceneCards.transitionFailed'),
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
							{t('sceneCards.count', { count: cards.length })}
						</div>
						{cards.length === 0 ? (
							<Card elevation="flat" padding="lg">
								<div
									style={{
										font: 'var(--text-sm) var(--font-sans)',
										color: 'var(--color-text-secondary)',
									}}
								>
									{t('sceneCards.empty')}
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
												t('sceneCards.showFailed'),
											)
										}
										onEnqueue={() =>
											void run(
												'scene-card.enqueue',
												{ cardId: card.id },
												t('sceneCards.queueFailed'),
											)
										}
										onToggleVisibility={() =>
											void run(
												'scene-card.set-visibility',
												{
													cardId: card.id,
													visibility: card.visibility === 'dm-only' ? 'player-visible' : 'dm-only',
												},
												t('sceneCards.visibilityFailed'),
											)
										}
										onDelete={() => void deleteCard(card)}
										onSaveEdit={async (patch) => {
											const result = await run(
												'scene-card.update',
												{ cardId: card.id, ...patch },
												t('sceneCards.saveFailed'),
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
					{t('sceneCards.queueCount', { count: queue.length })}
				</div>
				<span style={{ flex: '1 1 140px', minWidth: 0 }}>
					<Select
						aria-label={t('sceneCards.transitionStyle')}
						value={transitionStyle}
						onChange={(e: { target: { value: string } }) =>
							onTransition(e.target.value as SceneCardTransitionStyle)
						}
						options={TRANSITION_OPTIONS}
					/>
				</span>
				{/* `scene-card.advance` POPS the queue head, so advancing the LAST queued card emptied the
				    queue and hard-disabled this button under the DM's finger — focus fell to <body> and
				    the next Tab restarted at the skip link, on the control they press most during play.
				    Soft-disable keeps the tab stop and lets the button say why it is unavailable. */}
				<Button
					variant="primary"
					size="sm"
					icon="skip"
					aria-disabled={queue.length === 0 || undefined}
					title={queue.length === 0 ? t('sceneDisplay.queueFirst') : undefined}
					// The soft disable has to be enforced in the handler too. `aria-disabled` on a DS
					// Button swallows the click, but `Button` only does that for `aria-disabled={true}`
					// — and a bare `onClick={onAdvance}` here still fired a `scene-card.advance` that
					// the core rejects with "The scene queue is empty.", so a deliberate press on a
					// control that says it is unavailable answered with a red error toast.
					onClick={() => {
						if (queue.length === 0) return;
						onAdvance();
					}}
				>
					{t('sceneDisplay.nextCard')}
				</Button>
			</div>
			{queue.length === 0 ? (
				<div
					style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-tertiary)' }}
				>
					{t('sceneCards.queueEmpty')}
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
								{activeCardId === card.id && (
									<Badge status="success">{t('sceneDisplay.onDisplay')}</Badge>
								)}
								<span style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
									<IconButton
										icon="chevron-up"
										label={t('sceneCards.moveUp', { title: card.title })}
										variant="ghost"
										size="sm"
										disabled={i === 0}
										data-queue-card={card.id}
										data-queue-move={-1}
										onClick={() => move(i, -1)}
									/>
									<IconButton
										icon="chevron-down"
										label={t('sceneCards.moveDown', { title: card.title })}
										variant="ghost"
										size="sm"
										disabled={i === queue.length - 1}
										data-queue-card={card.id}
										data-queue-move={1}
										onClick={() => move(i, 1)}
									/>
									<IconButton
										icon="close"
										label={t('sceneCards.removeFromQueue', { title: card.title })}
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
			Toaster.error(t('sceneCards.androidSecureLink'));
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
						{card.flavorText || t('sceneCards.noFlavorText')}
					</div>
				</div>
				<Badge status={card.visibility === 'player-visible' ? 'info' : 'neutral'}>
					{card.visibility === 'player-visible'
						? t('settings.players')
						: t('common.visibility.dmOnly')}
				</Badge>
				{legacyHeroBlocked && <Badge status="warning">{t('sceneCards.secureImageRequired')}</Badge>}
				{active && <Badge status="success">{t('sceneDisplay.onDisplay')}</Badge>}
				<Button
					variant={active ? 'secondary' : 'primary'}
					size="sm"
					icon="play"
					onClick={onActivate}
				>
					{active ? t('common.action.showAgain') : t('common.action.show')}
				</Button>
				<IconButton
					icon="add"
					label={
						queued
							? t('sceneCards.queued', { title: card.title })
							: t('sceneCards.queue', { title: card.title })
					}
					variant="ghost"
					size="sm"
					aria-disabled={queued || undefined}
					// Same as "Next card": without this guard the press reached
					// `scene-card.enqueue`, which rejects with the literal `Scene card <uuid> is
					// already queued.` — a raw id rendered into a user-facing error toast, on a button
					// whose own name already reads "{title} is queued".
					onClick={() => {
						if (queued) return;
						onEnqueue();
					}}
				/>
				<IconButton
					icon={card.visibility === 'player-visible' ? 'visibility-players' : 'dm-only'}
					label={
						card.visibility === 'player-visible'
							? t('sceneCards.makeDmOnly', { title: card.title })
							: t('sceneCards.makePlayerVisible', { title: card.title })
					}
					variant="ghost"
					size="sm"
					onClick={onToggleVisibility}
				/>
				<IconButton
					icon="edit"
					label={t('sceneCards.edit', { title: card.title })}
					variant="ghost"
					size="sm"
					onClick={onEditToggle}
				/>
				<IconButton
					icon="delete"
					label={t('sceneCards.delete', { title: card.title })}
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
					<Field label={t('common.field.title')} required>
						<Input
							value={draftTitle}
							onChange={(e: { target: { value: string } }) => setDraftTitle(e.target.value)}
						/>
					</Field>
					<Field label={t('sceneCards.mood')}>
						<Select
							value={draftMood}
							onChange={(e: { target: { value: string } }) =>
								setDraftMood(e.target.value as SceneCardMood)
							}
							options={MOOD_OPTIONS}
						/>
					</Field>
					<Field label={t('sceneCards.flavorText')}>
						<Textarea
							rows={2}
							value={draftFlavor}
							maxLength={500}
							onChange={(e: { target: { value: string } }) => setDraftFlavor(e.target.value)}
						/>
					</Field>
					<Field
						label={t('sceneCards.heroImage')}
						help={
							legacyHeroBlocked
								? t('sceneCards.androidImageBroken')
								: allowRemoteHero
									? requireHttpsHero
										? t('sceneCards.androidHttpsOnly')
										: undefined
									: t('sceneCards.heroImageDesktopClears')
						}
					>
						<Input
							value={draftHero}
							disabled={!allowRemoteHero}
							onChange={(e: { target: { value: string } }) => setDraftHero(e.target.value)}
							placeholder={t('sceneCards.urlPlaceholder')}
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
							{t('common.action.save')}
						</Button>
						<Button variant="ghost" size="sm" onClick={onEditToggle}>
							{t('common.action.cancel')}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
