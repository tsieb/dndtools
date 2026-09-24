import type { ReactNode } from 'react';
import { Button, Icon, IconButton, Popover, VisibilityChip } from '../../ds';
import { T, srOnly } from '../screen-kit';
import { HeaderMenuItem } from './MapEditorChrome';
import { VIS_CHIP } from './mapVisibility';
import type { useMapEditorShell } from './useMapEditorShell';
type HeaderModel = Pick<
	ReturnType<typeof useMapEditorShell>,
	| 't'
	| 'editor'
	| 'quickMapMode'
	| 'compactHeader'
	| 'breadcrumb'
	| 'setPaletteOpen'
	| 'exportOpen'
	| 'setExportOpen'
	| 'exportTriggerRef'
	| 'exportUvtt'
	| 'setImportOpen'
	| 'projectToPlayers'
	| 'projecting'
>;
export function MapEditorHeader({
	model,
	onClose,
	onNavigateToMap,
	phoneBar,
	listToggle,
}: {
	model: HeaderModel;
	onClose: () => void;
	onNavigateToMap?: (id: string) => void;
	phoneBar: boolean;
	listToggle: ReactNode;
}) {
	const {
		t,
		editor,
		quickMapMode,
		compactHeader,
		breadcrumb,
		setPaletteOpen,
		exportOpen,
		setExportOpen,
		exportTriggerRef,
		exportUvtt,
		setImportOpen,
		projectToPlayers,
		projecting,
	} = model;
	const map = editor.map;
	return (
		<header
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: compactHeader ? 'var(--space-0-5)' : 'var(--space-2)',
				padding: quickMapMode
					? 'calc(6px + var(--safe-area-top, 0px)) max(8px, var(--safe-area-right, 0px)) 6px max(8px, var(--safe-area-left, 0px))'
					: compactHeader
						? 'var(--space-1-5) var(--space-1-5)'
						: 'var(--space-2) var(--space-3)',
				borderBottom: `1px solid ${T.bd}`,
				background: T.surf,
				flex: '0 0 auto',
				minWidth: 0,
			}}
		>
			<IconButton
				icon="arrow-left"
				label={t('mapEditor.backToAtlas')}
				variant="ghost"
				size="sm"
				onClick={onClose}
			/>
			<nav
				aria-label={t('mapEditor.breadcrumb')}
				// RC-MAP-3.8 — Escape/Backspace, while focus is anywhere in the trail, climbs one level:
				// to the immediate parent map if the breadcrumb has ancestors, else all the way out to
				// Atlas. Only fires from a plain key press (no modifier), so it never eats a text-field
				// Backspace or a browser shortcut.
				onKeyDown={(event) => {
					if (event.key !== 'Escape' && event.key !== 'Backspace') return;
					if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
					event.preventDefault();
					const parent = breadcrumb[breadcrumb.length - 2];
					if (parent) onNavigateToMap?.(parent.mapId);
					else onClose();
				}}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-1-5)',
					minWidth: 0,
					flex: compactHeader ? 1 : undefined,
					overflow: 'hidden',
				}}
			>
				{!compactHeader && (
					<>
						<button
							type="button"
							onClick={onClose}
							style={{
								border: 'none',
								background: 'transparent',
								cursor: 'pointer',
								padding: 'var(--space-0)',
								font: `12px ${T.sans}`,
								color: T.ter,
							}}
						>
							{t('mapEditor.atlas')}
						</button>
						<Icon name="chevron-right" size={13} color={T.ter} />
					</>
				)}
				{/* Ancestor crumbs (root-first, excluding the current map) — a live drill-down trail,
					    not just a static "Atlas > name". Hidden on phone: there is no width budget for it
					    there and the flat back button already reaches the parent. */}
				{!compactHeader &&
					breadcrumb.slice(0, -1).map((crumb) => (
						<span
							key={crumb.mapId}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-1-5)',
								minWidth: 0,
							}}
						>
							<button
								type="button"
								aria-label={t('mapEditor.goToMap', { name: crumb.name })}
								onClick={() => onNavigateToMap?.(crumb.mapId)}
								disabled={!onNavigateToMap}
								style={{
									border: 'none',
									background: 'transparent',
									cursor: onNavigateToMap ? 'pointer' : 'default',
									padding: 'var(--space-0)',
									font: `12px ${T.sans}`,
									color: T.ter,
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									maxWidth: 140,
								}}
							>
								{crumb.name}
							</button>
							<Icon name="chevron-right" size={13} color={T.ter} />
						</span>
					))}
				<h1
					style={{
						margin: 'var(--space-0)',
						font: `700 14px ${T.sans}`,
						color: T.ink,
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						minWidth: 0,
					}}
				>
					{map.name}
				</h1>
			</nav>
			{/* Compact on a phone: the full "DM ONLY" pill is ~97px, and the header's other six
				    children all have hard minimums, so on a 393px handset it left the map-name <h1>
				    about 46px — four characters and an ellipsis. `clippedControls()` cannot see an
				    element that merely SHRINKS, so no gate was ever going to catch it. Compact keeps
				    the icon (and moves the label onto `title` + the icon's accessible name). */}
			{!quickMapMode && (
				<VisibilityChip level={VIS_CHIP[map.visibility] ?? 'dm-only'} compact={compactHeader} />
			)}
			{!compactHeader && <div style={{ flex: 1 }} />}
			<span
				role="status"
				title={t(editor.busy ? 'mapEditor.saving' : 'mapEditor.saved')}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 'var(--space-1-5)',
					font: `11.5px ${T.sans}`,
					color: T.ter,
				}}
			>
				<Icon
					name={editor.busy ? 'loading' : 'success'}
					size={13}
					color={editor.busy ? T.ter : T.ok}
				/>
				<span style={compactHeader ? srOnly : undefined}>
					{t(editor.busy ? 'mapEditor.saving' : 'mapEditor.saved')}
				</span>
			</span>
			{!quickMapMode && (
				<>
					<button
						type="button"
						onClick={() => setPaletteOpen(true)}
						aria-label={t('mapEditor.searchPalette')}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
							padding: 'var(--space-1-5) var(--space-2)',
							borderRadius: 'var(--radius-md)',
							border: `1px solid ${T.bd}`,
							background: T.raised,
							color: T.sub,
							cursor: 'pointer',
							font: `12px ${T.sans}`,
						}}
					>
						<Icon name="search" size={14} />
						{!compactHeader && <span>{t('mapEditor.search')}</span>}
						{!compactHeader && (
							<kbd
								style={{
									font: `10px ${T.mono}`,
									color: T.ter,
									border: `1px solid ${T.bd}`,
									borderRadius: 'var(--radius-sm)',
									padding: 'var(--space-0) var(--space-1)',
								}}
							>
								⌘K
							</kbd>
						)}
					</button>
					<div style={{ display: 'flex', gap: 'var(--space-0-5)' }}>
						<IconButton
							icon="undo"
							label={t('common.action.undo')}
							variant="ghost"
							size="sm"
							disabled={!editor.canUndo}
							onClick={() => void editor.undo()}
						/>
						<IconButton
							icon="redo"
							label={t('mapEditor.redo')}
							variant="ghost"
							size="sm"
							disabled={!editor.canRedo}
							onClick={() => void editor.redo()}
						/>
					</div>
				</>
			)}
			{!phoneBar && listToggle}
			<div style={{ position: 'relative' }}>
				{/* display:contents adds no box of its own — it exists only to give the Popover a handle
					    on its own trigger, so an outside-pointerdown close cannot race the button's click. */}
				<span ref={exportTriggerRef} style={{ display: 'contents' }}>
					<Button
						variant="secondary"
						size="sm"
						icon={quickMapMode ? 'more' : 'download'}
						iconRight="chevron-down"
						onClick={() => setExportOpen((v) => !v)}
						aria-expanded={exportOpen}
						aria-label={quickMapMode ? t('mapEditor.moreActions') : t('mapEditor.export')}
					>
						{compactHeader || quickMapMode ? '' : t('mapEditor.export')}
					</Button>
				</span>
				{exportOpen && (
					<Popover
						open
						onClose={() => setExportOpen(false)}
						triggerRef={exportTriggerRef}
						// Named without a visible header, exactly as the two sibling map popovers are:
						// `Popover` derives its accessible name only from a STRING `title`, so this one
						// rendered an unnamed `role="dialog"` (axe `aria-dialog-name`). The axe gate never
						// opens a popover, so nothing was going to catch it.
						aria-label={quickMapMode ? t('mapEditor.moreActions') : t('mapEditor.exportMenu')}
						width={220}
						placement="bottom"
						style={{
							position: 'absolute',
							right: 0,
							top: 'calc(100% + 6px)',
							transform: 'none',
							zIndex: 30,
						}}
					>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
							<HeaderMenuItem
								icon="download"
								label={t('mapEditor.exportUvtt')}
								onClick={() => void exportUvtt()}
							/>
							<HeaderMenuItem
								icon="import"
								label={t('mapEditor.importMap')}
								onClick={() => {
									setExportOpen(false);
									setImportOpen(true);
								}}
							/>
							{quickMapMode && (
								<HeaderMenuItem
									icon="info"
									label={t('mapEditor.aboutAdvanced')}
									onClick={() => {
										setExportOpen(false);
										editor.setNotice(t('mapEditor.advancedNotice'), 'info');
									}}
								/>
							)}
						</div>
					</Popover>
				)}
			</div>
			{editor.isDm && (
				<Button
					variant="primary"
					size="sm"
					icon="visibility-players"
					onClick={() => void projectToPlayers()}
					disabled={editor.busy || projecting}
					aria-label={t('mapEditor.projectToPlayers')}
				>
					{compactHeader ? '' : t('mapEditor.project')}
				</Button>
			)}
		</header>
	);
}
