<script lang="ts">
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';

	interface ShortcutItem {
		shortcut: string;
		action: string;
	}

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	const SHORTCUTS: readonly ShortcutItem[] = [
		{ shortcut: 'Ctrl+N', action: 'Create new note' },
		{ shortcut: 'Ctrl+P', action: 'Open command palette' },
		{ shortcut: 'Ctrl+D', action: 'Open dice tray' },
		{ shortcut: 'Ctrl+B', action: 'Toggle local navigation panel' },
		{ shortcut: 'Ctrl+Shift+F', action: 'Open global search' },
		{ shortcut: 'Ctrl+Shift+S', action: 'Open session boards' },
		{ shortcut: 'Ctrl+Shift+C', action: 'Open combat tracker' },
		{ shortcut: 'Ctrl+Shift+L', action: 'Toggle dark mode' },
		{ shortcut: 'Ctrl+/', action: 'Open keyboard shortcuts in settings' },
		{ shortcut: 'Ctrl+Shift+Space', action: 'Toggle quick reference overlay' },
	];

	let { open, onclose }: Props = $props();

	function closeOverlay(): void {
		onclose();
	}

	function handleBackdrop(event: MouseEvent): void {
		if (event.target !== event.currentTarget) return;
		closeOverlay();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		closeOverlay();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Keyboard shortcut overlay"
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<div
			class="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
			use:focusTrap
		>
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<h2 class="text-base font-semibold text-ink">Keyboard Shortcuts</h2>
				<button
					type="button"
					class="rounded-md px-2 py-1 text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt"
					onclick={closeOverlay}
					aria-label="Close keyboard shortcuts overlay"
				>
					Close
				</button>
			</div>
			<ul class="max-h-[65vh] divide-y divide-border overflow-y-auto">
				{#each SHORTCUTS as item (item.shortcut)}
					<li class="flex items-center justify-between gap-3 px-4 py-3">
						<span class="text-sm text-ink">{item.action}</span>
						<kbd
							class="rounded border border-border bg-surface-alt px-2 py-0.5 font-mono text-xs text-ink"
						>
							{item.shortcut}
						</kbd>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}
