<script lang="ts">
	import { ui } from '$lib/stores/ui.svelte.js';

	interface Props {
		onnewnote: () => void;
		onsearch: () => void;
	}

	let { onnewnote, onsearch }: Props = $props();
</script>

<header
	class="h-12 flex items-center justify-between px-4 border-b border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface shrink-0"
>
	<div class="flex items-center gap-3">
		<button
			class="p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={() => ui.toggleSidebar()}
			aria-label="Toggle sidebar"
			title="Toggle sidebar (Ctrl+B)"
		>
			<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>
		<a href="/" class="text-lg font-semibold text-ink dark:text-tavern-text tracking-tight">
			DND Tools
		</a>
	</div>

	<div class="flex items-center gap-1">
		<button
			class="p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={onsearch}
			aria-label="Search"
			title="Quick search (Ctrl+P)"
		>
			<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
		</button>
		<button
			class="p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={onnewnote}
			aria-label="New note"
			title="New note (Ctrl+N)"
		>
			<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
		</button>
		<a
			href="/settings"
			class="p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			aria-label="Settings"
		>
			<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
				/>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
				/>
			</svg>
		</a>
	</div>
</header>
