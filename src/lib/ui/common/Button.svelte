<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		onclick?: () => void;
		type?: 'button' | 'submit';
		title?: string;
		ariaLabel?: string;
		children: Snippet;
	}

	let {
		variant = 'secondary',
		size = 'md',
		disabled = false,
		onclick,
		type = 'button',
		title,
		ariaLabel,
		children,
	}: Props = $props();

	const baseClasses =
		'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed';

	const sizeClasses = {
		sm: 'px-2 py-1 text-sm gap-1',
		md: 'px-3 py-1.5 text-sm gap-1.5',
		lg: 'px-4 py-2 text-base gap-2',
	};

	const variantClasses = {
		primary:
			'bg-accent text-white hover:bg-accent-hover dark:bg-tavern-accent dark:text-tavern-bg dark:hover:bg-tavern-accent-hover',
		secondary:
			'bg-surface border border-border text-ink hover:bg-surface-alt dark:bg-tavern-surface dark:border-tavern-border dark:text-tavern-text dark:hover:bg-tavern-surface-alt',
		ghost:
			'text-ink-muted hover:bg-surface-alt hover:text-ink dark:text-tavern-muted dark:hover:bg-tavern-surface-alt dark:hover:text-tavern-text',
		danger: 'bg-error text-white hover:bg-red-800 dark:bg-tavern-error dark:hover:bg-red-700',
	};
</script>

<button
	{type}
	{disabled}
	{title}
	aria-label={ariaLabel ?? title}
	class="{baseClasses} {sizeClasses[size]} {variantClasses[variant]}"
	{onclick}
>
	{@render children()}
</button>
