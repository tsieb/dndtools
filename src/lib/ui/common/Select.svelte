<script lang="ts">
	interface Option {
		value: string;
		label: string;
		disabled?: boolean;
	}

	interface Props {
		value?: string;
		options: Option[];
		label?: string;
		placeholder?: string;
		error?: string;
		helper?: string;
		disabled?: boolean;
		required?: boolean;
		id?: string;
		name?: string;
		onchange?: (event: Event & { currentTarget: HTMLSelectElement }) => void;
	}

	let {
		value = $bindable(''),
		options,
		label,
		placeholder,
		error,
		helper,
		disabled = false,
		required = false,
		id,
		name,
		onchange,
	}: Props = $props();

	const inputId = $derived(
		id ?? (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined),
	);
	const hasError = $derived(!!error);
</script>

<div class="flex flex-col gap-1">
	{#if label}
		<label for={inputId} class="text-sm font-medium text-ink">
			{label}{#if required}<span class="text-error ml-0.5" aria-hidden="true">*</span>{/if}
		</label>
	{/if}
	<div class="relative">
		<select
			bind:value
			id={inputId}
			{name}
			{disabled}
			{required}
			aria-describedby={error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined}
			aria-invalid={hasError ? 'true' : undefined}
			class="w-full appearance-none rounded-md border bg-surface-alt px-3 py-1.5 pr-8 text-sm text-ink
				focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-0 focus:border-accent
				disabled:opacity-50 disabled:cursor-not-allowed
				transition-colors
				{hasError ? 'border-error focus:ring-error' : 'border-border hover:border-border-strong'}"
			{onchange}
		>
			{#if placeholder}
				<option value="" disabled>{placeholder}</option>
			{/if}
			{#each options as option (option.value)}
				<option value={option.value} disabled={option.disabled}>{option.label}</option>
			{/each}
		</select>
		<span
			class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
			aria-hidden="true"
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 12 12"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="2,4 6,8 10,4"></polyline>
			</svg>
		</span>
	</div>
	{#if error}
		<p id="{inputId}-error" class="text-xs text-error" role="alert">{error}</p>
	{:else if helper}
		<p id="{inputId}-helper" class="text-xs text-ink-muted">{helper}</p>
	{/if}
</div>
