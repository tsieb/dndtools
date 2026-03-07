<script lang="ts">
	interface Props {
		value?: string;
		label?: string;
		placeholder?: string;
		error?: string;
		helper?: string;
		disabled?: boolean;
		required?: boolean;
		rows?: number;
		autoExpand?: boolean;
		id?: string;
		name?: string;
		oninput?: (event: Event & { currentTarget: HTMLTextAreaElement }) => void;
	}

	let {
		value = $bindable(''),
		label,
		placeholder,
		error,
		helper,
		disabled = false,
		required = false,
		rows = 3,
		autoExpand = false,
		id,
		name,
		oninput,
	}: Props = $props();

	const inputId = $derived(
		id ?? (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined),
	);
	const hasError = $derived(!!error);

	function handleInput(event: Event & { currentTarget: HTMLTextAreaElement }): void {
		if (autoExpand) {
			event.currentTarget.style.height = 'auto';
			event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
		}
		oninput?.(event);
	}
</script>

<div class="flex flex-col gap-1">
	{#if label}
		<label for={inputId} class="text-sm font-medium text-ink">
			{label}{#if required}<span class="text-error ml-0.5" aria-hidden="true">*</span>{/if}
		</label>
	{/if}
	<textarea
		bind:value
		id={inputId}
		{name}
		{placeholder}
		{disabled}
		{required}
		{rows}
		aria-describedby={error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined}
		aria-invalid={hasError ? 'true' : undefined}
		class="w-full rounded-md border bg-surface-alt px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint
			resize-y
			focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-0 focus:border-accent
			disabled:opacity-50 disabled:cursor-not-allowed
			transition-colors
			{hasError ? 'border-error focus:ring-error' : 'border-border hover:border-border-strong'}
			{autoExpand ? 'overflow-hidden' : ''}"
		oninput={handleInput}
	></textarea>
	{#if error}
		<p id="{inputId}-error" class="flex items-center gap-1 text-xs text-error" role="alert">
			{error}
		</p>
	{:else if helper}
		<p id="{inputId}-helper" class="text-xs text-ink-muted">{helper}</p>
	{/if}
</div>
