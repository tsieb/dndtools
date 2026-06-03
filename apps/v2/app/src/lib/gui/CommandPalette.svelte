<script lang="ts">
	import {
		listCommandActions,
		resolveCommandAction,
		searchCommandActions,
		type CommandAction,
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

	// The palette dispatches the same Processing Core commands the visible controls
	// dispatch (CMD-008): both read action descriptors from listCommandActions and
	// dispatch the command resolveCommandAction returns.
	const actions = $derived(
		listCommandActions(runtime.state, runtime.defaultActorId, { profileId: profile.profileId }),
	);
	const visible = $derived(searchCommandActions(actions, query));

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
	// button so touch profiles are not shortcut-only — CMD-008 is Mobile: yes).
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

	async function run(action: CommandAction) {
		const command = resolveCommandAction(action, action.input ? { [action.input.field]: inputs[action.id] ?? '' } : {});
		if (!command) return;
		const result = await runtime.dispatch({
			type: command.type,
			actorId: runtime.defaultActorId,
			payload: command.payload,
		});
		if (result.status === 'accepted') {
			status = `Ran: ${action.title}`;
			if (action.input) inputs = { ...inputs, [action.id]: '' };
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
	     search field on open and exposes each action as a focusable control. Escape is
	     also handled globally, so the keyboard dismissal path never depends on pointer. -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="palette-backdrop"
		data-testid="command-palette-backdrop"
		onclick={hide}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="palette"
			role="dialog"
			aria-modal="true"
			aria-label="Command palette"
			tabindex="-1"
			data-testid="command-palette"
			onclick={(e) => e.stopPropagation()}
		>
			<input
				bind:this={searchEl}
				bind:value={query}
				class="palette-search"
				type="text"
				placeholder="Search actions…"
				aria-label="Search actions"
				data-testid="palette-search"
				autocomplete="off"
			/>
			<ul class="palette-list" data-testid="palette-list">
				{#each visible as action (action.id)}
					{@const isAvailable = action.availability.status === 'available'}
					<li class="palette-item" data-testid={`palette-action-${action.id}`}>
						<div class="palette-item-main">
							<span class="palette-title">{action.title}</span>
							{#if !isAvailable && action.availability.status === 'unavailable'}
								<span class="palette-reason" data-testid={`palette-reason-${action.id}`}>
									{action.availability.reason}
								</span>
							{/if}
						</div>
						<div class="palette-item-actions">
							{#if isAvailable && action.input}
								<input
									class="palette-input"
									type="text"
									aria-label={action.input.label}
									placeholder={action.input.placeholder ?? action.input.label}
									data-testid={`palette-input-${action.id}`}
									value={inputs[action.id] ?? ''}
									oninput={(e) => (inputs = { ...inputs, [action.id]: e.currentTarget.value })}
								/>
							{/if}
							<button
								type="button"
								data-testid={`palette-run-${action.id}`}
								disabled={!isAvailable}
								onclick={() => run(action)}
							>
								Run
							</button>
						</div>
					</li>
				{/each}
				{#if visible.length === 0}
					<li class="palette-empty" data-testid="palette-empty">No matching actions.</li>
				{/if}
			</ul>
			{#if status}
				<p class="palette-status" role="status" data-testid="palette-status">{status}</p>
			{/if}
		</div>
	</div>
{/if}
