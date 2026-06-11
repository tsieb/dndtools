<script lang="ts">
	import {
		CHARACTER_EXPOSURE_PATHS,
		buildCharacterDataEnvironment,
		listCharactersForActor,
		resolveCharacterExposure,
		type CharacterExposureFieldGroup,
		type WidgetBinding,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import Disclosure from '$lib/gui/a11y/Disclosure.svelte';

	// UX-CHAR-010 (CHAR-006) — the data-exposure WIDGET BINDING surface: a character picker + a binding
	// PATH BROWSER grouped by field group with human labels, resolving the chosen path for the ACTIVE
	// actor through the Processing Core's `resolveCharacterExposure` (which fails closed to
	// hidden/conflicted/missing — never a leak). The GUI never re-derives visibility (Contract 1); it
	// only chooses a selector and renders the resolver's computed state.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);

	const characters = $derived(
		actor ? listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId) : [],
	);
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
	// Human-readable labels for each binding selector (UX-CHAR-010 §spec: "Current hit points" over
	// the raw `combat.hp`). Falls back to the selector for any path not enumerated here.
	const SELECTOR_LABELS: Record<string, string> = {
		name: 'Name',
		kind: 'Kind',
		'combat.hp': 'Current hit points',
		'combat.maxHp': 'Maximum hit points',
		'combat.tempHp': 'Temporary hit points',
		'combat.ac': 'Armour class',
		'combat.conditions': 'Conditions',
		'resources.spellSlots': 'Spell slots',
		'resources.spells': 'Known spells',
		'resources.deathSaves': 'Death saves',
		'resources.concentration': 'Concentration',
		'resources.classResources': 'Class resources',
		'resources.ledger': 'Expenditure history',
		abilities: 'Ability scores',
		'data.skills': 'Skills',
		'data.equipment': 'Equipment',
		'data.notes': 'Notes',
		'data.backstory': 'Backstory',
	};
	const UNSUPPORTED_SELECTOR = 'combat.secretPlan';

	const grouped = $derived(
		(Object.keys(GROUP_LABELS) as CharacterExposureFieldGroup[])
			.map((group) => ({ group, label: GROUP_LABELS[group], paths: CHARACTER_EXPOSURE_PATHS.filter((path) => path.group === group) }))
			.filter((entry) => entry.paths.length > 0),
	);

	let selectedCharacterId = $state('');
	let selectedSelector = $state('combat.hp');

	$effect(() => {
		if (characters.length === 0) selectedCharacterId = '';
		else if (!characters.some((character) => character.id === selectedCharacterId)) selectedCharacterId = characters[0]!.id;
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
	function label(selector: string): string {
		return SELECTOR_LABELS[selector] ?? selector;
	}
</script>

<section class="exposure" data-testid="character-data-exposure" aria-label="Character data exposure">
	<header class="exposure__head">
		<h2>Widget data binding</h2>
		<p class="exposure__sub">Pick a character and a published binding path; the Processing Core resolves it as the active participant and fails closed for hidden or conflicted fields.</p>
	</header>

	{#if characters.length === 0}
		<p class="exposure__empty" data-testid="exposure-empty">No characters are visible to you to bind.</p>
	{:else}
		<div class="exposure__grid">
			<div class="exposure__pick">
				<label class="field">
					<span class="field__label">Character</span>
					<select data-testid="exposure-character" bind:value={selectedCharacterId}>
						{#each characters as character (character.id)}
							<option value={character.id}>{character.name}</option>
						{/each}
					</select>
				</label>

				<div class="browser" data-testid="exposure-contract" aria-label="Binding paths">
					{#each grouped as entry (entry.group)}
						<section class="group" aria-label={entry.label}>
							<h3 class="group__head" data-testid={`exposure-group-${entry.group}`}>{entry.label}</h3>
							<ul class="paths">
								{#each entry.paths as path (path.selector)}
									<li>
										<button
											type="button"
											class="path"
											class:path--active={selectedSelector === path.selector}
											aria-pressed={selectedSelector === path.selector}
											data-testid={`exposure-path-${path.selector}`}
											onclick={() => (selectedSelector = path.selector)}
										>
											<span class="path__label">{label(path.selector)}</span>
											<code class="path__sel">{path.selector}</code>
										</button>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
					<!-- An unsupported selector demonstrates the fail-closed contract. -->
					<section class="group" aria-label="Unsupported">
						<h3 class="group__head">Unsupported (demo)</h3>
						<ul class="paths">
							<li>
								<button type="button" class="path" class:path--active={selectedSelector === UNSUPPORTED_SELECTOR}
									aria-pressed={selectedSelector === UNSUPPORTED_SELECTOR}
									data-testid={`exposure-path-${UNSUPPORTED_SELECTOR}`}
									onclick={() => (selectedSelector = UNSUPPORTED_SELECTOR)}>
									<span class="path__label">Not in the contract</span>
									<code class="path__sel">{UNSUPPORTED_SELECTOR}</code>
								</button>
							</li>
						</ul>
					</section>
				</div>
			</div>

			<!-- Preview panel — fails closed for hidden / conflicted / missing. -->
			<div class="preview" role="status" aria-live="polite" data-testid="exposure-result">
				<div class="preview__head">
					<span class="preview__path">{label(selectedSelector)}</span>
					<code class="preview__sel">{selectedSelector}</code>
				</div>
				{#if resolution}
					<div class="preview__state">State: <strong data-testid="exposure-state">{resolution.state}</strong></div>
					{#if resolution.state === 'available'}
						<pre class="preview__value" data-testid="exposure-value">{resolvedValueText()}</pre>
					{:else if resolution.state === 'hidden'}
						<p class="preview__note" data-testid="exposure-hidden">This data is not visible to you. No value is exposed.</p>
					{:else if resolution.state === 'conflicted'}
						<p class="preview__note" data-testid="exposure-conflicted">Value is in conflict — the DM must resolve it before the binding reads correctly ({resolution.conflictPaths.join(', ')}).</p>
					{:else}
						<p class="preview__note" data-testid="exposure-missing">This path is not part of the published data contract.</p>
					{/if}
				{:else}
					<p class="preview__note">Select a character above.</p>
				{/if}

				<Disclosure summary="Show raw selector" testid="exposure-advanced">
					<input class="raw" readonly value={selectedSelector} aria-label="Raw selector string" data-testid="exposure-raw" />
				</Disclosure>
			</div>
		</div>
	{/if}
</section>

<style>
	.exposure { display: flex; flex-direction: column; gap: var(--space-3); }
	.exposure__head h2 { margin: 0; }
	.exposure__sub, .exposure__empty { margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm); }
	.exposure__grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-4); align-items: start; }
	.exposure__pick { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
	.field { display: flex; flex-direction: column; gap: var(--space-1); }
	.field__label { font-size: var(--text-sm); font-weight: var(--font-weight-semibold); color: var(--color-text-secondary); }
	.field :global(select) { min-height: var(--touch-target-min); padding: var(--space-2) var(--space-3); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.browser { display: flex; flex-direction: column; gap: var(--space-2); max-height: 22rem; overflow-y: auto; padding: var(--space-2); background: var(--color-surface-sunken); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
	.group__head { margin: 0 0 var(--space-1); font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-text-secondary); }
	.paths { list-style: none; margin: 0 0 var(--space-2); padding: 0; display: flex; flex-direction: column; gap: var(--space-0-5); }
	.path { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); width: 100%; min-height: var(--touch-target-min); text-align: left; padding: var(--space-1) var(--space-2); background: transparent; color: var(--color-text-primary); border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; }
	.path:hover { background: var(--color-interactive-hover); }
	.path--active { background: var(--color-interactive-selected); border-color: var(--color-accent-border); }
	.path__label { font-size: var(--text-sm); }
	.path__sel, .preview__sel { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-secondary); }
	.preview { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-md); position: sticky; top: var(--space-3); }
	.preview__head { display: flex; flex-direction: column; gap: var(--space-0-5); }
	.preview__path { font-weight: var(--font-weight-semibold); }
	.preview__state { font-size: var(--text-sm); color: var(--color-text-secondary); }
	.preview__value { margin: 0; padding: var(--space-2); background: var(--color-surface-sunken); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: var(--text-sm); overflow: auto; }
	.preview__note { margin: 0; font-size: var(--text-sm); color: var(--color-text-secondary); }
	.raw { width: 100%; font-family: var(--font-mono); font-size: var(--text-sm); padding: var(--space-2); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
	@media (max-width: 860px) {
		.exposure__grid { grid-template-columns: minmax(0, 1fr); }
		.preview { position: static; }
	}
</style>
