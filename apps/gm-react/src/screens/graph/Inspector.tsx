import { Badge, Button, Icon } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { KIND_COLOR, KIND_ICON, KIND_LABEL, REL_LABEL } from './presentation';
import type { GraphVisualization, GraphVizNode } from '@dndtools/core';
export function GraphInspector({
	selNode,
	selEdges,
	nodeById,
	facet,
	query,
	setSel,
	openNode,
}: {
	selNode: GraphVizNode;
	selEdges: GraphVisualization['edges'];
	nodeById: Record<string, GraphVizNode>;
	facet: string;
	query: string;
	setSel: (value: string) => void;
	openNode: (node: GraphVizNode) => void;
}) {
	const { t } = useI18n();
	const sel = selNode.id;
	const DEFAULT_SOURCE_ID = 'local-vault';
	return (
		<Panel
			style={{ background: T.sunken, boxShadow: 'none' }}
			accent
			title={t('graph.selected')}
			action={
				<Badge status="neutral">
					{KIND_LABEL[selNode.kind] ? t(KIND_LABEL[selNode.kind]) : selNode.kind}
				</Badge>
			}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
				<span
					style={{
						width: 34,
						height: 34,
						borderRadius: 'var(--radius-md)',
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
					<div style={{ font: `700 var(--text-md) ${T.sans}` }}>{selNode.title}</div>
					<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
						{selNode.folder ? `${selNode.folder} · ` : ''}
						{selNode.source === DEFAULT_SOURCE_ID ? t('graph.thisVault') : selNode.source}
					</div>
				</div>
			</div>
			{selNode.tags.length > 0 && (
				<div
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						gap: 'var(--space-1)',
						marginTop: 'var(--space-2)',
					}}
				>
					{selNode.tags.map((tag) => (
						<Badge key={tag} status="neutral">
							#{tag}
						</Badge>
					))}
				</div>
			)}
			<div style={{ marginTop: 'var(--space-2)' }}>
				<Button variant="primary" size="sm" icon="chevron-right" onClick={() => openNode(selNode)}>
					{selNode.kind === 'note'
						? t('graph.openNote')
						: selNode.kind === 'object'
							? t('graph.openInStory')
							: t('graph.openInMaps')}
				</Button>
			</div>
			<div style={{ ...eb, marginTop: 'var(--space-2)' }}>
				{t('graph.connections', { count: selEdges.length })}
			</div>
			{selEdges.length === 0 ? (
				<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
					{/* `selEdges` derives from `viz.edges`, which the core filters by facet and
									    text — so typing anything in the search box emptied it and a
									    well-connected node reported that its links do not exist "yet". */}
					{facet !== 'all' || query.trim() ? t('graph.noLinksFilter') : t('graph.noLinks')}
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
					{selEdges.map((e, i) => {
						const otherId = e.fromId === sel ? e.toId : e.fromId;
						const other = nodeById[otherId];
						if (!other) return null;
						const outgoing = e.fromId === sel;
						return (
							<Button
								key={`${otherId}-${i}`}
								type="button"
								onClick={() => setSel(other.id)}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-2)',
									padding: 'var(--space-1-5) var(--space-2)',
									border: `0.0625rem solid ${T.bd}`,
									borderRadius: 'var(--radius-md)',
									background: T.surf,
									cursor: 'pointer',
									textAlign: 'left',
								}}
							>
								<span
									style={{
										width: 8,
										height: 8,
										borderRadius: 'var(--radius-sm)',
										background: KIND_COLOR[other.kind] ?? T.sub,
										flex: '0 0 auto',
									}}
								/>
								<span
									style={{
										flex: 1,
										minWidth: 0,
										font: `var(--text-base) ${T.sans}`,
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
									}}
								>
									{other.title}
								</span>
								<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
									{outgoing ? '→' : '←'}{' '}
									{REL_LABEL[e.relationship] ? t(REL_LABEL[e.relationship]) : t('graph.rel.linked')}
								</span>
							</Button>
						);
					})}
				</div>
			)}
		</Panel>
	);
}
