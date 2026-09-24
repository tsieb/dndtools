import './graph/graph.css';
import { GraphSearch } from './graph/Search';
import { GraphInspector } from './graph/Inspector';
import { GraphHealth } from './graph/Health';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
	getGraphVisualizationForActor,
	type GraphVisualization,
	type GraphVizNode,
} from '@dndtools/core';
import { Button, EmptyState, HelpTip, Icon } from '../ds';
import { Page, Seg, T } from '../app/screen-kit';
import { useViewport } from '../app/useViewport';
import { useRuntime } from '../runtime/RuntimeContext';
import { useI18n } from '../i18n';
import {
	ClusterHulls,
	ClusterToggle,
	DormantArcsPanel,
	useClusterHulls,
	useGraphClusters,
} from './graph/clusters';
import { indexConnections, showNodeLabel, walkNode } from './graph/interaction';
import {
	KIND_COLOR,
	KIND_ICON,
	KIND_LABEL,
	positioned,
	useGraphHealth,
	useOpenGraphNode,
} from './graph/presentation';

/**
 * Graph & Search — the relationship graph canvas + faceted search, wired to the live Processing
 * Core. Every node/edge/facet comes from `getGraphVisualizationForActor`,
 * the actor-filtered GRAPH-004 read model: the DM/Player toggle simply re-runs the read AS a different
 * actor, so a player view drops every DM-only node the data layer hides (the leak-proofing contract,
 * proven by the read itself, not by client-side filtering). Health is the DM-only GRAPH-007 report;
 * a player sees only the GENERALIZED coarse-band summary (GRAPH-007 AC3). The graph is read-only
 * intelligence — a node's Open action deep-links to the entity's own surface (`/knowledge/:id`,
 * `/atlas?map=&poi=`); there is no node-authoring command here.
 */

const DEFAULT_SOURCE_ID = 'local-vault';

export function Graph() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const viewport = useViewport();
	const isPhone = viewport === 'phone';

	const dmId = runtime.defaultActorId;
	const actors = runtime.state.permissions.actors;
	// The player POV is a REAL registered player actor; the toggle reads the graph AS them (no global
	// "view as" side-effect, so other screens are untouched). Fall back to the DM if none is registered.
	const playerId = useMemo(
		() => Object.values(actors).find((a) => a.role === 'player')?.id ?? dmId,
		[actors, dmId],
	);

	const [view, setView] = useState<'dm' | 'player'>('dm');
	const [facet, setFacet] = useState('all');
	const [query, setQuery] = useState('');
	const [sel, setSel] = useState<string | null>(null);
	const [focusId, setFocusId] = useState<string | null>(null);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [hoverId, setHoverId] = useState<string | null>(null);
	const nodeButtons = useRef(new Map<string, HTMLButtonElement>());

	const viewActorId = view === 'dm' ? dmId : playerId;

	const viz: GraphVisualization = useMemo(
		() =>
			getGraphVisualizationForActor(
				runtime.state.content,
				runtime.state.maps,
				runtime.state.session,
				runtime.state.permissions,
				viewActorId,
				DEFAULT_SOURCE_ID,
				{
					kinds: facet === 'all' ? undefined : [facet as GraphVizNode['kind']],
					text: query.trim() || undefined,
				},
			),
		[runtime.state, viewActorId, facet, query],
	);

	const health = useGraphHealth(view, dmId, playerId);

	const clusters = useGraphClusters(runtime.state, viewActorId);

	const nodes = useMemo(() => positioned(viz.nodes), [viz.nodes]);
	const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
	const { hulls, hullsOn, toggleHulls } = useClusterHulls(clusters.clusters, nodeById);
	const selNode = sel && nodeById[sel] ? nodeById[sel] : null;
	const connections = useMemo(() => indexConnections(viz), [viz]);
	const selectedConnections = selNode ? connections.get(selNode.id) : undefined;
	const selEdges = selectedConnections?.edges ?? [];
	const focusAnchor = focusId && nodeById[focusId] ? focusId : null;
	const canvasNodes = useMemo(
		() =>
			focusAnchor
				? nodes.filter(
						(n) => n.id === focusAnchor || connections.get(focusAnchor)?.neighbors.has(n.id),
					)
				: nodes,
		[nodes, connections, focusAnchor],
	);
	const canvasIds = canvasNodes.map((n) => n.id);
	const tabId = activeId && canvasIds.includes(activeId) ? activeId : canvasIds[0];
	// The kinds the actor COULD filter by, straight from the live facets (never reveals hidden content).
	const legendKinds = viz.facets.kinds;

	const openNode = useOpenGraphNode(viewActorId);

	return (
		<Page max={1280}>
			<div className="graph-surface">
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-3)',
						marginBottom: 'var(--space-4)',
						flexWrap: 'wrap',
					}}
				>
					<Seg
						value={view}
						ariaLabel={t('graph.viewpoint')}
						onChange={(v: string) => {
							setView(v as 'dm' | 'player');
							setSel(null);
							setFocusId(null);
						}}
						options={[
							{ value: 'dm', label: t('graph.view.dm') },
							// Disable when no player actor is registered — otherwise the fallback would render DM
							// data under the "Player view" label (playerId === dmId).
							{ value: 'player', label: t('graph.view.player'), disabled: playerId === dmId },
						]}
					/>
					{/* A permanently greyed radio with no reason is a dead end: nothing told the DM that
				    registering a player is what enables it. Rendered beside the Seg rather than as a
				    `title`, which is unreachable on touch and to screen readers. */}
					{playerId === dmId && (
						<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
							{t('graph.needPlayer')}
						</span>
					)}
					{/* This count is the ONLY feedback that a filter, a search or the DM/player view switch
				    did anything. It is present from mount, so role=status announces each change. */}
					<span role="status" style={{ font: `var(--text-base) ${T.sans}`, color: T.ter }}>
						{t('graph.showing', {
							shown: viz.nodes.length,
							total: viz.totalVisibleNodes,
						})}
						{viz.partial ? t('graph.partial') : ''}
					</span>
					<Button
						variant="secondary"
						size="sm"
						aria-pressed={focusAnchor !== null}
						disabled={!selNode && !focusAnchor}
						onClick={() => setFocusId(focusAnchor ? null : (selNode?.id ?? null))}
						onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
							if (e.key === 'Escape') {
								setFocusId(null);
								setSel(null);
							}
						}}
					>
						{focusAnchor ? t('graph.focus.exit') : t('graph.focus.enter')}
					</Button>
					<HelpTip
						id="graph-walk-help"
						style={{ font: `var(--text-base) ${T.sans}`, color: T.ter }}
					>
						{t('graph.walkHelp')}
					</HelpTip>
					<div style={{ flex: 1 }} />
					<div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
						{legendKinds.map((k) => (
							<span
								key={k}
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 'var(--space-1-5)',
									font: `var(--text-sm) ${T.sans}`,
									color: T.sub,
								}}
							>
								<Icon name={KIND_ICON[k] ?? 'tag'} size="sm" color={KIND_COLOR[k]} />
								{KIND_LABEL[k] ? t(KIND_LABEL[k]) : k}
							</span>
						))}
					</div>
				</div>

				<div
					// Escape bubbles up from whichever node button has focus, so a keyboard user can drop
					// the selection without hunting for the node they last pressed. It lives on the GRID,
					// not the canvas: half the selection entry points are the search rows in the right
					// rail, and from there Escape used to do nothing. The search input keeps its own
					// Escape (clear the query), so skip it here.
					onKeyDown={(e) => {
						if (
							e.key === 'Escape' &&
							(sel !== null || focusAnchor !== null) &&
							!(e.target instanceof HTMLInputElement)
						) {
							e.stopPropagation();
							setSel(null);
							setFocusId(null);
						}
					}}
					className="graph-layout"
					style={isPhone ? { gridTemplateColumns: '1fr' } : undefined}
				>
					{/* graph canvas — real nodes (sized by visible degree) + real directed link edges */}
					<section
						aria-label={t('graph.canvas')}
						style={{
							position: 'relative',
							borderRadius: 'var(--radius-lg)',
							border: `0.0625rem solid ${T.bd}`,
							background: `radial-gradient(42.5rem 22.5rem at 60% 0%, ${T.accSub}, ${T.sunken} 70%)`,
							overflow: 'hidden',
							aspectRatio: nodes.length ? '16/11' : undefined,
							boxShadow: T.smd,
						}}
					>
						<h2 className="graph-visually-hidden">{t('graph.canvas')}</h2>
						{nodes.length === 0 && (
							<EmptyState
								inset
								illustration="graph-empty"
								title={
									query.trim() || facet !== 'all'
										? t('graph.noResultsFilter')
										: view === 'player'
											? t('graph.emptyPlayer')
											: t('graph.emptyDm')
								}
								action={
									query.trim() || facet !== 'all' ? (
										<Button
											onClick={() => {
												setQuery('');
												setFacet('all');
											}}
										>
											{t('graph.clearFilters')}
										</Button>
									) : undefined
								}
							/>
						)}

						{/* preserveAspectRatio="none" stretches the viewBox to the container so SVG edge
					    coordinates line up with the percentage-positioned node buttons ((x/100)%, (y/70)%)
					    at any aspect ratio. */}
						<svg
							aria-hidden="true"
							viewBox="0 0 100 70"
							preserveAspectRatio="none"
							style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
						>
							{/* RC-KNW-4.1 — cluster hulls, drawn FIRST so they sit behind every edge and node. */}
							<ClusterHulls hulls={focusAnchor ? [] : hulls} />
							{viz.edges.map((e, i) => {
								const a = nodeById[e.fromId];
								const b = nodeById[e.toId];
								if (!a || !b || (focusAnchor && e.fromId !== focusAnchor && e.toId !== focusAnchor))
									return null;
								const hot = selNode != null && (e.fromId === sel || e.toId === sel);
								return (
									<line
										key={`${e.fromId}-${e.toId}-${i}`}
										x1={a.x}
										y1={a.y}
										x2={b.x}
										y2={b.y}
										stroke={
											hot
												? T.acc
												: e.relationship === 'poi-link'
													? 'var(--color-status-info)'
													: T.bd
										}
										strokeWidth={hot ? 0.6 : 0.35}
										opacity={selNode && !hot ? 0.22 : 0.8}
									/>
								);
							})}
						</svg>
						{canvasNodes.map((n) => {
							const col = KIND_COLOR[n.kind] ?? T.sub;
							const dim =
								selNode != null && n.id !== sel && !selectedConnections?.neighbors.has(n.id);
							const d = Math.max(48, Math.min(70, 48 + n.degree * 4));
							return (
								<button
									key={n.id}
									data-testid="graph-node"
									ref={(el: HTMLButtonElement | null) => {
										if (el) nodeButtons.current.set(n.id, el);
										else nodeButtons.current.delete(n.id);
									}}
									tabIndex={n.id === tabId ? 0 : -1}
									onFocus={() => setActiveId(n.id)}
									onMouseEnter={() => setHoverId(n.id)}
									onMouseLeave={() => setHoverId(null)}
									aria-describedby="graph-walk-help"
									onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
										const next = walkNode(canvasIds, n.id, e.key);
										if (!next) return;
										e.preventDefault();
										nodeButtons.current.get(next)?.focus();
									}}
									type="button"
									// Toggle, not latch. `setSel(null)` existed nowhere, so the first click on any
									// node emphasized its neighbors and dimmed every non-incident edge to
									// 0.22 for the rest of the session with no way back. Atlas's POI list already
									// toggles the same way.
									aria-pressed={n.id === sel}
									onClick={() => setSel((cur) => (cur === n.id ? null : n.id))}
									title={t('graph.nodeTitle', {
										title: n.title,
										kind: KIND_LABEL[n.kind] ? t(KIND_LABEL[n.kind]) : n.kind,
										count: n.degree,
									})}
									aria-label={t('graph.nodeLabel', {
										title: n.title,
										kind: KIND_LABEL[n.kind] ? t(KIND_LABEL[n.kind]) : n.kind,
										count: n.degree,
									})}
									style={{
										position: 'absolute',
										left: `${n.x}%`,
										top: `${(n.y / 70) * 100}%`,
										transform: 'translate(-50%,-50%)',
										width: d,
										height: d,
										borderRadius: 'var(--radius-full)',
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										textAlign: 'center',
										padding: 'var(--space-1)',
										opacity: 1,
										filter: dim ? 'grayscale(1)' : undefined,
										border: `0.09375rem solid ${n.id === sel ? T.acc : col}`,
										background: `color-mix(in srgb, ${col} ${n.id === sel ? 28 : 16}%, ${T.surf})`,
										color: T.ink,
										boxShadow: n.id === sel ? T.smd : 'none',
										transition: 'opacity var(--duration-fast) var(--easing-standard)',
									}}
								>
									<span
										style={{
											pointerEvents: 'none',
											// Labels use the readable metadata token; dense canvases reveal them on focus.
											font: `600 var(--text-sm) ${T.sans}`,
											lineHeight: 1.05,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}
									>
										{showNodeLabel(
											canvasNodes.length,
											viewport !== 'desktop',
											n.id === sel || n.id === activeId || n.id === hoverId,
										) ? (
											n.title
										) : (
											<Icon name={KIND_ICON[n.kind] ?? 'tag'} size={15} />
										)}
									</span>
								</button>
							);
						})}
						{!focusAnchor && <ClusterToggle on={hullsOn} onToggle={toggleHulls} />}
					</section>

					{/* search + inspector + health. Search comes FIRST on purpose: the "Selected" panel used to
				    be the rail's first child, so clicking a search result inserted ~250px of inspector
				    ABOVE the result list and the row the user had just aimed at jumped out from under the
				    pointer — the next click landed on a different node. Keeping DOM order == visual order
				    also keeps the tab sequence honest (an `order:` swap would not have). */}
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
						<GraphSearch
							view={view}
							viz={viz}
							query={query}
							setQuery={setQuery}
							facet={facet}
							setFacet={setFacet}
							setFocusId={setFocusId}
							sel={sel}
							setSel={setSel}
						/>
						{selNode && (
							<GraphInspector
								selNode={selNode}
								selEdges={selEdges}
								nodeById={nodeById}
								facet={facet}
								query={query}
								setSel={setSel}
								openNode={openNode}
							/>
						)}

						<DormantArcsPanel report={clusters} selectedId={sel} onSelect={setSel} />

						<GraphHealth health={health} />
					</div>
				</div>
			</div>
		</Page>
	);
}
