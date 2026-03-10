<script lang="ts">
	import Dialog from '$lib/ui/common/Dialog.svelte';
	import Button from '$lib/ui/common/Button.svelte';

	type StarterChoice = 'empty-vault' | 'campaign-starter' | 'worldbuilding-starter';

	interface Props {
		suggestedVaultName?: string;
		loading?: boolean;
		onfinish: (payload: { vaultName: string; starter: StarterChoice; skipped: boolean }) => void;
	}

	let { suggestedVaultName = '', loading = false, onfinish }: Props = $props();

	const steps = ['Name your vault', 'Choose a starting point', "You're ready"] as const;

	let stepIndex = $state(0);
	let vaultName = $state(suggestedVaultName || 'My Campaign');
	let starter = $state<StarterChoice>('empty-vault');

	const canProceed = $derived.by(() => {
		if (stepIndex !== 0) return true;
		return vaultName.trim().length > 0;
	});

	function goNext(): void {
		if (!canProceed || stepIndex >= steps.length - 1) return;
		stepIndex += 1;
	}

	function goBack(): void {
		if (stepIndex <= 0) return;
		stepIndex -= 1;
	}

	function finish(skipped = false): void {
		onfinish({
			vaultName: vaultName.trim() || 'My Campaign',
			starter,
			skipped,
		});
	}

	const starterChoices: Array<{
		id: StarterChoice;
		title: string;
		description: string;
		details: string;
	}> = [
		{
			id: 'empty-vault',
			title: 'Empty vault',
			description: 'Start with a clean slate.',
			details: 'No starter notes are created.',
		},
		{
			id: 'campaign-starter',
			title: 'Campaign starter',
			description: 'Jump in with core linked campaign notes.',
			details: 'Creates overview, first session, and starter NPC/location notes.',
		},
		{
			id: 'worldbuilding-starter',
			title: 'Worldbuilding starter',
			description: 'Seed your setting with connected lore structure.',
			details: 'Creates world overview, factions, myth, geography, and timeline starter notes.',
		},
	];
</script>

<Dialog open={true} title="Welcome to DND Tools" onclose={() => finish(true)} maxWidth="xl">
	<div class="space-y-5">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<p class="text-sm text-ink-muted">
				Step {stepIndex + 1} of {steps.length}: {steps[stepIndex]}
			</p>
			<Button variant="ghost" size="sm" onclick={() => finish(true)} disabled={loading}>
				Skip setup
			</Button>
		</div>

		{#if stepIndex === 0}
			<section class="space-y-3">
				<h3 class="text-base font-semibold text-ink">Name your vault</h3>
				<p class="text-sm text-ink-muted">
					This is shown in onboarding surfaces and can be changed later.
				</p>
				<label class="block text-sm text-ink-muted">
					Vault name
					<input
						type="text"
						bind:value={vaultName}
						placeholder="My Campaign"
						class="mt-1 w-full rounded border border-border bg-surface-alt px-3 py-2 text-sm text-ink"
					/>
				</label>
			</section>
		{:else if stepIndex === 1}
			<section class="space-y-3">
				<h3 class="text-base font-semibold text-ink">Choose a starting point</h3>
				<p class="text-sm text-ink-muted">Pick a starter that matches how you want to begin.</p>
				<div class="grid gap-3 md:grid-cols-3">
					{#each starterChoices as choice (choice.id)}
						<button
							type="button"
							class="rounded-lg border p-4 text-left transition-colors {starter === choice.id
								? 'border-accent bg-accent-subtle/40'
								: 'border-border bg-surface hover:border-accent/35'}"
							onclick={() => (starter = choice.id)}
						>
							<p class="text-sm font-semibold text-ink">{choice.title}</p>
							<p class="mt-1 text-xs text-ink-muted">{choice.description}</p>
							<p class="mt-2 text-xs text-ink-faint">{choice.details}</p>
						</button>
					{/each}
				</div>
			</section>
		{:else}
			<section class="space-y-3">
				<h3 class="text-base font-semibold text-ink">You're ready</h3>
				<p class="text-sm text-ink-muted">
					We'll open your vault with this setup and start onboarding progress tracking.
				</p>
				<div class="rounded-lg border border-border bg-surface-alt/40 p-3 text-sm text-ink">
					<p><span class="font-medium">Vault:</span> {vaultName.trim() || 'My Campaign'}</p>
					<p class="mt-1">
						<span class="font-medium">Starter:</span>
						{starterChoices.find((choice) => choice.id === starter)?.title ?? 'Empty vault'}
					</p>
				</div>
			</section>
		{/if}

		<div class="flex items-center justify-between gap-2 pt-2">
			<Button variant="ghost" onclick={goBack} disabled={stepIndex === 0 || loading}>Back</Button>
			{#if stepIndex < steps.length - 1}
				<Button variant="primary" onclick={goNext} disabled={!canProceed || loading}>Next</Button>
			{:else}
				<Button variant="primary" onclick={() => finish(false)} {loading}>Open DND Tools</Button>
			{/if}
		</div>
	</div>
</Dialog>
