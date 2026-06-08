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
