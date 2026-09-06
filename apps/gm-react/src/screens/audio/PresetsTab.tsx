import { type FormEvent } from 'react';
import {
	AUDIO_PRESET_CATEGORIES,
	AUDIO_PRESET_CATEGORY_LABELS,
	listBuiltinAudioPresetsByCategory,
	type AudioPreset,
	type AudioPresetCategory,
} from '@dndtools/core';
import { Button, EmptyState, Field, Icon, Input, Select, tabPanelProps } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { useI18n } from '../../i18n';

/** The Presets tab (AUDIO-014) — the built-in atmosphere catalog and the DM's saved scene
 * packages. Extracted from Audio.tsx unchanged (RC-STB-2.6). */
export function PresetsTab({
	isPhone,
	isDesktop,
	previewing,
	canEdit,
	userPresets,
	presetName,
	setPresetName,
	presetCategory,
	setPresetCategory,
	presetBusy,
	presetError,
	canSavePreset,
	applyPreset,
	saveCurrentPreset,
	deletePreset,
}: {
	isPhone: boolean;
	isDesktop: boolean;
	previewing: boolean;
	canEdit: boolean;
	userPresets: AudioPreset[];
	presetName: string;
	setPresetName: (next: string) => void;
	presetCategory: AudioPresetCategory;
	setPresetCategory: (next: AudioPresetCategory) => void;
	presetBusy: boolean;
	presetError: string | null;
	canSavePreset: boolean;
	applyPreset: (preset: AudioPreset) => Promise<void>;
	saveCurrentPreset: (event: FormEvent) => Promise<void>;
	deletePreset: (preset: AudioPreset) => Promise<void>;
}) {
	const { t } = useI18n();
	return (
		<div
			{...tabPanelProps('audio', 'presets')}
			style={{
				display: 'grid',
				gridTemplateColumns: isDesktop ? '1fr 1fr' : 'minmax(0,1fr)',
				gap: 18,
				alignItems: 'start',
			}}
		>
			{/* your scene packages — captured from the LIVE session audio; apply/delete are real commands */}
			<Panel
				title={t('audio.presets.title')}
				action={
					<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						{t('audio.presets.count', { count: userPresets.length })}
					</span>
				}
			>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 10 }}>
					{t('audio.presets.intro')}
				</div>
				{canEdit ? (
					<form
						onSubmit={saveCurrentPreset}
						style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}
					>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1.4fr 1fr',
								gap: 10,
							}}
						>
							<Field label={t('audio.presets.name')} htmlFor="preset-name" required>
								<Input
									id="preset-name"
									value={presetName}
									onChange={(e: { target: { value: string } }) => setPresetName(e.target.value)}
									placeholder={t('audio.presets.namePlaceholder')}
								/>
							</Field>
							<Field label={t('audio.presets.category')} htmlFor="preset-category">
								<Select
									id="preset-category"
									value={presetCategory}
									onChange={(e: { target: { value: string } }) =>
										setPresetCategory(e.target.value as AudioPresetCategory)
									}
									options={AUDIO_PRESET_CATEGORIES.map((c) => ({
										value: c,
										label: AUDIO_PRESET_CATEGORY_LABELS[c],
									}))}
								/>
							</Field>
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
							<Button
								type="submit"
								variant="secondary"
								size="sm"
								icon="add"
								disabled={!canSavePreset || presetBusy || !presetName.trim()}
							>
								{presetBusy ? t('audio.presets.saving') : t('audio.presets.saveCurrent')}
							</Button>
							{!canSavePreset && (
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
									{t('audio.presets.nothingToCapture')}
								</span>
							)}
							{presetError && (
								<span
									role="alert"
									style={{ font: `11.5px ${T.sans}`, color: 'var(--color-status-error-text)' }}
								>
									{presetError}
								</span>
							)}
						</div>
					</form>
				) : (
					<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 12 }}>
						{t(previewing ? 'audio.presets.dmOnlyPreviewing' : 'audio.presets.dmOnly')}
					</div>
				)}
				{userPresets.length === 0 ? (
					<EmptyState
						inset
						icon="sparkle"
						title={t('audio.presets.emptyTitle')}
						description={t('audio.presets.emptyBody')}
					/>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{userPresets.map((preset) => (
							<div
								key={preset.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '9px 11px',
									border: `1px solid ${T.bd}`,
									borderRadius: 9,
									background: T.surf,
								}}
							>
								<Icon name="sparkle" size={15} color={T.acc} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 12.5px ${T.sans}` }}>{preset.name}</div>
									<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
										{AUDIO_PRESET_CATEGORY_LABELS[preset.category]} ·{' '}
										{t('audio.presets.layers', { count: preset.layers.length })}
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									icon="play"
									disabled={!canEdit}
									aria-label={t('audio.presets.apply', { name: preset.name })}
									onClick={() => void applyPreset(preset)}
								>
									{t('audio.presets.applyAction')}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									icon="delete"
									disabled={!canEdit}
									aria-label={t('audio.presets.delete', { name: preset.name })}
									onClick={() => void deletePreset(preset)}
								/>
							</div>
						))}
					</div>
				)}
			</Panel>

			{/* built-in atmosphere library — a browsable catalog of recipes, grouped by category */}
			<Panel title={t('audio.presets.libraryTitle')}>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 10 }}>
					{t('audio.presets.libraryIntro')}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
					{AUDIO_PRESET_CATEGORIES.map((category) => {
						const presets = listBuiltinAudioPresetsByCategory(category);
						if (presets.length === 0) return null;
						return (
							<div key={category}>
								<div style={{ ...eb, marginBottom: 8 }}>
									{AUDIO_PRESET_CATEGORY_LABELS[category]}
								</div>
								<div
									style={{
										display: 'grid',
										gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : 'repeat(2,1fr)',
										gap: 8,
									}}
								>
									{presets.map((preset) => (
										<div
											key={preset.id}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 8,
												padding: '8px 10px',
												border: `1px solid ${T.bd}`,
												borderRadius: 9,
												background: T.surf,
											}}
										>
											<div style={{ flex: 1, minWidth: 0 }}>
												<div
													style={{
														font: `600 12px ${T.sans}`,
														whiteSpace: 'nowrap',
														overflow: 'hidden',
														textOverflow: 'ellipsis',
													}}
												>
													{preset.name}
												</div>
												<div style={{ font: `10.5px ${T.sans}`, color: T.ter }}>
													{t('audio.presets.layers', { count: preset.layers.length })}
												</div>
											</div>
											<Button
												variant="ghost"
												size="sm"
												icon="play"
												disabled={!canEdit}
												aria-label={t('audio.presets.apply', { name: preset.name })}
												onClick={() => void applyPreset(preset)}
											/>
										</div>
									))}
								</div>
							</div>
						);
					})}
				</div>
			</Panel>
		</div>
	);
}
