<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './Icon.svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		loading?: boolean;
		icon?: IconName;
		trailingIcon?: IconName;
		onclick?: () => void;
		type?: 'button' | 'submit';
		title?: string;
		ariaLabel?: string;
		ariaPressed?: boolean;
		class?: string;
		children?: Snippet;
	}

	let {
		variant = 'secondary',
		size = 'md',
		disabled = false,
		loading = false,
		icon,
		trailingIcon,
		onclick,
		type = 'button',
		title,
		ariaLabel,
		ariaPressed,
		class: extraClass,
		children,
	}: Props = $props();
	const isDisabled = $derived(disabled || loading);

	const baseClasses =
		'relative inline-flex items-center justify-center rounded-md font-medium transition-[transform,colors] active:scale-[0.97] active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

	const sizeClasses: Record<string, string> = {
		sm: 'px-2 py-1 text-sm gap-1 min-h-8',
		md: 'px-3 py-1.5 text-sm gap-1.5 min-h-9',
		lg: 'px-4 py-2 text-base gap-2 min-h-11',
	};

	const variantClasses: Record<string, string> = {
		primary: 'bg-accent text-accent-foreground hover:bg-accent-hover',
		secondary: 'bg-surface border border-border text-ink hover:bg-surface-alt',
		ghost: 'text-ink-muted hover:bg-surface-alt hover:text-ink',
		danger: 'border border-error text-error hover:bg-error/10',
		link: 'text-accent underline-offset-4 hover:underline p-0 min-h-0 rounded-none',
	};

	const iconSize: Record<string, 'xs' | 'sm' | 'md'> = {
		sm: 'xs',
		md: 'sm',
		lg: 'md',
	};

	const spinnerClasses: Record<string, string> = {
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
	aria-pressed={ariaPressed}
	class="{baseClasses} {sizeClasses[size]} {variantClasses[variant]} {extraClass ?? ''}"
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
	<span
		class="inline-flex items-center {size === 'sm'
			? 'gap-1'
			: size === 'lg'
				? 'gap-2'
				: 'gap-1.5'} {loading ? 'invisible' : ''}"
	>
		{#if icon}
			<Icon name={icon} size={iconSize[size]} />
		{/if}
		{#if children}
			{@render children()}
		{/if}
		{#if trailingIcon}
			<Icon name={trailingIcon} size={iconSize[size]} />
		{/if}
	</span>
</button>
