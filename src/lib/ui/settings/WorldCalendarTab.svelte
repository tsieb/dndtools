<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { settingsStorageState } from '$lib/state/settings-storage.svelte.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import type { WorldCalendar } from '$lib/types/world-calendar.js';
	import {
		DEFAULT_WORLD_CALENDAR,
		formatWorldDate,
		getMoonPhaseStatuses,
		normalizeWorldCalendar,
	} from '$lib/domain/world-calendar.js';

	let worldCalendar = $state<WorldCalendar>(normalizeWorldCalendar(DEFAULT_WORLD_CALENDAR));
	let worldDayNamesText = $state(DEFAULT_WORLD_CALENDAR.dayNames.join(', '));
	let savingWorldCalendar = $state(false);

	const worldDateShort = $derived(
		formatWorldDate(worldCalendar, worldCalendar.currentDayOffset, 'short'),
	);
	const worldDateLong = $derived(
		formatWorldDate(worldCalendar, worldCalendar.currentDayOffset, 'long'),
	);
	const worldDateIso = $derived(
		formatWorldDate(worldCalendar, worldCalendar.currentDayOffset, 'iso'),
	);
	const worldMoonStatuses = $derived(
		getMoonPhaseStatuses(worldCalendar, worldCalendar.currentDayOffset),
	);

	onMount(() => {
		void loadWorldCalendarSettings();
	});

	async function loadWorldCalendarSettings(): Promise<void> {
		try {
			worldCalendar = await settingsStorageState.getWorldCalendar();
			worldCalendarState.setCached(worldCalendar);
			worldDayNamesText = worldCalendar.dayNames.join(', ');
		} catch (error) {
			worldCalendar = normalizeWorldCalendar(DEFAULT_WORLD_CALENDAR);
			worldDayNamesText = worldCalendar.dayNames.join(', ');
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_LOAD_WORLD_CALENDAR_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to load world calendar settings: ${String(error)}`);
		}
	}

	function parseWorldDayNames(raw: string): string[] {
		return raw
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);
	}

	function parsePhaseNames(raw: string): string[] {
		return raw
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);
	}

	function updateWorldCalendar(updates: Partial<WorldCalendar>): void {
		worldCalendar = normalizeWorldCalendar({
			...worldCalendar,
			...updates,
		});
	}

	function applyWorldDayNamesDraft(): void {
		updateWorldCalendar({
			dayNames: parseWorldDayNames(worldDayNamesText),
		});
		worldDayNamesText = worldCalendar.dayNames.join(', ');
	}

	function updateWorldMonth(index: number, patch: Partial<WorldCalendar['months'][number]>): void {
		const months = worldCalendar.months.map((month, monthIndex) =>
			monthIndex === index ? { ...month, ...patch } : month,
		);
		updateWorldCalendar({ months });
	}

	function addWorldMonth(): void {
		updateWorldCalendar({
			months: [
				...worldCalendar.months,
				{ name: `Month ${worldCalendar.months.length + 1}`, days: 30 },
			],
		});
	}

	function removeWorldMonth(index: number): void {
		if (worldCalendar.months.length <= 1) return;
		updateWorldCalendar({
			months: worldCalendar.months.filter((_month, monthIndex) => monthIndex !== index),
		});
	}

	function updateLeapRule(
		index: number,
		patch: Partial<WorldCalendar['leapYearRules'][number]>,
	): void {
		const rules = worldCalendar.leapYearRules.map((rule, ruleIndex) =>
			ruleIndex === index ? { ...rule, ...patch } : rule,
		);
		updateWorldCalendar({ leapYearRules: rules });
	}

	function addLeapRule(): void {
		updateWorldCalendar({
			leapYearRules: [
				...worldCalendar.leapYearRules,
				{
					name: `Rule ${worldCalendar.leapYearRules.length + 1}`,
					interval: 4,
					monthIndex: 0,
					dayDelta: 1,
				},
			],
		});
	}

	function removeLeapRule(index: number): void {
		updateWorldCalendar({
			leapYearRules: worldCalendar.leapYearRules.filter((_rule, ruleIndex) => ruleIndex !== index),
		});
	}

	function updateEra(index: number, patch: Partial<WorldCalendar['eras'][number]>): void {
		const eras = worldCalendar.eras.map((era, eraIndex) =>
			eraIndex === index ? { ...era, ...patch } : era,
		);
		updateWorldCalendar({ eras });
	}

	function addEra(): void {
		updateWorldCalendar({
			eras: [
				...worldCalendar.eras,
				{
					name: `Era ${worldCalendar.eras.length + 1}`,
					epochOffset: worldCalendar.currentDayOffset,
				},
			],
		});
	}

	function removeEra(index: number): void {
		if (worldCalendar.eras.length <= 1) return;
		updateWorldCalendar({
			eras: worldCalendar.eras.filter((_era, eraIndex) => eraIndex !== index),
		});
	}

	function updateMoonCycle(
		index: number,
		patch: Partial<WorldCalendar['moonCycles'][number]>,
	): void {
		const moonCycles = worldCalendar.moonCycles.map((cycle, cycleIndex) =>
			cycleIndex === index ? { ...cycle, ...patch } : cycle,
		);
		updateWorldCalendar({ moonCycles });
	}

	function addMoonCycle(): void {
		if (worldCalendar.moonCycles.length >= 4) return;
		updateWorldCalendar({
			moonCycles: [
				...worldCalendar.moonCycles,
				{
					name: `Moon ${worldCalendar.moonCycles.length + 1}`,
					periodDays: 30,
					phaseNames: ['New', 'Waxing', 'Full', 'Waning'],
					offsetDays: 0,
				},
			],
		});
	}

	function removeMoonCycle(index: number): void {
		updateWorldCalendar({
			moonCycles: worldCalendar.moonCycles.filter((_cycle, cycleIndex) => cycleIndex !== index),
		});
	}

	function adjustCurrentWorldDate(days: number): void {
		updateWorldCalendar({
			currentDayOffset: worldCalendar.currentDayOffset + days,
		});
	}

	async function saveWorldCalendarSettings(): Promise<void> {
		savingWorldCalendar = true;
		try {
			applyWorldDayNamesDraft();
			worldCalendar = await settingsStorageState.saveWorldCalendar(worldCalendar);
			worldCalendarState.setCached(worldCalendar);
			worldDayNamesText = worldCalendar.dayNames.join(', ');
			toastState.success('World calendar settings saved');
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_SAVE_WORLD_CALENDAR_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to save world calendar settings: ${String(error)}`);
		} finally {
			savingWorldCalendar = false;
		}
	}
</script>

<div
	role="tabpanel"
	id="settings-panel-world"
	aria-labelledby="settings-tab-world"
	class="space-y-8"
>
	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">In-World Date</h2>
		<div class="rounded-lg border border-border bg-surface p-4 space-y-4">
			<div class="grid gap-2 md:grid-cols-3">
				<div class="rounded border border-border p-3">
					<p class="text-xs text-ink-muted">Short</p>
					<p class="text-sm font-medium text-ink mt-1">
						{worldDateShort}
					</p>
				</div>
				<div class="rounded border border-border p-3">
					<p class="text-xs text-ink-muted">Long</p>
					<p class="text-sm font-medium text-ink mt-1">{worldDateLong}</p>
				</div>
				<div class="rounded border border-border p-3">
					<p class="text-xs text-ink-muted">ISO-equivalent</p>
					<p class="text-sm font-mono text-ink mt-1">{worldDateIso}</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Button variant="ghost" size="sm" onclick={() => adjustCurrentWorldDate(-1)}
					>Back 1 Day</Button
				>
				<Button variant="ghost" size="sm" onclick={() => adjustCurrentWorldDate(1)}
					>Forward 1 Day</Button
				>
				<Button variant="ghost" size="sm" onclick={() => adjustCurrentWorldDate(7)}
					>Forward 7 Days</Button
				>
				<Button variant="secondary" size="sm" onclick={() => adjustCurrentWorldDate(1)}>
					Start Session (+1 Day)
				</Button>
				<label class="ml-auto text-xs text-ink-muted">
					Day offset
					<input
						type="number"
						class="ml-2 w-28 rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
						value={worldCalendar.currentDayOffset}
						onchange={(event) =>
							updateWorldCalendar({
								currentDayOffset: Number((event.currentTarget as HTMLInputElement).value),
							})}
					/>
				</label>
			</div>
			{#if worldMoonStatuses.length > 0}
				<div class="border-t border-border pt-3">
					<p class="text-xs font-semibold uppercase tracking-wider text-ink-faint">Moon Phases</p>
					<ul class="mt-2 grid gap-2 md:grid-cols-2">
						{#each worldMoonStatuses as moon (moon.name)}
							<li class="rounded border border-border p-2 text-xs">
								<p class="font-medium text-ink">{moon.name}</p>
								<p class="text-ink-muted">
									{moon.phaseName} (day {moon.dayInCycle + 1}/{moon.periodDays})
								</p>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Calendar Definition</h2>
		<div class="rounded-lg border border-border bg-surface p-4 space-y-4">
			<div class="grid gap-3 md:grid-cols-2">
				<label class="text-xs text-ink-muted">
					Week Length
					<input
						type="number"
						min="1"
						max="32"
						value={worldCalendar.weekLength}
						onchange={(event) =>
							updateWorldCalendar({
								weekLength: Number((event.currentTarget as HTMLInputElement).value),
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					/>
				</label>
				<label class="text-xs text-ink-muted">
					Day Names (comma-separated)
					<input
						type="text"
						bind:value={worldDayNamesText}
						onchange={applyWorldDayNamesDraft}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					/>
				</label>
			</div>

			<div class="border-t border-border pt-4 space-y-2">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-ink">Months</p>
					<Button variant="ghost" size="sm" onclick={addWorldMonth}>Add Month</Button>
				</div>
				<div class="space-y-2">
					{#each worldCalendar.months as month, monthIndex (`month-${monthIndex}`)}
						<div class="grid gap-2 md:grid-cols-[1fr_120px_auto]">
							<input
								type="text"
								value={month.name}
								onchange={(event) =>
									updateWorldMonth(monthIndex, {
										name: (event.currentTarget as HTMLInputElement).value,
									})}
								class="rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
							/>
							<input
								type="number"
								min="1"
								max="500"
								value={month.days}
								onchange={(event) =>
									updateWorldMonth(monthIndex, {
										days: Number((event.currentTarget as HTMLInputElement).value),
									})}
								class="rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
							/>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => removeWorldMonth(monthIndex)}
								disabled={worldCalendar.months.length <= 1}
							>
								Remove
							</Button>
						</div>
					{/each}
				</div>
			</div>

			<div class="border-t border-border pt-4 space-y-2">
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-ink">Leap Year Rules</p>
					<Button variant="ghost" size="sm" onclick={addLeapRule}>Add Rule</Button>
				</div>
				{#if worldCalendar.leapYearRules.length === 0}
					<p class="text-xs text-ink-muted">No leap rules configured.</p>
				{:else}
					<div class="space-y-2">
						{#each worldCalendar.leapYearRules as rule, ruleIndex (`rule-${ruleIndex}`)}
							<div
								class="grid gap-2 md:grid-cols-[1fr_120px_120px_120px_auto] rounded border border-border p-2"
							>
								<input
									type="text"
									value={rule.name}
									onchange={(event) =>
										updateLeapRule(ruleIndex, {
											name: (event.currentTarget as HTMLInputElement).value,
										})}
									class="rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
								/>
								<input
									type="number"
									min="1"
									max="100000"
									value={rule.interval}
									aria-label="Year interval"
									onchange={(event) =>
										updateLeapRule(ruleIndex, {
											interval: Number((event.currentTarget as HTMLInputElement).value),
										})}
									class="rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
								/>
								<input
									type="number"
									min="0"
									max={Math.max(0, worldCalendar.months.length - 1)}
									value={rule.monthIndex}
									aria-label="Target month index"
									onchange={(event) =>
										updateLeapRule(ruleIndex, {
											monthIndex: Number((event.currentTarget as HTMLInputElement).value),
										})}
									class="rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
								/>
								<input
									type="number"
									min="-30"
									max="30"
									value={rule.dayDelta}
									aria-label="Day delta"
									onchange={(event) =>
										updateLeapRule(ruleIndex, {
											dayDelta: Number((event.currentTarget as HTMLInputElement).value),
										})}
									class="rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
								/>
								<Button variant="ghost" size="sm" onclick={() => removeLeapRule(ruleIndex)}>
									Remove
								</Button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="grid gap-4 md:grid-cols-2 border-t border-border pt-4">
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<p class="text-sm font-medium text-ink">Eras</p>
						<Button variant="ghost" size="sm" onclick={addEra}>Add Era</Button>
					</div>
					{#each worldCalendar.eras as era, eraIndex (`era-${eraIndex}`)}
						<div class="grid gap-2 grid-cols-[1fr_120px_auto]">
							<input
								type="text"
								value={era.name}
								onchange={(event) =>
									updateEra(eraIndex, {
										name: (event.currentTarget as HTMLInputElement).value,
									})}
								class="rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
							/>
							<input
								type="number"
								value={era.epochOffset}
								onchange={(event) =>
									updateEra(eraIndex, {
										epochOffset: Number((event.currentTarget as HTMLInputElement).value),
									})}
								class="rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
							/>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => removeEra(eraIndex)}
								disabled={worldCalendar.eras.length <= 1}
							>
								Remove
							</Button>
						</div>
					{/each}
				</div>

				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<p class="text-sm font-medium text-ink">Moon Cycles (max 4)</p>
						<Button
							variant="ghost"
							size="sm"
							onclick={addMoonCycle}
							disabled={worldCalendar.moonCycles.length >= 4}
						>
							Add Moon
						</Button>
					</div>
					{#if worldCalendar.moonCycles.length === 0}
						<p class="text-xs text-ink-muted">No moons configured.</p>
					{:else}
						{#each worldCalendar.moonCycles as moon, moonIndex (`moon-${moonIndex}`)}
							<div class="rounded border border-border p-2 space-y-2">
								<div class="grid gap-2 grid-cols-2">
									<input
										type="text"
										value={moon.name}
										onchange={(event) =>
											updateMoonCycle(moonIndex, {
												name: (event.currentTarget as HTMLInputElement).value,
											})}
										class="rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
									/>
									<input
										type="number"
										min="1"
										max="50000"
										value={moon.periodDays}
										onchange={(event) =>
											updateMoonCycle(moonIndex, {
												periodDays: Number((event.currentTarget as HTMLInputElement).value),
											})}
										class="rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
									/>
								</div>
								<input
									type="text"
									value={moon.phaseNames.join(', ')}
									onchange={(event) =>
										updateMoonCycle(moonIndex, {
											phaseNames: parsePhaseNames((event.currentTarget as HTMLInputElement).value),
										})}
									placeholder="New, Waxing, Full, Waning"
									class="w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
								/>
								<div class="flex items-center justify-between">
									<label class="text-xs text-ink-muted">
										Offset Days
										<input
											type="number"
											value={moon.offsetDays}
											onchange={(event) =>
												updateMoonCycle(moonIndex, {
													offsetDays: Number((event.currentTarget as HTMLInputElement).value),
												})}
											class="ml-2 w-20 rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
										/>
									</label>
									<Button variant="ghost" size="sm" onclick={() => removeMoonCycle(moonIndex)}>
										Remove
									</Button>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-2 border-t border-border pt-3">
				<Button
					variant="secondary"
					size="sm"
					onclick={saveWorldCalendarSettings}
					loading={savingWorldCalendar}
				>
					{savingWorldCalendar ? 'Saving...' : 'Save World Calendar'}
				</Button>
			</div>
		</div>
	</section>
</div>
