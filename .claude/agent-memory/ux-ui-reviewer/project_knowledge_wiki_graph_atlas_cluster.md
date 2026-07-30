---
name: knowledge-wiki-graph-atlas-cluster
description: Structural notes + still-open defects for screens/{Knowledge,WikiReader,Graph,Atlas}.tsx as of 2026-07-29 (post commit 5274a5f9)
metadata:
  type: project
---

## Surface map (verify before citing — true as of commit 5274a5f9)
- `Knowledge.tsx` — notes list/editor. Own markdown renderer `mdToNodes`/`boldify` (NOT shared with
  WikiReader — duplicated, so fixes must land in both). `NoteViewer` is the note detail/edit view;
  `Composer`/`ImportPanel` are inline (non-modal) create/import forms.
- `WikiReader.tsx` — the PUBLIC, account-less reader (`#/wiki?id=`), chrome-less. Has its OWN copy of
  `mdToNodes`/`boldify` (same bug surface as Knowledge's, separately maintained).
- `Graph.tsx` — read-only relationship graph + faceted search over `getGraphVisualizationForActor`.
  Genuinely solid: `aria-pressed` on facet chips, real `<button>` nodes with computed `aria-label`,
  focus ring restored on the search input, node-label 7px-clip fixed (all confirmed fixed in
  commit 5274a5f9 — do not re-report). No further defects found here this pass.
- `Atlas.tsx` — map library shell around `MapCanvas`/`MapBuilder` (shared with the map-editor cluster,
  see `reference_map_editor_cluster.md`). Atlas itself (chip switcher, layer/POI side rails, notice
  banner, New-map toggle) is Atlas-owned code distinct from the MapBuilder overlay.

## Confirmed STILL-OPEN defects this pass (2026-07-29)
1. **Inert `[[wikilinks]]` — both renderers.** `Knowledge.tsx boldify` (~98-114) and
   `WikiReader.tsx boldify` (~58-75) paint `[[Target]]` in accent color as a bare `<span>` — no
   onClick, no keyboard target, no navigation. The resolution engine EXISTS and is unused anywhere in
   `apps/gm-react`: `packages/core/src/queries/wikilink-graph.ts` exports
   `resolveWikilinkForActor(content, permissions, actorId, {target, section})` →
   `WikilinkResolution`, built on the SAME actor-filtered candidate index Knowledge's own
   `getNoteRelationshipsForActor` backlinks panel uses. For Knowledge, wiring means: in `mdToNodes`/
   `boldify`, resolve `p.slice(2,-2)` through `resolveWikilinkForActor` and render a `RelRow`-style
   button that calls the existing `onOpen(id)` prop when resolved. For WikiReader there is no
   core/actor context (public reader) — but it doesn't need one: `wiki.pages` is already the full
   loaded array of `{slug, title, markdown}`, so a wikilink can resolve client-side by matching
   `p.title === target` and calling `setOpenSlug(p.slug)` — zero new API calls.
2. **Knowledge "Push to players" has no confirm and no undo, unlike its ConnectedSources sibling.**
   `NoteViewer.setVisibility` (~287-298) is called directly from the IconButton at ~359-367, the
   Button at ~429-440, AND the `Seg` at ~428 (any segment tap, not just the push shortcut) — one
   click/tap flips `dm-only → player-visible` (or via Seg, → any level including `shared`) with zero
   confirmation and no Toaster undo. `ConnectedSources.tsx` (~519-577) Dialog-gates the analogous
   dm-only→external-Doc push. Knowledge has no `Dialog` import at all.
3. **Orphan `<li>` outside `<ul>`/`<ol>` — both renderers.** `Knowledge.tsx mdToNodes` (~164-169) and
   `WikiReader.tsx mdToNodes` (~142-154) return bare `<li>` nodes interleaved with `<p>`/`<h2>` inside
   a plain `<div>` (no list wrapper ever introduced) — invalid HTML, breaks screen-reader list
   semantics (WCAG 1.3.1). Would need to group consecutive `- ` lines into a wrapping `<ul>`.
4. **Missing `role="status"`/`aria-live` on async result banners** — a recurring gap; Board.tsx/
   SceneEditor.tsx already got this treatment (role=status / role=alert) in commit 5274a5f9 but it
   was not extended to:
   - `Atlas.tsx` top notice bar (~483-510) — surfaces link-copy confirmations, projection results,
     and command rejections.
   - `Knowledge.tsx` `NoteViewer` save/visibility error text (~391, ~411-413) and `ImportPanel`
     result message (~622).
   - `WikiReader.tsx` password-wrong/invalid/missing phases (~276-323) — only the `loading` phase
     (~248-261) has `role="status" aria-live="polite"`; a fetch failure AFTER loading is silent to AT.
5. **`Atlas.tsx` "New map" toggle (~471-480) has no `aria-expanded`.** It mutually shows/hides the
   inline `MapCreationForm`, the exact disclosure-toggle contract Knowledge's Sources/Import/New-note
   buttons already got `aria-expanded` for in commit 5274a5f9 — Atlas's analogous toggle was missed.
6. **`WikiReader.tsx` nav `position: sticky` (~382-383) is unconditional even under `isPhone`.** The
   comment at ~365 explains the single-column phone stack (nav first, article below) but doesn't
   account for the sticky nav pinning across a short phone viewport for a many-page wiki, squeezing
   the article. Minor/P3 — verify visually before treating as more than polish.

## Verified NON-defects (checked, do not re-report)
- `Seg` (screen-kit.tsx ~127) now has full roving-tabindex + arrow-key radiogroup contract (fixed in
  5274a5f9) — Knowledge's note-visibility `Seg` at ~428 is fine mechanically (its BUG is #2 above,
  the missing confirm, not keyboard access).
- `Card interactive` (ds/components/core/Card.jsx ~8-25) already provides role=button/tabIndex/
  Enter+Space keydown when `interactive && onClick` — Knowledge's note-card grid (~838) is fine.
- Graph.tsx: no defects found this pass — genuinely solid (see surface map above).
- Atlas layer/POI row controls (reorder chevrons, visibility toggle, delete) are real `<button>`s with
  `aria-label`s; POI delete already has the Toaster-Undo pattern (soft-delete → `map.create-poi`
  re-creation), consistent with project convention — not a violation.
