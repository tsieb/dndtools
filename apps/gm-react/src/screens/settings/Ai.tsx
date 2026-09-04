import { useState } from 'react';
import {
	MCP_BASELINE_TOOL_IDS,
	MCP_POLICY_MODES,
	type CommandResult,
	type McpPolicyMode,
	type McpStagedProposal,
} from '@dndtools/core';
import { Badge, Button, Chip, Icon, Input, Select, Switch, Toaster } from '../../ds';
import { Panel, Seg, SetRow, T } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { baselineAllowlistMembership, toggleBaselineToolAllowlist } from '../../ai/mcpBridge';
import { AiProviderPanel } from './AiProvider';
import { AiAssistantPanel } from './AiAssistant';
import { errMsg } from './shared';
/* ---- AI & tools (REAL — the durable MCP identity/policy/staged-writes slice + `mcp.*` commands,
 * PLUS the client-side provider transport (ADR-021, closing the ADR-014 deferral). The POLICY layer:
 * master enable, per-agent bindings/modes/allowlists, staged-proposal review and the audit trail all
 * dispatch validated Core commands and persist. The TRANSPORT layer: a BYO-key Anthropic / OpenAI-
 * compatible chat client (src/ai/) whose tool calls route through the SAME fail-closed agent
 * pipeline — reads are actor-filtered, writes become the staged proposals reviewed below. Fail
 * closed twice over: MCP is OFF by default, and with no API key every AI surface stays off. -------- */
const MCP_MODE_LABEL: Record<McpPolicyMode, string> = {
	disabled: 'Disabled',
	strict_review: 'Strict review',
	balanced: 'Balanced',
	trusted_direct: 'Trusted direct',
};

export function SettingsAI() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const mcp = runtime.state.mcp;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
	const canWrite = isDm && !runtime.preview;
	const [busy, setBusy] = useState(false);
	// Bumped when the provider panel saves/forgets a key so the assistant panel re-reads its
	// configured state (the key lives in the ai/ module, not in Core state or React).
	const [, bumpAiConfig] = useState(0);
	const actors = Object.values(runtime.state.permissions.actors) as {
		id: string;
		role: string;
		displayName: string;
	}[];

	// Register-agent form (a binding names WHICH actor a future connection speaks as — no capability).
	const [newAgentId, setNewAgentId] = useState('');
	const [newLabel, setNewLabel] = useState('');
	// Removing a binding expires the agent's pending proposals and cannot be undone, so it takes a
	// two-step inline confirm rather than firing straight from the trash icon.
	const [confirmRemoveAgentId, setConfirmRemoveAgentId] = useState<string | null>(null);
	const [newActorId, setNewActorId] = useState<string>(
		actors.find((a) => a.role !== 'dm')?.id ?? actors[0]?.id ?? '',
	);
	const selectedNewActorId = actors.some((actor) => actor.id === newActorId)
		? newActorId
		: (actors.find((actor) => actor.role !== 'dm')?.id ?? actors[0]?.id ?? '');

	const run = (command: Parameters<typeof runtime.dispatch>[0], okMsg: string) => {
		setBusy(true);
		void runtime
			.dispatch(command)
			.then((res: CommandResult) => {
				if (res.status === 'accepted') Toaster.success(okMsg);
				else Toaster.error(res.rejection.message);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'The command failed.')))
			.finally(() => setBusy(false));
	};

	const bindings = Object.values(mcp.bindings);
	const pending = (Object.values(mcp.proposals) as McpStagedProposal[]).filter(
		(pr) => pr.status === 'pending',
	);
	const recentAudit = mcp.auditEntries.slice(-5).reverse();
	const actorName = (id: string) => runtime.state.permissions.actors[id]?.displayName ?? id;

	const registerAgent = () => {
		const agentId = newAgentId.trim();
		if (!agentId || !selectedNewActorId) {
			Toaster.error(
				'Give the agent connection an id and choose the campaign identity it should use.',
			);
			return;
		}
		run(
			{
				type: 'mcp.set-agent-binding',
				actorId,
				payload: { agentId, actorId: selectedNewActorId, label: newLabel.trim() },
			},
			`Registered ${agentId} — it starts with the campaign default (${MCP_MODE_LABEL[mcp.vaultDefaultMode]}) until you set a policy.`,
		);
		setNewAgentId('');
		setNewLabel('');
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			{!canWrite && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					Agent access is DM-only and cannot be changed while previewing as a player.
				</div>
			)}
			<Panel
				title="AI & agent access"
				action={
					<Switch
						checked={mcp.enabled}
						// Soft for the transient `busy` (it flips inside this switch's own handler, so a
						// native disable strands focus on `<body>`); native for the durable permission.
						disabled={!canWrite}
						aria-disabled={busy || undefined}
						// Without this the accessible name of the campaign-wide AI kill switch was just its
						// own state word — a screen reader announced "Off, switch, off".
						aria-label="AI and agent access"
						label={mcp.enabled ? 'Enabled' : 'Off'}
						onChange={() =>
							run(
								{ type: 'mcp.set-enabled', actorId, payload: { enabled: !mcp.enabled } },
								mcp.enabled
									? 'Agent access turned off.'
									: 'Agent access turned on — the policies below now apply.',
							)
						}
					/>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This switch controls every assistant connection for this campaign. Turning it off
					immediately blocks all campaign tool access, regardless of the saved provider key or
					individual agent policy.
				</div>
				<div
					style={{
						marginTop: 8,
						padding: '9px 12px',
						borderRadius: 9,
						border: `1px solid ${T.bd}`,
						background: T.alt,
						font: `12px/1.6 ${T.sans}`,
						color: T.ter,
					}}
				>
					The built-in assistant uses the provider configured below. Each agent also needs an
					identity and policy, so you stay in control of what it can read and whether proposed
					changes need review.
				</div>
				<SetRow
					label="Default posture for new agents"
					help="The starting policy for a new connection. New agents can be disabled or require review; they never start with direct write access."
					control={
						<Seg
							value={mcp.vaultDefaultMode}
							ariaLabel="Vault default agent posture"
							onChange={(v) => {
								if (!canWrite || busy) return;
								run(
									{ type: 'mcp.set-vault-default', actorId, payload: { mode: v } },
									`New agents now default to ${MCP_MODE_LABEL[v as McpPolicyMode]}.`,
								);
							}}
							options={[
								{ value: 'strict_review', label: 'Strict review' },
								{ value: 'disabled', label: 'Disabled' },
							]}
						/>
					}
				/>
			</Panel>

			<AiProviderPanel onConfiguredChange={() => bumpAiConfig((v) => v + 1)} />

			<AiAssistantPanel canWrite={canWrite} />

			<Panel title="Agent connections" action={<Badge status="neutral">{bindings.length}</Badge>}>
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					Each connection uses one campaign identity and gains no permissions of its own. It can
					never see or do more than that identity, and its policy decides whether changes require
					review.
				</div>
				{bindings.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						No agent connections registered yet — register one below to author its policy ahead of
						time.
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{bindings.map((b, i) => {
							const policy = mcp.policies[b.agentId] ?? null;
							const mode: McpPolicyMode = policy?.mode ?? mcp.vaultDefaultMode;
							const allowedToolIds = policy?.allowedToolIds ?? [];
							const baselineMembership = baselineAllowlistMembership(allowedToolIds);
							return (
								<div
									key={b.agentId}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 10,
										padding: '11px 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
										flexWrap: 'wrap',
									}}
								>
									<Icon name="sparkle" size={16} color={T.acc} />
									<div style={{ flex: '1 1 180px', minWidth: 0 }}>
										<div style={{ font: `600 13px ${T.sans}` }}>{b.label || b.agentId}</div>
										<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
											{b.agentId} → {actorName(b.actorId)}
										</div>
									</div>
									{/* `policy` is null for a freshly registered binding, and the registration's
									    own success message says it "starts with the campaign default until you
									    set a policy" — so an unconditional "Policy saved" contradicted the
									    toast sitting beside it. */}
									<Badge status={policy ? 'neutral' : 'warning'}>
										{policy ? 'Policy saved' : 'Using campaign default'}
									</Badge>
									<span style={{ flex: '0 0 150px' }}>
										<Select
											aria-label={`Policy mode for ${b.label || b.agentId}`}
											value={mode}
											disabled={!canWrite || busy}
											onChange={(e: { target: { value: string } }) =>
												run(
													{
														type: 'mcp.set-agent-policy',
														actorId,
														payload: {
															agentId: b.agentId,
															mode: e.target.value,
															allowedToolIds: policy?.allowedToolIds ?? [],
															auditVisible: policy?.auditVisible ?? true,
														},
													},
													`${b.label || b.agentId} set to ${MCP_MODE_LABEL[e.target.value as McpPolicyMode]}.`,
												)
											}
											options={MCP_POLICY_MODES.map((m) => ({
												value: m,
												label: MCP_MODE_LABEL[m],
											}))}
										/>
									</span>
									<Switch
										checked={baselineMembership.all}
										// Soft for the transient `busy` — see the AI kill switch above.
										disabled={!canWrite}
										aria-disabled={busy || undefined}
										label={
											baselineMembership.some && !baselineMembership.all
												? `Baseline tools (${baselineMembership.count}/${baselineMembership.total})`
												: 'Baseline tools'
										}
										onChange={() =>
											run(
												{
													type: 'mcp.set-agent-policy',
													actorId,
													payload: {
														agentId: b.agentId,
														mode,
														allowedToolIds: toggleBaselineToolAllowlist(allowedToolIds),
														auditVisible: policy?.auditVisible ?? true,
													},
												},
												baselineMembership.all
													? 'Baseline tools removed; custom tool grants were preserved.'
													: 'The complete current baseline was granted; custom tool grants were preserved.',
											)
										}
									/>
									{confirmRemoveAgentId === b.agentId ? (
										<>
											<Button
												variant="danger"
												size="sm"
												disabled={!canWrite || busy}
												onClick={() => {
													setConfirmRemoveAgentId(null);
													run(
														{
															type: 'mcp.remove-agent-binding',
															actorId,
															payload: { agentId: b.agentId },
														},
														`${b.label || b.agentId} removed — its pending proposals expire.`,
													);
												}}
											>
												Confirm remove
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setConfirmRemoveAgentId(null)}
											>
												Keep
											</Button>
										</>
									) : (
										<Button
											variant="ghost"
											size="sm"
											icon="trash"
											disabled={!canWrite || busy}
											onClick={() => setConfirmRemoveAgentId(b.agentId)}
										>
											Remove
										</Button>
									)}
								</div>
							);
						})}
					</div>
				)}
				<div
					style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}
				>
					<span style={{ flex: '1 1 140px', minWidth: 120 }}>
						<Input
							value={newAgentId}
							onChange={(e: { target: { value: string } }) => setNewAgentId(e.target.value)}
							placeholder="Agent id (e.g. prep-assistant)"
							aria-label="Agent connection id"
							maxLength={60}
						/>
					</span>
					<span style={{ flex: '1 1 140px', minWidth: 120 }}>
						<Input
							value={newLabel}
							onChange={(e: { target: { value: string } }) => setNewLabel(e.target.value)}
							placeholder="Label (optional)"
							aria-label="Agent label"
							maxLength={80}
						/>
					</span>
					<span style={{ flex: '0 0 170px' }}>
						<Select
							aria-label="Campaign identity the agent uses"
							value={selectedNewActorId}
							onChange={(e: { target: { value: string } }) => setNewActorId(e.target.value)}
							options={actors.map((a) => ({ value: a.id, label: `${a.displayName} (${a.role})` }))}
						/>
					</span>
					<Button
						variant="primary"
						size="sm"
						icon="add"
						disabled={!canWrite || busy}
						onClick={registerAgent}
					>
						Register
					</Button>
				</div>
			</Panel>

			<Panel
				title="Staged writes awaiting review"
				action={<Badge status={pending.length ? 'warning' : 'success'}>{pending.length}</Badge>}
			>
				{pending.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						Nothing staged. Under strict review, every agent write lands here as a proposal you
						approve or reject — nothing an agent does commits without you.
					</div>
				) : (
					pending.map((pr, i) => (
						<div
							key={pr.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								padding: '10px 0',
								borderTop: i ? `1px solid ${T.bd}` : 'none',
								flexWrap: 'wrap',
							}}
						>
							<Icon name="warning" size={15} color={T.warn} />
							<div style={{ flex: '1 1 200px', minWidth: 0 }}>
								<div style={{ font: `600 13px ${T.sans}` }}>{pr.commandType}</div>
								<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
									{pr.agentId} as {actorName(pr.actorId)} · {pr.toolId} · {pr.writeRisk}
								</div>
							</div>
							<Button
								variant="secondary"
								size="sm"
								icon="check"
								disabled={!canWrite || busy}
								onClick={() =>
									run(
										{ type: 'mcp.approve-proposal', actorId, payload: { proposalId: pr.id } },
										'Proposal approved and committed through the normal dispatch.',
									)
								}
							>
								Approve
							</Button>
							<Button
								variant="ghost"
								size="sm"
								icon="close"
								disabled={!canWrite || busy}
								onClick={() =>
									run(
										{ type: 'mcp.reject-proposal', actorId, payload: { proposalId: pr.id } },
										'Proposal rejected — nothing was written.',
									)
								}
							>
								Reject
							</Button>
						</div>
					))
				)}
			</Panel>

			<Panel title="Tool registry (baseline)">
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					The campaign tools an agent may be granted. Read results respect its chosen identity, and
					changes wait for review unless you explicitly choose a more permissive policy.
				</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
					{MCP_BASELINE_TOOL_IDS.map((t) => (
						<Chip key={t} tone="neutral">
							{t}
						</Chip>
					))}
				</div>
				{recentAudit.length > 0 && (
					<div style={{ marginTop: 12 }}>
						<div
							style={{
								font: `600 11px ${T.sans}`,
								letterSpacing: '.08em',
								textTransform: 'uppercase',
								color: T.ter,
								marginBottom: 6,
							}}
						>
							Recent agent activity
						</div>
						{recentAudit.map((a) => (
							<div
								key={a.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									padding: '5px 0',
									font: `12px ${T.sans}`,
									color: T.sub,
								}}
							>
								<Badge
									status={a.mode === 'denied' ? 'error' : a.mode === 'staged' ? 'warning' : 'info'}
								>
									{a.mode}
								</Badge>
								<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
									{a.agentId} · {a.toolId}
								</span>
								<span style={{ marginLeft: 'auto', font: `11px ${T.sans}`, color: T.ter }}>
									{new Date(a.recordedAt).toLocaleString()}
								</span>
							</div>
						))}
					</div>
				)}
			</Panel>
		</div>
	);
}
