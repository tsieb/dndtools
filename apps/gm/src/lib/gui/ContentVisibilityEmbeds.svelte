<script lang="ts">
	import {
		actorCanAuthorContent,
		getContentItemDetailForActor,
		liveContentItems,
		resolveContentEmbedsForActor,
		type ContentItem,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

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

<section data-testid="visibility-embeds" aria-label="Granular visibility and embeds">
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
