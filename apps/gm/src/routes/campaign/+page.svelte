<script lang="ts">
	import CampaignOverview from '$lib/gui/ux-campaign/CampaignOverview.svelte';

	/**
	 * Campaign section root (UX-CAMPAIGN world-model route shell, doc 16 §campaign architecture). The
	 * shell owns the single route `<h1>` ("Campaign") and the route landmark/title/announcement; this
	 * page renders the world-model OVERVIEW — a cross-cutting, actor-filtered lens over the cast
	 * (characters), locations (maps), the timeline (calendar-dated content), and lore (notes), each
	 * cross-linked to the surface that owns it. It never duplicates Knowledge and is player-safe: every
	 * list is the Processing Core's actor-filtered query, so hidden DM entities are simply absent.
	 */
</script>

<CampaignOverview />
