<script lang="ts">
	import type { ContextualLink } from '@dndtools/core';
	import { tick } from 'svelte';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';

	/**
	 * UX-NAV-008 — backlinks as a navigation surface.
	 *
	 * Backlinks are not metadata: each inbound link is a one-tap route to the linking entity. On
	 * Desktop / Tablet landscape the panel is a collapsible `complementary` landmark with a
	 * `Backlinks (N)` toggle (expanded by default when there is at least one backlink), `Alt+B`
	 * opens/closes it and moves focus to the first row. On the compact (Mobile / Tablet portrait)
	 * profile the same toggle opens a bottom sheet with the same rows, so the surface stays
	 * reachable without a persistent side panel (PLAT-003).
	 *
	 * The Processing Core has already visibility-filtered the backlinks for the active actor
	 * (`resolveNavigationView`, Contract 3), so the count and the rows reflect only the authorized
	 * set — a player never sees, nor counts, a DM-only source (UX-NAV-008 AC2 / UX-NAV-013).
	 */
	interface Props {
		backlinks: ContextualLink[];
	}
	const { backlinks }: Props = $props();
	const profile = useProfile();

	const count = $derived(backlinks.length);

	// Desktop: expanded by default when there is at least one backlink (UX-NAV-008 spec). The user
	// can collapse it; `Alt+B` toggles it back. Compact: the toggle opens a sheet instead.
	let expanded = $state(true);
	let sheetOpen = $state(false);
	let panelEl = $state<HTMLElement | null>(null);

	async function focusFirstRow() {
		await tick();
		panelEl?.querySelector<HTMLElement>('a[data-backlink-row]')?.focus();
	}

	function toggleDesktop(focusOnExpand: boolean) {
		expanded = !expanded;
		if (expanded && focusOnExpand) void focusFirstRow();
	}

	// UX-NAV-008 AC3: Alt+B opens the collapsed panel and moves focus to the first backlink row.
	// Desktop/Tablet-landscape only (the compact profile uses the sheet and its own focus model);
	// it never overrides a browser/AT shortcut because Alt+B is unassigned.
	function onKeydown(event: KeyboardEvent) {
		if (profile.isCompact) return;
		if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		if (event.key.toLowerCase() !== 'b') return;
		event.preventDefault();
		toggleDesktop(true);
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if count > 0}
	{#if profile.isCompact}
		<div class="backlinks" data-testid="backlinks">
			<button
				type="button"
				class="backlinks-toggle"
				data-testid="backlinks-toggle"
				aria-haspopup="dialog"
				aria-expanded={sheetOpen}
				onclick={() => (sheetOpen = true)}
			>
				Backlinks ({count})
			</button>
		</div>
		<Dialog
			bind:open={sheetOpen}
			title="Backlinks"
			testid="backlinks-sheet"
			onclose={() => (sheetOpen = false)}
		>
			<ul class="backlinks-list" data-testid="contextual-nav" aria-label="Backlinks">
				{#each backlinks as link (link.id)}
					<li>
						<a
							href={link.route}
							data-backlink-row
							data-testid={`backlink-${link.id}`}
							onclick={() => (sheetOpen = false)}
						>
							{link.title}
						</a>
						<span class="contextual-reason">{link.relation}</span>
					</li>
				{/each}
			</ul>
		</Dialog>
	{:else}
		<div class="backlinks" data-testid="backlinks">
			<button
				type="button"
				class="backlinks-toggle"
				data-testid="backlinks-toggle"
				aria-expanded={expanded}
				aria-controls="backlinks-panel"
				onclick={() => toggleDesktop(false)}
			>
				Backlinks ({count})
			</button>
			{#if expanded}
				<aside
					bind:this={panelEl}
					id="backlinks-panel"
					class="backlinks-panel"
					aria-label="Backlinks"
					data-testid="contextual-nav"
				>
					<ul class="backlinks-list">
						{#each backlinks as link (link.id)}
							<li>
								<a href={link.route} data-backlink-row data-testid={`backlink-${link.id}`}>
									{link.title}
								</a>
								<span class="contextual-reason">{link.relation}</span>
							</li>
						{/each}
					</ul>
				</aside>
			{/if}
		</div>
	{/if}
{/if}
