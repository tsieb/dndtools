import { useEffect, useState } from 'react';
import type { SceneCardView, SceneCardMood, SceneCardLightingHint } from '@dndtools/core';
import {
	VisibilityChip,
	Badge,
	Button,
	Field,
	IconButton,
	Input,
	Select,
	Textarea,
	Toaster,
} from '../../../ds';
import { useI18n } from '../../../i18n';
import { moodTheme, SCENE_MOOD_THEME } from '../../sceneCardMood';
import { isNetworkDestinationAllowed } from '../../../platform/capabilities';
export function SceneCardRow({
	card,
	first,
	active,
	queued,
	editing,
	allowRemoteHero,
	requireHttpsHero,
	presetOptions,
	lightingOptions,
	onEditToggle,
	onActivate,
	onPlayPackage,
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
	presetOptions: { value: string; label: string }[];
	lightingOptions: { value: string; label: string }[];
	onEditToggle: () => void;
	onActivate: () => void;
	onPlayPackage: () => void;
	onEnqueue: () => void;
	onToggleVisibility: () => void;
	onDelete: () => void;
	onSaveEdit: (patch: {
		title: string;
		mood: SceneCardMood;
		flavorText: string;
		heroImage: { kind: 'url'; ref: string } | null;
		audioPresetId: string | null;
		lightingHint: SceneCardLightingHint | null;
	}) => Promise<void>;
}) {
	const { t } = useI18n();
	const moodOptions = (Object.keys(SCENE_MOOD_THEME) as SceneCardMood[]).map((value) => ({
		value,
		label: t(`sceneDisplay.mood.${value}`),
	}));
	const theme = moodTheme(card.mood);
	const isPackage = card.audioPresetId !== null || card.lightingHint !== null;
	const [draftTitle, setDraftTitle] = useState(card.title);
	const [draftMood, setDraftMood] = useState<SceneCardMood>(card.mood);
	const [draftFlavor, setDraftFlavor] = useState(card.flavorText);
	const [draftHero, setDraftHero] = useState(
		card.heroImage?.kind === 'url' ? card.heroImage.ref : '',
	);
	const [draftPreset, setDraftPreset] = useState(card.audioPresetId ?? '');
	const [draftLighting, setDraftLighting] = useState<string>(card.lightingHint ?? '');
	useEffect(() => {
		if (editing) return;
		setDraftTitle(card.title);
		setDraftMood(card.mood);
		setDraftFlavor(card.flavorText);
		setDraftHero(card.heroImage?.kind === 'url' ? card.heroImage.ref : '');
		setDraftPreset(card.audioPresetId ?? '');
		setDraftLighting(card.lightingHint ?? '');
	}, [
		editing,
		card.title,
		card.mood,
		card.flavorText,
		card.heroImage,
		card.audioPresetId,
		card.lightingHint,
	]);
	const legacyHeroBlocked =
		requireHttpsHero &&
		!!draftHero.trim() &&
		!isNetworkDestinationAllowed(draftHero.trim(), 'android');
	const [saving, setSaving] = useState(false);
	const saveEdit = async () => {
		if (saving) return;
		if (legacyHeroBlocked) {
			Toaster.error(t('sceneCards.androidSecureLink'));
			return;
		}
		setSaving(true);
		try {
			await onSaveEdit({
				title: draftTitle.trim(),
				mood: draftMood,
				flavorText: draftFlavor.trim(),
				heroImage:
					allowRemoteHero && draftHero.trim() ? { kind: 'url', ref: draftHero.trim() } : null,
				audioPresetId: draftPreset || null,
				lightingHint: (draftLighting || null) as SceneCardLightingHint | null,
			});
		} finally {
			setSaving(false);
		}
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
						borderRadius: 'var(--radius-sm)',
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
				<VisibilityChip
					level={card.visibility}
					byException
					label={
						card.visibility === 'player-visible'
							? t('settings.players')
							: t('common.visibility.dmOnly')
					}
				/>
				{legacyHeroBlocked && (
					<Badge status="warning" icon="warning">
						{t('sceneCards.secureImageRequired')}
					</Badge>
				)}
				{active && (
					<Badge status="success" icon="check">
						{t('sceneDisplay.onDisplay')}
					</Badge>
				)}
				{card.lightingHint && (
					<Badge status="neutral">{t(`sceneCards.lighting.${card.lightingHint}`)}</Badge>
				)}
				{/* RC-AUD-2.1 — only a card that actually carries a package half gets this button; a card
				    with neither an audio preset nor a lighting hint would have nothing extra to play. */}
				{isPackage && (
					<Button
						style={{ minHeight: 'var(--space-12)' }}
						variant="secondary"
						size="sm"
						icon="play"
						onClick={onPlayPackage}
					>
						{t('sceneCards.playPackage')}
					</Button>
				)}
				<Button
					style={{ minHeight: 'var(--space-12)' }}
					variant="secondary"
					size="sm"
					icon="play"
					onClick={onActivate}
				>
					{active ? t('common.action.showAgain') : t('common.action.show')}
				</Button>
				<IconButton
					style={{ minWidth: 'var(--space-12)', minHeight: 'var(--space-12)' }}
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
					style={{ minWidth: 'var(--space-12)', minHeight: 'var(--space-12)' }}
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
					style={{ minWidth: 'var(--space-12)', minHeight: 'var(--space-12)' }}
					icon="edit"
					label={t('sceneCards.edit', { title: card.title })}
					variant="ghost"
					size="sm"
					onClick={onEditToggle}
				/>
				<IconButton
					style={{ minWidth: 'var(--space-12)', minHeight: 'var(--space-12)' }}
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
							options={moodOptions}
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
					<Field label={t('sceneCards.audioPreset')} help={t('sceneCards.packageHelp')}>
						<Select
							value={draftPreset}
							onChange={(e: { target: { value: string } }) => setDraftPreset(e.target.value)}
							options={presetOptions}
						/>
					</Field>
					<Field label={t('sceneCards.lightingHint')}>
						<Select
							value={draftLighting}
							onChange={(e: { target: { value: string } }) => setDraftLighting(e.target.value)}
							options={lightingOptions}
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
							style={{ minHeight: 'var(--space-12)' }}
							variant="primary"
							size="sm"
							icon="check"
							disabled={saving || !draftTitle.trim()}
							onClick={saveEdit}
						>
							{saving ? t('sceneCards.saving') : t('common.action.save')}
						</Button>
						<Button
							style={{ minHeight: 'var(--space-12)' }}
							variant="ghost"
							size="sm"
							onClick={onEditToggle}
						>
							{t('common.action.cancel')}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
