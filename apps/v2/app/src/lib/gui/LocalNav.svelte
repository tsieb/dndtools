<script lang="ts">
	import type { NavigationItem } from '@dndtools/v2-core';
	import { useProfile } from '$lib/platform/platform-profile.svelte';

	interface Props {
		label: string;
		items: NavigationItem[];
	}
	const { label, items }: Props = $props();
	const profile = useProfile();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let drawerEl = $state<HTMLElement | null>(null);

	function closeDrawer() {
		open = false;
		// Return focus to the trigger. The drawer is unmounted on close, so nothing is
		// left to trap focus afterwards (NAV-003 AC2).
		triggerEl?.focus();
	}

	// Move focus into the drawer when it opens so it is immediately keyboard-usable.
	$effect(() => {
		if (open && drawerEl) {
			drawerEl.querySelector<HTMLElement>('a, button')?.focus();
		}
	});

	// While the sheet is open, Escape closes it and Tab cycles within it (modal). The
	// listener is removed when the sheet closes, so focus is never trapped afterwards
	// (NAV-003 AC2). Window-level handling mirrors the command palette.
	$effect(() => {
		if (!open) return;
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeDrawer();
				return;
			}
			if (event.key !== 'Tab' || !drawerEl) return;
			const focusable = [
				...drawerEl.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
			];
			if (focusable.length === 0) return;
			const first = focusable[0]!;
			const last = focusable[focusable.length - 1]!;
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<!-- Local section navigation (NAV-003). On expanded profiles it renders inline; on
     the compact (slim) profile it becomes an accessible drawer/sheet that does not
     trap focus once closed (NAV-003 AC2; slim-device contract). Hidden when the
     current section has no local items. -->
{#if items.length > 0}
	{#if profile.isCompact}
		<div class="local-nav-compact" data-testid="local-nav-compact">
			<button
				bind:this={triggerEl}
				type="button"
				class="local-nav-trigger"
				data-testid="local-nav-trigger"
				aria-haspopup="dialog"
				aria-expanded={open}
				onclick={() => (open = true)}
			>
				{label}
			</button>
			{#if open}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="local-nav-backdrop" data-testid="local-nav-backdrop" onclick={closeDrawer}>
					<nav class="local-nav-drawer" aria-label={label} data-testid="local-nav-drawer">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							bind:this={drawerEl}
							class="local-nav-sheet"
							role="dialog"
							aria-modal="true"
							aria-label={label}
							tabindex="-1"
							onclick={(event) => event.stopPropagation()}
						>
							<div class="local-nav-head">
								<strong>{label}</strong>
								<button
									type="button"
									class="button secondary"
									data-testid="local-nav-close"
									onclick={closeDrawer}
								>
									Close
								</button>
							</div>
							<ul class="local-nav-list">
								{#each items as item (item.id)}
									<li>
										<a
											href={item.route}
											aria-current={item.current ? 'page' : undefined}
											data-testid={`local-nav-item-${item.id}`}
											onclick={closeDrawer}
										>
											{item.title}
										</a>
									</li>
								{/each}
							</ul>
						</div>
					</nav>
				</div>
			{/if}
		</div>
	{:else}
		<nav class="local-nav" aria-label={label} data-testid="local-nav">
			<ul class="local-nav-list">
				{#each items as item (item.id)}
					<li>
						<a
							href={item.route}
							aria-current={item.current ? 'page' : undefined}
							data-testid={`local-nav-item-${item.id}`}
						>
							{item.title}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}
{/if}
