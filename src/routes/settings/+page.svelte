<script lang="ts">
	import ThemeToggle from '$lib/components/common/ThemeToggle.svelte';
	import { vaultState } from '$lib/stores/vault.svelte.js';
	import { notesState } from '$lib/stores/notes.svelte.js';
</script>

<div class="p-6 max-w-content mx-auto">
	<h1 class="text-2xl font-bold text-ink dark:text-tavern-text mb-6">Settings</h1>

	<section class="mb-8">
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-3">Appearance</h2>
		<div class="flex items-center justify-between">
			<div>
				<p class="text-sm font-medium text-ink dark:text-tavern-text">Theme</p>
				<p class="text-xs text-ink-muted dark:text-tavern-muted">
					Choose light, dark, or follow system
				</p>
			</div>
			<ThemeToggle />
		</div>
	</section>

	<section class="mb-8">
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-3">Vault</h2>
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-2 text-sm"
		>
			<div class="flex justify-between">
				<span class="text-ink-muted dark:text-tavern-muted">Total notes</span>
				<span class="text-ink dark:text-tavern-text font-medium">{vaultState.noteCount}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-ink-muted dark:text-tavern-muted">Tags</span>
				<span class="text-ink dark:text-tavern-text font-medium"
					>{vaultState.tagCounts.length}</span
				>
			</div>
			<div class="flex justify-between">
				<span class="text-ink-muted dark:text-tavern-muted">In trash</span>
				<span class="text-ink dark:text-tavern-text font-medium"
					>{notesState.deletedNotes.length}</span
				>
			</div>
		</div>
	</section>

	<section class="mb-8">
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-3">Keyboard Shortcuts</h2>
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface overflow-hidden"
		>
			<table class="w-full text-sm">
				<tbody>
					<tr class="border-b border-border dark:border-tavern-border">
						<td class="px-4 py-2 font-mono text-xs text-accent dark:text-tavern-accent"
							>Ctrl+N</td
						>
						<td class="px-4 py-2 text-ink dark:text-tavern-text">New note</td>
					</tr>
					<tr class="border-b border-border dark:border-tavern-border">
						<td class="px-4 py-2 font-mono text-xs text-accent dark:text-tavern-accent"
							>Ctrl+P</td
						>
						<td class="px-4 py-2 text-ink dark:text-tavern-text">Quick switcher</td>
					</tr>
					<tr class="border-b border-border dark:border-tavern-border">
						<td class="px-4 py-2 font-mono text-xs text-accent dark:text-tavern-accent"
							>Ctrl+B</td
						>
						<td class="px-4 py-2 text-ink dark:text-tavern-text">Toggle sidebar</td>
					</tr>
					<tr>
						<td class="px-4 py-2 font-mono text-xs text-accent dark:text-tavern-accent"
							>Ctrl+Shift+F</td
						>
						<td class="px-4 py-2 text-ink dark:text-tavern-text">Global search</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-3">About</h2>
		<p class="text-sm text-ink-muted dark:text-tavern-muted">
			DND Tools v0.1.0 — A lightweight note-taking app for D&D campaign management.
		</p>
		<p class="text-sm text-ink-muted dark:text-tavern-muted mt-1">
			All data is stored locally in your browser. No account required.
		</p>
	</section>
</div>
