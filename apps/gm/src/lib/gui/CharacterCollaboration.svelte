<script lang="ts">
	import {
		getCollaborativeCharacterView,
		hasGrantedCapability,
		listCharactersForActor,
		requiredCapabilityForCharacterField,
		type CapabilitySet,
		type CollaborativeField,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CHAR-004 / CHAR-005 / CHAR-014: the COLLABORATIVE character editor. The DM and a character owner
	// edit the SAME character; the view renders the Processing Core's ACTOR-FILTERED collaborative
	// projection (`getCollaborativeCharacterView`) — so a non-DM never sees a dm-only field's value,
	// attribution, history, or conflict (CHAR-014 non-leak). Every edit dispatches the validated
	// `character.edit-field` command (CHAR-005); a same-path concurrent edit surfaces a CONFLICT that
	// only the DM resolves via `character.resolve-conflict` (CHAR-004). The GUI never writes character
	// state directly and never re-derives visibility (Contract 1).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');

	const players = $derived(
		Object.values(runtime.state.permissions.actors)
			.filter((a) => a.role === 'player')
			.sort((a, b) => a.displayName.localeCompare(b.displayName)),
	);

	// The characters the active actor may see (omitted, not redacted, for hidden ones).
	const visibleCharacters = $derived(
		listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
			runtime.activeActorId,
		),
	);

	// The collaborative view per visible character, recomputed from state so edits reflect live.
	const views = $derived(
		visibleCharacters
			.map((c) =>
				getCollaborativeCharacterView(
					runtime.state.characters,
					runtime.state.permissions,
					runtime.activeActorId,
					c.id,
				),
			)
			.filter((v): v is NonNullable<typeof v> => v !== null),
	);

	function actorName(id: string | null): string {
		if (!id) return 'original';
		return runtime.state.permissions.actors[id]?.displayName ?? id;
	}

	function ownerOf(characterId: string): string | null {
		const grant = runtime.state.permissions.grants.find(
			(g) => g.entityType === 'character' && g.entityId === characterId && g.capabilitySet === 'owner',
		);
		return grant?.playerActorId ?? null;
	}

	// --- Editing state: a working value per (characterId, path). Seeded from the canonical value the
	// first time a field appears, then follows the user's input. `seededRevision` records the field's
	// authorship revision at SEED time — that is the revision the editor BASED their edit on, so it is
	// the `baseRevision` we send. A field with a PENDING uncommitted change is NOT re-seeded, so if
	// another author commits a change to that same field meanwhile, this editor's stale base produces
	// a same-path CONFLICT on save (CHAR-004) rather than silently adopting the other value. ---------
	let working = $state<Record<string, string>>({});
	let lastSeededValue = $state<Record<string, string>>({});
	let seededRevision = $state<Record<string, number>>({});
	let error = $state<string | null>(null);

	// Editing state is keyed by ACTOR too, so a pending DM edit and a pending owner edit on the same
	// field are independent. This is what makes the demo's concurrent same-field edit a genuine
	// conflict (CHAR-004): switching the rendered actor never overwrites the other actor's in-progress
	// value or its stale base revision.
	function key(characterId: string, path: string): string {
		return `${runtime.activeActorId}::${characterId}::${path}`;
	}

	function fieldRevision(characterId: string, path: string): number {
		// The path's current authorship revision, or the character revision when the path is unedited.
		const character = runtime.state.characters.characters[characterId];
		return (
			character?.collaboration?.fieldAuthors[path]?.revision ?? character?.revision ?? 0
		);
	}

	$effect(() => {
		for (const view of views) {
			for (const field of view.fields) {
				if (Array.isArray(field.value)) continue;
				const k = key(view.id, field.path);
				const canonical = field.value == null ? '' : String(field.value);
				const pending = working[k] !== undefined && working[k] !== lastSeededValue[k];
				// Re-seed only when the committed value changed AND the user has no pending edit on this
				// field — never fight in-progress typing, and preserve the stale base that yields a conflict.
				if (lastSeededValue[k] !== canonical && !pending) {
					working[k] = canonical;
					lastSeededValue[k] = canonical;
					seededRevision[k] = fieldRevision(view.id, field.path);
				}
			}
		}
	});

	function isNumericPath(path: string): boolean {
		return (
			path === 'combat.hp' ||
			path === 'combat.maxHp' ||
			path === 'combat.tempHp' ||
			path === 'combat.ac'
		);
	}

	async function saveField(characterId: string, field: CollaborativeField): Promise<void> {
		error = null;
		const k = key(characterId, field.path);
		const raw = working[k] ?? '';
		const value: string | number = isNumericPath(field.path) ? Number(raw) : raw;
		// The revision the input was seeded at = the base this edit is built on (CHAR-004).
		const baseRevision = seededRevision[k];
		const result = await runtime.dispatch({
			type: 'character.edit-field',
			actorId: runtime.activeActorId,
			payload: {
				characterId,
				path: field.path,
				value,
				...(baseRevision !== undefined ? { baseRevision } : {}),
			},
		});
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return;
		}
		// After a committed (or conflicted) edit, clear the working entry so the seed effect re-seeds
		// this field to its new canonical value + revision; it is no longer a pending edit.
		delete working[k];
		delete lastSeededValue[k];
		delete seededRevision[k];
	}

	async function resolveConflict(
		characterId: string,
		conflictId: string,
		choice: 'local' | 'remote',
	): Promise<void> {
		error = null;
		const result = await runtime.dispatch({
			type: 'character.resolve-conflict',
			actorId: runtime.activeActorId,
			payload: { characterId, conflictId, choice },
		});
		if (result.status === 'rejected') error = result.rejection.message;
	}

	// DM-only setup helper: grant a NAMED capability set to a player so collaborative editing can be
	// demonstrated. The DM picks the player and the set (`owner` or the field-scoped `backstory-editor`);
	// the grant is a durable DM-authored command (Contract 3 Axis 2). Granting does NOT touch the DM's
	// own authority (CHAR-003 — the DM floor is unaffected by player grants).
	let grantTarget = $state<Record<string, string>>({});
	let grantSet = $state<Record<string, CapabilitySet>>({});
	async function grantCapability(characterId: string): Promise<void> {
		error = null;
		const playerActorId = grantTarget[characterId];
		if (!playerActorId) {
			error = 'Choose a player to grant a capability set to.';
			return;
		}
		const capabilitySet: CapabilitySet = grantSet[characterId] ?? 'owner';
		const result = await runtime.dispatch({
			type: 'permission.grant-capability-set',
			actorId: runtime.activeActorId,
			payload: { entityType: 'character', entityId: characterId, playerActorId, capabilitySet },
		});
		if (result.status === 'rejected') error = result.rejection.message;
	}

	// FIELD-SCOPED edit gate (CHAR-010). The DM may edit every field. A non-DM may edit a field only
	// when they hold the capability set that field REQUIRES (narrative ⇒ backstory-editor, combat ⇒
	// combat-participant, identity/other ⇒ owner). `owner` inherits all of these, so an owner can edit
	// every player-authored field; a backstory-editor sees inputs ONLY on narrative fields. This is an
	// ergonomic hint — the core re-validates authority (and DM-only) on dispatch regardless.
	function canEditField(characterId: string, path: string): boolean {
		if (!actor) return false;
		if (isDm) return true;
		const required = requiredCapabilityForCharacterField(path);
		return hasGrantedCapability(runtime.state.permissions, actor, 'character', characterId, required);
	}
</script>

<section data-testid="collaboration-view" aria-label="Collaborative character editing">
	<h2>Collaborative editing</h2>
	<p class="meta">
		The DM and a character owner edit the same character. Each field shows who authored its current
		value; same-field concurrent edits surface a conflict for the DM to resolve. DM-only fields are
		never shown to players.
	</p>

	{#if error}
		<p class="meta" role="alert" data-testid="collab-error">{error}</p>
	{/if}

	{#if views.length === 0}
		<p class="meta" data-testid="collab-empty">No characters are visible to you.</p>
	{:else}
		<ul class="scene-list" data-testid="collab-list">
			{#each views as view (view.id)}
				<li class="scene-card" data-testid={`collab-character-${view.id}`}>
					<h3>{view.name}</h3>

					{#if isDm}
						{#if ownerOf(view.id)}
							<p class="meta" data-testid={`collab-owner-${view.id}`}>
								owner: {actorName(ownerOf(view.id))}
							</p>
						{:else}
							<div class="grant-owner">
								<label>
									Grant
									<select
										data-testid={`collab-grant-set-${view.id}`}
										bind:value={grantSet[view.id]}
									>
										<option value="owner" selected>Owner</option>
										<option value="backstory-editor">Backstory Editor</option>
									</select>
								</label>
								<label>
									to
									<select
										data-testid={`collab-grant-target-${view.id}`}
										bind:value={grantTarget[view.id]}
									>
										<option value="" disabled selected>Select a player…</option>
										{#each players as player (player.id)}
											<option value={player.id}>{player.displayName}</option>
										{/each}
									</select>
								</label>
								<button
									type="button"
									class="button secondary"
									data-testid={`collab-grant-${view.id}`}
									onclick={() => grantCapability(view.id)}>Grant</button
								>
							</div>
						{/if}
					{/if}

					<!-- Unresolved conflicts (DM resolves; visible-field conflicts only for non-DM). -->
					{#if view.conflicts.length > 0}
						<ul class="conflict-list" data-testid={`collab-conflicts-${view.id}`}>
							{#each view.conflicts as conflict (conflict.id)}
								<li data-testid={`collab-conflict-${conflict.id}`}>
									<span class="badge conflict">Conflict</span>
									<span class="meta">{conflict.path}</span>
									{#if isDm}
										<button
											type="button"
											data-testid={`collab-resolve-local-${conflict.id}`}
											onclick={() => resolveConflict(view.id, conflict.id, 'local')}
											>Keep “{String(conflict.local.value)}”</button
										>
										<button
											type="button"
											data-testid={`collab-resolve-remote-${conflict.id}`}
											onclick={() => resolveConflict(view.id, conflict.id, 'remote')}
											>Use “{String(conflict.remote.value)}”</button
										>
									{:else}
										<span class="meta">awaiting DM resolution</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					<!-- Editable, attributed fields. -->
					<ul class="field-list">
						{#each view.fields as field (field.path)}
							<li
								class="field-row"
								data-testid={`collab-field-${view.id}-${field.path}`}
								data-author={field.authorKind}
								data-conflicted={field.conflicted}
							>
								<label>
									<span class="field-label">
										{field.path}
										{#if field.dmAuthored}
											<span class="badge dm" data-testid={`collab-dm-authored-${view.id}-${field.path}`}
												>DM-authored</span
											>
										{:else if field.authorKind === 'player-authored'}
											<span class="badge player">Player-authored</span>
										{/if}
										{#if field.conflicted}
											<span class="badge conflict">Conflicted</span>
										{/if}
									</span>
									{#if Array.isArray(field.value)}
										<span class="meta">{(field.value as string[]).join(', ') || '—'}</span>
									{:else}
										{#if canEditField(view.id, field.path)}
											<input
												data-testid={`collab-input-${view.id}-${field.path}`}
												type={isNumericPath(field.path) ? 'number' : 'text'}
												bind:value={working[key(view.id, field.path)]}
											/>
										{:else}
											<span class="meta" data-testid={`collab-value-${view.id}-${field.path}`}
												>{field.value == null ? '—' : String(field.value)}</span
											>
										{/if}
									{/if}
								</label>
								{#if canEditField(view.id, field.path) && !Array.isArray(field.value)}
									<button
										type="button"
										class="button secondary"
										data-testid={`collab-save-${view.id}-${field.path}`}
										onclick={() => saveField(view.id, field)}>Save</button
									>
								{/if}
							</li>
						{/each}
					</ul>

					<!-- Attributed history (visible fields only for non-DM). -->
					{#if view.history.length > 0}
						<details data-testid={`collab-history-${view.id}`}>
							<summary>Edit history ({view.history.length})</summary>
							<ul class="history-list">
								{#each view.history as entry (entry.id)}
									<li class="meta">
										{entry.path}: “{String(entry.value)}” by {actorName(entry.authorActorId)}
										<span class="badge {entry.authorRole === 'dm' ? 'dm' : 'player'}">{entry.authorRole}</span>
									</li>
								{/each}
							</ul>
						</details>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.field-list,
	.conflict-list,
	.history-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.field-row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.field-row label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1 1 12rem;
		min-width: 0;
		font-weight: 600;
	}
	.field-row input {
		max-width: 100%;
	}
	.field-row .button {
		flex: 0 0 auto;
	}
	.field-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.grant-owner {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		margin: 0.5rem 0;
		flex-wrap: wrap;
	}
	.grant-owner label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-weight: 600;
	}
	.grant-owner .button {
		flex: 0 0 auto;
	}
	.badge {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.1rem 0.4rem;
		border-radius: 0.4rem;
		text-transform: uppercase;
	}
	.badge.dm {
		background: #4b2e83;
		color: #fff;
	}
	.badge.player {
		background: #1f6f43;
		color: #fff;
	}
	.badge.conflict {
		background: #8a1f1f;
		color: #fff;
	}
	.conflict-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>
