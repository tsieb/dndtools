<script lang="ts">
	import {
		actorCanAuthorJournal,
		getCharacterJournalForActor,
		listCharactersForActor,
		type JournalEntryKind,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// UX-CHAR-012 / CHAR-016 — the character JOURNAL: bookmarks, NPC impressions, personal quests, and
	// session highlights, each with EXPLICIT per-entry visibility shown as a labelled badge (never colour
	// alone). The list renders ENTIRELY from the actor-filtered journal query, so another player never
	// sees a non-shared entry and an observer sees nothing (CHAR-015/016 non-leak). The add form defaults
	// visibility to the most private option (fail closed, CHAR-016). Every write dispatches a durable
	// command; visibility changes are the data-layer cross-surface invalidation trigger.
	const runtime = useRuntime();

	const visibleCharacters = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	// Visibility presentation. In this model `shared` = owner + DM (private to the character), so it is
	// the fail-closed default; `player-visible` = visible to players; `dm-only` = DM only.
	const VIS: Record<string, { label: string; icon: string; tone: string }> = {
		shared: { label: 'Private (you + DM)', icon: '🔒', tone: 'private' },
		'player-visible': { label: 'Player visible', icon: '👁', tone: 'visible' },
		'dm-only': { label: 'DM only', icon: '🛡', tone: 'dm' },
	};
	const KIND_LABEL: Record<string, string> = {
		note: 'Note',
		bookmark: 'Bookmark',
		'npc-impression': 'NPC impression',
		'personal-quest': 'Personal quest',
		'session-highlight': 'Session highlight',
	};
	const KIND_FILTERS: { value: 'all' | JournalEntryKind; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'note', label: 'Notes' },
		{ value: 'bookmark', label: 'Bookmarks' },
		{ value: 'npc-impression', label: 'NPC' },
		{ value: 'personal-quest', label: 'Quests' },
		{ value: 'session-highlight', label: 'Highlights' },
	];

	let kindFilter = $state<'all' | JournalEntryKind>('all');
	let error = $state<string | null>(null);
	let entryTitle = $state<Record<string, string>>({});
	let entryBody = $state<Record<string, string>>({});
	let entryKind = $state<Record<string, JournalEntryKind>>({});
	let entryVisibility = $state<Record<string, 'dm-only' | 'player-visible' | 'shared'>>({});

	function journal(characterId: string) {
		return getCharacterJournalForActor(
			runtime.state.characters,
			runtime.state.permissions,
			runtime.activeActorId,
			characterId,
		);
	}
	function canAuthor(characterId: string): boolean {
		return actorCanAuthorJournal(runtime.state.permissions, runtime.activeActorId, characterId);
	}

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	async function addEntry(characterId: string): Promise<void> {
		const title = (entryTitle[characterId] ?? '').trim();
		if (title === '') {
			error = 'Enter a journal entry title.';
			return;
		}
		const ok = await dispatch({
			type: 'character.add-journal-entry',
			actorId: runtime.activeActorId,
			payload: {
				characterId,
				kind: entryKind[characterId] ?? 'note',
				title,
				body: (entryBody[characterId] ?? '').trim(),
				visibility: entryVisibility[characterId] ?? 'shared',
			},
		});
		if (ok) {
			entryTitle[characterId] = '';
			entryBody[characterId] = '';
		}
	}

	async function changeVisibility(
		characterId: string,
		entryId: string,
		visibility: 'dm-only' | 'player-visible' | 'shared',
	): Promise<void> {
		await dispatch({
			type: 'character.set-journal-entry-visibility',
			actorId: runtime.activeActorId,
			payload: { characterId, entryId, visibility },
		});
	}

	async function removeEntry(characterId: string, entryId: string): Promise<void> {
		await dispatch({ type: 'character.remove-journal-entry', actorId: runtime.activeActorId, payload: { characterId, entryId } });
	}
</script>

<section class="journal" data-testid="character-journal" aria-label="Character journals">
	<header class="journal__head">
		<h2>Character journal</h2>
		<div class="journal__filters" role="group" aria-label="Filter by kind">
			{#each KIND_FILTERS as filter (filter.value)}
				<button
					type="button"
					class="filter"
					class:filter--active={kindFilter === filter.value}
					aria-pressed={kindFilter === filter.value}
					onclick={() => (kindFilter = filter.value)}
				>
					{filter.label}
				</button>
			{/each}
		</div>
	</header>

	{#if error}
		<p class="journal__error" role="alert" data-testid="journal-error">{error}</p>
	{/if}

	{#if visibleCharacters.length === 0}
		<p class="journal__empty" data-testid="journal-empty">No characters are visible to you.</p>
	{:else}
		<ul class="journal__characters" data-testid="journal-character-list">
			{#each visibleCharacters as character (character.id)}
				{@const view = journal(character.id)}
				{@const entries = view.entries.filter((entry) => kindFilter === 'all' || entry.kind === kindFilter)}
				<li class="jchar" data-testid={`journal-character-${character.id}`}>
					<h3 class="jchar__name">{character.name}</h3>

					{#if view.entries.length === 0}
						<p class="jchar__none" data-testid={`journal-none-${character.id}`}>
							{canAuthor(character.id)
								? 'No journal entries yet. Add your first entry below.'
								: 'No journal entries to show.'}
						</p>
					{:else}
						<ul class="entries" data-testid={`journal-entries-${character.id}`}>
							{#each entries as entry (entry.id)}
								<li class="entry" data-testid={`journal-entry-${entry.id}`}>
									<div class="entry__head">
										<strong class="entry__title">{entry.title}</strong>
										<span class="kind-badge">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
										<span class="vis-badge" data-tone={VIS[entry.visibility]?.tone}>
											<span aria-hidden="true">{VIS[entry.visibility]?.icon}</span>
											{VIS[entry.visibility]?.label ?? entry.visibility}
										</span>
									</div>
									{#if entry.body}<p class="entry__body">{entry.body}</p>{/if}
									{#if canAuthor(character.id)}
										<div class="entry__actions">
											<label class="entry__vis">
												<span class="sr-only">Visibility for {entry.title}</span>
												<select
													data-testid={`journal-entry-visibility-${entry.id}`}
													value={entry.visibility}
													onchange={(event) =>
														changeVisibility(character.id, entry.id, event.currentTarget.value as 'dm-only' | 'player-visible' | 'shared')}
												>
													<option value="shared">Private (you + DM)</option>
													<option value="player-visible">Player visible</option>
													<option value="dm-only">DM only</option>
												</select>
											</label>
											<button type="button" class="button ghost" data-testid={`journal-entry-remove-${entry.id}`} onclick={() => removeEntry(character.id, entry.id)}>Remove</button>
										</div>
									{/if}
								</li>
							{/each}
							{#if entries.length === 0}
								<li class="jchar__none">No {KIND_LABEL[kindFilter] ?? ''} entries.</li>
							{/if}
						</ul>
					{/if}

					{#if canAuthor(character.id)}
						<form
							class="jadd"
							data-testid={`journal-add-${character.id}`}
							onsubmit={(event) => {
								event.preventDefault();
								addEntry(character.id);
							}}
						>
							<div class="jadd__grid">
								<label class="field"><span>Title</span><input data-testid={`journal-title-${character.id}`} bind:value={entryTitle[character.id]} autocomplete="off" /></label>
								<label class="field"><span>Detail</span><input data-testid={`journal-body-${character.id}`} bind:value={entryBody[character.id]} autocomplete="off" /></label>
								<label class="field"><span>Kind</span>
									<select data-testid={`journal-kind-${character.id}`} bind:value={entryKind[character.id]}>
										<option value="note">Note</option>
										<option value="bookmark">Bookmark</option>
										<option value="npc-impression">NPC impression</option>
										<option value="personal-quest">Personal quest</option>
										<option value="session-highlight">Session highlight</option>
									</select></label>
								<label class="field"><span>Visibility</span>
									<select data-testid={`journal-visibility-${character.id}`} bind:value={entryVisibility[character.id]}>
										<option value="shared">Private (you + DM)</option>
										<option value="player-visible">Player visible</option>
										<option value="dm-only">DM only</option>
									</select></label>
							</div>
							<button type="submit" class="button secondary" data-testid={`journal-submit-${character.id}`}>Add entry</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	.journal { display: flex; flex-direction: column; gap: var(--space-3); }
	.journal__head { display: flex; flex-direction: column; gap: var(--space-2); }
	.journal__head h2 { margin: 0; font-family: var(--font-display); font-weight: var(--font-weight-bold); font-size: var(--text-lg); color: var(--color-text-primary); letter-spacing: var(--tracking-tight); }
	.journal__filters { display: flex; gap: var(--space-1); flex-wrap: wrap; }
	.filter {
		padding: var(--space-1) var(--space-3);
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		background: transparent;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		cursor: pointer;
	}
	.filter--active { color: var(--color-accent-foreground); background: var(--color-accent); border-color: var(--color-accent); }
	.journal__error { margin: 0; color: var(--color-status-error-text); font-size: var(--text-sm); }
	.journal__empty { margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm); }
	.journal__characters { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-4); }
	.jchar { display: flex; flex-direction: column; gap: var(--space-2); }
	.jchar__name { margin: 0; font-family: var(--font-display); font-weight: var(--font-weight-bold); font-size: var(--text-md); color: var(--color-text-primary); }
	.jchar__none { margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm); }
	.entries { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
	.entry { padding: var(--space-2) var(--space-3); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); }
	.entry__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
	.entry__title { color: var(--color-text-primary); }
	.entry__body { margin: var(--space-1) 0 0; color: var(--color-text-secondary); font-size: var(--text-sm); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.entry__actions { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); }
	.entry__vis select { min-height: var(--touch-target-min); padding: var(--space-1) var(--space-2); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.kind-badge { font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-text-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-full); padding: 0 var(--space-1-5); }
	.vis-badge { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--text-2xs); border: 1px solid var(--color-border); border-radius: var(--radius-full); padding: 0 var(--space-1-5); }
	.vis-badge[data-tone='private'] { color: var(--color-status-warning-text); border-color: var(--color-status-warning); background: var(--color-status-warning-subtle); }
	.vis-badge[data-tone='visible'] { color: var(--color-status-info-text); border-color: var(--color-status-info); background: var(--color-status-info-subtle); }
	.vis-badge[data-tone='dm'] { color: var(--color-dm-only-badge); border-color: var(--color-dm-only-badge); background: var(--color-dm-only-subtle); }
	.jadd { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
	.jadd__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-2); width: 100%; max-width: 540px; }
	.field { display: flex; flex-direction: column; gap: var(--space-1); }
	.field span { font-size: var(--text-sm); font-weight: var(--font-weight-semibold); color: var(--color-text-secondary); }
	.field :global(input), .field :global(select) { min-height: var(--touch-target-min); padding: var(--space-2); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.button.ghost { background: transparent; color: var(--color-text-secondary); border: 1px solid var(--color-border); }
</style>
