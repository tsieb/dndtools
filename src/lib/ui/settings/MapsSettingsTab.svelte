<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/ui/common/Button.svelte';
	import { vaultMaturityState } from '$lib/state/vault-maturity.svelte.js';

	function openAtlasMaps(): void {
		goto(resolve('/atlas/maps'));
	}
</script>

<div role="tabpanel" id="settings-panel-maps" aria-labelledby="settings-tab-maps" class="space-y-8">
	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Maps</h2>
		<div class="rounded-lg border border-border bg-surface p-4 space-y-3">
			<p class="text-sm text-ink">
				Map workflows are currently hidden from your core setup until you are ready to use them.
			</p>
			<p class="text-xs text-ink-muted">
				Once you add your first map, Atlas map controls become a regular part of your vault
				workflow.
			</p>
			<p class="text-xs text-ink-faint">
				Current map count: {vaultMaturityState.signals.mapCount}
			</p>
			<div class="pt-2">
				<Button variant="secondary" size="sm" onclick={openAtlasMaps}>Open Atlas Maps</Button>
			</div>
		</div>
	</section>
</div>
