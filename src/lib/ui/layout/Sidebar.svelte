<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigationState, type PrimarySection } from '$lib/state/navigation.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { desktopShellState } from '$lib/state/desktop-shell.svelte.js';
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
		presentation?: 'sidebar' | 'sheet' | 'overlay';
	}

	let {
		onnewnote: _onnewnote,
		ondice,
		ontemplate: _ontemplate,
		onsetplayermode,
		presentation = 'sidebar',
	}: Props = $props();

	let activeSection = $derived(navigationState.activeSection);
	let scrollContainerEl = $state<HTMLElement | null>(null);
	let lastScrollSection = $state<PrimarySection | null>(null);
	const sidebarWidth = $derived(desktopShellState.getLocalPanelWidth(activeSection));

	function reopenOnboarding(): void {
		void onboardingState.reopenChecklist();
		goto(resolve('/knowledge'));
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}

	function handleSidebarScroll(event: Event): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		desktopShellState.rememberLocalPanelScroll(activeSection, target.scrollTop);
	}

	$effect(() => {
		const section = activeSection;
		const container = scrollContainerEl;
		if (!container) return;
		if (lastScrollSection && lastScrollSection !== section) {
			desktopShellState.rememberLocalPanelScroll(lastScrollSection, container.scrollTop);
		}
		lastScrollSection = section;
		void tick().then(() => {
			if (scrollContainerEl !== container) return;
			container.scrollTop = desktopShellState.getLocalPanelScroll(section);
		});
	});
</script>

<aside
	class="h-full flex flex-col overflow-hidden border-r border-border bg-surface-alt
		{layoutState.isCompact && presentation === 'sidebar'
		? 'fixed inset-y-0 left-0 z-40 shadow-xl animate-slide-in'
		: ''}"
	style="width: {layoutState.isCompact && presentation === 'sidebar'
		? 'var(--layout-panel-width)'
		: presentation === 'sheet'
			? '100%'
			: presentation === 'overlay'
				? 'var(--layout-detail-width)'
				: layoutState.isExpanded
					? `clamp(var(--layout-panel-width-narrow), ${sidebarWidth}px, var(--layout-panel-width-wide))`
					: 'var(--layout-panel-width)'}"
>
	{#if playerModeState.enabled}
		<div class="border-b border-border px-3 py-2">
			<p
				class="rounded-md border border-emerald-300/60 bg-emerald-50/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/25 dark:text-emerald-200"
			>
				Player Mode Active
			</p>
		</div>
	{/if}

	<div
		bind:this={scrollContainerEl}
		class="sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
		onscroll={handleSidebarScroll}
	>
		<div
			class={activeSection === 'knowledge' ? 'h-full' : 'hidden'}
			aria-hidden={activeSection !== 'knowledge'}
		>
			<KnowledgeLocalNavPanel />
		</div>
		<div
			class={activeSection === 'atlas' ? 'h-full' : 'hidden'}
			aria-hidden={activeSection !== 'atlas'}
		>
			<AtlasLocalNavPanel />
		</div>
		<div
			class={activeSection === 'session' ? 'h-full' : 'hidden'}
			aria-hidden={activeSection !== 'session'}
		>
			<SessionLocalNavPanel {ondice} />
		</div>
		<div
			class={activeSection === 'campaign' ? 'h-full' : 'hidden'}
			aria-hidden={activeSection !== 'campaign'}
		>
			<CampaignLocalNavPanel />
		</div>
		<div
			class={activeSection === 'settings' ? 'h-full' : 'hidden'}
			aria-hidden={activeSection !== 'settings'}
		>
			<SettingsLocalNavPanel />
		</div>
	</div>

	<div class="border-t border-border px-3 py-2">
		<div
			class="mb-2 rounded-md border border-border p-1"
			role="group"
			aria-label="Persona switcher"
		>
			<div class="grid grid-cols-2 gap-1">
				<button
					type="button"
					class="rounded-full px-2.5 py-1 text-xs font-semibold transition-[transform,colors] active:scale-[0.97] active:brightness-95 {playerModeState.enabled
						? 'border border-border text-ink-muted hover:bg-surface-alt'
						: 'bg-accent text-white'}"
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
			class="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-ink-faint transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:text-ink-muted"
			onclick={reopenOnboarding}
		>
			Onboarding
		</button>
	</div>
</aside>
