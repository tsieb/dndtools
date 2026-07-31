import { useEffect, useState } from 'react';
import { Icon } from '../../ds';
import { T } from '../screen-kit';
import { GROUP_OF_TOOL, TOOL_GROUPS, TOOLS_BY_ID, type ToolId } from './tools';

/**
 * MAP-021 — the Foundry-style tool rail. The rail is a column of LAYER GROUPS; selecting a group
 * reveals its sub-tool flyout to the immediate right, and picking a sub-tool activates it. The active
 * tool's group stays highlighted and its flyout stays open so the current mode is always one glance and
 * one keystroke away. Every tool shows its single-key shortcut in its tooltip.
 */
export function ToolRail({
	activeTool,
	onSelect,
	orientation = 'vertical',
}: {
	activeTool: ToolId;
	onSelect: (tool: ToolId) => void;
	orientation?: 'vertical' | 'horizontal';
}) {
	const activeGroup = GROUP_OF_TOOL.get(activeTool)?.id ?? TOOL_GROUPS[0]!.id;
	const [openGroup, setOpenGroup] = useState<string>(activeGroup);
	// Keep the flyout following the active tool (e.g. after a keyboard shortcut switches tools).
	useEffect(() => setOpenGroup(activeGroup), [activeGroup]);

	const horizontal = orientation === 'horizontal';
	const group = TOOL_GROUPS.find((g) => g.id === openGroup) ?? TOOL_GROUPS[0]!;

	return (
		<div
			role="toolbar"
			aria-label="Map tools"
			aria-orientation={orientation}
			style={{
				display: 'flex',
				// Always column. In horizontal (phone) orientation the group strip and the sub-tool
				// flyout are both in flow, so a row here made them fight over one ~350px line —
				// two competing tiny scrollers. The flyout's borderTop assumes it sits BELOW.
				// (Vertical orientation is unaffected: its flyout is absolutely positioned.)
				flexDirection: 'column',
				gap: 0,
				height: '100%',
				position: 'relative',
			}}
		>
			<div
				style={{
					display: 'flex',
					flexDirection: horizontal ? 'row' : 'column',
					alignItems: 'center',
					gap: 4,
					padding: horizontal ? '4px 8px' : '10px 6px',
					overflowX: horizontal ? 'auto' : 'visible',
					overflowY: horizontal ? 'visible' : 'auto',
				}}
			>
				{TOOL_GROUPS.map((g) => {
					const isActiveGroup = g.id === activeGroup;
					const isOpen = g.id === openGroup;
					return (
						<button
							key={g.id}
							type="button"
							title={g.label}
							aria-label={g.label}
							aria-pressed={isActiveGroup}
							// NOT `aria-expanded`: the handler below can only ever OPEN a group (there
							// is no collapse path, and `openGroup` always names one), so advertising a
							// disclosure that never closes told a screen-reader user the control does
							// something it cannot. Which group is showing is already discoverable —
							// the flyout below is a `role="group"` named "{group} tools".
							onClick={() => {
								setOpenGroup(g.id);
								// A single-tool group activates directly; multi-tool groups just open the flyout.
								if (g.tools.length === 1) onSelect(g.tools[0]!.id);
							}}
							style={{
								display: 'inline-flex',
								flexDirection: 'column',
								alignItems: 'center',
								justifyContent: 'center',
								gap: 2,
								width: 44,
								height: 44,
								flex: '0 0 auto',
								borderRadius: 10,
								border: `1px solid ${isActiveGroup ? T.accBd : 'transparent'}`,
								background: isActiveGroup ? T.accSub : isOpen ? T.alt : 'transparent',
								color: isActiveGroup ? T.acc : T.sub,
								cursor: 'pointer',
							}}
						>
							<Icon name={g.icon} size={18} />
						</button>
					);
				})}
			</div>

			{/* sub-tool flyout */}
			<div
				role="group"
				aria-label={`${group.label} tools`}
				style={
					horizontal
						? {
								display: 'flex',
								gap: 4,
								padding: '4px 8px',
								borderTop: `1px solid ${T.bd}`,
								background: T.raised,
								overflowX: 'auto',
							}
						: {
								position: 'absolute',
								left: 56,
								// The rail's positioning container spans the whole editor row, and the
								// ToolOptionsBar occupies the top 46px + 1px border of the column immediately
								// to the right. At `top: 8` a multi-tool flyout (Structure is four tools plus
								// its header, ~160px) covered that bar COMPLETELY — so with Room, Wall, Door or
								// Water armed, none of the tool's own options could be seen or clicked.
								top: 54,
								display: 'flex',
								flexDirection: 'column',
								gap: 3,
								padding: 6,
								borderRadius: 12,
								background: T.overlay,
								border: `1px solid ${T.bdS}`,
								boxShadow: T.smd,
								minWidth: 190,
								zIndex: 8,
							}
				}
			>
				{!horizontal && (
					<div
						style={{
							font: `600 10px ${T.sans}`,
							letterSpacing: '.09em',
							textTransform: 'uppercase',
							color: T.sub,
							padding: '2px 8px 4px',
						}}
					>
						{group.label}
					</div>
				)}
				{group.tools.map((tool) => {
					const def = TOOLS_BY_ID.get(tool.id)!;
					const on = tool.id === activeTool;
					return (
						<button
							key={tool.id}
							type="button"
							aria-pressed={on}
							title={`${def.hint}${def.shortcut ? ` (${def.shortcut.toUpperCase()})` : ''}`}
							onClick={() => onSelect(tool.id)}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 8,
								padding: horizontal ? '7px 10px' : '7px 8px',
								borderRadius: 8,
								border: `1px solid ${on ? T.accBd : 'transparent'}`,
								background: on ? T.accSub : 'transparent',
								color: on ? T.acc : T.ink,
								cursor: 'pointer',
								font: `${on ? 600 : 500} 12.5px ${T.sans}`,
								whiteSpace: 'nowrap',
							}}
						>
							<Icon name={def.icon} size={15} color={on ? T.acc : T.sub} />
							{/* Horizontal orientation is the touch layout: a bare icon next to a keyboard
							    shortcut is the wrong way round there — name the tool, drop the chip. */}
							<span style={{ flex: 1, textAlign: 'left' }}>{def.label}</span>
							{!horizontal && def.shortcut && (
								<kbd
									style={{
										font: `10px ${T.mono}`,
										color: T.ter,
										border: `1px solid ${T.bd}`,
										borderRadius: 5,
										padding: '0 4px',
										background: T.sunken,
									}}
								>
									{def.shortcut.toUpperCase()}
								</kbd>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
