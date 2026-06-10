<script lang="ts">
	import {
		actorCanAuthorJournal,
		getCharacterJournalForActor,
		listCharactersForActor,
		type JournalEntryKind,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CHAR-012 / CHAR-016: the character JOURNAL surface. A character's OWNER (or the DM) keeps bookmarks,
	// NPC impressions, personal quests, and session highlights, each with EXPLICIT per-entry visibility.
	// The list renders ENTIRELY from the actor-filtered journal query, so another player never sees a
	// non-shared entry and an observer sees nothing (CHAR-015/CHAR-016 non-leak). Every write dispatches a
	// durable command; visibility changes are the data-layer cross-surface invalidation trigger.
	const runtime = useRuntime();

	// The characters the active actor may see (the journal is keyed by character).
	const visibleCharacters = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

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
		await dispatch({
			type: 'character.remove-journal-entry',
			actorId: runtime.activeActorId,
			payload: { characterId, entryId },
		});
	}
</script>

<section data-testid="character-journal" aria-label="Character journals">
	<h2>Character journal</h2>

	{#if error}
		<p class="meta" role="alert" data-testid="journal-error">{error}</p>
	{/if}

	{#if visibleCharacters.length === 0}
		<p class="meta" data-testid="journal-empty">No characters are visible to you.</p>
	{:else}
		<ul class="scene-list" data-testid="journal-character-list">
			{#each visibleCharacters as character (character.id)}
				{@const view = journal(character.id)}
				<li class="scene-card" data-testid={`journal-character-${character.id}`}>
					<h3>{character.name}</h3>

					{#if view.entries.length === 0}
						<p class="meta" data-testid={`journal-none-${character.id}`}>
							No journal entries are visible to you.
						</p>
					{:else}
						<ul class="scene-list" data-testid={`journal-entries-${character.id}`}>
							{#each view.entries as entry (entry.id)}
								<li class="scene-card" data-testid={`journal-entry-${entry.id}`}>
									<div>
										<strong>{entry.title}</strong>
										<span class="meta"> • {entry.kind} • {entry.visibility}</span>
										{#if entry.body}<div class="meta">{entry.body}</div>{/if}
									</div>
									{#if canAuthor(character.id)}
										<label class="meta">
											Visibility
											<select
												data-testid={`journal-entry-visibility-${entry.id}`}
												value={entry.visibility}
												onchange={(event) =>
													changeVisibility(
														character.id,
														entry.id,
														event.currentTarget.value as 'dm-only' | 'player-visible' | 'shared',
													)}
											>
												<option value="dm-only">DM only</option>
												<option value="player-visible">Player visible</option>
												<option value="shared">Shared</option>
											</select>
										</label>
										<button
											type="button"
											data-testid={`journal-entry-remove-${entry.id}`}
											onclick={() => removeEntry(character.id, entry.id)}
										>
											Remove
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if canAuthor(character.id)}
						<form
							data-testid={`journal-add-${character.id}`}
							onsubmit={(event) => {
								event.preventDefault();
								addEntry(character.id);
							}}
						>
							<label>
								Title
								<input
									data-testid={`journal-title-${character.id}`}
									bind:value={entryTitle[character.id]}
								/>
							</label>
							<label>
								Detail
								<input
									data-testid={`journal-body-${character.id}`}
									bind:value={entryBody[character.id]}
								/>
							</label>
							<label>
								Kind
								<select data-testid={`journal-kind-${character.id}`} bind:value={entryKind[character.id]}>
									<option value="note">Note</option>
									<option value="bookmark">Bookmark</option>
									<option value="npc-impression">NPC impression</option>
									<option value="personal-quest">Personal quest</option>
									<option value="session-highlight">Session highlight</option>
								</select>
							</label>
							<label>
								Visibility
								<select
									data-testid={`journal-visibility-${character.id}`}
									bind:value={entryVisibility[character.id]}
								>
									<option value="shared">Shared (owner + you)</option>
									<option value="player-visible">Player visible</option>
									<option value="dm-only">DM only</option>
								</select>
							</label>
							<button type="submit" data-testid={`journal-submit-${character.id}`}>Add entry</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
