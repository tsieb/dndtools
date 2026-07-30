import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	getGraphVisualizationForActor,
	getGraphHealthForDm,
	getMapViewForActor,
	getPlayerScopedHealthSummary,
	listMapsForActor,
	type GraphVisualization,
	type GraphVizNode,
} from '@dndtools/core';
import { Badge, Button, Icon, VisibilityChip } from '../ds';
import { Page, Panel, Seg, T, eb } from '../app/screen-kit';
import { useViewport } from '../app/useViewport';
import { useRuntime } from '../runtime/RuntimeContext';

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

// Real GraphVizNode.kind is note | object | map | poi (NOT the design prototype's character/place/
// faction). Colors, icons and labels are remapped to those; the legend is built from the live facets.
const KIND_COLOR: Record<string, string> = {
	note: 'var(--color-status-info)',
	object: T.acc,
	map: T.ok,
	poi: 'var(--color-status-warning)',
};
const KIND_ICON: Record<string, string> = {
	note: 'knowledge-book',
	object: 'tag',
	map: 'new-map',
	poi: 'globe',
};
const KIND_LABEL: Record<string, string> = {
	note: 'Note',
	object: 'Story entry',
	map: 'Map',
	poi: 'Point of interest',
};
const REL_LABEL: Record<string, string> = { wikilink: 'links to', 'poi-link': 'map link' };
const BAND_TONE: Record<string, string> = {
	none: 'neutral',
	few: 'success',
	several: 'warning',
	many: 'error',
};
// Player-facing health bands arrive as machine tokens; render the spoken versions.
const BAND_LABEL: Record<string, string> = {
	none: 'None',
	few: 'A few',
	several: 'Several',
	many: 'Many',
	low: 'Low',
	moderate: 'Moderate',
	good: 'Good',
	excellent: 'Excellent',
};

/** Deterministic, force-free ellipse layout — the core graph carries no coordinates (it is a pure model). */
function positioned(nodes: GraphVizNode[]): (GraphVizNode & { x: number; y: number })[] {
	const n = nodes.length;
	const cx = 50;
	const cy = 35;
	const rx = 38;
	const ry = 26;
	return nodes.map((node, i) => {
		if (n <= 1) return { ...node, x: cx, y: cy };
		const angle = (2 * Math.PI * i) / n - Math.PI / 2;
		return { ...node, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
	});
}

function HealthRow({ label, count }: { label: string; count: number }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				font: `12px ${T.sans}`,
				color: T.sub,
			}}
		>
			<span style={{ flex: 1 }}>{label}</span>
			<Badge status={count === 0 ? 'success' : count <= 3 ? 'warning' : 'error'}>{count}</Badge>
		</div>
	);
}

export function Graph() {
	const runtime = useRuntime();
	const isPhone = useViewport() === 'phone';
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

	const health = useMemo(() => {
		const now = new Date().toISOString();
		return view === 'dm'
			? {
					kind: 'dm' as const,
					report: getGraphHealthForDm(runtime.state.content, runtime.state.permissions, dmId, now),
				}
			: {
					kind: 'player' as const,
					summary: getPlayerScopedHealthSummary(
						runtime.state.content,
						runtime.state.permissions,
						playerId,
						now,
					),
				};
	}, [runtime.state, view, dmId, playerId]);

	const nodes = useMemo(() => positioned(viz.nodes), [viz.nodes]);
	const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
	const selNode = sel && nodeById[sel] ? nodeById[sel] : null;
	const selEdges = selNode ? viz.edges.filter((e) => e.fromId === sel || e.toId === sel) : [];
	// The kinds the actor COULD filter by, straight from the live facets (never reveals hidden content).
	const legendKinds = viz.facets.kinds;

	// Open navigates to the ENTITY the node represents, not to a list: notes deep-link to
	// `/knowledge/:id`, maps/POIs to the Atlas `?map=&poi=` deep link (the same URL MapBuilder's
	// "copy link" writes). A POI's owning map is resolved through the SAME actor-filtered map reads
	// the Atlas renders from, so the link never names a map the current viewpoint cannot see.
	// Objects (quest/faction dossiers) live on Campaign — the same destination the Characters
	// mention-search uses for object hits.
	const openNode = (n: GraphVizNode) => {
		if (n.kind === 'note') {
			navigate(`/knowledge/${n.id}`);
			return;
		}
		if (n.kind === 'map') {
			navigate(`/atlas?map=${encodeURIComponent(n.id)}`);
			return;
		}
		if (n.kind === 'poi') {
			const owner = listMapsForActor(
				runtime.state.maps,
				runtime.state.permissions,
				viewActorId,
			).find((m) => {
				const view = getMapViewForActor(
					runtime.state.maps,
					runtime.state.permissions,
					viewActorId,
					m.id,
				);
				return view.kind === 'available' && view.pois.some((p) => p.id === n.id);
			});
			navigate(
				owner
					? `/atlas?map=${encodeURIComponent(owner.id)}&poi=${encodeURIComponent(n.id)}`
					: `/atlas?poi=${encodeURIComponent(n.id)}`,
			);
			return;
		}
		navigate('/campaign');
	};

	return (
		<Page max={1280}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					marginBottom: 16,
					flexWrap: 'wrap',
				}}
			>
				<Seg
					value={view}
					ariaLabel="Graph viewpoint"
					onChange={(v: string) => setView(v as 'dm' | 'player')}
					options={[
						{ value: 'dm', label: 'DM view' },
						// Disable when no player actor is registered — otherwise the fallback would render DM
						// data under the "Player view" label (playerId === dmId).
						{ value: 'player', label: 'Player view', disabled: playerId === dmId },
					]}
				/>
				{/* This count is the ONLY feedback that a filter, a search or the DM/player view switch
				    did anything. It is present from mount, so role=status announces each change. */}
				<span role="status" style={{ font: `12px ${T.sans}`, color: T.ter }}>
					Showing {viz.nodes.length} of {viz.totalVisibleNodes} visible{' '}
					{viz.totalVisibleNodes === 1 ? 'node' : 'nodes'}
					{viz.partial ? ' · some sources aren’t fully loaded yet' : ''}
				</span>
				<div style={{ flex: 1 }} />
				<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
					{legendKinds.map((k) => (
						<span
							key={k}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 6,
								font: `11.5px ${T.sans}`,
								color: T.sub,
							}}
						>
							<span
								style={{
									width: 10,
									height: 10,
									borderRadius: 3,
									background: KIND_COLOR[k] ?? T.sub,
								}}
							/>
							{KIND_LABEL[k] ?? k}
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
					if (e.key === 'Escape' && sel !== null && !(e.target instanceof HTMLInputElement)) {
						e.stopPropagation();
						setSel(null);
					}
				}}
				style={{
					display: 'grid',
					gridTemplateColumns: isPhone ? '1fr' : '1fr 320px',
					gap: 18,
					alignItems: 'start',
				}}
			>
				{/* graph canvas — real nodes (sized by visible degree) + real directed link edges */}
				<div
					style={{
						position: 'relative',
						borderRadius: 14,
						border: `1px solid ${T.bd}`,
						background: `radial-gradient(680px 360px at 60% 0%, ${T.accSub}, ${T.sunken} 70%)`,
						overflow: 'hidden',
						aspectRatio: '16/11',
					}}
				>
					{nodes.length === 0 && (
						<div
							style={{
								position: 'absolute',
								inset: 0,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								font: `13px ${T.sans}`,
								color: T.ter,
								textAlign: 'center',
								padding: 24,
							}}
						>
							{view === 'player'
								? 'No player-visible nodes match this filter.'
								: 'Nothing to graph yet — notes, maps, and story entries appear here as you link them.'}
						</div>
					)}
					{/* preserveAspectRatio="none" stretches the viewBox to the container so SVG edge
					    coordinates line up with the percentage-positioned node buttons ((x/100)%, (y/70)%)
					    at any aspect ratio. */}
					<svg
						viewBox="0 0 100 70"
						preserveAspectRatio="none"
						style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
					>
						{viz.edges.map((e, i) => {
							const a = nodeById[e.fromId];
							const b = nodeById[e.toId];
							if (!a || !b) return null;
							const hot = selNode != null && (e.fromId === sel || e.toId === sel);
							return (
								<line
									key={`${e.fromId}-${e.toId}-${i}`}
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
					{nodes.map((n) => {
						const col = KIND_COLOR[n.kind] ?? T.sub;
						const dim =
							selNode != null &&
							n.id !== sel &&
							!selEdges.some((e) => e.fromId === n.id || e.toId === n.id);
						const d = Math.max(34, Math.min(70, 34 + n.degree * 7));
						return (
							<button
								key={n.id}
								type="button"
								// Toggle, not latch. `setSel(null)` existed nowhere, so the first click on any
								// node dimmed every non-incident node to 0.4 and every non-incident edge to
								// 0.22 for the rest of the session with no way back. Atlas's POI list already
								// toggles the same way.
								aria-pressed={n.id === sel}
								onClick={() => setSel((cur) => (cur === n.id ? null : n.id))}
								title={`${n.title} · ${KIND_LABEL[n.kind] ?? n.kind} · ${n.degree} ${n.degree === 1 ? 'connection' : 'connections'}`}
								aria-label={`${n.title}, ${KIND_LABEL[n.kind] ?? n.kind}, ${n.degree} ${n.degree === 1 ? 'connection' : 'connections'}`}
								style={{
									position: 'absolute',
									left: `${n.x}%`,
									top: `${(n.y / 70) * 100}%`,
									transform: 'translate(-50%,-50%)',
									width: d,
									height: d,
									borderRadius: '50%',
									cursor: 'pointer',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									textAlign: 'center',
									padding: 4,
									opacity: dim ? 0.4 : 1,
									border: `1.5px solid ${n.id === sel ? T.acc : col}`,
									background: `color-mix(in srgb, ${col} ${n.id === sel ? 28 : 16}%, ${T.surf})`,
									color: T.ink,
									boxShadow: n.id === sel ? T.smd : 'none',
									transition: 'opacity var(--duration-fast) var(--easing-standard)',
								}}
							>
								<span
									style={{
										// `d` bottoms out at 34, so a /6 divisor pinned every low-degree node's
										// title at the 7px floor — illegible, and clipped mid-glyph with no
										// ellipsis. Raise the floor to 10px and truncate honestly.
										font: `600 ${Math.max(10, d / 5)}px ${T.sans}`,
										lineHeight: 1.05,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
									}}
								>
									{n.title}
								</span>
							</button>
						);
					})}
				</div>

				{/* search + inspector + health. Search comes FIRST on purpose: the "Selected" panel used to
				    be the rail's first child, so clicking a search result inserted ~250px of inspector
				    ABOVE the result list and the row the user had just aimed at jumped out from under the
				    pointer — the next click landed on a different node. Keeping DOM order == visual order
				    also keeps the tab sequence honest (an `order:` swap would not have). */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<Panel title="Search" pad={14}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '8px 10px',
								borderRadius: 9,
								background: T.alt,
								border: `1px solid ${T.bd}`,
								marginBottom: 10,
							}}
						>
							<Icon name="search" size={15} color={T.ter} />
							<input
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								// The grid's Escape handler deliberately skips inputs because the input was
								// documented as keeping "its own Escape (clear the query)" — except it never
								// had one, so Escape in the search box cleared neither the query nor the
								// selection. There is no × affordance either; clearing meant backspacing.
								onKeyDown={(e) => {
									if (e.key === 'Escape' && query) {
										e.stopPropagation();
										setQuery('');
									}
								}}
								placeholder="Search the graph…"
								aria-label="Search the graph"
								style={{
									flex: 1,
									border: 'none',
									// No `outline: none` — this raw input has no compensating focus style of
									// its own, so suppressing the ring left keyboard users with no focus
									// indicator at all (WCAG 2.4.7). Let the global :focus-visible ring apply.
									background: 'transparent',
									color: T.ink,
									font: `12.5px ${T.sans}`,
								}}
							/>
						</div>
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
							{['all', ...legendKinds].map((f) => (
								<button
									key={f}
									type="button"
									// The applied facet was signalled by colour alone (WCAG 1.4.1 / 4.1.2).
								aria-pressed={facet === f}
								onClick={() => setFacet(f)}
									style={{
										font: `11.5px ${T.sans}`,
										padding: '4px 9px',
										borderRadius: 20,
										cursor: 'pointer',
										border: `1px solid ${facet === f ? T.accBd : T.bd}`,
										background: facet === f ? T.accSub : 'transparent',
										color: facet === f ? T.acc : T.sub,
									}}
								>
									{f === 'all' ? 'All' : (KIND_LABEL[f] ?? f)}
								</button>
							))}
						</div>
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 8,
								maxHeight: 280,
								overflowY: 'auto',
							}}
						>
							{viz.nodes.map((r) => (
								<button
									key={r.id}
									type="button"
									aria-pressed={r.id === sel}
									onClick={() => setSel((cur) => (cur === r.id ? null : r.id))}
									style={{
										display: 'block',
										width: '100%',
										textAlign: 'left',
										padding: '9px 10px',
										border: `1px solid ${r.id === sel ? T.accBd : T.bd}`,
										borderRadius: 9,
										background: r.id === sel ? T.accSub : T.surf,
										cursor: 'pointer',
									}}
								>
									<div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
										<span
											style={{
												width: 8,
												height: 8,
												borderRadius: 2,
												background: KIND_COLOR[r.kind] ?? T.sub,
												flex: '0 0 auto',
											}}
										/>
										<span
											style={{
												font: `600 12.5px ${T.sans}`,
												flex: 1,
												minWidth: 0,
												whiteSpace: 'nowrap',
												overflow: 'hidden',
												textOverflow: 'ellipsis',
											}}
										>
											{r.title}
										</span>
										<span style={{ font: `10.5px ${T.mono}`, color: T.ter }}>{r.degree}</span>
									</div>
									<div style={{ font: `10.5px ${T.sans}`, color: T.ter }}>
										{KIND_LABEL[r.kind] ?? r.kind}
										{r.folder ? ` · ${r.folder}` : ''}
										{r.tags.length ? ` · ${r.tags.map((t) => `#${t}`).join(' ')}` : ''}
									</div>
								</button>
							))}
							{viz.nodes.length === 0 && (
								<div style={{ font: `12px ${T.sans}`, color: T.ter, padding: '8px 2px' }}>
									{view === 'player' ? 'No results in player view.' : 'No results for this filter.'}
								</div>
							)}
						</div>
					</Panel>

					{selNode ? (
						<Panel
							accent
							title="Selected"
							action={<Badge status="neutral">{KIND_LABEL[selNode.kind] ?? selNode.kind}</Badge>}
						>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
								<span
									style={{
										width: 34,
										height: 34,
										borderRadius: 9,
										flex: '0 0 auto',
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										background: `color-mix(in srgb, ${KIND_COLOR[selNode.kind] ?? T.sub} 18%, transparent)`,
										color: KIND_COLOR[selNode.kind] ?? T.sub,
									}}
								>
									<Icon name={KIND_ICON[selNode.kind] ?? 'tag'} size="md" />
								</span>
								<div style={{ minWidth: 0 }}>
									<div style={{ font: `700 15px ${T.disp}` }}>{selNode.title}</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										{selNode.folder ? `${selNode.folder} · ` : ''}
										{selNode.source === DEFAULT_SOURCE_ID ? 'This vault' : selNode.source}
									</div>
								</div>
							</div>
							{selNode.tags.length > 0 && (
								<div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
									{selNode.tags.map((t) => (
										<Badge key={t} status="neutral">
											#{t}
										</Badge>
									))}
								</div>
							)}
							<div style={{ marginTop: 8 }}>
								<Button
									variant="secondary"
									size="sm"
									icon="chevron-right"
									onClick={() => openNode(selNode)}
								>
									{selNode.kind === 'note'
										? 'Open note'
										: selNode.kind === 'object'
											? 'Open in Story'
											: 'Open in Maps'}
								</Button>
							</div>
							<div style={{ ...eb, marginTop: 8 }}>Connections ({selEdges.length})</div>
							{selEdges.length === 0 ? (
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									No links from or to this node yet.
								</div>
							) : (
								<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
									{selEdges.map((e, i) => {
										const otherId = e.fromId === sel ? e.toId : e.fromId;
										const other = nodeById[otherId];
										if (!other) return null;
										const outgoing = e.fromId === sel;
										return (
											<button
												key={`${otherId}-${i}`}
												type="button"
												onClick={() => setSel(other.id)}
												style={{
													display: 'flex',
													alignItems: 'center',
													gap: 8,
													padding: '6px 8px',
													border: `1px solid ${T.bd}`,
													borderRadius: 8,
													background: T.surf,
													cursor: 'pointer',
													textAlign: 'left',
												}}
											>
												<span
													style={{
														width: 8,
														height: 8,
														borderRadius: 2,
														background: KIND_COLOR[other.kind] ?? T.sub,
														flex: '0 0 auto',
													}}
												/>
												<span
													style={{
														flex: 1,
														minWidth: 0,
														font: `12px ${T.sans}`,
														whiteSpace: 'nowrap',
														overflow: 'hidden',
														textOverflow: 'ellipsis',
													}}
												>
													{other.title}
												</span>
												<span style={{ font: `10.5px ${T.sans}`, color: T.ter }}>
													{outgoing ? '→' : '←'} {REL_LABEL[e.relationship] ?? 'linked'}
												</span>
											</button>
										);
									})}
								</div>
							)}
						</Panel>
					) : null}

					{/* GRAPH-007 — DM sees the full health report; a player sees only the generalized coarse bands. */}
					{health.kind === 'dm' ? (
						<Panel
							title="Graph health"
							action={
								<Badge status={health.report.coverage.overall >= 70 ? 'success' : 'warning'}>
									{health.report.coverage.overall}% coverage
								</Badge>
							}
						>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
								<HealthRow label="Stale notes" count={health.report.staleNotes.length} />
								<HealthRow label="Missing links" count={health.report.missingLinks.length} />
								<HealthRow label="Content gaps" count={health.report.contentGaps.length} />
								<HealthRow label="Open threads" count={health.report.openThreads.length} />
							</div>
						</Panel>
					) : (
						<Panel title="Graph health" action={<VisibilityChip level="players" compact />}>
							<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
								Players see rough amounts only — never exact counts that could give away hidden
								content.
							</div>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
								{(
									[
										['Stale notes', health.summary.staleNotes],
										['Missing links', health.summary.missingLinks],
										['Content gaps', health.summary.contentGaps],
										['Open threads', health.summary.openThreads],
									] as const
								).map(([label, band]) => (
									<div
										key={label}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 8,
											font: `12px ${T.sans}`,
											color: T.sub,
										}}
									>
										<span style={{ flex: 1 }}>{label}</span>
										<Badge status={BAND_TONE[band] as 'neutral'}>{BAND_LABEL[band] ?? band}</Badge>
									</div>
								))}
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										font: `12px ${T.sans}`,
										color: T.sub,
										marginTop: 2,
									}}
								>
									<span style={{ flex: 1 }}>Coverage</span>
									<Badge status="neutral">
										{BAND_LABEL[health.summary.coverageBand] ?? health.summary.coverageBand}
									</Badge>
								</div>
							</div>
						</Panel>
					)}
				</div>
			</div>
		</Page>
	);
}
