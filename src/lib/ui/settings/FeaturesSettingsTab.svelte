<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import Dialog from '$lib/ui/common/Dialog.svelte';
	import Toggle from '$lib/ui/common/Toggle.svelte';
	import { featureSettingsState } from '$lib/state/feature-settings.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import type { AdvancedFeatureId } from '$lib/types/settings.js';

	interface AdvancedFeatureDefinition {
		id: AdvancedFeatureId;
		label: string;
		description: string;
	}

	const ADVANCED_FEATURES: readonly AdvancedFeatureDefinition[] = [
		{
			id: 'mcp_staged_review',
			label: 'MCP Staged Review',
			description: 'Enables staged MCP write review controls and MCP review surfaces.',
		},
		{
			id: 'object_notes',
			label: 'Object Notes',
			description: 'Adds structured entity workflows for NPCs, factions, quests, and stat blocks.',
		},
		{
			id: 'encounter_builder',
			label: 'Encounter Builder',
			description: 'Enables encounter planning workflows and encounter route entry points.',
		},
		{
			id: 'knowledge_graph',
			label: 'Knowledge Graph',
			description: 'Shows graph-based navigation and relationship visualization surfaces.',
		},
		{
			id: 'timeline',
			label: 'Timeline',
			description: 'Enables campaign timeline navigation and timeline-focused route surfaces.',
		},
		{
			id: 'handout_delivery',
			label: 'Handout Delivery',
			description: 'Surfaces handout delivery and session-facing handout workflows.',
		},
		{
			id: 'custom_templates',
			label: 'Custom Templates',
			description: 'Enables expanded template customization and advanced template tooling.',
		},
		{
			id: 'theme_presets',
			label: 'Theme Presets',
			description: 'Enables expanded visual theme preset controls and theme-switching options.',
		},
		{
			id: 'random_tables',
			label: 'Random Tables',
			description: 'Surfaces advanced random-table workflows and related session controls.',
		},
		{
			id: 'inline_dice_rolls',
			label: 'Inline Dice Rolls',
			description: 'Enables inline dice roll parsing and execution inside note content.',
		},
	];

	let savingFeatureId = $state<AdvancedFeatureId | null>(null);
	let showingMcpOptInDialog = $state(false);
	let mcpOptInChecked = $state(false);
	let pendingMcpEnable = $state(false);

	onMount(() => {
		if (!featureSettingsState.loaded && !featureSettingsState.loading) {
			void featureSettingsState.loadFromStorage();
		}
	});

	async function setFeatureEnabled(featureId: AdvancedFeatureId, enabled: boolean): Promise<void> {
		savingFeatureId = featureId;
		try {
			await featureSettingsState.setAdvancedEnabled(featureId, enabled);
			toastState.success(`${enabled ? 'Enabled' : 'Disabled'} ${labelForFeature(featureId)}.`);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_FEATURE_TOGGLE_FAILED',
				error,
				context: { route: '/settings', featureId, enabled },
			});
			toastState.error(`Failed to update ${labelForFeature(featureId)}.`);
		} finally {
			savingFeatureId = null;
		}
	}

	function handleToggle(featureId: AdvancedFeatureId, enabled: boolean): void {
		if (
			featureId === 'mcp_staged_review' &&
			enabled &&
			!featureSettingsState.settings.mcpAccessAcknowledged
		) {
			pendingMcpEnable = true;
			mcpOptInChecked = false;
			showingMcpOptInDialog = true;
			return;
		}
		void setFeatureEnabled(featureId, enabled);
	}

	async function confirmMcpOptIn(): Promise<void> {
		if (!pendingMcpEnable || !mcpOptInChecked) return;
		savingFeatureId = 'mcp_staged_review';
		try {
			await featureSettingsState.setMcpAccessAcknowledged(true);
			await featureSettingsState.setAdvancedEnabled('mcp_staged_review', true);
			toastState.success('Enabled MCP Staged Review.');
			showingMcpOptInDialog = false;
			pendingMcpEnable = false;
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_MCP_OPT_IN_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error('Failed to enable MCP Staged Review.');
		} finally {
			savingFeatureId = null;
		}
	}

	function cancelMcpOptIn(): void {
		showingMcpOptInDialog = false;
		pendingMcpEnable = false;
		mcpOptInChecked = false;
	}

	function labelForFeature(featureId: AdvancedFeatureId): string {
		return ADVANCED_FEATURES.find((feature) => feature.id === featureId)?.label ?? featureId;
	}
</script>

<div
	role="tabpanel"
	id="settings-panel-features"
	aria-labelledby="settings-tab-features"
	class="space-y-8"
>
	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Advanced Features</h2>
		<p class="mb-3 text-xs text-ink-muted">
			Advanced features stay out of your primary workflow until explicitly enabled.
		</p>
		<div class="rounded-lg border border-border bg-surface divide-y divide-border">
			{#each ADVANCED_FEATURES as feature (feature.id)}
				<div class="p-4" data-feature-toggle-id={feature.id}>
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="text-sm font-medium text-ink">{feature.label}</p>
							<p class="mt-1 text-xs text-ink-muted">{feature.description}</p>
						</div>
						<Toggle
							label={featureSettingsState.settings.advanced[feature.id] ? 'On' : 'Off'}
							labelPosition="left"
							checked={featureSettingsState.settings.advanced[feature.id]}
							disabled={savingFeatureId === feature.id}
							onchange={(enabled) => handleToggle(feature.id, enabled)}
						/>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Discovery Prompts</h2>
		<div class="rounded-lg border border-border bg-surface p-4">
			<p class="text-sm text-ink">
				Contextual prompts dismissed in this vault: {featureSettingsState.settings.dismissedPrompts
					.length}
			</p>
			<p class="mt-1 text-xs text-ink-muted">
				Dismissed prompts will not reappear for this vault unless reset manually in data.
			</p>
		</div>
	</section>
</div>

<Dialog
	open={showingMcpOptInDialog}
	title="Enable MCP Staged Review"
	maxWidth="sm"
	onclose={cancelMcpOptIn}
>
	<p class="text-sm text-ink">
		MCP access allows an AI sidecar to read and propose staged edits to your vault. Keep staged
		review enabled unless you intentionally trust direct automation workflows.
	</p>
	<label class="mt-3 flex items-start gap-2 text-xs text-ink-muted">
		<input type="checkbox" bind:checked={mcpOptInChecked} />
		<span>I understand MCP can access vault content and propose staged changes.</span>
	</label>
	<div class="mt-4 flex justify-end gap-2">
		<Button variant="secondary" onclick={cancelMcpOptIn}>Cancel</Button>
		<Button
			variant="primary"
			onclick={() => void confirmMcpOptIn()}
			disabled={!mcpOptInChecked || savingFeatureId === 'mcp_staged_review'}
			loading={savingFeatureId === 'mcp_staged_review'}
		>
			Enable Feature
		</Button>
	</div>
</Dialog>
