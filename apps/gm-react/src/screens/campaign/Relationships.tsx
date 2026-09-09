import { useMemo, useState } from 'react';
import {
	getContentItemsForActor,
	getTypedRelationshipEdgesForActor,
	parseMarkdownNote,
	parseRelationDeclarations,
	serializeMarkdownNote,
	serializeRelationDeclaration,
	type ContentItemView,
	type TypedRelationEdge,
} from '@dndtools/core';
import { Badge, Button, Field, IconButton, Input, Select, Toaster } from '../../ds';
import { BackBar, Page, Panel, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';

/**
 * RC-KNW-3.3 — the Relationship editor: TYPED edges between notes (faction↔NPC, NPC↔location, or any
 * other authored pair). A typed edge is `relations:` front matter on the SOURCE note — not a new
 * command, not a second link engine: it reuses the same note substrate and `content.update-item` write
 * path the note editor already uses for `aliases`/`tags`. Reading composes
 * `getTypedRelationshipEdgesForActor` (RC-KNW-3.3), which is built on the SAME actor-visible record set
 * GRAPH-002 uses — an edge whose source OR target the actor cannot see never appears (fail closed).
 *
 * Every write here reads the source note's CURRENT body fresh (never a stale copy from the graph read),
 * edits only the `relations` list, and reattaches the note's other front matter untouched before
 * dispatching — the same "recompute right before writing" discipline the link-repair screen uses.
 */

/** A short, common vocabulary offered as a starting point; the free-text input accepts any verb. */
const SUGGESTED_VERBS = [
	'leads',
	'member-of',
	'allied-with',
	'enemy-of',
	'rival-of',
	'located-in',
	'rules',
	'serves',
];

/** Deterministic, force-free ellipse layout — same approach as the Graph screen's canvas. */
function positioned<T extends { id: string }>(nodes: T[]): (T & { x: number; y: number })[] {
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

export function Relationships() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const [sourceId, setSourceId] = useState('');
	const [verb, setVerb] = useState('');
	const [targetId, setTargetId] = useState('');
	const [busy, setBusy] = useState(false);

	const notes: ContentItemView[] = useMemo(
		() =>
			getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId)
				.filter((view) => view.kind === 'note')
				.sort((a, b) => a.title.localeCompare(b.title)),
		[runtime.state, actorId],
	);

	const edges: TypedRelationEdge[] = useMemo(
		() =>
			getTypedRelationshipEdgesForActor(runtime.state.content, runtime.state.permissions, actorId),
		[runtime.state, actorId],
	);

	const nodeById = useMemo(() => {
		const ids = new Set<string>();
		for (const edge of edges) {
			ids.add(edge.sourceId);
			ids.add(edge.targetId);
		}
		const titleById = new Map<string, string>();
		for (const note of notes) titleById.set(note.id, note.title);
		return new Map([...ids].map((id) => [id, { id, title: titleById.get(id) ?? id }]));
	}, [edges, notes]);

	const nodes = useMemo(() => positioned([...nodeById.values()]), [nodeById]);
	const nodePos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

	/** Reads the note's CURRENT body fresh, applies `mutate` to its parsed relations, and dispatches. */
	const writeRelations = async (
		itemId: string,
		mutate: (declarations: string[]) => string[],
	): Promise<boolean> => {
		const view = getContentItemsForActor(
			runtime.state.content,
			runtime.state.permissions,
			actorId,
		).find((v) => v.id === itemId);
		if (!view) {
			Toaster.error(t('campaign.relationships.saveFailed'));
			return false;
		}
		const parsed = parseMarkdownNote(view.body);
		const currentRaw = Array.isArray(parsed.properties['relations'])
			? (parsed.properties['relations'] as string[])
			: [];
		const nextRaw = mutate(currentRaw);
		const nextProperties = { ...parsed.properties };
		if (nextRaw.length === 0) delete nextProperties['relations'];
		else nextProperties['relations'] = nextRaw;
		const body = serializeMarkdownNote(nextProperties, parsed.body);
		const result = await runtime.dispatch({
			type: 'content.update-item',
			actorId,
			payload: { itemId, title: view.title, body, baseRevision: view.revision },
		});
		if (result.status !== 'accepted') {
			Toaster.error(result.rejection.message ?? t('campaign.relationships.saveFailed'));
			return false;
		}
		return true;
	};

	const addEdge = async () => {
		const target = notes.find((n) => n.id === targetId);
		const trimmedVerb = verb.trim().toLowerCase();
		if (!sourceId || !target || trimmedVerb === '' || sourceId === targetId) return;
		setBusy(true);
		try {
			const declaration = serializeRelationDeclaration({
				verb: trimmedVerb,
				targetName: target.title,
			});
			const ok = await writeRelations(sourceId, (current) =>
				current.includes(declaration) ? current : [...current, declaration],
			);
			if (ok) {
				Toaster.success(t('campaign.relationships.added'));
				setVerb('');
				setTargetId('');
			}
		} finally {
			setBusy(false);
		}
	};

	const removeEdge = async (edge: TypedRelationEdge) => {
		setBusy(true);
		try {
			const ok = await writeRelations(edge.sourceId, (current) =>
				current.filter(
					(line) =>
						!parseRelationDeclarations([line]).some(
							(d) =>
								d.verb === edge.verb &&
								d.targetName.trim().toLowerCase() === edge.targetTitle.trim().toLowerCase(),
						),
				),
			);
			if (ok) Toaster.success(t('campaign.relationships.removed'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Page max={1000}>
			<BackBar to="/campaign" label={t('campaign.relationships.back')} />
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<Panel
					title={t('campaign.relationships.title')}
					action={<Badge status="neutral">{edges.length}</Badge>}
				>
					<div style={{ font: `12px ${T.sans}`, color: T.sub, marginBottom: 12 }}>
						{t('campaign.relationships.intro')}
					</div>
					{edges.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('campaign.relationships.empty')}
						</div>
					) : (
						<div
							style={{
								position: 'relative',
								borderRadius: 14,
								border: `1px solid ${T.bd}`,
								background: `radial-gradient(680px 360px at 60% 0%, ${T.accSub}, ${T.sunken} 70%)`,
								overflow: 'hidden',
								aspectRatio: '16/9',
							}}
						>
							<svg
								viewBox="0 0 100 70"
								preserveAspectRatio="none"
								style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
							>
								{edges.map((edge, i) => {
									const a = nodePos.get(edge.sourceId);
									const b = nodePos.get(edge.targetId);
									if (!a || !b) return null;
									return (
										<g key={`${edge.sourceId}-${edge.verb}-${edge.targetId}-${i}`}>
											<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={T.bd} strokeWidth={0.35} />
											<text
												x={(a.x + b.x) / 2}
												y={(a.y + b.y) / 2 / 0.7}
												fontSize={2.6}
												fill={T.sub}
												textAnchor="middle"
											>
												{edge.verb}
											</text>
										</g>
									);
								})}
							</svg>
							{nodes.map((n) => (
								<div
									key={n.id}
									style={{
										position: 'absolute',
										left: `${n.x}%`,
										top: `${(n.y / 70) * 100}%`,
										transform: 'translate(-50%,-50%)',
										padding: '6px 10px',
										borderRadius: 20,
										border: `1.5px solid ${T.accBd}`,
										background: `color-mix(in srgb, ${T.acc} 14%, ${T.surf})`,
										font: `600 11px ${T.sans}`,
										color: T.ink,
										whiteSpace: 'nowrap',
									}}
								>
									{n.title}
								</div>
							))}
						</div>
					)}
					{edges.length > 0 && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
							{edges.map((edge, i) => (
								<div
									key={`${edge.sourceId}-${edge.verb}-${edge.targetId}-${i}`}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										padding: '8px 10px',
										border: `1px solid ${T.bd}`,
										borderRadius: 8,
										background: T.surf,
									}}
								>
									<span style={{ font: `12.5px ${T.sans}`, flex: 1, minWidth: 0 }}>
										<strong>{edge.sourceTitle}</strong> — {edge.verb} →{' '}
										<strong>{edge.targetTitle}</strong>
									</span>
									<IconButton
										icon="delete"
										label={t('campaign.relationships.remove', {
											source: edge.sourceTitle,
											target: edge.targetTitle,
										})}
										variant="ghost"
										size="sm"
										disabled={busy}
										onClick={() => removeEdge(edge)}
									/>
								</div>
							))}
						</div>
					)}
				</Panel>

				<Panel title={t('campaign.relationships.addTitle')}>
					<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
						<Field label={t('campaign.relationships.source')} style={{ flex: '1 1 200px' }}>
							<Select
								value={sourceId}
								onChange={(e: { target: { value: string } }) => setSourceId(e.target.value)}
								options={[
									{ value: '', label: t('campaign.relationships.choose') },
									...notes.map((n) => ({ value: n.id, label: n.title })),
								]}
							/>
						</Field>
						<Field label={t('campaign.relationships.verb')} style={{ flex: '1 1 160px' }}>
							<Input
								value={verb}
								list="campaign-relationships-verbs"
								placeholder={t('campaign.relationships.verbPlaceholder')}
								onChange={(e: { target: { value: string } }) => setVerb(e.target.value)}
							/>
						</Field>
						{/* Sibling of the Field, not a child of it — Field only auto-associates its label with
						    a SINGLE child element; a second child (this datalist) would silently break that
						    association and leave the verb input unlabeled for assistive tech (WCAG 4.1.2). The
						    `list` attribute finds it by id regardless of where it sits in the document. */}
						<datalist id="campaign-relationships-verbs">
							{SUGGESTED_VERBS.map((v) => (
								<option key={v} value={v} />
							))}
						</datalist>
						<Field label={t('campaign.relationships.target')} style={{ flex: '1 1 200px' }}>
							<Select
								value={targetId}
								onChange={(e: { target: { value: string } }) => setTargetId(e.target.value)}
								options={[
									{ value: '', label: t('campaign.relationships.choose') },
									...notes.map((n) => ({ value: n.id, label: n.title })),
								]}
							/>
						</Field>
						<Button
							variant="secondary"
							icon="add"
							disabled={
								busy || !sourceId || !targetId || verb.trim() === '' || sourceId === targetId
							}
							onClick={addEdge}
						>
							{t('campaign.relationships.add')}
						</Button>
					</div>
				</Panel>
			</div>
		</Page>
	);
}
