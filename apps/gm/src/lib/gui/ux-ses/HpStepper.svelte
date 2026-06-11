<script lang="ts">
	/**
	 * UX-SES-005 — the INLINE HP STEPPER. Opens in-place when the HP number is tapped (≤2 actions,
	 * no context menu): [−] [numeric value] [+] [✓ confirm] [✕ cancel]. The value is the ABSOLUTE
	 * target HP (type 42 → "42/[max]"), clamped into [0, max] by the caller on confirm. −/+ step by
	 * 1 and auto-repeat while held (400 ms delay, then every 150 ms) for bulk changes without typing.
	 *
	 * Keyboard parity: the input is auto-focused on open; Up/Down arrows step (native number input),
	 * Enter confirms, Escape cancels. Buttons are ≥44 px touch targets (the global comfortable-density
	 * floor also applies). Accessibility per spec: input `aria-label="HP for [Name]"`; −/+ carry
	 * decrease/increase labels.
	 */
	interface Props {
		combatantId: string;
		name: string;
		hp: number;
		maxHp: number;
		onconfirm: (target: number) => void;
		oncancel: () => void;
	}

	let { combatantId, name, hp, maxHp, onconfirm, oncancel }: Props = $props();

	// The stepper SEEDS from the HP at open time on purpose: while editing, the draft must not be
	// yanked around by concurrent updates (the caller closes/reopens the editor per combatant).
	// svelte-ignore state_referenced_locally
	let value = $state(String(hp));
	let inputEl = $state<HTMLInputElement | null>(null);
	let repeatTimer: ReturnType<typeof setTimeout> | null = null;

	// UX-SES-005 — the editor is usable the moment it appears: focus + select the current value.
	$effect(() => {
		inputEl?.focus();
		inputEl?.select();
		return () => stopRepeat();
	});

	function parsed(): number {
		const num = Math.trunc(Number(value));
		return Number.isFinite(num) ? num : hp;
	}

	function step(delta: number): void {
		// Clamp into [0, max] while stepping so held-repeat stops at the bounds.
		value = String(Math.min(maxHp, Math.max(0, parsed() + delta)));
	}

	/** Auto-repeat while the −/+ button is held: 400 ms delay, then every 150 ms (UX-SES-005 §spec). */
	function startRepeat(delta: number): void {
		step(delta);
		const repeat = (): void => {
			step(delta);
			repeatTimer = setTimeout(repeat, 150);
		};
		repeatTimer = setTimeout(repeat, 400);
	}

	function stopRepeat(): void {
		if (repeatTimer !== null) clearTimeout(repeatTimer);
		repeatTimer = null;
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			onconfirm(parsed());
		} else if (event.key === 'Escape') {
			event.preventDefault();
			oncancel();
		}
	}
</script>

<!-- The keydown listener implements the Enter-confirm / Escape-cancel contract for the whole
     stepper group; the inner input and buttons remain the tab stops (keyboard parity, no trap). -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="hp-stepper"
	data-testid="hp-stepper-{combatantId}"
	onkeydown={onKeydown}
	role="group"
	aria-label="Edit HP for {name}"
>
	<span class="stepper-label" id="hp-stepper-label-{combatantId}">HP (current / {maxHp})</span>
	<div class="stepper-row">
		<button
			type="button"
			class="step"
			data-testid="hp-minus-{combatantId}"
			aria-label="Decrease HP for {name}"
			onpointerdown={() => startRepeat(-1)}
			onpointerup={stopRepeat}
			onpointerleave={stopRepeat}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					event.stopPropagation();
					step(-1);
				}
			}}
		>
			−
		</button>
		<input
			bind:this={inputEl}
			type="number"
			min="0"
			max={maxHp}
			bind:value
			data-testid="hp-input-{combatantId}"
			aria-label="HP for {name}"
			aria-describedby="hp-stepper-label-{combatantId}"
		/>
		<button
			type="button"
			class="step"
			data-testid="hp-plus-{combatantId}"
			aria-label="Increase HP for {name}"
			onpointerdown={() => startRepeat(1)}
			onpointerup={stopRepeat}
			onpointerleave={stopRepeat}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					event.stopPropagation();
					step(1);
				}
			}}
		>
			+
		</button>
		<button
			type="button"
			class="confirm"
			data-testid="apply-hp-{combatantId}"
			aria-label="Confirm HP for {name}"
			onclick={() => onconfirm(parsed())}
		>
			✓
		</button>
		<button
			type="button"
			data-testid="hp-cancel-{combatantId}"
			aria-label="Cancel HP edit for {name}"
			onclick={() => oncancel()}
		>
			✕
		</button>
	</div>
</div>

<style>
	.hp-stepper {
		display: inline-flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	/* UX-SES-005 §spec — the muted label above the stepper. */
	.stepper-label {
		font-size: var(--text-xs, 0.75rem);
		color: var(--color-text-muted);
	}

	.stepper-row {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	/* ≥44 px targets (UX-SES-005 §spec; the comfortable-density floor reinforces this globally). */
	.stepper-row button {
		min-width: 44px;
		min-height: 44px;
	}

	.stepper-row input {
		width: 4rem;
		min-height: 44px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.confirm {
		font-weight: 700;
	}

	/* Mobile (compact): the stepper spans the row as a full-width strip — the same controls and
	   command, profile-appropriate sizing (UX-SES-005 §platform profiles). */
	:global(.app-shell[data-viewport='compact']) .hp-stepper {
		width: 100%;
	}
	:global(.app-shell[data-viewport='compact']) .stepper-row {
		width: 100%;
	}
	:global(.app-shell[data-viewport='compact']) .stepper-row input {
		flex: 1 1 auto;
	}
</style>
