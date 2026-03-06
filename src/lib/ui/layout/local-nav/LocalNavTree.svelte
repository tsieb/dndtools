<script lang="ts">
	export interface LocalNavTreeEntry {
		id: string;
		label: string;
		depth: number;
		count?: number;
		path: string;
		hasChildren: boolean;
		dimmed?: boolean;
	}

	interface Props {
		ariaLabel: string;
		emptyLabel: string;
		entries: readonly LocalNavTreeEntry[];
		activeId?: string | null;
		onselect: (entry: LocalNavTreeEntry) => void;
		oncontextrequest?: (entry: LocalNavTreeEntry, event: MouseEvent) => void;
	}

	let {
		ariaLabel,
		emptyLabel,
		entries,
		activeId = null,
		onselect,
		oncontextrequest,
	}: Props = $props();

	let focusedId = $state<string | null>(null);
	const itemRefs: Record<string, HTMLButtonElement | undefined> = {};

	$effect(() => {
		if (entries.length === 0) {
			focusedId = null;
			return;
		}
		if (focusedId && entries.some((entry) => entry.id === focusedId)) {
			return;
		}
		focusedId = entries[0]!.id;
	});

	function setItemRef(id: string, element: HTMLButtonElement | null): void {
		if (!element) {
			delete itemRefs[id];
			return;
		}
		itemRefs[id] = element;
	}

	function registerItem(element: HTMLButtonElement, id: string): { destroy: () => void } {
		setItemRef(id, element);
		return {
			destroy: () => setItemRef(id, null),
		};
	}

	function focusEntry(id: string): void {
		focusedId = id;
		itemRefs[id]?.focus();
	}

	function findIndex(id: string | null): number {
		if (!id) return -1;
		return entries.findIndex((entry) => entry.id === id);
	}

	function findFirstChildIndex(parentIndex: number): number {
		const parent = entries[parentIndex];
		if (!parent) return parentIndex;
		for (let i = parentIndex + 1; i < entries.length; i += 1) {
			const candidate = entries[i];
			if (!candidate) break;
			if (candidate.depth <= parent.depth) break;
			if (candidate.depth === parent.depth + 1) return i;
		}
		return parentIndex;
	}

	function findParentIndex(childIndex: number): number {
		const child = entries[childIndex];
		if (!child) return childIndex;
		for (let i = childIndex - 1; i >= 0; i -= 1) {
			const candidate = entries[i];
			if (!candidate) continue;
			if (candidate.depth < child.depth) return i;
		}
		return childIndex;
	}

	function handleTreeItemKeydown(
		event: KeyboardEvent,
		index: number,
		entry: LocalNavTreeEntry,
	): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = Math.min(entries.length - 1, index + 1);
			focusEntry(entries[nextIndex]!.id);
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			const nextIndex = Math.max(0, index - 1);
			focusEntry(entries[nextIndex]!.id);
			return;
		}

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			if (entry.hasChildren) {
				const childIndex = findFirstChildIndex(index);
				focusEntry(entries[childIndex]!.id);
			}
			return;
		}

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			const parentIndex = findParentIndex(index);
			focusEntry(entries[parentIndex]!.id);
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			focusEntry(entries[0]!.id);
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			focusEntry(entries[entries.length - 1]!.id);
			return;
		}

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect(entry);
		}
	}

	function handleTreeFocus(): void {
		if (entries.length === 0) return;
		const index = findIndex(focusedId);
		const target = index >= 0 ? entries[index] : entries[0];
		if (!target) return;
		focusEntry(target.id);
	}

	function handleTreeItemContextMenu(entry: LocalNavTreeEntry, event: MouseEvent): void {
		if (!oncontextrequest) return;
		event.preventDefault();
		oncontextrequest(entry, event);
	}
</script>

<div role="tree" aria-label={ariaLabel} onfocus={handleTreeFocus} tabindex="-1" class="space-y-0.5">
	{#if entries.length === 0}
		<button
			type="button"
			disabled
			role="treeitem"
			aria-level={1}
			aria-selected="false"
			class="w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-xs text-ink-faint disabled:cursor-default"
		>
			{emptyLabel}
		</button>
	{:else}
		{#each entries as entry, index (entry.id)}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-md border-l-2 px-2.5 py-1.5 text-left text-xs transition-[transform,colors] active:scale-[0.97] active:brightness-95 {activeId ===
				entry.id
					? 'border-accent bg-accent-subtle/70 text-accent'
					: 'border-transparent text-ink-muted hover:bg-bg hover:text-ink'} {entry.dimmed
					? 'opacity-55'
					: ''}"
				style="padding-left: {0.75 + entry.depth * 0.75}rem"
				role="treeitem"
				aria-level={entry.depth + 1}
				aria-expanded={entry.hasChildren ? 'true' : undefined}
				aria-selected={activeId === entry.id}
				aria-current={activeId === entry.id ? 'page' : undefined}
				tabindex={focusedId === entry.id ? 0 : -1}
				onclick={() => onselect(entry)}
				onfocus={() => (focusedId = entry.id)}
				oncontextmenu={(event) => handleTreeItemContextMenu(entry, event)}
				onkeydown={(event) => handleTreeItemKeydown(event, index, entry)}
				use:registerItem={entry.id}
				title={entry.label}
			>
				<span class="truncate">{entry.label}</span>
				{#if typeof entry.count === 'number'}
					<span class="ml-auto text-[11px] text-ink-faint">({entry.count})</span>
				{/if}
			</button>
		{/each}
	{/if}
</div>
