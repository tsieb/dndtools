<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		listPaletteCommands,
		resolvePaletteCommand,
		searchPaletteCommands,
		type PaletteCommand,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import { createFocusTrap, type FocusTrap } from '$lib/gui/a11y/focus-trap';
	import { shortcutHintForRoute, type ShortcutDescriptor } from '$lib/navigation/shortcuts';
	import type { NavEntry } from '$lib/platform/navigation-history';

	/**
	 * UX-NAV-014 — the command palette is the global keyboard/touch command surface.
	 *
	 * It is the unified, actor-filtered command surface (NAV-008/NAV-010): navigation, settings, scene,
	 * action, and widget commands, read from the SAME availability API the primary nav and visible controls
	 * use. A navigation command routes; a core command dispatches the IDENTICAL Processing Core command a
	 * visible control would. The list is filtered for the active "view as" actor, so a player never receives
	 * a DM-only entry (fail closed).
	 *
	 * This epic extends it into the full command surface: opening on `Ctrl/Cmd+K` (or the header button)
	 * focuses the field and shows RECENT destinations within a frame (AC1); results are keyboard-navigable
	 * with the arrow keys + Enter; a disabled result announces its reason instead of running (AC5); two-stage
	 * Escape clears the text first and then closes, restoring focus to the opener (AC3); the SAME palette
	 * renders as a full-screen sheet on a compact profile (AC4). Shortcut hints are surfaced inline from the
	 * actor-filtered shortcut registry (UX-NAV-019 AC2).
	 */
	interface Props {
		/** Actor-filtered recent destinations (device-local), shown before the user types (AC1). */
		recent?: NavEntry[];
		/** The actor-filtered keyboard shortcut registry, used to show a key hint on navigation rows. */
		shortcuts?: ShortcutDescriptor[];
	}
	const { recent = [], shortcuts = [] }: Props = $props();

	const runtime = useRuntime();
	const profile = useProfile();
	const announcer = useLiveAnnouncer();

	let open = $state(false);
	let query = $state('');
	let inputs = $state<Record<string, string>>({});
	let status = $state<string | null>(null);
	let activeIndex = $state(0);
	let searchEl = $state<HTMLInputElement | null>(null);
	let dialogEl = $state<HTMLElement | null>(null);

	const commands = $derived(
		listPaletteCommands(runtime.state, runtime.activeActorId, { profileId: profile.profileId }),
	);
	const visible = $derived(searchPaletteCommands(commands, query));
	const hasQuery = $derived(query.trim() !== '');

	// A flat, ordered row model so arrow-key navigation and Enter act on exactly what the user sees.
	// Recents lead on an empty query (AC1); command results follow, grouped by type for scannability.
	type Row =
		| { kind: 'recent'; id: string; title: string; route: string }
		| { kind: 'command'; id: string; command: PaletteCommand };

	const GROUP_ORDER = ['Navigate', 'Scenes', 'Act', 'Widgets', 'Notes', 'Maps', 'Settings'] as const;
	function groupLabel(category: PaletteCommand['category']): string {
		switch (category) {
			case 'navigation':
				return 'Navigate';
			case 'scene':
				return 'Scenes';
			case 'settings':
				return 'Settings';
			case 'widget':
				return 'Widgets';
			case 'note':
				return 'Notes';
			case 'map':
				return 'Maps';
			default:
				return 'Act';
		}
	}

	interface RowGroup {
		label: string;
		rows: Array<{ row: Row; index: number }>;
	}

	// The grouped rows AND a flat list sharing one index space, so the highlighted descendant and the
	// rendered order can never diverge.
	const model = $derived.by(() => {
		const groups: RowGroup[] = [];
		const flat: Row[] = [];
		const push = (label: string, row: Row) => {
			let group = groups.find((g) => g.label === label);
			if (!group) {
				group = { label, rows: [] };
				groups.push(group);
			}
			group.rows.push({ row, index: flat.length });
			flat.push(row);
		};
		if (!hasQuery) {
			for (const entry of recent) {
				push('Recent', { kind: 'recent', id: entry.route, title: entry.title, route: entry.route });
			}
		}
		// Stable group order; "Recent" (when present) always leads. Commands are bucketed by walking the
		// fixed group order and selecting the matching category each pass (no transient Map needed).
		for (const label of GROUP_ORDER) {
			for (const command of visible) {
				if (groupLabel(command.category) !== label) continue;
				push(label, { kind: 'command', id: command.id, command });
			}
		}
		return { groups, flat };
	});

	const clampedIndex = $derived(model.flat.length === 0 ? -1 : Math.min(activeIndex, model.flat.length - 1));
	const activeRow = $derived(clampedIndex >= 0 ? model.flat[clampedIndex] : null);

	function optionDomId(index: number): string {
		return `palette-option-${index}`;
	}

	function show() {
		open = true;
		status = null;
		activeIndex = 0;
	}

	function hide() {
		open = false;
		query = '';
		activeIndex = 0;
	}

	function toggle() {
		if (open) hide();
		else show();
	}

	// Reset the highlight to the first row whenever the query changes, so the user always starts at the
	// most relevant result.
	$effect(() => {
		void query;
		activeIndex = 0;
	});

	// UX-NAV-014 AC1 — `Ctrl/Cmd+K` opens from any context. Also reachable via the header button so touch
	// profiles are not shortcut-only (NAV-008 Mobile: yes). Escape is handled by the focus trap (two-stage).
	$effect(() => {
		function onKey(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				toggle();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// UX-A11Y-009 / AC3 — trap focus inside the palette, focus the field on open, and restore focus to the
	// opener on close. Escape is two-stage: clear the text first, then close.
	$effect(() => {
		if (!open || !dialogEl) return undefined;
		const instance: FocusTrap = createFocusTrap(dialogEl, {
			initialFocus: searchEl,
			onEscape: handleEscape,
		});
		instance.activate();
		return () => instance.deactivate();
	});

	function handleEscape() {
		// AC3 — first Escape clears any text; a second Escape (empty field) closes and restores focus.
		if (query.trim() !== '') {
			query = '';
			searchEl?.focus();
			return;
		}
		hide();
	}

	function move(delta: number) {
		if (model.flat.length === 0) return;
		activeIndex = (clampedIndex + delta + model.flat.length) % model.flat.length;
	}

	function onSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			move(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (activeRow) void activate(activeRow);
		}
	}

	async function activate(row: Row) {
		if (row.kind === 'recent') {
			hide();
			await goto(row.route);
			return;
		}
		await run(row.command);
	}

	async function run(command: PaletteCommand) {
		// AC5 — a disabled result never executes: announce the non-leaking reason and keep the palette open.
		if (command.availability.status !== 'available') {
			const reason =
				command.availability.status === 'unavailable'
					? command.availability.reason
					: 'That command is not available right now.';
			status = reason;
			announcer?.announce(`${command.title}: ${reason}`);
			return;
		}
		const resolved = resolvePaletteCommand(
			command,
			command.kind === 'core-command' && command.input
				? { [command.input.field]: inputs[command.id] ?? '' }
				: {},
		);
		if (!resolved) {
			status = 'Enter the required detail first.';
			return;
		}
		if (resolved.kind === 'navigate') {
			hide();
			await goto(resolved.route);
			return;
		}
		const result = await runtime.dispatch({
			...resolved.command,
			actorId: runtime.activeActorId,
		});
		if (result.status === 'accepted') {
			status = `Ran: ${command.title}`;
			if (command.kind === 'core-command' && command.input) {
				inputs = { ...inputs, [command.id]: '' };
			}
			hide();
		} else {
			status = `Could not run: ${result.rejection.message}`;
		}
	}

	function hintFor(row: Row): string | null {
		const route = row.kind === 'recent' ? row.route : row.command.kind === 'navigation' ? row.command.route : null;
		return route ? shortcutHintForRoute(shortcuts, route) : null;
	}
</script>

<button
	type="button"
	class="palette-trigger"
	data-testid="open-command-palette"
	aria-haspopup="dialog"
	aria-expanded={open}
	onclick={toggle}
>
	⌘K Actions
</button>

{#if open}
	<!-- Lightweight modal command surface. The dialog focuses the field on open and traps focus; backdrop
	     click and two-stage Escape close it, so the keyboard dismissal path never depends on a pointer. On a
	     compact profile the SAME palette renders as a full-screen sheet — the equivalent command menu — with
	     the identical input + result list (AC4). -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="palette-backdrop"
		class:compact={profile.isCompact}
		data-testid="command-palette-backdrop"
		onclick={hide}
	>
		<div
			bind:this={dialogEl}
			class="palette"
			class:compact={profile.isCompact}
			role="dialog"
			aria-modal="true"
			aria-label="Command palette"
			tabindex="-1"
			data-testid="command-palette"
			data-profile={profile.viewportClass}
			onclick={(e) => e.stopPropagation()}
		>
			<input
				bind:this={searchEl}
				bind:value={query}
				class="palette-search"
				type="text"
				placeholder="Search or type a command…"
				aria-label="Search or type a command"
				data-testid="palette-search"
				role="combobox"
				aria-expanded="true"
				aria-controls="command-palette-list"
				aria-autocomplete="list"
				aria-activedescendant={activeRow ? optionDomId(clampedIndex) : undefined}
				autocomplete="off"
				onkeydown={onSearchKeydown}
			/>
			<ul
				class="palette-list"
				id="command-palette-list"
				role="listbox"
				aria-label="Commands"
				data-testid="palette-list"
			>
				{#each model.groups as group (group.label)}
					<li class="palette-group" role="presentation" data-testid={`palette-group-${group.label}`}>
						{group.label}
					</li>
					{#each group.rows as { row, index } (row.kind + ':' + row.id)}
						{@const hint = hintFor(row)}
						{#if row.kind === 'recent'}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<li
								id={optionDomId(index)}
								class="palette-item"
								class:active={index === clampedIndex}
								role="option"
								aria-selected={index === clampedIndex}
								data-testid={`palette-recent-${row.route}`}
								data-category="recent"
								onmousemove={() => (activeIndex = index)}
								onclick={() => activate(row)}
							>
								<div class="palette-item-main">
									<span class="palette-title">{row.title}</span>
									<span class="palette-category" aria-hidden="true">recent</span>
								</div>
								{#if hint}
									<kbd class="palette-hint" data-testid={`palette-hint-${row.route}`}>{hint}</kbd>
								{/if}
							</li>
						{:else}
							{@const command = row.command}
							{@const isAvailable = command.availability.status === 'available'}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<li
								id={optionDomId(index)}
								class="palette-item"
								class:active={index === clampedIndex}
								role="option"
								aria-selected={index === clampedIndex}
								aria-disabled={!isAvailable}
								data-testid={`palette-action-${command.id}`}
								data-category={command.category}
								onmousemove={() => (activeIndex = index)}
								onclick={() => run(command)}
							>
								<div class="palette-item-main">
									<span class="palette-title">{command.title}</span>
									<span class="palette-category" aria-hidden="true">{command.category}</span>
									{#if !isAvailable && command.availability.status === 'unavailable'}
										<span class="palette-reason" data-testid={`palette-reason-${command.id}`}>
											{command.availability.reason}
										</span>
									{/if}
								</div>
								<div class="palette-item-actions">
									{#if isAvailable && command.kind === 'core-command' && command.input}
										<input
											class="palette-input"
											type="text"
											aria-label={command.input.label}
											placeholder={command.input.placeholder ?? command.input.label}
											data-testid={`palette-input-${command.id}`}
											value={inputs[command.id] ?? ''}
											onclick={(e) => e.stopPropagation()}
											oninput={(e) => (inputs = { ...inputs, [command.id]: e.currentTarget.value })}
										/>
									{/if}
									{#if hint}
										<kbd class="palette-hint" data-testid={`palette-hint-${command.id}`}>{hint}</kbd>
									{/if}
									<button
										type="button"
										data-testid={`palette-run-${command.id}`}
										aria-label={`${command.kind === 'navigation' ? 'Go to' : 'Run'} ${command.title}`}
										disabled={!isAvailable}
										onclick={(e) => {
											e.stopPropagation();
											run(command);
										}}
									>
										{command.kind === 'navigation' ? 'Go' : 'Run'}
									</button>
								</div>
							</li>
						{/if}
					{/each}
				{/each}
				{#if model.flat.length === 0}
					<li class="palette-empty" data-testid="palette-empty" role="presentation">
						No matching commands.
					</li>
				{/if}
			</ul>
			{#if status}
				<p class="palette-status" role="status" data-testid="palette-status">{status}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.palette-trigger {
		font: inherit;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--border, #cbd5e1);
		border-radius: 0.375rem;
		background: var(--surface, #fff);
		cursor: pointer;
	}

	.palette-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.45);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 12vh;
		z-index: 60;
	}

	.palette-backdrop.compact {
		padding: 0;
		align-items: stretch;
	}

	.palette {
		width: min(40rem, 92vw);
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		background: var(--surface, #fff);
		border-radius: 0.5rem;
		box-shadow: 0 12px 32px rgba(15, 23, 42, 0.35);
		overflow: hidden;
	}

	.palette.compact {
		width: 100vw;
		max-height: 100vh;
		border-radius: 0;
	}

	.palette-search {
		font: inherit;
		font-size: 1.05rem;
		padding: 0.85rem 1rem;
		border: none;
		border-bottom: 1px solid var(--border, #e2e8f0);
		outline-offset: -2px;
	}

	.palette-list {
		list-style: none;
		margin: 0;
		padding: 0.25rem;
		overflow-y: auto;
	}

	.palette-group {
		padding: 0.5rem 0.75rem 0.2rem;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted, #64748b);
	}

	.palette-item {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.palette-item.active {
		background: var(--accent-soft, #e0e7ff);
	}

	.palette-item[aria-disabled='true'] {
		cursor: default;
		opacity: 0.7;
	}

	.palette-item-main {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
	}

	.palette-title {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.palette-category {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--muted, #64748b);
	}

	.palette-reason {
		font-size: 0.75rem;
		color: var(--muted, #64748b);
	}

	.palette-item-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.palette-hint {
		font-size: 0.7rem;
		color: var(--muted, #64748b);
		border: 1px solid var(--border, #cbd5e1);
		border-radius: 0.3rem;
		padding: 0.05rem 0.3rem;
		white-space: nowrap;
	}

	.palette-input {
		font: inherit;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--border, #cbd5e1);
		border-radius: 0.3rem;
	}

	.palette-empty {
		padding: 0.75rem;
		color: var(--muted, #64748b);
	}

	.palette-status {
		margin: 0;
		padding: 0.5rem 1rem;
		border-top: 1px solid var(--border, #e2e8f0);
		font-size: 0.85rem;
	}
</style>
