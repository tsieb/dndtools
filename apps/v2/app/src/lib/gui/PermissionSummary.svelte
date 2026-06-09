<script lang="ts">
	import {
		auditPermissionConsistency,
		computeEffectivePermissionsForActor,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// PERM-001 / PERM-011: this surface RENDERS the permission set the Processing Core
	// computes; it never computes or overrides permissions itself (Contract 1). The base
	// role floor is computed first and caps the participant; grants are additive only within
	// the role ceiling. An Observer is therefore always read-only with no character data, and
	// any dropped observer write/character grant is surfaced to the DM as a consistency error.
	const runtime = useRuntime();

	// The effective surface for whichever actor the GUI is currently rendering ("view as").
	const effective = $derived(
		computeEffectivePermissionsForActor(runtime.state.permissions, runtime.activeActorId),
	);

	// The DM-facing consistency audit. Only the DM sees the remediation list; participants see
	// only their own effective surface. The audit message strings are generic by construction
	// and never leak hidden entity titles or field values.
	const isDm = $derived(runtime.state.permissions.actors[runtime.activeActorId]?.role === 'dm');
	const consistency = $derived(auditPermissionConsistency(runtime.state.permissions));
</script>

<section data-testid="permission-summary" aria-label="Your permissions">
	<h2>Your permissions</h2>
	<div class="scene-list">
		<div class="scene-card" data-testid="perm-role">
			<div><strong>Base role</strong></div>
			<span class="meta" data-testid="perm-role-value">{effective.role}</span>
		</div>
		<div class="scene-card" data-testid="perm-write">
			<div>
				<strong>Editing</strong>
				<div class="meta">
					{effective.readOnly
						? 'Read-only. You cannot change shared content.'
						: 'You can edit content you own or have been granted.'}
				</div>
			</div>
			<span class="meta" class:unavailable={effective.readOnly} data-testid="perm-write-value"
				>{effective.readOnly ? 'read-only' : 'can write'}</span
			>
		</div>
		<div class="scene-card" data-testid="perm-character-data">
			<div>
				<strong>Character data</strong>
				<div class="meta">
					{effective.canReadCharacterData
						? 'You can read character data you are permitted to see.'
						: 'No character data is available to you.'}
				</div>
			</div>
			<span
				class="meta"
				class:unavailable={!effective.canReadCharacterData}
				data-testid="perm-character-data-value"
				>{effective.canReadCharacterData ? 'available' : 'none'}</span
			>
		</div>
	</div>

	{#if effective.roleNormalized}
		<p class="meta" role="status" data-testid="perm-role-normalized">
			Your role assignment was normalized to the safest interpretation ({effective.roleResolutionReason}).
		</p>
	{/if}

	{#if isDm}
		<section aria-label="Permission consistency" data-testid="perm-consistency">
			<h3>Permission consistency</h3>
			{#if consistency.problems.length === 0}
				<p class="meta" data-testid="perm-consistency-clean">
					No permission consistency problems detected.
				</p>
			{:else}
				<ul class="scene-list" data-testid="perm-consistency-list">
					{#each consistency.problems as problem, index (`${problem.actorId}-${problem.grantId ?? 'role'}-${index}`)}
						<li
							class="scene-card"
							data-testid={`perm-problem-${problem.kind}`}
							data-severity={problem.severity}
						>
							<div>
								<strong>{problem.kind}</strong>
								<div class="meta">{problem.remediation}</div>
								<div class="meta">
									participant: <code>{problem.actorId}</code> ({problem.role})
									{#if problem.entityType}
										• {problem.entityType}
									{/if}
								</div>
							</div>
							<span class="meta" class:unavailable={problem.severity === 'error'}>
								{problem.severity}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</section>
