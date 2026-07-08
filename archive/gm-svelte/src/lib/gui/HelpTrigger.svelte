<script lang="ts">
	import { page } from '$app/state';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import { isHelpKey, isFromTextEntry } from '$lib/gui/a11y/keyboard';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import { searchShortcuts, type ShortcutDescriptor } from '$lib/navigation/shortcuts';
	import { resolveHelpContent } from '$lib/content/help-content';
	import { CHANGELOG } from '$lib/content/changelog';
	import { useChangelogSeen } from '$lib/platform/changelog-seen.svelte';

	/**
	 * UX-ONB-014/015/016/020 — the persistent "?" help entry and the contextual HELP CENTER.
	 *
	 * The Help trigger sits in the same place in the top bar on every route (UX-A11Y-014 / UX-ONB-014).
	 * Activating it opens the contextual help center: a surface-specific overview + quick tips
	 * (UX-ONB-016), a passive "What's New" changelog (UX-ONB-020), and the SEARCHABLE keyboard-shortcut
	 * reference (UX-ONB-015 / UX-NAV-019). The "?" / F1 key opens the same center scrolled to the
	 * shortcut cheat sheet (UX-ONB-014 AC2), unless the user is typing in a text field.
	 *
	 * The center is the shared {@link Dialog} primitive — focus trapped, Escape closes, focus returns
	 * to the trigger. The shortcut registry is actor-filtered, so a player/observer panel never lists a
	 * DM-only shortcut (UX-NAV-019 AC4), and the help content is presentation-only (no actor-private
	 * data), so nothing here leaks hidden DM content.
	 *
	 * UX-ONB-020: the trigger shows a passive badge when an unseen release exists; opening the center
	 * clears it. It is NEVER an interruptive launch modal.
	 */
	interface Props {
		shortcuts?: ShortcutDescriptor[];
	}
	const { shortcuts = [] }: Props = $props();

	let open = $state(false);
	let helpQuery = $state('');
	const announcer = useLiveAnnouncer();
	const changelogSeen = useChangelogSeen();

	// The contextual help content for the current surface (longest-prefix match on the route).
	const help = $derived(resolveHelpContent(page.url.pathname));
	// The latest three release entries, surfaced passively in the center (UX-ONB-016 §What's New).
	const recentReleases = $derived(CHANGELOG.slice(0, 3));

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

	function show(announce: string) {
		open = true;
		helpQuery = '';
		// Opening the help center clears the "What's New" badge (UX-ONB-020 AC2).
		changelogSeen.markSeen();
		announcer?.announce(announce);
	}

	// Global help key: `?` or `F1` opens the center from any route, focused on the cheat sheet
	// (UX-ONB-014 AC2), unless the user is typing in a text field (where `?` is a literal character).
	$effect(() => {
		function onKey(event: KeyboardEvent) {
			if (!isHelpKey(event)) return;
			if (isFromTextEntry(event.target)) return;
			event.preventDefault();
			if (!open) show('Keyboard shortcuts');
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
	onclick={() => show(`${help.surface} help`)}
>
	<span aria-hidden="true">?</span>
	{#if changelogSeen.hasUnseen}
		<span class="help-badge" data-testid="help-changelog-badge">
			<span class="visually-hidden">New release notes</span>
		</span>
	{/if}
</button>

<Dialog bind:open title={`${help.surface} help`} testid="help-dialog">
	<!-- Contextual overview + quick tips for the current surface (UX-ONB-016). -->
	<section class="help-section" data-testid="help-overview" aria-label="{help.surface} overview">
		<p class="help-intro">{help.overview}</p>
		<h3 class="help-subhead">Quick tips</h3>
		<ul class="help-tips" data-testid="help-tips">
			{#each help.tips as tip (tip)}
				<li>{tip}</li>
			{/each}
		</ul>
	</section>

	<!-- "What's New" / changelog — passive, never interruptive (UX-ONB-020). -->
	<section class="help-section" data-testid="help-whats-new" aria-label="What's new">
		<h3 class="help-subhead">What's new</h3>
		<ul class="help-changelog">
			{#each recentReleases as entry (entry.version)}
				<li>
					<strong>{entry.version}</strong>
					<span class="help-changelog-title"> {entry.title}</span>
				</li>
			{/each}
		</ul>
		<a class="help-link" href="/settings/#changelog" data-testid="help-see-all-changelog">
			See all release notes →
		</a>
	</section>

	<!-- Keyboard shortcut cheat sheet — searchable, actor-filtered (UX-ONB-015 / UX-NAV-019). -->
	<section class="help-section" data-testid="help-shortcuts-section" aria-label="Keyboard shortcuts">
		<h3 class="help-subhead">Keyboard shortcuts</h3>
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
	</section>
</Dialog>

<style>
	.help-section + .help-section {
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	.help-subhead {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
	}

	.help-intro {
		margin: 0 0 var(--space-2);
		color: var(--color-text-secondary);
	}

	.help-tips {
		margin: 0;
		padding-left: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}

	.help-changelog {
		list-style: none;
		margin: 0 0 var(--space-2);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.help-changelog-title {
		color: var(--color-text-secondary);
	}

	.help-link {
		color: var(--color-text-link);
		font-size: var(--text-sm);
		min-height: var(--touch-target-floor);
		display: inline-flex;
		align-items: center;
	}

	.help-search {
		font: inherit;
		width: 100%;
		padding: var(--space-1-5) var(--space-2);
		margin-bottom: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
	}

	.help-group th {
		text-align: left;
		padding-top: var(--space-2);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
	}

	.help-empty {
		color: var(--color-text-secondary);
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
