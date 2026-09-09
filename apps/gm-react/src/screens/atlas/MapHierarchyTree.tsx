import { useMemo, useRef, useState } from 'react';
import { type MapHierarchyNode } from '@dndtools/core';
import { Icon, Input } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { ghostBtn } from './shared';
import { useI18n } from '../../i18n';

/** A node flattened to the currently VISIBLE rows (ancestors expanded, filter matched), in the
 * order the tree paints them — the order arrow-key navigation walks. */
interface VisibleRow {
	node: MapHierarchyNode;
	depth: number;
	hasChildren: boolean;
	expanded: boolean;
	parentId: string | null;
}

/** True when `node` or any descendant's name matches `query` (case-insensitive substring). */
function subtreeMatches(node: MapHierarchyNode, query: string): boolean {
	if (node.name.toLowerCase().includes(query)) return true;
	return node.children.some((c) => subtreeMatches(c, query));
}

/**
 * Flatten the tree to the rows that should currently paint: expanded (or filter-forced-open)
 * branches only. While filtering, a branch that contains a match is force-expanded regardless of
 * the user's own expand/collapse state, so a hit is never hidden inside a collapsed ancestor.
 */
function flatten(
	nodes: readonly MapHierarchyNode[],
	expanded: ReadonlySet<string>,
	query: string,
	depth: number,
	parentId: string | null,
	out: VisibleRow[],
): void {
	for (const node of nodes) {
		if (query && !subtreeMatches(node, query)) continue;
		const hasChildren = node.children.length > 0;
		const forcedOpen = query.length > 0 && hasChildren;
		const isExpanded = forcedOpen || expanded.has(node.mapId);
		out.push({ node, depth, hasChildren, expanded: isExpanded, parentId });
		if (hasChildren && isExpanded) {
			flatten(node.children, expanded, query, depth + 1, node.mapId, out);
		}
	}
}

/**
 * RC-MAP-3.8 — the atlas local-nav map hierarchy: a `role="tree"` view of `getMapHierarchyForActor`,
 * so a nested map (embedded via a `map-link` POI or the MAP-008 nesting graph) is reachable by
 * drilling down instead of only by scrolling the flat map-chip switcher. Filter narrows the visible
 * rows to matches (with their ancestors, so a hit is never presented out of context); arrow keys
 * follow the WAI-ARIA tree pattern (Up/Down move focus, Right expands/descends, Left/Escape/
 * Backspace collapses or climbs to the parent); Enter/Space opens the focused map.
 */
export function MapHierarchyTree({
	tree,
	selectedId,
	onSelect,
}: {
	tree: MapHierarchyNode[];
	selectedId: string | null;
	onSelect: (mapId: string) => void;
}) {
	const { t } = useI18n();
	const [filter, setFilter] = useState('');
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const treeRef = useRef<HTMLDivElement>(null);

	const query = filter.trim().toLowerCase();
	const rows = useMemo(() => {
		const out: VisibleRow[] = [];
		flatten(tree, expanded, query, 0, null, out);
		return out;
	}, [tree, expanded, query]);

	const rowById = useMemo(() => new Map(rows.map((r) => [r.node.mapId, r])), [rows]);
	// Roving tabindex needs exactly one stop: the remembered focus if it is still visible, else the
	// selected map's row, else the first row.
	const activeId =
		(focusedId && rowById.has(focusedId) ? focusedId : null) ??
		(selectedId && rowById.has(selectedId) ? selectedId : null) ??
		rows[0]?.node.mapId ??
		null;

	function setExpandedFor(mapId: string, value: boolean) {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (value) next.add(mapId);
			else next.delete(mapId);
			return next;
		});
	}

	function focusRowAt(index: number) {
		const row = rows[index];
		if (!row) return;
		setFocusedId(row.node.mapId);
		requestAnimationFrame(() => {
			treeRef.current?.querySelector<HTMLElement>(`[data-map-id="${row.node.mapId}"]`)?.focus();
		});
	}

	function onTreeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		const index = rows.findIndex((r) => r.node.mapId === activeId);
		if (index === -1) return;
		const row = rows[index] as VisibleRow;
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				focusRowAt(Math.min(index + 1, rows.length - 1));
				return;
			case 'ArrowUp':
				event.preventDefault();
				focusRowAt(Math.max(index - 1, 0));
				return;
			case 'ArrowRight':
				event.preventDefault();
				if (row.hasChildren && !row.expanded) setExpandedFor(row.node.mapId, true);
				else if (row.hasChildren) focusRowAt(index + 1);
				return;
			case 'ArrowLeft':
			case 'Escape':
			case 'Backspace':
				event.preventDefault();
				if (row.hasChildren && row.expanded && query === '') setExpandedFor(row.node.mapId, false);
				else if (row.parentId) {
					const parentIndex = rows.findIndex((r) => r.node.mapId === row.parentId);
					if (parentIndex !== -1) focusRowAt(parentIndex);
				}
				return;
			case 'Enter':
			case ' ':
				event.preventDefault();
				onSelect(row.node.mapId);
				return;
			default:
				return;
		}
	}

	return (
		<Panel title={t('atlas.mapHierarchy')}>
			<Input
				value={filter}
				onChange={(e: { target: { value: string } }) => setFilter(e.target.value)}
				placeholder={t('atlas.mapHierarchyFilter')}
				aria-label={t('atlas.mapHierarchyFilter')}
				style={{ marginBottom: 8 }}
			/>
			<div
				ref={treeRef}
				role="tree"
				aria-label={t('atlas.mapHierarchy')}
				onKeyDown={onTreeKeyDown}
				style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
			>
				{rows.map((row) => {
					const isSelected = row.node.mapId === selectedId;
					const isActive = row.node.mapId === activeId;
					return (
						<div
							key={row.node.mapId}
							role="treeitem"
							data-map-id={row.node.mapId}
							aria-selected={isSelected}
							aria-expanded={row.hasChildren ? row.expanded : undefined}
							aria-level={row.depth + 1}
							tabIndex={isActive ? 0 : -1}
							onFocus={() => setFocusedId(row.node.mapId)}
							onClick={() => onSelect(row.node.mapId)}
							style={{
								...ghostBtn,
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								width: '100%',
								paddingLeft: 6 + row.depth * 16,
								cursor: 'pointer',
								background: isSelected ? T.accSub : 'transparent',
								color: isSelected ? T.acc : T.ink,
							}}
						>
							{row.hasChildren ? (
								<button
									type="button"
									tabIndex={-1}
									aria-label={t(row.expanded ? 'atlas.collapseMap' : 'atlas.expandMap', {
										name: row.node.name,
									})}
									onClick={(e) => {
										e.stopPropagation();
										setExpandedFor(row.node.mapId, !row.expanded);
									}}
									style={{
										display: 'inline-flex',
										border: 'none',
										background: 'transparent',
										cursor: 'pointer',
										padding: 0,
									}}
								>
									<Icon
										name={row.expanded ? 'chevron-down' : 'chevron-right'}
										size={13}
										color={T.ter}
									/>
								</button>
							) : (
								<span style={{ width: 13, flex: '0 0 auto' }} />
							)}
							<span
								style={{
									font: `12.5px ${T.sans}`,
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								{row.node.name}
							</span>
						</div>
					);
				})}
				{rows.length === 0 && query !== '' && (
					<div style={{ font: `12px ${T.sans}`, color: T.ter, padding: '4px 6px' }}>
						{t('atlas.mapHierarchyEmpty', { query: filter.trim() })}
					</div>
				)}
			</div>
		</Panel>
	);
}
