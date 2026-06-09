<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		listNavigationRegistryForActor,
		listReachableDestinations,
		resolveNavigationView,
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
	import { ThemeStore, provideTheme } from '$lib/platform/theme.svelte';
	import { MotionStore, provideMotion } from '$lib/platform/motion.svelte';
	import { DensityStore, provideDensity } from '$lib/platform/density.svelte';
	import { InputModalityStore, provideInputModality } from '$lib/platform/input-modality.svelte';
	import { NavChromeStore, provideNavChrome } from '$lib/platform/nav-chrome.svelte';
	import { locationFromPath } from '$lib/state/navigation-location';
	import { buildGlobalNav } from '$lib/navigation/global-nav';
	import { resolveShellRouteAccessibility } from '$lib/navigation/route-a11y';
	import GlobalNav from '$lib/gui/GlobalNav.svelte';
	import CommandPalette from '$lib/gui/CommandPalette.svelte';
	import QuickSwitcher from '$lib/gui/QuickSwitcher.svelte';
	import Breadcrumbs from '$lib/gui/Breadcrumbs.svelte';
	import LocalNav from '$lib/gui/LocalNav.svelte';
	import ContextualNav from '$lib/gui/ContextualNav.svelte';
	import QuickAccess from '$lib/gui/QuickAccess.svelte';
	import HelpTrigger from '$lib/gui/HelpTrigger.svelte';
	import LiveRegion from '$lib/gui/a11y/LiveRegion.svelte';
	import { LiveAnnouncer, provideLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
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

	// UX-VIS-001/003: theme is a device-local display preference. The store resolves the user
	// preference (or OS `system`) into the `data-theme` attribute on <html>, persists it, and
	// follows OS colour-scheme changes when set to `system`. The inline boot script in app.html
	// applies the saved theme before first paint to avoid a flash of the wrong theme.
	const themeStore = new ThemeStore();
	provideTheme(themeStore);

	// UX-VIS-010: motion is a device-local display preference. The store resolves the single motion
	// state (user choice + OS reduced-motion, with documented precedence) into `data-motion` on
	// <html>, which collapses the duration tokens under reduced motion. The boot script in app.html
	// applies it before first paint to avoid an initial animation flash.
	const motionStore = new MotionStore();
	provideMotion(motionStore);

	// UX-VIS-011: density is a device-local, profile-linked display preference. The store maps the
	// resolved platform viewport class to `data-density` on <html>; Mobile/Tablet lock to comfortable,
	// Desktop is user-overridable. The boot script applies it before first paint.
	const densityStore = new DensityStore();
	provideDensity(densityStore);

	// UX-NAV-018: input-modality detection. Reflects keyboard/pointer/touch on <html> as
	// `data-input-modality` so focus rings show only for keyboard nav and hover-only affordances are
	// suppressed under touch — without removing focus from the accessibility tree.
	const inputModality = new InputModalityStore();
	provideInputModality(inputModality);

	// UX-NAV-004: the Desktop sidebar icon-rail collapse preference (persisted; never the default).
	const navChrome = new NavChromeStore();
	provideNavChrome(navChrome);

	// UX-A11Y §6.2: the single live announcer for the app. Surfaces call announcer.announce(text,
	// politeness) instead of mounting their own aria-live nodes; LiveRegion renders the one polite +
	// one assertive region. Callers pass visibility-filtered text so ARIA never leaks DM-only data
	// (UX-A11Y-008 / AP-1).
	const announcer = new LiveAnnouncer();
	provideLiveAnnouncer(announcer);

	onMount(() => {
		void runtime.load();
		const stopProfile = profile.init();
		const stopTheme = themeStore.init();
		const stopMotion = motionStore.init();
		const stopDensity = densityStore.init();
		const stopModality = inputModality.init();
		const stopChrome = navChrome.init();
		return () => {
			stopProfile();
			stopTheme();
			stopMotion();
			stopDensity();
			stopModality();
			stopChrome();
		};
	});

	// UX-VIS-011: re-apply density whenever the resolved platform viewport class changes (PLAT-001).
	// Reading `densityStore.desktopPreference` inside `applyForViewport` makes this effect also react
	// to the stored desktop preference loaded during init, so the first applied value is correct.
	$effect(() => {
		densityStore.applyForViewport(profile.viewportClass);
	});

	// UX-NAV-002 / NAV-010: the seven-section global navigation reads the same actor-filtered IA the
	// command palette and visible controls use. `listNavigationRegistryForActor` is role-filtered, so
	// DM-only / observer-hidden sections are absent from the data entirely. `buildGlobalNav` keeps
	// only the seven global destinations (Scenes/Audio/MCP are non-global capabilities reached via
	// the command palette and section-local surfaces) and orders them canonically.
	const registry = $derived(
		listNavigationRegistryForActor(runtime.state.permissions, runtime.activeActorId),
	);
	const globalNav = $derived(buildGlobalNav(registry, page.url.pathname));

	// Contextual navigation (NAV-003): the route is the single source of truth. The
	// whole navigation view — breadcrumbs, local section nav, contextual links — is
	// derived once from the current route's location, so no surface holds conflicting
	// route state. Following any breadcrumb/backlink is an ordinary route change that
	// updates browser history coherently (NAV-003 AC1).
	const location = $derived(locationFromPath(page.url.pathname));
	const navView = $derived(resolveNavigationView(runtime.state, runtime.activeActorId, location));
	const reachable = $derived(listReachableDestinations(runtime.state, runtime.activeActorId));

	// NAV-001 AC2 / NAV-007: the route's accessible semantics — the single route-level `h1`, the
	// document title, the landmark, and the live route-change announcement — are derived once. The
	// shell resolver also covers the approved-but-not-yet-built global sections (Knowledge,
	// Campaign), filling their canonical title/landmark from the actor-filtered IA registry. Fail
	// closed: a section the actor cannot reach (or a hidden entity) yields the app-name fallback,
	// never a leaked title.
	const routeA11y = $derived(
		resolveShellRouteAccessibility(navView, registry, location, { appName: 'DND Tools v2' }),
	);
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
	// The route id captured on the first effect run, and whether a real in-app navigation has
	// happened since. We latch on *navigation* rather than effect re-runs so the announcement
	// updating once the vault loads does not retroactively count as a transition.
	let firstRouteId: string | null = null;
	let hasNavigated = false;
	$effect(() => {
		// Re-run on every route + hash change, and once content loads (so a cold deep-link to a
		// heading anchor can focus its target after it renders). Build a key so an unrelated
		// reactive update (e.g. a "view as" switch on the same URL) does not re-steal focus.
		const path = page.url.pathname;
		const hash = page.url.hash;
		const routeId = `${path}${hash}`;
		const announcement = routeA11y.announcement;
		const loaded = runtime.loaded;
		const focusKey = `${routeId}::${announcement}::${loaded}`;
		if (focusKey === lastFocusKey) return;
		lastFocusKey = focusKey;
		if (firstRouteId === null) firstRouteId = routeId;
		else if (routeId !== firstRouteId) hasNavigated = true;

		const focus = resolveRouteFocus({ hash, isNavigation: true });
		// Announce only when the core says to: a within-page heading jump does not
		// re-announce the route landmark (NAV-004 AC1).
		routeAnnouncement = focus.announceRoute ? announcement : '';

		untrack(() => {
			if (focus.kind === 'heading-anchor') {
				// Preserve the heading scroll target: focus and scroll the heading the hash
				// names instead of the landmark (NAV-004 AC1). The browser also handles the
				// native hash scroll; this makes the target programmatically focused for
				// keyboard/AT users without the landmark stealing it. This applies even on a
				// cold deep-link load (NAV-004 AC1).
				const target = document.getElementById(focus.anchorId);
				if (target) {
					if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
					target.focus({ preventScroll: false });
					target.scrollIntoView();
				}
			} else if (hasNavigated && landmarkEl) {
				// Normal client-side route transition: focus the route landmark (NAV-004 AC2).
				// On the very first (cold) page load we leave focus at the document start so the
				// skip-to-content link is the first Tab stop (UX-NAV-009 AC1); the route is still
				// announced above for screen readers. Reset both the window scroll (Desktop/Tablet
				// landscape) and the content region's own scroll (the compact internal-scroll layout)
				// so a new route starts at the top.
				landmarkEl.focus({ preventScroll: true });
				landmarkEl.scrollTop = 0;
				window.scrollTo({ top: 0 });
			}
		});
	});

	// UX-NAV-002 / UX-NAV-001: Alt+1..Alt+7 navigate to the Nth visible global section in canonical
	// order; Alt+Shift+H is the Command Center home shortcut. The shortcuts are keyboard parity for
	// the primary nav (a Must-have action must not be pointer-only); navigation fires the existing
	// route announcer so the destination is announced via the live region. They only act on the
	// actor-filtered set, so a player/observer can never reach a section they cannot see.
	function onGlobalKeydown(event: KeyboardEvent) {
		if (!event.altKey || event.ctrlKey || event.metaKey) return;
		let target: string | undefined;
		if (event.shiftKey) {
			if (event.key.toLowerCase() === 'h') {
				target = globalNav.find((item) => item.home)?.route;
			}
		} else if (/^[1-7]$/.test(event.key)) {
			const position = Number(event.key);
			target = globalNav.find((item) => item.position === position)?.route;
		}
		if (target) {
			event.preventDefault();
			void goto(target);
		}
	}

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

<svelte:window onkeydown={onGlobalKeydown} />

<!-- UX-NAV-009: the skip-to-main-content link is the first focusable element on every page. It is
     visually hidden until focused (see .skip-link in styles.css). -->
<a class="skip-link" href="#main-content" data-testid="skip-link">Skip to main content</a>

<div
	class="app-shell"
	data-viewport={profile.viewportClass}
	data-orientation={profile.orientation}
	data-nav-collapsed={navChrome.collapsed ? 'true' : 'false'}
>
	<!-- UX-NAV-009: the top bar is the page banner landmark. It hosts only cross-route affordances —
	     brand/home, the command palette trigger, the "view as" actor switch, and help. Section
	     routing lives in the primary nav (the sidebar/rail/tab bar), not here. -->
	<header class="app-header">
		<a class="brand" href="/" data-testid="app-brand">DND Tools v2</a>
		<p class="tagline">Scene-first command platform — local prototype</p>
		<div class="top-bar-controls" data-testid="top-bar-controls">
			<QuickSwitcher />
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
			<!-- UX-A11Y-014 (WCAG 3.2.6): the Help trigger renders in the shared header, so it appears in
			     the same top-bar position on every route, and is reachable by `?` / `F1` everywhere. -->
			<HelpTrigger />
		</div>
	</header>

	<!-- UX-NAV-002/004/005/006: the seven-section primary navigation, adapted per platform profile. -->
	<GlobalNav
		items={globalNav}
		viewportClass={profile.viewportClass}
		orientation={profile.orientation}
		collapsed={navChrome.collapsed}
		onToggleCollapse={() => navChrome.toggle()}
		touch={inputModality.modality === 'touch'}
	/>

	<!-- UX-A11Y §6.2: the product-wide polite + assertive live regions, written only by the announcer. -->
	<LiveRegion />

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
	<div
		class="visually-hidden"
		aria-live="polite"
		aria-atomic="true"
		data-testid="route-announcer"
	>
		{routeAnnouncement}
	</div>

	<main
		bind:this={landmarkEl}
		class="app-main"
		id="main-content"
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
</div>
