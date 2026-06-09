<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		buildQuickSwitcher,
		parseQuickSwitcherQuery,
		resolveQuickSwitcherEntry,
		type QuickSwitcherEntry,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';

	const runtime = useRuntime();
	const profile = useProfile();

	let open = $state(false);
	let query = $state('');
	let activeIndex = $state(0);
	let inputs = $state<Record<string, string>>({});
	let status = $state<string | null>(null);
	let searchEl = $state<HTMLInputElement | null>(null);

	// SRCH-002 — the QUICK SWITCHER is a title-first navigation + command palette. It COMPOSES the
	// Processing Core's two actor-filtered surfaces: the visible search index (navigation hits) and the
	// command-availability surface (eligible commands). The core owns ranking + command eligibility; this
	// GUI only renders the computed entries and either navigates or dispatches the SAME command a visible
	// control would (Architecture Contract 1). The list is recomputed for the active "view as" actor and the
	// current query on every keystroke, so a player never even receives a DM-only/hidden entry (fail closed).
	const entries = $derived(
		buildQuickSwitcher(
			runtime.state,
			runtime.activeActorId,
			{ profileId: profile.profileId },
			query,
		),
	);

	// SRCH-005 — a leading `>` switches to command mode (the core lists only commands). The parsed mode
	// drives the section caption: "Recent" before the user types, "Commands" in command mode, else "Results".
	const parsed = $derived(parseQuickSwitcherQuery(query));
	const sectionLabel = $derived(
		query.trim() === '' ? 'Recent' : parsed.commandMode ? 'Commands' : 'Results',
	);

	// SRCH-002 AC2 — the active selection is derived from the CURRENT entry list, never a remembered index.
	// When the query changes the list (and this clamp) recomputes, so Enter always acts on the entry the
	// user currently sees highlighted — a stale selection can never be executed.
	const clampedIndex = $derived(entries.length === 0 ? -1 : Math.min(activeIndex, entries.length - 1));
	const activeEntry = $derived(clampedIndex >= 0 ? entries[clampedIndex] : null);

	function entryDomId(index: number): string {
		return `quick-switcher-option-${index}`;
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

	// Reset the highlight to the first result whenever the query changes, so the user always starts at the
	// most relevant (title-first) entry.
	$effect(() => {
		void query;
		activeIndex = 0;
	});

	// Focus the search field when the switcher opens so it is immediately keyboard-usable.
	$effect(() => {
		if (open && searchEl) searchEl.focus();
	});

	// UX-SRCH-005 — `Cmd/Ctrl+O` opens the quick switcher (distinct from the command palette's `Cmd/Ctrl+K`
	// and global search's `Cmd/Ctrl+Shift+F`). Also reachable via the header button so touch profiles are
	// not shortcut-only (SRCH-005 is Mobile: yes).
	$effect(() => {
		function onKey(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'o') {
				event.preventDefault();
				toggle();
			} else if (event.key === 'Escape' && open) {
				event.preventDefault();
				hide();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function move(delta: number) {
		if (entries.length === 0) return;
		const next = (clampedIndex + delta + entries.length) % entries.length;
		activeIndex = next;
	}

	// Keyboard operation within the input: Down/Up move the highlight, Enter runs the CURRENT entry, Escape
	// closes. The whole switcher is operable without a pointer.
	function onSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			move(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (activeEntry) void run(activeEntry);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			hide();
		}
	}

	async function run(entry: QuickSwitcherEntry) {
		// SRCH-002 AC2 — resolve from the entry the user is acting on RIGHT NOW. A command entry re-checks
		// availability + required inputs in the core, so a now-ineligible selection resolves to null and
		// never dispatches (fail closed). A navigation entry resolves to its route.
		const input =
			entry.kind === 'command' && entry.command.kind === 'core-command' && entry.command.input
				? { [entry.command.input.field]: inputs[entry.id] ?? '' }
				: {};
		const resolved = resolveQuickSwitcherEntry(entry, input);
		if (!resolved) {
			status = 'That item is not available.';
			return;
		}
		if (resolved.kind === 'navigate') {
			hide();
			await goto(resolved.route);
			return;
		}
		// A palette command: either navigate (nav/scene command) or dispatch the identical core command.
		if (resolved.resolved.kind === 'navigate') {
			hide();
			await goto(resolved.resolved.route);
			return;
		}
		const result = await runtime.dispatch({
			...resolved.resolved.command,
			actorId: runtime.activeActorId,
		});
		if (result.status === 'accepted') {
			status = `Ran: ${entry.title}`;
			if (entry.kind === 'command' && entry.command.kind === 'core-command' && entry.command.input) {
				inputs = { ...inputs, [entry.id]: '' };
			}
			hide();
		} else {
			status = `Could not run: ${result.rejection.message}`;
		}
	}
</script>

<button
	type="button"
	class="switcher-trigger"
	data-testid="open-quick-switcher"
	aria-haspopup="dialog"
	aria-expanded={open}
	onclick={toggle}
>
	⌘O Go to
</button>

{#if open}
	<!-- A lightweight modal combobox. The dialog focuses the search field on open; the field owns the
	     listbox via aria-controls/aria-activedescendant so arrow-key navigation is announced. Backdrop
	     click and Escape (locally + globally) close it, so the keyboard dismissal path never needs a
	     pointer. On a compact profile the same switcher renders as a full-screen sheet (SRCH-002 Mobile: yes). -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="switcher-backdrop"
		class:compact={profile.isCompact}
		data-testid="quick-switcher-backdrop"
		onclick={hide}
	>
		<div
			class="switcher"
			class:compact={profile.isCompact}
			role="dialog"
			aria-modal="true"
			aria-label="Quick switcher"
			tabindex="-1"
			data-testid="quick-switcher"
			data-profile={profile.viewportClass}
			onclick={(e) => e.stopPropagation()}
		>
			<input
				bind:this={searchEl}
				bind:value={query}
				class="switcher-search"
				type="text"
				placeholder="Go to note, map, character…  (›  for commands)"
				aria-label="Search content and commands"
				data-testid="quick-switcher-search"
				role="combobox"
				aria-expanded="true"
				aria-controls="quick-switcher-list"
				aria-autocomplete="list"
				aria-activedescendant={activeEntry ? entryDomId(clampedIndex) : undefined}
				autocomplete="off"
				onkeydown={onSearchKeydown}
			/>
			<!-- SRCH-005 — the pre-query state lists the recent destinations under a "Recent" caption; a `›`
			     query switches the caption to "Commands" (command mode), otherwise "Results". -->
			<p class="switcher-section" data-testid="quick-switcher-section" aria-hidden="true">
				{sectionLabel}
			</p>
			<ul
				class="switcher-list"
				id="quick-switcher-list"
				role="listbox"
				aria-label="Results"
				data-testid="quick-switcher-list"
			>
				{#each entries as entry, index (entry.id)}
					{@const isCommand = entry.kind === 'command'}
					{@const unavailable =
						isCommand &&
						entry.kind === 'command' &&
						entry.command.availability.status === 'unavailable'}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id={entryDomId(index)}
						class="switcher-item"
						class:active={index === clampedIndex}
						role="option"
						aria-selected={index === clampedIndex}
						data-testid={`quick-switcher-option-${entry.id}`}
						data-kind={entry.kind}
						onmousemove={() => (activeIndex = index)}
						onclick={() => run(entry)}
					>
						<div class="switcher-item-main">
							<span class="switcher-title">{entry.title}</span>
							<span class="switcher-tag" aria-hidden="true">
								{entry.kind === 'navigation' ? entry.contentType : 'command'}
							</span>
							{#if unavailable && entry.kind === 'command' && entry.command.availability.status === 'unavailable'}
								<span
									class="switcher-reason"
									data-testid={`quick-switcher-reason-${entry.id}`}
								>
									{entry.command.availability.reason}
								</span>
							{/if}
						</div>
						{#if entry.kind === 'command' && entry.command.kind === 'core-command' && entry.command.input && !unavailable}
							<input
								class="switcher-input"
								type="text"
								aria-label={entry.command.input.label}
								placeholder={entry.command.input.placeholder ?? entry.command.input.label}
								data-testid={`quick-switcher-input-${entry.id}`}
								value={inputs[entry.id] ?? ''}
								onclick={(e) => e.stopPropagation()}
								oninput={(e) => (inputs = { ...inputs, [entry.id]: e.currentTarget.value })}
							/>
						{/if}
					</li>
				{/each}
				{#if entries.length === 0}
					<li class="switcher-empty" data-testid="quick-switcher-empty" role="presentation">
						No matching content or commands.
					</li>
				{/if}
			</ul>
			{#if status}
				<p class="switcher-status" role="status" data-testid="quick-switcher-status">{status}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.switcher-trigger {
		font: inherit;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--border, #cbd5e1);
		border-radius: 0.375rem;
		background: var(--surface, #fff);
		cursor: pointer;
	}

	.switcher-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.45);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 12vh;
		z-index: 60;
	}

	.switcher-backdrop.compact {
		padding: 0;
		align-items: stretch;
	}

	.switcher {
		width: min(40rem, 92vw);
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		background: var(--surface, #fff);
		border-radius: 0.5rem;
		box-shadow: 0 12px 32px rgba(15, 23, 42, 0.35);
		overflow: hidden;
	}

	.switcher.compact {
		width: 100vw;
		max-height: 100vh;
		border-radius: 0;
	}

	.switcher-search {
		font: inherit;
		font-size: 1.05rem;
		padding: 0.85rem 1rem;
		border: none;
		border-bottom: 1px solid var(--border, #e2e8f0);
		outline-offset: -2px;
	}

	.switcher-section {
		margin: 0;
		padding: 0.45rem 0.85rem 0.1rem;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted, #64748b);
	}

	.switcher-list {
		list-style: none;
		margin: 0;
		padding: 0.25rem;
		overflow-y: auto;
	}

	.switcher-item {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.switcher-item.active {
		background: var(--accent-soft, #e0e7ff);
	}

	.switcher-item-main {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
	}

	.switcher-title {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.switcher-tag {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--muted, #64748b);
	}

	.switcher-reason {
		font-size: 0.75rem;
		color: var(--muted, #64748b);
	}

	.switcher-input {
		font: inherit;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--border, #cbd5e1);
		border-radius: 0.3rem;
	}

	.switcher-empty {
		padding: 0.75rem;
		color: var(--muted, #64748b);
	}

	.switcher-status {
		margin: 0;
		padding: 0.5rem 1rem;
		border-top: 1px solid var(--border, #e2e8f0);
		font-size: 0.85rem;
	}
</style>
