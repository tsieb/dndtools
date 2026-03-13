<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';

	export type EmptyStateIllustration =
		| 'knowledge-empty'
		| 'knowledge-folder'
		| 'knowledge-search'
		| 'session'
		| 'session-board-empty'
		| 'session-combat'
		| 'session-tables'
		| 'atlas'
		| 'campaign'
		| 'graph'
		| 'timeline'
		| 'generic';

	interface EmptyStateAction {
		label: string;
		onclick: () => void | Promise<void>;
		disabled?: boolean;
		ariaLabel?: string;
		title?: string;
	}

	interface Props {
		illustration?: EmptyStateIllustration;
		illustrationSlot?: Snippet;
		headline: string;
		body?: string;
		primaryAction: EmptyStateAction;
		secondaryAction?: EmptyStateAction;
		ariaLabel?: string;
		class?: string;
		children?: Snippet;
	}

	let {
		illustration = 'generic',
		illustrationSlot,
		headline,
		body,
		primaryAction,
		secondaryAction,
		ariaLabel,
		class: extraClass,
		children,
	}: Props = $props();

	function handleAction(action: EmptyStateAction): void {
		void action.onclick();
	}
</script>

<section
	role="status"
	aria-label={ariaLabel ?? headline}
	class="flex min-h-[20rem] w-full items-center justify-center px-4 py-8 text-center {extraClass ??
		''}"
>
	<div class="w-full max-w-xl space-y-5">
		<div class="flex justify-center">
			<div class="rounded-xl border border-accent/25 bg-accent-subtle/45 p-3 text-accent">
				{#if illustrationSlot}
					{@render illustrationSlot()}
				{:else if illustration === 'knowledge-empty'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<rect x="12" y="10" width="40" height="44" rx="6"></rect>
						<path d="M20 22h24M20 30h16M20 38h20"></path>
						<path d="M44 44l4 4M48 44l-4 4"></path>
					</svg>
				{:else if illustration === 'knowledge-folder'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M10 20h18l4 5h22v25a5 5 0 0 1-5 5H15a5 5 0 0 1-5-5V20z"></path>
						<path d="M10 20v-5a5 5 0 0 1 5-5h13l4 5h17a5 5 0 0 1 5 5"></path>
						<path d="M24 37h16"></path>
					</svg>
				{:else if illustration === 'knowledge-search'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="28" cy="28" r="14"></circle>
						<path d="M38 38l12 12"></path>
						<path d="M24 28h8"></path>
					</svg>
				{:else if illustration === 'session'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<rect x="10" y="12" width="44" height="40" rx="6"></rect>
						<path d="M10 24h44M22 8v8M42 8v8"></path>
						<circle cx="32" cy="38" r="6"></circle>
						<path d="M32 34v4l3 2"></path>
					</svg>
				{:else if illustration === 'session-board-empty'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<rect x="9" y="10" width="46" height="44" rx="6"></rect>
						<path d="M9 23h46M24 10v44M39 10v44"></path>
						<path d="M20 31h8M20 39h8M44 31h8M44 39h8"></path>
					</svg>
				{:else if illustration === 'session-combat'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="32" cy="32" r="20"></circle>
						<path d="M24 24l16 16M40 24L24 40"></path>
					</svg>
				{:else if illustration === 'session-tables'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<rect x="10" y="12" width="44" height="40" rx="4"></rect>
						<path d="M10 24h44M10 36h44M24 12v40M40 12v40"></path>
					</svg>
				{:else if illustration === 'atlas'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M10 16l14-4 16 4 14-4v36l-14 4-16-4-14 4V16z"></path>
						<path d="M24 12v36M40 16v36"></path>
						<circle cx="32" cy="28" r="4"></circle>
					</svg>
				{:else if illustration === 'campaign'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="22" cy="24" r="8"></circle>
						<circle cx="42" cy="24" r="8"></circle>
						<path d="M12 48c0-6 5-10 10-10s10 4 10 10M32 48c0-6 5-10 10-10s10 4 10 10"></path>
					</svg>
				{:else if illustration === 'graph'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="14" cy="20" r="4"></circle>
						<circle cx="32" cy="12" r="4"></circle>
						<circle cx="50" cy="24" r="4"></circle>
						<circle cx="22" cy="46" r="4"></circle>
						<circle cx="46" cy="48" r="4"></circle>
						<path d="M18 19l10-5M36 13l10 9M17 23l4 19M25 44l17 3"></path>
					</svg>
				{:else if illustration === 'timeline'}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M10 32h44"></path>
						<circle cx="18" cy="32" r="4"></circle>
						<circle cx="32" cy="32" r="4"></circle>
						<circle cx="46" cy="32" r="4"></circle>
						<path d="M18 20v8M32 16v12M46 22v6"></path>
					</svg>
				{:else}
					<svg
						viewBox="0 0 64 64"
						class="h-14 w-14"
						fill="none"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						aria-hidden="true"
					>
						<rect x="12" y="12" width="40" height="40" rx="8"></rect>
						<path d="M24 32h16"></path>
					</svg>
				{/if}
			</div>
		</div>

		<div class="space-y-2">
			<h2 class="text-xl font-semibold text-ink" style="font-family: var(--font-serif)">
				{headline}
			</h2>
			{#if body}
				<p class="mx-auto max-w-lg text-sm text-ink-muted">{body}</p>
			{/if}
		</div>

		<div class="flex flex-wrap items-center justify-center gap-2">
			<Button
				variant="primary"
				onclick={() => handleAction(primaryAction)}
				disabled={primaryAction.disabled}
				ariaLabel={primaryAction.ariaLabel}
				title={primaryAction.title}
			>
				{primaryAction.label}
			</Button>
			{#if secondaryAction}
				<Button
					variant="ghost"
					onclick={() => handleAction(secondaryAction)}
					disabled={secondaryAction.disabled}
					ariaLabel={secondaryAction.ariaLabel}
					title={secondaryAction.title}
				>
					{secondaryAction.label}
				</Button>
			{/if}
		</div>

		{#if children}
			<div class="mx-auto max-w-lg text-left text-sm text-ink-muted">
				{@render children()}
			</div>
		{/if}
	</div>
</section>
