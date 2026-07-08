<script lang="ts">
	/**
	 * UX-NAV-016 — player-safe "unavailable" state for a deep link.
	 *
	 * A deep link can target content the current actor may not see, content that was deleted, or
	 * content not cached on this device. The Processing Core collapses ALL of those into a single
	 * generic, non-leaking message (`DEEP_LINK_UNAVAILABLE_MESSAGE`) that names no entity and does
	 * not distinguish "hidden from you" from "does not exist" (UX-NAV-016 AC2 / OWASP BOLA). This
	 * component renders that message identically for every reason, so a player can never infer the
	 * existence of a DM-only target from the unavailable page.
	 *
	 * It adds a clear recovery action ("Return to Command Center") and, ONLY when the device is
	 * actually offline (`navigator.onLine === false`), an offline-specific retry affordance — gated
	 * on the genuine offline signal so it never leaks that an online-but-hidden target "exists but
	 * isn't here". The surface never carries a raw 403/404 status code; the route stays a 200 page
	 * (UX-NAV-016 spec).
	 */
	import { isOnline, watchConnectivity } from '$lib/platform/capabilities';

	interface Props {
		/** The single generic, non-leaking message from the core resolver. */
		message: string;
		/** Test id for the surface (defaults to the shared deep-link unavailable id). */
		testid?: string;
	}
	const { message, testid = 'deep-link-unavailable' }: Props = $props();

	// Reactive online/offline signal, read through the owned platform connectivity probe (the GUI
	// never touches `navigator` directly — PLAT-006). Defaults to online so a transient
	// false-negative never shows offline copy for an authorized-but-hidden target.
	let online = $state(true);
	$effect(() => {
		online = isOnline();
		return watchConnectivity((next) => (online = next));
	});

	function retry() {
		if (typeof location !== 'undefined') location.reload();
	}
</script>

<section class="unavailable" data-testid={testid} aria-label="Unavailable">
	{#if !online}
		<!-- UX-NAV-016: offline, not cached. The route URL is preserved so a refresh once
		     connectivity returns can resolve it. -->
		<h2>Content unavailable offline</h2>
		<p role="status">This content isn't available on this device while you're offline.</p>
		<div class="unavailable-actions">
			<button type="button" class="button secondary" data-testid="unavailable-retry" onclick={retry}>
				Retry when online
			</button>
			<a class="unavailable-home" data-testid="unavailable-home" href="/">Return to Command Center</a>
		</div>
	{:else}
		<!-- UX-NAV-016 AC2: one generic, non-leaking unavailable state. It names no entity and is
		     identical whether the target is hidden, missing, or uncached. -->
		<h2>Not available</h2>
		<p role="status">{message}</p>
		<div class="unavailable-actions">
			<a class="unavailable-home" data-testid="unavailable-home" href="/">Return to Command Center</a>
		</div>
	{/if}
</section>
