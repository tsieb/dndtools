import { wikilinkKindLabel } from '../../app/editor/Autocomplete';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	actorCanAuthorContent,
	buildWikilinkCandidatesForActor,
	getTypedRelationshipEdgesForActor,
	parseMarkdownNote,
	parseRelationDeclarations,
	resolveWikilink,
	serializeMarkdownNote,
	serializeRelationDeclaration,
	type ActorWikilinkTarget,
	type CoreCommand,
	type TypedRelationEdge,
} from '@dndtools/core';
import {
	Badge,
	Button,
	Dialog,
	EmptyState,
	Field,
	IconButton,
	Input,
	Select,
	Toaster,
} from '../../ds';
import { BackBar, Page, Panel, T, eb } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import type { Mention } from '../campaignRows';

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

/**
 * Titles are the persisted references. Match against the original candidate order, just as
 * autocomplete and the graph do, before offering a target whose title could name another entity.
 */
function resolvableTargets(
	offered: ActorWikilinkTarget[],
	candidates: ActorWikilinkTarget[],
): ActorWikilinkTarget[] {
	return offered.filter((target) => {
		const resolved = resolveWikilink({ target: target.title }, candidates);
		return resolved.status === 'resolved' && resolved.targetId === target.id;
	});
}

/**
 * The ONE relationship write path, shared by this overview and the Story cards' inline "Add
 * relationship" (RC-KNW-6.6). Every write reads the source's CURRENT body fresh, edits only its
 * `relations` list, and dispatches the command for wherever that body is stored.
 */
export function useRelationshipWriter() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const [busy, setBusy] = useState(false);

	const currentCandidates = () =>
		buildWikilinkCandidatesForActor(
			runtime.state.content,
			runtime.state.permissions,
			actorId,
			runtime.state,
		);

	/** Reads the note's CURRENT body fresh, applies `mutate` to its parsed relations, and dispatches. */
	const writeRelations = async (
		itemId: string,
		mutate: (declarations: string[]) => string[],
	): Promise<boolean> => {
		const view = currentCandidates().find((v) => v.id === itemId);
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
		let command: CoreCommand;
		switch (view.storage) {
			case 'character':
				command = {
					type: 'character.edit-field',
					actorId,
					payload: { characterId: view.entityId, path: 'data.body', value: body },
				};
				break;
			case 'map':
				command = {
					type: 'map.update-metadata',
					actorId,
					payload: { mapId: view.entityId, description: body },
				};
				break;
			case 'poi':
				command = {
					type: 'map.update-poi',
					actorId,
					payload: { mapId: view.mapId!, poiId: view.entityId, notes: body },
				};
				break;
			case 'content':
				command = {
					type: 'content.update-item',
					actorId,
					payload: { itemId, title: view.title, body, baseRevision: view.revision },
				};
				break;
		}
		const result = await runtime.dispatch(command);
		if (result.status !== 'accepted') {
			Toaster.error(result.rejection.message ?? t('campaign.relationships.saveFailed'));
			return false;
		}
		return true;
	};

	/** Serialises the writes and turns a thrown dispatch into the same failure toast. */
	const run = async (write: () => Promise<boolean>): Promise<boolean> => {
		setBusy(true);
		try {
			return await write();
		} catch {
			Toaster.error(t('campaign.relationships.saveFailed'));
			return false;
		} finally {
			setBusy(false);
		}
	};

	const add = async (sourceId: string, verb: string, targetId: string): Promise<boolean> => {
		const candidates = currentCandidates();
		const target = candidates.find((n) => n.id === targetId);
		const trimmedVerb = verb.trim().toLowerCase();
		if (!sourceId || !target || trimmedVerb === '' || sourceId === targetId) return false;
		if (resolvableTargets([target], candidates).length === 0) {
			Toaster.error(t('campaign.relationships.saveFailed'));
			return false;
		}
		const declaration = serializeRelationDeclaration({
			verb: trimmedVerb,
			targetName: target.title,
		});
		const ok = await run(() =>
			writeRelations(sourceId, (current) =>
				current.includes(declaration) ? current : [...current, declaration],
			),
		);
		if (ok) Toaster.success(t('campaign.relationships.added'));
		return ok;
	};

	const remove = async (edge: TypedRelationEdge): Promise<boolean> => {
		const ok = await run(() =>
			writeRelations(edge.sourceId, (current) =>
				current.filter(
					(line) =>
						!parseRelationDeclarations([line]).some(
							(d) =>
								d.verb === edge.verb &&
								d.targetName.trim().toLowerCase() === edge.targetTitle.trim().toLowerCase(),
						),
				),
			),
		);
		if (ok) Toaster.success(t('campaign.relationships.removed'));
		return ok;
	};

	return { busy, add, remove };
}

export function Relationships() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const [sourceId, setSourceId] = useState('');
	const [verb, setVerb] = useState('');
	const [targetId, setTargetId] = useState('');
	const [pendingRemove, setPendingRemove] = useState<TypedRelationEdge | null>(null);
	const canAuthor = actorCanAuthorContent(runtime.state.permissions, actorId);
	const writer = useRelationshipWriter();
	const busy = writer.busy;

	const candidates: ActorWikilinkTarget[] = useMemo(
		() =>
			buildWikilinkCandidatesForActor(
				runtime.state.content,
				runtime.state.permissions,
				actorId,
				runtime.state,
			),
		[runtime.state, actorId],
	);

	const notes = useMemo(
		() => [...candidates].sort((a, b) => a.title.localeCompare(b.title)),
		[candidates],
	);
	const targets = useMemo(() => resolvableTargets(notes, candidates), [notes, candidates]);

	const edges: TypedRelationEdge[] = useMemo(
		() =>
			getTypedRelationshipEdgesForActor(
				runtime.state.content,
				runtime.state.permissions,
				actorId,
				runtime.state,
			),
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

	const addEdge = async () => {
		if (await writer.add(sourceId, verb, targetId)) {
			setVerb('');
			setTargetId('');
		}
	};

	const removeEdge = async (edge: TypedRelationEdge) => {
		if (await writer.remove(edge)) setPendingRemove(null);
	};

	return (
		<Page max={1000}>
			<BackBar to="/campaign" label={t('campaign.relationships.back')} />
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
				<Panel
					title={t('campaign.relationships.title')}
					action={<Badge status="neutral">{edges.length}</Badge>}
				>
					<div
						style={{
							font: `var(--text-sm) ${T.sans}`,
							color: T.sub,
							marginBottom: 'var(--space-3)',
						}}
					>
						{t('campaign.relationships.intro')}
					</div>
					{edges.length === 0 ? (
						<EmptyState illustration="graph-empty" title={t('campaign.relationships.empty')} />
					) : (
						<div
							style={{
								position: 'relative',
								borderRadius: 'var(--space-3)',
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
										padding: 'var(--space-1-5) var(--space-2)',
										borderRadius: 'var(--space-5)',
										border: `1.5px solid ${T.accBd}`,
										background: `color-mix(in srgb, ${T.acc} 14%, ${T.surf})`,
										font: `600 var(--text-xs) ${T.sans}`,
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
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 'var(--space-1-5)',
								marginTop: 'var(--space-3)',
							}}
						>
							{edges.map((edge, i) => (
								<div
									key={`${edge.sourceId}-${edge.verb}-${edge.targetId}-${i}`}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 'var(--space-2)',
										padding: 'var(--space-2) var(--space-2)',
										border: `1px solid ${T.bd}`,
										borderRadius: 'var(--space-2)',
										background: T.surf,
									}}
								>
									<span style={{ font: `var(--text-sm) ${T.sans}`, flex: 1, minWidth: 0 }}>
										<strong>{edge.sourceTitle}</strong> — {edge.verb} →{' '}
										<strong>{edge.targetTitle}</strong>
									</span>
									{canAuthor && (
										<IconButton
											style={{ minWidth: 'var(--space-12)', minHeight: 'var(--space-12)' }}
											icon="delete"
											label={t('campaign.relationships.remove', {
												source: edge.sourceTitle,
												target: edge.targetTitle,
											})}
											variant="ghost"
											size="sm"
											disabled={busy}
											onClick={() => setPendingRemove(edge)}
										/>
									)}
								</div>
							))}
						</div>
					)}
				</Panel>

				{canAuthor && (
					<Panel title={t('campaign.relationships.addTitle')}>
						<div
							style={{
								display: 'flex',
								gap: 'var(--space-2)',
								flexWrap: 'wrap',
								alignItems: 'flex-end',
							}}
						>
							<Field label={t('campaign.relationships.source')} style={{ flex: '1 1 200px' }}>
								<Select
									value={sourceId}
									onChange={(e: { target: { value: string } }) => setSourceId(e.target.value)}
									options={[
										{ value: '', label: t('campaign.relationships.choose') },
										...notes.map((n) => ({
											value: n.id,
											label: n.title,
											group: wikilinkKindLabel(n.kind, t),
										})),
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
										...targets.map((n) => ({
											value: n.id,
											label: n.title,
											group: wikilinkKindLabel(n.kind, t),
										})),
									]}
								/>
							</Field>
							<Button
								variant="secondary"
								icon="add"
								disabled={
									busy ||
									!sourceId ||
									!targets.some((target) => target.id === targetId) ||
									verb.trim() === '' ||
									sourceId === targetId
								}
								onClick={addEdge}
							>
								{t('campaign.relationships.add')}
							</Button>
						</div>
					</Panel>
				)}
			</div>
			<Dialog
				open={!!pendingRemove}
				onClose={() => setPendingRemove(null)}
				title={t('campaign.relationships.confirmRemove', {
					source: pendingRemove?.sourceTitle ?? '',
					verb: pendingRemove?.verb ?? '',
					target: pendingRemove?.targetTitle ?? '',
				})}
				description={t('campaign.relationships.removeHelp')}
				tone="danger"
				size="sm"
				dismissible={!busy}
				initialFocus="[data-cancel-remove]"
				footer={
					<>
						<Button data-cancel-remove disabled={busy} onClick={() => setPendingRemove(null)}>
							{t('common.action.cancel')}
						</Button>
						<Button
							disabled={busy || !canAuthor}
							onClick={() => pendingRemove && void removeEdge(pendingRemove)}
						>
							{t('campaign.relationships.confirmAction')}
						</Button>
					</>
				}
			/>
		</Page>
	);
}

/**
 * RC-KNW-6.6 — a Story card's relationships tray: the typed edges with this entity at either end, the
 * notes that mention it, and an inline "Add relationship" that writes through `useRelationshipWriter`,
 * the same body write as the overview above. Every list arrives actor-filtered from the caller.
 */
export function StoryLinks({
	entity,
	edges,
	mentions,
	candidates,
	canAuthor,
	incomingFirst = false,
	children,
}: {
	entity: { id: string; title: string };
	edges: TypedRelationEdge[];
	mentions: Mention[];
	candidates: ActorWikilinkTarget[];
	canAuthor: boolean;
	/** Start the form at "… → this" (a faction or quest is usually the far end of an edge). */
	incomingFirst?: boolean;
	/** Card actions that sit beside "Add relationship" (the NPC card's "Open sheet"). */
	children?: ReactNode;
}) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [adding, setAdding] = useState(false);
	const tray = useRef<HTMLElement>(null);
	const edgesLabel = useId();
	const mentionsLabel = useId();
	const restore = useRef(false);
	// Back to the launcher after React has re-mounted it — a frame queued from `close` can run before
	// that commit when the save was asynchronous (DS Button takes no ref under React 18).
	useEffect(() => {
		if (adding || !restore.current) return;
		restore.current = false;
		tray.current?.querySelector<HTMLButtonElement>('[data-story-links-add]')?.focus();
	}, [adding]);
	const close = () => {
		restore.current = true;
		setAdding(false);
	};
	const line = {
		font: `var(--text-sm)/1.5 ${T.sans}`,
		color: T.sub,
		margin: T.space.zero,
	} as const;
	const list = { listStyle: 'none', margin: T.space.zero, padding: T.space.zero } as const;
	return (
		<section
			ref={tray}
			aria-label={t('campaign.links.region', { title: entity.title })}
			data-story-links={entity.id}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				padding: 'var(--space-3)',
				border: `1px solid ${T.bd}`,
				borderRadius: 'var(--radius-md)',
				background: T.sunken,
				overflowWrap: 'anywhere',
			}}
		>
			<div id={edgesLabel} style={eb}>
				{t('campaign.links.title')}
			</div>
			{edges.length === 0 ? (
				<p style={{ ...line, color: T.ter }}>{t('campaign.links.none')}</p>
			) : (
				<ul aria-labelledby={edgesLabel} style={list}>
					{edges.map((edge) => (
						<li key={`${edge.sourceId}-${edge.verb}-${edge.targetId}`} style={line}>
							<strong style={{ color: edge.sourceId === entity.id ? T.sub : T.ink }}>
								{edge.sourceTitle}
							</strong>{' '}
							— {edge.verb} →{' '}
							<strong style={{ color: edge.targetId === entity.id ? T.sub : T.ink }}>
								{edge.targetTitle}
							</strong>
						</li>
					))}
				</ul>
			)}
			{mentions.length > 0 && (
				<>
					<div id={mentionsLabel} style={eb}>
						{t('campaign.links.mentions')}
					</div>
					<ul
						aria-labelledby={mentionsLabel}
						style={{ ...list, display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}
					>
						{mentions.map((note) => (
							<li key={note.id}>
								<Button variant="ghost" size="sm" icon="note" onClick={() => navigate(note.route)}>
									{note.title}
								</Button>
							</li>
						))}
					</ul>
				</>
			)}
			{adding && (
				<AddRelationshipForm
					entity={entity}
					candidates={candidates}
					incomingFirst={incomingFirst}
					onDone={close}
				/>
			)}
			{(canAuthor || children) && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
					{canAuthor && !adding && (
						<Button
							data-story-links-add
							variant="ghost"
							size="sm"
							icon="add"
							aria-label={t('campaign.links.addFor', { title: entity.title })}
							onClick={() => setAdding(true)}
						>
							{t('campaign.links.add')}
						</Button>
					)}
					{children}
				</div>
			)}
		</section>
	);
}

/** The inline form: a direction, a verb (with the overview's suggestions) and the other end. */
function AddRelationshipForm({
	entity,
	candidates,
	incomingFirst,
	onDone,
}: {
	entity: { id: string; title: string };
	candidates: ActorWikilinkTarget[];
	incomingFirst: boolean;
	onDone: () => void;
}) {
	const { t } = useI18n();
	const writer = useRelationshipWriter();
	const verbsId = useId();
	const [incoming, setIncoming] = useState(incomingFirst);
	const [verb, setVerb] = useState('');
	const [otherId, setOtherId] = useState('');
	const others = useMemo(() => {
		const sorted = candidates
			.filter((c) => c.id !== entity.id)
			.sort((a, b) => a.title.localeCompare(b.title));
		// Only the far end of an outgoing edge is written by title, so only it must resolve uniquely.
		return incoming ? sorted : resolvableTargets(sorted, candidates);
	}, [candidates, entity.id, incoming]);
	const ready = verb.trim() !== '' && others.some((o) => o.id === otherId) && !writer.busy;
	const submit = async () => {
		if (!ready) return;
		const ok = incoming
			? await writer.add(otherId, verb, entity.id)
			: await writer.add(entity.id, verb, otherId);
		if (ok) onDone();
	};
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
			style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'flex-end' }}
		>
			<Field label={t('campaign.links.direction')} style={{ flex: '1 1 140px' }}>
				<Select
					value={incoming ? 'in' : 'out'}
					onChange={(e: { target: { value: string } }) => setIncoming(e.target.value === 'in')}
					options={[
						{ value: 'out', label: t('campaign.links.outgoing', { title: entity.title }) },
						{ value: 'in', label: t('campaign.links.incoming', { title: entity.title }) },
					]}
				/>
			</Field>
			<Field label={t('campaign.relationships.verb')} style={{ flex: '1 1 120px' }}>
				<Input
					value={verb}
					list={verbsId}
					placeholder={t('campaign.relationships.verbPlaceholder')}
					onChange={(e: { target: { value: string } }) => setVerb(e.target.value)}
				/>
			</Field>
			{/* A sibling of the Field for the same reason as the overview's datalist above. */}
			<datalist id={verbsId}>
				{SUGGESTED_VERBS.map((v) => (
					<option key={v} value={v} />
				))}
			</datalist>
			<Field label={t('campaign.links.other')} style={{ flex: '1 1 160px' }}>
				<Select
					value={otherId}
					onChange={(e: { target: { value: string } }) => setOtherId(e.target.value)}
					options={[
						{ value: '', label: t('campaign.relationships.choose') },
						...others.map((n) => ({
							value: n.id,
							label: n.title,
							group: wikilinkKindLabel(n.kind, t),
						})),
					]}
				/>
			</Field>
			<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
				<Button type="submit" variant="secondary" size="sm" icon="add" disabled={!ready}>
					{t('campaign.relationships.add')}
				</Button>
				<Button type="button" variant="ghost" size="sm" disabled={writer.busy} onClick={onDone}>
					{t('common.action.cancel')}
				</Button>
			</div>
		</form>
	);
}
