<script lang="ts">
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import { isHelpKey, isFromTextEntry } from '$lib/gui/a11y/keyboard';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import { searchShortcuts, type ShortcutDescriptor } from '$lib/navigation/shortcuts';

	/**
	 * Consistent help mechanism (UX-A11Y-014, WCAG 3.2.6) + the keyboard-shortcuts help panel
	 * (UX-NAV-019 AC3). The Help trigger sits in the same place in the top bar on every route, is
	 * reachable by `?` or `F1` consistently everywhere (UX-A11Y-014 AC2), and opens the keyboard-shortcut
	 * reference in the shared {@link Dialog} primitive (focus trapped, Escape closes, focus returns here).
	 *
	 * The reference is the actor-filtered shortcut registry passed from the shell, and the panel is
	 * SEARCHABLE (UX-NAV-019 AC3): typing filters the list across keys, action, scope, and group. Because the
	 * registry is actor-filtered, a player/observer panel never lists a DM-only shortcut (UX-NAV-019 AC4).
	 */
	interface Props {
		shortcuts?: ShortcutDescriptor[];
	}
	const { shortcuts = [] }: Props = $props();

	let open = $state(false);
	let helpQuery = $state('');
	const announcer = useLiveAnnouncer();

	const filtered = $derived(searchShortcuts(shortcuts, helpQuery));
	// Group the filtered rows by their display group, preserving registry order.
	const groups = $derived.by(() => {
		const out: Array<{ group: string; rows: ShortcutDescriptor[] }> = [];
		for (const shortcut of filtered) {
			let group = out.find((g) => g.group === shortcut.group);
			if (!group) {
				group = { group: shortcut.group, rows: [] };
				out.push(group);
			}
			group.rows.push(shortcut);
		}
		return out;
	});

	function show() {
		open = true;
		helpQuery = '';
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
	<label class="help-search-label">
		<span class="visually-hidden">Search shortcuts</span>
		<input
			class="help-search"
			type="text"
			placeholder="Search shortcuts…"
			aria-label="Search shortcuts"
			data-testid="help-search"
			autocomplete="off"
			bind:value={helpQuery}
		/>
	</label>
	{#if filtered.length === 0}
		<p class="help-empty" data-testid="help-shortcuts-empty">No shortcuts match “{helpQuery}”.</p>
	{:else}
		<table class="help-shortcuts" data-testid="help-shortcuts">
			<thead>
				<tr>
					<th scope="col">Keys</th>
					<th scope="col">Action</th>
					<th scope="col">Where</th>
				</tr>
			</thead>
			<tbody>
				{#each groups as { group, rows } (group)}
					<tr class="help-group">
						<th scope="rowgroup" colspan="3">{group}</th>
					</tr>
					{#each rows as shortcut (shortcut.id)}
						<tr data-testid={`help-shortcut-${shortcut.id}`}>
							<td><kbd>{shortcut.keys}</kbd></td>
							<td>{shortcut.action}</td>
							<td>{shortcut.scope}</td>
						</tr>
					{/each}
				{/each}
			</tbody>
		</table>
	{/if}
</Dialog>

<style>
	.help-search {
		font: inherit;
		width: 100%;
		padding: 0.4rem 0.6rem;
		margin-bottom: 0.5rem;
		border: 1px solid var(--border, #cbd5e1);
		border-radius: 0.375rem;
	}

	.help-group th {
		text-align: left;
		padding-top: 0.6rem;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted, #64748b);
	}

	.help-empty {
		color: var(--muted, #64748b);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
