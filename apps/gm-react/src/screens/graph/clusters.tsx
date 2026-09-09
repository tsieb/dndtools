import { useMemo, useState } from 'react';
import {
	getGraphClustersForActor,
	type CoreStateSlice,
	type GraphCluster,
	type GraphClusterReport,
} from '@dndtools/core';
import { Badge } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';

/**
 * RC-KNW-4.1 — CLUSTERS AND MOMENTUM on the Graph screen: the cluster HULLS drawn behind the canvas,
 * the toggle that switches them off, and the "Dormant arcs" panel.
 *
 * All of the intelligence is computed in the Processing Core (`getGraphClustersForActor`) — label
 * propagation over the actor-visible resolved-link graph, with momentum = recent mutations ÷ cluster
 * size. Nothing here re-derives or second-guesses it: this file is geometry and presentation only
 * (Architecture Contract 1). Because the read is ACTOR-FILTERED, the arcs a player viewpoint renders
 * are computed from a player's visible notes, so no hull or dormant row can name — or be widened by —
 * a note that viewpoint cannot see.
 */

/** A positioned canvas node, as `Graph.tsx` lays them out (viewBox space: x 0–100, y 0–70). */
interface PositionedNode {
	id: string;
	x: number;
	y: number;
}

/** One drawable hull: the padded outline plus the raw member positions it was built from. */
export interface ClusterHull {
	id: string;
	color: string;
	points: { x: number; y: number }[];
	raw: { x: number; y: number }[];
}

// The hull palette. Arcs are told apart by the same semantic accent/status tokens the node kinds already
// use, cycled by cluster index; a hull is a translucent wash, never a solid fill, so a node's own kind
// colour still reads through it. Hulls are decorative: the arcs are also listed as text in the rail, so
// nothing here is information conveyed by colour alone (WCAG 1.4.1).
const CLUSTER_COLORS = [T.acc, T.info, T.ok, T.warn] as const;

/** Convex hull (monotone chain) of a cluster's node positions, in the canvas' 100×70 viewBox space. */
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
	if (points.length < 3) return points;
	const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	const cross = (
		o: { x: number; y: number },
		a: { x: number; y: number },
		b: { x: number; y: number },
	) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const build = (pts: { x: number; y: number }[]) => {
		const out: { x: number; y: number }[] = [];
		for (const p of pts) {
			while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0)
				out.pop();
			out.push(p);
		}
		out.pop();
		return out;
	};
	return [...build(sorted), ...build([...sorted].reverse())];
}

/**
 * Grow a hull outward from its centroid so it wraps the node circles rather than cutting through their
 * centres. `pad` is in viewBox units; the nodes are drawn at 34–70 CSS px, so this is a visual
 * approximation, deliberately generous.
 */
function padHull(hull: { x: number; y: number }[], pad: number): { x: number; y: number }[] {
	if (hull.length === 0) return hull;
	const cx = hull.reduce((sum, p) => sum + p.x, 0) / hull.length;
	const cy = hull.reduce((sum, p) => sum + p.y, 0) / hull.length;
	return hull.map((p) => {
		const dx = p.x - cx;
		const dy = p.y - cy;
		const len = Math.hypot(dx, dy) || 1;
		return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
	});
}

/**
 * Build the drawable hulls. A hull wraps only the members CURRENTLY on the canvas: under a facet or a
 * search the arc legitimately shrinks, and drawing it at full size would claim nodes that are not there.
 * An arc with fewer than two nodes on screen gets no hull at all — a circle round one node says nothing.
 */
export function buildClusterHulls(
	clusters: readonly GraphCluster[],
	nodeById: Record<string, PositionedNode | undefined>,
): ClusterHull[] {
	return clusters
		.map((cluster, i) => {
			const raw = cluster.memberIds
				.map((id) => nodeById[id])
				.filter((n): n is PositionedNode => Boolean(n))
				.map((n) => ({ x: n.x, y: n.y }));
			return {
				id: cluster.id,
				color: CLUSTER_COLORS[i % CLUSTER_COLORS.length]!,
				points: padHull(convexHull(raw), 5),
				raw,
			};
		})
		.filter((hull) => hull.raw.length >= 2);
}

/**
 * The actor-filtered cluster + momentum report for the viewpoint the screen is currently reading as.
 * `now` is handed to the core rather than read inside it, so the report stays a pure function of the
 * instant it was asked for.
 */
export function useGraphClusters(state: CoreStateSlice, actorId: string): GraphClusterReport {
	return useMemo(
		() =>
			getGraphClustersForActor(state.content, state.permissions, actorId, new Date().toISOString()),
		[state, actorId],
	);
}

/**
 * Hull geometry plus its on/off state. Hulls start ON — an arc you have to switch on is an arc you never
 * see — but stay switchable, because on a dense vault the washes compete with the edges.
 */
export function useClusterHulls(
	clusters: readonly GraphCluster[],
	nodeById: Record<string, PositionedNode | undefined>,
): { hulls: ClusterHull[]; hullsOn: boolean; toggleHulls: () => void } {
	const [hullsOn, setHullsOn] = useState(true);
	const hulls = useMemo(
		() => (hullsOn ? buildClusterHulls(clusters, nodeById) : []),
		[clusters, nodeById, hullsOn],
	);
	return { hulls, hullsOn, toggleHulls: () => setHullsOn((on) => !on) };
}

/**
 * The hulls themselves. `aria-hidden`: the shapes carry no information of their own — the same arcs are
 * listed as text in the Dormant arcs panel — and an unlabelled decorative polygon in the reading order
 * would only be noise.
 */
export function ClusterHulls({ hulls }: { hulls: readonly ClusterHull[] }) {
	return (
		<g aria-hidden="true">
			{hulls.map((hull) =>
				hull.points.length >= 3 ? (
					<polygon
						key={hull.id}
						points={hull.points.map((p) => `${p.x},${p.y}`).join(' ')}
						fill={`color-mix(in srgb, ${hull.color} 12%, transparent)`}
						stroke={`color-mix(in srgb, ${hull.color} 40%, transparent)`}
						strokeWidth={0.4}
						strokeLinejoin="round"
					/>
				) : (
					// A two-note arc has no polygon — draw the pair as a single fat capsule.
					<line
						key={hull.id}
						x1={hull.raw[0]!.x}
						y1={hull.raw[0]!.y}
						x2={hull.raw[1]!.x}
						y2={hull.raw[1]!.y}
						stroke={`color-mix(in srgb, ${hull.color} 14%, transparent)`}
						strokeWidth={9}
						strokeLinecap="round"
					/>
				),
			)}
		</g>
	);
}

/**
 * The hull switch. It sits ON the canvas, beside what it controls, rather than in the toolbar above: on a
 * phone one more toolbar chip pushed the whole search rail below the fold. A real toggle, not a latch —
 * `aria-pressed` says which way it is, and a button needs no extra keyboard wiring.
 */
export function ClusterToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
	const { t } = useI18n();
	return (
		<button
			type="button"
			aria-pressed={on}
			data-testid="graph-clusters-toggle"
			onClick={onToggle}
			style={{
				position: 'absolute',
				top: 10,
				right: 10,
				font: `11.5px ${T.sans}`,
				padding: '4px 9px',
				borderRadius: 20,
				cursor: 'pointer',
				border: `1px solid ${on ? T.accBd : T.bd}`,
				// Solid, never the gradient behind it: the label has to stay legible wherever a node sits.
				background: on ? T.accSub : T.surf,
				color: on ? T.acc : T.sub,
			}}
		>
			{t('graph.clusters.toggle')}
		</button>
	);
}

/**
 * DORMANT ARCS — clusters of linked notes where nothing moved inside the recency window. Momentum is
 * `recent mutations ÷ cluster size`, so a large arc with one edit does not out-rank a small one that is
 * genuinely moving, and the list is ordered oldest-touched first: the arc most owed a scene comes top.
 */
export function DormantArcsPanel({
	report,
	selectedId,
	onSelect,
}: {
	report: GraphClusterReport;
	selectedId: string | null;
	onSelect: (updater: (current: string | null) => string | null) => void;
}) {
	const { t, formatRelativeTime } = useI18n();
	// Arcs, not notes: a lone unlinked note is not a storyline, so it is not counted here either.
	const activeArcs = report.clusters.filter((c) => c.size > 1 && !c.dormant).length;
	return (
		<Panel
			title={t('graph.dormant.title')}
			action={<Badge status="neutral">{t('graph.arcs', { count: activeArcs })}</Badge>}
		>
			<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
				{t('graph.dormant.intro', { days: report.recentWindowDays })}
			</div>
			{report.dormantArcs.length === 0 ? (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{t('graph.dormant.empty')}</div>
			) : (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 8,
						maxHeight: 260,
						overflowY: 'auto',
					}}
				>
					{report.dormantArcs.map((arc) => (
						<button
							key={arc.id}
							type="button"
							data-testid="graph-dormant-arc"
							// Selecting the ANCHOR is the honest action: it is a note that exists on this
							// canvas, so the selection dims to the arc's own neighbourhood instead of
							// pretending a cluster is a navigable entity of its own.
							aria-pressed={arc.anchorId === selectedId}
							onClick={() => onSelect((cur) => (cur === arc.anchorId ? null : arc.anchorId))}
							style={{
								display: 'block',
								width: '100%',
								textAlign: 'left',
								padding: '9px 10px',
								border: `1px solid ${arc.anchorId === selectedId ? T.accBd : T.bd}`,
								borderRadius: 9,
								background: arc.anchorId === selectedId ? T.accSub : T.surf,
								cursor: 'pointer',
							}}
						>
							<div
								style={{
									font: `600 12.5px ${T.sans}`,
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								{arc.label}
							</div>
							<div style={{ font: `10.5px ${T.sans}`, color: T.ter, marginTop: 2 }}>
								{t('graph.dormant.meta', {
									count: arc.size,
									when: arc.lastTouchedAt
										? formatRelativeTime(new Date(arc.lastTouchedAt))
										: t('graph.dormant.never'),
								})}
							</div>
						</button>
					))}
				</div>
			)}
		</Panel>
	);
}
