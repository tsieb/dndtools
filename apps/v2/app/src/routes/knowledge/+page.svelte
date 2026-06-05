<script lang="ts">
	import CalendarContent from '$lib/gui/CalendarContent.svelte';
	import ContentImportExport from '$lib/gui/ContentImportExport.svelte';

	// CONTENT-011: the Knowledge section. For this slice it surfaces the calendar/custom-time content
	// capability — calendar-aware notes/objects with custom-date fields, timeline references, and stable
	// formatting. Which authoring affordances appear is an ergonomic role hint; the AUTHORITATIVE
	// permission and visibility enforcement lives in the Processing Core, so a player rendering this page
	// can only see/edit what the core permits (CONTENT-011 fail-closed + per-item visibility).
</script>

<section data-testid="knowledge-view" aria-label="Knowledge">
	<p class="meta">
		Campaign notes, lore, and calendar-aware content. The DM (or an authorized editor) creates
		calendar-aware notes and structured objects; players see only what their visibility permits.
	</p>

	<CalendarContent />
	<ContentImportExport />
</section>
