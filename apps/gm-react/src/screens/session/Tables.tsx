import {
	parseDiceExpression,
	VAULT_OBJECT_SUBTYPE_KEY,
	type ContentItemView,
	type DiceHistoryView,
	type QuickReferencePanelView,
} from '@dndtools/core';
import { Badge, Button, EmptyState, IconButton } from '../../ds';
import { useI18n } from '../../i18n';
import { Panel, T, mono } from '../../app/screen-kit';

/**
 * RC-SES-2.3 — the ROLLABLE TABLES tab of the live-play console. A `dice-table` Vault Object (the
 * subtype the vault, the widget builder and the assistant's `table.create` all write) is a table the
 * DM can DRAW mid-session: the draw goes through `dice.roll-table`, so it lands in the session roll
 * log with `source: 'table'` alongside every other roll, attributed and reproducible from its seed.
 *
 * The panel owns no state. Tables come from the actor-scoped content read, the last draw comes from
 * the actor-scoped dice history, and pins come from the actor-scoped quick-reference read, so a DM
 * previewing as a player sees that player's tables and nothing else.
 *
 * HONEST ABOUT THE MAPPING. The core maps a draw's total onto row N, clamped into the row range
 * (`resolveTableDraw`, `state/dice.ts`). That means rows are weighted by how the table is AUTHORED —
 * repeat a row and it comes up more often — and it means an expression that can roll past the last
 * row funnels every high total into that row. Rather than hide that, each table shows the totals its
 * expression can produce against its row count, and a table that overshoots says so plainly instead
 * of quietly skewing the DM's results.
 */

/** One drawable table, projected from a `dice-table` Vault Object. */
export interface TableView {
	id: string;
	title: string;
	dice: string;
	rows: string[];
	/** The highest total the declared expression can roll, or null when it cannot be parsed. */
	maxTotal: number | null;
}

/** The most recent draw of one table, read back from the actor-filtered roll history. */
export interface TableDrawView {
	rollId: string;
	tableItemId: string;
	rowNumber: number;
	rowText: string;
	total: number;
}

/** The highest total a parsed expression can roll: every die on its top face, keeps and signs applied. */
function maxTotalOf(expression: string): number | null {
	const parsed = parseDiceExpression(expression);
	if (!parsed.ok) return null;
	let total = 0;
	for (const term of parsed.expression.terms) {
		if (term.kind === 'constant') {
			total += term.sign * term.value;
			continue;
		}
		const kept = term.keep ? Math.min(term.keep.count, term.count) : term.count;
		total += term.sign * kept * term.sides;
	}
	return total;
}

/**
 * Project the visible `dice-table` Vault Objects out of the actor-scoped content list. An object whose
 * declared `dice`/`entries` are missing or malformed is OMITTED rather than listed with a Roll button
 * the core would refuse — a table that cannot be drawn is not offered.
 */
export function tablesFromContent(items: ContentItemView[]): TableView[] {
	const tables: TableView[] = [];
	for (const item of items) {
		if (item.fields[VAULT_OBJECT_SUBTYPE_KEY] !== 'dice-table') continue;
		const dice = item.fields['dice'];
		const entries = item.fields['entries'];
		if (typeof dice !== 'string' || dice.trim() === '') continue;
		if (!Array.isArray(entries) || entries.length === 0) continue;
		if (!entries.every((entry) => typeof entry === 'string')) continue;
		tables.push({
			id: item.id,
			title: item.title,
			dice: dice.trim(),
			rows: entries as string[],
			maxTotal: maxTotalOf(dice),
		});
	}
	return tables.sort((a, b) => a.title.localeCompare(b.title));
}

/** The latest draw per table, from the actor-filtered roll history (oldest-first, so the last wins). */
export function latestDrawsByTable(history: DiceHistoryView): Map<string, TableDrawView> {
	const latest = new Map<string, TableDrawView>();
	for (const roll of history.rolls) {
		if (roll.sourceKind !== 'table') continue;
		if (!roll.tableItemId || roll.tableRowNumber === null || roll.tableRowText === null) continue;
		latest.set(roll.tableItemId, {
			rollId: roll.id,
			tableItemId: roll.tableItemId,
			rowNumber: roll.tableRowNumber,
			rowText: roll.tableRowText,
			total: roll.total,
		});
	}
	return latest;
}

function TableRow({
	table,
	draw,
	pin,
	disabled,
	onRoll,
	onPin,
	onUnpin,
}: {
	table: TableView;
	draw: TableDrawView | undefined;
	pin: QuickReferencePanelView | undefined;
	disabled: boolean;
	onRoll: (table: TableView) => void;
	onPin: (table: TableView) => void;
	onUnpin: (panelId: string) => void;
}) {
	const { t } = useI18n();
	// The core clamps a total into the row range, so an expression that can roll past the last row
	// sends every one of those totals to it. Say so rather than let the table skew silently.
	const overshoots = table.maxTotal !== null && table.maxTotal > table.rows.length;
	return (
		<div
			data-testid={`table-row-${table.id}`}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
				padding: '10px 0',
				borderTop: `1px solid ${T.bd}`,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
				<span style={{ font: `600 13px ${T.sans}`, color: T.ink, flex: 1, minWidth: 120 }}>
					{table.title}
				</span>
				<span style={{ ...mono, font: `11px ${T.mono}`, color: T.sub }}>{table.dice}</span>
				<Badge>{t('session.tables.rowCount', { count: table.rows.length })}</Badge>
				<Button
					variant="accent"
					size="sm"
					icon="dice"
					disabled={disabled}
					onClick={() => onRoll(table)}
				>
					{t('session.tables.roll')}
				</Button>
				{pin ? (
					<IconButton
						icon="pin"
						label={t('session.tables.unpin', { title: table.title })}
						disabled={disabled}
						onClick={() => onUnpin(pin.id)}
					/>
				) : (
					<IconButton
						icon="pin"
						label={t('session.tables.pin', { title: table.title })}
						disabled={disabled}
						onClick={() => onPin(table)}
					/>
				)}
			</div>
			{overshoots && (
				<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
					{t('session.tables.overshoot', { max: table.maxTotal ?? 0, count: table.rows.length })}
				</div>
			)}
			{draw && (
				<div
					data-testid={`table-draw-${table.id}`}
					style={{ font: `12px ${T.sans}`, color: T.sub }}
				>
					<span style={{ ...mono, color: T.acc, fontWeight: 700 }}>
						{t('session.tables.drewRow', { row: draw.rowNumber, total: draw.total })}
					</span>{' '}
					{draw.rowText}
				</div>
			)}
		</div>
	);
}

/**
 * The tables panel. `isDm` gates the whole surface: drawing a table is a DM session asset (SES-008 is
 * dm-only at the core), so a player sees nothing here rather than a row of buttons the core refuses.
 */
export function TablesPanel({
	tables,
	draws,
	pins,
	isDm,
	isLive,
	previewing,
	onRoll,
	onPin,
	onUnpin,
}: {
	tables: TableView[];
	draws: Map<string, TableDrawView>;
	pins: QuickReferencePanelView[];
	isDm: boolean;
	isLive: boolean;
	previewing: boolean;
	onRoll: (table: TableView) => void;
	onPin: (table: TableView) => void;
	onUnpin: (panelId: string) => void;
}) {
	const { t } = useI18n();
	if (!isDm) return null;
	const disabled = !isLive || previewing;
	const pinByTable = new Map<string, QuickReferencePanelView>();
	for (const panel of pins) {
		if (panel.kind === 'dice-table' && panel.targetId) pinByTable.set(panel.targetId, panel);
	}
	return (
		<Panel title={t('session.tables.title')}>
			{tables.length === 0 ? (
				// I17 empty state: name what is missing and the one move that fills it.
				<EmptyState
					inset
					icon="dice"
					title={t('session.tables.empty.title')}
					description={t('session.tables.empty.description')}
				/>
			) : (
				<>
					{!isLive && (
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{t('session.tables.goLive')}</div>
					)}
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{tables.map((table) => (
							<TableRow
								key={table.id}
								table={table}
								draw={draws.get(table.id)}
								pin={pinByTable.get(table.id)}
								disabled={disabled}
								onRoll={onRoll}
								onPin={onPin}
								onUnpin={onUnpin}
							/>
						))}
					</div>
				</>
			)}
		</Panel>
	);
}
