<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getWhatsNewReleaseForVersion } from '$lib/domain/whats-new.js';
	import { navigationState, type PrimarySection } from '$lib/state/navigation.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import packageJson from '../../../../package.json';
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
		onopenkeyboardshortcuts: () => void;
		presentation?: 'sidebar' | 'sheet' | 'overlay';
	}

	let {
		onnewnote: _onnewnote,
		ondice,
		ontemplate: _ontemplate,
		onsetplayermode,
		onopenkeyboardshortcuts,
		presentation = 'sidebar',
	}: Props = $props();

	let activeSection = $derived(navigationState.activeSection);
	let scrollContainerEl = $state<HTMLElement | null>(null);
	let lastScrollSection = $state<PrimarySection | null>(null);
	const sidebarWidth = $derived(desktopShellState.getLocalPanelWidth(activeSection));
	const hasWhatsNewRelease = $derived(!!getWhatsNewReleaseForVersion(packageJson.version));
	const showWhatsNewBadge = $derived(
		hasWhatsNewRelease && onboardingState.hasUnseenWhatsNew(packageJson.version),
	);

	function openGettingStarted(): void {
		goto(`${resolve('/knowledge')}?panel=getting-started`);
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}

	function openWhatsNew(): void {
		void onboardingState.markWhatsNewSeen(packageJson.version);
		goto(`${resolve('/knowledge')}?panel=whats-new`);
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}

	function openAbout(): void {
		goto(`${resolve('/settings')}?tab=about`);
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}

	function reportBug(): void {
		if (typeof window === 'undefined') return;
		window.open('https://github.com/anthropics/dndtools/issues', '_blank', 'noopener,noreferrer');
	}

	function openKeyboardShortcuts(): void {
		onopenkeyboardshortcuts();
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
		<p class="px-1 text-2xs font-semibold uppercase tracking-wider text-ink-faint">Help</p>
		<Button variant="ghost" size="sm" onclick={openKeyboardShortcuts} class="w-full justify-start">
			Keyboard shortcuts
		</Button>
		<Button variant="ghost" size="sm" onclick={openGettingStarted} class="w-full justify-start">
			Getting started
		</Button>
		{#if hasWhatsNewRelease}
			<Button variant="ghost" size="sm" onclick={openWhatsNew} class="w-full justify-between">
				<span>What's new</span>
				{#if showWhatsNewBadge}
					<span
						class="inline-flex items-center rounded-full bg-accent-subtle px-1.5 py-0.5 text-2xs font-semibold text-accent"
					>
						New
					</span>
				{/if}
			</Button>
		{/if}
		<Button variant="ghost" size="sm" onclick={reportBug} class="w-full justify-start">
			Report a bug
		</Button>
		<Button variant="ghost" size="sm" onclick={openAbout} class="w-full justify-start">
			About DND Tools
		</Button>
		<div class="pt-1">
			<Toggle
				checked={playerModeState.enabled}
				label="Player Mode"
				onchange={(enabled) => onsetplayermode(enabled)}
			/>
		</div>
	</div>
</aside>
