import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { actorCanAuthorContent, getContentItemsForActor } from '@dndtools/core';
import { Button, Card, EmptyState, Icon, Toaster, VisibilityChip } from '../../ds';
import { ListDetail, Page, T, srOnly } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { ConnectedSourcesPanel } from '../../app/ConnectedSources';
import { META, VIS_CHIP } from './shared';
import { parseArchive, snippetOf } from './markdown';
import { useI18n } from '../../i18n';
import { NoteListMetadata } from './NoteListMetadata';
import { NoteViewer } from './NoteViewer';
import { Composer } from './Composer';
import { ImportPanel } from './ImportPanel';
import { TemplatesPanel } from './Templates';
import { FiltersPanel } from './Filters';

export { parseWikilink } from './markdown';

/**
 * Knowledge — notes / handouts / read-aloud, wired to the live Processing Core.
 * The list reads the actor-filtered content model (`getContentItemsForActor`); a
 * player/observer therefore sees ONLY the notes shared with them, never the DM's dm-only material.
 * Opening a note gives a real editor whose Save PERSISTS through `content.update-item`; New note and
 * Import dispatch the real `content.create-item` / `content.commit-import` commands; the visibility
 * control + "Push to players" are the real `content.set-item-visibility` (the cross-surface
 * invalidation trigger). Backlinks/Related come from the real `getNoteRelationshipsForActor` graph.
 * Mirrors the production `routes/knowledge` NotesWorkbench wiring.
 */

/** The five disclosures above the note list. At most one is open at a time. */
type LibraryPanel = 'filters' | 'sources' | 'import' | 'templates' | 'compose';

export function Knowledge() {
	const { t, formatDate, formatRelativeTime } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const location = useLocation();
	// URL-driven detail (`/knowledge/:id`) so Story thread cards, palette search hits, and
	// character-sheet mentions can open the exact note.
	const { id: detailId = null } = useParams<{ id: string }>();
	const actorId = runtime.defaultActorId;
	const canAuthor = actorCanAuthorContent(runtime.state.permissions, actorId);

	const notes = useMemo(
		() =>
			getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId).filter(
				(n) => n.kind === 'note',
			),
		[runtime.state, actorId],
	);

	// One state for the five mutually exclusive disclosures, so opening one closes the rest by
	// construction (they used to be five booleans, each toggle resetting the other four by hand, and
	// a missed reset left two stacked open against their own aria-expanded). Filters is the one that
	// is NOT author-gated: a player can search what they can see and run a saved search shared with
	// them (RC-KNW-2.1). Templates is RC-KNW-1.3; Sources is WS-7.
	const [panel, setPanel] = useState<LibraryPanel | null>(null);
	const toggle = (next: LibraryPanel) => setPanel((current) => (current === next ? null : next));
	// On a phone the four secondary toggles show their icon only, so the header stays one row with
	// New note; the word stays the accessible name and the tooltip.
	const iconOnly = useViewport() === 'phone';
	const toggleLabel = (text: string) =>
		iconOnly ? { children: <span style={srOnly}>{text}</span>, title: text } : { children: text };
	const [filterSeed, setFilterSeed] = useState('');
	// RC-KNW-2.1 — the palette's `>search saved` handoff names a stored saved search to restore into
	// the filter editor. The nonce remounts the panel even when the same saved search is picked
	// twice, so re-running it from the palette always puts its criteria back.
	const [filterSavedId, setFilterSavedId] = useState('');
	const [filterNonce, setFilterNonce] = useState(0);
	const [busy, setBusy] = useState(false);
	const [importMsg, setImportMsg] = useState<string | null>(null);
	const [importFailed, setImportFailed] = useState(false);

	// Create-intent handoff from "New note" launchers elsewhere (home hub, ⌘K): open the composer
	// immediately instead of landing the user on the list with nothing happening.
	useEffect(() => {
		const intent = (location.state ?? null) as {
			create?: boolean;
			search?: string;
			savedSearchId?: string;
		} | null;
		if (intent?.create) {
			setPanel('compose');
			navigate(location.pathname, { replace: true, state: null });
		} else if (typeof intent?.savedSearchId === 'string' && intent.savedSearchId !== '') {
			// ⌘K `>search saved` picked a stored search: open the panel with its criteria restored,
			// not with the note list and a name the DM then has to find again.
			setFilterSeed('');
			setFilterSavedId(intent.savedSearchId);
			setFilterNonce((n) => n + 1);
			setPanel('filters');
			navigate(location.pathname, { replace: true, state: null });
		} else if (typeof intent?.search === 'string') {
			// The Graph hands its typed query over to the vault search rather than dropping the user
			// on the note list with the words they just typed thrown away.
			setFilterSeed(intent.search);
			setFilterSavedId('');
			setFilterNonce((n) => n + 1);
			setPanel('filters');
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.state, location.pathname, navigate]);

	const open = detailId ? (notes.find((n) => n.id === detailId) ?? null) : null;
	// `key={open.id}` REMOUNTS the editor when navigating between notes (e.g. via a backlink/related
	// row), resetting the draft/edit state — without it React reuses the instance and a Save could
	// persist note A's draft into note B. Same-note re-renders keep the instance (id unchanged).
	const viewer = open ? (
		<NoteViewer
			key={open.id}
			note={open}
			canAuthor={canAuthor}
			onBack={() => navigate('/knowledge')}
			onOpen={(id) => navigate(`/knowledge/${id}`)}
		/>
	) : null;

	async function createNote(title: string) {
		setBusy(true);
		try {
			// content.create-item — vault-level authoring (DM only). Strict payload; visibility fails closed
			// to dm-only. The new id is read from the emitted `content.item-changed` event (demo-seed pattern).
			const result = await runtime.dispatch({
				type: 'content.create-item',
				actorId,
				payload: { kind: 'note', title, body: '', visibility: 'dm-only' },
			});
			if (result.status === 'accepted') {
				setPanel(null);
				const created = result.events.find(
					(e) => (e as { kind?: string }).kind === 'content.item-changed',
				) as { itemId?: string } | undefined;
				if (created?.itemId) navigate(`/knowledge/${created.itemId}`);
			} else {
				// The composer used to close unconditionally and the rejection was dropped on the floor:
				// the form vanished, the typed title went with it, no note appeared and nothing said why.
				// Staying open keeps the title so the DM can act on the reason and retry.
				Toaster.error(result.rejection.message);
			}
		} catch (error) {
			// A thrown persist failure otherwise froze Create AND Cancel with the typed title inside.
			Toaster.error(error instanceof Error ? error.message : t('knowledge.createFailed'));
		} finally {
			setBusy(false);
		}
	}

	async function runImport(text: string, policy: string) {
		setBusy(true);
		setImportMsg(null);
		// Reset the TONE with the message. Leaving `importFailed` set kept the status host wired to
		// the error colour and warning glyph while it had no text, so the next attempt's result
		// flashed through the previous attempt's skin.
		setImportFailed(false);
		const files = parseArchive(text);
		try {
			// content.commit-import — transactional markdown-archive import (DM only). `appliedEntryIds: []`
			// means "apply every entry" (the field exists for resumed/selective imports).
			const result = await runtime.dispatch({
				type: 'content.commit-import',
				actorId,
				payload: { sourceKind: 'markdown-archive', policy, files, appliedEntryIds: [] },
			});
			if (result.status === 'accepted') {
				const ev = result.events.find(
					(e) => (e as { kind?: string }).kind === 'content.import-committed',
				) as { createdItemIds?: string[]; overwrittenItemIds?: string[] } | undefined;
				const created = ev?.createdItemIds?.length ?? 0;
				const over = ev?.overwrittenItemIds?.length ?? 0;
				setImportFailed(false);
				setImportMsg(
					over > 0
						? t('knowledge.importedWithOverwrites', { created, overwritten: over })
						: t('knowledge.imported', { created }),
				);
			} else {
				setImportFailed(true);
				setImportMsg(result.rejection.message);
			}
		} catch (error) {
			// Without this, a thrown persist failure froze Import AND Close with the pasted archive
			// still in the box and no message at all.
			setImportFailed(true);
			setImportMsg(error instanceof Error ? error.message : t('knowledge.importFailed'));
		} finally {
			setBusy(false);
		}
	}

	const library = (
		<Page max={1180}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					flexWrap: 'wrap',
					gap: T.space.three,
					marginBottom: T.space.four,
				}}
			>
				{/* The list's own heading, under the shell's <h1>: how many notes this reader can see. */}
				<h2
					style={{
						flex: '1 1 auto',
						margin: T.space.zero,
						font: `600 var(--text-sm) ${T.sans}`,
						color: T.sub,
					}}
				>
					{t('knowledge.listHeading', { count: notes.length })}
				</h2>
				{/* Disclosure toggles: each carries aria-expanded, since the open state was otherwise
				    invisible to assistive tech. Only New note is gold; the rest are quiet until open. */}
				<Button
					variant={panel === 'filters' ? 'secondary' : 'ghost'}
					size="sm"
					icon="search"
					aria-expanded={panel === 'filters'}
					data-testid="knowledge-filters-toggle"
					onClick={() => toggle('filters')}
					{...toggleLabel(t('knowledge.filters.open'))}
				/>
				{canAuthor && (
					<>
						<Button
							variant={panel === 'sources' ? 'secondary' : 'ghost'}
							size="sm"
							icon="vault"
							aria-expanded={panel === 'sources'}
							onClick={() => toggle('sources')}
							{...toggleLabel(t('knowledge.sources'))}
						/>
						<Button
							variant={panel === 'import' ? 'secondary' : 'ghost'}
							size="sm"
							icon="import"
							aria-expanded={panel === 'import'}
							onClick={() => toggle('import')}
							{...toggleLabel(t('knowledge.importVault'))}
						/>
						{/* RC-KNW-1.3 — start a note from a template, keep your own, insert a snippet. */}
						<Button
							variant={panel === 'templates' ? 'secondary' : 'ghost'}
							size="sm"
							icon="duplicate"
							aria-expanded={panel === 'templates'}
							data-testid="knowledge-templates-toggle"
							onClick={() => toggle('templates')}
							{...toggleLabel(t('knowledge.templates'))}
						/>
						{/* Gold only while nothing is open: an open disclosure brings its own primary
						    (Create, Import, Save), and one gold action per region is the rule. */}
						<Button
							variant={panel === null ? 'primary' : 'secondary'}
							size="sm"
							icon="note-edit"
							aria-expanded={panel === 'compose'}
							onClick={() => toggle('compose')}
						>
							{t('knowledge.newNote')}
						</Button>
					</>
				)}
			</div>

			{panel === 'filters' && (
				<FiltersPanel
					key={`${filterNonce}:${filterSavedId}:${filterSeed}`}
					initialQuery={filterSeed}
					initialSavedSearchId={filterSavedId}
				/>
			)}
			{canAuthor && panel === 'compose' && (
				<Composer busy={busy} onCreate={createNote} onCancel={() => setPanel(null)} />
			)}
			{canAuthor && panel === 'templates' && (
				<TemplatesPanel onCreated={(id) => navigate(`/knowledge/${id}`)} />
			)}
			{canAuthor && panel === 'import' && (
				<ImportPanel
					busy={busy}
					message={importMsg}
					failed={importFailed}
					onImport={runImport}
					onCancel={() => {
						setPanel(null);
						setImportMsg(null);
						setImportFailed(false);
					}}
				/>
			)}
			{/* WS-7 — connected vault sources (local folder / Google Docs) pull+push panel. */}
			{canAuthor && panel === 'sources' && <ConnectedSourcesPanel />}

			{notes.length === 0 ? (
				<EmptyState
					illustration="knowledge-empty"
					// A non-author sees this screen through the actor filter, so "Nothing written down"
					// is simply false for them — the DM has written plenty, none of it shared yet. It is
					// also the surface a DM checks with "view as player". Atlas already branches this way.
					title={t(canAuthor ? 'knowledge.emptyDm' : 'knowledge.emptyPlayer')}
					description={t(canAuthor ? 'knowledge.emptyDmBody' : 'knowledge.emptyPlayerBody')}
					action={
						canAuthor ? (
							// Secondary, not a second gold button: the header already offers this same "New
							// note" in accent, and on the rail tier the open note in the detail pane beside
							// this list owns an accent primary of its own (RC-UX-4.3). It opens the SAME
							// disclosure, so it closes whichever one was open, like the header toggle.
							<Button
								variant="secondary"
								size="sm"
								icon="note-edit"
								onClick={() => setPanel('compose')}
							>
								{t('knowledge.newNote')}
							</Button>
						) : undefined
					}
				/>
			) : (
				<ul
					aria-label={t('knowledge.notes')}
					style={{
						listStyle: 'none',
						margin: T.space.zero,
						padding: T.space.zero,
						display: 'grid',
						// A 320px phone has only 292px after the page gutters.  A fixed 300px
						// minimum track made every populated vault horizontally unreachable there.
						gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 300px),1fr))',
						gap: T.space.three,
					}}
				>
					{notes.map((n) => (
						<li key={n.id} style={{ minWidth: 0, display: 'grid', position: 'relative' }}>
							<Card
								style={{ minWidth: 0, overflowWrap: 'anywhere' }}
								elevation="flat"
								interactive
								// The note open in the rail tier's detail pane beside this list (RC-UX-4.3).
								accent={n.id === open?.id}
								aria-current={n.id === open?.id ? 'true' : undefined}
								onClick={() => navigate(`/knowledge/${n.id}`)}
							>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'space-between',
										gap: T.space.two,
										marginBottom: T.space.two,
									}}
								>
									<span style={{ display: 'flex', alignItems: 'center', gap: T.space.oneHalf }}>
										<Icon name="knowledge-book" size="micro" color={T.acc} />
										<span style={META}>{t('knowledge.note')}</span>
									</span>
									<VisibilityChip level={VIS_CHIP[n.visibility] || 'dm-only'} compact />
								</div>
								<div
									style={{
										font: `600 var(--text-base)/var(--leading-snug) ${T.sans}`,
										color: T.ink,
										marginBottom: T.space.one,
									}}
								>
									{n.title}
								</div>
								<NoteListMetadata note={n} />
								<div
									style={{
										font: `var(--text-sm)/1.55 ${T.sans}`,
										color: T.ter,
										display: '-webkit-box',
										WebkitLineClamp: 2,
										WebkitBoxOrient: 'vertical',
										overflow: 'hidden',
									}}
								>
									{snippetOf(n.body, t)}
								</div>
								<div style={{ ...META, marginTop: T.space.two }}>
									<time
										dateTime={n.updatedAt}
										title={formatDate(new Date(n.updatedAt), {
											dateStyle: 'long',
											timeStyle: 'short',
										})}
									>
										{t('knowledge.updated', { when: formatRelativeTime(new Date(n.updatedAt)) })}
									</time>
								</div>
							</Card>
							{/* The DM-only stripe, drawn over the card's inline-start edge rather than as its
							    border: the DS Card repaints every border colour on hover. */}
							{n.visibility === 'dm-only' && (
								<span
									aria-hidden="true"
									style={{
										position: 'absolute',
										insetBlock: 0,
										insetInlineStart: 0,
										width: T.space.one,
										background: T.dm,
										borderStartStartRadius: T.radius.md,
										borderEndStartRadius: T.radius.md,
										pointerEvents: 'none',
									}}
								/>
							)}
						</li>
					))}
				</ul>
			)}
		</Page>
	);

	// RC-UX-4.3 — on the rail tier the open note reads in the detail pane BESIDE the note list;
	// elsewhere it replaces the list as a full page, as before.
	return (
		<ListDetail
			list={library}
			detail={viewer}
			detailKey={open?.id ?? null}
			detailLabel={open?.title ?? ''}
		/>
	);
}
