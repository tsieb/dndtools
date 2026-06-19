<script lang="ts">
	import {
		useDensity,
		DENSITY_OPTIONS,
		type DesktopDensity,
	} from '$lib/platform/density.svelte';
	import Icon from './Icon.svelte';

	// UX-VIS-011: the density picker is a WAI-ARIA radiogroup. Density is profile-linked: only the
	// Desktop (expanded) viewport may override it; Mobile/Tablet are locked to Comfortable for >=44px
	// touch targets. When locked, the controls are present but disabled with an explanatory note, so
	// the user understands why (no dead/silent control). Keyboard parity mirrors the theme/motion
	// radiogroups.
	const density = useDensity();
	const options = DENSITY_OPTIONS;

	function optionId(id: DesktopDensity): string {
		return `density-option-${id}`;
	}

	function select(id: DesktopDensity): void {
		if (!density.canOverride) return;
		density.setDesktopPreference(id);
	}

	function focusOption(index: number): void {
		const wrapped = (index + options.length) % options.length;
		const next = options[wrapped];
		if (!next) return;
		density.setDesktopPreference(next.id);
		document.getElementById(optionId(next.id))?.focus();
	}

	function onKeydown(event: KeyboardEvent, index: number): void {
		if (!density.canOverride) return;
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

	// On Desktop the checked option follows the user's stored preference; on a locked touch profile
	// the effective density (Comfortable) is shown as checked so the group reflects reality.
	function isChecked(id: DesktopDensity): boolean {
		return density.canOverride ? density.desktopPreference === id : density.density === id;
	}
</script>

<section class="pref-group" aria-label="Density" data-testid="density-selector">
	<h3>Density</h3>
	<p class="pref-note">
		Sizing of controls and spacing. Comfortable keeps touch targets at least 44px; Compact packs
		more on screen. {density.canOverride
			? 'Choose any mode on this desktop-class display.'
			: 'This device uses Comfortable for touch and cannot be reduced.'}
	</p>

	<div
		class="pref-options"
		role="radiogroup"
		aria-label="Density"
		aria-disabled={!density.canOverride}
		data-testid="density-radiogroup"
		data-can-override={density.canOverride}
		data-active-density={density.density}
	>
		{#each options as option, index (option.id)}
			<button
				type="button"
				id={optionId(option.id)}
				class="pref-option"
				role="radio"
				aria-checked={isChecked(option.id)}
				aria-disabled={!density.canOverride}
				tabindex={isChecked(option.id) ? 0 : -1}
				data-testid={`density-option-${option.id}`}
				onclick={() => select(option.id)}
				onkeydown={(event) => onKeydown(event, index)}
			>
				<Icon name={option.icon} size="sm" />
				<span>{option.label}</span>
				<span class="visually-hidden">{option.description}</span>
			</button>
		{/each}
	</div>

	<p class="pref-note" data-testid="density-active">Active: {density.density}</p>

	<div
		class="visually-hidden"
		role="status"
		aria-live="polite"
		aria-atomic="true"
		data-testid="density-announcer"
	>
		{density.announcement}
	</div>
</section>

<style>
	/* Package SegmentedControl treatment (mirrors MotionSelector): the radiogroup keeps radio
	   semantics but reads as one connected control — an inset sunken track with the selected segment
	   lifted onto a raised surface. Selected / focus / disabled states are re-declared so they win the
	   specificity tie against the global .pref-option rules. When density is locked to Comfortable on
	   touch profiles the group is aria-disabled and the segments dim. Token-only. */
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
	.pref-options :global(.pref-option[aria-disabled='true']) {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.pref-options :global(.pref-option:focus-visible) {
		outline: var(--focus-ring-width) solid var(--focus-ring-color);
		outline-offset: var(--focus-ring-offset);
		min-height: var(--density-focus-target);
		min-width: var(--density-focus-target);
	}
</style>
