<script lang="ts">
	interface Props {
		checked?: boolean;
		label: string;
		labelPosition?: 'left' | 'right';
		helper?: string;
		disabled?: boolean;
		id?: string;
		onchange?: (checked: boolean) => void;
	}

	let {
		checked = $bindable(false),
		label,
		labelPosition = 'right',
		helper,
		disabled = false,
		id,
		onchange,
	}: Props = $props();

	const inputId = $derived(id ?? `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`);

	function handleChange(event: Event & { currentTarget: HTMLInputElement }): void {
		checked = event.currentTarget.checked;
		onchange?.(checked);
	}
</script>

<div class="flex flex-col gap-1">
	<label
		class="flex items-center gap-2.5 {disabled
			? 'opacity-50 cursor-not-allowed'
			: 'cursor-pointer'} {labelPosition === 'left' ? 'flex-row-reverse justify-end' : ''}"
	>
		<input
			type="checkbox"
			role="switch"
			bind:checked
			id={inputId}
			{disabled}
			aria-checked={checked}
			class="sr-only"
			onchange={handleChange}
		/>
		<!-- Toggle track -->
		<span
			class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-fast
				{checked ? 'bg-accent' : 'bg-border-strong'}
				{disabled
				? ''
				: 'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent'}"
			aria-hidden="true"
		>
			<span
				class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-fast
					{checked ? 'translate-x-4' : 'translate-x-0.5'}"
			></span>
		</span>
		<span class="text-sm text-ink">{label}</span>
	</label>
	{#if helper}
		<p class="ml-[52px] text-xs text-ink-muted">{helper}</p>
	{/if}
</div>
