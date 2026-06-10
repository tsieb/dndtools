<script lang="ts">
	import { tick } from 'svelte';
	import {
		CLOSED_CONTROL_INTERACTION,
		controlInteractionReducer,
		isControlOpen,
		type ControlInteractionEvent,
		type ControlInteractionState,
		type MapRegion,
	} from '@dndtools/core';
	import { SvelteMap } from 'svelte/reactivity';
	import { useProfile } from '$lib/platform/platform-profile.svelte';

	/**
	 * MAP-015 — the POI interaction-safety surface.
	 *
	 * Each POI exposes a popover (expanded profile) or a long-press-style sheet (compact
	 * profile) carrying action buttons. The DISMISSAL POLICY is NOT decided here: this
	 * component only translates DOM events into raw {@link ControlInteractionEvent} intents,
	 * folds them through the Processing-Core {@link controlInteractionReducer}, and renders
	 * the result + applies the returned focus directive (Contract 1, Processing/Display
	 * Decoupling). The core decides whether the control stays engaged; the view reflects it.
	 *
	 * Consequences the core guarantees and this view must honor (MAP-015):
	 *  - moving the pointer from the marker into the popover, hover-out, scrolling the map,
	 *    pressing an action inside, or focus landing on a child action NEVER dismiss.
	 *  - only an explicit Close, Escape, a true outside pointerdown, or selecting another POI
	 *    dismiss.
	 *  - focus moves into the control on open and is restored to the trigger on a genuine
	 *    dismiss; it is left untouched for every internal interaction.
	 */
	interface Props {
		mapId: string;
		regions: MapRegion[];
		/** Notify the host that a region was chosen as the viewport focus (a real action
		 *  dispatched from inside the control — used to prove inside interaction works). */
		onfocusregion?: (regionId: string) => void;
	}
	const { mapId, regions, onfocusregion }: Props = $props();
	const profile = useProfile();

	const presentation = $derived<'popover' | 'sheet'>(profile.isCompact ? 'sheet' : 'popover');

	// The single source of truth for which control is open. The reducer owns the transitions;
	// this component only dispatches intents into it.
	let interaction = $state<ControlInteractionState>(CLOSED_CONTROL_INTERACTION);

	// The trigger that opened the active control, so focus can be restored to it on dismiss.
	const triggerEls = new SvelteMap<string, HTMLButtonElement>();
	let controlEl = $state<HTMLElement | null>(null);
	let restoreFocusTo: HTMLElement | null = null;

	function registerTrigger(node: HTMLButtonElement, regionId: string) {
		triggerEls.set(regionId, node);
		return {
			destroy() {
				triggerEls.delete(regionId);
			},
		};
	}

	/** Dispatch one raw intent into the core reducer and apply the resulting focus directive.
	 *  Applying focus is a DOM concern (GUI), but WHICH directive applies is the core's. */
	function dispatch(event: ControlInteractionEvent) {
		const previousActive = interaction.activeControlId;
		const next = controlInteractionReducer(interaction, event);
		interaction = next;
		if (next.focusDirective === 'restore') {
			const target = restoreFocusTo;
			restoreFocusTo = null;
			target?.focus();
		} else if (next.focusDirective === 'into-control') {
			// On a fresh open (or a switch to a different control), record the trigger to restore
			// focus to on dismiss, then move focus into the control once its DOM has rendered.
			if (previousActive !== next.activeControlId) {
				restoreFocusTo = next.activeControlId
					? (triggerEls.get(next.activeControlId) ?? null)
					: null;
			}
			const targetId = next.activeControlId;
			// `tick()` guarantees the control's DOM is flushed before we query it for a focusable
			// element, so the open never races the render (a microtask would not be enough).
			void tick().then(() => {
				if (!isControlOpen(interaction, targetId ?? '')) return;
				controlEl?.querySelector<HTMLElement>('button, [href], [tabindex]')?.focus();
			});
		}
	}

	function openControl(regionId: string) {
		dispatch({ type: 'open', controlId: regionId, presentation });
	}

	function closeControl() {
		dispatch({ type: 'close' });
	}

	function focusRegion(regionId: string) {
		// A genuine action dispatched from INSIDE the control. It does NOT dismiss the control
		// (no dismiss intent is sent); the host is notified and the control stays open.
		onfocusregion?.(regionId);
	}

	// Outside pointerdown vs inside: the only place the GUI computes `inside` (via contains).
	// The core decides what that means. Registered only while a control is open and torn down
	// on close, so nothing lingers to dismiss a future control.
	let listEl = $state<HTMLElement | null>(null);

	$effect(() => {
		if (interaction.phase !== 'open') return;
		function onPointerDown(rawEvent: PointerEvent | MouseEvent) {
			const target = rawEvent.target as Node | null;
			const inside = !!controlEl && !!target && controlEl.contains(target);
			// A pointerdown on ANOTHER POI's trigger is not a dismiss — it is a SWITCH. Let that
			// trigger's click drive `open` for the new control (the core treats it as a switch
			// with a single into-control focus move), instead of closing-then-reopening here.
			const onAnotherTrigger =
				!!listEl &&
				!!target &&
				target instanceof Element &&
				!inside &&
				!!target.closest('.poi-trigger');
			if (onAnotherTrigger) return;
			dispatch({ type: 'pointerdown', inside });
		}
		function onKey(rawEvent: KeyboardEvent) {
			if (rawEvent.key === 'Escape') {
				rawEvent.preventDefault();
				dispatch({ type: 'escape' });
			}
		}
		// pointerdown (not click) so the dismiss decision happens before any underlying map
		// handler would fire — matching the MAP-013/MAP-015 "pointerdown on the control" rule.
		window.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('keydown', onKey);
		};
	});

	// These handlers EXIST to prove they are inert for dismissal: each forwards the
	// corresponding intent into the core, which returns `focusDirective: 'none'` and keeps the
	// control open. They are deliberately wired so a regression that re-introduces hover/scroll
	// dismissal would have to bypass the core to break MAP-015.
	function onControlPointerMove() {
		dispatch({ type: 'pointermove', inside: true });
	}
	function onControlPointerLeave() {
		dispatch({ type: 'pointerleave' });
	}
	function onControlScroll() {
		dispatch({ type: 'scroll' });
	}
	function onControlFocusIn() {
		dispatch({ type: 'focuschange', inside: true });
	}
</script>

<section class="poi-control" data-testid="poi-control" aria-label="Points of interest">
	<h3 id={`poi-heading-${mapId}`}>Points of interest</h3>
	<ul bind:this={listEl} class="poi-list" data-testid="poi-list">
		{#each regions as region (region.id)}
			<li class="poi-item">
				<button
					type="button"
					class="button secondary poi-trigger"
					data-testid={`poi-trigger-${region.id}`}
					aria-haspopup="dialog"
					aria-expanded={isControlOpen(interaction, region.id)}
					aria-controls={`poi-popover-${region.id}`}
					use:registerTrigger={region.id}
					onclick={() => openControl(region.id)}
				>
					{region.name}
				</button>

				{#if isControlOpen(interaction, region.id)}
					<!-- The active control. It renders as a popover on expanded profiles and as a
					     sheet on compact profiles; the engagement rules are identical (the core
					     reducer is profile-agnostic). The internal pointer/hover/scroll/focus
					     handlers forward intents that the core treats as non-dismissing. -->
					<div
						bind:this={controlEl}
						id={`poi-popover-${region.id}`}
						class="poi-surface"
						class:as-sheet={presentation === 'sheet'}
						class:as-popover={presentation === 'popover'}
						data-testid={`poi-surface-${region.id}`}
						data-presentation={presentation}
						role="dialog"
						aria-modal={presentation === 'sheet' ? 'true' : undefined}
						aria-label={`${region.name} actions`}
						tabindex="-1"
						onpointermove={onControlPointerMove}
						onpointerleave={onControlPointerLeave}
						onscroll={onControlScroll}
						onfocusin={onControlFocusIn}
					>
						<div class="poi-surface-head">
							<strong>{region.name}</strong>
							<button
								type="button"
								class="button secondary"
								data-testid={`poi-close-${region.id}`}
								onclick={closeControl}
							>
								Close
							</button>
						</div>
						<div class="poi-actions">
							<button
								type="button"
								class="button"
								data-testid={`poi-focus-${region.id}`}
								onclick={() => focusRegion(region.id)}
							>
								Focus region
							</button>
							<a
								class="button secondary"
								href={`?map=${mapId}&poi=${region.id}`}
								data-testid={`poi-open-${region.id}`}
							>
								Open at {region.name}
							</a>
						</div>
						<p class="meta">
							Stays open while you interact — pointer moves, scrolling, and focusing an action do
							not dismiss it.
						</p>
					</div>
				{/if}
			</li>
		{/each}
		{#if regions.length === 0}
			<li class="meta" data-testid="poi-empty">No points of interest on this map.</li>
		{/if}
	</ul>
</section>

<style>
	.poi-control {
		margin-top: 0.75rem;
	}
	.poi-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.poi-item {
		position: relative;
	}
	.poi-surface {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.75rem;
		display: grid;
		gap: 0.5rem;
		max-width: 22rem;
	}
	/* Expanded profile: anchored popover floating above the trigger. No hover is required to
	   keep it open — it persists until a genuine dismiss intent (MAP-015). */
	.poi-surface.as-popover {
		position: absolute;
		z-index: 20;
		top: calc(100% + 0.35rem);
		left: 0;
		box-shadow: 0 6px 24px rgb(0 0 0 / 18%);
	}
	/* Compact profile: a bottom sheet/drawer instead of a popover (slim-device contract). */
	.poi-surface.as-sheet {
		position: fixed;
		z-index: 40;
		left: 0;
		right: 0;
		bottom: 0;
		max-width: none;
		border-radius: 12px 12px 0 0;
		box-shadow: 0 -6px 24px rgb(0 0 0 / 22%);
	}
	.poi-surface-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.poi-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
