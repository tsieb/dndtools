import { memo, type KeyboardEvent } from 'react';
import type { GraphVizNode } from '@dndtools/core';
import { Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { KIND_COLOR, KIND_ICON, KIND_LABEL } from './presentation';

/**
 * RC-ENG-3.2 — the Graph screen's canvas node as a memoized component. Before this split every
 * command, hover or selection re-rendered every node from `Graph`. It takes primitive props plus
 * id-keyed callbacks that `Graph` keeps stable, so only the nodes whose own props moved re-render.
 * The markup is RC-KNW-6.5's: the circle carries the icon, and its name is drawn in the label layer.
 */

/** Stable, id-keyed handlers shared by every canvas node. */
export interface CanvasNodeHandlers {
	register: (id: string, el: HTMLButtonElement | null) => void;
	focus: (id: string) => void;
	hover: (id: string | null) => void;
	walk: (id: string, e: KeyboardEvent<HTMLButtonElement>) => void;
	toggle: (id: string) => void;
}

/** The diameter says how connected a node is; the name lives outside it, so a long title never
 * stretches or squeezes the circle. 48px at least: the node is a touch target. */
export const nodeDiameter = (degree: number) => Math.max(48, Math.min(72, 48 + degree * 4));

interface CanvasNodeProps {
	id: string;
	title: string;
	kind: GraphVizNode['kind'];
	degree: number;
	x: number;
	y: number;
	selected: boolean;
	dim: boolean;
	tabbable: boolean;
	handlers: CanvasNodeHandlers;
}

export const GraphCanvasNode = memo(function GraphCanvasNode({
	id,
	title,
	kind,
	degree,
	x,
	y,
	selected,
	dim,
	tabbable,
	handlers,
}: CanvasNodeProps) {
	const { t } = useI18n();
	const col = KIND_COLOR[kind] ?? T.sub;
	const d = nodeDiameter(degree);
	const describe = { title, kind: KIND_LABEL[kind] ? t(KIND_LABEL[kind]) : kind, count: degree };
	return (
		<button
			data-testid="graph-node"
			data-graph-node={id}
			ref={(el: HTMLButtonElement | null) => handlers.register(id, el)}
			tabIndex={tabbable ? 0 : -1}
			onFocus={() => handlers.focus(id)}
			onMouseEnter={() => handlers.hover(id)}
			onMouseLeave={() => handlers.hover(null)}
			aria-describedby="graph-walk-help"
			onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => handlers.walk(id, e)}
			type="button"
			// Toggle, not latch. `setSel(null)` existed nowhere, so the first click on any
			// node emphasized its neighbors and dimmed every non-incident edge to
			// 0.22 for the rest of the session with no way back. Atlas's POI list already
			// toggles the same way.
			aria-pressed={selected}
			onClick={() => handlers.toggle(id)}
			title={t('graph.nodeTitle', describe)}
			aria-label={t('graph.nodeLabel', describe)}
			style={{
				position: 'absolute',
				left: `${x}%`,
				top: `${(y / 70) * 100}%`,
				transform: 'translate(-50%,-50%)',
				width: d,
				height: d,
				borderRadius: 'var(--radius-full)',
				cursor: 'pointer',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: 'var(--space-1)',
				opacity: 1,
				filter: dim ? 'grayscale(1)' : undefined,
				border: `0.09375rem solid ${selected ? T.acc : col}`,
				background: `color-mix(in srgb, ${col} ${selected ? 28 : 16}%, ${T.surf})`,
				color: T.ink,
				boxShadow: selected ? T.smd : 'none',
				transition: 'opacity var(--duration-fast) var(--easing-standard)',
			}}
		>
			<Icon name={KIND_ICON[kind] ?? 'tag'} size={15} />
		</button>
	);
});

/**
 * An edge key that survives insertions. The old `${from}-${to}-${index}` key shifted for every edge
 * after a new one, so one added link remounted thousands of `<line>`s. Repeats of the same pair keep
 * an occurrence suffix, which is stable as long as their relative order is.
 */
export function edgeKeys(edges: readonly { fromId: string; toId: string; relationship: string }[]) {
	const seen = new Map<string, number>();
	return edges.map((e) => {
		const base = `${e.fromId}-${e.toId}-${e.relationship}`;
		const n = seen.get(base) ?? 0;
		seen.set(base, n + 1);
		return n === 0 ? base : `${base}-${n}`;
	});
}
