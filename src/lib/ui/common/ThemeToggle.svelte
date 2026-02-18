<script lang="ts">
	import { ui } from '$lib/state/ui.svelte.js';

	type ThemeValue = 'light' | 'system' | 'dark';

	const themes = [
		{ value: 'light' as ThemeValue, label: 'Light', title: 'Use light theme' },
		{ value: 'system' as ThemeValue, label: 'Auto', title: 'Match system theme' },
		{ value: 'dark' as ThemeValue, label: 'Dark', title: 'Use dark theme' },
	] as const;

	function focusThemeOption(theme: ThemeValue): void {
		if (typeof document === 'undefined') return;
		document.getElementById(`theme-option-${theme}`)?.focus();
	}

	function setTheme(theme: ThemeValue, focus = false): void {
		ui.setTheme(theme);
		if (focus) {
			queueMicrotask(() => focusThemeOption(theme));
		}
	}

	function handleThemeKeydown(event: KeyboardEvent, currentTheme: ThemeValue): void {
		const currentIndex = themes.findIndex((theme) => theme.value === currentTheme);
		if (currentIndex < 0) return;

		let nextIndex = currentIndex;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				nextIndex = (currentIndex + 1) % themes.length;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				nextIndex = (currentIndex - 1 + themes.length) % themes.length;
				break;
			case 'Home':
				nextIndex = 0;
				break;
			case 'End':
				nextIndex = themes.length - 1;
				break;
			case ' ':
			case 'Enter':
				event.preventDefault();
				setTheme(currentTheme, true);
				return;
			default:
				return;
		}

		event.preventDefault();
		const nextTheme = themes[nextIndex];
		if (nextTheme) {
			setTheme(nextTheme.value, true);
		}
	}
</script>

<div
	class="flex rounded-md border border-border dark:border-tavern-border overflow-hidden"
	role="radiogroup"
	aria-label="Theme"
>
	{#each themes as theme (theme.value)}
		<button
			id={`theme-option-${theme.value}`}
			class="px-3 py-1 text-sm transition-colors {ui.theme === theme.value
				? 'bg-accent text-white dark:bg-tavern-accent dark:text-tavern-bg'
				: 'bg-surface dark:bg-tavern-surface text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
			role="radio"
			aria-checked={ui.theme === theme.value}
			tabindex={ui.theme === theme.value ? 0 : -1}
			title={theme.title}
			onclick={() => setTheme(theme.value)}
			onkeydown={(event) => handleThemeKeydown(event, theme.value)}
		>
			{theme.label}
		</button>
	{/each}
</div>
