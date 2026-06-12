<script lang="ts">
	import {
		isMcpEnabled,
		MCP_RESPONSE_STATUSES,
		type McpPolicyMode,
		type McpResponseEnvelope,
		type McpResponseStatus,
		type McpVaultDefaultMode,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// UX-MCP-001/006/007/009/010 — the AI/MCP settings surface. AI is OPTIONAL and OFF BY DEFAULT
	// (MCP-001): with the master switch off, every agent tool is denied at the gate and the app is fully
	// usable — full UI parity, no broken affordances. When the DM enables it, the panel surfaces the vault
	// POLICY MODE (human-readable labels/descriptions, UX-MCP-010), the STAGED-WRITE review queue
	// (UX-MCP-007), and the append-only PROVENANCE/AUDIT trail (UX-MCP-006). DM-only: the panel renders
	// nothing for a non-DM, and the core re-enforces DM authority on every command (Contract 1).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');

	const enabled = $derived(isMcpEnabled(runtime.state.mcp));
	const vaultDefault = $derived(runtime.state.mcp.vaultDefaultMode);
	const proposals = $derived(Object.values(runtime.state.mcp.proposals));
	const pending = $derived(proposals.filter((p) => p.status === 'pending'));
	const audit = $derived([...runtime.state.mcp.auditEntries].reverse());

	// UX-MCP-010 — human-readable labels + one-line descriptions for each policy mode.
	const MODE_LABEL: Record<McpPolicyMode, string> = {
		disabled: 'Disabled',
		strict_review: 'Strict review',
		balanced: 'Balanced',
		trusted_direct: 'Trusted direct',
	};
	const MODE_DESC: Record<McpPolicyMode, string> = {
		disabled: 'Agents may read, but every write is denied.',
		strict_review: 'Every agent write is staged for your explicit approval before it commits.',
		balanced: 'Low-risk writes commit directly; durable writes are staged for review.',
		trusted_direct: 'Agent writes commit directly without review — use only for fully trusted agents.',
	};
	// The vault default may only be the two safe postures (a never-configured agent inherits it).
	const VAULT_DEFAULTS: McpVaultDefaultMode[] = ['strict_review', 'disabled'];

	let error = $state<string | null>(null);
	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<void> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') error = result.rejection.message;
	}

	function toggleEnabled(): void {
		void dispatch({ type: 'mcp.set-enabled', actorId: runtime.activeActorId, payload: { enabled: !enabled } });
	}
	function setVaultDefault(mode: McpVaultDefaultMode): void {
		void dispatch({ type: 'mcp.set-vault-default', actorId: runtime.activeActorId, payload: { mode } });
	}
	function approve(proposalId: string): void {
		void dispatch({ type: 'mcp.approve-proposal', actorId: runtime.activeActorId, payload: { proposalId } });
	}
	function reject(proposalId: string): void {
		void dispatch({ type: 'mcp.reject-proposal', actorId: runtime.activeActorId, payload: { proposalId } });
	}

	// UX-MCP-008 — the response-presentation REFERENCE. Agent responses arrive as the stable core
	// `McpResponseEnvelope` (one shape for every tool/status): a coarse status, a generic summary,
	// warnings SEPARATE from data, bounded id/kind-only citations (never cited content — no leak),
	// remediation actions, and a structured non-leaking error. These representative envelopes show how
	// each status renders, so the presentation contract is concrete before any live transport exists.
	const RESPONSE_SUMMARY: Record<McpResponseStatus, string> = {
		ok: 'Read 3 visible notes and drafted a recap.',
		staged: 'Prepared an edit — staged for your review before it commits.',
		denied: 'This action is not permitted for the bound actor.',
		error: 'The request could not be validated.',
	};
	function sampleEnvelope(status: McpResponseStatus): McpResponseEnvelope {
		return {
			contractVersion: 1,
			id: `sample-${status}`,
			toolId: 'vault.read',
			status,
			summary: RESPONSE_SUMMARY[status],
			data: null,
			warnings: status === 'ok' ? [{ code: 'partial-context', message: 'Some sources were not visible to the bound actor.' }] : [],
			citations: status === 'ok' ? [{ kind: 'note', ref: 'note-7f' }, { kind: 'map', ref: 'map-2a' }] : [],
			remediation: status === 'denied' ? [{ action: 'bind-actor', message: 'Ensure the agent is bound to a registered actor.' }] : [],
			error: status === 'denied'
				? { code: 'actor-unauthorized', message: 'The bound actor lacks this capability.' }
				: status === 'error'
					? { code: 'input-invalid', message: 'A field failed validation.', issues: [{ path: 'title', message: 'Required.' }] }
					: null,
		};
	}
	const sampleResponses = $derived(MCP_RESPONSE_STATUSES.map((status) => sampleEnvelope(status)));
</script>

{#if isDm}
	<section class="cwrap" data-testid="mcp-settings" aria-label="AI and MCP settings">
		<header class="head">
			<h2>AI assistance (MCP)</h2>
			<p class="lede">
				AI is optional and off by default. With it off, every agent tool is denied at the master gate
				and the app works fully without AI — nothing here is required to play.
			</p>
		</header>

		{#if error}<p class="error" role="alert" data-testid="mcp-error">{error}</p>{/if}

		<!-- UX-MCP-001 — the master enable switch (parity when off). -->
		<div class="enable card">
			<div class="enable__text">
				<strong>AI integration</strong>
				<span class="meta" data-testid="mcp-enabled-state">{enabled ? 'Enabled' : 'Disabled'}</span>
			</div>
			<button
				type="button"
				class="toggle"
				data-testid="mcp-enable-toggle"
				role="switch"
				aria-checked={enabled}
				aria-label="Enable AI integration"
				onclick={toggleEnabled}
			>
				<span class="toggle__track" data-on={enabled}><span class="toggle__thumb"></span></span>
				{enabled ? 'On' : 'Off'}
			</button>
		</div>

		{#if !enabled}
			<!-- UX-MCP-009 — honest fallback: nothing AI is active, and that is a complete, usable state. -->
			<p class="fallback card" data-testid="mcp-fallback">
				AI is off. Provenance, staged writes, and agent tools are inactive — the app is fully usable.
				Enabling AI also requires the desktop MCP sidecar capability.
			</p>
		{:else}
			<!-- UX-MCP-010 — vault default policy mode with human-readable labels + descriptions. -->
			<section class="card" aria-labelledby="mcp-policy-h">
				<h3 id="mcp-policy-h">Vault default policy</h3>
				<div class="modes" data-testid="mcp-policy-modes">
					{#each VAULT_DEFAULTS as mode (mode)}
						<button
							type="button"
							class="mode"
							class:mode--active={vaultDefault === mode}
							aria-pressed={vaultDefault === mode}
							data-testid={`mcp-mode-${mode}`}
							onclick={() => setVaultDefault(mode)}
						>
							<span class="mode__label">{MODE_LABEL[mode]}</span>
							<span class="mode__desc">{MODE_DESC[mode]}</span>
						</button>
					{/each}
				</div>
				<p class="meta">A never-configured agent inherits this posture. The safe default is Strict review.</p>
			</section>

			<!-- UX-MCP-007 — staged-write review queue. -->
			<section class="card" aria-labelledby="mcp-staged-h">
				<h3 id="mcp-staged-h">Staged writes <span class="count" data-testid="mcp-pending-count">{pending.length}</span></h3>
				{#if proposals.length === 0}
					<p class="meta" data-testid="mcp-staged-empty">No agent has staged a write.</p>
				{:else}
					<ul class="proposals" data-testid="mcp-proposals">
						{#each proposals as proposal (proposal.id)}
							<li class="proposal" data-testid={`mcp-proposal-${proposal.id}`} data-status={proposal.status}>
								<div class="proposal__main">
									<code class="proposal__cmd">{proposal.commandType}</code>
									<span class="meta">{proposal.toolId} · {MODE_LABEL[proposal.policyMode]} · {proposal.writeRisk}</span>
									<span class="status-badge" data-status={proposal.status}>{proposal.status}</span>
								</div>
								{#if proposal.status === 'pending'}
									<div class="proposal__actions">
										<button type="button" class="approve" data-testid={`mcp-approve-${proposal.id}`} onclick={() => approve(proposal.id)}>Approve</button>
										<button type="button" class="reject" data-testid={`mcp-reject-${proposal.id}`} onclick={() => reject(proposal.id)}>Reject</button>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- UX-MCP-006 — provenance / audit trail. -->
			<section class="card" aria-labelledby="mcp-audit-h">
				<h3 id="mcp-audit-h">Provenance &amp; audit</h3>
				{#if audit.length === 0}
					<p class="meta" data-testid="mcp-audit-empty">No agent writes have been recorded.</p>
				{:else}
					<ul class="audit" data-testid="mcp-audit">
						{#each audit as entry (entry.id)}
							<li class="audit-row" data-testid={`mcp-audit-${entry.id}`}>
								<span class="status-badge" data-mode={entry.mode}>{entry.mode}</span>
								<code>{entry.toolId}</code>
								<span class="meta">{MODE_LABEL[entry.policyMode]} · {entry.actorId}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- UX-MCP-008 — how agent responses are presented: stable envelope per status, warnings
			     separate from data, id/kind-only citations, remediation, and a structured error. -->
			<section class="card" aria-labelledby="mcp-response-h">
				<h3 id="mcp-response-h">How agent responses are presented</h3>
				<p class="meta">Every tool returns one stable envelope. Warnings, citations (id only), and remediation are separate from the result; a denied/error response carries a structured, non-leaking reason.</p>
				<ul class="responses" data-testid="mcp-response-presentation">
					{#each sampleResponses as envelope (envelope.status)}
						<li class="response" data-testid={`mcp-response-${envelope.status}`}>
							<div class="response__head">
								<span class="status-badge" data-status={envelope.status === 'staged' ? 'pending' : envelope.status === 'ok' ? 'approved' : 'rejected'}>{envelope.status}</span>
								<span class="response__summary">{envelope.summary}</span>
							</div>
							{#if envelope.warnings.length > 0}
								<ul class="response__warnings">
									{#each envelope.warnings as warning (warning.code)}<li>⚠ {warning.message}</li>{/each}
								</ul>
							{/if}
							{#if envelope.citations.length > 0}
								<div class="response__citations">
									{#each envelope.citations as citation (citation.ref)}<code class="citation">{citation.kind}:{citation.ref}</code>{/each}
								</div>
							{/if}
							{#if envelope.error}
								<p class="response__error"><code>{envelope.error.code}</code> — {envelope.error.message}</p>
							{/if}
							{#if envelope.remediation.length > 0}
								<ul class="response__remediation">
									{#each envelope.remediation as remediation (remediation.action)}<li>→ {remediation.message}</li>{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="meta" data-testid="mcp-inline-assist-note">
					Inline assist, suggestion chips, and attachment bundles activate with the (deferred) AI
					transport; their result presentation already follows this envelope contract.
				</p>
			</section>
		{/if}
	</section>
{/if}

<style>
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.head h2 {
		margin: 0;
	}
	.lede {
		margin: var(--space-1) 0 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.error {
		margin: 0;
		color: var(--color-status-error-text);
		font-size: var(--text-sm);
	}
	.card {
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.card h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-md);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.meta {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.enable {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.enable__text {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		cursor: pointer;
		font-weight: var(--font-weight-semibold);
	}
	.toggle__track {
		width: 2.25rem;
		height: 1.25rem;
		border-radius: var(--radius-full);
		background: var(--color-surface-overlay);
		border: 1px solid var(--color-border-strong);
		position: relative;
	}
	.toggle__track[data-on='true'] {
		background: var(--color-accent);
		border-color: var(--color-accent);
	}
	.toggle__thumb {
		position: absolute;
		top: 1px;
		left: 1px;
		width: 1rem;
		height: 1rem;
		border-radius: var(--radius-full);
		background: var(--color-text-inverse);
		transition: transform var(--duration-fast) var(--ease-out, ease-out);
	}
	.toggle__track[data-on='true'] .toggle__thumb {
		transform: translateX(1rem);
	}
	.fallback {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.modes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: var(--space-2);
	}
	.mode {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		text-align: left;
		min-height: var(--touch-target-min);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
	}
	.mode--active {
		border-color: var(--color-accent);
		background: var(--color-interactive-selected);
	}
	.mode__label {
		font-weight: var(--font-weight-semibold);
	}
	.mode__desc {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.count {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		padding: 0 var(--space-2);
	}
	.proposals,
	.audit {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}
	.proposal {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.proposal__main {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		min-width: 0;
	}
	.proposal__cmd,
	.audit-row code {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--color-text-primary);
	}
	.proposal__actions {
		display: flex;
		gap: var(--space-2);
	}
	.approve,
	.reject {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-weight: var(--font-weight-semibold);
	}
	.approve {
		background: var(--color-status-success);
		color: var(--color-text-inverse);
		border: 1px solid var(--color-status-success);
	}
	.reject {
		background: transparent;
		color: var(--color-status-error-text);
		border: 1px solid var(--color-status-error);
	}
	.status-badge {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		padding: 0 var(--space-1-5);
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
	}
	.status-badge[data-status='pending'],
	.status-badge[data-mode='staged'] {
		color: var(--color-status-warning-text);
		border-color: var(--color-status-warning);
	}
	.status-badge[data-status='approved'],
	.status-badge[data-mode='direct'] {
		color: var(--color-status-success-text);
		border-color: var(--color-status-success);
	}
	.status-badge[data-status='rejected'],
	.status-badge[data-mode='denied'] {
		color: var(--color-status-error-text);
		border-color: var(--color-status-error);
	}
	.audit-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-1-5) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.responses {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.response {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.response__head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.response__summary {
		font-size: var(--text-sm);
	}
	.response__warnings,
	.response__remediation {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: var(--text-sm);
	}
	.response__warnings {
		color: var(--color-status-warning-text);
	}
	.response__remediation {
		color: var(--color-text-secondary);
	}
	.response__citations {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
	}
	.citation {
		font-family: var(--font-mono);
		font-size: var(--text-2xs);
		color: var(--color-text-secondary);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
	}
	.response__error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-status-error-text);
	}
	.response__error code {
		font-family: var(--font-mono);
	}
</style>
