<script lang="ts">
	import {
		listCharactersForActor,
		listMapsForActor,
		listScenesForActor,
		resolveCommandCenterHome,
		type SceneListEntry,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import Icon from '$lib/gui/Icon.svelte';
	import type { IconName } from '$lib/gui/icons';
	import ParticipantHome from '$lib/gui/ux-cmd/ParticipantHome.svelte';

	// The Command Center home is the launcher HUB (design package command-center.jsx): its one job is
	// to LAUNCH into the product (resume the live scene, drop into / create scenes, reach the library
	// and management surfaces) — combat / initiative / dice / widgets run inside a scene, never here.
	// The spatial widget board lives on the `/board` scene surface.
	const runtime = useRuntime();

	// UX-CMD-012: the role-differentiated home decision is the actor-safety choke point — a
	// player/observer device never receives the DM hub, only their own controlled view. The decision
	// and the hub data both read through the device owner (defaultActorId), mirroring the board.
	const actorId = $derived(runtime.defaultActorId);
	const homeView = $derived(
		resolveCommandCenterHome(runtime.state, actorId, { widgetPackages: runtime.state.widgets }),
	);

	const scenes = $derived(
		listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId).filter(
			(scene) => !scene.isTemplate,
		),
	);
	const characters = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, actorId),
	);
	const maps = $derived(listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId));

	const activeSceneId = $derived(runtime.state.session.activeSceneId);
	const homeSceneId = $derived(runtime.state.commandCenter.homeSceneId);
	const liveScene = $derived(
		scenes.find((scene) => scene.id === activeSceneId) ??
			scenes.find((scene) => scene.id === homeSceneId) ??
			scenes[0] ??
			null,
	);
	const isLive = $derived(activeSceneId !== null && activeSceneId !== undefined);

	const party = $derived(characters.filter((c) => c.kind === 'pc').slice(0, 5));
	const pcCount = $derived(characters.filter((c) => c.kind === 'pc').length);
	const npcCount = $derived(characters.filter((c) => c.kind !== 'pc').length);

	function sceneStatus(scene: SceneListEntry): 'live' | 'ready' | 'draft' {
		if (scene.id === activeSceneId) return 'live';
		return scene.visibility === 'dm-only' ? 'draft' : 'ready';
	}
	function statusLabel(status: 'live' | 'ready' | 'draft'): string {
		return status === 'live' ? 'Live' : status === 'ready' ? 'Ready' : 'Draft';
	}
	function initials(name: string): string {
		const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
		return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
	}

	// Launchers resolve through real routes. Dedicated creator/manage pages are a follow-up (the
	// package's PageShell creators); for now each launcher opens the real section where you do that
	// work today, so nothing here is a faked destination.
	const createItems: readonly { icon: IconName; label: string; href: string }[] = [
		{ icon: 'session-bolt', label: 'New scene', href: '/scenes/' },
		{ icon: 'characters-person', label: 'New character', href: '/characters/' },
		{ icon: 'atlas-map', label: 'New map', href: '/atlas/' },
		{ icon: 'dice', label: 'New widget', href: '/board/' },
		{ icon: 'knowledge-book', label: 'New note', href: '/knowledge/' },
	];
	const manageItems: readonly { icon: IconName; label: string; meta: string; href: string }[] = [
		{ icon: 'characters-person', label: 'Players', meta: 'Roster & invites', href: '/settings/' },
		{ icon: 'dm-only', label: 'Permissions', meta: 'Roles & capability grants', href: '/settings/' },
		{ icon: 'settings-gear', label: 'Vault connections', meta: 'Sources & sync', href: '/settings/' },
	];
	const libraryItems: readonly { icon: IconName; label: string; meta: string; href: string }[] =
		$derived([
			{ icon: 'atlas-map', label: 'Atlas', meta: `${maps.length} ${maps.length === 1 ? 'map' : 'maps'}`, href: '/atlas/' },
			{ icon: 'characters-person', label: 'Characters', meta: `${pcCount} PCs · ${npcCount} NPCs`, href: '/characters/' },
			{ icon: 'knowledge-book', label: 'Knowledge', meta: 'Notes & lore', href: '/knowledge/' },
			{ icon: 'campaign-scroll', label: 'Campaign', meta: 'Arcs & sessions', href: '/campaign/' },
		]);
</script>

<section class="cc-hub" data-testid="command-center" aria-label="Command Center">
	{#if homeView.kind === 'participant'}
		<!-- UX-CMD-012: a player/observer device sees only their own controlled view, never the DM hub. -->
		<ParticipantHome view={homeView} />
	{:else}
		<!-- Resume hero — the single primary: re-enter the live scene where the trackers run. -->
		<div class="hub-hero" data-testid="hub-hero">
			<div class="hero-lede">
				<span class="hero-dot" class:is-live={isLive} aria-hidden="true"></span>
				<div class="hero-text">
					<p class="hero-eyebrow">{isLive ? 'Session live' : 'Command Center'}</p>
					<h2 class="hero-title">{liveScene?.name ?? 'Your campaign'}</h2>
					<p class="hero-sub">
						{isLive
							? 'Combat, initiative & rolls run inside the scene'
							: 'Resume or open a scene to run live play'}{party.length
							? ` · ${party.length} in the party`
							: ''}
					</p>
				</div>
			</div>
			<div class="hero-side">
				{#if party.length}
					<ul class="hero-avatars" aria-label="Party">
						{#each party as member (member.id)}
							<li class="avatar" title={member.name}>
								<span aria-hidden="true">{initials(member.name)}</span>
								<span class="visually-hidden">{member.name}</span>
							</li>
						{/each}
					</ul>
				{/if}
				<a class="button secondary" href="/board/" data-testid="hub-edit-layout">
					<Icon name="move" size="sm" /> Edit layout
				</a>
				<a class="button primary" href="/session/" data-testid="hub-enter-scene">
					Enter scene <Icon name="session-bolt" size="sm" />
				</a>
			</div>
		</div>

		<div class="hub-grid">
			<!-- Scenes board: drop into or create a scene. -->
			<section class="hub-scenes" aria-label="Scenes">
				<div class="hub-section-head">
					<h2 class="hub-label">Scenes</h2>
					<a class="hub-link" href="/scenes/"><Icon name="add" size="sm" /> New scene</a>
				</div>
				{#if scenes.length}
					<ul class="scene-grid" data-testid="hub-scene-grid">
						{#each scenes as scene (scene.id)}
							{@const status = sceneStatus(scene)}
							<li>
								<a class="scene-tile" href={`/scene/${scene.id}/`}>
									<span class="scene-thumb" aria-hidden="true">
										<span class="badge badge-{status}">{statusLabel(status)}</span>
									</span>
									<span class="scene-name">{scene.name}</span>
									<span class="scene-meta">{scene.tags?.[0] ?? 'Scene'}</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="hub-empty">No scenes yet — <a href="/scenes/">create your first scene</a>.</p>
				{/if}
			</section>

			<!-- Create launchers + Manage shortcuts. -->
			<div class="hub-aside">
				<section aria-label="Create">
					<h2 class="hub-label">Create</h2>
					<ul class="create-grid">
						{#each createItems as item (item.label)}
							<li>
								<a class="create-tile" href={item.href}>
									<span class="tile-icon"><Icon name={item.icon} size="sm" /></span>
									<span class="tile-label">{item.label}</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>

				<section aria-label="Manage">
					<h2 class="hub-label">Manage</h2>
					<ul class="row-list">
						{#each manageItems as item (item.label)}
							<li>
								<a class="row-card" href={item.href}>
									<span class="row-icon"><Icon name={item.icon} size="sm" /></span>
									<span class="row-text">
										<span class="row-label">{item.label}</span>
										<span class="row-meta">{item.meta}</span>
									</span>
									<Icon name="chevron-right" size="sm" />
								</a>
							</li>
						{/each}
					</ul>
				</section>
			</div>
		</div>

		<!-- Library: the durable sections. -->
		<section class="hub-library" aria-label="Library">
			<h2 class="hub-label">Library</h2>
			<ul class="library-grid">
				{#each libraryItems as item (item.label)}
					<li>
						<a class="library-card" href={item.href}>
							<span class="lib-icon"><Icon name={item.icon} size="md" /></span>
							<span class="row-text">
								<span class="row-label">{item.label}</span>
								<span class="row-meta">{item.meta}</span>
							</span>
							<Icon name="chevron-right" size="sm" />
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</section>

<style>
	.cc-hub {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		max-width: 75rem;
		margin-inline: auto;
	}

	/* --- Resume hero — the one primary (accent + raised). --- */
	.hub-hero {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-5);
		background: var(--color-accent-subtle);
		border: 1px solid var(--color-accent-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}
	.hero-lede {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.hero-dot {
		width: 0.75rem;
		height: 0.75rem;
		flex: 0 0 auto;
		border-radius: var(--radius-full);
		background: var(--color-text-tertiary);
	}
	.hero-dot.is-live {
		background: var(--color-status-success);
		box-shadow: 0 0 0 4px var(--color-status-success-subtle);
	}
	.hero-eyebrow {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-wider);
		text-transform: uppercase;
		/* Small text on the accent-subtle hero must clear AA on the light (parchment) theme, where
		   accent-on-accent-subtle fails — use secondary, matching the ThemeSelector hero. */
		color: var(--color-text-secondary);
	}
	.hero-title {
		margin: var(--space-1) 0 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-tight);
		color: var(--color-text-primary);
	}
	.hero-sub {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.hero-side {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.hero-avatars {
		display: flex;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-full);
		background: var(--color-surface-raised);
		color: var(--color-text-secondary);
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-semibold);
		box-shadow: 0 0 0 2px var(--color-accent-subtle);
	}
	.avatar + .avatar {
		margin-left: -0.5rem;
	}

	/* --- Two-column body: scenes board (left) + create/manage (right). --- */
	.hub-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
		gap: var(--space-6);
		align-items: start;
	}
	.hub-aside {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	.hub-section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-3);
	}
	.hub-label {
		margin: 0 0 var(--space-3);
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-wider);
		text-transform: uppercase;
		color: var(--color-text-tertiary);
	}
	.hub-section-head .hub-label {
		margin: 0;
	}
	.hub-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-accent);
		text-decoration: none;
	}
	.hub-link:hover {
		text-decoration: underline;
	}
	.hub-empty {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}

	/* --- Scene tiles. --- */
	.scene-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: var(--space-3);
	}
	.scene-tile {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		text-decoration: none;
		transition:
			border-color var(--duration-fast) var(--easing-standard),
			box-shadow var(--duration-fast) var(--easing-standard);
	}
	.scene-tile:hover {
		border-color: var(--color-accent-border);
		box-shadow: var(--shadow-md);
	}
	.scene-thumb {
		position: relative;
		display: block;
		height: 6rem;
		background:
			linear-gradient(135deg, var(--color-surface-sunken), var(--color-surface-alt)),
			var(--color-surface-sunken);
		border-bottom: 1px solid var(--color-border);
	}
	.badge {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		padding: 0.125rem var(--space-2);
		border-radius: var(--radius-full);
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-semibold);
	}
	.badge-live {
		background: var(--color-status-success-subtle);
		color: var(--color-status-success-text);
	}
	.badge-ready {
		background: var(--color-status-info-subtle);
		color: var(--color-status-info-text);
	}
	.badge-draft {
		background: var(--color-surface-sunken);
		color: var(--color-text-secondary);
	}
	.scene-name {
		margin: var(--space-3) var(--space-3) 0;
		font-size: var(--text-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}
	.scene-meta {
		margin: 0 var(--space-3) var(--space-3);
		font-size: var(--text-xs);
		color: var(--color-text-tertiary);
	}

	/* --- Create launcher tiles. --- */
	.create-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
		gap: var(--space-3);
	}
	.create-tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition:
			border-color var(--duration-fast) var(--easing-standard),
			background var(--duration-fast) var(--easing-standard);
	}
	.create-tile:hover {
		border-color: var(--color-accent-border);
		background: var(--color-accent-subtle);
	}
	.tile-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.125rem;
		height: 2.125rem;
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-accent);
	}
	.tile-label {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}

	/* --- Manage + Library rows. --- */
	.row-list,
	.library-grid {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row-list {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}
	.row-list li + li .row-card {
		border-top: 1px solid var(--color-border);
	}
	.row-card,
	.library-card {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		text-decoration: none;
		transition: background var(--duration-fast) var(--easing-standard);
	}
	.row-card:hover,
	.library-card:hover {
		background: var(--color-interactive-hover);
	}
	.row-icon,
	.lib-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		color: var(--color-accent);
	}
	.lib-icon {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--radius-md);
		background: var(--color-accent-subtle);
	}
	.row-text {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-width: 0;
	}
	.row-label {
		font-size: var(--text-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}
	.row-meta {
		font-size: var(--text-xs);
		color: var(--color-text-tertiary);
	}
	.row-card :global(svg),
	.library-card :global(svg) {
		color: var(--color-text-tertiary);
		flex: 0 0 auto;
	}

	/* --- Library row of section cards. --- */
	.library-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: var(--space-3);
	}
	.library-card {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.library-card:hover {
		border-color: var(--color-accent-border);
	}

	/* --- Compact: stack the body. --- */
	@media (max-width: 60rem) {
		.hub-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
