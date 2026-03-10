<script lang="ts">
	import { notesState } from '$lib/state/notes.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import GettingStartedPanel from '$lib/ui/onboarding/GettingStartedPanel.svelte';
	import WhatsNewPanel from '$lib/ui/onboarding/WhatsNewPanel.svelte';
	import NoteCard from '$lib/ui/common/NoteCard.svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import packageJson from '../../package.json';

	let modeScopedActiveNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);
	let modeScopedPinnedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.pinnedNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.pinnedNotes,
	);

	let recentNotes = $derived(
		[...modeScopedActiveNotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
	);

	let pinnedNotes = $derived(modeScopedPinnedNotes);
	let noteCount = $derived(modeScopedActiveNotes.length);
	let tagCount = $derived.by(() => {
		if (!playerModeState.enabled) return vaultState.tagCounts.length;
		const tags: Record<string, true> = {};
		for (const note of modeScopedActiveNotes) {
			for (const tag of note.tags) tags[tag] = true;
		}
		return Object.keys(tags).length;
	});

	let linkCount = $derived.by(() => {
		let count = 0;
		for (const note of modeScopedActiveNotes) {
			count += linksState.getForwardLinkCount(note.id);
		}
		return count;
	});
	let helpPanel = $derived(page.url.searchParams.get('panel'));
	let showGettingStarted = $derived(helpPanel === 'getting-started');
	let showWhatsNew = $derived(helpPanel === 'whats-new');

	$effect(() => {
		if (!showWhatsNew) return;
		void onboardingState.markWhatsNewSeen(packageJson.version);
	});

	async function handleNewNote(): Promise<void> {
		const note = await notesState.createNote();
		goto(resolve(`/knowledge/notes/${note.id}/edit`));
	}

	function closeHelpPanel(): void {
		const nextUrl = new URL(page.url);
		nextUrl.searchParams.delete('panel');
		goto(`${nextUrl.pathname}${nextUrl.search}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true,
		});
	}
</script>

<div class="p-6 max-w-content mx-auto">
	{#if showGettingStarted}
		<GettingStartedPanel onclose={closeHelpPanel} />
	{/if}
	{#if showWhatsNew}
		<WhatsNewPanel version={packageJson.version} onclose={closeHelpPanel} />
	{/if}

	{#if modeScopedActiveNotes.length === 0}
		<div class="text-center py-16">
			<h1 class="text-3xl font-bold text-ink mb-3" style="font-family: var(--font-serif)">
				{playerModeState.enabled ? 'Player Screen' : 'Welcome, Dungeon Master'}
			</h1>
			<p class="text-ink-muted mb-8 max-w-md mx-auto leading-relaxed">
				{playerModeState.enabled
					? 'No shared or public notes are available yet.'
					: 'Start building your campaign knowledge base. Create notes for NPCs, locations, quests, and more, then connect them with [[wikilinks]].'}
			</p>
			{#if !playerModeState.enabled}
				<div class="flex items-center justify-center gap-3">
					<Button variant="primary" size="lg" onclick={handleNewNote}>Create Your First Note</Button
					>
					<a
						href={resolve('/settings')}
						class="text-sm text-ink-muted hover:text-accent transition-colors"
					>
						or explore settings
					</a>
				</div>
			{/if}
		</div>
	{:else}
		<div class="mb-8">
			<h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-serif)">
				{playerModeState.enabled ? 'Player Screen' : 'Your Vault'}
			</h1>
			<div class="grid grid-cols-3 gap-3 mt-4">
				<a
					href={resolve('/knowledge/notes')}
					class="p-3 rounded-lg border border-border bg-surface hover:border-accent/40 transition-all group"
				>
					<div class="text-2xl font-bold text-accent">{noteCount}</div>
					<div class="text-xs text-ink-muted group-hover:text-ink transition-colors">Notes</div>
				</a>
				<div class="p-3 rounded-lg border border-border bg-surface">
					<div class="text-2xl font-bold text-accent">{tagCount}</div>
					<div class="text-xs text-ink-muted">Tags</div>
				</div>
				<div class="p-3 rounded-lg border border-border bg-surface">
					<div class="text-2xl font-bold text-accent">{linkCount}</div>
					<div class="text-xs text-ink-muted">Links</div>
				</div>
			</div>
		</div>

		{#if pinnedNotes.length > 0}
			<section class="mb-8">
				<div class="flex items-center gap-2 mb-4">
					<h2 class="text-lg font-semibold text-ink">Pinned</h2>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each pinnedNotes as note (note.id)}
						<NoteCard {note} onclick={(id) => goto(resolve(`/knowledge/notes/${id}`))} />
					{/each}
				</div>
			</section>
		{/if}

		<section>
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-ink">Recent Notes</h2>
				<a
					href={resolve('/knowledge/notes')}
					class="text-sm text-accent hover:text-accent-hover transition-colors"
				>
					View all &rarr;
				</a>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each recentNotes as note (note.id)}
					<NoteCard {note} onclick={(id) => goto(resolve(`/knowledge/notes/${id}`))} />
				{/each}
			</div>
		</section>
	{/if}
</div>
