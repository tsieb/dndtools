<script lang="ts">
	interface Props {
		tags?: string[];
		label?: string;
		placeholder?: string;
		helper?: string;
		disabled?: boolean;
		id?: string;
		onchange?: (tags: string[]) => void;
	}

	let {
		tags = $bindable([]),
		label,
		placeholder = 'Add tag...',
		helper,
		disabled = false,
		id,
		onchange,
	}: Props = $props();

	let inputValue = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);
	const inputId = $derived(
		id ?? (label ? `tag-input-${label.toLowerCase().replace(/\s+/g, '-')}` : 'tag-input'),
	);

	function addTag(raw: string): void {
		const value = raw.trim().toLowerCase();
		if (!value || tags.includes(value)) {
			inputValue = '';
			return;
		}
		tags = [...tags, value];
		inputValue = '';
		onchange?.(tags);
	}

	function removeTag(tag: string): void {
		tags = tags.filter((t) => t !== tag);
		onchange?.(tags);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			addTag(inputValue);
			return;
		}
		if (event.key === 'Backspace' && !inputValue && tags.length > 0) {
			const last = tags[tags.length - 1];
			if (last) removeTag(last);
		}
	}

	function handleBlur(): void {
		if (inputValue.trim()) addTag(inputValue);
	}
</script>

<div class="flex flex-col gap-1">
	{#if label}
		<label for={inputId} class="text-sm font-medium text-ink">{label}</label>
	{/if}
	<div
		class="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-border bg-surface-alt px-2 py-1.5
			focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-0 focus-within:border-accent
			hover:border-border-strong transition-colors
			{disabled ? 'opacity-50 cursor-not-allowed' : ''}"
		onclick={() => inputEl?.focus()}
		role="none"
	>
		{#each tags as tag (tag)}
			<span
				class="inline-flex items-center gap-1 rounded bg-accent-subtle px-1.5 py-0.5 text-xs text-accent"
			>
				{tag}
				{#if !disabled}
					<button
						type="button"
						class="flex items-center rounded hover:text-accent-hover focus-visible:outline-accent"
						onclick={() => removeTag(tag)}
						aria-label="Remove tag {tag}"
					>
						<svg
							width="10"
							height="10"
							viewBox="0 0 12 12"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
						>
							<line x1="2" y1="2" x2="10" y2="10"></line>
							<line x1="10" y1="2" x2="2" y2="10"></line>
						</svg>
					</button>
				{/if}
			</span>
		{/each}
		<input
			bind:this={inputEl}
			bind:value={inputValue}
			id={inputId}
			type="text"
			{placeholder}
			{disabled}
			class="min-w-20 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
			onkeydown={handleKeydown}
			onblur={handleBlur}
		/>
	</div>
	{#if helper}
		<p class="text-xs text-ink-muted">{helper}</p>
	{/if}
</div>
