<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		navigationState,
		PRIMARY_SECTION_NAV_ITEMS,
		type PrimarySection,
	} from '$lib/state/navigation.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { mobileKeyboardState } from '$lib/state/mobile-keyboard.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { vaultMaturityState } from '$lib/state/vault-maturity.svelte.js';
	import SessionEndWorkflowDialog from '$lib/ui/session/SessionEndWorkflowDialog.svelte';
	import PrimaryNavIcon from './PrimaryNavIcon.svelte';

	interface Props {
		mode: 'expanded' | 'medium' | 'compact';
		onmediumactivesectiontap?: (section: PrimarySection) => void;
		onmediumsectionnavigate?: () => void;
	}

	let { mode, onmediumactivesectiontap, onmediumsectionnavigate }: Props = $props();

	function sectionHref(section: PrimarySection): string {
		if (section === 'knowledge') return resolve('/knowledge');
		if (section === 'atlas') return resolve('/atlas/maps');
		if (section === 'session') return resolve('/session/boards');
		if (section === 'campaign') return resolve('/campaign/timeline');
		return resolve('/settings');
	}

	const items = PRIMARY_SECTION_NAV_ITEMS.map((item) => ({
		...item,
		href: sectionHref(item.id),
	}));

	const compact = $derived(mode === 'compact');
	const iconOnly = $derived(mode === 'expanded' || mode === 'medium');
	const isVertical = $derived(!compact);
	const activeSessionBoardId = $derived(sessionModeState.activeSession?.sessionBoardId ?? null);
	const sessionNavPromoted = $derived(vaultMaturityState.disclosure.promoteSessionSection);
	const sessionCountBadge = $derived.by(() => {
		const count = vaultMaturityState.signals.sessionCount;
		if (count <= 0) return '';
		return count > 9 ? '9+' : String(count);
	});
	let showEndSessionFlow = $state(false);
	const shellStyle = $derived.by(() => {
		const width = isVertical ? 'var(--layout-rail-width)' : '100%';
		return compact
			? `width: ${width}; min-height: calc(var(--layout-bottomnav-height) + env(safe-area-inset-bottom));`
			: `width: ${width};`;
	});

	function handleSectionClick(event: MouseEvent, section: PrimarySection, active: boolean): void {
		if (mode !== 'medium') return;
		if (active) {
			event.preventDefault();
			onmediumactivesectiontap?.(section);
			return;
		}
		onmediumsectionnavigate?.();
	}
</script>

<div
	class="primary-nav-shell {compact ? 'mobile-bottom-nav' : ''} {isVertical
		? 'h-full border-r border-border'
		: 'fixed inset-x-0 bottom-0 z-30 border-t border-border'} {compact
		? 'bg-surface/95 pb-[calc(0.3rem+env(safe-area-inset-bottom))] pt-1 backdrop-blur-md'
		: 'bg-surface-alt'}"
	style={shellStyle}
	data-mode={mode}
	aria-hidden={compact && mobileKeyboardState.keyboardOpen ? 'true' : undefined}
>
	{#if playerModeState.enabled && isVertical}
		<div class="h-1 w-full bg-emerald-500/80" aria-hidden="true"></div>
	{/if}
	<nav
		class={compact
			? 'mx-auto grid w-full max-w-[560px] grid-cols-5 gap-1 px-2'
			: 'flex h-full flex-col gap-1 px-2 py-3'}
		aria-label="Primary"
	>
		{#each items as item (item.id)}
			{@const active = navigationState.activeSection === item.id}
			<div class={compact ? '' : 'space-y-1'}>
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					aria-label={item.label}
					class="primary-nav-item {compact
						? 'flex flex-col items-center justify-center rounded-md text-2xs font-medium'
						: 'flex items-center rounded-lg text-sm font-medium'}"
					data-active={active ? 'true' : 'false'}
					style="--primary-nav-active: {active ? 1 : 0}"
					onclick={(event) => handleSectionClick(event, item.id, active)}
				>
					<span
						class="primary-nav-icon relative flex h-8 w-8 items-center justify-center rounded-md"
					>
						<PrimaryNavIcon section={item.id} sizeClass="h-5 w-5" />
						{#if item.id === 'session' && sessionNavPromoted && sessionCountBadge}
							<span
								class="absolute -right-1 -top-1 min-w-4 rounded-full border border-surface bg-accent px-1 text-center text-2xs font-semibold leading-4 text-white"
							>
								{sessionCountBadge}
							</span>
						{/if}
						{#if item.id === 'session' && sessionModeState.isActive}
							<span class="session-active-ring" aria-hidden="true"></span>
						{/if}
					</span>
					{#if !iconOnly}
						<span class="{compact ? 'mt-0.5' : 'ml-2.5'} truncate">{item.label}</span>
					{/if}
					{#if compact}
						<span class="sr-only">{item.label}</span>
					{/if}
				</a>
				{#if item.id === 'session' && sessionModeState.isActive}
					<button
						type="button"
						class="touch-target-inline w-full rounded-md border border-border px-2 py-1 text-2xs text-ink-muted hover:bg-bg"
						onclick={() => (showEndSessionFlow = true)}
					>
						End Session
					</button>
				{/if}
			</div>
		{/each}
	</nav>
</div>

<SessionEndWorkflowDialog
	open={showEndSessionFlow}
	sessionboardid={activeSessionBoardId}
	onclose={() => (showEndSessionFlow = false)}
/>
