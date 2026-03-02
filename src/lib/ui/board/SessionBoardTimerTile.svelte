<script lang="ts">
	import {
		createDefaultTimerState,
		normalizeSessionBoardTimerState,
	} from '$lib/domain/session-board.js';
	import type { SessionBoardTimerState, SessionBoardTimerTile } from '$lib/types/session-board.js';

	interface Props {
		tile: SessionBoardTimerTile;
		selected?: boolean;
		editable?: boolean;
		onselect: () => void;
		onupdate: (timer: SessionBoardTimerState) => void;
		ondragstart: (event: PointerEvent) => void;
	}

	let {
		tile,
		selected = false,
		editable = false,
		onselect,
		onupdate,
		ondragstart,
	}: Props = $props();
	let nowMs = $state(Date.now());

	let timer = $derived.by(() =>
		normalizeSessionBoardTimerState(tile.timer ?? createDefaultTimerState()),
	);
	let elapsedMs = $derived.by(() => {
		if (!timer.running || timer.startedAtMs === null) return timer.accumulatedMs;
		return timer.accumulatedMs + Math.max(0, nowMs - timer.startedAtMs);
	});
	let remainingMs = $derived.by(() =>
		timer.mode === 'countdown' ? Math.max(0, timer.countdownMs - elapsedMs) : 0,
	);
	let displayMs = $derived.by(() => (timer.mode === 'countdown' ? remainingMs : elapsedMs));
	let timerLabel = $derived.by(() =>
		timer.mode === 'countdown'
			? timer.running
				? 'Countdown running'
				: 'Countdown paused'
			: timer.running
				? 'Elapsed running'
				: 'Elapsed paused',
	);

	function formatClock(ms: number): string {
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) {
			return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
		}
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	function persist(next: SessionBoardTimerState): void {
		onupdate(normalizeSessionBoardTimerState(next));
	}

	function toggleRunning(): void {
		const at = Date.now();
		if (timer.running) {
			const accumulatedMs =
				timer.startedAtMs === null
					? timer.accumulatedMs
					: timer.accumulatedMs + Math.max(0, at - timer.startedAtMs);
			persist({
				...timer,
				running: false,
				accumulatedMs,
				startedAtMs: null,
			});
			return;
		}
		persist({
			...timer,
			running: true,
			startedAtMs: at,
		});
	}

	function resetTimer(): void {
		persist({
			...timer,
			running: false,
			accumulatedMs: 0,
			startedAtMs: null,
			lapsMs: [],
		});
	}

	function addLap(): void {
		if (!timer.running && elapsedMs <= 0) return;
		persist({
			...timer,
			lapsMs: [elapsedMs, ...timer.lapsMs].slice(0, 20),
		});
	}

	function switchMode(mode: 'elapsed' | 'countdown'): void {
		persist({
			...timer,
			mode,
		});
	}

	function setCountdownMinutes(minutes: number): void {
		const normalizedMinutes = Math.max(1, Math.min(720, Math.round(minutes)));
		persist({
			...timer,
			countdownMs: normalizedMinutes * 60 * 1000,
		});
	}

	function toggleMinimalDisplay(): void {
		persist({
			...timer,
			minimalDisplay: !timer.minimalDisplay,
		});
	}

	$effect(() => {
		const interval = window.setInterval(
			() => {
				nowMs = Date.now();
			},
			timer.running ? 250 : 1000,
		);
		return () => window.clearInterval(interval);
	});
</script>

<div
	class="relative rounded-lg border bg-surface/95 dark:bg-tavern-surface/95 shadow-sm backdrop-blur-sm flex flex-col h-full transition-[box-shadow,transform] duration-150 cursor-pointer hover:shadow-md {selected
		? 'border-border dark:border-tavern-border ring-2 ring-accent/45 dark:ring-tavern-accent/45 shadow-[0_0_0_1px_rgba(255,255,255,0.65)_inset,0_12px_24px_-16px_rgba(0,0,0,0.65)]'
		: 'border-border dark:border-tavern-border'}"
	role="button"
	tabindex="0"
	aria-label="Session timer tile"
	aria-pressed={selected}
	data-board-tile="true"
	onclick={(event) => {
		const target = event.target as HTMLElement;
		if (target.closest('a,button,input,textarea,select,label')) return;
		onselect();
	}}
	onkeydown={(event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect();
		}
	}}
	onpointerdown={(event) => {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (target.closest('a,button,input,textarea,select,label')) return;
		onselect();
		if (editable) ondragstart(event);
	}}
>
	<header
		class="px-3 py-2 border-b border-border dark:border-tavern-border flex items-center gap-2"
	>
		<div class="font-medium text-sm text-ink dark:text-tavern-text flex-1">Session Timer</div>
		<span
			class="text-[10px] px-1.5 py-0.5 rounded border border-border/70 dark:border-tavern-border/70 text-ink-faint dark:text-tavern-faint"
		>
			{timer.mode === 'countdown' ? 'Countdown' : 'Elapsed'}
		</span>
	</header>

	{#if timer.minimalDisplay}
		<div class="flex-1 min-h-0 flex flex-col items-center justify-center p-3 gap-2">
			<div class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
				{timerLabel}
			</div>
			<div
				class="font-mono text-4xl leading-none text-ink dark:text-tavern-text tabular-nums"
				aria-live="polite"
			>
				{formatClock(displayMs)}
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={toggleRunning}
				>
					{timer.running ? 'Pause' : 'Start'}
				</button>
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={toggleMinimalDisplay}
				>
					Expand
				</button>
			</div>
		</div>
	{:else}
		<div class="flex-1 min-h-0 p-3 flex flex-col gap-2">
			<div
				class="rounded-md border border-border/70 dark:border-tavern-border/70 bg-surface-alt/70 dark:bg-tavern-surface-alt/70 px-2.5 py-2"
			>
				<div class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
					{timerLabel}
				</div>
				<div
					class="font-mono text-3xl tabular-nums text-ink dark:text-tavern-text mt-1"
					aria-live="polite"
				>
					{formatClock(displayMs)}
				</div>
				{#if timer.mode === 'countdown'}
					<div class="text-[11px] text-ink-muted dark:text-tavern-muted mt-1">
						Target: {Math.round(timer.countdownMs / 60000)} min
					</div>
				{/if}
			</div>

			<div class="flex flex-wrap gap-1.5">
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={toggleRunning}
				>
					{timer.running ? 'Pause' : 'Start'}
				</button>
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={resetTimer}
				>
					Reset
				</button>
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={addLap}
				>
					Lap
				</button>
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={toggleMinimalDisplay}
				>
					Minimal
				</button>
			</div>

			<div class="grid grid-cols-2 gap-2 items-end">
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Mode
					<select
						class="mt-1 h-8 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2"
						value={timer.mode}
						onchange={(event) =>
							switchMode(
								(event.currentTarget as HTMLSelectElement).value as 'elapsed' | 'countdown',
							)}
					>
						<option value="elapsed">Elapsed</option>
						<option value="countdown">Countdown</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Countdown (min)
					<input
						type="number"
						min="1"
						max="720"
						class="mt-1 h-8 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2"
						value={Math.max(1, Math.round(timer.countdownMs / 60000))}
						onchange={(event) =>
							setCountdownMinutes(Number((event.currentTarget as HTMLInputElement).value))}
					/>
				</label>
			</div>

			<div
				class="flex-1 min-h-0 rounded border border-border/60 dark:border-tavern-border/60 p-2 overflow-y-auto"
			>
				{#if timer.lapsMs.length === 0}
					<div class="text-[11px] text-ink-faint dark:text-tavern-faint">No laps yet.</div>
				{:else}
					<ul class="space-y-1">
						{#each timer.lapsMs as lapMs, index (`${lapMs}-${index}`)}
							<li class="flex justify-between text-[11px]">
								<span class="text-ink-muted dark:text-tavern-muted">Lap {index + 1}</span>
								<span class="font-mono text-ink dark:text-tavern-text">{formatClock(lapMs)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</div>
