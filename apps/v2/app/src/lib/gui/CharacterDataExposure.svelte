<script lang="ts">
	import {
		CHARACTER_EXPOSURE_PATHS,
		buildCharacterDataEnvironment,
		listCharactersForActor,
		resolveCharacterExposure,
		type CharacterExposureFieldGroup,
		type WidgetBinding,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CHAR-006: the STRUCTURED character data-exposure API a widget binds to. This panel is a thin
	// demonstration of the contract: it renders the published, enumerable binding paths grouped by
	// field group, and resolves the chosen path for the ACTIVE actor through the Processing Core's
	// `resolveCharacterExposure` (which fails closed to hidden/conflicted/missing — never a leak). The
	// GUI never re-derives visibility (Contract 1); it only dispatches the selector + renders the
	// resolver's computed state.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);

	// The characters the active actor may see, for the bind target picker. Hidden characters are
	// omitted by the core (never listed), so this list is already actor-safe.
	const characters = $derived(
		actor
			? listCharactersForActor(
					runtime.state.characters,
					runtime.state.permissions,
					runtime.activeActorId,
				)
			: [],
	);

	// The full data environment (every character projected into a binding record). The resolver
	// redacts per actor; this environment is actor-independent on purpose.
	const dataEnv = $derived(buildCharacterDataEnvironment(runtime.state.characters));

	const GROUP_LABELS: Record<CharacterExposureFieldGroup, string> = {
		identity: 'Identity',
		hp: 'HP',
		resources: 'Resources',
		conditions: 'Conditions',
		'spell-slots': 'Spell slots',
		abilities: 'Abilities',
		skills: 'Skills',
		equipment: 'Equipment',
		notes: 'Notes',
	};

	// Group the published contract paths by field group, in a stable order, for the contract list.
	const grouped = $derived(
		(Object.keys(GROUP_LABELS) as CharacterExposureFieldGroup[])
			.map((group) => ({
				group,
				label: GROUP_LABELS[group],
				paths: CHARACTER_EXPOSURE_PATHS.filter((path) => path.group === group),
			}))
			.filter((entry) => entry.paths.length > 0),
	);

	let selectedCharacterId = $state('');
	let selectedSelector = $state('combat.hp');

	// Keep a valid character selected as the visible list changes (e.g. after switching actor).
	$effect(() => {
		if (characters.length === 0) {
			selectedCharacterId = '';
		} else if (!characters.some((character) => character.id === selectedCharacterId)) {
			selectedCharacterId = characters[0]!.id;
		}
	});

	const resolution = $derived.by(() => {
		if (!actor || selectedCharacterId === '') return null;
		const binding: WidgetBinding = {
			source: { entityType: 'character', entityId: selectedCharacterId, selector: selectedSelector },
			mode: 'read',
			requiredCapability: 'viewer',
		};
		return resolveCharacterExposure(binding, actor, dataEnv);
	});

	function resolvedValueText(): string {
		if (!resolution || resolution.state !== 'available' || !resolution.value) return '';
		const value = resolution.value[selectedSelector] ?? resolution.value;
		return JSON.stringify(value, null, 2);
	}
</script>

<section data-testid="character-data-exposure" aria-label="Character data exposure">
	<h2>Character data exposure</h2>
	<p class="meta">
		The structured, stable API a widget binds to. Pick a character and a published binding path; the
		Processing Core resolves it for you as the active participant and fails closed for hidden or
		conflicted fields.
	</p>

	{#if characters.length === 0}
		<p class="meta" data-testid="exposure-empty">No characters are visible to you to bind.</p>
	{:else}
		<form>
			<label>
				Character
				<select data-testid="exposure-character" bind:value={selectedCharacterId}>
					{#each characters as character (character.id)}
						<option value={character.id}>{character.name}</option>
					{/each}
				</select>
			</label>
			<label>
				Binding path
				<select data-testid="exposure-selector" bind:value={selectedSelector}>
					{#each grouped as entry (entry.group)}
						<optgroup label={entry.label}>
							{#each entry.paths as path (path.selector)}
								<option value={path.selector}>{path.selector}</option>
							{/each}
						</optgroup>
					{/each}
					<!-- An unsupported selector demonstrates the fail-closed contract. -->
					<option value="combat.secretPlan">combat.secretPlan (unsupported)</option>
				</select>
			</label>
		</form>

		{#if resolution}
			<div class="scene-card" data-testid="exposure-result">
				<div class="meta">
					State: <strong data-testid="exposure-state">{resolution.state}</strong>
				</div>
				{#if resolution.state === 'available'}
					<pre data-testid="exposure-value">{resolvedValueText()}</pre>
				{:else if resolution.state === 'hidden'}
					<p class="meta" data-testid="exposure-hidden">
						Hidden ({resolution.reason}). The field is omitted; no value is exposed.
					</p>
				{:else if resolution.state === 'conflicted'}
					<p class="meta" data-testid="exposure-conflicted">
						Conflicted: {resolution.conflictPaths.join(', ')}. The DM must resolve it before binding.
					</p>
				{:else}
					<p class="meta" data-testid="exposure-missing">
						Missing or unsupported. The path is not in the exposure contract.
					</p>
				{/if}
			</div>
		{/if}

		<h3>Published binding paths</h3>
		<ul class="scene-list" data-testid="exposure-contract">
			{#each grouped as entry (entry.group)}
				<li class="scene-card" data-testid={`exposure-group-${entry.group}`}>
					<strong>{entry.label}</strong>
					<span class="meta"> • {entry.paths.map((path) => path.selector).join(', ')}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
