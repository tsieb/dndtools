<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CollapsibleLocalNavSection from '$lib/ui/layout/local-nav/CollapsibleLocalNavSection.svelte';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { isVaultObjectNote, vaultObjectToNote } from '$lib/domain/object-notes.js';
	import { normalizeNpcData } from '$lib/domain/objects.js';
	import { DEFAULT_CONTENT_VISIBILITY } from '$lib/types/visibility.js';
	import { generateVaultObjectId } from '$lib/utils/id.js';
	import { nowISO } from '$lib/utils/date.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import { buildOpenThreadsReport } from '$lib/domain/open-threads.js';
	import EmptyState from '$lib/ui/common/EmptyState.svelte';
	import { vaultMaturityState } from '$lib/state/vault-maturity.svelte.js';
	import { featureSettingsState } from '$lib/state/feature-settings.svelte.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import HelpTip from '$lib/ui/common/HelpTip.svelte';

	const modeScopedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);
	const modeScopedPinnedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.pinnedNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.pinnedNotes,
	);
	const pinnedEntities = $derived.by(() =>
		modeScopedPinnedNotes.filter((note) => isVaultObjectNote(note)).slice(0, 10),
	);
	const entities = $derived.by(() =>
		modeScopedNotes
			.filter((note) => isVaultObjectNote(note))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 16),
	);
	const openThreads = $derived.by(() =>
		buildOpenThreadsReport(modeScopedNotes, worldCalendarState.calendar),
	);
	const objectNotesEnabled = $derived(featureSettingsState.isAdvancedEnabled('object_notes'));
	const revealEntityList = $derived(
		vaultMaturityState.disclosure.revealCampaignEntityList || objectNotesEnabled,
	);
	const npcCandidateCount = $derived.by(
		() =>
			modeScopedNotes.filter((note) => note.tags.some((tag) => tag.toLowerCase() === 'npc')).length,
	);
	const showObjectNotesPrompt = $derived.by(
		() =>
			!objectNotesEnabled &&
			npcCandidateCount >= 5 &&
			!featureSettingsState.isPromptDismissed('object-notes-npc-threshold'),
	);

	onMount(() => {
		if (!featureSettingsState.loaded && !featureSettingsState.loading) {
			void featureSettingsState.loadFromStorage();
		}
	});

	function navigateToNote(id: string): void {
		goto(resolve(`/knowledge/notes/${id}`));
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}

	async function createNpcEntity(): Promise<void> {
		const now = nowISO();
		const note = vaultObjectToNote({
			id: generateVaultObjectId(),
			type: 'npc',
			name: 'New NPC',
			summary: '',
			tags: ['npc'],
			visibility: DEFAULT_CONTENT_VISIBILITY,
			relationships: [],
			createdAt: now,
			updatedAt: now,
			data: normalizeNpcData({}),
		});
		const created = await notesState.createNote(note);
		goto(resolve(`/knowledge/notes/${created.id}/edit`));
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}

	function explainObjectNotes(): void {
		toastState.info(
			'Object notes are structured entries for NPCs, factions, quests, and other campaign entities.',
		);
	}

	async function enableObjectNotesFromPrompt(): Promise<void> {
		try {
			await featureSettingsState.setAdvancedEnabled('object_notes', true);
			toastState.success('Enabled Object Notes.');
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'CAMPAIGN_ENABLE_OBJECT_NOTES_FAILED',
				error,
				context: { route: '/campaign' },
			});
			toastState.error('Failed to enable Object Notes.');
		}
	}

	async function dismissObjectNotesPrompt(): Promise<void> {
		try {
			await featureSettingsState.dismissPrompt('object-notes-npc-threshold');
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'CAMPAIGN_DISMISS_OBJECT_NOTES_PROMPT_FAILED',
				error,
				context: { route: '/campaign' },
			});
		}
	}
</script>

<nav class="space-y-2 pb-2" aria-label="Campaign navigation">
	{#if showObjectNotesPrompt}
		<div class="mx-2 rounded-md border border-accent/45 bg-accent-subtle/35 p-2.5 text-xs text-ink">
			<p class="font-medium">You have {npcCandidateCount} NPC notes.</p>
			<p class="mt-1 text-ink-muted">
				Try Object Notes for structured entity management across your campaign.
			</p>
			<div class="mt-2 flex items-center gap-2">
				<button
					type="button"
					class="rounded border border-accent/40 bg-surface px-2 py-1 text-2xs font-medium text-accent hover:bg-accent-subtle"
					onclick={() => void enableObjectNotesFromPrompt()}
				>
					Enable Object Notes
				</button>
				<button
					type="button"
					class="rounded border border-border bg-surface px-2 py-1 text-2xs text-ink-muted hover:bg-bg"
					onclick={() => void dismissObjectNotesPrompt()}
				>
					Dismiss
				</button>
			</div>
		</div>
	{/if}

	<CollapsibleLocalNavSection section="campaign" sectionId="entities" title="Entities">
		<div
			class="mb-1 flex items-center justify-between px-2.5"
			data-help-target="object-notes-concept"
		>
			<p class="text-2xs uppercase tracking-wider text-ink-faint">Object Notes</p>
			<HelpTip
				headline="Object Notes"
				body="Object Notes are structured entries for NPCs, factions, quests, and other campaign entities. They help you keep related details linked together and make session prep bundles more reliable."
				learnMoreHref={resolve('/settings') + '?tab=features'}
				learnMoreLabel="Feature settings"
			/>
		</div>
		{#if !revealEntityList}
			<div class="rounded-md border border-border bg-surface p-2 text-xs text-ink-muted">
				Entity lists unlock after your first object note.
			</div>
			<button
				type="button"
				class="mt-2 w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg"
				onclick={() => void createNpcEntity()}
			>
				Create an NPC
			</button>
		{:else if pinnedEntities.length === 0 && entities.length === 0}
			<EmptyState
				class="min-h-0 px-0 py-1"
				illustration="campaign"
				headline="No campaign entities yet"
				body="Object notes give structure to NPCs, factions, and quests - they connect across your vault and power the AI context bundles."
				primaryAction={{ label: 'Create an NPC', onclick: createNpcEntity }}
				secondaryAction={{ label: 'What are object notes?', onclick: explainObjectNotes }}
			/>
		{:else}
			{#if pinnedEntities.length > 0}
				<p class="px-2.5 pb-1 text-xs uppercase tracking-wider text-ink-faint">Pinned</p>
				<div class="density-list pb-2">
					{#each pinnedEntities as note (note.id)}
						<button
							type="button"
							class="w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg"
							onclick={() => navigateToNote(note.id)}
							aria-label={note.title}
						>
							<span class="truncate">{note.title}</span>
						</button>
					{/each}
				</div>
			{/if}
			{#if entities.length > 0}
				<p class="px-2.5 pb-1 text-xs uppercase tracking-wider text-ink-faint">Recently Updated</p>
				<div class="density-list">
					{#each entities as note (note.id)}
						<button
							type="button"
							class="w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg"
							onclick={() => navigateToNote(note.id)}
							aria-label={note.title}
						>
							<span class="truncate">{note.title}</span>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</CollapsibleLocalNavSection>

	<CollapsibleLocalNavSection section="campaign" sectionId="open-threads" title="Open Threads">
		<div class="rounded-md border border-border bg-surface p-2 text-xs">
			<p class="text-ink-muted">
				Quests {openThreads.totals.quests} | NPCs {openThreads.totals.npcs} | Timeline {openThreads
					.totals.timelineEvents}
			</p>
		</div>
		{#if openThreads.quests.length === 0 && openThreads.npcs.length === 0}
			<p class="px-2.5 py-1.5 text-xs text-ink-faint">No open threads</p>
		{:else}
			<div class="density-list pt-2">
				{#each [...openThreads.quests.slice(0, 4), ...openThreads.npcs.slice(0, 4)] as thread (`${thread.objectId}`)}
					<button
						type="button"
						class="sidebar-open-thread-item w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg hover:text-ink"
						onclick={() => navigateToNote(thread.noteId)}
						aria-label={thread.title}
					>
						<span class="truncate">{thread.title}</span>
					</button>
				{/each}
			</div>
		{/if}
	</CollapsibleLocalNavSection>

	<CollapsibleLocalNavSection
		section="campaign"
		sectionId="timeline-events"
		title="Timeline Events"
	>
		{#if openThreads.timelineEvents.length === 0}
			<p class="px-2.5 py-1.5 text-xs text-ink-faint">No pending timeline events</p>
		{:else}
			<div class="density-list">
				{#each openThreads.timelineEvents.slice(0, 10) as event (event.objectId)}
					<button
						type="button"
						class="w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg hover:text-ink"
						onclick={() => navigateToNote(event.noteId)}
						aria-label={event.title}
					>
						<div class="truncate">{event.title}</div>
						{#if event.dateShort}
							<div class="text-2xs text-ink-faint">{event.dateShort}</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</CollapsibleLocalNavSection>
</nav>
