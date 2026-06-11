<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		searchVaultForActor,
		type SearchContentType,
		type SearchHit,
		type SearchResult,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import { createFocusTrap, type FocusTrap } from '$lib/gui/a11y/focus-trap';
	import type { NavEntry } from '$lib/platform/navigation-history';

	/**
	 * UX-SRCH-001 — the global search overlay: full-text discovery across the actor's VISIBLE content.
	 *
	 * It is invoked from the header button or `Cmd/Ctrl+Shift+F` (distinct from the command palette's
	 * `Cmd/Ctrl+K` and the quick switcher's `Cmd/Ctrl+O`). A scope indicator chip shows what is being
	 * searched BEFORE the user types ("All visible content"), and results render grouped by type within
	 * ~300 ms of a query (AC1, AC2).
	 *
	 * ACTOR SAFETY / NO LEAK (AC3): every candidate is drawn from {@link searchVaultForActor}, the single
	 * actor-filtered search read — a `dm-only`/hidden note, POI, handout, or secret roll is never even a
	 * candidate, and the counts derive from the visible set only. So a player whose term matches ONLY
	 * DM-hidden content sees the EXACT same zero-result state as a term that matches nothing anywhere: no
	 * count, no group, and no hint can reveal that a hidden match exists.
	 */
	interface Props {
		/** Actor-filtered recent destinations (device-local), shown before the user types. */
		recent?: NavEntry[];
	}
	const { recent = [] }: Props = $props();

	const runtime = useRuntime();
	const profile = useProfile();

	/** A query must reach this length before results render; shorter queries show the "keep typing" hint. */
	const MIN_QUERY = 3;
	/** Debounce window (AC1: results render within ~300 ms of a query). */
	const DEBOUNCE_MS = 300;

	let open = $state(false);
	let query = $state('');
	let activeQuery = $state('');
	let activeIndex = $state(0);
	let searchEl = $state<HTMLInputElement | null>(null);
	let dialogEl = $state<HTMLElement | null>(null);

	function show() {
		open = true;
		query = '';
		activeQuery = '';
		activeIndex = 0;
	}

	function hide() {
		open = false;
		query = '';
		activeQuery = '';
		activeIndex = 0;
	}

	function toggle() {
		if (open) hide();
		else show();
	}

	// AC1 — debounce the query so results land ~300 ms after the user stops typing. The latest keystroke
	// wins; the cleanup cancels a superseded timer so an interim value never flashes results.
	$effect(() => {
		const q = query;
		const handle = setTimeout(() => {
			activeQuery = q;
		}, DEBOUNCE_MS);
		return () => clearTimeout(handle);
	});

	// Reset the highlight whenever the debounced query changes.
	$effect(() => {
		void activeQuery;
		activeIndex = 0;
	});

	const trimmedActive = $derived(activeQuery.trim());
	const isPreQuery = $derived(trimmedActive === '');
	const isTooShort = $derived(trimmedActive.length > 0 && trimmedActive.length < MIN_QUERY);

	// AC3 — the result is computed ONLY from the actor-filtered search read, so it can never include or
	// count a hidden artifact. `null` until the query reaches the minimum length.
	const result = $derived<SearchResult | null>(
		trimmedActive.length >= MIN_QUERY
			? searchVaultForActor(
					runtime.state.content,
					runtime.state.maps,
					runtime.state.permissions,
					runtime.state.session,
					runtime.activeActorId,
					{ query: trimmedActive },
				)
			: null,
	);

	const GROUP_ORDER: readonly SearchContentType[] = ['note', 'object', 'poi', 'handout', 'session-artifact'];
	const GROUP_LABEL: Record<SearchContentType, string> = {
		note: 'Notes',
		object: 'Objects',
		poi: 'Map points',
		handout: 'Handouts',
		'session-artifact': 'Session',
	};

	function routeForType(type: SearchContentType): string {
		switch (type) {
			case 'note':
			case 'object':
				return '/knowledge/';
			case 'poi':
				return '/atlas/';
			case 'handout':
			case 'session-artifact':
				return '/session/';
		}
	}

	interface ResultGroup {
		type: SearchContentType;
		label: string;
		count: number;
		hits: Array<{ hit: SearchHit; index: number }>;
	}

	// Group the visible hits by type (a single index space drives arrow navigation).
	const grouped = $derived.by(() => {
		const groups: ResultGroup[] = [];
		const flat: SearchHit[] = [];
		if (!result) return { groups, flat };
		for (const type of GROUP_ORDER) {
			const typeHits = result.hits.filter((hit) => hit.type === type);
			if (typeHits.length === 0) continue;
			const group: ResultGroup = {
				type,
				label: GROUP_LABEL[type],
				count: result.countsByType[type],
				hits: [],
			};
			for (const hit of typeHits) {
				group.hits.push({ hit, index: flat.length });
				flat.push(hit);
			}
			groups.push(group);
		}
		return { groups, flat };
	});

	const clampedIndex = $derived(
		grouped.flat.length === 0 ? -1 : Math.min(activeIndex, grouped.flat.length - 1),
	);
	const activeHit = $derived(clampedIndex >= 0 ? grouped.flat[clampedIndex] : null);

	function optionDomId(index: number): string {
		return `global-search-option-${index}`;
	}

	// AC1 / SRCH accessibility — the visible result count is published through the polite `role="status"`
	// region below (so screen readers hear "{N} results"). The count is the actor-visible total, so it can
	// never reveal a hidden match.
	const statusText = $derived(
		result ? `${result.totalCount} result${result.totalCount === 1 ? '' : 's'}` : '',
	);

	// Cmd/Ctrl+Shift+F opens from any context; the header button is the touch-equivalent (not shortcut-only).
	// Escape is handled here too (two-stage): a window listener fires reliably regardless of Svelte's event
	// delegation, which would otherwise race the focus trap's own keydown handler.
	$effect(() => {
		function onKey(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
				event.preventDefault();
				toggle();
			} else if (event.key === 'Escape' && open) {
				event.preventDefault();
				handleEscape();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// Focus trap: contain Tab inside the overlay and restore focus to the opener on close. Escape is owned
	// by the window listener above (two-stage), so the trap does not also handle it.
	$effect(() => {
		if (!open || !dialogEl) return undefined;
		const instance: FocusTrap = createFocusTrap(dialogEl, { initialFocus: searchEl });
		instance.activate();
		return () => instance.deactivate();
	});

	function handleEscape() {
		// Decide the two-stage step from the field's live value (what the user sees), and write both the DOM
		// and the reactive query so they stay in lock-step regardless of binding-flush timing.
		const current = (searchEl?.value ?? query).trim();
		if (current !== '') {
			query = '';
			if (searchEl) searchEl.value = '';
			searchEl?.focus();
			return;
		}
		hide();
	}

	function move(delta: number) {
		if (grouped.flat.length === 0) return;
		activeIndex = (clampedIndex + delta + grouped.flat.length) % grouped.flat.length;
	}

	function onSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			move(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (activeHit) void openHit(activeHit);
		}
	}

	async function openHit(hit: SearchHit) {
		hide();
		await goto(routeForType(hit.type));
	}

	async function openRecent(entry: NavEntry) {
		hide();
		await goto(entry.route);
	}
</script>

<button
	type="button"
	class="search-trigger"
	data-testid="open-global-search"
	aria-haspopup="dialog"
	aria-expanded={open}
	onclick={toggle}
>
	⌘⇧F Search
</button>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="search-backdrop"
		class:compact={profile.isCompact}
		data-testid="global-search-backdrop"
		onclick={hide}
	>
		<div
			bind:this={dialogEl}
			class="search-panel"
			class:compact={profile.isCompact}
			role="dialog"
			aria-modal="true"
			aria-label="Global search"
			tabindex="-1"
			data-testid="global-search"
			data-profile={profile.viewportClass}
			onclick={(e) => e.stopPropagation()}
		>
			<input
				bind:this={searchEl}
				value={query}
				class="search-input"
				type="text"
				placeholder="Search all visible content…"
				aria-label="Search all visible content"
				data-testid="global-search-input"
				role="combobox"
				aria-expanded={result !== null}
				aria-controls="global-search-list"
				aria-autocomplete="list"
				aria-activedescendant={activeHit ? optionDomId(clampedIndex) : undefined}
				autocomplete="off"
				oninput={(e) => (query = e.currentTarget.value)}
				onkeydown={onSearchKeydown}
			/>

			<!-- Scope indicator: always visible, even before the user types (AC1). -->
			<div class="search-scope" role="group" aria-label="Search scope">
				<span class="scope-chip" data-testid="global-search-scope">All visible content</span>
			</div>

			<div
				class="search-status visually-hidden"
				role="status"
				aria-live="polite"
				aria-atomic="true"
				data-testid="global-search-status"
			>
				{statusText}
			</div>

			{#if isPreQuery}
				{#if recent.length > 0}
					<p class="search-section" aria-hidden="true">Recent</p>
					<ul class="search-list" id="global-search-list" role="listbox" aria-label="Recent destinations">
						{#each recent as entry (entry.route)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<li
								class="search-result"
								role="option"
								aria-selected="false"
								data-testid={`global-search-recent-${entry.route}`}
								onclick={() => openRecent(entry)}
							>
								<span class="result-title">{entry.title}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="search-hint" data-testid="global-search-prequery">
						Search your visible notes, maps, characters, and sessions.
					</p>
				{/if}
			{:else if isTooShort}
				<p class="search-hint" data-testid="global-search-hint">Keep typing for results…</p>
			{:else if result && result.totalCount === 0}
				<!-- AC3 — the zero-result state is identical regardless of whether hidden content would match:
				     no count, no group, no hint distinguishes "matches only hidden content" from "no match". -->
				<p class="search-empty" data-testid="global-search-empty">No results for “{trimmedActive}”.</p>
			{:else if result}
				<ul
					class="search-list"
					id="global-search-list"
					role="listbox"
					aria-label="Search results"
					data-testid="global-search-results"
				>
					{#each grouped.groups as group (group.type)}
						<li class="search-group" role="presentation" data-testid={`global-search-group-${group.type}`}>
							<span>{group.label}</span>
							<span class="group-count" data-testid={`global-search-count-${group.type}`}>{group.count}</span>
						</li>
						{#each group.hits as { hit, index } (hit.id)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<li
								id={optionDomId(index)}
								class="search-result"
								class:active={index === clampedIndex}
								role="option"
								aria-selected={index === clampedIndex}
								data-testid={`global-search-result-${hit.type}-${hit.id}`}
								onmousemove={() => (activeIndex = index)}
								onclick={() => openHit(hit)}
							>
								<span class="result-title">{hit.title}</span>
								{#if hit.snippet}
									<span class="result-snippet">{hit.snippet.text}</span>
								{/if}
								<span class="result-type" aria-hidden="true">{group.label}</span>
							</li>
						{/each}
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}

<style>
	.search-trigger {
		font: inherit;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--border, #cbd5e1);
		border-radius: 0.375rem;
		background: var(--surface, #fff);
		cursor: pointer;
	}

	.search-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.5);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 15vh;
		z-index: 60;
	}

	.search-backdrop.compact {
		padding: 0;
		align-items: stretch;
	}

	.search-panel {
		width: min(42.5rem, 92vw);
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		background: var(--surface, #fff);
		border-radius: 0.75rem;
		box-shadow: 0 18px 48px rgba(15, 23, 42, 0.4);
		overflow: hidden;
	}

	.search-panel.compact {
		width: 100vw;
		max-height: 100vh;
		border-radius: 0;
	}

	.search-input {
		font: inherit;
		font-size: 1.05rem;
		padding: 0.85rem 1rem;
		border: none;
		border-bottom: 1px solid var(--border, #e2e8f0);
		outline-offset: -2px;
	}

	.search-scope {
		display: flex;
		gap: 0.4rem;
		padding: 0.55rem 1rem;
		border-bottom: 1px solid var(--border, #e2e8f0);
	}

	.scope-chip {
		font-size: 0.78rem;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: var(--accent-soft, #e0e7ff);
		color: var(--accent, #4338ca);
	}

	.search-section {
		margin: 0;
		padding: 0.5rem 1rem 0.1rem;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted, #64748b);
	}

	.search-list {
		list-style: none;
		margin: 0;
		padding: 0.25rem;
		overflow-y: auto;
	}

	.search-group {
		display: flex;
		justify-content: space-between;
		padding: 0.5rem 0.75rem 0.2rem;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted, #64748b);
	}

	.search-result {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.search-result.active {
		background: var(--accent-soft, #e0e7ff);
	}

	.result-title {
		font-weight: 600;
	}

	.result-snippet {
		font-size: 0.8rem;
		color: var(--muted, #64748b);
	}

	.result-type {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--muted, #64748b);
	}

	.search-hint,
	.search-empty {
		margin: 0;
		padding: 1rem;
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
