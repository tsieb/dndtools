<script lang="ts">
	interface TocItem {
		id: string;
		text: string;
		level: number;
	}

	interface Props {
		content: string;
	}

	let { content }: Props = $props();
	let expanded = $state(true);

	let headings = $derived.by<TocItem[]>(() => {
		const items: TocItem[] = [];
		const lines = content.split('\n');
		for (const line of lines) {
			const match = line.match(/^(#{1,3})\s+(.+)$/);
			if (match && match[1] && match[2]) {
				const text = match[2]
					.replace(/[*_`~]/g, '')
					.replaceAll('[', '')
					.replaceAll(']', '');
				const id = text
					.toLowerCase()
					.replace(/[^a-z0-9\s-]/g, '')
					.replace(/\s+/g, '-');
				items.push({ id, text, level: match[1].length });
			}
		}
		return items;
	});
</script>

{#if headings.length > 2}
	<nav class="max-w-content mx-auto mb-6" aria-label="Contextual navigation: Table of contents">
		<button
			type="button"
			class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-faint hover:text-ink-muted transition-colors mb-2"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
			aria-controls="toc-list"
			title={expanded ? 'Collapse table of contents' : 'Expand table of contents'}
		>
			<span>{expanded ? '\u25BC' : '\u25B6'}</span>
			Contents
		</button>

		{#if expanded}
			<div id="toc-list" class="rounded-lg border border-border bg-surface-alt/50 px-4 py-3">
				<ul class="space-y-1">
					{#each headings as heading (heading.id)}
						<li style="padding-left: {(heading.level - 1) * 0.75}rem">
							<a
								href="#{heading.id}"
								class="text-sm text-ink-muted hover:text-accent transition-colors"
							>
								{heading.text}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</nav>
{/if}
