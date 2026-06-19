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

	// UX-CHAR-009 (CHAR-004/005/014) — the COLLABORATIVE character editor with DM ATTRIBUTION. The DM
	// and a character owner edit the SAME character; the view renders the Processing Core's
	// ACTOR-FILTERED collaborative projection (`getCollaborativeCharacterView`) — so a non-DM never sees
	// a dm-only field's value, attribution, history, or conflict (CHAR-014 non-leak). Each field shows a
	// labelled badge (DM-edited / Your edit / Conflict — text always present, never colour alone). Every
	// edit dispatches the validated `character.edit-field` command (CHAR-005); a same-path concurrent
	// edit surfaces a CONFLICT that only the DM resolves via `character.resolve-conflict` (CHAR-004). The
	// GUI never writes character state directly and never re-derives visibility (Contract 1).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');

	const players = $derived(
		Object.values(runtime.state.permissions.actors)
			.filter((a) => a.role === 'player')
			.sort((a, b) => a.displayName.localeCompare(b.displayName)),
	);

	const visibleCharacters = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	const views = $derived(
		visibleCharacters
			.map((c) => getCollaborativeCharacterView(runtime.state.characters, runtime.state.permissions, runtime.activeActorId, c.id))
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

	let working = $state<Record<string, string>>({});
	let lastSeededValue = $state<Record<string, string>>({});
	let seededRevision = $state<Record<string, number>>({});
	let error = $state<string | null>(null);

	function key(characterId: string, path: string): string {
		return `${runtime.activeActorId}::${characterId}::${path}`;
	}
	function fieldRevision(characterId: string, path: string): number {
		const character = runtime.state.characters.characters[characterId];
		return character?.collaboration?.fieldAuthors[path]?.revision ?? character?.revision ?? 0;
	}
	// True when the active user has typed an uncommitted change into this field (drives "Your edit").
	function isPending(characterId: string, path: string): boolean {
		const k = key(characterId, path);
		return working[k] !== undefined && working[k] !== lastSeededValue[k];
	}

	$effect(() => {
		for (const view of views) {
			for (const field of view.fields) {
				if (Array.isArray(field.value)) continue;
				const k = key(view.id, field.path);
				const canonical = field.value == null ? '' : String(field.value);
				const pending = working[k] !== undefined && working[k] !== lastSeededValue[k];
				if (lastSeededValue[k] !== canonical && !pending) {
					working[k] = canonical;
					lastSeededValue[k] = canonical;
					seededRevision[k] = fieldRevision(view.id, field.path);
				}
			}
		}
	});

	function isNumericPath(path: string): boolean {
		return path === 'combat.hp' || path === 'combat.maxHp' || path === 'combat.tempHp' || path === 'combat.ac';
	}
	function truncate(value: unknown, max = 40): string {
		const text = String(value);
		return text.length > max ? `${text.slice(0, max)}…` : text;
	}

	async function saveField(characterId: string, field: CollaborativeField): Promise<void> {
		error = null;
		const k = key(characterId, field.path);
		const raw = working[k] ?? '';
		const value: string | number = isNumericPath(field.path) ? Number(raw) : raw;
		const baseRevision = seededRevision[k];
		const result = await runtime.dispatch({
			type: 'character.edit-field',
			actorId: runtime.activeActorId,
			payload: { characterId, path: field.path, value, ...(baseRevision !== undefined ? { baseRevision } : {}) },
		});
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return;
		}
		delete working[k];
		delete lastSeededValue[k];
		delete seededRevision[k];
	}

	async function resolveConflict(characterId: string, conflictId: string, choice: 'local' | 'remote'): Promise<void> {
		error = null;
		const result = await runtime.dispatch({
			type: 'character.resolve-conflict',
			actorId: runtime.activeActorId,
			payload: { characterId, conflictId, choice },
		});
		if (result.status === 'rejected') error = result.rejection.message;
	}

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

	function canEditField(characterId: string, path: string): boolean {
		if (!actor) return false;
		if (isDm) return true;
		const required = requiredCapabilityForCharacterField(path);
		return hasGrantedCapability(runtime.state.permissions, actor, 'character', characterId, required);
	}
</script>

<section class="collab" data-testid="collaboration-view" aria-label="Collaborative character editing">
	<header class="collab__head">
		<h2>Collaborative editing</h2>
		<p class="collab__sub">The DM and a character owner edit the same character. Each field shows who authored its current value; same-field concurrent edits surface a conflict for the DM to resolve. DM-only fields are never shown to players.</p>
	</header>

	{#if error}
		<p class="collab__error" role="alert" data-testid="collab-error">{error}</p>
	{/if}

	{#if views.length === 0}
		<p class="collab__empty" data-testid="collab-empty">No characters are visible to you.</p>
	{:else}
		<ul class="collab-list" data-testid="collab-list">
			{#each views as view (view.id)}
				<li class="ccard" data-testid={`collab-character-${view.id}`}>
					<div class="ccard__head">
						<h3 class="ccard__name">{view.name}</h3>
						{#if isDm}
							{#if ownerOf(view.id)}
								<span class="owner-pill" data-testid={`collab-owner-${view.id}`}>Owner: {actorName(ownerOf(view.id))}</span>
							{/if}
						{/if}
					</div>

					{#if isDm && !ownerOf(view.id)}
						<div class="grant">
							<label class="field"><span class="field__label">Grant</span>
								<select data-testid={`collab-grant-set-${view.id}`} bind:value={grantSet[view.id]}>
									<option value="owner" selected>Owner</option>
									<option value="backstory-editor">Backstory Editor</option>
								</select></label>
							<label class="field"><span class="field__label">to</span>
								<select data-testid={`collab-grant-target-${view.id}`} bind:value={grantTarget[view.id]}>
									<option value="" disabled selected>Select a player…</option>
									{#each players as player (player.id)}
										<option value={player.id}>{player.displayName}</option>
									{/each}
								</select></label>
							<button type="button" class="button secondary" data-testid={`collab-grant-${view.id}`} onclick={() => grantCapability(view.id)}>Grant</button>
						</div>
					{/if}

					<!-- Unresolved conflicts (DM resolves; visible-field conflicts only for non-DM). -->
					{#if view.conflicts.length > 0}
						<ul class="conflicts" data-testid={`collab-conflicts-${view.id}`} role="list">
							{#each view.conflicts as conflict (conflict.id)}
								<li class="conflict" data-testid={`collab-conflict-${conflict.id}`}>
									<div class="conflict__head">
										<span class="badge badge--conflict">Conflict</span>
										<code class="conflict__path">{conflict.path}</code>
									</div>
									{#if isDm}
										<div class="conflict__actions">
											<button type="button" class="button secondary" data-testid={`collab-resolve-local-${conflict.id}`} onclick={() => resolveConflict(view.id, conflict.id, 'local')} aria-label={`Keep ${truncate(conflict.local.value)}`}>Keep “{truncate(conflict.local.value)}”</button>
											<button type="button" class="button" data-testid={`collab-resolve-remote-${conflict.id}`} onclick={() => resolveConflict(view.id, conflict.id, 'remote')} aria-label={`Use ${truncate(conflict.remote.value)}`}>Use “{truncate(conflict.remote.value)}”</button>
										</div>
									{:else}
										<span class="conflict__wait">Awaiting DM resolution.</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					<!-- Editable, attributed fields. -->
					<ul class="fields">
						{#each view.fields as field (field.path)}
							<li class="field-row" data-testid={`collab-field-${view.id}-${field.path}`} data-author={field.authorKind} data-conflicted={field.conflicted}>
								<div class="field-row__label">
									<code class="field-row__path">{field.path}</code>
									{#if field.conflicted}
										<span class="badge badge--conflict">Conflict</span>
									{:else if isPending(view.id, field.path)}
										<span class="badge badge--mine">Your edit</span>
									{:else if field.dmAuthored}
										<span class="badge badge--dm" data-testid={`collab-dm-authored-${view.id}-${field.path}`}>DM-edited</span>
									{:else if field.authorKind === 'player-authored'}
										<span class="badge badge--player">Player edit</span>
									{/if}
								</div>
								{#if Array.isArray(field.value)}
									<span class="field-row__readonly">{(field.value as string[]).join(', ') || '—'}</span>
								{:else if canEditField(view.id, field.path)}
									<div class="field-row__edit">
										<input data-testid={`collab-input-${view.id}-${field.path}`} type={isNumericPath(field.path) ? 'number' : 'text'} bind:value={working[key(view.id, field.path)]} />
										<button type="button" class="button secondary" data-testid={`collab-save-${view.id}-${field.path}`} onclick={() => saveField(view.id, field)}>Save</button>
									</div>
								{:else}
									<span class="field-row__readonly" data-testid={`collab-value-${view.id}-${field.path}`}>{field.value == null ? '—' : String(field.value)}</span>
								{/if}
							</li>
						{/each}
					</ul>

					{#if view.history.length > 0}
						<details class="history" data-testid={`collab-history-${view.id}`}>
							<summary>Edit history ({view.history.length})</summary>
							<ul class="history-list">
								{#each view.history as entry (entry.id)}
									<li>
										<code>{entry.path}</code>: “{truncate(entry.value)}” by {actorName(entry.authorActorId)}
										<span class="badge {entry.authorRole === 'dm' ? 'badge--dm' : 'badge--player'}">{entry.authorRole}</span>
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
	.collab { display: flex; flex-direction: column; gap: var(--space-3); }
	.collab__head h2 { margin: 0; font-family: var(--font-display); font-weight: var(--font-weight-bold); font-size: var(--text-lg); color: var(--color-text-primary); letter-spacing: var(--tracking-tight); }
	.collab__sub, .collab__empty { margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm); }
	.collab__error { margin: 0; color: var(--color-status-error-text); font-size: var(--text-sm); }
	.collab-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
	.ccard { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); }
	.ccard__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
	.ccard__name { margin: 0; font-family: var(--font-display); font-weight: var(--font-weight-bold); font-size: var(--text-md); color: var(--color-text-primary); }
	.owner-pill { font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-text-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-full); padding: 0 var(--space-2); }
	.grant { display: flex; align-items: flex-end; gap: var(--space-2); flex-wrap: wrap; }
	.field { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
	.field__label { font-size: var(--text-sm); font-weight: var(--font-weight-semibold); color: var(--color-text-secondary); }
	.field :global(select) { min-height: var(--touch-target-min); padding: var(--space-2); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.fields { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
	.field-row { display: flex; flex-direction: column; gap: var(--space-1); }
	.field-row__label { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
	.field-row__path, .conflict__path { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-secondary); }
	.field-row__edit { display: flex; gap: var(--space-2); align-items: center; }
	.field-row__edit input { flex: 1 1 12rem; min-width: 0; min-height: var(--touch-target-min); padding: var(--space-2) var(--space-3); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.field-row__readonly { color: var(--color-text-primary); font-size: var(--text-sm); }
	.conflicts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
	.conflict { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); background: var(--color-status-error-subtle); border: 1px solid var(--color-status-error); border-radius: var(--radius-sm); }
	.conflict__head { display: flex; align-items: center; gap: var(--space-2); }
	.conflict__actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
	.conflict__wait { font-size: var(--text-sm); color: var(--color-text-secondary); }
	.badge { font-size: var(--text-2xs); font-weight: var(--font-weight-semibold); padding: 0 var(--space-1-5); border-radius: var(--radius-full); text-transform: uppercase; letter-spacing: var(--tracking-wide); border: 1px solid transparent; }
	.badge--dm { background: var(--color-dm-only-subtle); color: var(--color-dm-only-badge); border-color: var(--color-dm-only-badge); }
	.badge--player { background: var(--color-status-success-subtle); color: var(--color-status-success-text); border-color: var(--color-status-success); }
	.badge--mine { background: var(--color-status-info-subtle); color: var(--color-status-info-text); border-color: var(--color-status-info); }
	.badge--conflict { background: var(--color-status-error-subtle); color: var(--color-status-error-text); border-color: var(--color-status-error); }
	.history summary { cursor: pointer; font-size: var(--text-sm); color: var(--color-text-secondary); }
	.history-list { list-style: none; margin: var(--space-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); color: var(--color-text-secondary); }
</style>
