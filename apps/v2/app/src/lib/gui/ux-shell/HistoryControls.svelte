<script lang="ts">
	/**
	 * UX-NAV-017 — in-app back/forward controls.
	 *
	 * Browser back/forward already work because the shell uses ordinary `<a href>` / `goto`
	 * navigation (one `pushState` per user-initiated route change; alias redirects and in-place
	 * query updates use `replaceState`), so the browser's own back/forward and the `Alt+←` /
	 * `Cmd+[` shortcuts behave correctly and are never intercepted.
	 *
	 * This component adds the in-app affordance UX-NAV-017 calls for on platforms that hide the
	 * browser's native back/forward chrome (PWA standalone, Electron): two buttons that simply wrap
	 * `history.back()` / `history.forward()`. They are real `<button>`s with accessible labels, so
	 * the affordance has full keyboard parity (a Must-have action is never pointer-only). When there
	 * is no entry to move to, `history.back()/forward()` is the browser default (silently inert).
	 */
	function goBack() {
		if (typeof history !== 'undefined') history.back();
	}
	function goForward() {
		if (typeof history !== 'undefined') history.forward();
	}
</script>

<div class="history-controls" data-testid="history-controls">
	<button
		type="button"
		class="history-control"
		data-testid="history-back"
		aria-label="Go back"
		onclick={goBack}
	>
		<span aria-hidden="true">←</span>
	</button>
	<button
		type="button"
		class="history-control"
		data-testid="history-forward"
		aria-label="Go forward"
		onclick={goForward}
	>
		<span aria-hidden="true">→</span>
	</button>
</div>
