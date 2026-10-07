import { useState, type FormEvent } from 'react';
import type { SceneCardMood, SceneCardVisibility, SceneCardLightingHint } from '@dndtools/core';
import { Button, Card, Field, Input, Select, Textarea, Toaster } from '../../../ds';
import { useI18n } from '../../../i18n';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { SCENE_MOOD_THEME } from '../../sceneCardMood';
import { isNativeDesktopRuntime } from '../../../platform/windowChrome';
import {
	isNetworkDestinationAllowed,
	usePlatformCapabilities,
} from '../../../platform/capabilities';

export function SceneCardComposer({
	presetOptions,
	lightingOptions,
}: {
	presetOptions: { value: string; label: string }[];
	lightingOptions: { value: string; label: string }[];
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const capabilities = usePlatformCapabilities();
	const android = capabilities.runtimeKind === 'android';
	const nativeDesktop = isNativeDesktopRuntime();
	const actorId = runtime.defaultActorId;
	const moodOptions = (Object.keys(SCENE_MOOD_THEME) as SceneCardMood[]).map((value) => ({
		value,
		label: t(`sceneDisplay.mood.${value}`),
	}));
	const [title, setTitle] = useState('');
	const [mood, setMood] = useState<SceneCardMood>('exploration');
	const [flavor, setFlavor] = useState('');
	const [heroUrl, setHeroUrl] = useState('');
	const [visibility, setVisibility] = useState<SceneCardVisibility>('dm-only');
	const [audioPresetId, setAudioPresetId] = useState('');
	const [lightingHint, setLightingHint] = useState('');
	const [submitting, setSubmitting] = useState(false);
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
					audioPresetId: audioPresetId || null,
					lightingHint: (lightingHint || null) as SceneCardLightingHint | null,
				},
			});
			if (result.status === 'accepted') {
				Toaster.success(t('sceneCards.saved'));
				setTitle('');
				setFlavor('');
				setHeroUrl('');
				setMood('exploration');
				setVisibility('dm-only');
				setAudioPresetId('');
				setLightingHint('');
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

	return (
		<Card
			elevation="raised"
			padding="lg"
			style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
		>
			<div
				style={{
					font: '700 var(--text-lg) var(--font-sans)',
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
						options={moodOptions}
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
					label={t('sceneCards.audioPreset')}
					htmlFor="card-preset"
					help={t('sceneCards.packageHelp')}
				>
					<Select
						id="card-preset"
						value={audioPresetId}
						onChange={(e: { target: { value: string } }) => setAudioPresetId(e.target.value)}
						options={presetOptions}
					/>
				</Field>
				<Field label={t('sceneCards.lightingHint')} htmlFor="card-lighting">
					<Select
						id="card-lighting"
						value={lightingHint}
						onChange={(e: { target: { value: string } }) => setLightingHint(e.target.value)}
						options={lightingOptions}
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
					style={{ minHeight: 'var(--space-12)' }}
					type="submit"
					variant="primary"
					icon="add"
					disabled={submitting || !title.trim()}
					title={
						submitting
							? t('sceneCards.creating')
							: !title.trim()
								? `${t('common.field.title')} · ${t('extensions.customTypes.required')}`
								: undefined
					}
				>
					{submitting ? t('sceneCards.creating') : t('sceneCards.create')}
				</Button>
			</form>
		</Card>
	);
}
