import { useEffect, useRef } from 'react';
import type { SceneCardTransitionStyle, SceneCardView } from '@dndtools/core';
import { Badge, Button, Card, IconButton, Select } from '../ds';
import { useI18n } from '../i18n';
import { moodTheme } from '../app/sceneCardMood';

/**
 * I11 S11.2.3 — the scene-card QUEUE: reorder, advance, dequeue, and pick the transition style.
 * Split out of `SceneCardsPanel` by responsibility (RC-STB-2.7); it owns no state of its own beyond
 * the focus-restoration bookkeeping and dispatches through the callbacks the panel hands it.
 */
const TRANSITION_OPTIONS: { value: SceneCardTransitionStyle; label: string }[] = [
	{ value: 'crossfade', label: 'Crossfade' },
	{ value: 'slide', label: 'Slide' },
	{ value: 'cut', label: 'Cut' },
];

export function SceneQueuePanel({
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
