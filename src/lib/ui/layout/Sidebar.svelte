<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import {
		AtlasLocalNavPanel,
		CampaignLocalNavPanel,
		KnowledgeLocalNavPanel,
		SessionLocalNavPanel,
		SettingsLocalNavPanel,
	} from '$lib/ui/sections/local-nav/index.js';

	interface Props {
		onnewnote: () => void;
		ondice: () => void;
		ontemplate: (folderOverride?: string) => void;
		onsetplayermode: (enabled: boolean) => void;
		presentation?: 'sidebar' | 'sheet';
	}

	let {
		onnewnote: _onnewnote,
		ondice,
		ontemplate: _ontemplate,
		onsetplayermode,
		presentation = 'sidebar',
	}: Props = $props();

	let activeSection = $derived(navigationState.activeSection);

	function reopenOnboarding(): void {
		void onboardingState.reopenChecklist();
		goto(resolve('/knowledge'));
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}
</script>

<aside
	class="h-full flex flex-col overflow-hidden border-r border-border bg-surface-alt dark:border-tavern-border dark:bg-tavern-surface
		{layoutState.isCompact && presentation === 'sidebar'
		? 'fixed inset-y-0 left-0 z-40 shadow-xl animate-slide-in'
		: ''}"
	style="width: {layoutState.isCompact && presentation === 'sidebar'
		? 'var(--layout-panel-width)'
		: presentation === 'sheet'
			? '100%'
			: `clamp(var(--layout-panel-width-narrow), ${ui.sidebarWidth}px, var(--layout-panel-width-wide))`}"
>
	{#if playerModeState.enabled}
		<div class="border-b border-border px-3 py-2 dark:border-tavern-border">
			<p
				class="rounded-md border border-emerald-300/60 bg-emerald-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/25 dark:text-emerald-200"
			>
				Player Mode Active
			</p>
		</div>
	{/if}

	<div class="sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
		{#if activeSection === 'knowledge'}
			<KnowledgeLocalNavPanel />
		{:else if activeSection === 'atlas'}
			<AtlasLocalNavPanel />
		{:else if activeSection === 'session'}
			<SessionLocalNavPanel {ondice} />
		{:else if activeSection === 'campaign'}
			<CampaignLocalNavPanel />
		{:else}
			<SettingsLocalNavPanel />
		{/if}
	</div>

	<div class="border-t border-border px-3 py-2 dark:border-tavern-border">
		<div
			class="mb-2 rounded-md border border-border p-1 dark:border-tavern-border"
			role="group"
			aria-label="Persona switcher"
		>
			<div class="grid grid-cols-2 gap-1">
				<button
					type="button"
					class="rounded-full px-2.5 py-1 text-xs font-semibold transition-[transform,colors] active:scale-[0.97] active:brightness-95 {playerModeState.enabled
						? 'border border-border text-ink-muted hover:bg-surface-alt dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-surface-alt'
						: 'bg-accent text-white dark:bg-tavern-accent dark:text-tavern-bg'}"
					aria-pressed={!playerModeState.enabled}
					onclick={() => onsetplayermode(false)}
				>
					DM
				</button>
				<button
					type="button"
					class="rounded-full px-2.5 py-1 text-xs font-semibold transition-[transform,colors] active:scale-[0.97] active:brightness-95 {playerModeState.enabled
						? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950'
						: 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30'}"
					aria-pressed={playerModeState.enabled}
					onclick={() => onsetplayermode(true)}
				>
					Player
				</button>
			</div>
		</div>
		<button
			type="button"
			class="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-ink-faint transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:text-ink-muted dark:text-tavern-faint dark:hover:text-tavern-muted"
			onclick={reopenOnboarding}
		>
			Onboarding
		</button>
	</div>
</aside>
