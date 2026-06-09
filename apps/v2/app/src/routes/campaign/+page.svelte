<script lang="ts">
	import Icon from '$lib/gui/Icon.svelte';

	/**
	 * Campaign section root (UX-SHELL / doc 16 §10.3 "durable section roots with honest empty
	 * states"). Campaign is an approved-but-`planned` global destination (NAV-009): the seven-section
	 * primary nav presents it now, so it needs a real, reachable root rather than a dead link. This
	 * is an honest empty state with a navigational call-to-action (UX quality bar: empty states teach
	 * the first action), not a stub that looks broken.
	 *
	 * The shell owns the single route `<h1>` ("Campaign") and the route landmark/title/announcement,
	 * so this page renders only the in-content empty state. It is player-safe: it states only that the
	 * deeper Campaign workspace is not built yet and never names hidden DM content.
	 */
</script>

<section class="section-empty" data-testid="campaign-view" aria-labelledby="campaign-empty-heading">
	<p class="section-empty-icon" aria-hidden="true"><Icon name="campaign-scroll" size="xl" /></p>
	<h2 id="campaign-empty-heading" class="section-empty-title">Campaign workspace</h2>
	<p class="section-empty-body">
		Campaign holds your long-running narrative structure — arcs, quests, factions, the timeline,
		and the world-model objects that link your notes and maps together. This workspace is on the
		roadmap and isn't built yet in this prototype.
	</p>
	<p class="section-empty-body">
		In the meantime, capture campaign lore in <a href="/knowledge/">Knowledge</a>, set the scene
		from the <a href="/">Command Center</a>, or browse your world in the <a href="/atlas/">Atlas</a>.
	</p>
</section>
