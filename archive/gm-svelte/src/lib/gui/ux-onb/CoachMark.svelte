<script lang="ts">
	import { useCoachMarks } from '$lib/platform/coach-marks.svelte';

	/**
	 * UX-ONB-013 — a contextual coach mark: a small, non-modal teaching hint anchored near an
	 * affordance. It fires AT MOST ONCE EVER per device (first-reach), respects the per-session
	 * frequency cap, and never blocks the underlying interface.
	 *
	 * Usage: wrap the target affordance in a `position: relative` container and drop this in as a
	 * sibling; the mark positions itself just outside the target (below by default, above when
	 * `placement="above"`) so the target itself stays fully clickable (UX-ONB-013 AC4 — non-blocking).
	 *
	 * - `role="status"` + `aria-live="polite"`: screen readers announce it on appearance, without
	 *   moving focus (non-modal — does not disrupt the user's flow).
	 * - Reduced motion: the fade is gated behind `prefers-reduced-motion: no-preference`, so a
	 *   reduced-motion user gets an instant appear/disappear (UX-ONB-013 AC5).
	 * - The whole mark is `pointer-events: none` except its dismiss button, so a click anywhere over
	 *   the mark passes through to the surface behind it (belt-and-braces non-blocking).
	 */
	interface Props {
		/** Stable mark ID — drives seen-state persistence and the frequency cap. */
		id: string;
		/** Title (≤6 words), semibold. */
		title: string;
		/** Body (≤2 sentences). */
		body: string;
		/** Place the mark above the target instead of below (Tablet/Mobile edge avoidance). */
		placement?: 'below' | 'above';
		/** Gate firing on a behavioral condition (e.g. surface is empty / first-reach). */
		when?: boolean;
	}
	const { id, title, body, placement = 'below', when = true }: Props = $props();

	const coachMarks = useCoachMarks();
	let visible = $state(false);
	let attempted = false; // non-reactive: only ever try to fire once per mount.

	$effect(() => {
		if (attempted || !when) return;
		attempted = true;
		// First-reach trigger: ask the store; it enforces seen-state + the per-session cap.
		if (coachMarks.tryFire(id)) visible = true;
	});

	function dismiss() {
		visible = false;
		// Persist the dismissal so the mark never fires again on this device (UX-ONB-013 AC2).
		coachMarks.dismiss(id);
	}

	// Desktop: Escape dismisses the visible mark (UX-ONB-013). The mark is non-modal and never holds
	// focus, so the listener is window-level and active only while the mark is visible.
	$effect(() => {
		if (!visible) return;
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') dismiss();
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if visible}
	<div
		class="coach-mark"
		class:coach-mark--above={placement === 'above'}
		role="status"
		aria-live="polite"
		data-testid={`coach-mark-${id}`}
	>
		<span class="coach-arrow" aria-hidden="true"></span>
		<div class="coach-body">
			<p class="coach-title">{title}</p>
			<p class="coach-text">{body}</p>
		</div>
		<button
			type="button"
			class="coach-dismiss"
			aria-label={`Dismiss tip: ${title}`}
			data-testid={`coach-mark-${id}-dismiss`}
			onclick={dismiss}
		>
			<span aria-hidden="true">✕</span>
		</button>
	</div>
{/if}
