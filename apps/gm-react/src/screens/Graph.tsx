import { useMemo, useState } from 'react';
import {
	getGraphVisualizationForActor,
	getGraphHealthForDm,
	getPlayerScopedHealthSummary,
	type GraphVisualization,
	type GraphVizNode,
} from '@dndtools/core';
import { Badge, Icon, VisibilityChip } from '../ds';
import { Page, Panel, Seg, T, eb } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Graph & Search — the relationship graph canvas + faceted search, now wired to the live Processing
 * Core (was static `mockCampaign`). Every node/edge/facet comes from `getGraphVisualizationForActor`,
 * the actor-filtered GRAPH-004 read model: the DM/Player toggle simply re-runs the read AS a different
 * actor, so a player view drops every DM-only node the data layer hides (the leak-proofing contract,
 * proven by the read itself, not by client-side filtering). Health is the DM-only GRAPH-007 report;
 * a player sees only the GENERALIZED coarse-band summary (GRAPH-007 AC3). The graph is read-only
 * intelligence — there is no node-authoring command on this surface.
 */

const DEFAULT_SOURCE_ID = 'local-vault';

// Real GraphVizNode.kind is note | object | map | poi (NOT the mock's character/place/faction). Colors,
// icons and labels are remapped to those; the legend is built from the live facets, never a fixed list.
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
	object: 'Object',
	map: 'Map',
	poi: 'Point of interest',
};
const REL_LABEL: Record<string, string> = { wikilink: 'links to', 'poi-link': 'map link' };
const BAND_TONE: Record<string, string> = { none: 'neutral', few: 'success', several: 'warning', many: 'error' };

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
		<div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12px ${T.sans}`, color: T.sub }}>
			<span style={{ flex: 1 }}>{label}</span>
			<Badge status={count === 0 ? 'success' : count <= 3 ? 'warning' : 'error'}>{count}</Badge>
		</div>
	);
}

export function Graph() {
	const runtime = useRuntime();
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
			? { kind: 'dm' as const, report: getGraphHealthForDm(runtime.state.content, runtime.state.permissions, dmId, now) }
			: { kind: 'player' as const, summary: getPlayerScopedHealthSummary(runtime.state.content, runtime.state.permissions, playerId, now) };
	}, [runtime.state, view, dmId, playerId]);

	const nodes = useMemo(() => positioned(viz.nodes), [viz.nodes]);
	const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
	const selNode = sel && nodeById[sel] ? nodeById[sel] : null;
	const selEdges = selNode ? viz.edges.filter((e) => e.fromId === sel || e.toId === sel) : [];
	// The kinds the actor COULD filter by, straight from the live facets (never reveals hidden content).
	const legendKinds = viz.facets.kinds;

	return (
		<Page max={1280}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
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
				<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
					Showing {viz.nodes.length} of {viz.totalVisibleNodes} visible {viz.totalVisibleNodes === 1 ? 'node' : 'nodes'}
					{viz.partial ? ' · some sources are behind' : ''}
				</span>
				<div style={{ flex: 1 }} />
				<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
					{legendKinds.map((k) => (
						<span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: `11.5px ${T.sans}`, color: T.sub }}>
							<span style={{ width: 10, height: 10, borderRadius: 3, background: KIND_COLOR[k] ?? T.sub }} />
							{KIND_LABEL[k] ?? k}
						</span>
					))}
				</div>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}>
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
						<div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `13px ${T.sans}`, color: T.ter, textAlign: 'center', padding: 24 }}>
							{view === 'player'
								? 'No player-visible nodes match this filter.'
								: 'No graph nodes yet — create notes, maps and objects to populate the relationship graph.'}
						</div>
					)}
					<svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
						{viz.edges.map((e, i) => {
							const a = nodeById[e.fromId];
							const b = nodeById[e.toId];
							if (!a || !b) return null;
							const hot = selNode != null && (e.fromId === sel || e.toId === sel);
							return (
								<line
									key={`${e.fromId}-${e.toId}-${i}`}
									x1={a.x}
									y1={a.y * 0.7}
									x2={b.x}
									y2={b.y * 0.7}
									stroke={hot ? T.acc : e.relationship === 'poi-link' ? 'var(--color-status-info)' : T.bd}
									strokeWidth={hot ? 0.6 : 0.35}
									opacity={selNode && !hot ? 0.22 : 0.8}
								/>
							);
						})}
					</svg>
					{nodes.map((n) => {
						const col = KIND_COLOR[n.kind] ?? T.sub;
						const dim = selNode != null && n.id !== sel && !selEdges.some((e) => e.fromId === n.id || e.toId === n.id);
						const d = Math.max(34, Math.min(70, 34 + n.degree * 7));
						return (
							<button
								key={n.id}
								type="button"
								onClick={() => setSel(n.id)}
								title={`${n.title} · ${KIND_LABEL[n.kind] ?? n.kind} · degree ${n.degree}`}
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
								<span style={{ font: `600 ${Math.max(7, d / 6)}px ${T.sans}`, lineHeight: 1.05, overflow: 'hidden' }}>{n.title}</span>
							</button>
						);
					})}
				</div>

				{/* inspector + search + health */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					{selNode ? (
						<Panel accent title="Selected" action={<Badge status="neutral">{KIND_LABEL[selNode.kind] ?? selNode.kind}</Badge>}>
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
										{selNode.source}
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
							<div style={{ ...eb, marginTop: 8 }}>Connections ({selEdges.length})</div>
							{selEdges.length === 0 ? (
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>No links from or to this node yet.</div>
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
												<span style={{ width: 8, height: 8, borderRadius: 2, background: KIND_COLOR[other.kind] ?? T.sub, flex: '0 0 auto' }} />
												<span style={{ flex: 1, minWidth: 0, font: `12px ${T.sans}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
													{other.title}
												</span>
												<span style={{ font: `10.5px ${T.sans}`, color: T.ter }}>
													{outgoing ? '→' : '←'} {REL_LABEL[e.relationship] ?? e.relationship}
												</span>
											</button>
										);
									})}
								</div>
							)}
						</Panel>
					) : null}

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
								placeholder="Search the graph…"
								aria-label="Search the graph"
								style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: T.ink, font: `12.5px ${T.sans}` }}
							/>
						</div>
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
							{['all', ...legendKinds].map((f) => (
								<button
									key={f}
									type="button"
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
									{f === 'all' ? 'All' : KIND_LABEL[f] ?? f}
								</button>
							))}
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
							{viz.nodes.map((r) => (
								<button
									key={r.id}
									type="button"
									onClick={() => setSel(r.id)}
									style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', border: `1px solid ${r.id === sel ? T.accBd : T.bd}`, borderRadius: 9, background: r.id === sel ? T.accSub : T.surf, cursor: 'pointer' }}
								>
									<div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
										<span style={{ width: 8, height: 8, borderRadius: 2, background: KIND_COLOR[r.kind] ?? T.sub, flex: '0 0 auto' }} />
										<span style={{ font: `600 12.5px ${T.sans}`, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
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

					{/* GRAPH-007 — DM sees the full health report; a player sees only the generalized coarse bands. */}
					{health.kind === 'dm' ? (
						<Panel title="Graph health" action={<Badge status={health.report.coverage.overall >= 70 ? 'success' : 'warning'}>{health.report.coverage.overall}% coverage</Badge>}>
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
								Players see only coarse bands — never exact counts that could betray hidden content (GRAPH-007 AC3).
							</div>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
								{([
									['Stale notes', health.summary.staleNotes],
									['Missing links', health.summary.missingLinks],
									['Content gaps', health.summary.contentGaps],
									['Open threads', health.summary.openThreads],
								] as const).map(([label, band]) => (
									<div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12px ${T.sans}`, color: T.sub }}>
										<span style={{ flex: 1 }}>{label}</span>
										<Badge status={BAND_TONE[band] as 'neutral'}>{band}</Badge>
									</div>
								))}
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12px ${T.sans}`, color: T.sub, marginTop: 2 }}>
									<span style={{ flex: 1 }}>Coverage</span>
									<Badge status="neutral">{health.summary.coverageBand}</Badge>
								</div>
							</div>
						</Panel>
					)}
				</div>
			</div>
		</Page>
	);
}
