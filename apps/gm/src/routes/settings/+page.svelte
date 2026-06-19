<script lang="ts">
	import {
		listNavigationRegistryForActor,
		listNavigationSections,
		visibleFeatures,
		type SectionActorAvailability,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import { useFeatureTier } from '$lib/state/feature-tier.svelte';
	import { CHANGELOG } from '$lib/content/changelog';
	import { isOnline, storageAvailable } from '$lib/platform/capabilities';
	import { buildDiagnosticsContext } from '$lib/platform/diagnostics-context';
	import DiagnosticsPanel from '$lib/gui/DiagnosticsPanel.svelte';
	import ParticipantStatusPanel from '$lib/gui/ParticipantStatusPanel.svelte';
	import SyncStatusPanel from '$lib/gui/SyncStatusPanel.svelte';
	import CloudStorageClassificationPanel from '$lib/gui/CloudStorageClassificationPanel.svelte';
	import SourceAdaptersPanel from '$lib/gui/SourceAdaptersPanel.svelte';
	import McpSettingsPanel from '$lib/gui/ux-mcp/McpSettingsPanel.svelte';
	import SessionPrivacyPanel from '$lib/gui/SessionPrivacyPanel.svelte';
	import SessionPrivacyStatus from '$lib/gui/ux-perm/SessionPrivacyStatus.svelte';
	import PermissionSummary from '$lib/gui/PermissionSummary.svelte';
	import GrantManager from '$lib/gui/GrantManager.svelte';
	import CapabilityStatus from '$lib/gui/CapabilityStatus.svelte';
	import SupportMatrix from '$lib/gui/SupportMatrix.svelte';
	import SupportStatus from '$lib/gui/SupportStatus.svelte';
	import ThemeSelector from '$lib/gui/ThemeSelector.svelte';
	import MotionSelector from '$lib/gui/MotionSelector.svelte';
	import DensitySelector from '$lib/gui/DensitySelector.svelte';
	import Icon from '$lib/gui/Icon.svelte';
	import { STATUS_ICON, type StatusKind } from '$lib/gui/icons';

	// UX-VIS-009 demo data: each status carries a DISTINCT icon shape + visible text, so the state
	// survives a grayscale / colour-removed render (non-colour cue; A11Y-011).
	const statusDemo: ReadonlyArray<{ kind: StatusKind; label: string }> = [
		{ kind: 'success', label: 'Saved' },
		{ kind: 'warning', label: 'Unsynced' },
		{ kind: 'error', label: 'Failed' },
		{ kind: 'info', label: 'Local only' },
	];

	const runtime = useRuntime();
	const profile = useProfile();
	const featureTier = useFeatureTier();

	// UX-ONB-018: the feature-tier control is also reachable from Settings (besides Onboarding and the
	// command palette). The active tier is a device-local display preference (Contract 1); changing it
	// takes immediate effect and is reversible. `visibleFeatures(tier)` is the same core query the
	// onboarding surface reads, so the capability list stays consistent across both locations.
	const tierFeatures = $derived(visibleFeatures(featureTier.tier));

	// Platform Services derive the diagnostics facts (Contract 1); the Processing Core
	// assembles the actor-filtered views and the redacted support bundle. Online state
	// and filesystem availability come from the platform profile, not feature logic.
	const online = $derived(isOnline());
	const pendingOperations = $derived(runtime.state.sync.operations.length);
	const diagnosticsContext = $derived(
		buildDiagnosticsContext(runtime.state, {
			appVersion: '0.2.0',
			platformProfileId: profile.profileId,
			online,
			storageAvailable: storageAvailable(),
			filesystemAvailable: false,
			pendingOperations,
			now: new Date().toISOString(),
		}),
	);

	// PLAT-017: participant inputs are the participant's OWN device facts only. They never
	// include source ids/paths or hidden entity data.
	const participantInput = $derived({ online, queuedOperations: 0 });
	const activeRole = $derived(
		runtime.state.permissions.actors[runtime.activeActorId]?.role ?? null,
	);

	// Local, device-scoped display preferences are GUI-owned state (Contract 1): the
	// platform profile and the "view as" actor are not durable vault state. This
	// surface reads the same actor-filtered navigation availability the primary nav
	// and palette use, so it reflects exactly what the active actor can reach.
	const activeActor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const sections = $derived(
		listNavigationSections(runtime.state.permissions, runtime.activeActorId),
	);

	// NAV-001 / NAV-009: the canonical top-level Navigation Section registry, filtered
	// for the active actor. DM-only sections are absent for players/observers (NAV-009
	// AC2). Planned sections appear as approved-but-unbuilt IA; only released sections
	// are reachable. The whole list is derived from the Processing Core registry, never
	// authored here.
	const registry = $derived(
		listNavigationRegistryForActor(runtime.state.permissions, runtime.activeActorId),
	);

	function availableRoles(availability: SectionActorAvailability): string {
		const roles = (['dm', 'player', 'observer'] as const).filter((role) => availability[role]);
		return roles.join(', ');
	}
</script>

<section data-testid="settings-view" aria-label="Settings">
	<header class="settings-head">
		<p class="settings-eyebrow">Command Center · Settings</p>
		<p class="meta settings-intro">
			Device-local display preferences for this prototype. Nothing here is synced.
		</p>
	</header>

	<!-- The category rail is the navigation spine: a calm, grouped index that scrolls to each
	     settings area. Every panel stays rendered in one page (the spec asserts each is visible),
	     so the rail is a sticky "on this page" anchor nav rather than a panel switcher. -->
	<div class="settings-layout">
		<nav class="settings-rail" aria-label="Settings categories">
			<div class="rail-group">
				<span class="rail-group-label">You</span>
				<a class="rail-link" href="#set-preferences">Preferences</a>
				<a class="rail-link" href="#set-tier">Feature tier</a>
			</div>
			<div class="rail-group">
				<span class="rail-group-label">Table</span>
				<a class="rail-link" href="#set-sync">Sync</a>
				<a class="rail-link" href="#set-vault">Vault &amp; storage</a>
				<a class="rail-link" href="#set-sources">Sources</a>
				<a class="rail-link" href="#set-ai">AI / MCP</a>
				<a class="rail-link" href="#set-players">Players &amp; roles</a>
			</div>
			<div class="rail-group">
				<span class="rail-group-label">System</span>
				<a class="rail-link" href="#set-diagnostics">Diagnostics</a>
				<a class="rail-link" href="#set-platform">Platform</a>
				<a class="rail-link" href="#set-sections">Navigation</a>
				<a class="rail-link" href="#set-about">About</a>
			</div>
		</nav>

		<div class="settings-content">
			<!-- ============================ YOU ============================ -->
			<div class="settings-block" id="set-preferences">
				<!-- UX-VIS-001: dark-first theme picker (radiogroup). Device-local; applies instantly and
				     persists. The five named themes plus an OS-following "System" option. -->
				<ThemeSelector />

				<!-- UX-VIS-009 / UX-VIS-010 / UX-VIS-011: foundational display preferences. Motion and density
				     are device-local, profile-linked display preferences that drive `data-motion`/`data-density`
				     on <html> and the shared component tokens. The icon row demonstrates the shared Icon
				     primitive: an icon-only button with a required accessible name, and status chips whose state
				     is conveyed by a distinct shape + visible text (never colour alone). -->
				<section
					class="display-prefs panel-card"
					aria-label="Display preferences"
					data-testid="display-preferences"
				>
					<h2>Display preferences</h2>

					<MotionSelector />
					<DensitySelector />

					<div class="pref-group" aria-label="Iconography" data-testid="icon-demo">
						<h3>Iconography</h3>
						<p class="pref-note">
							One Lucide family at a single 2px stroke. Status is shown by icon shape and text, not
							colour alone.
						</p>
						<div class="icon-demo">
							<button type="button" class="btn-icon" data-testid="icon-only-button">
								<Icon name="search" label="Search" />
							</button>
							{#each statusDemo as status (status.kind)}
								<span class="status-chip" data-testid={`status-chip-${status.kind}`}>
									<Icon
										name={STATUS_ICON[status.kind]}
										size="micro"
										class={`icon-status-${status.kind}`}
									/>
									<span>{status.label}</span>
								</span>
							{/each}
							<span class="status-chip" data-testid="status-chip-dm-only">
								<Icon name="dm-only" size="micro" class="icon-dm-only" />
								<span>DM only</span>
							</span>
						</div>
					</div>
				</section>
			</div>

			<!-- UX-ONB-018: the feature-tier control (progressive disclosure of capability sets), surfaced in
			     Settings as well as Onboarding and the command palette. The current tier is pre-selected and
			     changing it takes immediate effect; `visibleFeatures(tier)` lists what the selected tier shows. -->
			<div class="settings-block" id="set-tier">
				<section
					class="feature-tier-settings panel-card"
					aria-label="Feature tier"
					data-testid="settings-feature-tier"
				>
					<h2>Feature tier</h2>
					<p class="meta">
						Reveal more capabilities as you grow comfortable (progressive disclosure). Changes apply
						immediately and are reversible.
					</p>
					<div class="tier-options" role="radiogroup" aria-label="Feature tier">
						{#each featureTier.tiers as tier (tier)}
							<label class="tier-option">
								<input
									type="radio"
									name="settings-feature-tier"
									value={tier}
									checked={featureTier.tier === tier}
									data-testid={`settings-feature-tier-${tier}`}
									onchange={() => featureTier.setTier(tier)}
								/>
								<span>{tier}</span>
							</label>
						{/each}
					</div>
					<ul
						class="visible-features"
						data-testid="settings-visible-features"
						aria-label="Visible capabilities"
					>
						{#each tierFeatures as feature (feature.id)}
							<li data-testid={`settings-feature-${feature.id}`}>{feature.label}</li>
						{/each}
					</ul>
				</section>
			</div>

			<!-- =========================== TABLE =========================== -->
			<!-- SYNC-010 / SYNC-014: the computed sync-status surface. Every role can inspect pending
			     outbound operations, conflicts, source health, and retry actions without raw storage
			     knowledge; the lineage block is actor-filtered (DM sees structural version history, others
			     see only non-leaking freshness). The Processing Core enforces both the derivation and the
			     actor filter; this surface renders the computed model. -->
			<div class="settings-block" id="set-sync">
				<SyncStatusPanel context={diagnosticsContext} />
			</div>

			<!-- SYNC-007 / SYNC-008 / SYNC-017: the cloud/device-local storage classification + enablement
			     gate. Every role can inspect what is eligible to sync to the cloud (only when enabled) and what
			     always stays device-local, plus the encryption/key prerequisites that gate cloud sync. The
			     Processing Core owns the classification and the fail-closed gate; this surface renders the
			     computed model and never reads raw storage or flips any flag. -->
			<div class="settings-block" id="set-vault">
				<CloudStorageClassificationPanel />
			</div>

			<!-- SYNC-003 / SYNC-004 / SYNC-005 / SYNC-015 / SYNC-016: the source-adapter inspection surface.
			     Every source (local vault, Obsidian, Google Docs, future) plugs in behind one adapter contract
			     and transforms content ↔ canonical sync operations; the Processing Core owns the declared
			     capability metadata, the explicit sync states, and the fail-closed preflight. This surface
			     renders the computed registry and never reaches storage or network (live transports deferred). -->
			<div class="settings-block" id="set-sources">
				<SourceAdaptersPanel />
			</div>

			<!-- UX-MCP-001/006/007/009/010: the AI/MCP settings surface. AI is optional and OFF by default
			     (master gate); when off the panel shows full parity (no broken affordances). When the DM enables
			     it, the panel surfaces the vault policy mode (labels + descriptions), the staged-write review
			     queue, and the provenance/audit trail. DM-only; the core re-enforces authority and the default-off
			     fail-closed posture (transport deferred per ADR-014). -->
			<div class="settings-block" id="set-ai">
				<McpSettingsPanel />
			</div>

			<div class="settings-block" id="set-players">
				<!-- COLLAB-008 / COLLAB-009 / COLLAB-010 / COLLAB-014: the session-privacy surface. Player/observer
				     replication streams are filtered BEFORE data leaves the host (hidden content never enters the
				     stream), concurrent session commands resolve with DM authority where policy grants it, and
				     participant device caches are purged or sealed on leave unless a persistent grant exists (with
				     offline-revocation sealing). The Processing Core owns every decision; this surface renders the
				     computed models and reaches no storage or transport (live transport deferred per ADR-014). -->
				<SessionPrivacyPanel />

				<!-- UX-PERM-008: the DM "Session privacy" status panel — per-departed-participant cache-purge
				     status (Purged / Purge unconfirmed / Purge failed) with advisory copy, the 24 h archive
				     window, and the all-clear empty state. DM-only default-deny in the Processing Core: the
				     resolver returns null for a player/observer, so the panel does not exist on their surface
				     and never names device-level data (PERM-014; transport deferred per ADR-014). -->
				<SessionPrivacyStatus />

				<!-- PERM-001 / PERM-011: the effective permission surface the Processing Core computes
				     for the active actor (base role floor + observer ceiling, grants capped to the
				     ceiling), plus the DM-only consistency audit. The GUI renders the computed set; it
				     never computes or overrides permissions. An Observer is always read-only with no
				     character data here, and dropped observer grants surface to the DM as errors. -->
				<PermissionSummary />

				<!-- PERM-004 / PERM-005 / PERM-008 / PERM-013: the DM grant UI. DM-only — players/observers
				     cannot author grants (Contract 3 Axis 2 rule 2). It presents NAMED capability sets with
				     explanations and a core-computed effective-permission preview, dispatches durable grant /
				     transfer / revoke commands, and never shows raw field checkboxes or writes state directly. -->
				{#if activeRole === 'dm'}
					<!-- UX-PERM-008: `id` is the in-page target of the privacy panel's "Review grants" link. -->
					<div id="grant-manager">
						<GrantManager />
					</div>
				{/if}
			</div>

			<!-- ========================== SYSTEM ========================== -->
			<!-- PLAT-009 / PLAT-017: status surfaces. The DM/admin diagnostics panel fails closed
			     for non-DM actors via the Processing Core; participants see only their own
			     non-leaking session status. Rendering by role here is an ergonomic hint — the
			     authoritative permission/redaction enforcement is in the core. -->
			<div class="settings-block" id="set-diagnostics">
				{#if activeRole === 'dm'}
					<DiagnosticsPanel context={diagnosticsContext} />
				{:else if activeRole === 'player' || activeRole === 'observer'}
					<ParticipantStatusPanel context={diagnosticsContext} input={participantInput} />
				{/if}
			</div>

			<div class="settings-block" id="set-platform">
				<section class="panel-card" aria-label="Platform profile">
					<h2>Platform profile</h2>
					<p class="meta" data-testid="settings-profile">
						profile: {profile.profileId} • viewport: {profile.viewportClass}
					</p>
				</section>

				<!-- PLAT-001 / PLAT-002 / PLAT-004 / PLAT-005: the resolved profile capability descriptor.
				     Feature surfaces branch on these facts; native-only services show as
				     unavailable/unsupported so degraded capability status is visible. -->
				<CapabilityStatus profile={profile.profile} />

				<!-- PLAT-016: the published web/PWA cached read/write support matrix. -->
				<SupportMatrix />

				<!-- PLAT-014: the declared cross-profile command support status (parity / degradation /
				     unsupported) for the active profile, with reasons and fallbacks. -->
				<SupportStatus profileId={profile.profileId} />

				<section class="panel-card" aria-label="Active actor">
					<h2>Viewing as</h2>
					<p class="meta" data-testid="settings-active-actor">
						{#if activeActor}
							{activeActor.displayName} ({activeActor.role})
						{:else}
							Unknown actor
						{/if}
					</p>
					<p class="meta">Switch the viewing actor from the “View as” control in the header.</p>
				</section>
			</div>

			<div class="settings-block" id="set-sections">
				<section class="panel-card" aria-label="Reachable sections">
					<h2>Sections you can reach</h2>
					<ul class="scene-list" data-testid="settings-sections">
						{#each sections as section (section.id)}
							<li class="scene-card" data-testid={`settings-section-${section.id}`}>
								<a href={section.route}><strong>{section.title}</strong></a>
								<span class="meta"> {section.category}</span>
							</li>
						{/each}
					</ul>
				</section>

				<section class="panel-card" aria-label="Canonical navigation sections">
					<h2>Canonical navigation sections</h2>
					<p class="meta">
						The approved top-level information architecture. Each section declares its owning domain,
						route root, actor availability, and release status. DM-only sections never appear for players
						or observers.
					</p>
					<ul class="scene-list" data-testid="settings-ia-registry">
						{#each registry as entry (entry.id)}
							<li class="scene-card" data-testid={`ia-section-${entry.id}`}>
								<div>
									<strong>{entry.title}</strong>
									{#if entry.home}<span class="meta"> • home</span>{/if}
									<div class="meta">
										owner: {entry.owner} • root: <code>{entry.routeRoot}</code> • for: {availableRoles(
											entry.availability,
										)}
									</div>
									<div class="meta" data-testid={`ia-task-${entry.id}`}>serves: {entry.taskFit}</div>
									<div class="meta">local nav: {entry.localNav.description}</div>
								</div>
								<span
									class="meta"
									class:unavailable={!entry.reachable}
									data-testid={`ia-status-${entry.id}`}
								>
									{entry.releaseStatus}{entry.reachable ? ' • reachable' : ''}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			</div>

			<!-- UX-ONB-020: "What's New" / changelog surface, reachable from Settings → About (and the help
			     center). A passive, reverse-chronological list of release entries — never an interruptive
			     modal on launch. Opening the help center clears the "?"-button badge. -->
			<div class="settings-block" id="set-about">
				<section
					class="about panel-card"
					aria-label="About and what's new"
					data-testid="settings-about"
					id="changelog"
				>
					<h2>About &amp; what's new</h2>
					<p class="meta">DND Tools — local-first, canvas-first command platform. Release notes below.</p>
					<ol class="changelog" data-testid="changelog">
						{#each CHANGELOG as entry (entry.version)}
							<li class="changelog-entry" data-testid={`changelog-${entry.version}`}>
								<p class="changelog-meta">
									<strong>{entry.version}</strong> • {entry.date}
								</p>
								<h3 class="changelog-title">{entry.title}</h3>
								<ul class="changelog-changes">
									{#each entry.changes as change (change)}
										<li>{change}</li>
									{/each}
								</ul>
							</li>
						{/each}
					</ol>
				</section>
			</div>
		</div>
	</div>
</section>

<style>
	/* The settings surface re-composed to the warm "candle-lit" package: a calm category RAIL on the
	 * left that scrolls to each area, and a single content column of converged cards on the right.
	 * Token-only; no raw colour/radius/font-size literals. */

	.settings-head {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-5);
	}
	.settings-eyebrow {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-wider);
		text-transform: uppercase;
		/* On the flat page bg, small eyebrow text must be at least --color-text-secondary (tertiary
		   fails axe contrast on the parchment light theme). */
		color: var(--color-text-secondary);
	}
	.settings-intro {
		margin: 0;
		max-width: 60ch;
	}

	/* Two-column spine: rail + content. The content track is minmax(0, 1fr) so a wide child (e.g. the
	   support matrix table) can shrink rather than push the centered .app-main column wider. */
	.settings-layout {
		display: grid;
		grid-template-columns: 13.5rem minmax(0, 1fr);
		gap: var(--space-6);
		align-items: start;
	}

	/* The category rail — a sticky, grouped index. Calm tier-3 styling; never a heavy frame. */
	.settings-rail {
		position: sticky;
		top: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-3);
		background: var(--color-surface-alt);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.rail-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
	}
	.rail-group-label {
		padding: 0 var(--space-2) var(--space-1);
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-wider);
		text-transform: uppercase;
		color: var(--color-text-secondary);
	}
	.rail-link {
		display: flex;
		align-items: center;
		/* 44px is explicitly allowed for the touch sweep; never a sub-44px fixed floor. */
		min-height: var(--touch-target-min);
		padding: var(--space-1) var(--space-3);
		border-left: 3px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		transition:
			background var(--duration-fast) var(--easing-standard),
			color var(--duration-fast) var(--easing-standard);
	}
	.rail-link:hover {
		background: var(--color-interactive-hover);
		color: var(--color-text-primary);
	}
	.rail-link:focus-visible {
		outline: var(--focus-ring-width) solid var(--focus-ring-color);
		outline-offset: var(--focus-ring-offset);
	}

	.settings-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		min-width: 0;
	}

	/* Each rail target is a block of one or more cards. Keep the anchor clear of any sticky chrome. */
	.settings-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
		scroll-margin-top: var(--space-6);
	}

	/* CANONICAL secondary card recipe — the default content block for the inline page sections. The
	   wired component panels carry the same recipe in their own scoped styles so all sections converge. */
	.panel-card {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
		box-shadow: var(--shadow-sm);
		min-width: 0;
	}
	.panel-card :global(h2) {
		margin: 0 0 var(--space-3);
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-lg);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	.panel-card :global(h3) {
		font-size: var(--text-md);
	}

	/* Page-level captions: there is no global base `.meta`, so style it here. Secondary keeps >=4.5:1
	   on both the flat page bg and a raised card (tertiary would fail on the page bg). */
	.settings-head .meta,
	.panel-card :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	/* Preserve the IA "planned"/unreachable warning cue (re-declared so it out-specifies the .meta
	   rule above, which would otherwise tie .meta.unavailable and flatten the colour). */
	.panel-card :global(.unavailable) {
		color: var(--color-status-warning-text);
	}

	/* Compact / tablet-portrait: collapse to a single column and unstick the rail so it reads as a
	   plain in-page index above the content (and never introduces horizontal overflow). */
	@media (max-width: 860px) {
		.settings-layout {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-5);
		}
		.settings-rail {
			position: static;
			flex-flow: row wrap;
			gap: var(--space-2) var(--space-5);
		}
	}
</style>
