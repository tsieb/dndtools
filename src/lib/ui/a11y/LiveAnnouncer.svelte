<script lang="ts">
	import { a11yAnnouncerState } from '$lib/state/a11y-announcer.svelte.js';
</script>

<div class="sr-only" aria-live="polite" aria-atomic="true" data-testid="a11y-live-polite">
	{a11yAnnouncerState.politeMessage}
</div>
<div class="sr-only" aria-live="assertive" aria-atomic="true" data-testid="a11y-live-assertive">
	{a11yAnnouncerState.assertiveMessage}
</div>
