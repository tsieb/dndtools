import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { actorCanAuthorContent, getContentItemsForActor } from '@dndtools/core';
import { Button, Card, EmptyState, Icon, Toaster, VisibilityChip } from '../../ds';
import { Page, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { ConnectedSourcesPanel } from '../../app/ConnectedSources';
import { VIS_CHIP } from './shared';
import { formatStamp, parseArchive, snippetOf } from './markdown';
import { NoteViewer } from './NoteViewer';
import { Composer } from './Composer';
import { ImportPanel } from './ImportPanel';

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

export function Knowledge() {
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

	const [composing, setComposing] = useState(false);
	const [importing, setImporting] = useState(false);
	const [showSources, setShowSources] = useState(false);
	const [busy, setBusy] = useState(false);
	const [importMsg, setImportMsg] = useState<string | null>(null);
	const [importFailed, setImportFailed] = useState(false);

	// Create-intent handoff from "New note" launchers elsewhere (home hub, ⌘K): open the composer
	// immediately instead of landing the user on the list with nothing happening.
	useEffect(() => {
		const intent = (location.state ?? null) as { create?: boolean } | null;
		if (intent?.create) {
			setComposing(true);
			setImporting(false);
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.state, location.pathname, navigate]);

	const open = detailId ? (notes.find((n) => n.id === detailId) ?? null) : null;
	// `key={open.id}` REMOUNTS the editor when navigating between notes (e.g. via a backlink/related
	// row), resetting the draft/edit state — without it React reuses the instance and a Save could
	// persist note A's draft into note B. Same-note re-renders keep the instance (id unchanged).
	if (open)
		return (
			<NoteViewer
				key={open.id}
				note={open}
				canAuthor={canAuthor}
				onBack={() => navigate('/knowledge')}
				onOpen={(id) => navigate(`/knowledge/${id}`)}
			/>
		);

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
				setComposing(false);
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
			Toaster.error(
				error instanceof Error ? error.message : 'The note couldn’t be created — try again.',
			);
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
				setImportMsg(`Imported ${created} new${over ? `, ${over} overwritten` : ''}.`);
			} else {
				setImportFailed(true);
				setImportMsg(result.rejection.message);
			}
		} catch (error) {
			// Without this, a thrown persist failure froze Import AND Close with the pasted archive
			// still in the box and no message at all.
			setImportFailed(true);
			setImportMsg(
				error instanceof Error ? error.message : 'The import couldn’t be completed — try again.',
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Page max={1180}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'flex-end',
					flexWrap: 'wrap',
					gap: 12,
					marginBottom: 18,
				}}
			>
				{canAuthor && (
					<>
						{/* These three are disclosure toggles that mutually collapse each other, so each
						    needs aria-expanded — open state was otherwise invisible to assistive tech. */}
						<Button
							variant={showSources ? 'secondary' : 'ghost'}
							size="sm"
							icon="vault"
							aria-expanded={showSources}
							onClick={() => {
								setShowSources((v) => !v);
								setComposing(false);
								setImporting(false);
							}}
						>
							Sources
						</Button>
						<Button
							variant={importing ? 'secondary' : 'ghost'}
							size="sm"
							icon="import"
							aria-expanded={importing}
							onClick={() => {
								setImporting((v) => !v);
								setComposing(false);
								setShowSources(false);
							}}
						>
							Import vault
						</Button>
						<Button
							variant="primary"
							size="sm"
							icon="note-edit"
							aria-expanded={composing}
							onClick={() => {
								setComposing((v) => !v);
								setImporting(false);
								setShowSources(false);
							}}
						>
							New note
						</Button>
					</>
				)}
			</div>

			{canAuthor && composing && (
				<Composer busy={busy} onCreate={createNote} onCancel={() => setComposing(false)} />
			)}
			{canAuthor && importing && (
				<ImportPanel
					busy={busy}
					message={importMsg}
					failed={importFailed}
					onImport={runImport}
					onCancel={() => {
						setImporting(false);
						setImportMsg(null);
						setImportFailed(false);
					}}
				/>
			)}
			{/* WS-7 — connected vault sources (local folder / Google Docs) pull+push panel. */}
			{canAuthor && showSources && <ConnectedSourcesPanel />}

			{notes.length === 0 ? (
				<EmptyState
					icon="knowledge-book"
					// A non-author sees this screen through the actor filter, so "Nothing written down"
					// is simply false for them — the DM has written plenty, none of it shared yet. It is
					// also the surface a DM checks with "view as player". Atlas already branches this way.
					title={canAuthor ? 'Nothing written down' : 'Nothing shared with you yet'}
					description={
						canAuthor
							? 'Notes, handouts and read-aloud text live here. Backlinks connect them automatically.'
							: 'Notes and handouts your DM shares with the table will appear here.'
					}
					action={
						canAuthor ? (
							<Button
								variant="primary"
								size="sm"
								icon="note-edit"
								// The three disclosures are mutually exclusive, but this second entry point
								// only ever opened the composer — so Import vault + the composer could be
								// stacked open at once, contradicting their own aria-expanded state.
								onClick={() => {
									setComposing(true);
									setImporting(false);
									setShowSources(false);
								}}
							>
								New note
							</Button>
						) : undefined
					}
				/>
			) : (
				<div
					style={{
						display: 'grid',
						// A 320px phone has only 292px after the page gutters.  A fixed 300px
						// minimum track made every populated vault horizontally unreachable there.
						gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 300px),1fr))',
						gap: 14,
					}}
				>
					{notes.map((n) => (
						<Card
							key={n.id}
							elevation="flat"
							interactive
							onClick={() => navigate(`/knowledge/${n.id}`)}
						>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: 8,
									marginBottom: 7,
								}}
							>
								<span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
									<Icon name="knowledge-book" size={15} color={T.acc} />
									<span style={{ font: `11px ${T.sans}`, color: T.ter }}>Note</span>
								</span>
								<VisibilityChip level={VIS_CHIP[n.visibility] || 'dm-only'} compact />
							</div>
							<div style={{ font: `600 14.5px ${T.sans}`, marginBottom: 5 }}>{n.title}</div>
							<div
								style={{
									font: `12.5px/1.55 ${T.sans}`,
									color: T.ter,
									display: '-webkit-box',
									WebkitLineClamp: 2,
									WebkitBoxOrient: 'vertical',
									overflow: 'hidden',
								}}
							>
								{snippetOf(n.body)}
							</div>
							<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 9 }}>
								updated {formatStamp(n.updatedAt)}
							</div>
						</Card>
					))}
				</div>
			)}
		</Page>
	);
}
