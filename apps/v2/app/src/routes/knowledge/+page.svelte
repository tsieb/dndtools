<script lang="ts">
	import NotesWorkbench from '$lib/gui/NotesWorkbench.svelte';
	import VaultObjects from '$lib/gui/VaultObjects.svelte';
	import TemplatesAndSnippets from '$lib/gui/TemplatesAndSnippets.svelte';
	import CalendarContent from '$lib/gui/CalendarContent.svelte';
	import CalendarDiscovery from '$lib/gui/CalendarDiscovery.svelte';
	import SavedSearches from '$lib/gui/SavedSearches.svelte';
	import ContentVisibilityEmbeds from '$lib/gui/ContentVisibilityEmbeds.svelte';
	import ContentImportExport from '$lib/gui/ContentImportExport.svelte';
	import ContentSourceConstraints from '$lib/gui/ContentSourceConstraints.svelte';

	// CONTENT-001 / CONTENT-002 / CONTENT-003 / CONTENT-004 / CONTENT-005 / CONTENT-006 / CONTENT-009 /
	// CONTENT-010 / CONTENT-011 / CONTENT-012 / CONTENT-013: the Knowledge section. Markdown notes are the PRIMARY content unit
	// (NotesWorkbench: CRUD + recoverable soft-delete/restore + search + the markdown editor with save
	// status, validation, preview, and actor-filtered wikilink assistance). VaultObjects adds STRUCTURED
	// OBJECTS (the schema-validated, note-backed records + the subtype schema registry) and the WIKILINK
	// LIFECYCLE (rename-propagation + repair). TemplatesAndSnippets adds CONTENT-003 templates (create from
	// starter presets with variables, validate-before-write) and CONTENT-004 snippets (insert reusable
	// markdown that funnels through the SAME validation + sanitization + visibility pipeline as hand-typed
	// content). ContentVisibilityEmbeds adds CONTENT-009 GRANULAR VISIBILITY (the DM authors section/field
	// visibility on a note/object; the actor-filtered detail view omits what a player may not see, with
	// field>section>entity precedence) and CONTENT-010 EMBEDS BY REFERENCE (the DM embeds a reference to
	// another item; the embed resolves the LIVE target through the actor-filtered query, so a player
	// viewing a host that embeds a hidden target sees a non-leaking unavailable placeholder — no clone).
	// It also surfaces calendar/custom-time content, SRCH-010 calendar/custom-time DISCOVERY (search and
	// filter visible dated content by a custom-calendar date range + text, across notes, timeline links,
	// and — for the DM only — session chronology; hidden events and revealing counts are omitted),
	// SRCH-003/004 FILTERS + SAVED SEARCHES (filter search by source/content-type/tag/folder/date/relationship;
	// the DM saves, pins, and deletes named searches; a dm-only saved search is absent for players and every
	// saved search is re-evaluated LIVE so no stale result leaks a now-hidden item),
	// import/export, and the SOURCE-SPECIFIC
	// CONSTRAINTS surface (CONTENT-012): a pre-write diagnostic of what a write to local markdown / Obsidian /
	// Google Docs would lose or downgrade, gated fail-closed behind acknowledgment. Which authoring
	// affordances appear is an ergonomic role hint; the AUTHORITATIVE permission and visibility enforcement
	// lives in the Processing Core, so a player rendering this page can only see/edit what the core permits
	// (fail-closed).
</script>

<section data-testid="knowledge-view" aria-label="Knowledge">
	<p class="meta">
		Campaign notes, lore, and calendar-aware content. The DM (or an authorized editor) creates and
		edits markdown notes; players see only what their visibility permits.
	</p>

	<NotesWorkbench />
	<VaultObjects />
	<TemplatesAndSnippets />
	<CalendarContent />
	<CalendarDiscovery />
	<SavedSearches />
	<ContentVisibilityEmbeds />
	<ContentImportExport />
	<ContentSourceConstraints />
</section>
