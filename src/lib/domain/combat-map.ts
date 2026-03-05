import type { MapGridType } from '$lib/types/object.js';
import type {
	SessionBoardCombatMapState,
	SessionBoardCombatMapToken,
	SessionBoardCombatMapTemplate,
	SessionBoardCombatant,
} from '$lib/types/session-board.js';

export interface GridCell {
	x: number;
	y: number;
}

export interface PathResult {
	cells: GridCell[];
	cost: number;
}

export interface CombatRangeProfile {
	label: string;
	feet: number;
	squares: number;
	source: string;
}

export type CombatHpBarTone = 'full' | 'mid' | 'low' | 'empty' | 'unknown';

const MAX_HISTORY = 800;

function asInt(value: number): number {
	return Math.trunc(value);
}

function clampInt(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.round(value)));
}

export function gridCellKey(cell: GridCell): string {
	return `${asInt(cell.x)},${asInt(cell.y)}`;
}

export function uniqueGridCells(cells: readonly GridCell[]): GridCell[] {
	const seen = new Set<string>();
	const next: GridCell[] = [];
	for (const cell of cells) {
		const normalized = { x: asInt(cell.x), y: asInt(cell.y) };
		const key = gridCellKey(normalized);
		if (seen.has(key)) continue;
		seen.add(key);
		next.push(normalized);
	}
	return next;
}

export function parseSpeedFeet(speed: string | undefined): number | null {
	if (!speed) return null;
	const matches = [...speed.matchAll(/(\d+)\s*ft/gi)];
	if (matches.length > 0) {
		const parsed = Number.parseInt(matches[0]?.[1] ?? '', 10);
		return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
	}
	const fallback = speed.match(/(\d+)/);
	if (!fallback) return null;
	const parsed = Number.parseInt(fallback[1] ?? '', 10);
	return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function movementSquaresForCombatant(
	combatant: SessionBoardCombatant,
	unitsPerGridSquare = 5,
	fallbackSquares = 6,
): number {
	const speedFeet = parseSpeedFeet(combatant.statsPreview?.speed);
	if (!speedFeet) return fallbackSquares;
	return Math.max(1, Math.floor(speedFeet / Math.max(1, unitsPerGridSquare)));
}

function parseRangeFeetFromText(text: string): number | null {
	const slash = text.match(/(\d+)\s*\/\s*(\d+)/);
	if (slash) {
		const normal = Number.parseInt(slash[1] ?? '', 10);
		return Number.isFinite(normal) ? Math.max(0, normal) : null;
	}
	const explicitRange = text.match(/range\s+(\d+)\s*(?:ft|feet)?/i);
	if (explicitRange) {
		const parsed = Number.parseInt(explicitRange[1] ?? '', 10);
		return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
	}
	const feet = text.match(/(\d+)\s*ft/i);
	if (!feet) return null;
	const parsed = Number.parseInt(feet[1] ?? '', 10);
	return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function rangeProfileForCombatant(
	combatant: SessionBoardCombatant,
	unitsPerGridSquare = 5,
): CombatRangeProfile | null {
	const candidates = [
		...(combatant.statsPreview?.actions ?? []),
		...(combatant.statsPreview?.reactions ?? []),
		...(combatant.statsPreview?.traits ?? []),
	];
	for (const entry of candidates) {
		const feet = parseRangeFeetFromText(entry);
		if (!feet || feet <= 0) continue;
		return {
			label: `${feet} ft`,
			feet,
			squares: Math.max(1, Math.ceil(feet / Math.max(1, unitsPerGridSquare))),
			source: entry,
		};
	}
	return null;
}

function squareDistance(a: GridCell, b: GridCell): number {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function oddRowToAxial(cell: GridCell): { q: number; r: number } {
	const q = cell.x - (cell.y - (cell.y & 1)) / 2;
	const r = cell.y;
	return { q, r };
}

function hexDistance(a: GridCell, b: GridCell): number {
	const axialA = oddRowToAxial(a);
	const axialB = oddRowToAxial(b);
	const dq = axialA.q - axialB.q;
	const dr = axialA.r - axialB.r;
	const ds = -axialA.q - axialA.r - (-axialB.q - axialB.r);
	return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

export function cellDistance(a: GridCell, b: GridCell, gridType: MapGridType): number {
	return gridType === 'hex' ? hexDistance(a, b) : squareDistance(a, b);
}

function squareNeighbors(cell: GridCell): GridCell[] {
	return [
		{ x: cell.x + 1, y: cell.y },
		{ x: cell.x - 1, y: cell.y },
		{ x: cell.x, y: cell.y + 1 },
		{ x: cell.x, y: cell.y - 1 },
	];
}

function hexNeighbors(cell: GridCell): GridCell[] {
	const offsetsEven = [
		{ x: -1, y: -1 },
		{ x: 0, y: -1 },
		{ x: -1, y: 0 },
		{ x: 1, y: 0 },
		{ x: -1, y: 1 },
		{ x: 0, y: 1 },
	];
	const offsetsOdd = [
		{ x: 0, y: -1 },
		{ x: 1, y: -1 },
		{ x: -1, y: 0 },
		{ x: 1, y: 0 },
		{ x: 0, y: 1 },
		{ x: 1, y: 1 },
	];
	const offsets = cell.y % 2 === 0 ? offsetsEven : offsetsOdd;
	return offsets.map((offset) => ({
		x: cell.x + offset.x,
		y: cell.y + offset.y,
	}));
}

function neighbors(cell: GridCell, gridType: MapGridType): GridCell[] {
	return gridType === 'hex' ? hexNeighbors(cell) : squareNeighbors(cell);
}

export interface PathOptions {
	gridType: MapGridType;
	blocked: ReadonlySet<string>;
	difficultTerrain: ReadonlySet<string>;
	maxIterations?: number;
}

function movementCellCost(cell: GridCell, difficultTerrain: ReadonlySet<string>): number {
	return difficultTerrain.has(gridCellKey(cell)) ? 2 : 1;
}

function reconstructPath(
	cameFrom: Map<string, string>,
	startKey: string,
	endKey: string,
): GridCell[] {
	const path: GridCell[] = [];
	let current = endKey;
	let guard = 0;
	while (guard < 50_000) {
		const [xRaw, yRaw] = current.split(',');
		const x = Number.parseInt(xRaw ?? '', 10);
		const y = Number.parseInt(yRaw ?? '', 10);
		if (Number.isFinite(x) && Number.isFinite(y)) {
			path.push({ x, y });
		}
		if (current === startKey) break;
		const previous = cameFrom.get(current);
		if (!previous) break;
		current = previous;
		guard += 1;
	}
	path.reverse();
	return path;
}

export function findShortestPath(
	start: GridCell,
	target: GridCell,
	options: PathOptions,
): PathResult | null {
	const startKey = gridCellKey(start);
	const targetKey = gridCellKey(target);
	if (startKey === targetKey) {
		return { cells: [start], cost: 0 };
	}

	const maxIterations = options.maxIterations ?? 40_000;
	const queue: Array<{ key: string; cost: number }> = [{ key: startKey, cost: 0 }];
	const costs = new Map<string, number>([[startKey, 0]]);
	const cameFrom = new Map<string, string>();
	let iterations = 0;

	while (queue.length > 0 && iterations < maxIterations) {
		queue.sort((a, b) => a.cost - b.cost);
		const current = queue.shift();
		if (!current) break;
		if (current.key === targetKey) {
			return {
				cells: reconstructPath(cameFrom, startKey, targetKey),
				cost: current.cost,
			};
		}
		const [xRaw, yRaw] = current.key.split(',');
		const currentCell = {
			x: Number.parseInt(xRaw ?? '', 10),
			y: Number.parseInt(yRaw ?? '', 10),
		};
		if (!Number.isFinite(currentCell.x) || !Number.isFinite(currentCell.y)) {
			iterations += 1;
			continue;
		}
		for (const nextCell of neighbors(currentCell, options.gridType)) {
			const key = gridCellKey(nextCell);
			if (key !== targetKey && options.blocked.has(key)) continue;
			const nextCost = current.cost + movementCellCost(nextCell, options.difficultTerrain);
			const known = costs.get(key);
			if (known !== undefined && known <= nextCost) continue;
			costs.set(key, nextCost);
			cameFrom.set(key, current.key);
			queue.push({ key, cost: nextCost });
		}
		iterations += 1;
	}
	return null;
}

export function reachableCells(
	start: GridCell,
	maxCost: number,
	options: PathOptions,
): Array<{ cell: GridCell; cost: number }> {
	const startKey = gridCellKey(start);
	const queue: Array<{ key: string; cost: number }> = [{ key: startKey, cost: 0 }];
	const costs = new Map<string, number>([[startKey, 0]]);
	const results: Array<{ cell: GridCell; cost: number }> = [{ cell: start, cost: 0 }];
	let iterations = 0;
	const maxIterations = options.maxIterations ?? 40_000;

	while (queue.length > 0 && iterations < maxIterations) {
		queue.sort((a, b) => a.cost - b.cost);
		const current = queue.shift();
		if (!current) break;
		const [xRaw, yRaw] = current.key.split(',');
		const currentCell = {
			x: Number.parseInt(xRaw ?? '', 10),
			y: Number.parseInt(yRaw ?? '', 10),
		};
		if (!Number.isFinite(currentCell.x) || !Number.isFinite(currentCell.y)) {
			iterations += 1;
			continue;
		}
		for (const nextCell of neighbors(currentCell, options.gridType)) {
			const key = gridCellKey(nextCell);
			if (options.blocked.has(key) && key !== startKey) continue;
			const nextCost = current.cost + movementCellCost(nextCell, options.difficultTerrain);
			if (nextCost > maxCost) continue;
			const known = costs.get(key);
			if (known !== undefined && known <= nextCost) continue;
			costs.set(key, nextCost);
			queue.push({ key, cost: nextCost });
			results.push({ cell: nextCell, cost: nextCost });
		}
		iterations += 1;
	}

	return results;
}

function templateRadius(template: SessionBoardCombatMapTemplate): number {
	if (template.shape === 'line') return Math.max(1, template.lengthSquares ?? 6);
	return Math.max(1, template.radiusSquares ?? 1);
}

function cellsForSphere(
	template: SessionBoardCombatMapTemplate,
	gridType: MapGridType,
): GridCell[] {
	const radius = templateRadius(template);
	const origin = { x: template.originX, y: template.originY };
	const next: GridCell[] = [];
	for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
		for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
			const distance = cellDistance(origin, { x, y }, gridType);
			if (distance <= radius) next.push({ x, y });
		}
	}
	return uniqueGridCells(next);
}

function cellsForCube(template: SessionBoardCombatMapTemplate): GridCell[] {
	const radius = templateRadius(template);
	const origin = { x: template.originX, y: template.originY };
	const next: GridCell[] = [];
	for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
		for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
			if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) <= radius) {
				next.push({ x, y });
			}
		}
	}
	return uniqueGridCells(next);
}

function directionAngleRadians(from: GridCell, to: GridCell): number {
	return Math.atan2(to.y - from.y, to.x - from.x);
}

function normalizeAngleDelta(delta: number): number {
	let next = delta;
	while (next > Math.PI) next -= 2 * Math.PI;
	while (next < -Math.PI) next += 2 * Math.PI;
	return next;
}

function cellsForCone(template: SessionBoardCombatMapTemplate, gridType: MapGridType): GridCell[] {
	const radius = templateRadius(template);
	const origin = { x: template.originX, y: template.originY };
	const target = { x: template.targetX, y: template.targetY };
	const heading = directionAngleRadians(origin, target);
	const next: GridCell[] = [origin];
	for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
		for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
			const cell = { x, y };
			const distance = cellDistance(origin, cell, gridType);
			if (distance > radius || distance === 0) continue;
			const angle = directionAngleRadians(origin, cell);
			const delta = Math.abs(normalizeAngleDelta(angle - heading));
			if (delta <= Math.PI / 6 + 0.05) {
				next.push(cell);
			}
		}
	}
	return uniqueGridCells(next);
}

function cellsForLine(template: SessionBoardCombatMapTemplate): GridCell[] {
	const length = Math.max(1, template.lengthSquares ?? 6);
	const width = Math.max(1, template.widthSquares ?? 1);
	const origin = { x: template.originX, y: template.originY };
	const target = { x: template.targetX, y: template.targetY };
	const dx = target.x - origin.x;
	const dy = target.y - origin.y;
	const magnitude = Math.hypot(dx, dy) || 1;
	const ux = dx / magnitude;
	const uy = dy / magnitude;
	const px = -uy;
	const py = ux;

	const next: GridCell[] = [];
	for (let step = 0; step <= length; step += 1) {
		for (let lateral = -(width - 1) / 2; lateral <= (width - 1) / 2; lateral += 1) {
			const cx = origin.x + ux * step + px * lateral;
			const cy = origin.y + uy * step + py * lateral;
			next.push({ x: Math.round(cx), y: Math.round(cy) });
		}
	}
	return uniqueGridCells(next);
}

export function cellsForTemplate(
	template: SessionBoardCombatMapTemplate,
	gridType: MapGridType,
): GridCell[] {
	switch (template.shape) {
		case 'sphere':
			return cellsForSphere(template, gridType);
		case 'cube':
			return cellsForCube(template);
		case 'cone':
			return cellsForCone(template, gridType);
		case 'line':
			return cellsForLine(template);
	}
}

export function combatantInitials(name: string): string {
	const normalized = name.trim();
	if (!normalized) return '?';
	const parts = normalized.split(/\s+/).filter(Boolean);
	if (parts.length === 1) return normalized.slice(0, 2).toUpperCase();
	return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

export function conditionIconsForCombatant(combatant: SessionBoardCombatant): string[] {
	const icons: string[] = [];
	if (combatant.outcome === 'fell' || (combatant.currentHp ?? 1) <= 0) {
		icons.push('☠');
	}
	const conditionMap: Record<string, string> = {
		frozen: '❄',
		paralyzed: '❄',
		poisoned: '☣',
		stunned: '✶',
		restrained: '⛓',
		grappled: '⛓',
		invisible: '◌',
		unconscious: '🛌',
	};
	for (const condition of combatant.conditions) {
		const icon = conditionMap[condition.trim().toLowerCase()];
		if (!icon || icons.includes(icon)) continue;
		icons.push(icon);
		if (icons.length >= 3) break;
	}
	if (combatant.concentration && !icons.includes('◎') && icons.length < 3) {
		icons.push('◎');
	}
	return icons;
}

export function hpBarToneForCombatant(combatant: SessionBoardCombatant): CombatHpBarTone {
	if (combatant.currentHp === null || combatant.maxHp === null || combatant.maxHp <= 0) {
		return 'unknown';
	}
	if (combatant.currentHp <= 0) return 'empty';
	const ratio = combatant.currentHp / combatant.maxHp;
	if (ratio > 0.66) return 'full';
	if (ratio > 0.33) return 'mid';
	return 'low';
}

function spiralOffsets(limit: number): GridCell[] {
	const offsets: GridCell[] = [{ x: 0, y: 0 }];
	for (let radius = 1; radius <= limit; radius += 1) {
		for (let x = -radius; x <= radius; x += 1) {
			offsets.push({ x, y: -radius });
			offsets.push({ x, y: radius });
		}
		for (let y = -radius + 1; y <= radius - 1; y += 1) {
			offsets.push({ x: -radius, y });
			offsets.push({ x: radius, y });
		}
	}
	return uniqueGridCells(offsets);
}

export function autoPlaceCombatTokens(
	combatants: readonly SessionBoardCombatant[],
	existingTokens: readonly SessionBoardCombatMapToken[],
	anchor: GridCell = { x: 0, y: 0 },
): SessionBoardCombatMapToken[] {
	const byCombatant = new Map<string, SessionBoardCombatMapToken>();
	for (const token of existingTokens) {
		if (!combatants.some((combatant) => combatant.id === token.combatantId)) continue;
		if (byCombatant.has(token.combatantId)) continue;
		byCombatant.set(token.combatantId, {
			...token,
			x: asInt(token.x),
			y: asInt(token.y),
		});
	}

	const occupied = new Set<string>(
		[...byCombatant.values()].map((token) => gridCellKey({ x: token.x, y: token.y })),
	);
	const offsets = spiralOffsets(Math.max(4, combatants.length + 2));
	for (const combatant of combatants) {
		if (byCombatant.has(combatant.id)) continue;
		let assigned: GridCell | null = null;
		for (const offset of offsets) {
			const candidate = { x: anchor.x + offset.x, y: anchor.y + offset.y };
			const key = gridCellKey(candidate);
			if (occupied.has(key)) continue;
			assigned = candidate;
			occupied.add(key);
			break;
		}
		if (!assigned) assigned = { x: anchor.x, y: anchor.y };
		byCombatant.set(combatant.id, {
			combatantId: combatant.id,
			x: assigned.x,
			y: assigned.y,
			initials: combatantInitials(combatant.name),
		});
	}

	return combatants
		.map((combatant) => byCombatant.get(combatant.id))
		.filter((token): token is SessionBoardCombatMapToken => !!token);
}

export function appendMapHistory(
	mapState: SessionBoardCombatMapState,
	entry: Omit<SessionBoardCombatMapState['history'][number], 'id'>,
	idFactory: () => string,
): SessionBoardCombatMapState {
	return {
		...mapState,
		history: [
			...mapState.history,
			{
				id: idFactory(),
				...entry,
			},
		].slice(-MAX_HISTORY),
	};
}

export function hpBarColorClass(tone: CombatHpBarTone): string {
	switch (tone) {
		case 'full':
			return 'bg-emerald-500';
		case 'mid':
			return 'bg-amber-500';
		case 'low':
			return 'bg-orange-600';
		case 'empty':
			return 'bg-red-700';
		case 'unknown':
			return 'bg-slate-400';
	}
}

export function normalizeTemplateInput(
	input: Partial<SessionBoardCombatMapTemplate> & Pick<SessionBoardCombatMapTemplate, 'shape'>,
): SessionBoardCombatMapTemplate {
	return {
		id: input.id?.trim() || `template-${Date.now()}`,
		shape: input.shape,
		originX: clampInt(input.originX ?? 0, -10_000, 10_000),
		originY: clampInt(input.originY ?? 0, -10_000, 10_000),
		targetX: clampInt(input.targetX ?? input.originX ?? 0, -10_000, 10_000),
		targetY: clampInt(input.targetY ?? input.originY ?? 0, -10_000, 10_000),
		radiusSquares: input.radiusSquares ? clampInt(input.radiusSquares, 1, 200) : undefined,
		widthSquares: input.widthSquares ? clampInt(input.widthSquares, 1, 50) : undefined,
		lengthSquares: input.lengthSquares ? clampInt(input.lengthSquares, 1, 500) : undefined,
		label: input.label?.trim() || undefined,
		createdAt: input.createdAt?.trim() || new Date().toISOString(),
	};
}
