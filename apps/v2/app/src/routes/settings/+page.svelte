<script lang="ts">
	import {
		listNavigationRegistryForActor,
		listNavigationSections,
		type SectionActorAvailability,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import { isOnline, storageAvailable } from '$lib/platform/capabilities';
	import { buildDiagnosticsContext } from '$lib/platform/diagnostics-context';
	import DiagnosticsPanel from '$lib/gui/DiagnosticsPanel.svelte';
	import ParticipantStatusPanel from '$lib/gui/ParticipantStatusPanel.svelte';
	import SyncStatusPanel from '$lib/gui/SyncStatusPanel.svelte';
	import CloudStorageClassificationPanel from '$lib/gui/CloudStorageClassificationPanel.svelte';
	import SourceAdaptersPanel from '$lib/gui/SourceAdaptersPanel.svelte';
	import SessionPrivacyPanel from '$lib/gui/SessionPrivacyPanel.svelte';
	import PermissionSummary from '$lib/gui/PermissionSummary.svelte';
	import GrantManager from '$lib/gui/GrantManager.svelte';
	import CapabilityStatus from '$lib/gui/CapabilityStatus.svelte';
	import SupportMatrix from '$lib/gui/SupportMatrix.svelte';
	import SupportStatus from '$lib/gui/SupportStatus.svelte';

	const runtime = useRuntime();
	const profile = useProfile();

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
	<p class="meta">Device-local display preferences for this prototype. Nothing here is synced.</p>

	<!-- PLAT-009 / PLAT-017: status surfaces. The DM/admin diagnostics panel fails closed
	     for non-DM actors via the Processing Core; participants see only their own
	     non-leaking session status. Rendering by role here is an ergonomic hint — the
	     authoritative permission/redaction enforcement is in the core. -->
	{#if activeRole === 'dm'}
		<DiagnosticsPanel context={diagnosticsContext} />
	{:else if activeRole === 'player' || activeRole === 'observer'}
		<ParticipantStatusPanel context={diagnosticsContext} input={participantInput} />
	{/if}

	<!-- SYNC-010 / SYNC-014: the computed sync-status surface. Every role can inspect pending
	     outbound operations, conflicts, source health, and retry actions without raw storage
	     knowledge; the lineage block is actor-filtered (DM sees structural version history, others
	     see only non-leaking freshness). The Processing Core enforces both the derivation and the
	     actor filter; this surface renders the computed model. -->
	<SyncStatusPanel context={diagnosticsContext} />

	<!-- SYNC-007 / SYNC-008 / SYNC-017: the cloud/device-local storage classification + enablement
	     gate. Every role can inspect what is eligible to sync to the cloud (only when enabled) and what
	     always stays device-local, plus the encryption/key prerequisites that gate cloud sync. The
	     Processing Core owns the classification and the fail-closed gate; this surface renders the
	     computed model and never reads raw storage or flips any flag. -->
	<CloudStorageClassificationPanel />

	<!-- SYNC-003 / SYNC-004 / SYNC-005 / SYNC-015 / SYNC-016: the source-adapter inspection surface.
	     Every source (local vault, Obsidian, Google Docs, future) plugs in behind one adapter contract
	     and transforms content ↔ canonical sync operations; the Processing Core owns the declared
	     capability metadata, the explicit sync states, and the fail-closed preflight. This surface
	     renders the computed registry and never reaches storage or network (live transports deferred). -->
	<SourceAdaptersPanel />

	<!-- COLLAB-008 / COLLAB-009 / COLLAB-010 / COLLAB-014: the session-privacy surface. Player/observer
	     replication streams are filtered BEFORE data leaves the host (hidden content never enters the
	     stream), concurrent session commands resolve with DM authority where policy grants it, and
	     participant device caches are purged or sealed on leave unless a persistent grant exists (with
	     offline-revocation sealing). The Processing Core owns every decision; this surface renders the
	     computed models and reaches no storage or transport (live transport deferred per ADR-014). -->
	<SessionPrivacyPanel />

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
		<GrantManager />
	{/if}

	<section aria-label="Platform profile">
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

	<section aria-label="Active actor">
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

	<section aria-label="Reachable sections">
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

	<section aria-label="Canonical navigation sections">
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
</section>
