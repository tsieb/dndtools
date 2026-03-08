import type { Note } from '$lib/types/note.js';

const ROLLABLE_CATEGORY_KEYWORDS = ['encounters', 'loot', 'names', 'weather', 'events'] as const;
const DEFAULT_ROW_WEIGHT = 1;

export interface RollableTableRow {
	weight: number;
	result: string;
	cells: string[];
}

export interface RollableTableEntry {
	id: string;
	tableName: string;
	sourceNoteId: string;
	sourceNoteTitle: string;
	sourceNoteFolder: string;
	rowCount: number;
	weighted: boolean;
	rows: RollableTableRow[];
}

export interface RollableTableRollResult {
	tableId: string;
	tableName: string;
	result: string;
	rowIndex: number;
}

function parsePipeRow(line: string): string[] | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
	return trimmed
		.slice(1, -1)
		.split('|')
		.map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]): boolean {
	if (cells.length === 0) return false;
	return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function normalizeHeaderCell(value: string): string {
	return value.trim().toLowerCase();
}

function detectResultColumn(headers: string[]): number {
	const resultCandidates = ['result', 'outcome', 'entry', 'event', 'name'];
	for (const candidate of resultCandidates) {
		const index = headers.findIndex((header) => header.includes(candidate));
		if (index >= 0) return index;
	}
	return -1;
}

function detectWeightColumn(headers: string[]): number {
	const weightCandidates = ['weight', 'chance', 'roll', 'w'];
	for (const candidate of weightCandidates) {
		const index = headers.findIndex((header) => header === candidate || header.includes(candidate));
		if (index >= 0) return index;
	}
	return -1;
}

function parseRowWeight(raw: string): number {
	const trimmed = raw.trim();
	if (!trimmed) return DEFAULT_ROW_WEIGHT;
	const exact = Number.parseInt(trimmed, 10);
	if (Number.isFinite(exact) && exact > 0) return exact;
	const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
	if (!range) return DEFAULT_ROW_WEIGHT;
	const left = Number.parseInt(range[1] ?? '', 10);
	const right = Number.parseInt(range[2] ?? '', 10);
	if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) return DEFAULT_ROW_WEIGHT;
	return right - left + 1;
}

function isFrontmatterRollable(frontmatter: Note['frontmatter']): boolean {
	const raw = frontmatter['rollable'];
	if (raw === true) return true;
	if (typeof raw === 'number') return raw === 1;
	if (typeof raw === 'string') {
		const normalized = raw.trim().toLowerCase();
		return normalized === 'true' || normalized === 'yes' || normalized === '1';
	}
	return false;
}

function headingMatchesRollableCategory(heading: string | null): boolean {
	if (!heading) return false;
	const normalized = heading.trim().toLowerCase();
	return ROLLABLE_CATEGORY_KEYWORDS.some((category) => normalized.includes(category));
}

function rowResult(cells: string[], resultColumn: number, weightColumn: number): string {
	if (resultColumn >= 0) return cells[resultColumn]?.trim() ?? '';
	return cells
		.filter((_cell, index) => index !== weightColumn)
		.map((cell) => cell.trim())
		.filter(Boolean)
		.join(' | ');
}

export function listRollableTables(notes: readonly Note[]): RollableTableEntry[] {
	const tables: RollableTableEntry[] = [];

	for (const note of notes) {
		const lines = note.content.split(/\r?\n/);
		const rollableByFrontmatter = isFrontmatterRollable(note.frontmatter);
		let currentHeading: string | null = null;
		let tableCounter = 0;

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
			const headingMatch = (lines[lineIndex] ?? '').match(/^#{1,6}\s+(.+?)\s*$/);
			if (headingMatch) {
				currentHeading = headingMatch[1]?.trim() ?? null;
				continue;
			}

			const headerCells = parsePipeRow(lines[lineIndex] ?? '');
			if (!headerCells) continue;
			const separatorCells = parsePipeRow(lines[lineIndex + 1] ?? '');
			if (
				!separatorCells ||
				!isSeparatorRow(separatorCells) ||
				separatorCells.length !== headerCells.length
			) {
				continue;
			}

			const rowCells: string[][] = [];
			let cursor = lineIndex + 2;
			for (; cursor < lines.length; cursor += 1) {
				const parsed = parsePipeRow(lines[cursor] ?? '');
				if (!parsed || parsed.length !== headerCells.length) break;
				rowCells.push(parsed);
			}
			lineIndex = cursor - 1;
			if (rowCells.length === 0) continue;

			const tableIsRollable =
				rollableByFrontmatter || headingMatchesRollableCategory(currentHeading);
			if (!tableIsRollable) continue;

			const normalizedHeaders = headerCells.map((cell) => normalizeHeaderCell(cell));
			const resultColumn = detectResultColumn(normalizedHeaders);
			const weightColumn = detectWeightColumn(normalizedHeaders);
			const rows: RollableTableRow[] = rowCells
				.map((cells) => ({
					weight:
						weightColumn >= 0 ? parseRowWeight(cells[weightColumn] ?? '') : DEFAULT_ROW_WEIGHT,
					result: rowResult(cells, resultColumn, weightColumn),
					cells,
				}))
				.filter((row) => row.result.length > 0);
			if (rows.length === 0) continue;

			tableCounter += 1;
			const headingLabel = currentHeading ? currentHeading : `${note.title} Table ${tableCounter}`;
			tables.push({
				id: `${note.id}:table:${tableCounter}`,
				tableName: headingLabel,
				sourceNoteId: String(note.id),
				sourceNoteTitle: note.title,
				sourceNoteFolder: String(note.folder),
				rowCount: rows.length,
				weighted: rows.some((row) => row.weight !== DEFAULT_ROW_WEIGHT),
				rows,
			});
		}
	}

	return tables.sort((left, right) => {
		const byNote = left.sourceNoteTitle.localeCompare(right.sourceNoteTitle);
		if (byNote !== 0) return byNote;
		return left.tableName.localeCompare(right.tableName);
	});
}

export function rollRollableTable(
	table: RollableTableEntry,
	options?: {
		random?: () => number;
	},
): RollableTableRollResult {
	const random = options?.random ?? Math.random;
	const totalWeight = table.rows.reduce((sum, row) => sum + Math.max(1, row.weight), 0);
	const sample = random();
	const normalizedSample = Number.isFinite(sample) ? sample : 0;
	const target = Math.floor(Math.max(0, Math.min(0.999999, normalizedSample)) * totalWeight);
	let cursor = 0;
	for (let i = 0; i < table.rows.length; i += 1) {
		const row = table.rows[i];
		if (!row) continue;
		cursor += Math.max(1, row.weight);
		if (target < cursor) {
			return {
				tableId: table.id,
				tableName: table.tableName,
				result: row.result,
				rowIndex: i,
			};
		}
	}

	const fallbackIndex = Math.max(0, table.rows.length - 1);
	const fallback = table.rows[fallbackIndex];
	return {
		tableId: table.id,
		tableName: table.tableName,
		result: fallback?.result ?? '',
		rowIndex: fallbackIndex,
	};
}
