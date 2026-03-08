<script lang="ts">
	import { ui } from '$lib/state/ui.svelte.js';
	import type { ThemeSetting } from '$lib/domain/theme.js';

	type ThemeValue = ThemeSetting;

	const themes = [
		{ value: 'system' as ThemeValue, label: 'Auto', title: 'Match system (Parchment/Tavern)' },
		{ value: 'parchment' as ThemeValue, label: 'Parchment', title: 'Warm parchment light theme' },
		{ value: 'tavern' as ThemeValue, label: 'Tavern', title: 'Warm tavern dark theme' },
		{ value: 'scholar' as ThemeValue, label: 'Scholar', title: 'Cool high-contrast light theme' },
		{ value: 'dungeon' as ThemeValue, label: 'Dungeon', title: 'High-contrast dark theme' },
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

		let nextIndex: number;
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
	class="grid grid-cols-5 rounded-md border border-border overflow-hidden"
	role="radiogroup"
	aria-label="Theme preset"
>
	{#each themes as theme (theme.value)}
		<button
			id={`theme-option-${theme.value}`}
			class="px-3 py-1 text-sm transition-colors {ui.theme === theme.value
				? 'bg-accent text-white'
				: 'bg-surface text-ink-muted hover:bg-surface-alt'}"
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
