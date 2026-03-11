<script lang="ts">
	import Button from '$lib/ui/common/Button.svelte';
	import { syncState } from '$lib/state/sync.svelte.js';
	import type { SyncConflictRecord, SyncConflictStrategy } from '$lib/types/sync.js';

	interface Props {
		onrefreshlocal: () => Promise<void>;
	}

	let { onrefreshlocal }: Props = $props();

	let savingStrategy = $state(false);
	let syncingNow = $state(false);
	let resolvingConflict = $state(false);
	let selectedConflictId = $state<string | null>(null);
	let mergeDraft = $state('');

	const selectedConflict = $derived.by<SyncConflictRecord | null>(() => {
		if (!selectedConflictId) return null;
		return syncState.conflicts.find((entry) => entry.id === selectedConflictId) ?? null;
	});

	$effect(() => {
		if (syncState.conflicts.length === 0) {
			selectedConflictId = null;
			mergeDraft = '';
			return;
		}
		if (
			!selectedConflictId ||
			!syncState.conflicts.some((entry) => entry.id === selectedConflictId)
		) {
			selectedConflictId = syncState.conflicts[0]?.id ?? null;
		}
	});

	$effect(() => {
		if (!selectedConflict) {
			mergeDraft = '';
			return;
		}
		mergeDraft = selectedConflict.localNote?.content ?? selectedConflict.remoteNote?.content ?? '';
	});

	async function handleSaveStrategy(): Promise<void> {
		savingStrategy = true;
		try {
			await syncState.setConflictStrategy(syncState.conflictStrategy);
		} finally {
			savingStrategy = false;
		}
	}

	async function handleSyncNow(): Promise<void> {
		syncingNow = true;
		try {
			await syncState.forceSync();
			await onrefreshlocal();
		} finally {
			syncingNow = false;
		}
	}

	async function resolveConflict(
		conflictId: string,
		resolution: 'use_local' | 'use_remote' | 'use_latest' | 'use_merged',
	): Promise<void> {
		resolvingConflict = true;
		try {
			const resolved = await syncState.resolveConflict(
				conflictId,
				resolution,
				resolution === 'use_merged' ? mergeDraft : undefined,
			);
			if (resolved) {
				await onrefreshlocal();
			}
		} finally {
			resolvingConflict = false;
		}
	}

	function describeIndicator(): string {
		switch (syncState.indicator) {
			case 'online':
				return 'Online';
			case 'offline':
				return 'Offline';
			case 'syncing':
				return 'Syncing';
			case 'error':
				return 'Error';
		}
	}

	function conflictReasonLabel(reason: SyncConflictRecord['reason']): string {
		switch (reason) {
			case 'remote_created_during_local_create':
				return 'Remote note already exists';
			case 'remote_deleted_since_ancestor':
				return 'Remote note was deleted';
			case 'remote_updated_since_ancestor':
				return 'Remote note changed';
		}
	}
</script>

<section>
	<h2 class="text-lg font-semibold text-ink mb-4">Sync Status</h2>
	<div class="rounded-lg border border-border bg-surface p-4 space-y-4">
		<div class="grid gap-3 md:grid-cols-2">
			<div class="rounded border border-border p-3">
				<p class="text-xs text-ink-muted">Connection</p>
				<p class="mt-1 text-sm font-semibold text-ink">
					{describeIndicator()}
				</p>
			</div>
			<div class="rounded border border-border p-3">
				<p class="text-xs text-ink-muted">Pending Queue</p>
				<p class="mt-1 text-sm font-semibold text-ink">
					{syncState.queueDepth} item{syncState.queueDepth === 1 ? '' : 's'}
				</p>
			</div>
			<div class="rounded border border-border p-3">
				<p class="text-xs text-ink-muted">Conflicts</p>
				<p class="mt-1 text-sm font-semibold text-ink">
					{syncState.conflictCount}
				</p>
			</div>
			<div class="rounded border border-border p-3">
				<p class="text-xs text-ink-muted">Last Sync</p>
				<p class="mt-1 text-sm font-semibold text-ink">
					{syncState.lastSyncAt ?? 'Not synced yet'}
				</p>
			</div>
		</div>

		{#if syncState.lastError}
			<p
				class="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
			>
				{syncState.lastError}
			</p>
		{/if}

		<div class="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
			<label class="text-xs text-ink-muted">
				Default conflict strategy
				<select
					class="mt-1 w-full rounded border border-border bg-white px-2 py-1.5 text-sm text-ink"
					value={syncState.conflictStrategy}
					onchange={(event) =>
						(syncState.conflictStrategy = (event.currentTarget as HTMLSelectElement)
							.value as SyncConflictStrategy)}
				>
					<option value="manual">Manual review</option>
					<option value="use_latest">Use latest timestamp automatically</option>
				</select>
			</label>
			<Button variant="secondary" size="sm" onclick={handleSaveStrategy} loading={savingStrategy}>
				{savingStrategy ? 'Saving...' : 'Save Strategy'}
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onclick={handleSyncNow}
				loading={syncingNow || syncState.syncing}
			>
				{syncingNow || syncState.syncing ? 'Syncing...' : 'Sync Now'}
			</Button>
		</div>
	</div>
</section>

<section>
	<h2 class="text-lg font-semibold text-ink mb-4">Conflict Resolution</h2>
	<div class="rounded-lg border border-border bg-surface p-4 space-y-4">
		{#if syncState.conflicts.length === 0}
			<p class="text-sm text-ink-muted">No conflicts pending.</p>
		{:else}
			<div class="grid gap-4 lg:grid-cols-[280px_1fr]">
				<div class="rounded border border-border overflow-hidden">
					<ul class="divide-y divide-border max-h-[28rem] overflow-y-auto">
						{#each syncState.conflicts as conflict (conflict.id)}
							<li>
								<button
									type="button"
									class="w-full text-left px-3 py-2 transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt {selectedConflictId ===
									conflict.id
										? 'bg-surface-alt'
										: ''}"
									onclick={() => (selectedConflictId = conflict.id)}
									aria-label={conflict.title}
								>
									<p class="text-sm font-medium text-ink truncate">
										{conflict.title}
									</p>
									<p class="text-xs text-ink-muted mt-0.5">
										{conflictReasonLabel(conflict.reason)}
									</p>
								</button>
							</li>
						{/each}
					</ul>
				</div>

				{#if selectedConflict}
					<div class="space-y-4">
						<div>
							<p class="text-sm font-semibold text-ink">
								{selectedConflict.title}
							</p>
							<p class="text-xs text-ink-muted mt-1">
								Detected: {selectedConflict.detectedAt}
							</p>
						</div>

						<div class="grid gap-3 md:grid-cols-3">
							<div>
								<p class="text-xs font-medium text-ink-muted mb-1">Ancestor</p>
								<textarea
									class="h-48 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-xs font-mono text-ink"
									readonly
									value={selectedConflict.ancestorNote?.content ?? ''}
								></textarea>
							</div>
							<div>
								<p class="text-xs font-medium text-ink-muted mb-1">Local</p>
								<textarea
									class="h-48 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-xs font-mono text-ink"
									readonly
									value={selectedConflict.localNote?.content ?? ''}
								></textarea>
							</div>
							<div>
								<p class="text-xs font-medium text-ink-muted mb-1">Remote</p>
								<textarea
									class="h-48 w-full rounded border border-border bg-surface-alt px-2 py-1.5 text-xs font-mono text-ink"
									readonly
									value={selectedConflict.remoteNote?.content ?? ''}
								></textarea>
							</div>
						</div>

						<div>
							<label for="sync-merge-draft" class="block text-xs font-medium text-ink-muted mb-1">
								Manual merged result
							</label>
							<textarea
								id="sync-merge-draft"
								class="h-48 w-full rounded border border-border bg-white px-2 py-1.5 text-xs font-mono text-ink"
								bind:value={mergeDraft}
							></textarea>
						</div>

						<div class="flex flex-wrap items-center gap-2">
							<Button
								variant="secondary"
								size="sm"
								disabled={resolvingConflict}
								onclick={() => resolveConflict(selectedConflict.id, 'use_local')}
							>
								Use Local
							</Button>
							<Button
								variant="secondary"
								size="sm"
								disabled={resolvingConflict}
								onclick={() => resolveConflict(selectedConflict.id, 'use_remote')}
							>
								Use Remote
							</Button>
							<Button
								variant="secondary"
								size="sm"
								disabled={resolvingConflict}
								onclick={() => resolveConflict(selectedConflict.id, 'use_latest')}
							>
								Use Latest
							</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={resolvingConflict || mergeDraft.trim().length === 0}
								onclick={() => resolveConflict(selectedConflict.id, 'use_merged')}
							>
								Apply Manual Merge
							</Button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</section>
