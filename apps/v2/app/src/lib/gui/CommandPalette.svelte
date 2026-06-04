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

	const runtime = useRuntime();
	const profile = useProfile();

	let open = $state(false);
	let query = $state('');
	let inputs = $state<Record<string, string>>({});
	let status = $state<string | null>(null);
	let searchEl = $state<HTMLInputElement | null>(null);

	// The palette is the unified command surface (NAV-008): navigation, settings,
	// scene, action, and widget commands, all read from the same actor-filtered
	// availability API the primary nav and visible controls use (NAV-010). Core
	// commands dispatch the identical Processing Core command a visible control would;
	// navigation commands route. The list is filtered for the active "view as" actor.
	const commands = $derived(
		listPaletteCommands(runtime.state, runtime.activeActorId, { profileId: profile.profileId }),
	);
	const visible = $derived(searchPaletteCommands(commands, query));

	function show() {
		open = true;
		status = null;
	}

	function hide() {
		open = false;
		query = '';
	}

	function toggle() {
		if (open) hide();
		else show();
	}

	// Focus the search field when the palette opens so it is keyboard-usable.
	$effect(() => {
		if (open && searchEl) searchEl.focus();
	});

	// Global shortcut: Cmd/Ctrl+K opens the palette (also reachable via the header
	// button so touch profiles are not shortcut-only — NAV-008 is Mobile: yes).
	$effect(() => {
		function onKey(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				toggle();
			} else if (event.key === 'Escape' && open) {
				hide();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	async function run(command: PaletteCommand) {
		const resolved = resolvePaletteCommand(
			command,
			command.kind === 'core-command' && command.input
				? { [command.input.field]: inputs[command.id] ?? '' }
				: {},
		);
		if (!resolved) return;
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
	<!-- Lightweight modal: backdrop click and Escape close it; the dialog focuses the
	     search field on open and exposes each command as a focusable control. Escape is
	     also handled globally, so the keyboard dismissal path never depends on pointer.
	     On a compact profile the same palette renders as a full-screen sheet — the
	     equivalent command menu — exposing the identical commands (NAV-008 AC3). -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="palette-backdrop"
		class:compact={profile.isCompact}
		data-testid="command-palette-backdrop"
		onclick={hide}
	>
		<div
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
				placeholder="Search commands…"
				aria-label="Search commands"
				data-testid="palette-search"
				autocomplete="off"
			/>
			<ul class="palette-list" data-testid="palette-list">
				{#each visible as command (command.id)}
					{@const isAvailable = command.availability.status === 'available'}
					<li
						class="palette-item"
						data-testid={`palette-action-${command.id}`}
						data-category={command.category}
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
									oninput={(e) => (inputs = { ...inputs, [command.id]: e.currentTarget.value })}
								/>
							{/if}
							<button
								type="button"
								data-testid={`palette-run-${command.id}`}
								aria-label={`${command.kind === 'navigation' ? 'Go to' : 'Run'} ${command.title}`}
								disabled={!isAvailable}
								onclick={() => run(command)}
							>
								{command.kind === 'navigation' ? 'Go' : 'Run'}
							</button>
						</div>
					</li>
				{/each}
				{#if visible.length === 0}
					<li class="palette-empty" data-testid="palette-empty">No matching commands.</li>
				{/if}
			</ul>
			{#if status}
				<p class="palette-status" role="status" data-testid="palette-status">{status}</p>
			{/if}
		</div>
	</div>
{/if}
