import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	deliveredMapIdsForActor,
	getCombatantMovementForActor,
	movementCellAt,
	movementPathTo,
	templateCells,
	type AreaTemplate,
	type MovementRange,
	type TemplateCell,
	type TemplateGrid,
} from '@dndtools/core';
import { T } from '../../screen-kit';
import { useI18n } from '../../../i18n';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useSessionSelection } from '../../session/SessionSelection';
import { AOE_TOOL_KIND, TEMPLATE_KIND_LABELS, type ToolId } from '../tools';
import { cellCenterNormalized, type CombatTemplatesModel } from './useCombatTemplates';
import type { MapEditorApi } from '../useMapEditor';

type Pt = { x: number; y: number };

/**
 * RC-MAP-2.2 — the COMBAT tool group's canvas half: how far the selected combatant can walk, the
 * route they would take, and the areas of effect standing on the board.
 *
 * Everything drawn here is DERIVED on the fly from core reads — `getCombatantMovementForActor` for
 * the reachable set (which already knows about walls, doors and difficult terrain, and is already
 * scoped to this actor) and `templateCells` for coverage. Nothing about a highlight is stored, so a
 * re-gridded map or a moved wall changes the picture on the next render instead of leaving a lie
 * painted on the canvas.
 *
 * ONE interaction surface serves both halves, and pointer and keyboard drive the identical command:
 *   - Move: click a reachable cell, or arrow-key a pending cell and press Enter. Both dispatch
 *     `combat.move-token`. A cell outside the budget is refused with a spoken reason rather than
 *     silently moving the combatant somewhere they cannot reach.
 *   - Area: click where the effect lands, or arrow-key the pending origin and press Enter. Both
 *     dispatch `combat.place-template` with the size and rotation armed in the options bar.
 * Escape drops the pending cell. Neither write is undoable on the editor's map stack: a combatant
 * walking and a fireball landing are acts in the SESSION, and Ctrl+Z on a map edit must never
 * rewind them (the same rule RC-MAP-2.1 set for a token drag).
 */
export function CombatToolLayer({
	editor,
	model,
	tool,
	zoom,
	center,
	toMap,
	announce,
}: {
	editor: MapEditorApi;
	model: CombatTemplatesModel;
	tool: ToolId;
	zoom: number;
	center: Pt;
	/** Client coordinates -> normalized map point (the canvas's own transform). */
	toMap: (clientX: number, clientY: number) => Pt;
	announce: (message: string) => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const { selectedCombatantId } = useSessionSelection();
	const { grid, templates, combat } = model;
	const aoeKind = AOE_TOOL_KIND.get(tool) ?? null;
	const moving = tool === 'combat-move';
	const armed = combat.running && grid !== null && (moving || aoeKind !== null);

	const [hover, setHover] = useState<TemplateCell | null>(null);
	const [pending, setPending] = useState<TemplateCell | null>(null);
	const busyRef = useRef(false);

	const selected = useMemo(
		() => combat.tokens.find((token) => token.combatantId === selectedCombatantId) ?? null,
		[combat.tokens, selectedCombatantId],
	);

	// The reachable set for the selected combatant, straight from the core's one actor-filtered
	// movement read. Only computed under the Move tool: it is a Dijkstra over the grid, and paying
	// for it while the DM paints terrain would be waste.
	const range = useMemo((): MovementRange | null => {
		if (!moving || !selected) return null;
		const state = runtime.state;
		const result = getCombatantMovementForActor({
			maps: state.maps,
			permissions: state.permissions,
			combat: state.session.combat,
			systems: state.systems,
			actorId: editor.actorId,
			combatantId: selected.combatantId,
			deliveredMapIds: deliveredMapIdsForActor(state.session, editor.actorId),
		});
		return result.kind === 'range' ? result.range : null;
	}, [moving, selected, runtime.state, editor.actorId]);

	// The pending cell resets whenever the question changes — a different tool, or a different
	// combatant — so Enter can never commit a cell that was chosen for something else.
	useEffect(() => {
		setPending(null);
	}, [tool, selectedCombatantId]);

	const target = pending ?? hover;

	const placeTemplate = useCallback(
		(cell: TemplateCell) => {
			if (!grid || !aoeKind || busyRef.current) return;
			const origin = cellCenterNormalized(grid, cell);
			const label = t(TEMPLATE_KIND_LABELS[aoeKind]);
			busyRef.current = true;
			void editor
				.run(
					{
						type: 'combat.place-template',
						actorId: editor.actorId,
						payload: {
							kind: aoeKind,
							mapId: editor.mapId,
							label,
							x: origin.x,
							y: origin.y,
							rotation: aoeKind === 'sphere' ? 0 : editor.options.templateRotation,
							size: editor.options.templateSize,
						},
					} as never,
					{ undoable: false },
				)
				.then((accepted) => {
					busyRef.current = false;
					if (accepted) {
						setPending(null);
						announce(t('mapCombat.areaPlaced', { label }));
					}
				});
		},
		[aoeKind, announce, editor, grid, t],
	);

	const moveTo = useCallback(
		(cell: TemplateCell) => {
			if (!grid || !selected || busyRef.current) return;
			if (
				range &&
				!range.cells.some((reach) => reach.cell.q === cell.q && reach.cell.r === cell.r)
			) {
				announce(t('mapCombat.outOfRange', { name: selected.name }));
				return;
			}
			const position = cellCenterNormalized(grid, cell);
			busyRef.current = true;
			void editor
				.run(
					{
						type: 'combat.move-token',
						actorId: editor.actorId,
						payload: { combatantId: selected.combatantId, x: position.x, y: position.y },
					} as never,
					{ undoable: false },
				)
				.then((accepted) => {
					busyRef.current = false;
					if (accepted) {
						setPending(null);
						announce(t('mapCombat.moved', { name: selected.name }));
					}
				});
		},
		[announce, editor, grid, range, selected, t],
	);

	const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
		if (!grid) return;
		if (event.key === 'Escape') {
			setPending(null);
			return;
		}
		const step =
			event.key === 'ArrowLeft'
				? { q: -1, r: 0 }
				: event.key === 'ArrowRight'
					? { q: 1, r: 0 }
					: event.key === 'ArrowUp'
						? { q: 0, r: -1 }
						: event.key === 'ArrowDown'
							? { q: 0, r: 1 }
							: null;
		if (step) {
			event.preventDefault();
			const from = pending ?? startCell(grid, moving ? (selected?.position ?? null) : null);
			setPending({ q: from.q + step.q, r: from.r + step.r });
			return;
		}
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		const cell = pending ?? startCell(grid, moving ? (selected?.position ?? null) : null);
		if (moving) moveTo(cell);
		else placeTemplate(cell);
	};

	if (!combat.running || !grid) return null;

	const cellSize = 1 / grid.size;
	const ghost: AreaTemplate | null =
		aoeKind && target
			? {
					kind: aoeKind,
					origin: cellCenterNormalized(grid, target),
					rotation: aoeKind === 'sphere' ? 0 : editor.options.templateRotation,
					size: editor.options.templateSize,
				}
			: null;
	const ghostCells = ghost ? templateCells(ghost, grid) : [];
	const path = range && target ? movementPathTo(range, target) : [];

	const label = moving
		? selected
			? t('mapCombat.moveSurface', { name: selected.name })
			: t('mapCombat.moveSurfaceNoOne')
		: t('mapCombat.areaSurface', { shape: t(TEMPLATE_KIND_LABELS[aoeKind ?? 'sphere']) });

	return (
		<>
			<svg
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				aria-hidden
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					overflow: 'visible',
					pointerEvents: 'none',
					zIndex: 3,
					transform: `scale(${zoom}) translate(${(0.5 - center.x) * 100}%, ${(0.5 - center.y) * 100}%)`,
					transformOrigin: 'center center',
				}}
			>
				{range && (
					<g>
						{range.cells.map((reach) => (
							<Cell
								key={`reach-${reach.cell.q},${reach.cell.r}`}
								grid={grid}
								cell={reach.cell}
								size={cellSize}
								fill="color-mix(in oklab, var(--color-accent) 14%, transparent)"
								stroke="color-mix(in oklab, var(--color-accent) 30%, transparent)"
							/>
						))}
					</g>
				)}
				{templates.map((entry) => (
					<g key={entry.template.id}>
						{entry.cells.map((cell) => (
							<Cell
								key={`${entry.template.id}-${cell.q},${cell.r}`}
								grid={grid}
								cell={cell}
								size={cellSize}
								fill="color-mix(in oklab, var(--color-status-error) 22%, transparent)"
								stroke="var(--color-status-error)"
							/>
						))}
					</g>
				))}
				{ghostCells.map((cell) => (
					<Cell
						key={`ghost-${cell.q},${cell.r}`}
						grid={grid}
						cell={cell}
						size={cellSize}
						fill="color-mix(in oklab, var(--color-accent) 22%, transparent)"
						stroke="var(--color-accent)"
						dashed
					/>
				))}
				{path.length > 1 && (
					<polyline
						points={path
							.map((cell) => {
								const p = cellCenterNormalized(grid, cell);
								return `${p.x * 100},${p.y * 100}`;
							})
							.join(' ')}
						fill="none"
						stroke="var(--color-accent)"
						strokeWidth={1.6}
						strokeDasharray="3 2"
						strokeLinecap="round"
						vectorEffect="non-scaling-stroke"
					/>
				)}
			</svg>

			{armed && (
				<button
					type="button"
					aria-label={label}
					onKeyDown={onKeyDown}
					onPointerMove={(event) => setHover(cellOf(grid, toMap(event.clientX, event.clientY)))}
					onPointerLeave={() => setHover(null)}
					onClick={(event) => {
						const cell = cellOf(grid, toMap(event.clientX, event.clientY));
						if (moving) moveTo(cell);
						else placeTemplate(cell);
					}}
					style={{
						position: 'absolute',
						inset: 0,
						zIndex: 4,
						padding: 0,
						border: 'none',
						background: 'transparent',
						cursor: 'crosshair',
						touchAction: 'none',
						color: T.ink,
					}}
				/>
			)}
		</>
	);
}

/** One grid cell painted as a rectangle in the canvas's 0..100 viewBox. */
function Cell({
	grid,
	cell,
	size,
	fill,
	stroke,
	dashed = false,
}: {
	grid: TemplateGrid;
	cell: TemplateCell;
	size: number;
	fill: string;
	stroke: string;
	dashed?: boolean;
}) {
	const p = cellCenterNormalized(grid, cell);
	return (
		<rect
			x={(p.x - size / 2) * 100}
			y={(p.y - size / 2) * 100}
			width={size * 100}
			height={size * 100}
			fill={fill}
			stroke={stroke}
			strokeWidth={0.8}
			strokeDasharray={dashed ? '2 2' : undefined}
			vectorEffect="non-scaling-stroke"
		/>
	);
}

/** The cell a normalized point falls in. */
function cellOf(grid: TemplateGrid, point: Pt): TemplateCell {
	return movementCellAt(grid, point);
}

/** Where arrow-keying starts: the selected combatant's own cell, else the middle of the map. */
function startCell(grid: TemplateGrid, position: Pt | null): TemplateCell {
	return movementCellAt(grid, position ?? { x: 0.5, y: 0.5 });
}
