<script lang="ts">
	interface Props {
		checked?: boolean;
		label: string;
		helper?: string;
		error?: string;
		disabled?: boolean;
		id?: string;
		name?: string;
		onchange?: (checked: boolean) => void;
	}

	let {
		checked = $bindable(false),
		label,
		helper,
		error,
		disabled = false,
		id,
		name,
		onchange,
	}: Props = $props();

	const inputId = $derived(id ?? `checkbox-${label.toLowerCase().replace(/\s+/g, '-')}`);

	function handleChange(event: Event & { currentTarget: HTMLInputElement }): void {
		checked = event.currentTarget.checked;
		onchange?.(checked);
	}
</script>

<div class="flex flex-col gap-1">
	<label
		class="flex items-start gap-2.5 {disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
	>
		<input
			type="checkbox"
			bind:checked
			id={inputId}
			{name}
			{disabled}
			aria-describedby={error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined}
			aria-invalid={error ? 'true' : undefined}
			class="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent accent-accent
				focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
				disabled:cursor-not-allowed"
			onchange={handleChange}
		/>
		<span class="text-sm text-ink leading-snug">{label}</span>
	</label>
	{#if error}
		<p id="{inputId}-error" class="ml-6 text-xs text-error" role="alert">{error}</p>
	{:else if helper}
		<p id="{inputId}-helper" class="ml-6 text-xs text-ink-muted">{helper}</p>
	{/if}
</div>
