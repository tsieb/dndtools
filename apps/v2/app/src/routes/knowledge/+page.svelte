<script lang="ts">
	import NotesWorkbench from '$lib/gui/NotesWorkbench.svelte';
	import CalendarContent from '$lib/gui/CalendarContent.svelte';
	import ContentImportExport from '$lib/gui/ContentImportExport.svelte';
	import ContentSourceConstraints from '$lib/gui/ContentSourceConstraints.svelte';

	// CONTENT-001 / CONTENT-002 / CONTENT-011 / CONTENT-012: the Knowledge section. Markdown notes are the
	// PRIMARY content unit (NotesWorkbench: CRUD + recoverable soft-delete/restore + search + the markdown
	// editor with save status, validation, preview, and actor-filtered wikilink assistance). It also
	// surfaces the calendar/custom-time content capability, import/export, and the SOURCE-SPECIFIC
	// CONSTRAINTS surface (CONTENT-012): a pre-write diagnostic of what a write to local markdown /
	// Obsidian / Google Docs would lose or downgrade, gated fail-closed behind acknowledgment. Which
	// authoring affordances appear is an ergonomic role hint; the AUTHORITATIVE permission and visibility
	// enforcement lives in the Processing Core, so a player rendering this page can only see/edit what the
	// core permits (fail-closed).
</script>

<section data-testid="knowledge-view" aria-label="Knowledge">
	<p class="meta">
		Campaign notes, lore, and calendar-aware content. The DM (or an authorized editor) creates and
		edits markdown notes; players see only what their visibility permits.
	</p>

	<NotesWorkbench />
	<CalendarContent />
	<ContentImportExport />
	<ContentSourceConstraints />
</section>
