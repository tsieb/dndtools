import { Icon } from '../../ds';
import { T } from '../screen-kit';
import { QUICK_MAP_TOOL_IDS } from './quickMap';
import { TOOLS_BY_ID, type ToolId } from './tools';
import { useI18n } from '../../i18n';

export function QuickMapRail({
	activeTool,
	onSelect,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	onPanels,
}: {
	activeTool: ToolId;
	onSelect: (tool: ToolId) => void;
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	onPanels: () => void;
}) {
	const { t } = useI18n();
	return (
		<div
			role="toolbar"
			aria-label={t('mapEditor.quickActions')}
			style={{
				display: 'flex',
				alignItems: 'stretch',
				gap: 4,
				overflowX: 'auto',
				padding:
					'6px max(8px, var(--safe-area-left, 0px)) calc(6px + var(--safe-area-bottom, 0px)) max(8px, var(--safe-area-right, 0px))',
				borderTop: `1px solid ${T.bd}`,
				background: T.surf,
				scrollbarWidth: 'thin',
			}}
		>
			{QUICK_MAP_TOOL_IDS.map((toolId) => {
				const tool = TOOLS_BY_ID.get(toolId)!;
				const active = toolId === activeTool;
				return (
					<button
						key={toolId}
						type="button"
						aria-label={toolId === 'pan' ? 'Navigate map' : tool.label}
						aria-pressed={active}
						onClick={() => onSelect(toolId)}
						style={{
							display: 'inline-flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 2,
							minWidth: 58,
							height: 52,
							padding: '4px 7px',
							flex: '0 0 auto',
							borderRadius: 10,
							border: `1px solid ${active ? T.accBd : 'transparent'}`,
							background: active ? T.accSub : 'transparent',
							color: active ? T.acc : T.sub,
							font: `600 10px ${T.sans}`,
							cursor: 'pointer',
						}}
					>
						<Icon name={tool.icon} size={18} />
						<span>
							{toolId === 'pan' ? 'Navigate' : tool.label.replace('Point of interest', 'POI')}
						</span>
					</button>
				);
			})}
			<span
				aria-hidden
				style={{ width: 1, margin: '5px 2px', background: T.bd, flex: '0 0 auto' }}
			/>
			<QuickAction icon="undo" label={t('mapEditor.undo')} disabled={!canUndo} onClick={onUndo} />
			<QuickAction icon="redo" label={t('mapEditor.redo')} disabled={!canRedo} onClick={onRedo} />
			<QuickAction icon="layers" label={t('mapEditor.panels')} onClick={onPanels} />
		</div>
	);
}

function QuickAction({
	icon,
	label,
	disabled = false,
	onClick,
}: {
	icon: string;
	label: string;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			style={{
				display: 'inline-flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 2,
				minWidth: 54,
				height: 52,
				padding: '4px 7px',
				flex: '0 0 auto',
				borderRadius: 10,
				border: '1px solid transparent',
				background: 'transparent',
				color: T.sub,
				font: `600 10px ${T.sans}`,
				cursor: disabled ? 'not-allowed' : 'pointer',
				opacity: disabled ? 0.45 : 1,
			}}
		>
			<Icon name={icon} size={18} />
			<span>{label}</span>
		</button>
	);
}
