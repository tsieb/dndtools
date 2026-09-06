import { useState } from 'react';
import { Button, Dialog, Icon, SegmentedControl } from '../../ds';
import { T } from '../screen-kit';
import type { MapEditorApi } from './useMapEditor';
import { TOOLS_BY_ID, TOOL_GROUPS } from './tools';
import { useI18n } from '../../i18n';

/**
 * The map editor's three small chrome pieces: the phone tool strip, the header menu row and the
 * keyboard-shortcut overlay.
 *
 * Extracted from `MapEditor.tsx` unchanged so that file stays under its RC-STB-2.7 line baseline
 * while RC-UX-1.2 moves its copy into the message catalog.
 */

export function QuickToolStrip({ editor }: { editor: MapEditorApi }) {
	const { t } = useI18n();
	const definition = TOOLS_BY_ID.get(editor.tool);
	const editing = !['pan', 'select'].includes(editor.tool);
	const guidance =
		editor.tool === 'pan'
			? t('mapEditor.guidance.pan')
			: editor.tool === 'select'
				? t('mapEditor.guidance.select')
				: editor.tool === 'generate'
					? t('mapEditor.guidance.generate')
					: t('mapEditor.guidance.editing');
	return (
		<div
			role="status"
			aria-live="polite"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				flexWrap: 'wrap',
				minHeight: 50,
				padding:
					'6px max(10px, var(--safe-area-right, 0px)) 6px max(10px, var(--safe-area-left, 0px))',
				borderBottom: `1px solid ${T.bd}`,
				background: editing ? T.accSub : T.surf,
				overflow: 'hidden',
			}}
		>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 6,
					font: `700 12px ${T.sans}`,
					color: editing ? T.acc : T.ink,
					whiteSpace: 'nowrap',
				}}
			>
				<Icon name={definition?.icon ?? 'tool-select'} size={16} />
				{editor.tool === 'pan' ? t('mapTool.navigate') : definition ? t(definition.label) : null}
				{editing ? t('mapEditor.armed') : ''}
			</span>
			{editor.tool === 'fog' && (
				<SegmentedControl
					ariaLabel={t('toolOptions.fogMode')}
					value={editor.options.fogMode}
					onChange={(value: string) =>
						editor.setOption('fogMode', value as typeof editor.options.fogMode)
					}
					options={[
						{ value: 'reveal', label: t('toolOptions.fog.reveal') },
						{ value: 'conceal', label: t('toolOptions.fog.conceal') },
					]}
				/>
			)}
			<span style={{ flex: 1, minWidth: 150, font: `11.5px ${T.sans}`, color: T.sub }}>
				{guidance}
			</span>
		</div>
	);
}

export function HeaderMenuItem({
	icon,
	label,
	onClick,
}: {
	icon: string;
	label: string;
	onClick: () => void;
}) {
	// Same gap as LayersPanel's MenuItem: no global `button:hover`, and inline styles can't express it,
	// so the editor's header menu highlighted nothing under the cursor.
	const [hov, setHov] = useState(false);
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			onFocus={() => setHov(true)}
			onBlur={() => setHov(false)}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 9,
				padding: '8px 10px',
				borderRadius: 7,
				border: 'none',
				background: hov ? T.hover : 'transparent',
				cursor: 'pointer',
				color: T.ink,
				font: `12.5px ${T.sans}`,
				textAlign: 'left',
			}}
		>
			<Icon name={icon} size={14} color={T.ter} />
			{label}
		</button>
	);
}

export function ShortcutOverlay({ onClose }: { onClose: () => void }) {
	const { t } = useI18n();
	const rows: Array<[string, string]> = [
		[
			t('mapEditor.shortcut.tools'),
			TOOL_GROUPS.flatMap((g) => g.tools)
				.filter((tool) => tool.shortcut)
				.map((tool) =>
					t('mapEditor.shortcut.toolEntry', {
						shortcut: tool.shortcut!.toUpperCase(),
						label: t(tool.label),
					}),
				)
				.join(' · '),
		],
		[t('mapEditor.shortcut.brushSize'), t('mapEditor.shortcut.brushSizeKeys')],
		[t('mapEditor.shortcut.undoRedo'), 'Ctrl/⌘+Z · Ctrl/⌘+Shift+Z'],
		[t('mapEditor.shortcut.zoom'), t('mapEditor.shortcut.zoomKeys')],
		[t('mapEditor.shortcut.pan'), t('mapEditor.shortcut.panKeys')],
		[t('mapEditor.shortcut.nudge'), t('mapEditor.shortcut.nudgeKeys')],
		[t('mapEditor.shortcut.delete'), t('mapEditor.shortcut.deleteKeys')],
		[t('mapEditor.shortcut.cancel'), 'Esc'],
		[t('mapEditor.shortcut.finishPath'), t('mapEditor.shortcut.finishPathKeys')],
		[t('mapEditor.shortcut.palette'), 'Ctrl/⌘+K'],
		[t('mapEditor.shortcut.overlay'), '?'],
	];
	return (
		<Dialog
			open
			onClose={onClose}
			title={t('mapEditor.shortcuts')}
			icon="info"
			size="md"
			footer={
				<Button variant="primary" size="sm" onClick={onClose}>
					{t('common.action.done')}
				</Button>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
				{rows.map(([k, v]) => (
					<div
						key={k}
						style={{
							display: 'flex',
							gap: 12,
							padding: '8px 0',
							borderBottom: `1px solid ${T.bd}`,
						}}
					>
						<span style={{ flex: '0 0 150px', font: `600 12.5px ${T.sans}`, color: T.ink }}>
							{k}
						</span>
						<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: T.sub }}>{v}</span>
					</div>
				))}
			</div>
		</Dialog>
	);
}
