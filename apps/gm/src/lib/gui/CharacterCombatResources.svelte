<script lang="ts">
	import {
		hasGrantedCapability,
		listCharactersForActor,
		ensureCharacterResources,
		availableSlots,
		availableClassResource,
		type CharacterResources,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import HpBar from '$lib/gui/ux-char/HpBar.svelte';

	// UX-CHAR-003/005/006/007 (CHAR-007/008) — the per-character COMBAT SHEET. Each visible character
	// renders as a sheet card with a persistent VITALS BAR (HP dominant, AC, temp, conditions, death
	// saves) over the in-play hot-path controls: an HP Damage/Heal delta stepper with an optimistic
	// preview, tappable death-save circles, a condition type-ahead, a concentration toggle, and spell
	// slot / class resource PIP rows. A character OWNER or COMBAT PARTICIPANT updates these DURING a
	// session (the core re-enforces session-active gating + owner/participant authority on dispatch);
	// the OWNER additionally manages slot/resource structure and rest recovery. Every change dispatches a
	// durable command; the GUI renders the computed resource model and never writes state directly.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');

	const visibleCharacters = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	// The 14 standard 5e conditions seeded into the Add-condition type-ahead (UX-CHAR-006 §spec).
	const STANDARD_CONDITIONS = [
		'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
		'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
	];
	const DEATH_SAVE_SLOTS = [0, 1, 2];

	let error = $state<string | null>(null);
	let amount = $state<Record<string, number>>({});
	let tempHpValue = $state<Record<string, number>>({});
	let conditionQuery = $state<Record<string, string>>({});
	let conditionPickerOpen = $state<Record<string, boolean>>({});
	let concentrationEffect = $state<Record<string, string>>({});
	let slotLevel = $state<Record<string, number>>({});
	let slotMax = $state<Record<string, number>>({});
	let resourceName = $state<Record<string, string>>({});
	let resourceMax = $state<Record<string, number>>({});
	let resourceRecharge = $state<Record<string, 'short' | 'long' | 'none'>>({});

	function resources(characterId: string): CharacterResources {
		const character = runtime.state.characters.characters[characterId];
		return ensureCharacterResources(character?.resources);
	}

	function canUpdateCombat(characterId: string): boolean {
		if (!actor) return false;
		if (isDm) return true;
		return hasGrantedCapability(runtime.state.permissions, actor, 'character', characterId, 'combat-participant');
	}
	function canManage(characterId: string): boolean {
		if (!actor) return false;
		if (isDm) return true;
		return hasGrantedCapability(runtime.state.permissions, actor, 'character', characterId, 'owner');
	}

	function amountFor(characterId: string): number {
		const value = Math.trunc(Number(amount[characterId] ?? 1));
		return Number.isFinite(value) && value > 0 ? value : 1;
	}

	// Optimistic resulting HP after a pending Damage/Heal, mirroring the core rule (damage burns temp
	// first; both bounded). Drives the "→ N / M" preview and the aria-live announcement.
	function previewHp(characterId: string, mode: 'damage' | 'heal'): { hp: number; tempHp: number } {
		const character = runtime.state.characters.characters[characterId];
		if (!character) return { hp: 0, tempHp: 0 };
		const { hp, maxHp, tempHp } = character.combat;
		const a = amountFor(characterId);
		if (mode === 'heal') return { hp: Math.min(maxHp, hp + a), tempHp };
		const absorbed = Math.min(tempHp, a);
		return { hp: Math.max(0, hp - (a - absorbed)), tempHp: tempHp - absorbed };
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

	async function applyDelta(characterId: string, mode: 'damage' | 'heal'): Promise<void> {
		const a = amountFor(characterId);
		await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'hp', delta: mode === 'damage' ? -a : a },
		});
	}

	function bumpAmount(characterId: string, delta: number): void {
		amount[characterId] = Math.max(1, amountFor(characterId) + delta);
	}

	function onStepperKeydown(event: KeyboardEvent, characterId: string): void {
		// Keyboard shortcuts active only when the stepper group has focus (UX-CHAR-005 §input).
		if (!sessionActive || !canUpdateCombat(characterId)) return;
		if (event.key === '+') { bumpAmount(characterId, 1); event.preventDefault(); }
		else if (event.key === '-') { bumpAmount(characterId, -1); event.preventDefault(); }
		else if (event.key === 'd' || event.key === 'D') { applyDelta(characterId, 'damage'); event.preventDefault(); }
		else if (event.key === 'h' || event.key === 'H') { applyDelta(characterId, 'heal'); event.preventDefault(); }
	}

	async function applyTempHp(characterId: string): Promise<void> {
		await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'temp-hp', value: Math.max(0, Math.trunc(Number(tempHpValue[characterId] ?? 0))) },
		});
	}

	async function setCondition(characterId: string, condition: string, present: boolean): Promise<void> {
		const name = condition.trim();
		if (!name) return;
		const ok = await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'condition', condition: name, present },
		});
		if (ok && present) {
			conditionQuery[characterId] = '';
			conditionPickerOpen[characterId] = false;
		}
	}

	async function deathSave(characterId: string, outcome: 'success' | 'failure' | 'reset'): Promise<void> {
		await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'death-save', outcome },
		});
	}

	async function concentrate(characterId: string, clear: boolean): Promise<void> {
		const effect = clear ? null : (concentrationEffect[characterId] ?? '').trim();
		if (!clear && !effect) {
			error = 'Enter a concentration effect.';
			return;
		}
		const ok = await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'concentration', effect },
		});
		if (ok && !clear) concentrationEffect[characterId] = '';
	}

	async function castSlot(characterId: string, level: number): Promise<void> {
		await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'spell-slot', level },
		});
	}
	async function spendResource(characterId: string, resourceId: string): Promise<void> {
		await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'class-resource', resourceId, amount: 1 },
		});
	}

	async function declareSlots(characterId: string): Promise<void> {
		await dispatch({
			type: 'character.set-spell-slots',
			actorId: runtime.activeActorId,
			payload: {
				characterId,
				level: Math.trunc(Number(slotLevel[characterId] ?? 1)),
				max: Math.max(0, Math.trunc(Number(slotMax[characterId] ?? 0))),
			},
		});
	}
	async function declareResource(characterId: string): Promise<void> {
		const name = (resourceName[characterId] ?? '').trim();
		if (!name) {
			error = 'Enter a resource name.';
			return;
		}
		const ok = await dispatch({
			type: 'character.set-class-resource',
			actorId: runtime.activeActorId,
			payload: {
				characterId,
				id: name.toLowerCase().replace(/\s+/g, '-'),
				name,
				max: Math.max(0, Math.trunc(Number(resourceMax[characterId] ?? 0))),
				recharge: resourceRecharge[characterId] ?? 'long',
			},
		});
		if (ok) resourceName[characterId] = '';
	}
	async function rest(characterId: string, restKind: 'short' | 'long'): Promise<void> {
		await dispatch({
			type: 'character.rest',
			actorId: runtime.activeActorId,
			payload: { characterId, rest: restKind },
		});
	}

	// UX-CHAR-004 — inline click-to-edit for the character name in the vitals header. Read display ↔
	// text input; Enter/blur saves (dispatches the durable `character.edit-field` command), Escape
	// reverts. Only an owner/DM gets the edit affordance (the core re-enforces field authority).
	let editingName = $state<Record<string, boolean>>({});
	let nameDraft = $state<Record<string, string>>({});
	let savedName = $state<Record<string, boolean>>({});
	let savedNameTimers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};

	function startEditName(characterId: string, current: string): void {
		if (!canManage(characterId)) return;
		nameDraft[characterId] = current;
		editingName[characterId] = true;
	}
	function cancelEditName(characterId: string): void {
		editingName[characterId] = false;
	}
	async function saveName(characterId: string): Promise<void> {
		if (!editingName[characterId]) return;
		editingName[characterId] = false;
		const next = (nameDraft[characterId] ?? '').trim();
		const current = runtime.state.characters.characters[characterId]?.name ?? '';
		if (!next || next === current) return;
		const ok = await dispatch({
			type: 'character.edit-field',
			actorId: runtime.activeActorId,
			payload: { characterId, path: 'name', value: next },
		});
		if (!ok) return;
		savedName[characterId] = true;
		if (savedNameTimers[characterId]) clearTimeout(savedNameTimers[characterId]);
		if (typeof setTimeout !== 'undefined') {
			savedNameTimers[characterId] = setTimeout(() => (savedName[characterId] = false), 2000);
		}
	}
	function onNameKeydown(event: KeyboardEvent, characterId: string): void {
		if (event.key === 'Enter') { event.preventDefault(); saveName(characterId); }
		else if (event.key === 'Escape') { event.preventDefault(); cancelEditName(characterId); }
	}

	function filteredConditions(characterId: string, current: string[]): string[] {
		const query = (conditionQuery[characterId] ?? '').toLowerCase();
		return STANDARD_CONDITIONS.filter(
			(condition) => !current.includes(condition) && condition.toLowerCase().includes(query),
		);
	}
	/** Pips for a pool: index < used → filled, else available. Capped at 10 per the spec; >10 = numeric. */
	function pips(used: number, max: number): { filled: boolean }[] {
		if (max > 10) return [];
		return Array.from({ length: max }, (_, index) => ({ filled: index < used }));
	}
</script>

<section class="combat" data-testid="combat-resources-view" aria-label="Combat resources and spells">
	<header class="combat__head">
		<h2>Combat &amp; resources</h2>
		<p class="combat__sub">Vitals, the in-play hot path, and spell/resource recovery.</p>
	</header>

	{#if error}
		<p class="combat__error" role="alert" data-testid="resources-error">{error}</p>
	{/if}

	{#if !sessionActive}
		<p class="combat__inactive" data-testid="resources-session-inactive">
			Combat updates available during active sessions — the DM starts a session to enable them.
		</p>
	{/if}

	{#if visibleCharacters.length === 0}
		<p class="combat__empty" data-testid="resources-empty">No characters are visible to you.</p>
	{:else}
		<ul class="sheets" data-testid="resources-list">
			{#each visibleCharacters as character (character.id)}
				{@const r = resources(character.id)}
				{@const dmg = previewHp(character.id, 'damage')}
				{@const heal = previewHp(character.id, 'heal')}
				<li class="sheet" data-testid={`resources-character-${character.id}`}>
					<!-- VITALS BAR (UX-CHAR-003): HP is the dominant numeral, AC prominent, conditions + death
					     saves glanceable; announced via role="status" so HP changes are read out. -->
					<header class="vitals" role="status" aria-label={`${character.name} vitals`}>
						<div class="vitals__name">
							{#if editingName[character.id]}
								<!-- svelte-ignore a11y_autofocus -->
								<input
									class="name-edit"
									data-testid={`resources-name-edit-${character.id}`}
									aria-label={`Edit name for ${character.name}`}
									bind:value={nameDraft[character.id]}
									onkeydown={(event) => onNameKeydown(event, character.id)}
									onblur={() => saveName(character.id)}
									autofocus
								/>
							{:else if canManage(character.id)}
								<button
									type="button"
									class="name-display"
									data-testid={`resources-name-${character.id}`}
									title="Click to edit name"
									onclick={() => startEditName(character.id, character.name)}
								>
									{character.name}
								</button>
							{:else}
								<strong>{character.name}</strong>
							{/if}
							<span class="vitals__kind">{character.kind}</span>
							{#if savedName[character.id]}<span class="name-saved" role="status">✓ Saved</span>{/if}
						</div>
						<div class="vitals__hp" data-testid={`resources-hp-${character.id}`}>
							<span class="vitals__hp-num">HP {character.combat.hp}/{character.combat.maxHp}</span>
							{#if character.combat.tempHp > 0}<span class="vitals__temp">+{character.combat.tempHp} temp</span>{/if}
						</div>
						<HpBar hp={character.combat.hp} maxHp={character.combat.maxHp} tempHp={character.combat.tempHp} label={character.name} />
						<div class="vitals__ac">AC <strong>{character.combat.ac}</strong></div>
						<div class="vitals__conditions">
							{#if character.combat.conditions.length > 0}
								{#each character.combat.conditions as condition (condition)}
									<span class="cond-pill">{condition}</span>
								{/each}
							{:else}
								<span class="cond-none">No conditions</span>
							{/if}
						</div>
						<div class="vitals__death" aria-label="Death saves">
							<span class="death-label">Death saves</span>
							<span class="death-row">
								<span class="death-glyphs death-glyphs--ok">{'●'.repeat(r.deathSaves.successes)}{'○'.repeat(3 - r.deathSaves.successes)}</span>
								<span class="death-glyphs death-glyphs--bad">{'●'.repeat(r.deathSaves.failures)}{'○'.repeat(3 - r.deathSaves.failures)}</span>
								{#if r.deathSaves.stable}<span class="death-stable">Stable</span>{/if}
							</span>
						</div>
					</header>

					{#if canUpdateCombat(character.id)}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<fieldset
							class="controls"
							disabled={!sessionActive}
							data-testid={`resources-combat-controls-${character.id}`}
							onkeydown={(event) => onStepperKeydown(event, character.id)}
						>
							<legend class="sr-only">Combat updates for {character.name}</legend>

							<!-- HP DELTA STEPPER (UX-CHAR-005). -->
							<div class="stepper" role="group" aria-label={`HP controls for ${character.name}`}>
								<div class="stepper__amount">
									<button type="button" class="step-btn" aria-label="Decrease amount" onclick={() => bumpAmount(character.id, -1)}>−</button>
									<label class="stepper__field">
										<span class="sr-only">Amount</span>
										<input class="num" type="number" inputmode="numeric" min="1" max="9999"
											data-testid={`resources-amount-${character.id}`} bind:value={amount[character.id]} placeholder="1" />
									</label>
									<button type="button" class="step-btn" aria-label="Increase amount" onclick={() => bumpAmount(character.id, 1)}>+</button>
								</div>
								<div class="stepper__actions">
									<button type="button" class="button danger" data-testid={`resources-deal-${character.id}`} onclick={() => applyDelta(character.id, 'damage')}>
										Deal {amountFor(character.id)}
									</button>
									<button type="button" class="button heal" data-testid={`resources-heal-${character.id}`} onclick={() => applyDelta(character.id, 'heal')}>
										Heal {amountFor(character.id)}
									</button>
								</div>
								<p class="stepper__preview" aria-live="polite">
									Damage → {dmg.hp}/{character.combat.maxHp}{dmg.tempHp !== character.combat.tempHp ? ` (+${dmg.tempHp} temp)` : ''}
									· Heal → {heal.hp}/{character.combat.maxHp}
								</p>
								<details class="exact" data-testid={`resources-temp-${character.id}`}>
									<summary>Temp HP &amp; corrections</summary>
									<div class="control-row">
										<label><span>Set temp HP</span>
											<input class="num" type="number" inputmode="numeric" min="0"
												data-testid={`resources-temp-hp-${character.id}`} bind:value={tempHpValue[character.id]} /></label>
										<button type="button" class="button secondary" data-testid={`resources-temp-hp-apply-${character.id}`} onclick={() => applyTempHp(character.id)}>Set temp HP</button>
									</div>
								</details>
							</div>

							<!-- DEATH SAVES (UX-CHAR-006): tappable circles. -->
							<div class="death-controls" role="group" aria-label="Death saves">
								<span class="control-label">Death saves</span>
								<span class="death-track">
									{#each DEATH_SAVE_SLOTS as i (`s${i}`)}
										<button type="button" class="dsave dsave--ok" role="checkbox" aria-checked={i < r.deathSaves.successes}
											aria-label={`Death save success ${i + 1}`} data-testid={`resources-death-success-${character.id}-${i}`}
											onclick={() => { if (i >= r.deathSaves.successes) deathSave(character.id, 'success'); }}></button>
									{/each}
								</span>
								<span class="death-track">
									{#each DEATH_SAVE_SLOTS as i (`f${i}`)}
										<button type="button" class="dsave dsave--bad" role="checkbox" aria-checked={i < r.deathSaves.failures}
											aria-label={`Death save failure ${i + 1}`} data-testid={`resources-death-failure-${character.id}-${i}`}
											onclick={() => { if (i >= r.deathSaves.failures) deathSave(character.id, 'failure'); }}></button>
									{/each}
								</span>
								<button type="button" class="button ghost" data-testid={`resources-death-reset-${character.id}`} onclick={() => deathSave(character.id, 'reset')}>Reset</button>
							</div>

							<!-- CONDITIONS (UX-CHAR-006): pills + type-ahead. -->
							<div class="cond-controls">
								<span class="control-label">Conditions</span>
								<ul class="cond-list" role="list">
									{#each character.combat.conditions as condition (condition)}
										<li class="cond-pill cond-pill--editable">
											{condition}
											<button type="button" class="cond-x" aria-label={`Remove ${condition}`}
												data-testid={`resources-condition-remove-${character.id}-${condition}`}
												onclick={() => setCondition(character.id, condition, false)}>✕</button>
										</li>
									{/each}
									{#if character.combat.conditions.length === 0}
										<li class="cond-none">None</li>
									{/if}
								</ul>
								<div class="cond-add">
									<button type="button" class="button secondary" aria-expanded={conditionPickerOpen[character.id] ?? false}
										data-testid={`resources-condition-add-${character.id}`}
										onclick={() => (conditionPickerOpen[character.id] = !(conditionPickerOpen[character.id] ?? false))}>Add condition</button>
									{#if conditionPickerOpen[character.id]}
										<div class="cond-popover" role="group" aria-label="Add condition">
											<input class="cond-search" placeholder="Search or type a condition…" autocomplete="off"
												data-testid={`resources-condition-search-${character.id}`} bind:value={conditionQuery[character.id]} />
											<ul class="cond-options" role="list">
												{#each filteredConditions(character.id, character.combat.conditions) as option (option)}
													<li>
														<button type="button" class="cond-option" data-testid={`resources-condition-option-${character.id}-${option}`}
															onclick={() => setCondition(character.id, option, true)}>{option}</button>
													</li>
												{/each}
												{#if (conditionQuery[character.id] ?? '').trim() && !STANDARD_CONDITIONS.some((c) => c.toLowerCase() === (conditionQuery[character.id] ?? '').trim().toLowerCase())}
													<li>
														<button type="button" class="cond-option cond-option--free"
															onclick={() => setCondition(character.id, (conditionQuery[character.id] ?? '').trim(), true)}>Add “{conditionQuery[character.id]}”</button>
													</li>
												{/if}
											</ul>
										</div>
									{/if}
								</div>
							</div>

							<!-- CONCENTRATION (UX-CHAR-006). -->
							<div class="conc-controls">
								<span class="control-label">Concentration</span>
								{#if r.concentration.effect}
									<span class="conc-active">Concentrating on <strong>{r.concentration.effect}</strong></span>
									<button type="button" class="button ghost" data-testid={`resources-concentration-clear-${character.id}`} onclick={() => concentrate(character.id, true)}>Drop</button>
								{:else}
									<input class="conc-input" placeholder="Spell or effect…" autocomplete="off"
										data-testid={`resources-concentration-input-${character.id}`} bind:value={concentrationEffect[character.id]} />
									<button type="button" class="button secondary" data-testid={`resources-concentration-set-${character.id}`} onclick={() => concentrate(character.id, false)}>Concentrate</button>
								{/if}
							</div>
						</fieldset>
					{/if}

					<!-- SPELL SLOTS + CLASS RESOURCES as PIP rows (UX-CHAR-007). -->
					{#if Object.keys(r.spellSlots).length > 0 || Object.keys(r.classResources).length > 0}
						<div class="pools">
							{#each Object.values(r.spellSlots).sort((a, b) => a.level - b.level) as slot (slot.level)}
								{@const avail = availableSlots(slot)}
								<div class="pool" role="group" aria-label={`Level ${slot.level} spell slots, ${avail} of ${slot.max} available`}>
									<div class="pool__label">
										Level {slot.level} slots · <span data-testid={`resources-slot-${character.id}-${slot.level}`}>{avail}/{slot.max}</span>
									</div>
									{#if slot.max <= 10}
										<div class="pips" aria-hidden="true">
											{#each pips(slot.max - avail, slot.max) as pip, index (index)}
												<span class="pip" data-filled={pip.filled}></span>
											{/each}
										</div>
									{/if}
									{#if canUpdateCombat(character.id)}
										<button type="button" class="button secondary" disabled={!sessionActive || avail <= 0}
											aria-label={`Cast a level ${slot.level} spell slot`} data-testid={`resources-cast-${character.id}-${slot.level}`}
											onclick={() => castSlot(character.id, slot.level)}>Cast</button>
									{/if}
								</div>
							{/each}
							{#each Object.values(r.classResources) as resource (resource.id)}
								{@const avail = availableClassResource(resource)}
								<div class="pool" role="group" aria-label={`${resource.name}, ${avail} of ${resource.max} available`}>
									<div class="pool__label">
										{resource.name} · <span data-testid={`resources-class-${character.id}-${resource.id}`}>{avail}/{resource.max}</span>
										<span class="recharge-badge">{resource.recharge}</span>
									</div>
									{#if resource.max <= 10}
										<div class="pips" aria-hidden="true">
											{#each pips(resource.max - avail, resource.max) as pip, index (index)}
												<span class="pip" data-filled={pip.filled}></span>
											{/each}
										</div>
									{/if}
									{#if canUpdateCombat(character.id)}
										<button type="button" class="button secondary" disabled={!sessionActive || avail <= 0}
											data-testid={`resources-spend-${character.id}-${resource.id}`} onclick={() => spendResource(character.id, resource.id)}>Spend</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Owner-only structure management + rest recovery. -->
					{#if canManage(character.id)}
						<details class="manage" data-testid={`resources-manage-${character.id}`}>
							<summary>Manage spells, slots &amp; resources</summary>
							<div class="control-row">
								<label><span>Slot level</span><input class="num" type="number" data-testid={`resources-slot-level-${character.id}`} bind:value={slotLevel[character.id]} /></label>
								<label><span>Max slots</span><input class="num" type="number" data-testid={`resources-slot-max-${character.id}`} bind:value={slotMax[character.id]} /></label>
								<button type="button" class="button secondary" data-testid={`resources-slot-declare-${character.id}`} onclick={() => declareSlots(character.id)}>Set slots</button>
							</div>
							<div class="control-row">
								<label><span>Resource name</span><input data-testid={`resources-resource-name-${character.id}`} bind:value={resourceName[character.id]} autocomplete="off" /></label>
								<label><span>Max</span><input class="num" type="number" data-testid={`resources-resource-max-${character.id}`} bind:value={resourceMax[character.id]} /></label>
								<label><span>Recharge</span>
									<select data-testid={`resources-resource-recharge-${character.id}`} bind:value={resourceRecharge[character.id]}>
										<option value="long">Long rest</option>
										<option value="short">Short rest</option>
										<option value="none">None</option>
									</select></label>
								<button type="button" class="button secondary" data-testid={`resources-resource-declare-${character.id}`} onclick={() => declareResource(character.id)}>Add resource</button>
							</div>
							<div class="control-row">
								<span class="control-label">Rest</span>
								<button type="button" class="button secondary" data-testid={`resources-short-rest-${character.id}`} onclick={() => rest(character.id, 'short')}>Short rest</button>
								<button type="button" class="button secondary" data-testid={`resources-long-rest-${character.id}`} onclick={() => rest(character.id, 'long')}>Long rest</button>
							</div>
						</details>
					{/if}

					{#if r.ledger.length > 0}
						<details class="history" data-testid={`resources-history-${character.id}`}>
							<summary>Expenditure history ({r.ledger.length})</summary>
							<ul class="history-list">
								{#each r.ledger as entry (entry.id)}
									<li>{entry.label}{entry.delta != null ? ` (${entry.delta})` : ''}</li>
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
	.sr-only {
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
	.combat {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.combat__head h2 {
		margin: 0;
	}
	.combat__sub,
	.combat__inactive,
	.combat__empty {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.combat__inactive {
		padding: var(--space-2) var(--space-3);
		background: var(--color-status-warning-subtle);
		border: 1px solid var(--color-status-warning);
		border-radius: var(--radius-md);
		color: var(--color-status-warning-text);
	}
	.combat__error {
		margin: 0;
		color: var(--color-status-error-text);
		font-size: var(--text-sm);
	}
	.sheets {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.sheet {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}
	/* Vitals bar */
	.vitals {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas: 'name ac' 'hp ac' 'bar bar' 'cond cond' 'death death';
		gap: var(--space-1) var(--space-3);
		align-items: center;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border);
	}
	.vitals__name { grid-area: name; display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
	.vitals__name strong { font-size: var(--text-lg); }
	.name-display {
		font-size: var(--text-lg);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
		cursor: text;
		text-align: left;
	}
	.name-display:hover { border-color: var(--color-border); background: var(--color-interactive-hover); }
	.name-edit {
		font-size: var(--text-lg);
		font-weight: var(--font-weight-bold);
		min-height: var(--touch-target-min);
		padding: 0 var(--space-2);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-accent-border);
		border-radius: var(--radius-sm);
	}
	.name-saved { font-size: var(--text-xs); color: var(--color-status-success-text); }
	.vitals__kind { font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-text-secondary); }
	.vitals__hp { grid-area: hp; display: flex; align-items: baseline; gap: var(--space-2); }
	.vitals__hp-num { font-size: var(--text-xl); font-weight: var(--font-weight-bold); font-variant-numeric: tabular-nums; color: var(--color-text-primary); }
	.vitals__temp { font-size: var(--text-sm); color: var(--color-status-info-text); }
	.vitals :global(.hpbar) { grid-area: bar; }
	.vitals__ac { grid-area: ac; justify-self: end; font-size: var(--text-md); color: var(--color-text-secondary); }
	.vitals__ac strong { font-size: var(--text-xl); color: var(--color-text-primary); }
	.vitals__conditions { grid-area: cond; display: flex; flex-wrap: wrap; gap: var(--space-1); }
	.vitals__death { grid-area: death; display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
	.death-label { color: var(--color-text-secondary); }
	.death-glyphs--ok { color: var(--color-status-success); letter-spacing: 2px; }
	.death-glyphs--bad { color: var(--color-status-error); letter-spacing: 2px; margin-left: var(--space-2); }
	.death-stable { margin-left: var(--space-2); color: var(--color-status-success-text); }
	.cond-pill {
		font-size: var(--text-2xs);
		color: var(--color-status-warning-text);
		background: var(--color-status-warning-subtle);
		border: 1px solid var(--color-status-warning);
		border-radius: var(--radius-full);
		padding: 0 var(--space-2);
	}
	.cond-none { color: var(--color-text-secondary); font-size: var(--text-sm); }
	/* Controls */
	.controls {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		border: none;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	.controls:disabled { opacity: 0.55; }
	.control-label { font-size: var(--text-sm); font-weight: var(--font-weight-semibold); color: var(--color-text-secondary); }
	.stepper { display: flex; flex-direction: column; gap: var(--space-2); }
	.stepper__amount { display: flex; align-items: stretch; gap: var(--space-2); }
	.step-btn {
		min-width: var(--touch-target-min);
		min-height: var(--touch-target-min);
		font-size: var(--text-lg);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.stepper__field { display: flex; }
	.num {
		width: 5rem;
		text-align: center;
		min-height: var(--touch-target-min);
		padding: var(--space-2);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.num::-webkit-outer-spin-button,
	.num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
	.stepper__actions { display: flex; gap: var(--space-2); }
	.stepper__actions .button { flex: 1 1 0; min-height: 3rem; font-weight: var(--font-weight-semibold); }
	.stepper__preview { margin: 0; font-size: var(--text-sm); color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
	.button.danger { background: var(--color-status-error); color: var(--color-text-inverse); border-color: var(--color-status-error); }
	.button.heal { background: var(--color-status-success); color: var(--color-text-inverse); border-color: var(--color-status-success); }
	.button.ghost { background: transparent; color: var(--color-text-secondary); border: 1px solid var(--color-border); }
	.exact summary { cursor: pointer; font-size: var(--text-sm); color: var(--color-text-secondary); }
	.control-row { display: flex; align-items: flex-end; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
	.control-row label { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); }
	.control-row input,
	.control-row select { min-height: var(--touch-target-min); padding: var(--space-2); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.death-controls { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
	.death-track { display: inline-flex; gap: var(--space-1); }
	.dsave {
		width: var(--touch-target-min);
		height: var(--touch-target-min);
		border-radius: var(--radius-full);
		border: 2px solid var(--color-border-strong);
		background: transparent;
		cursor: pointer;
	}
	.dsave--ok[aria-checked='true'] { background: var(--color-status-success); border-color: var(--color-status-success); }
	.dsave--bad[aria-checked='true'] { background: var(--color-status-error); border-color: var(--color-status-error); }
	.cond-controls,
	.conc-controls { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
	.cond-list { list-style: none; display: flex; flex-wrap: wrap; gap: var(--space-1); margin: 0; padding: 0; }
	.cond-pill--editable { display: inline-flex; align-items: center; gap: var(--space-1); }
	.cond-x { background: transparent; border: none; color: inherit; cursor: pointer; min-width: var(--touch-target-min); min-height: var(--touch-target-min); }
	.cond-add { position: relative; }
	.cond-popover {
		position: absolute;
		z-index: var(--z-popover, 50);
		margin-top: var(--space-1);
		width: 16rem;
		max-width: 80vw;
		padding: var(--space-2);
		background: var(--color-surface-overlay);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
	}
	.cond-search { width: 100%; min-height: var(--touch-target-min); padding: var(--space-2); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.cond-options { list-style: none; margin: var(--space-1) 0 0; padding: 0; max-height: 12rem; overflow-y: auto; }
	.cond-option { width: 100%; text-align: left; padding: var(--space-1-5) var(--space-2); background: transparent; border: none; color: var(--color-text-primary); border-radius: var(--radius-sm); cursor: pointer; }
	.cond-option:hover { background: var(--color-interactive-hover); }
	.cond-option--free { color: var(--color-accent); }
	.conc-input { min-height: var(--touch-target-min); padding: var(--space-2); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.conc-active { font-size: var(--text-sm); }
	/* Pools / pips */
	.pools { display: flex; flex-direction: column; gap: var(--space-2); }
	.pool { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
	.pool__label { font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
	.recharge-badge { font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-text-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-full); padding: 0 var(--space-1-5); margin-left: var(--space-1); }
	.pips { display: inline-flex; gap: var(--space-1); }
	.pip { width: var(--space-3); height: var(--space-3); border-radius: var(--radius-full); border: 1px solid var(--color-accent-border); background: transparent; }
	.pip[data-filled='true'] { background: var(--color-accent); border-color: var(--color-accent); }
	.manage summary,
	.history summary { cursor: pointer; font-weight: var(--font-weight-medium); }
	.history-list { list-style: none; padding: 0; margin: var(--space-2) 0 0; display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); color: var(--color-text-secondary); }
</style>
