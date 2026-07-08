<script lang="ts">
	import { useTheme } from '$lib/platform/theme.svelte';
	import { THEME_OPTIONS, type ThemePreference } from '$lib/platform/theme.svelte';

	// UX-VIS-001: the theme picker is a WAI-ARIA radiogroup. Selecting an option applies the
	// theme within one frame (a single `data-theme` attribute swap), persists the device-local
	// preference, and emits an accessible announcement. Keyboard parity: arrow keys move and
	// select within the group (roving tabindex); Space/Enter selects the focused option.
	const theme = useTheme();

	const options = THEME_OPTIONS;

	function optionId(id: ThemePreference): string {
		return `theme-option-${id}`;
	}

	function select(id: ThemePreference): void {
		theme.setPreference(id);
	}

	function focusOption(index: number): void {
		const wrapped = (index + options.length) % options.length;
		const next = options[wrapped];
		if (!next) return;
		theme.setPreference(next.id);
		const el = document.getElementById(optionId(next.id));
		el?.focus();
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

<section class="theme-selector" aria-label="Theme" data-testid="theme-selector">
	<h2>Theme</h2>
	<p class="meta">
		Dark-first by default. “System” follows your operating system; the choice is saved on this
		device and applied instantly.
	</p>

	<div
		class="theme-options"
		role="radiogroup"
		aria-label="Theme"
		data-testid="theme-radiogroup"
		data-applied-theme={theme.appliedTheme}
	>
		{#each options as option, index (option.id)}
			<button
				type="button"
				id={optionId(option.id)}
				class="theme-option"
				role="radio"
				aria-checked={theme.preference === option.id}
				tabindex={theme.preference === option.id ? 0 : -1}
				data-testid={`theme-option-${option.id}`}
				onclick={() => select(option.id)}
				onkeydown={(event) => onKeydown(event, index)}
			>
				<span class="theme-swatch" style:background={option.swatch} aria-hidden="true"></span>
				<span class="theme-option-label">{option.label}</span>
				<span class="visually-hidden">{option.description}</span>
			</button>
		{/each}
	</div>

	<!-- UX-VIS-001: polite live region announces the theme change for screen-reader users. -->
	<div
		class="visually-hidden"
		role="status"
		aria-live="polite"
		aria-atomic="true"
		data-testid="theme-announcer"
	>
		{theme.announcement}
	</div>
</section>

<style>
	/* PRIMARY / hero card — Theme is the focal preference, so it takes the accent-subtle hero recipe
	   (warm tint + accent border + raised shadow). Token-only; the global .theme-selector layout
	   (display:grid; gap) is kept and only the surface + title are added here. */
	.theme-selector {
		background: var(--color-accent-subtle);
		border: 1px solid var(--color-accent-border);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		box-shadow: var(--shadow-md);
	}
	.theme-selector h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-lg);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	/* On accent-subtle, small text must be at least secondary to clear the axe contrast gate. */
	.theme-selector :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		margin: 0;
	}
	/* Swatch chips read as raised tiles on the hero tint so they pop. Re-declare the selected and
	   focus states locally (they out-specify the global .theme-option state rules, which would
	   otherwise tie and risk dropping the selected treatment). */
	.theme-selector :global(.theme-option) {
		background: var(--color-surface-raised);
		border-color: var(--color-border);
	}
	.theme-selector :global(.theme-option[aria-checked='true']) {
		border-color: var(--color-accent);
		/* SOLID surface, not --color-interactive-selected: the faint accent tint composites over the
		   accent-subtle hero card to ~#e5cdb1, on which the accent-coloured label is only 3.78:1 (axe
		   color-contrast fail). On the solid raised surface the same accent label clears 4.5:1; the
		   accent border + bold weight still mark the selected option. */
		background: var(--color-surface-raised);
		color: var(--color-accent);
		font-weight: var(--font-weight-semibold);
	}
	.theme-selector :global(.theme-option:focus-visible) {
		outline: var(--focus-ring-width) solid var(--focus-ring-color);
		outline-offset: var(--focus-ring-offset);
	}
</style>
