import type { CommandCenterPreset } from '@dndtools/core';
import { Button, Card, IconButton, Input } from '../ds';
import type { Viewport } from '../app/useViewport';
import type { useI18n } from '../i18n';

/**
 * RC-STB-2.7 — pure move out of Board.tsx (no behaviour change): the "Layouts" overlay
 * (save/apply/restore a Command Center preset) was the largest self-contained JSX block keeping
 * that file over the file-size gate's 800-line hard limit. All state and handlers still live in
 * Board.tsx and are threaded through as props; this component only renders.
 */
export function BoardLayoutsPanel({
	t,
	viewport,
	onClose,
	presetName,
	onPresetNameChange,
	onSave,
	presets,
	onApplyPreset,
	autoSaveEnabled,
	onRestoreSafePoint,
}: {
	t: ReturnType<typeof useI18n>['t'];
	viewport: Viewport;
	onClose: () => void;
	presetName: string;
	onPresetNameChange: (value: string) => void;
	onSave: () => void;
	presets: readonly CommandCenterPreset[];
	onApplyPreset: (presetId: string, name: string) => void;
	autoSaveEnabled: boolean;
	onRestoreSafePoint: () => void;
}) {
	return (
		<Card
			elevation="overlay"
			padding="md"
			data-testid="board-layouts-panel"
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					onClose();
				}
			}}
			style={{
				width: viewport === 'phone' ? 'min(280px, 100%)' : 260,
				flex: '0 0 auto',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				maxHeight: '100%',
				overflow: 'auto',
				...(viewport === 'phone'
					? { position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 4 }
					: {}),
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span
					style={{
						flex: 1,
						font: '700 var(--text-md) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					{t('board.layouts')}
				</span>
				<IconButton
					icon="close"
					label={t('board.closeLayouts')}
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
				<span
					style={{
						font: '600 var(--text-xs) var(--font-sans)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{t('board.saveCurrentLayout')}
				</span>
				<div style={{ display: 'flex', gap: 6 }}>
					<Input
						value={presetName}
						aria-label={t('board.layoutName')}
						onChange={(e: { target: { value: string } }) => onPresetNameChange(e.target.value)}
						placeholder={t('board.layoutNamePlaceholder')}
					/>
					<Button
						variant="secondary"
						size="sm"
						icon="check"
						disabled={!presetName.trim()}
						onClick={onSave}
					>
						{t('common.action.save')}
					</Button>
				</div>
			</div>
			{presets.length > 0 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
					<span
						style={{
							font: '600 var(--text-xs) var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{t('board.applySavedLayout')}
					</span>
					{presets.map((preset) => (
						<Button
							key={preset.id}
							variant="ghost"
							size="sm"
							icon="scene"
							onClick={() => onApplyPreset(preset.id, preset.name)}
							style={{ justifyContent: 'flex-start' }}
						>
							{preset.name}
						</Button>
					))}
				</div>
			)}
			{autoSaveEnabled && (
				<Button
					variant="ghost"
					size="sm"
					icon="retry"
					onClick={onRestoreSafePoint}
					style={{ alignSelf: 'flex-start' }}
				>
					{t('board.restorePrevious')}
				</Button>
			)}
		</Card>
	);
}
