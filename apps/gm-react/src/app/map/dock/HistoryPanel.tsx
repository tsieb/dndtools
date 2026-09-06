import { Icon } from '../../../ds';
import { T, eb } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';
import { useI18n } from '../../../i18n';

/**
 * MAP-021 — the History panel: the local undo stack as a labelled list, newest at the current position.
 * Clicking a row above the cursor undoes down to it; a row below (in the redo branch) redoes up to it.
 * It reads `editor.history` / `editor.redoStack` and drives `editor.undo()` / `editor.redo()` the right
 * number of times, so it stays a pure view over the same non-durable stack the keyboard uses.
 */
export function HistoryPanel({ editor }: { editor: MapEditorApi }) {
	const { t } = useI18n();
	// Present newest-first: redo branch (future) on top, then the current point, then past steps.
	const redo = [...editor.redoStack].reverse(); // nearest redo first
	const history = [...editor.history].reverse(); // most recent done first

	// Await each step: the editor runs one command at a time (`busyRef`), so firing N calls
	// synchronously dropped all but the first and a click 5 rows back moved only one step.
	const doUndo = async (count: number) => {
		for (let i = 0; i < count; i += 1) await editor.undo();
	};
	const doRedo = async (count: number) => {
		for (let i = 0; i < count; i += 1) await editor.redo();
	};

	const empty = history.length === 0 && redo.length === 0;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<span style={eb}>{t('mapDock.history')}</span>
				<span style={{ flex: 1 }} />
				<button
					type="button"
					disabled={!editor.canUndo}
					onClick={() => void editor.undo()}
					title={t('mapDock.undoShortcut')}
					style={hdrBtn(!editor.canUndo)}
				>
					<Icon name="undo" size={14} /> {t('common.action.undo')}
				</button>
				<button
					type="button"
					disabled={!editor.canRedo}
					onClick={() => void editor.redo()}
					title={t('mapDock.redoShortcut')}
					style={hdrBtn(!editor.canRedo)}
				>
					<Icon name="redo" size={14} /> {t('mapEditor.redo')}
				</button>
			</div>

			<div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}>
				{redo.map((entry, i) => (
					<Row
						key={`r-${i}`}
						label={entry.label}
						faded
						icon="redo"
						onClick={() => doRedo(i + 1)}
						hint={i === 0 ? t('mapDock.nextRedo') : undefined}
					/>
				))}

				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						padding: '6px 10px',
						font: `11px ${T.mono}`,
						color: T.acc,
						borderTop: redo.length ? `1px dashed ${T.bd}` : 'none',
						borderBottom: history.length ? `1px dashed ${T.bd}` : 'none',
					}}
				>
					<Icon name="tool-crosshair" size={12} color={T.acc} /> {t('mapDock.currentState')}
				</div>

				{history.map((entry, i) => (
					<Row
						key={`h-${i}`}
						label={entry.label}
						icon="tool-select"
						onClick={() => doUndo(i + 1)}
						hint={i === 0 ? t('mapDock.lastAction') : undefined}
					/>
				))}

				{empty && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter, padding: '10px 4px' }}>
						{t('mapDock.noActions')}
					</div>
				)}
			</div>
		</div>
	);
}

function Row({
	label,
	onClick,
	icon,
	faded,
	hint,
}: {
	label: string;
	onClick: () => void;
	icon: string;
	faded?: boolean;
	hint?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 9,
				padding: '7px 10px',
				borderRadius: 7,
				border: 'none',
				background: 'transparent',
				cursor: 'pointer',
				textAlign: 'left',
				opacity: faded ? 0.6 : 1,
			}}
		>
			<Icon name={icon} size={13} color={T.ter} />
			<span
				style={{
					flex: 1,
					minWidth: 0,
					font: `12.5px ${T.sans}`,
					color: T.ink,
					whiteSpace: 'nowrap',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
				}}
			>
				{label}
			</span>
			{hint && <span style={{ font: `10px ${T.mono}`, color: T.ter }}>{hint}</span>}
		</button>
	);
}

function hdrBtn(disabled: boolean) {
	return {
		display: 'inline-flex',
		alignItems: 'center',
		gap: 5,
		padding: '5px 9px',
		borderRadius: 7,
		border: `1px solid ${T.bd}`,
		background: T.raised,
		color: disabled ? T.ter : T.ink,
		cursor: disabled ? 'not-allowed' : 'pointer',
		opacity: disabled ? 0.5 : 1,
		font: `12px ${T.sans}`,
	} as const;
}
