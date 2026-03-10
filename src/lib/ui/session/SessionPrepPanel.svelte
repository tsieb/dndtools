<script lang="ts">
	import type { SessionPrepViewModel } from '$lib/domain/session-prep-workflow.js';

	interface Props {
		prep: SessionPrepViewModel | null;
		loading: boolean;
		error: string | null;
		onopennote: (noteId: string) => void;
		onrefresh: () => void;
	}

	let { prep, loading, error, onopennote, onrefresh }: Props = $props();
</script>

<section
	class="rounded-md border border-border bg-surface-alt/45 p-3"
	aria-label="Session prep workflow"
>
	<div class="flex items-center justify-between gap-2">
		<h2 class="text-sm font-semibold text-ink">Session Prep</h2>
		<button
			type="button"
			class="rounded border border-border px-2 py-1 text-2xs text-ink-muted hover:bg-surface"
			onclick={onrefresh}
			disabled={loading}
		>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	{#if loading}
		<p class="mt-2 text-xs text-ink-muted">Loading prep bundle...</p>
	{:else if error}
		<p class="mt-2 text-xs text-error">Prep data unavailable: {error}</p>
	{:else if prep}
		<div class="mt-3 grid gap-3 xl:grid-cols-2">
			<section class="rounded border border-border bg-surface p-2">
				<p class="text-xs font-semibold text-ink">Open Threads</p>
				{#if prep.openThreads.length === 0}
					<p class="mt-1 text-2xs text-ink-faint">No open quest or NPC threads detected.</p>
				{:else}
					<div class="mt-2 space-y-1.5">
						{#each prep.openThreads as thread (thread.kind + thread.noteId)}
							<button
								type="button"
								class="w-full rounded border border-border/80 px-2 py-1.5 text-left hover:bg-surface-alt"
								onclick={() => onopennote(thread.noteId)}
							>
								<p class="text-xs font-medium text-ink">{thread.title}</p>
								<p class="text-2xs uppercase tracking-wide text-ink-faint">{thread.kind}</p>
								<p class="text-2xs text-ink-muted">{thread.detail}</p>
							</button>
						{/each}
					</div>
				{/if}
			</section>

			<section class="rounded border border-border bg-surface p-2">
				<p class="text-xs font-semibold text-ink">Notes to Review</p>
				{#if prep.notesToReview.length === 0}
					<p class="mt-1 text-2xs text-ink-faint">No recent linked notes found.</p>
				{:else}
					<ul class="mt-2 space-y-1.5">
						{#each prep.notesToReview as note (note.id)}
							<li>
								<button
									type="button"
									class="w-full rounded border border-border/80 px-2 py-1.5 text-left hover:bg-surface-alt"
									onclick={() => onopennote(note.id)}
								>
									<p class="text-xs font-medium text-ink">{note.title}</p>
									<p class="text-2xs text-ink-faint">{note.folder}</p>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="rounded border border-border bg-surface p-2 xl:col-span-2">
				<p class="text-xs font-semibold text-ink">Last Session Summary</p>
				<p class="mt-1 text-xs text-ink-muted">{prep.lastSessionSummary}</p>
			</section>

			<section class="rounded border border-border bg-surface p-2">
				<p class="text-xs font-semibold text-ink">Handouts to Deliver</p>
				{#if prep.handoutsToDeliver.length === 0}
					<p class="mt-1 text-2xs text-ink-faint">No undelivered handout notes.</p>
				{:else}
					<ul class="mt-2 space-y-1.5">
						{#each prep.handoutsToDeliver as note (note.id)}
							<li>
								<button
									type="button"
									class="w-full rounded border border-border/80 px-2 py-1.5 text-left hover:bg-surface-alt"
									onclick={() => onopennote(note.id)}
								>
									<p class="text-xs font-medium text-ink">{note.title}</p>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="rounded border border-border bg-surface p-2">
				<p class="text-xs font-semibold text-ink">Continuity Watch</p>
				{#if prep.continuityFlags.length === 0}
					<p class="mt-1 text-2xs text-ink-faint">No high-priority continuity warnings.</p>
				{:else}
					<ul class="mt-2 space-y-1">
						{#each prep.continuityFlags as flag (flag.key)}
							<li class="rounded border border-border/80 px-2 py-1.5 text-2xs text-ink-muted">
								<span class="font-medium text-ink">{flag.severity}</span>: {flag.message}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
		<p class="mt-2 text-2xs text-ink-faint">
			Updated {new Date(prep.generatedAt).toLocaleString()}
		</p>
	{:else}
		<p class="mt-2 text-xs text-ink-muted">Session prep data unavailable.</p>
	{/if}
</section>
