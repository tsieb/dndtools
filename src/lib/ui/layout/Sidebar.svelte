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
	import Toggle from '$lib/ui/common/Toggle.svelte';
	import Button from '$lib/ui/common/Button.svelte';

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

	<div class="border-t border-border px-3 py-2 flex flex-col gap-1.5">
		<Toggle
			checked={playerModeState.enabled}
			label="Player Mode"
			onchange={(enabled) => onsetplayermode(enabled)}
		/>
		<Button
			variant="ghost"
			size="sm"
			onclick={reopenOnboarding}
			class="w-full justify-start text-ink-faint"
		>
			Onboarding
		</Button>
	</div>
</aside>
