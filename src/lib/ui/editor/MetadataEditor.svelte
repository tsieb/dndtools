<script lang="ts">
	import Button from '$lib/ui/common/Button.svelte';

	interface Props {
		frontmatter: Record<string, unknown>;
		onapply: (updates: Record<string, unknown>) => void;
	}

	let { frontmatter, onapply }: Props = $props();

	let type = $state('');
	let status = $state('');
	let summary = $state('');
	let sessionDate = $state('');
	let aliases = $state('');
	let tags = $state('');

	$effect(() => {
		type = typeof frontmatter['type'] === 'string' ? frontmatter['type'] : '';
		status = typeof frontmatter['status'] === 'string' ? frontmatter['status'] : '';
		summary = typeof frontmatter['summary'] === 'string' ? frontmatter['summary'] : '';
		sessionDate = typeof frontmatter['date'] === 'string' ? frontmatter['date'] : '';
		aliases = Array.isArray(frontmatter['aliases'])
			? frontmatter['aliases']
					.filter((entry): entry is string => typeof entry === 'string')
					.join(', ')
			: '';
		tags = Array.isArray(frontmatter['tags'])
			? frontmatter['tags'].filter((entry): entry is string => typeof entry === 'string').join(', ')
			: '';
	});

	function listFromCsv(value: string): string[] {
		return value
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean);
	}

	function apply(): void {
		onapply({
			type,
			status,
			summary,
			date: sessionDate,
			aliases: listFromCsv(aliases),
			tags: listFromCsv(tags),
		});
	}
</script>

<section class="mb-3 rounded-lg border border-border bg-surface p-3">
	<div class="mb-2 flex items-center justify-between">
		<h2 class="text-xs font-semibold uppercase tracking-wider text-ink-faint">Metadata</h2>
		<Button variant="ghost" size="sm" onclick={apply}>Apply</Button>
	</div>

	<div class="grid gap-2 md:grid-cols-2">
		<label class="text-xs text-ink-muted">
			Type
			<input
				type="text"
				bind:value={type}
				class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
				placeholder="npc, location, quest..."
			/>
		</label>
		<label class="text-xs text-ink-muted">
			Status
			<input
				type="text"
				bind:value={status}
				class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
				placeholder="active, archived..."
			/>
		</label>
		<label class="text-xs text-ink-muted md:col-span-2">
			Summary
			<input
				type="text"
				bind:value={summary}
				class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
				placeholder="One-line note summary"
			/>
		</label>
		<label class="text-xs text-ink-muted">
			Session Date
			<input
				type="date"
				bind:value={sessionDate}
				class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
			/>
		</label>
		<label class="text-xs text-ink-muted">
			Aliases
			<input
				type="text"
				bind:value={aliases}
				class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
				placeholder="comma,separated,aliases"
			/>
		</label>
		<label class="text-xs text-ink-muted md:col-span-2">
			Tags
			<input
				type="text"
				bind:value={tags}
				class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
				placeholder="dm,session,quest"
			/>
		</label>
	</div>
</section>
