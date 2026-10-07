import { SceneCardRow } from './SceneCardRow';
import { SceneCardComposer } from './SceneCardComposer';
import { useMemo, useState } from 'react';
import {
	getSceneDisplayForActor,
	getSceneCardQueueForActor,
	listBuiltinAudioPresets,
	listSceneCardsForActor,
	listUserAudioPresets,
	type SceneCardLightingHint,
	type SceneCardView,
} from '@dndtools/core';
import { Button, Card, EmptyState, Toaster } from '../ds';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { useViewport } from '../app/useViewport';
import { openSecondScreen } from '../platform/sceneDisplayChannel';
import { isOnline } from '../platform/preferences';
import { isNativeDesktopRuntime } from '../platform/windowChrome';
import { usePlatformCapabilities } from '../platform/capabilities';
import { SceneQueuePanel } from './SceneQueuePanel';

/**
 * I11 S11.2.1–S11.2.3 — the DM authoring + control surface for ATMOSPHERE SCENE CARDS, embedded in
 * ScenesCreator (`/screens`). Create a card (title/mood/hero image URL/flavor/visibility), then from the
 * card list activate it onto the display, queue it, toggle its player visibility, edit, or delete. The
 * queue panel reorders/advances and picks the transition. All actions dispatch `scene-card.*` commands
 * through the single runtime write path; the fullscreen display (Ctrl+Shift+S) and the second-screen
 * window read the same core state.
 */

// RC-AUD-2.1 — the lighting half of a scene package: a stage direction shown with the card, not a device
// command. The app drives no lamps; the DM reads it and the display tints its wash.
const LIGHTING_HINTS: SceneCardLightingHint[] = ['bright', 'dim', 'dark', 'firelit', 'moonlit'];

export function SceneCardsPanel() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const isDesktop = useViewport() === 'desktop';
	const capabilities = usePlatformCapabilities();
	const android = capabilities.runtimeKind === 'android';
	const actorId = runtime.defaultActorId;
	const nativeDesktop = isNativeDesktopRuntime();
	const { session, permissions, audio } = runtime.state;

	const cards = listSceneCardsForActor(session, permissions, actorId);
	const queue = getSceneCardQueueForActor(session, permissions, actorId);
	const display = getSceneDisplayForActor(session, permissions, actorId);
	const queuedIds = new Set(queue.map((c) => c.id));

	const [pending, setPending] = useState(0);
	const [editingId, setEditingId] = useState<string | null>(null);

	// The package's audio half is picked from the SAME catalog the Audio screen applies (built-ins first,
	// then the DM's saved packages), so playing a card runs the ordinary preset path with its gates.
	const presetOptions = useMemo(
		() => [
			{ value: '', label: t('sceneCards.audioPresetNone') },
			...listBuiltinAudioPresets().map((preset) => ({ value: preset.id, label: preset.name })),
			...listUserAudioPresets(audio).map((preset) => ({ value: preset.id, label: preset.name })),
		],
		[audio, t],
	);
	const lightingOptions = useMemo(
		() => [
			{ value: '', label: t('sceneCards.lightingNone') },
			...LIGHTING_HINTS.map((hint) => ({ value: hint, label: t(`sceneCards.lighting.${hint}`) })),
		],
		[t],
	);

	// Show / Queue / Dequeue / Reorder / Next card / visibility / Delete / Save-edit / transition ALL
	// route through here. `runtime.dispatch` THROWS on a persist failure (SceneRuntime rethrows after
	// `persistFullState`), so without this catch every one of them escaped as an unhandled rejection:
	// the button did nothing and said nothing, and `deleteCard` never reached its Undo toast.
	async function run(type: string, payload: Record<string, unknown>, failMsg: string) {
		setPending((count) => count + 1);
		try {
			const result = await runtime.dispatch({ type, actorId, payload } as Parameters<
				typeof runtime.dispatch
			>[0]);
			if (result.status !== 'accepted') Toaster.error(result.rejection.message ?? failMsg);
			return result;
		} catch {
			Toaster.error(failMsg);
			return { status: 'rejected' as const, rejection: { message: failMsg } };
		} finally {
			setPending((count) => count - 1);
		}
	}

	// RC-AUD-2.1 — ONE click: apply the card's audio preset, show the card, push it when it is shared. The
	// core applies the audio best-effort and reports honestly, so a package whose preset cannot start still
	// shows the card and says why instead of claiming success.
	async function playPackage(card: SceneCardView) {
		const result = await run(
			'scene-card.play-package',
			{ cardId: card.id, online: isOnline() },
			t('sceneCards.playPackageFailed'),
		);
		if (result.status !== 'accepted') return;
		const summary = result.events?.find((event) => event.kind === 'scene-card.package-played');
		if (
			summary?.kind === 'scene-card.package-played' &&
			!summary.audioApplied &&
			card.audioPresetId
		) {
			Toaster.warning(
				t('sceneCards.packageShownNoAudio', {
					title: card.title,
					reason: summary.audioSkippedReason ?? '',
				}),
			);
			return;
		}
		Toaster.success(t('sceneCards.packagePlayed', { title: card.title }));
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

	// Keep the actor-scoped card read available to participants without offering DM commands.
	if (runtime.preview || permissions.actors[actorId]?.role !== 'dm') {
		return (
			<section aria-label={t('sceneCards.title')} style={{ marginTop: 'var(--space-8)' }}>
				{cards.map((card) => (
					<Card key={card.id} elevation="flat" padding="md">
						<h3 style={{ font: '600 var(--text-md) var(--font-sans)' }}>{card.title}</h3>
						<p style={{ font: 'var(--text-sm) var(--font-sans)' }}>{card.flavorText}</p>
					</Card>
				))}
			</section>
		);
	}

	return (
		<div style={{ maxWidth: 1180, margin: 'var(--space-8) auto 0' }}>
			<div
				role="status"
				style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}
			>
				{pending > 0 ? t('sceneCards.saving') : null}
			</div>
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
					style={{ minHeight: 'var(--space-12)' }}
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
				<SceneCardComposer presetOptions={presetOptions} lightingOptions={lightingOptions} />

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
							<EmptyState icon="scene" illustration="scenes-empty" title={t('sceneCards.empty')} />
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
										presetOptions={presetOptions}
										lightingOptions={lightingOptions}
										onPlayPackage={() => void playPackage(card)}
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
											if (result.status === 'accepted') {
												setEditingId(null);
												Toaster.success(t('sceneCards.saved'));
											}
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
