<script lang="ts">
	import Icon from './Icon.svelte';
	import Dialog from './a11y/Dialog.svelte';
	import {
		splitForTabBar,
		shortcutHint,
		type GlobalNavItem,
	} from '$lib/navigation/global-nav';
	import type { ViewportClass, DeviceOrientation } from '$lib/platform/platform-profile.svelte';

	/**
	 * UX-SHELL — the seven-section global navigation surface (UX-NAV-002/004/005/006/009).
	 *
	 * One actor-filtered item set ({@link items}) is rendered through a profile-appropriate
	 * presentation so Desktop, Tablet, and Mobile expose the *same* sections in the *same*
	 * canonical order — only the control surface changes (platform parity):
	 *
	 * - Desktop (expanded): a persistent labeled sidebar with an icon-rail collapse mode
	 *   (UX-NAV-004). The collapse toggle is never the default state.
	 * - Tablet landscape (medium): an icon+label rail (UX-NAV-005).
	 * - Tablet portrait (medium) / Mobile (compact): a bottom tab bar with ≤ 5 destinations and a
	 *   "More" sheet for the overflow (UX-NAV-005 / UX-NAV-006).
	 *
	 * The element is the single `<nav aria-label="Primary navigation">` landmark (UX-NAV-009). Each
	 * item is an `<a>` with `aria-current="page"` when active — plain navigation links, not a
	 * `role="tab"` widget, since activating one routes rather than swapping an in-view panel; this
	 * keeps the landmark/heading structure and the axe landmark audit clean. DM-only / observer-hidden
	 * sections are simply ABSENT from {@link items} (actor-filtered upstream), never hidden, so no
	 * navigation path leaks them (UX-NAV-013).
	 */
	interface Props {
		items: GlobalNavItem[];
		viewportClass: ViewportClass;
		orientation: DeviceOrientation;
		/** Desktop icon-rail collapse state (UX-NAV-004). */
		collapsed: boolean;
		onToggleCollapse: () => void;
		/** Suppress hover-only tooltips under touch modality (UX-NAV-018). */
		touch: boolean;
	}

	let { items, viewportClass, orientation, collapsed, onToggleCollapse, touch }: Props = $props();

	// Presentation decision (platform parity: same items, different surface).
	const isSidebar = $derived(viewportClass === 'expanded');
	const isRail = $derived(viewportClass === 'medium' && orientation === 'landscape');
	const isTabBar = $derived(
		viewportClass === 'compact' || (viewportClass === 'medium' && orientation === 'portrait'),
	);
	// Icon-rail = Desktop sidebar collapsed OR the Tablet landscape rail (both icon-forward).
	const iconOnly = $derived((isSidebar && collapsed) || isRail);

	const surface = $derived(isSidebar ? 'sidebar' : isRail ? 'rail' : 'tabbar');

	// Bottom tab bar: ≤ 5 destinations + a "More" overflow sheet (UX-NAV-005/006).
	const tabLayout = $derived(splitForTabBar(items));
	const visibleItems = $derived(isTabBar ? tabLayout.primary : items);
	const overflowItems = $derived(isTabBar ? tabLayout.overflow : []);

	let moreOpen = $state(false);
	const moreActive = $derived(overflowItems.some((item) => item.active));
</script>

<nav
	class="global-nav"
	aria-label="Primary navigation"
	data-testid="primary-nav"
	data-surface={surface}
	data-icon-only={iconOnly ? 'true' : 'false'}
	data-input-touch={touch ? 'true' : 'false'}
>
	<ul class="global-nav-list">
		{#each visibleItems as item (item.id)}
			<li class:nav-item-last={item.last}>
				<a
					class="global-nav-item"
					href={item.route}
					data-testid={`nav-${item.id}`}
					data-active={item.active ? 'true' : 'false'}
					aria-current={item.active ? 'page' : undefined}
					title={iconOnly && !touch ? item.title : undefined}
				>
					<span class="global-nav-icon"><Icon name={item.icon} size="md" /></span>
					<span class="global-nav-label">{item.shortLabel}</span>
					<!-- Keyboard shortcut hint, shown in the labeled sidebar (UX-NAV-002/019). -->
					{#if isSidebar && !collapsed}
						<kbd class="global-nav-kbd">{shortcutHint(item)}</kbd>
					{/if}
					<!-- Accessible name is always the full title, even in icon-only states (UX-NAV-004). -->
					<span class="visually-hidden">{item.title}</span>
				</a>
			</li>
		{/each}

		{#if overflowItems.length > 0}
			<li>
				<button
					type="button"
					class="global-nav-item global-nav-more"
					data-testid="nav-more"
					data-active={moreActive ? 'true' : 'false'}
					aria-haspopup="dialog"
					aria-expanded={moreOpen}
					onclick={() => (moreOpen = true)}
				>
					<span class="global-nav-icon"><Icon name="more" size="md" label="More sections" /></span>
					<span class="global-nav-label">More</span>
				</button>
			</li>
		{/if}
	</ul>

	{#if isSidebar}
		<!-- UX-NAV-004: icon-rail collapse toggle. Never the default state on first launch. -->
		<button
			type="button"
			class="global-nav-collapse"
			data-testid="nav-collapse-toggle"
			aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
			aria-pressed={collapsed}
			onclick={onToggleCollapse}
		>
			<Icon
				name="chevron-right"
				size="sm"
				label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
				class={collapsed ? 'global-nav-collapse-icon' : 'global-nav-collapse-icon is-expanded'}
			/>
		</button>
	{/if}
</nav>

<!-- UX-NAV-005/006: the "More" overflow sheet. Reuses the shared focus-trapped Dialog so focus is
     trapped, Escape closes, and focus returns to the trigger. Closed = not in the DOM. -->
{#if overflowItems.length > 0}
	<Dialog bind:open={moreOpen} title="More sections" testid="nav-more-sheet">
		<ul class="global-nav-sheet-list">
			{#each overflowItems as item (item.id)}
				<li>
					<a
						class="global-nav-sheet-item"
						href={item.route}
						data-testid={`nav-${item.id}`}
						data-active={item.active ? 'true' : 'false'}
						aria-current={item.active ? 'page' : undefined}
						onclick={() => (moreOpen = false)}
					>
						<span class="global-nav-icon"><Icon name={item.icon} size="md" /></span>
						<span class="global-nav-label">{item.title}</span>
					</a>
				</li>
			{/each}
		</ul>
	</Dialog>
{/if}
