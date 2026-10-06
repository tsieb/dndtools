import { useRef, useState } from 'react';
import type { CommandCenterPreset } from '@dndtools/core';
import { Button, Card, IconButton, Input } from '../ds';
import type { Viewport } from '../app/useViewport';
import { useI18n } from '../i18n';
import type { BoardLayouts } from './board/useBoardLayouts';

const label: React.CSSProperties = {
	font: '600 var(--text-xs) var(--font-sans)',
	color: 'var(--color-text-secondary)',
};
const column: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: 'var(--space-1-5)',
};
// The name field takes what is left; below ~8rem it wraps under the button instead of squeezing it.
// The Input's own `width: 100%` made the button the only thing that could shrink, and at 260px it
// shrank to one letter per line (CAN-15).
const wrapRow: React.CSSProperties = {
	display: 'flex',
	flexWrap: 'wrap',
	alignItems: 'center',
	gap: 'var(--space-1-5)',
};
const grow: React.CSSProperties = { flex: '1 1 8rem', minWidth: 0, width: 'auto' };
const keep: React.CSSProperties = { flex: '0 0 auto', whiteSpace: 'nowrap' };

/**
 * RC-STB-2.7 moved the "Layouts" overlay out of Board.tsx; RC-CAN-8.8 made it a place to manage
 * layouts rather than only save one. Save the current layout, apply, rename or delete a saved one,
 * and restore the safe point with a line saying what that restore puts back. Commands, guards and
 * status messages live in `useBoardLayouts`; this component holds only row-editing state.
 */
export function BoardLayoutsPanel({
	viewport,
	onClose,
	layouts,
}: {
	viewport: Viewport;
	onClose: () => void;
	layouts: BoardLayouts;
}) {
	const { t, formatTime } = useI18n();
	const { presetName, setPresetName, savePreset, presets, safePoint } = layouts;
	// DS Input/IconButton do not forward refs (React 18), so focus moves by query inside a wrapper.
	const saveRowRef = useRef<HTMLDivElement>(null);

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
						font: '700 var(--text-md) var(--font-sans)',
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
					void savePreset();
				}}
			>
				<span style={label}>{t('board.saveCurrentLayout')}</span>
				<div ref={saveRowRef} style={wrapRow} data-testid="board-layouts-save-row">
					<Input
						value={presetName}
						aria-label={t('board.layoutName')}
						onChange={(e: { target: { value: string } }) => setPresetName(e.target.value)}
						placeholder={t('board.layoutNamePlaceholder')}
						style={grow}
					/>
					<Button
						type="submit"
						variant="secondary"
						size="sm"
						icon="check"
						disabled={!presetName.trim()}
						style={keep}
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
							<PresetRow
								key={preset.id}
								preset={preset}
								layouts={layouts}
								onDeleted={() => saveRowRef.current?.querySelector('input')?.focus()}
							/>
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
						onClick={() => void layouts.restoreSafePoint()}
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

/** One saved layout: apply it, or rename/delete it in place. Escape backs out of a rename or a
 *  delete confirm without closing the panel. */
function PresetRow({
	preset,
	layouts,
	onDeleted,
}: {
	preset: CommandCenterPreset;
	layouts: BoardLayouts;
	onDeleted: () => void;
}) {
	const { t } = useI18n();
	const [mode, setMode] = useState<'idle' | 'rename' | 'delete'>('idle');
	const [draft, setDraft] = useState(preset.name);
	const rowRef = useRef<HTMLLIElement>(null);
	const back = () => {
		setMode('idle');
		// The control that opened the editor is gone until the row re-renders idle.
		requestAnimationFrame(() =>
			rowRef.current?.querySelector<HTMLElement>('[data-action="rename"]')?.focus(),
		);
	};
	const stayOpen = (e: React.KeyboardEvent) => {
		if (e.key !== 'Escape') return;
		e.stopPropagation();
		back();
	};

	if (mode === 'rename') {
		return (
			<li ref={rowRef}>
				<form
					style={wrapRow}
					onKeyDown={stayOpen}
					onSubmit={(e) => {
						e.preventDefault();
						void layouts.renamePreset(preset.id, draft).then((ok) => ok && back());
					}}
				>
					<Input
						autoFocus
						value={draft}
						aria-label={t('board.renameLayoutField', { name: preset.name })}
						onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
						style={grow}
					/>
					<Button type="submit" variant="secondary" size="sm" disabled={!draft.trim()} style={keep}>
						{t('common.action.save')}
					</Button>
					<Button variant="ghost" size="sm" onClick={back} style={keep}>
						{t('common.action.cancel')}
					</Button>
				</form>
			</li>
		);
	}
	if (mode === 'delete') {
		return (
			<li ref={rowRef} style={column} onKeyDown={stayOpen}>
				<span role="alert" style={{ ...label, color: 'var(--color-text-primary)' }}>
					{t('board.deleteLayoutConfirm', { name: preset.name })}
				</span>
				<div style={wrapRow}>
					<Button
						autoFocus
						variant="danger"
						size="sm"
						icon="trash"
						style={keep}
						onClick={() => void layouts.deletePreset(preset.id, preset.name).then(onDeleted)}
					>
						{t('common.action.delete')}
					</Button>
					<Button variant="ghost" size="sm" onClick={back} style={keep}>
						{t('common.action.cancel')}
					</Button>
				</div>
			</li>
		);
	}
	return (
		<li ref={rowRef} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
			<Button
				variant="ghost"
				size="sm"
				icon="scene"
				aria-label={t('board.applyLayout', { name: preset.name })}
				title={preset.name}
				onClick={() => void layouts.applyPreset(preset.id, preset.name)}
				style={{
					flex: '1 1 auto',
					minWidth: 0,
					justifyContent: 'flex-start',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
				}}
			>
				{preset.name}
			</Button>
			<IconButton
				data-action="rename"
				icon="edit"
				variant="ghost"
				size="sm"
				label={t('board.renameLayout', { name: preset.name })}
				onClick={() => {
					setDraft(preset.name);
					setMode('rename');
				}}
			/>
			<IconButton
				icon="trash"
				variant="ghost"
				size="sm"
				label={t('board.deleteLayout', { name: preset.name })}
				onClick={() => setMode('delete')}
			/>
		</li>
	);
}
