<script lang="ts">
	import type { DesktopSchemaMigrationReport } from '$lib/platform/desktop/bridge.js';

	interface Props {
		report: DesktopSchemaMigrationReport;
		applying: boolean;
		error: string | null;
		onapply: () => void;
	}

	let { report, applying, error, onapply }: Props = $props();

	const totalPending = $derived(report.steps.reduce((sum, step) => sum + step.pending, 0));
</script>

<div
	class="flex h-screen items-center justify-center bg-parchment dark:bg-tavern-bg"
	role="main"
	aria-label="Vault upgrade required"
>
	<div
		class="w-full max-w-lg mx-4 rounded-xl border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface shadow-lg"
	>
		<!-- Header -->
		<div class="px-6 pt-6 pb-4 border-b border-border dark:border-tavern-border">
			<div class="flex items-center gap-3">
				<div
					class="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center"
					aria-hidden="true"
				>
					<svg
						class="w-5 h-5 text-amber-600 dark:text-amber-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
						/>
					</svg>
				</div>
				<div>
					<h1 class="text-base font-semibold text-ink dark:text-tavern-text leading-tight">
						Vault Upgrade Required
					</h1>
					<p class="text-xs text-ink-muted dark:text-tavern-muted mt-0.5">
						{totalPending} file{totalPending === 1 ? '' : 's'} will be updated to the current schema.
					</p>
				</div>
			</div>
		</div>

		<!-- Body -->
		<div class="px-6 py-4 space-y-4 max-h-[50vh] overflow-y-auto">
			<!-- Upgrade steps -->
			<div>
				<h2
					class="text-xs font-semibold text-ink-muted dark:text-tavern-muted uppercase tracking-wide mb-2"
				>
					Pending Changes
				</h2>
				<ul class="space-y-2">
					{#each report.steps as step (step.id)}
						{#if step.pending > 0}
							<li
								class="rounded-md border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt p-3"
							>
								<div class="flex items-center justify-between">
									<p class="text-sm font-medium text-ink dark:text-tavern-text">
										{step.description}
									</p>
									<span class="ml-3 text-xs text-ink-faint dark:text-tavern-faint shrink-0">
										{step.pending} file{step.pending === 1 ? '' : 's'}
									</span>
								</div>
								<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1">
									v{step.fromVersion} → v{step.toVersion}
								</p>
							</li>
						{/if}
					{/each}
				</ul>
			</div>

			<!-- File list (collapsed by default) -->
			{#if report.changedFiles.length > 0}
				<details class="rounded-md border border-border dark:border-tavern-border">
					<summary
						class="cursor-pointer px-3 py-2 text-xs font-medium text-ink-muted dark:text-tavern-muted select-none hover:text-ink dark:hover:text-tavern-text"
					>
						{report.changedFiles.length} affected file{report.changedFiles.length === 1 ? '' : 's'}
					</summary>
					<ul class="px-3 pb-3 space-y-0.5 mt-1 max-h-40 overflow-y-auto">
						{#each report.changedFiles as filePath (filePath)}
							<li
								class="text-xs font-mono text-ink-faint dark:text-tavern-faint truncate"
								title={filePath}
							>
								{filePath}
							</li>
						{/each}
					</ul>
				</details>
			{/if}

			<!-- Backup notice -->
			<div
				class="flex items-start gap-2 rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5"
			>
				<svg
					class="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				<p class="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
					A full checkpoint backup will be created before any files are modified. If anything goes
					wrong, the vault will be automatically rolled back to its previous state.
				</p>
			</div>

			<!-- Warnings -->
			{#if report.warnings.length > 0}
				<div
					class="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2"
				>
					<p class="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Warnings</p>
					<ul class="space-y-0.5">
						{#each report.warnings as warning (warning)}
							<li class="text-xs text-amber-700 dark:text-amber-300">{warning}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Migration error (after a failed apply attempt) -->
			{#if error}
				<div
					class="rounded-md border border-error/40 dark:border-tavern-error/40 bg-red-50 dark:bg-red-900/20 px-3 py-2"
					role="alert"
				>
					<p class="text-xs font-semibold text-error dark:text-tavern-error mb-1">Upgrade failed</p>
					<p class="text-xs text-error dark:text-tavern-error">{error}</p>
					<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1">
						Your vault was not modified. You can retry or open a previous version of the
						application.
					</p>
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<div
			class="px-6 py-4 border-t border-border dark:border-tavern-border flex items-center justify-end gap-3"
		>
			<button
				class="text-sm text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text transition-colors"
				onclick={() => window.close?.()}
				disabled={applying}
			>
				Cancel
			</button>
			<button
				class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-hover dark:bg-tavern-accent dark:text-tavern-bg dark:hover:bg-tavern-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				onclick={onapply}
				disabled={applying}
				aria-busy={applying}
			>
				{#if applying}
					<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
						></path>
					</svg>
					Upgrading…
				{:else}
					Upgrade Vault
				{/if}
			</button>
		</div>
	</div>
</div>
