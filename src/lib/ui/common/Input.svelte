<script lang="ts">
	import Icon from './Icon.svelte';
	import type { IconName } from './Icon.svelte';

	interface Props {
		value?: string | number;
		type?: 'text' | 'password' | 'number' | 'email' | 'search' | 'date';
		label?: string;
		placeholder?: string;
		error?: string;
		helper?: string;
		disabled?: boolean;
		required?: boolean;
		leadingIcon?: IconName;
		trailingIcon?: IconName;
		id?: string;
		name?: string;
		autocomplete?: HTMLInputElement['autocomplete'];
		oninput?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onkeydown?: (event: KeyboardEvent) => void;
	}

	let {
		value = $bindable(''),
		type = 'text',
		label,
		placeholder,
		error,
		helper,
		disabled = false,
		required = false,
		leadingIcon,
		trailingIcon,
		id,
		name,
		autocomplete,
		oninput,
		onchange,
		onkeydown,
	}: Props = $props();

	const inputId = $derived(
		id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined),
	);
	const hasError = $derived(!!error);
</script>

<div class="flex flex-col gap-1">
	{#if label}
		<label for={inputId} class="text-sm font-medium text-ink">
			{label}{#if required}<span class="text-error ml-0.5" aria-hidden="true">*</span>{/if}
		</label>
	{/if}
	<div class="relative flex items-center">
		{#if leadingIcon}
			<span class="pointer-events-none absolute left-2.5 text-ink-muted" aria-hidden="true">
				<Icon name={leadingIcon} size="sm" />
			</span>
		{/if}
		<input
			{type}
			bind:value
			id={inputId}
			{name}
			{placeholder}
			{disabled}
			{required}
			{autocomplete}
			aria-describedby={error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined}
			aria-invalid={hasError ? 'true' : undefined}
			class="w-full rounded-md border bg-surface-alt px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint
				focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-0 focus:border-accent
				disabled:opacity-50 disabled:cursor-not-allowed
				transition-colors
				{hasError ? 'border-error focus:ring-error' : 'border-border hover:border-border-strong'}
				{leadingIcon ? 'pl-9' : ''}
				{trailingIcon ? 'pr-9' : ''}"
			{oninput}
			{onchange}
			{onkeydown}
		/>
		{#if trailingIcon && !hasError}
			<span class="pointer-events-none absolute right-2.5 text-ink-muted" aria-hidden="true">
				<Icon name={trailingIcon} size="sm" />
			</span>
		{/if}
		{#if hasError}
			<span class="pointer-events-none absolute right-2.5 text-error" aria-hidden="true">
				<Icon name="alert-circle" size="sm" />
			</span>
		{/if}
	</div>
	{#if error}
		<p id="{inputId}-error" class="flex items-center gap-1 text-xs text-error" role="alert">
			{error}
		</p>
	{:else if helper}
		<p id="{inputId}-helper" class="text-xs text-ink-muted">{helper}</p>
	{/if}
</div>
