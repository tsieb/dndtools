import { AudioPanel as Panel } from './AudioPanel';
import { useState, type FormEvent } from 'react';
import {
	AUDIO_PRESET_CATEGORIES,
	AUDIO_PRESET_CATEGORY_LABELS,
	listBuiltinAudioPresetsByCategory,
	type AudioPreset,
	type AudioPresetCategory,
} from '@dndtools/core';
import { Button, Dialog, EmptyState, Field, Icon, Input, Select, tabPanelProps } from '../../ds';
import { T, eb } from '../../app/screen-kit';
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
	const [pendingDelete, setPendingDelete] = useState<AudioPreset | null>(null);
	const [deleting, setDeleting] = useState(false);
	return (
		<div
			{...tabPanelProps('audio', 'presets')}
			style={{
				display: 'grid',
				gridTemplateColumns: isDesktop ? '1fr 1fr' : 'minmax(0,1fr)',
				gap: 'var(--space-4)',
				alignItems: 'start',
			}}
		>
			{/* your scene packages — captured from the LIVE session audio; apply/delete are real commands */}
			<Panel
				title={t('audio.presets.title')}
				action={
					<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
						{t('audio.presets.count', { count: userPresets.length })}
					</span>
				}
			>
				<div
					style={{
						font: `var(--text-xs)/1.5 ${T.sans}`,
						color: T.ter,
						marginBottom: 'var(--space-2)',
					}}
				>
					{t('audio.presets.intro')}
				</div>
				{canEdit ? (
					<form
						onSubmit={saveCurrentPreset}
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 'var(--space-2)',
							marginBottom: 'var(--space-3)',
						}}
					>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1.4fr 1fr',
								gap: 'var(--space-2)',
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
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								flexWrap: 'wrap',
							}}
						>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								icon="add"
								disabled={!canSavePreset || presetBusy || !presetName.trim()}
							>
								{presetBusy ? t('audio.presets.saving') : t('audio.presets.saveCurrent')}
							</Button>
							{!canSavePreset && (
								<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
									{t('audio.presets.nothingToCapture')}
								</span>
							)}
							{presetError && (
								<span
									role="alert"
									style={{
										font: `var(--text-xs) ${T.sans}`,
										color: 'var(--color-status-error-text)',
									}}
								>
									{presetError}
								</span>
							)}
						</div>
					</form>
				) : (
					<div
						style={{
							font: `var(--text-xs)/1.5 ${T.sans}`,
							color: T.ter,
							marginBottom: 'var(--space-3)',
						}}
					>
						{t(previewing ? 'audio.presets.dmOnlyPreviewing' : 'audio.presets.dmOnly')}
					</div>
				)}
				{userPresets.length === 0 ? (
					<EmptyState
						illustration="audio-empty"
						inset
						icon="sparkle"
						title={t('audio.presets.emptyTitle')}
						description={t('audio.presets.emptyBody')}
					/>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
						{userPresets.map((preset) => (
							<div
								key={preset.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-2)',
									padding: 'var(--space-2) var(--space-3)',
									border: `calc(var(--space-0-5) / 2) solid ${T.bd}`,
									borderRadius: 'var(--radius-md)',
									background: T.surf,
								}}
							>
								<Icon name="sparkle" size={15} color={T.acc} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>{preset.name}</div>
									<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
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
									onClick={() => setPendingDelete(preset)}
								/>
							</div>
						))}
					</div>
				)}
			</Panel>

			{/* built-in atmosphere library — a browsable catalog of recipes, grouped by category */}
			<Panel title={t('audio.presets.libraryTitle')}>
				<div
					style={{
						font: `var(--text-xs)/1.5 ${T.sans}`,
						color: T.ter,
						marginBottom: 'var(--space-2)',
					}}
				>
					{t('audio.presets.libraryIntro')}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
					{AUDIO_PRESET_CATEGORIES.map((category) => {
						const presets = listBuiltinAudioPresetsByCategory(category);
						if (presets.length === 0) return null;
						return (
							<div key={category}>
								<div style={{ ...eb, marginBottom: 'var(--space-2)' }}>
									{AUDIO_PRESET_CATEGORY_LABELS[category]}
								</div>
								<div
									style={{
										display: 'grid',
										gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : 'repeat(2,1fr)',
										gap: 'var(--space-2)',
									}}
								>
									{presets.map((preset) => (
										<div
											key={preset.id}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 'var(--space-2)',
												padding: 'var(--space-2) var(--space-2)',
												border: `calc(var(--space-0-5) / 2) solid ${T.bd}`,
												borderRadius: 'var(--radius-md)',
												background: T.surf,
											}}
										>
											<div style={{ flex: 1, minWidth: 0 }}>
												<div
													style={{
														font: `600 var(--text-xs) ${T.sans}`,
														whiteSpace: 'nowrap',
														overflow: 'hidden',
														textOverflow: 'ellipsis',
													}}
												>
													{preset.name}
												</div>
												<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
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
			<Dialog
				open={!!pendingDelete}
				onClose={() => setPendingDelete(null)}
				title={t('audio.presets.confirmDelete', { name: pendingDelete?.name ?? '' })}
				description={t('audio.presets.deleteHelp')}
				tone="danger"
				size="sm"
				dismissible={!deleting}
				initialFocus="[data-cancel-delete]"
				footer={
					<>
						<Button data-cancel-delete disabled={deleting} onClick={() => setPendingDelete(null)}>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="secondary"
							icon="delete"
							style={{
								color: 'var(--color-status-error-text)',
								background: 'var(--color-status-error-subtle)',
							}}
							disabled={deleting || !canEdit}
							onClick={async () => {
								if (!pendingDelete || deleting || !canEdit) return;
								setDeleting(true);
								try {
									await deletePreset(pendingDelete);
									setPendingDelete(null);
								} finally {
									setDeleting(false);
								}
							}}
						>
							{t(deleting ? 'audio.presets.deleting' : 'common.action.delete')}
						</Button>
					</>
				}
			/>
		</div>
	);
}
