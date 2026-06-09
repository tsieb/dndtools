<script lang="ts">
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import { isHelpKey, isFromTextEntry, KEYBOARD_SHORTCUTS } from '$lib/gui/a11y/keyboard';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';

	/**
	 * Consistent help mechanism (UX-A11Y-014, WCAG 3.2.6). The Help trigger sits in the same place in
	 * the top bar on every route (it is rendered by the shared app header), is reachable by `?` or `F1`
	 * consistently everywhere (UX-A11Y-014 AC2), and opens the keyboard-shortcut reference in the shared
	 * {@link Dialog} primitive (focus trapped, Escape closes, focus returns to this button).
	 */
	let open = $state(false);
	const announcer = useLiveAnnouncer();

	function show() {
		open = true;
		announcer?.announce('Keyboard shortcuts');
	}

	// Global help key: `?` or `F1` opens the reference from any route, unless the user is typing in a
	// text field (where `?` must remain a literal character). Modifier-free, so it never clashes.
	$effect(() => {
		function onKey(event: KeyboardEvent) {
			if (!isHelpKey(event)) return;
			if (isFromTextEntry(event.target)) return;
			event.preventDefault();
			if (!open) show();
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<button
	type="button"
	class="help-trigger"
	aria-label="Help"
	aria-haspopup="dialog"
	aria-expanded={open}
	data-testid="open-help"
	onclick={show}
>
	<span aria-hidden="true">?</span>
</button>

<Dialog bind:open title="Keyboard shortcuts" testid="help-dialog">
	<p class="help-intro">
		Every action is reachable by keyboard. Press <kbd>Escape</kbd> to close this dialog.
	</p>
	<table class="help-shortcuts" data-testid="help-shortcuts">
		<thead>
			<tr>
				<th scope="col">Keys</th>
				<th scope="col">Action</th>
				<th scope="col">Where</th>
			</tr>
		</thead>
		<tbody>
			{#each KEYBOARD_SHORTCUTS as shortcut (shortcut.keys)}
				<tr>
					<td><kbd>{shortcut.keys}</kbd></td>
					<td>{shortcut.action}</td>
					<td>{shortcut.scope}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</Dialog>
