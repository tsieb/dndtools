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
		highlightQuery?: string;
		onselect: (entry: LocalNavTreeEntry) => void;
		oncontextrequest?: (entry: LocalNavTreeEntry, event: MouseEvent) => void;
	}

	let {
		ariaLabel,
		emptyLabel,
		entries,
		activeId = null,
		highlightQuery = '',
		onselect,
		oncontextrequest,
	}: Props = $props();

	let collapsedById = $state<Record<string, boolean>>({});
	let focusedId = $state<string | null>(null);
	const itemRefs: Record<string, HTMLButtonElement | undefined> = {};
	const visibleEntries = $derived.by(() =>
		entries.filter((_entry, index) => !hasCollapsedAncestor(index)),
	);

	$effect(() => {
		const next: Record<string, boolean> = {};
		for (const entry of entries) {
			if (!entry.hasChildren) continue;
			if (collapsedById[entry.id]) {
				next[entry.id] = true;
			}
		}
		const currentKeys = Object.keys(collapsedById);
		const nextKeys = Object.keys(next);
		if (
			currentKeys.length === nextKeys.length &&
			currentKeys.every((key) => next[key] === collapsedById[key])
		) {
			return;
		}
		collapsedById = next;
	});

	$effect(() => {
		if (visibleEntries.length === 0) {
			focusedId = null;
			return;
		}
		if (focusedId && visibleEntries.some((entry) => entry.id === focusedId)) {
			return;
		}
		focusedId = visibleEntries[0]!.id;
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

	function entryIndexById(id: string | null): number {
		if (!id) return -1;
		return entries.findIndex((entry) => entry.id === id);
	}

	function visibleIndexById(id: string | null): number {
		if (!id) return -1;
		return visibleEntries.findIndex((entry) => entry.id === id);
	}

	function isCollapsed(id: string): boolean {
		return collapsedById[id] ?? false;
	}

	function setCollapsed(id: string, collapsed: boolean): void {
		if (collapsed) {
			collapsedById = { ...collapsedById, [id]: true };
			return;
		}
		if (!collapsedById[id]) return;
		const next = { ...collapsedById };
		delete next[id];
		collapsedById = next;
	}

	function hasCollapsedAncestor(index: number): boolean {
		const entry = entries[index];
		if (!entry) return false;
		let targetDepth = entry.depth;
		for (let i = index - 1; i >= 0; i -= 1) {
			const candidate = entries[i];
			if (!candidate) continue;
			if (candidate.depth >= targetDepth) continue;
			if (candidate.hasChildren && isCollapsed(candidate.id)) return true;
			targetDepth = candidate.depth;
			if (targetDepth === 0) break;
		}
		return false;
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
		visibleIndex: number,
		entry: LocalNavTreeEntry,
	): void {
		const absoluteIndex = entryIndexById(entry.id);
		if (absoluteIndex < 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = Math.min(visibleEntries.length - 1, visibleIndex + 1);
			focusEntry(visibleEntries[nextIndex]!.id);
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			const nextIndex = Math.max(0, visibleIndex - 1);
			focusEntry(visibleEntries[nextIndex]!.id);
			return;
		}

		if (event.key === 'ArrowRight') {
			if (!entry.hasChildren) return;
			event.preventDefault();
			if (isCollapsed(entry.id)) {
				setCollapsed(entry.id, false);
				return;
			}
			const childIndex = findFirstChildIndex(absoluteIndex);
			const child = entries[childIndex];
			if (!child || hasCollapsedAncestor(childIndex)) return;
			focusEntry(child.id);
			return;
		}

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			if (entry.hasChildren && !isCollapsed(entry.id)) {
				setCollapsed(entry.id, true);
				return;
			}
			const parentIndex = findParentIndex(absoluteIndex);
			if (parentIndex === absoluteIndex) return;
			focusEntry(entries[parentIndex]!.id);
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			focusEntry(visibleEntries[0]!.id);
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			focusEntry(visibleEntries[visibleEntries.length - 1]!.id);
			return;
		}

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect(entry);
		}
	}

	function handleTreeFocus(event: FocusEvent): void {
		if (event.target !== event.currentTarget) return;
		if (visibleEntries.length === 0) return;
		const index = visibleIndexById(focusedId);
		const target = index >= 0 ? visibleEntries[index] : visibleEntries[0];
		if (!target) return;
		focusEntry(target.id);
	}

	function handleTreeItemContextMenu(entry: LocalNavTreeEntry, event: MouseEvent): void {
		if (!oncontextrequest) return;
		event.preventDefault();
		oncontextrequest(entry, event);
	}

	function highlightedLabelParts(label: string): Array<{ text: string; match: boolean }> {
		const query = highlightQuery.trim();
		if (!query) return [{ text: label, match: false }];
		const lowerLabel = label.toLowerCase();
		const lowerQuery = query.toLowerCase();
		const index = lowerLabel.indexOf(lowerQuery);
		if (index < 0) return [{ text: label, match: false }];
		const start = label.slice(0, index);
		const match = label.slice(index, index + query.length);
		const end = label.slice(index + query.length);
		const parts: Array<{ text: string; match: boolean }> = [];
		if (start) parts.push({ text: start, match: false });
		parts.push({ text: match, match: true });
		if (end) parts.push({ text: end, match: false });
		return parts;
	}
</script>

<div role="tree" aria-label={ariaLabel} onfocus={handleTreeFocus} tabindex="0" class="density-list">
	{#if entries.length === 0}
		<button
			type="button"
			disabled
			role="treeitem"
			aria-level={1}
			aria-selected="false"
			class="sidebar-tree-item w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-xs text-ink-faint disabled:cursor-default"
		>
			{emptyLabel}
		</button>
	{:else}
		{#each visibleEntries as entry, index (entry.id)}
			<button
				type="button"
				class="sidebar-tree-item flex w-full items-center gap-2 rounded-md border-l-2 px-2.5 py-1.5 text-left text-xs transition-[transform,colors] active:scale-[0.97] active:brightness-95 {activeId ===
				entry.id
					? 'border-accent bg-accent-subtle/70 text-accent'
					: 'border-transparent text-ink-muted hover:bg-bg hover:text-ink'} {entry.dimmed
					? 'opacity-55'
					: ''}"
				style="padding-left: {0.75 + entry.depth * 0.75}rem"
				role="treeitem"
				aria-level={entry.depth + 1}
				aria-expanded={entry.hasChildren ? !isCollapsed(entry.id) : undefined}
				aria-selected={activeId === entry.id}
				aria-current={activeId === entry.id ? 'page' : undefined}
				tabindex={focusedId === entry.id ? 0 : -1}
				onclick={() => onselect(entry)}
				onfocus={() => (focusedId = entry.id)}
				oncontextmenu={(event) => handleTreeItemContextMenu(entry, event)}
				onkeydown={(event) => handleTreeItemKeydown(event, index, entry)}
				use:registerItem={entry.id}
				aria-label={entry.label}
			>
				<span class="truncate">
					{#each highlightedLabelParts(entry.label) as part, partIndex (`${entry.id}-${partIndex}`)}
						{#if part.match}
							<mark class="rounded bg-accent-subtle px-0.5 text-inherit">{part.text}</mark>
						{:else}
							{part.text}
						{/if}
					{/each}
				</span>
				{#if typeof entry.count === 'number'}
					<span class="ml-auto text-xs text-ink-faint">({entry.count})</span>
				{/if}
			</button>
		{/each}
	{/if}
</div>
