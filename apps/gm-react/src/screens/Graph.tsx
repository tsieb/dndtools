import './graph/graph.css';
import { GraphSearch } from './graph/Search';
import { GraphInspector } from './graph/Inspector';
import { GraphHealth } from './graph/Health';
import {
	memo,
	useDeferredValue,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
	buildGraphVisualizationBase,
	filterGraphVisualization,
	isMaturitySignalReached,
	type GraphVisualization,
	type GraphVizNode,
} from '@dndtools/core';
import { Button, EmptyState, HelpTip, Icon, Toaster } from '../ds';
import { Page, Seg, T } from '../app/screen-kit';
import { useViewport } from '../app/useViewport';
import { useRuntime } from '../runtime/RuntimeContext';
import { useI18n } from '../i18n';
import { ImportPanel } from './knowledge/ImportPanel';
import { parseArchive } from './knowledge/markdown';
import {
	ClusterHulls,
	ClusterToggle,
	DormantArcsPanel,
	useClusterHulls,
	useGraphClusters,
} from './graph/clusters';
import { indexConnections, limitCanvasNodes, showNodeLabel, walkNode } from './graph/interaction';
import { GraphCanvasNode, edgeKeys, nodeDiameter, type CanvasNodeHandlers } from './graph/nodes';
import {
	KIND_COLOR,
	KIND_ICON,
	KIND_LABEL,
	positioned,
	useGraphHealth,
	useLabelPlacement,
	useOpenGraphNode,
} from './graph/presentation';

/**
 * Graph & Search — the relationship graph canvas + faceted search, wired to the live Processing
 * Core. Every node/edge/facet comes from `getGraphVisualizationForActor` (its base + filter halves),
 * the actor-filtered GRAPH-004 read model: the DM/Player toggle simply re-runs the read AS a different
 * actor, so a player view drops every DM-only node the data layer hides (the leak-proofing contract,
 * proven by the read itself, not by client-side filtering). Health is the DM-only GRAPH-007 report;
 * a player sees only the GENERALIZED coarse-band summary (GRAPH-007 AC3). The graph is read-only
 * intelligence — a node's Open action deep-links to the entity's own surface (`/knowledge/:id`,
 * `/atlas?map=&poi=`); there is no node-authoring command here.
 *
 * RC-KNW-6.5 — names sit BELOW each node (two lines at most, the full title in the tooltip and the
 * accessible name) and a collision pass nudges any that would overprint. On a phone the results list
 * is the graph and the canvas waits behind "Show map". An empty vault gets one empty state, and the
 * analytics (filter, cluster hulls, dormant arcs) wait for the RC-UX-3.5 graph signal.
 */

const DEFAULT_SOURCE_ID = 'local-vault';

// Its props are the memoized read plus state setters, so hover, focus and keyboard walks on the
// canvas no longer re-render every result row (RC-ENG-3.2).
const MemoGraphSearch = memo(GraphSearch);

export function Graph() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const viewport = useViewport();
	const isPhone = viewport === 'phone';
	const navigate = useNavigate();

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
	const [mapOpen, setMapOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [importBusy, setImportBusy] = useState(false);
	const [importMsg, setImportMsg] = useState<string | null>(null);
	const [importFailed, setImportFailed] = useState(false);
	// The importer replaces the empty state while open, so focus follows it in and back out.
	const emptyRef = useRef<HTMLDivElement>(null);
	const importWasOpen = useRef(false);
	useEffect(() => {
		const root = emptyRef.current;
		if (importOpen) root?.querySelector<HTMLElement>('textarea')?.focus();
		else if (importWasOpen.current)
			root?.querySelector<HTMLElement>('.graph-empty-import button')?.focus();
		importWasOpen.current = importOpen;
	}, [importOpen]);
	const nodeButtons = useRef(new Map<string, HTMLButtonElement>());
	// The mounted canvas, in state so the label pass re-binds when the phone/wide layouts swap it.
	const [canvasEl, setCanvasEl] = useState<HTMLElement | null>(null);

	const viewActorId = view === 'dm' ? dmId : playerId;

	const { content, maps, session, permissions } = runtime.state;
	// The vault-dependent half of the read is rebuilt only when the vault or viewpoint changes; each
	// search keystroke or facet click runs just the filter pass over it (RC-ENG-3.2).
	const vizBase = useMemo(
		() =>
			buildGraphVisualizationBase(
				content,
				maps,
				session,
				permissions,
				viewActorId,
				DEFAULT_SOURCE_ID,
			),
		[content, maps, session, permissions, viewActorId],
	);
	const listViz: GraphVisualization = useMemo(
		() =>
			filterGraphVisualization(vizBase, {
				kinds: facet === 'all' ? undefined : [facet as GraphVizNode['kind']],
				text: query.trim() || undefined,
			}),
		[vizBase, facet, query],
	);
	// The results list follows every keystroke. The canvas, its label pass and the count follow a
	// deferred query in an interruptible render, so typing commits the list first (RC-ENG-3.2).
	const canvasQuery = useDeferredValue(query);
	// Filtered on its own (not reused from the list) so its identity, and every canvas memo below,
	// holds through the urgent render.
	const viz: GraphVisualization = useMemo(
		() =>
			filterGraphVisualization(vizBase, {
				kinds: facet === 'all' ? undefined : [facet as GraphVizNode['kind']],
				text: canvasQuery.trim() || undefined,
			}),
		[vizBase, facet, canvasQuery],
	);

	// Health and clusters are whole-vault reports for the side panels and hull washes. Reading them from
	// a deferred state lets the graph itself commit first after a change; the panels follow in an
	// interruptible render instead of holding every command's update on a large vault (RC-ENG-3.2).
	const panelState = useDeferredValue(runtime.state);
	const health = useGraphHealth(panelState, view, dmId, playerId);
	// The same usage signal that puts Graph in the nav (three links): before it, a filter, cluster
	// hulls and a dormant-arcs report are analytics about a graph that does not exist yet.
	const signalReached = useMemo(() => isMaturitySignalReached('graph', panelState), [panelState]);

	const clusters = useGraphClusters(panelState, viewActorId);

	const connections = useMemo(() => indexConnections(viz), [viz]);
	// A large vault draws only part of itself (see `limitCanvasNodes`). The selection stays drawn (a node
	// clicked on the canvas already is). Admit the selection and focus anchor before capped neighbours.
	const canvasPool = useMemo(() => {
		const pinned = new Set<string>(sel ? [sel] : []);
		if (focusId) {
			pinned.add(focusId);
			for (const n of connections.get(focusId)?.neighbors ?? []) pinned.add(n);
		}
		return limitCanvasNodes(viz.nodes, pinned);
	}, [viz.nodes, connections, sel, focusId]);
	const nodes = useMemo(() => positioned(canvasPool), [canvasPool]);
	const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
	// Every result, drawn or not: the inspector lists a selection's links even to undrawn neighbours.
	const resultById = useMemo(
		() =>
			canvasPool === viz.nodes ? nodeById : Object.fromEntries(viz.nodes.map((n) => [n.id, n])),
		[canvasPool, viz.nodes, nodeById],
	);
	const { hulls, hullsOn, toggleHulls } = useClusterHulls(clusters.clusters, nodeById);
	const selNode = sel && nodeById[sel] ? nodeById[sel] : null;
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
	const canvasIds = useMemo(() => canvasNodes.map((n) => n.id), [canvasNodes]);
	const tabId = activeId && canvasIds.includes(activeId) ? activeId : canvasIds[0];
	const edgeKey = useMemo(() => edgeKeys(viz.edges), [viz.edges]);
	// Stable across renders so the memoized nodes only re-render when their own props change.
	const walkIds = useRef(canvasIds);
	useLayoutEffect(() => {
		walkIds.current = canvasIds;
	}, [canvasIds]);
	const nodeHandlers = useMemo<CanvasNodeHandlers>(
		() => ({
			register: (id, el) => {
				if (el) nodeButtons.current.set(id, el);
				else nodeButtons.current.delete(id);
			},
			focus: setActiveId,
			hover: setHoverId,
			walk: (id, e) => {
				const next = walkNode(walkIds.current, id, e.key);
				if (!next) return;
				e.preventDefault();
				nodeButtons.current.get(next)?.focus();
			},
			toggle: (id) => setSel((cur) => (cur === id ? null : id)),
		}),
		[],
	);
	// The kinds the actor COULD filter by, straight from the live facets (never reveals hidden content).
	const legendKinds = viz.facets.kinds;
	const showCanvas = !isPhone || mapOpen;
	// A node is named when the canvas has room for every name, or when it is the selection, one of its
	// neighbours, or the node under focus or pointer. On a phone only those emphasized nodes are named
	// unless the whole graph is small; the rail's canvas spans the page (graph.css) and names like
	// the desktop's.
	const labelled = canvasNodes.filter((n) =>
		showNodeLabel(
			canvasNodes.length,
			isPhone,
			n.id === sel ||
				n.id === activeId ||
				n.id === hoverId ||
				selectedConnections?.neighbors.has(n.id) === true,
		),
	);
	useLabelPlacement(
		canvasEl,
		showCanvas ? `${sel}|${labelled.map((n) => `${n.id}:${n.title}`).join('|')}` : '',
	);

	const openNode = useOpenGraphNode(viewActorId);

	// The empty state's importer: the same panel and the same `content.commit-import` Notes runs, so
	// "Import notes" opens it here rather than on another empty screen. Once notes land the graph
	// replaces the empty state, so the result is also announced as a toast.
	async function runImport(text: string, policy: string) {
		setImportBusy(true);
		setImportMsg(null);
		setImportFailed(false);
		try {
			const result = await runtime.dispatch({
				type: 'content.commit-import',
				actorId: dmId,
				payload: {
					sourceKind: 'markdown-archive',
					policy,
					files: parseArchive(text),
					appliedEntryIds: [],
				},
			});
			if (result.status === 'accepted') {
				const ev = result.events.find(
					(e) => (e as { kind?: string }).kind === 'content.import-committed',
				) as { createdItemIds?: string[]; overwrittenItemIds?: string[] } | undefined;
				const created = ev?.createdItemIds?.length ?? 0;
				const over = ev?.overwrittenItemIds?.length ?? 0;
				const message =
					over > 0
						? t('knowledge.importedWithOverwrites', { created, overwritten: over })
						: t('knowledge.imported', { created });
				setImportMsg(message);
				if (created > 0) Toaster.success(message);
			} else {
				setImportFailed(true);
				setImportMsg(result.rejection.message);
			}
		} catch (error) {
			setImportFailed(true);
			setImportMsg(error instanceof Error ? error.message : t('knowledge.importFailed'));
		} finally {
			setImportBusy(false);
		}
	}

	// One empty state for an empty vault, not a toolbar, a filter and an arcs report about nothing.
	if (view === 'dm' && viz.totalVisibleNodes === 0) {
		return (
			<Page max={1280}>
				<div ref={emptyRef} className="graph-surface">
					{/* The empty state's own title is an h3; this keeps the outline h1 → h2 → h3. */}
					<h2 className="graph-visually-hidden">{t('graph.canvas')}</h2>
					{/* While open the importer takes the empty state's place: one primary action at a time. */}
					{importOpen ? (
						<ImportPanel
							busy={importBusy}
							message={importMsg}
							failed={importFailed}
							onImport={(text, policy) => void runImport(text, policy)}
							onCancel={() => {
								setImportOpen(false);
								setImportMsg(null);
								setImportFailed(false);
							}}
						/>
					) : (
						<EmptyState
							illustration="graph-empty"
							title={t('graph.emptyDm')}
							description={t('graph.emptyVault.body')}
							action={
								<div className="graph-empty-actions">
									<Button
										variant="primary"
										icon="note-edit"
										onClick={() => navigate('/knowledge', { state: { create: true } })}
									>
										{t('graph.emptyVault.newNote')}
									</Button>
									<span className="graph-empty-import">
										<Button variant="secondary" icon="import" onClick={() => setImportOpen(true)}>
											{t('graph.emptyVault.import')}
										</Button>
									</span>
								</div>
							}
						/>
					)}
				</div>
			</Page>
		);
	}

	// graph canvas — real nodes (sized by visible degree) + real directed link edges
	const canvas: ReactNode = (
		<section
			ref={setCanvasEl}
			id="graph-canvas"
			aria-label={t('graph.canvas')}
			style={{
				position: 'relative',
				borderRadius: 'var(--radius-lg)',
				border: `0.0625rem solid ${T.bd}`,
				background: `radial-gradient(42.5rem 22.5rem at 60% 0%, ${T.accSub}, ${T.sunken} 70%)`,
				overflow: 'hidden',
				// A phone's canvas is taller than wide, so the ring has room for a name under its nodes.
				aspectRatio: nodes.length ? (isPhone ? '4/5' : '16/11') : undefined,
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
				<ClusterHulls hulls={focusAnchor || !signalReached ? [] : hulls} />
				{viz.edges.map((e, i) => {
					const a = nodeById[e.fromId];
					const b = nodeById[e.toId];
					if (!a || !b || (focusAnchor && e.fromId !== focusAnchor && e.toId !== focusAnchor))
						return null;
					const hot = selNode != null && (e.fromId === sel || e.toId === sel);
					return (
						<line
							key={edgeKey[i]}
							x1={a.x}
							y1={a.y}
							x2={b.x}
							y2={b.y}
							stroke={
								hot ? T.acc : e.relationship === 'poi-link' ? 'var(--color-status-info)' : T.bd
							}
							strokeWidth={hot ? 0.6 : 0.35}
							opacity={selNode && !hot ? 0.22 : 0.8}
						/>
					);
				})}
			</svg>
			{canvasNodes.map((n) => (
				<GraphCanvasNode
					key={n.id}
					id={n.id}
					title={n.title}
					kind={n.kind}
					degree={n.degree}
					x={n.x}
					y={n.y}
					selected={n.id === sel}
					dim={selNode != null && n.id !== sel && !selectedConnections?.neighbors.has(n.id)}
					tabbable={n.id === tabId}
					handlers={nodeHandlers}
				/>
			))}
			{/* The names, as one layer after every node so no circle paints over a name. Each sits
			    below its node, two lines at most; the node's aria-label and title carry the full
			    name. `data-graph-rank` orders the collision pass: the selection keeps its slot, then
			    the best-connected nodes. */}
			{labelled.map((n) => (
				<span
					key={n.id}
					className="graph-node-label"
					data-graph-label={n.id}
					data-graph-rank={n.id === sel ? Number.MAX_SAFE_INTEGER : n.degree}
					aria-hidden="true"
					style={{
						left: `${n.x}%`,
						top: `calc(${(n.y / 70) * 100}% + ${nodeDiameter(n.degree) / 2}px)`,
					}}
				>
					{n.title}
				</span>
			))}
			{!focusAnchor && signalReached && <ClusterToggle on={hullsOn} onToggle={toggleHulls} />}
		</section>
	);

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
							shown: nodes.length,
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
					{!isPhone && canvas}

					{/* search + inspector + health. Search comes FIRST on purpose: the "Selected" panel used to
				    be the rail's first child, so clicking a search result inserted ~250px of inspector
				    ABOVE the result list and the row the user had just aimed at jumped out from under the
				    pointer — the next click landed on a different node. Keeping DOM order == visual order
				    also keeps the tab sequence honest (an `order:` swap would not have). */}
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
						{/* RC-KNW-6.5 — on a phone the results list below is the graph; the canvas opens
						    above it on request and names the selection and its neighbours. */}
						{isPhone && (
							<Button
								variant="secondary"
								icon="new-map"
								aria-expanded={mapOpen}
								aria-controls={mapOpen ? 'graph-canvas' : undefined}
								onClick={() => setMapOpen((open) => !open)}
								style={{ alignSelf: 'flex-start' }}
							>
								{mapOpen ? t('graph.map.hide') : t('graph.map.show')}
							</Button>
						)}
						{isPhone && showCanvas && canvas}
						<MemoGraphSearch
							filterable={signalReached}
							view={view}
							viz={listViz}
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
								nodeById={resultById}
								facet={facet}
								query={query}
								setSel={setSel}
								openNode={openNode}
							/>
						)}

						{signalReached && (
							<DormantArcsPanel report={clusters} selectedId={sel} onSelect={setSel} />
						)}

						<GraphHealth health={health} />
					</div>
				</div>
			</div>
		</Page>
	);
}
