import type { CommandCenterPreset } from '@dndtools/core';
import { Button, Card, IconButton, Input } from '../ds';
import type { Viewport } from '../app/useViewport';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { safePointOf } from './board/useBoardLayouts';

const label: React.CSSProperties = {
	font: '600 var(--text-xs) var(--font-sans)',
	color: 'var(--color-text-secondary)',
};
const column: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: 'var(--space-1-5)',
};

/**
 * RC-STB-2.7 — pure move out of Board.tsx (no behaviour change): the "Layouts" overlay
 * (save/apply/restore a Command Center preset) was the largest self-contained JSX block keeping
 * that file over the file-size gate's 800-line hard limit. All state and handlers still live in
 * Board.tsx and are threaded through as props; this component only renders.
 *
 * RC-CAN-8.8 — Save keeps its width, Enter in the name saves, and "Restore previous layout" carries
 * a line saying what it puts back (read off the safe point itself).
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
	const { formatTime } = useI18n();
	const { commandCenter } = useRuntime().state;
	const safePoint = autoSaveEnabled ? safePointOf(commandCenter) : null;
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
			<form
				style={column}
				onSubmit={(e) => {
					e.preventDefault();
					if (presetName.trim()) onSave();
				}}
			>
				<span style={label}>{t('board.saveCurrentLayout')}</span>
				{/* The Input's own `width: 100%` left the button as the only thing that could shrink, and
				    at 260px it shrank to one letter per line (CAN-15). The field now takes what is left
				    and, below ~8rem, wraps under the button instead of squeezing it. */}
				<div
					data-testid="board-layouts-save-row"
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						alignItems: 'center',
						gap: 'var(--space-1-5)',
					}}
				>
					<Input
						value={presetName}
						aria-label={t('board.layoutName')}
						onChange={(e: { target: { value: string } }) => onPresetNameChange(e.target.value)}
						placeholder={t('board.layoutNamePlaceholder')}
						style={{ flex: '1 1 8rem', minWidth: 0, width: 'auto' }}
					/>
					<Button
						type="submit"
						variant="secondary"
						size="sm"
						icon="check"
						disabled={!presetName.trim()}
						style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
					>
						{t('common.action.save')}
					</Button>
				</div>
			</form>
			{presets.length > 0 && (
				<div style={column}>
					<span style={label} id="board-layouts-saved">
						{t('board.applySavedLayout')}
					</span>
					<ul
						aria-labelledby="board-layouts-saved"
						style={{ ...column, listStyle: 'none', margin: 0, padding: 0 }}
					>
						{presets.map((preset) => (
							<li key={preset.id}>
								<Button
									variant="ghost"
									size="sm"
									icon="scene"
									aria-label={t('board.applyLayout', { name: preset.name })}
									title={preset.name}
									onClick={() => onApplyPreset(preset.id, preset.name)}
									style={{
										width: '100%',
										justifyContent: 'flex-start',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}
								>
									{preset.name}
								</Button>
							</li>
						))}
					</ul>
				</div>
			)}
			{safePoint && (
				<div style={column}>
					<Button
						variant="ghost"
						size="sm"
						icon="retry"
						onClick={onRestoreSafePoint}
						aria-describedby="board-layouts-restore-what"
						style={{ alignSelf: 'flex-start' }}
					>
						{t('board.restorePrevious')}
					</Button>
					<span
						id="board-layouts-restore-what"
						data-testid="board-layouts-restore-what"
						style={{ ...label, fontWeight: 400 }}
					>
						{safePoint.beforeApplying
							? t('board.restoreBeforeApplying', {
									name: safePoint.beforeApplying,
									count: safePoint.tileCount,
									time: formatTime(new Date(safePoint.capturedAt)),
								})
							: t('board.restoreCaptured', {
									count: safePoint.tileCount,
									time: formatTime(new Date(safePoint.capturedAt)),
								})}
					</span>
				</div>
			)}
		</Card>
	);
}
