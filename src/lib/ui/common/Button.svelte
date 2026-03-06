<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		loading?: boolean;
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
		loading = false,
		onclick,
		type = 'button',
		title,
		ariaLabel,
		children,
	}: Props = $props();
	const isDisabled = $derived(disabled || loading);

	const baseClasses =
		'relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md font-medium transition-[transform,colors] active:scale-[0.97] active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

	const sizeClasses = {
		sm: 'px-2 py-1 text-sm gap-1',
		md: 'px-3 py-1.5 text-sm gap-1.5',
		lg: 'px-4 py-2 text-base gap-2',
	};

	const variantClasses = {
		primary: 'bg-accent text-white hover:bg-accent-hover',
		secondary: 'bg-surface border border-border text-ink hover:bg-surface-alt',
		ghost: 'text-ink-muted hover:bg-surface-alt hover:text-ink',
		danger: 'bg-error text-white hover:bg-error-hover',
	};

	const spinnerClasses = {
		sm: 'h-3 w-3 border-[1.5px]',
		md: 'h-[14px] w-[14px] border-2',
		lg: 'h-4 w-4 border-2',
	};
</script>

<button
	{type}
	disabled={isDisabled}
	{title}
	aria-label={ariaLabel ?? title}
	aria-busy={loading || undefined}
	class="{baseClasses} {sizeClasses[size]} {variantClasses[variant]}"
	{onclick}
>
	{#if loading}
		<span
			class="pointer-events-none absolute inset-0 flex items-center justify-center"
			aria-hidden="true"
		>
			<span
				class="inline-block rounded-full border-current border-r-transparent animate-spin motion-reduce:animate-none motion-reduce:opacity-80 {spinnerClasses[
					size
				]}"
			></span>
		</span>
	{/if}
	<span class={loading ? 'invisible' : ''}>
		{@render children()}
	</span>
</button>
