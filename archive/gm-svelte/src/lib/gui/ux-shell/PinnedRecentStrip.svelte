<script lang="ts">
	import Icon from '$lib/gui/Icon.svelte';
	import type { NavEntry } from '$lib/platform/navigation-history';

	/**
	 * UX-NAV-015 — the pinned + recent items strip.
	 *
	 * A direct-access strip that sits between the Command Center item and the section list in the
	 * sidebar / rail, and at the top of the Mobile "More" sheet. It gives the DM instant access to a
	 * handful of fixed destinations (the active session, the party tracker, the world map) and the
	 * entities they just visited, without hunting through the section hierarchy.
	 *
	 * Actor safety (UX-NAV-013): this component renders ONLY what it is handed. The shell filters the
	 * device-local pinned/recent lists through {@link listReachableDestinations} (the same
	 * actor-filtered reachability the nav and palette use) before passing them here, so a route the
	 * active actor can no longer reach — e.g. a DM-only Scene while viewing as a player — is dropped
	 * upstream and never appears in this strip, not even as a count or a stale title. Each entry's
	 * title is refreshed from the reachable set, so a rename never leaves a stale label behind.
	 */
	interface Props {
		/** Actor-filtered pinned entries (already reachability-filtered by the shell). */
		pinned: NavEntry[];
		/** Actor-filtered recent entries (already reachability-filtered, pinned removed). */
		recent: NavEntry[];
		/** Unpin a destination (device-local preference, never synced). */
		onUnpin: (entry: NavEntry) => void;
		/** Icon-only presentation (collapsed sidebar / Tablet rail): labels collapse to tooltips. */
		iconOnly?: boolean;
		/** Under touch modality, suppress hover-only tooltips (UX-NAV-018). */
		touch?: boolean;
		/** `rail` renders inside the sidebar/rail; `sheet` renders inside the Mobile "More" sheet. */
		variant?: 'rail' | 'sheet';
	}

	let { pinned, recent, onUnpin, iconOnly = false, touch = false, variant = 'rail' }: Props =
		$props();

	const hasContent = $derived(pinned.length > 0 || recent.length > 0);
</script>

{#if hasContent}
	<!-- A grouped region inside the primary-nav landmark (a `role="group"`, not a second nav
	     landmark, so the single "Primary navigation" landmark contract is preserved — UX-NAV-009). -->
	<div
		class="pinned-recent"
		role="group"
		aria-label="Pinned and recent"
		data-testid="pinned-recent"
		data-variant={variant}
		data-icon-only={iconOnly ? 'true' : 'false'}
	>
		{#if pinned.length > 0}
			<div class="pinrec-group" role="group" aria-label="Pinned" data-testid="pinned-group">
				<p class="pinrec-label" aria-hidden="true">Pinned</p>
				<ul class="pinrec-list" role="list">
					{#each pinned as entry (entry.route)}
						<li class="pinrec-item">
							<a
								class="pinrec-link"
								href={entry.route}
								data-testid="pinned-item"
								title={iconOnly && !touch ? entry.title : undefined}
							>
								<span class="pinrec-icon"><Icon name="pin" size="sm" /></span>
								<span class="pinrec-text">{entry.title}</span>
								<!-- Accessible name is always the full title, even icon-only (UX-NAV-015 a11y). -->
								<span class="visually-hidden">{entry.title}</span>
							</a>
							{#if !iconOnly}
								<button
									type="button"
									class="pinrec-unpin"
									data-testid="pinned-unpin"
									aria-label={`Unpin ${entry.title}`}
									onclick={() => onUnpin(entry)}
								>
									<Icon name="close" size="sm" label={`Unpin ${entry.title}`} />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if pinned.length > 0 && recent.length > 0}
			<hr class="pinrec-sep" />
		{/if}

		{#if recent.length > 0}
			<div class="pinrec-group" role="group" aria-label="Recent" data-testid="recent-group">
				<p class="pinrec-label" aria-hidden="true">Recent</p>
				<ul class="pinrec-list" role="list">
					{#each recent as entry (entry.route)}
						<li class="pinrec-item">
							<a
								class="pinrec-link"
								href={entry.route}
								data-testid="recent-item"
								title={iconOnly && !touch ? entry.title : undefined}
							>
								<span class="pinrec-icon"><Icon name="recent" size="sm" /></span>
								<span class="pinrec-text">{entry.title}</span>
								<span class="visually-hidden">{entry.title}</span>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/if}
