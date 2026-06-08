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
