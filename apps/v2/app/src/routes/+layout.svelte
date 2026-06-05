<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import {
		listNavigationSections,
		listReachableDestinations,
		resolveNavigationView,
		resolveRouteAccessibility,
		resolveRouteFocus,
	} from '@dndtools/v2-core';
	import { SceneRuntime, defaultEnvironment } from '$lib/canvas-runtime/runtime.svelte';
	import { provideRuntime } from '$lib/state/runtime-context';
	import { PlatformProfileStore, provideProfile } from '$lib/platform/platform-profile.svelte';
	import {
		NavigationHistoryStore,
		provideNavigationHistory,
	} from '$lib/platform/navigation-history.svelte';
	import { FeatureTierStore, provideFeatureTier } from '$lib/state/feature-tier.svelte';
	import { locationFromPath } from '$lib/state/navigation-location';
	import CommandPalette from '$lib/gui/CommandPalette.svelte';
	import Breadcrumbs from '$lib/gui/Breadcrumbs.svelte';
	import LocalNav from '$lib/gui/LocalNav.svelte';
	import ContextualNav from '$lib/gui/ContextualNav.svelte';
	import QuickAccess from '$lib/gui/QuickAccess.svelte';
	import './styles.css';

	const { children } = $props();

	const runtime = new SceneRuntime({
		env: defaultEnvironment(),
		defaultActorId: 'local-dm',
	});
	provideRuntime(runtime);

	const profile = new PlatformProfileStore();
	provideProfile(profile);

	const history = new NavigationHistoryStore();
	provideNavigationHistory(history);

	// PLAT-013: the active maturity / feature tier is a device-local display preference owned by
	// the GUI (Contract 1). It drives progressive disclosure; the core decides what each tier shows.
	const featureTier = new FeatureTierStore();
	provideFeatureTier(featureTier);

	onMount(() => {
		void runtime.load();
		return profile.init();
	});

	// Primary navigation reads the same actor-filtered availability API the command
	// palette and visible controls use (NAV-010): DM-only sections are absent for
	// players/observers rather than disabled, so navigation never leaks a hidden
	// section (NAV-010 AC1).
	const sections = $derived(
		listNavigationSections(runtime.state.permissions, runtime.activeActorId),
	);

	// Contextual navigation (NAV-003): the route is the single source of truth. The
	// whole navigation view — breadcrumbs, local section nav, contextual links — is
	// derived once from the current route's location, so no surface holds conflicting
	// route state. Following any breadcrumb/backlink is an ordinary route change that
	// updates browser history coherently (NAV-003 AC1).
	const location = $derived(locationFromPath(page.url.pathname));
	const navView = $derived(resolveNavigationView(runtime.state, runtime.activeActorId, location));
	const reachable = $derived(listReachableDestinations(runtime.state, runtime.activeActorId));

	// NAV-001 AC2 / NAV-007: the route's accessible semantics — the single route-level
	// `h1`, the document title, the landmark, and the live route-change announcement —
	// are all derived once from the navigation view, so the page title, heading, and
	// announcement can never disagree about which route is active. Fail-closed: a section
	// the actor cannot reach (or a hidden entity) yields the app-name fallback, never a
	// leaked title.
	const routeA11y = $derived(resolveRouteAccessibility(navView, { appName: 'DND Tools v2' }));
	$effect(() => {
		document.title = routeA11y.documentTitle;
	});

	// NAV-004 + NAV-007 AC2: restore focus and announce after a navigation completes.
	// The Processing Core decides *what* receives focus (Contract 1): a URL with a heading
	// hash keeps the heading scroll target active and suppresses the landmark announcement
	// (NAV-004 AC1), while a normal transition focuses the route landmark and announces
	// the route (NAV-004 AC2 / NAV-007 AC2). The GUI only applies the returned target.
	let routeAnnouncement = $state('');
	let landmarkEl = $state<HTMLElement | null>(null);
	let lastFocusKey = '';
	$effect(() => {
		// Re-run on every route + hash change. Build a key so an unrelated reactive update
		// (e.g. a "view as" switch on the same URL) does not re-steal focus or re-announce.
		const path = page.url.pathname;
		const hash = page.url.hash;
		const announcement = routeA11y.announcement;
		const focusKey = `${path}${hash}::${announcement}`;
		if (focusKey === lastFocusKey) return;
		lastFocusKey = focusKey;

		const focus = resolveRouteFocus({ hash, isNavigation: true });
		// Announce only when the core says to: a within-page heading jump does not
		// re-announce the route landmark (NAV-004 AC1).
		routeAnnouncement = focus.announceRoute ? announcement : '';

		untrack(() => {
			if (focus.kind === 'heading-anchor') {
				// Preserve the heading scroll target: focus and scroll the heading the hash
				// names instead of the landmark (NAV-004 AC1). The browser also handles the
				// native hash scroll; this makes the target programmatically focused for
				// keyboard/AT users without the landmark stealing it.
				const target = document.getElementById(focus.anchorId);
				if (target) {
					if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
					target.focus({ preventScroll: false });
					target.scrollIntoView();
				}
			} else if (landmarkEl) {
				// Normal route transition: focus the route landmark (NAV-004 AC2). Scroll to
				// the top so back/forward to a non-hash URL starts at the route's landmark.
				landmarkEl.focus({ preventScroll: true });
				window.scrollTo({ top: 0 });
			}
		});
	});
	const currentEntry = $derived.by(() => {
		const crumb = navView.breadcrumbs.at(-1);
		return crumb ? { route: crumb.route, title: crumb.title } : null;
	});
	const showSubheader = $derived(
		navView.breadcrumbs.length > 1 ||
			navView.localItems.length > 0 ||
			navView.backlinks.length > 0 ||
			navView.related.length > 0 ||
			history.pinned.length > 0 ||
			history.recent.length > 0,
	);

	// Record the current reachable destination as a recent visit (device-local only).
	// `untrack` keeps the store write out of this effect's dependency set, and the
	// route guard records at most once per route change.
	let lastRecordedRoute = '';
	$effect(() => {
		if (!runtime.loaded) return;
		const entry = currentEntry;
		if (!entry || entry.route === lastRecordedRoute) return;
		if (!reachable.some((destination) => destination.route === entry.route)) return;
		lastRecordedRoute = entry.route;
		untrack(() => history.recordVisit(entry));
	});
</script>

<header class="app-header">
	<a class="brand" href="/" data-testid="app-brand">DND Tools v2</a>
	<p class="tagline">Scene-first command platform — local prototype</p>
	<nav aria-label="Primary">
		{#each sections as section (section.id)}
			<a href={section.route} data-testid={`nav-${section.id}`}>{section.title}</a>
		{/each}
		<CommandPalette />
		<label class="view-as">
			<span class="visually-hidden">View as</span>
			<select
				data-testid="view-as-select"
				value={runtime.activeActorId}
				onchange={(event) => runtime.setActiveActor(event.currentTarget.value)}
			>
				{#each runtime.actors as actor (actor.id)}
					<option value={actor.id}>View as: {actor.displayName} ({actor.role})</option>
				{/each}
			</select>
		</label>
	</nav>
</header>

{#if showSubheader}
	<div class="nav-subheader" data-testid="nav-subheader">
		<Breadcrumbs crumbs={navView.breadcrumbs} />
		<LocalNav
			label={`${navView.section?.title ?? 'Section'} navigation`}
			items={navView.localItems}
		/>
		<ContextualNav backlinks={navView.backlinks} related={navView.related} />
		<QuickAccess {reachable} current={currentEntry} />
	</div>
{/if}

<!-- NAV-007 AC2: a single polite live region announces the route after a navigation
     completes. It is always present so screen readers register text changes. -->
<div class="visually-hidden" aria-live="polite" aria-atomic="true" data-testid="route-announcer">
	{routeAnnouncement}
</div>

<main
	bind:this={landmarkEl}
	class="app-main"
	tabindex="-1"
	data-testid="route-landmark"
	data-section-landmark={routeA11y.landmark}
	aria-label={routeA11y.landmarkLabel}
>
	<!-- NAV-007 AC1: exactly one route-level `h1`, reflecting the active route context.
	     The app shell owns it so every route has one and only one, derived from the
	     navigation view rather than authored per page. -->
	<h1 class="route-title" data-testid="route-title">{routeA11y.heading}</h1>
	{#if !runtime.loaded}
		<p class="loading" role="status">Loading local Scene store…</p>
	{:else}
		{@render children?.()}
	{/if}
	{#if runtime.lastError}
		<p class="error" role="alert">{runtime.lastError}</p>
	{/if}
</main>
