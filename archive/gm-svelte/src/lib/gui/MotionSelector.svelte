<script lang="ts">
	import { useMotion, MOTION_OPTIONS, type MotionPreference } from '$lib/platform/motion.svelte';
	import Icon from './Icon.svelte';

	// UX-VIS-010: the motion preference picker is a WAI-ARIA radiogroup. Selecting an option resolves
	// the single motion state (with the documented precedence), writes `data-motion` to <html>,
	// persists the device-local choice, and announces the change. Keyboard parity: arrow keys move
	// and select within the group (roving tabindex); Space/Enter selects the focused option.
	const motion = useMotion();
	const options = MOTION_OPTIONS;

	function optionId(id: MotionPreference): string {
		return `motion-option-${id}`;
	}

	function select(id: MotionPreference): void {
		motion.setPreference(id);
	}

	function focusOption(index: number): void {
		const wrapped = (index + options.length) % options.length;
		const next = options[wrapped];
		if (!next) return;
		motion.setPreference(next.id);
		document.getElementById(optionId(next.id))?.focus();
	}

	function onKeydown(event: KeyboardEvent, index: number): void {
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				event.preventDefault();
				focusOption(index + 1);
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				event.preventDefault();
				focusOption(index - 1);
				break;
			case ' ':
			case 'Enter':
				event.preventDefault();
				select(options[index]!.id);
				break;
			default:
				break;
		}
	}
</script>

<section class="pref-group" aria-label="Motion" data-testid="motion-selector">
	<h3>Motion</h3>
	<p class="pref-note">
		Controls animation. “System” follows your operating system; an explicit choice is saved on this
		device. An OS request to reduce motion always wins over “Full motion”.
	</p>

	<div
		class="pref-options"
		role="radiogroup"
		aria-label="Motion"
		data-testid="motion-radiogroup"
		data-resolved-motion={motion.resolvedMotion}
	>
		{#each options as option, index (option.id)}
			<button
				type="button"
				id={optionId(option.id)}
				class="pref-option"
				role="radio"
				aria-checked={motion.preference === option.id}
				tabindex={motion.preference === option.id ? 0 : -1}
				data-testid={`motion-option-${option.id}`}
				onclick={() => select(option.id)}
				onkeydown={(event) => onKeydown(event, index)}
			>
				<Icon name={option.icon} size="sm" />
				<span>{option.label}</span>
				<span class="visually-hidden">{option.description}</span>
			</button>
		{/each}
	</div>

	<p class="pref-note" data-testid="motion-resolved">
		Active: {motion.resolvedMotion === 'reduced' ? 'Reduced motion' : 'Full motion'}
	</p>

	<div
		class="visually-hidden"
		role="status"
		aria-live="polite"
		aria-atomic="true"
		data-testid="motion-announcer"
	>
		{motion.announcement}
	</div>
</section>

<style>
	/* Package SegmentedControl treatment: the radiogroup keeps its radio semantics but reads as one
	   connected control — an inset sunken track holding the options, with the selected segment lifted
	   onto a raised surface. The selected / focus / disabled states are re-declared here so they win
	   the specificity tie against the global .pref-option state rules (they would otherwise tie and
	   could drop the selected fill). Token-only. */
	.pref-options {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-0-5);
		padding: var(--space-0-5);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.pref-options :global(.pref-option) {
		background: transparent;
		border-color: transparent;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
	}
	.pref-options :global(.pref-option:hover) {
		background: var(--color-interactive-hover);
		color: var(--color-text-primary);
	}
	.pref-options :global(.pref-option[aria-checked='true']) {
		background: var(--color-surface-raised);
		border-color: var(--color-accent-border);
		color: var(--color-text-primary);
		font-weight: var(--font-weight-semibold);
		box-shadow: var(--shadow-sm);
	}
	.pref-options :global(.pref-option:focus-visible) {
		outline: var(--focus-ring-width) solid var(--focus-ring-color);
		outline-offset: var(--focus-ring-offset);
		min-height: var(--density-focus-target);
		min-width: var(--density-focus-target);
	}
</style>
