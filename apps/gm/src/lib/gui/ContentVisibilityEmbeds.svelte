<script lang="ts">
	import {
		actorCanAuthorContent,
		getContentItemDetailForActor,
		liveContentItems,
		resolveContentEmbedsForActor,
		resolveSectionVisibilityToggle,
		type ContentItem,
		type VisibilityLevel,
		type VisibilityToggleView,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import VisibilityToggle from './ux-perm/VisibilityToggle.svelte';

	// CONTENT-009 / CONTENT-010 — the GRANULAR VISIBILITY + EMBEDS surface.
	//
	// CONTENT-009: an authorized editor (DM) authors visibility at SECTION and FIELD granularity on a
	// host note (the entity default is dm-only; sections/fields inherit unless overridden). The detail
	// view renders ONLY what the active actor may see, via the actor-filtered query — a player never
	// sees a dm-only section/field (field>section>entity precedence is enforced in the Processing Core).
	//
	// CONTENT-010: the DM embeds a REFERENCE to another item (an object card / note section / render
	// block) into the host. The host stores ONLY the reference; the embedded content is RESOLVED AT READ
	// against the LIVE target through the actor-filtered query, so a player viewing a host that embeds a
	// dm-only target sees the generic "unavailable" placeholder — never the hidden content (no leak). The
	// GUI dispatches command intents and renders the actor-resolved model; it never touches storage.
	const runtime = useRuntime();

	const items = $derived<ContentItem[]>(liveContentItems(runtime.state.content));
	const canAuthor = $derived(actorCanAuthorContent(runtime.state.permissions, runtime.activeActorId));

	// The declared section ids this demo authors visibility on (the body is one markdown blob; named
	// sections are the granularity the DM publishes/hides). Kept stable so the detail view is deterministic.
	const DECLARED_SECTIONS = ['overview', 'gm-secrets'] as const;

	const hostId = $derived(items.find((item) => item.title === 'Region Briefing')?.id ?? null);
	const targetId = $derived(items.find((item) => item.title === 'Lich Phylactery')?.id ?? null);

	const hostDetail = $derived(
		hostId
			? getContentItemDetailForActor(
					runtime.state.content,
					runtime.state.permissions,
					runtime.activeActorId,
					hostId,
					[...DECLARED_SECTIONS],
				)
			: null,
	);
	const hostEmbeds = $derived(
		hostId
			? resolveContentEmbedsForActor(
					runtime.state.content,
					runtime.state.permissions,
					runtime.activeActorId,
					hostId,
				)
			: [],
	);

	// UX-PERM-001 §section granularity: the DM's per-section toggle models for the host's declared
	// sections. The core resolver is the DM-only DEFAULT-DENY choke point — for a player/observer
	// every entry resolves null, the list is EMPTY, and the authoring block (heading included) is
	// not rendered at all (AC3: absent, not hidden — no hint that section visibility even exists).
	const sectionToggles = $derived.by(() => {
		if (!hostId) return [];
		const rows: { sectionId: string; view: VisibilityToggleView }[] = [];
		for (const sectionId of DECLARED_SECTIONS) {
			const view = resolveSectionVisibilityToggle(
				runtime.state.content,
				runtime.state.permissions,
				runtime.activeActorId,
				hostId,
				sectionId,
			);
			if (view) rows.push({ sectionId, view });
		}
		return rows;
	});

	let error = $state<string | null>(null);

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	// Seed the demo: a dm-only TARGET object with a secret field, a player-visible HOST note, a gm-secrets
	// section made dm-only on the host, and an object-card embed of the target into the host.
	async function seedDemo(): Promise<void> {
		if (!(await dispatch({
			type: 'content.create-item',
			actorId: runtime.activeActorId,
			payload: {
				kind: 'object',
				title: 'Lich Phylactery',
				body: 'The phylactery is hidden beneath Highmoor.',
				fields: { trueName: 'Azalin', location: 'Highmoor crypt' },
				visibility: 'dm-only',
			},
		}))) return;
		if (!(await dispatch({
			type: 'content.create-item',
			actorId: runtime.activeActorId,
			payload: {
				kind: 'note',
				title: 'Region Briefing',
				body: 'A briefing for the party.',
				fields: { summary: 'A bustling region.', dmHook: 'The lich stirs.' },
				visibility: 'player-visible',
			},
		}))) return;

		// Re-read ids after the creates committed.
		const host = liveContentItems(runtime.state.content).find((i) => i.title === 'Region Briefing');
		const target = liveContentItems(runtime.state.content).find((i) => i.title === 'Lich Phylactery');
		if (!host || !target) return;

		// CONTENT-009: make the `gm-secrets` section dm-only and the `dmHook` field dm-only on the host.
		await dispatch({
			type: 'content.set-section-visibility',
			actorId: runtime.activeActorId,
			payload: { itemId: host.id, sectionId: 'gm-secrets', rule: { level: 'dm-only' } },
		});
		await dispatch({
			type: 'content.set-field-visibility',
			actorId: runtime.activeActorId,
			payload: { itemId: host.id, fieldKey: 'dmHook', rule: { level: 'dm-only' } },
		});
		// CONTENT-010: embed the dm-only target as an object card in the player-visible host.
		await dispatch({
			type: 'content.add-embed',
			actorId: runtime.activeActorId,
			payload: { hostItemId: host.id, targetItemId: target.id, kind: 'object-card' },
		});
	}
</script>

<section class="cwrap" data-testid="visibility-embeds" aria-label="Granular visibility and embeds">
	<h2>Granular visibility &amp; embeds</h2>
	<p class="meta">
		The DM authors visibility at the section and field level, and embeds a reference to another item.
		A player sees only what their visibility permits; an embedded item the player cannot see renders a
		non-leaking "unavailable" placeholder. Embedding never copies the target — it always reflects the
		target's current data and the viewer's own permission to it.
	</p>

	{#if error}
		<p class="meta" role="alert" data-testid="ve-error">{error}</p>
	{/if}

	{#if !hostId || !targetId}
		<p class="meta" data-testid="ve-unseeded">No briefing is set up yet.</p>
		{#if canAuthor}
			<button type="button" data-testid="ve-seed" onclick={seedDemo}>
				Set up the demo briefing
			</button>
		{/if}
	{:else if hostDetail}
		{#if !hostDetail.visible}
			<p class="meta" data-testid="ve-host-hidden">This briefing is not visible to you.</p>
		{:else}
			<article class="scene-card" data-testid="ve-host">
				<h3 data-testid="ve-host-title">{hostDetail.title}</h3>

				<h4>Sections visible to you</h4>
				<ul data-testid="ve-host-sections">
					{#each hostDetail.visibleSectionIds as sectionId (sectionId)}
						<li data-testid={`ve-section-${sectionId}`}>{sectionId}</li>
					{/each}
				</ul>

				<!-- UX-PERM-001 §section granularity: a per-section 3-state toggle for each declared
				     section, collapsed by default (current-state icon only) and expanded on
				     interaction. The core resolver is the DM-only choke point — null for a
				     player/observer, so no section toggle (and no hint of hidden sections) is ever
				     rendered for them (AC3). Setting a section to dm-only on this player-visible host
				     is exactly the AC4 path: the entity stays visible to players while the section
				     drops out of their data. -->
				{#if hostId && sectionToggles.length > 0}
					{@const hostItemId = hostId}
					<h4>Section visibility (DM)</h4>
					<ul class="scene-list" data-testid="ve-section-visibility">
						{#each sectionToggles as entry (entry.sectionId)}
							<li data-testid={`ve-section-toggle-row-${entry.sectionId}`}>
								<span class="meta">{entry.sectionId}</span>
								<VisibilityToggle
									view={entry.view}
									label={`Content visibility — ${entry.sectionId} section`}
									collapsible
									testid={`ve-section-visibility-${entry.sectionId}`}
									onchange={async (level: VisibilityLevel) => {
										await dispatch({
											type: 'content.set-section-visibility',
											actorId: runtime.activeActorId,
											payload: { itemId: hostItemId, sectionId: entry.sectionId, rule: { level } },
										});
									}}
								/>
							</li>
						{/each}
					</ul>
				{/if}

				<h4>Fields visible to you</h4>
				<dl data-testid="ve-host-fields">
					{#each Object.entries(hostDetail.visibleFields) as [key, value] (key)}
						<div data-testid={`ve-field-${key}`}>
							<dt>{key}</dt>
							<dd>{String(value)}</dd>
						</div>
					{/each}
				</dl>

				<h4>Embedded content</h4>
				<ul class="scene-list" data-testid="ve-embeds">
					{#each hostEmbeds as embed (embed.embedId)}
						<li class="scene-card" data-testid={`ve-embed-${embed.embedId}`}>
							{#if embed.state === 'unavailable'}
								<span data-testid={`ve-embed-unavailable-${embed.embedId}`}>
									This embedded content is unavailable to you.
								</span>
							{:else if embed.kind === 'object-card'}
								<strong data-testid={`ve-embed-title-${embed.embedId}`}>{embed.title}</strong>
								<dl>
									{#each Object.entries(embed.fields) as [key, value] (key)}
										<div data-testid={`ve-embed-field-${embed.embedId}-${key}`}>
											<dt>{key}</dt>
											<dd>{String(value)}</dd>
										</div>
									{/each}
								</dl>
							{:else if embed.kind === 'note-section'}
								<strong data-testid={`ve-embed-title-${embed.embedId}`}>{embed.title}</strong>
								<span> — section {embed.sectionId}</span>
							{:else}
								<strong data-testid={`ve-embed-title-${embed.embedId}`}>{embed.title}</strong>
								<span> — render block</span>
							{/if}
						</li>
					{/each}
				</ul>
			</article>
		{/if}
	{/if}
</section>

<style>
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.cwrap h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	.cwrap :global(h3) {
		margin: 0;
		font-size: var(--text-md);
	}
	.cwrap :global(h4) {
		margin: var(--space-2) 0 var(--space-1);
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
	}
	.cwrap :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.cwrap :global(.scene-card) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.cwrap :global(.scene-list) {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}
	.cwrap :global(.scene-list li) {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.cwrap :global(ul:not(.scene-list)) {
		margin: 0;
		padding-left: var(--space-5);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.cwrap :global(dl) {
		display: grid;
		gap: var(--space-1);
		margin: 0;
	}
	.cwrap :global(dl > div) {
		display: flex;
		gap: var(--space-2);
	}
	.cwrap :global(dt) {
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		min-width: 6rem;
	}
	.cwrap :global(dd) {
		margin: 0;
		color: var(--color-text-primary);
		font-size: var(--text-sm);
	}
	.cwrap :global(button) {
		align-self: flex-start;
		min-height: var(--touch-target-min);
		padding: 0 var(--space-4);
		background: var(--color-accent);
		color: var(--color-accent-foreground);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-md);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
	}
	.cwrap :global([data-testid^='ve-embed-unavailable-']) {
		color: var(--color-text-secondary);
		font-style: italic;
	}
</style>
