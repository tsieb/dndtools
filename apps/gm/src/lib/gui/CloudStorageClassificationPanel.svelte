<script lang="ts">
	import {
		CLOUD_SYNCABLE_CATEGORIES,
		DEVICE_LOCAL_CATEGORIES,
		evaluateCloudSyncGate,
	} from '@dndtools/core';

	/**
	 * SYNC-007 / SYNC-008 / SYNC-017 — the cloud/device-local storage INSPECTION surface. It renders
	 * the Processing-Core classification policy and the encryption-prerequisite enablement gate; it
	 * never reads raw storage and never flips any flag (Contract 1). Per ADR-014 the live cloud
	 * transport + real crypto are deferred — this surface is the seam a future transport plugs into,
	 * and it currently shows cloud sync as default-off with its security prerequisites unmet.
	 */

	// SYNC-017: the enablement gate. With the deferred-crypto default model, the gate blocks enable
	// and cloud sync is disabled by default. The GUI renders the unmet prerequisites; only the core
	// may consider cloud sync enabled.
	const gate = $derived(evaluateCloudSyncGate());

	// SYNC-007/008: the declared classification registry. Cloud-syncable categories are only eligible
	// when cloud sync is enabled for the vault; device-local categories never leave the device.
	const cloudCategories = CLOUD_SYNCABLE_CATEGORIES;
	const deviceLocalCategories = DEVICE_LOCAL_CATEGORIES;
</script>

<section class="cwrap" data-testid="cloud-storage-panel" aria-label="Cloud and device-local storage">
	<h2>Cloud &amp; device-local storage</h2>
	<p class="meta">
		What is eligible to sync to the cloud (only when cloud sync is enabled) and what always stays on
		this device. The classification fails closed: anything unrecognized stays device-local.
	</p>

	<!-- SYNC-017: the enablement gate. Default off; blocked until the release-approved encryption,
	     key custody, rotation, and recovery model is satisfied. -->
	<section aria-label="Cloud sync enablement">
		<h3>Cloud sync</h3>
		<p class="meta" data-testid="cloud-sync-gate-summary">{gate.summary}</p>
		<p class="meta">
			Status:
			<strong data-testid="cloud-sync-enabled">{gate.enabled ? 'enabled' : 'disabled'}</strong> •
			can enable:
			<strong data-testid="cloud-sync-can-enable">{gate.canEnable ? 'yes' : 'no'}</strong>
		</p>
		<h4>Encryption &amp; key prerequisites</h4>
		<ul class="scene-list" data-testid="cloud-sync-prerequisites">
			{#each gate.prerequisites as prerequisite (prerequisite.id)}
				<li class="scene-card" data-testid={`cloud-sync-prereq-${prerequisite.id}`}>
					<div>
						<strong>{prerequisite.label}</strong>
						<!-- key-recovery: always show detail even when met — AC3 requires the app to report
						     the approved recovery limitation (including "unsupported-by-design") whenever
						     it is relevant, not only when the prerequisite is unmet. -->
						{#if !prerequisite.met || prerequisite.id === 'key-recovery'}
							<div class="meta">{prerequisite.detail}</div>
						{/if}
					</div>
					<span class="meta" class:unavailable={!prerequisite.met}>
						{prerequisite.met ? 'met' : 'unmet'}
					</span>
				</li>
			{/each}
		</ul>
	</section>

	<section aria-label="Cloud-syncable categories">
		<h3>Cloud-syncable (only when cloud sync is enabled)</h3>
		<ul class="scene-list" data-testid="cloud-syncable-categories">
			{#each cloudCategories as category (category)}
				<li class="scene-card" data-testid={`cloud-category-${category}`}>
					<strong>{category}</strong>
					<span class="meta">cloud-syncable</span>
				</li>
			{/each}
		</ul>
	</section>

	<section aria-label="Device-local categories">
		<h3>Device-local (never leaves this device unless you export it)</h3>
		<ul class="scene-list" data-testid="device-local-categories">
			{#each deviceLocalCategories as category (category)}
				<li class="scene-card" data-testid={`device-local-category-${category}`}>
					<strong>{category}</strong>
					<span class="meta unavailable">device-local</span>
				</li>
			{/each}
		</ul>
	</section>
</section>

<style>
	/* CANONICAL secondary card recipe. */
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		box-shadow: var(--shadow-sm);
	}
	.cwrap h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-lg);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	.cwrap :global(h3) {
		margin: 0 0 var(--space-1);
		font-size: var(--text-md);
	}
	.cwrap :global(h4) {
		margin: var(--space-2) 0 var(--space-1);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.cwrap :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.cwrap :global(.scene-list) {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}
	.cwrap :global(.scene-card) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.cwrap :global(.unavailable) {
		color: var(--color-status-warning-text);
		font-weight: var(--font-weight-semibold);
	}
</style>
