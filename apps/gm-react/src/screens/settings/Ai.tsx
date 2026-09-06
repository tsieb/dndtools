import { useState } from 'react';
import {
	MCP_BASELINE_TOOL_IDS,
	MCP_POLICY_MODES,
	computeMcpProposalConflict,
	type CommandResult,
	type McpPolicyMode,
	type McpStagedProposal,
} from '@dndtools/core';
import { Badge, Button, Chip, Icon, Input, Select, Switch, Toaster } from '../../ds';
import { Panel, Seg, SetRow, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { baselineAllowlistMembership, toggleBaselineToolAllowlist } from '../../ai/mcpBridge';
import { AiProviderPanel } from './AiProvider';
import { AiRouterPanel } from './AiStatus';
import { AiAssistantPanel } from './AiAssistant';
import { AiProposalPreview } from './AiProposalPreview';
import { AiProposalConflict } from './AiProposalConflict';
import { errMsg } from './shared';
/* ---- AI & tools (REAL — the durable MCP identity/policy/staged-writes slice + `mcp.*` commands,
 * PLUS the client-side provider transport (ADR-021, closing the ADR-014 deferral). The POLICY layer:
 * master enable, per-agent bindings/modes/allowlists, staged-proposal review and the audit trail all
 * dispatch validated Core commands and persist. The TRANSPORT layer: a BYO-key Anthropic / OpenAI-
 * compatible chat client (src/ai/) whose tool calls route through the SAME fail-closed agent
 * pipeline — reads are actor-filtered, writes become the staged proposals reviewed below. Fail
 * closed twice over: MCP is OFF by default, and with no API key every AI surface stays off. -------- */
const MCP_MODE_LABEL: Record<McpPolicyMode, MessageKey> = {
	disabled: 'settings.ai.mode.disabled',
	strict_review: 'settings.ai.mode.strictReview',
	balanced: 'settings.ai.mode.balanced',
	trusted_direct: 'settings.ai.mode.trustedDirect',
};

export function SettingsAI() {
	const { t, formatDate } = useI18n();
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
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.ai.commandFailed'))))
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
			Toaster.error(t('settings.ai.needIdAndIdentity'));
			return;
		}
		run(
			{
				type: 'mcp.set-agent-binding',
				actorId,
				payload: { agentId, actorId: selectedNewActorId, label: newLabel.trim() },
			},
			t('settings.ai.registered', {
				agent: agentId,
				mode: t(MCP_MODE_LABEL[mcp.vaultDefaultMode]),
			}),
		);
		setNewAgentId('');
		setNewLabel('');
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			{!canWrite && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{t('settings.ai.dmOnly')}</div>
			)}
			<Panel
				title={t('settings.ai.title')}
				action={
					<Switch
						checked={mcp.enabled}
						// Soft for the transient `busy` (it flips inside this switch's own handler, so a
						// native disable strands focus on `<body>`); native for the durable permission.
						disabled={!canWrite}
						aria-disabled={busy || undefined}
						// Without this the accessible name of the campaign-wide AI kill switch was just its
						// own state word — a screen reader announced "Off, switch, off".
						aria-label={t('settings.ai.switchLabel')}
						label={t(mcp.enabled ? 'settings.ai.enabled' : 'settings.ai.off')}
						onChange={() =>
							run(
								{ type: 'mcp.set-enabled', actorId, payload: { enabled: !mcp.enabled } },
								t(mcp.enabled ? 'settings.ai.turnedOff' : 'settings.ai.turnedOn'),
							)
						}
					/>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>{t('settings.ai.intro')}</div>
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
					{t('settings.ai.providerNote')}
				</div>
				<SetRow
					label={t('settings.ai.defaultPosture')}
					help={t('settings.ai.defaultPostureHelp')}
					control={
						<Seg
							value={mcp.vaultDefaultMode}
							ariaLabel={t('settings.ai.defaultPostureAria')}
							onChange={(v) => {
								if (!canWrite || busy) return;
								run(
									{ type: 'mcp.set-vault-default', actorId, payload: { mode: v } },
									t('settings.ai.defaultChanged', {
										mode: t(MCP_MODE_LABEL[v as McpPolicyMode]),
									}),
								);
							}}
							options={[
								{ value: 'strict_review', label: t('settings.ai.mode.strictReview') },
								{ value: 'disabled', label: t('settings.ai.mode.disabled') },
							]}
						/>
					}
				/>
			</Panel>

			<AiProviderPanel onConfiguredChange={() => bumpAiConfig((v) => v + 1)} />

			<AiRouterPanel onRoutingChange={() => bumpAiConfig((v) => v + 1)} />

			<AiAssistantPanel canWrite={canWrite} />

			<Panel
				title={t('settings.ai.connections')}
				action={<Badge status="neutral">{bindings.length}</Badge>}
			>
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					{t('settings.ai.connectionsIntro')}
				</div>
				{bindings.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{t('settings.ai.noConnections')}
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
										{t(policy ? 'settings.ai.policySaved' : 'settings.ai.usingDefault')}
									</Badge>
									<span style={{ flex: '0 0 150px' }}>
										<Select
											aria-label={t('settings.ai.policyModeFor', {
												agent: b.label || b.agentId,
											})}
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
													t('settings.ai.policyChanged', {
														agent: b.label || b.agentId,
														mode: t(MCP_MODE_LABEL[e.target.value as McpPolicyMode]),
													}),
												)
											}
											options={MCP_POLICY_MODES.map((m) => ({
												value: m,
												label: t(MCP_MODE_LABEL[m]),
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
												? t('settings.ai.baselineToolsSome', {
														count: baselineMembership.count,
														total: baselineMembership.total,
													})
												: t('settings.ai.baselineTools')
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
												t(
													baselineMembership.all
														? 'settings.ai.baselineRemoved'
														: 'settings.ai.baselineGranted',
												),
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
														t('settings.ai.agentRemoved', {
															agent: b.label || b.agentId,
														}),
													);
												}}
											>
												{t('settings.ai.confirmRemove')}
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setConfirmRemoveAgentId(null)}
											>
												{t('settings.ai.keep')}
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
											{t('common.action.remove')}
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
							placeholder={t('settings.ai.agentIdPlaceholder')}
							aria-label={t('settings.ai.agentIdLabel')}
							maxLength={60}
						/>
					</span>
					<span style={{ flex: '1 1 140px', minWidth: 120 }}>
						<Input
							value={newLabel}
							onChange={(e: { target: { value: string } }) => setNewLabel(e.target.value)}
							placeholder={t('settings.ai.agentLabelPlaceholder')}
							aria-label={t('settings.ai.agentLabelLabel')}
							maxLength={80}
						/>
					</span>
					<span style={{ flex: '0 0 170px' }}>
						<Select
							aria-label={t('settings.ai.identityLabel')}
							value={selectedNewActorId}
							onChange={(e: { target: { value: string } }) => setNewActorId(e.target.value)}
							options={actors.map((a) => ({
								value: a.id,
								label: t('settings.ai.actorOption', { name: a.displayName, role: a.role }),
							}))}
						/>
					</span>
					<Button
						variant="primary"
						size="sm"
						icon="add"
						disabled={!canWrite || busy}
						onClick={registerAgent}
					>
						{t('settings.ai.register')}
					</Button>
				</div>
			</Panel>

			<Panel
				title={t('settings.ai.stagedTitle')}
				action={<Badge status={pending.length ? 'warning' : 'success'}>{pending.length}</Badge>}
			>
				{pending.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{t('settings.ai.nothingStaged')}
					</div>
				) : (
					pending.map((pr, i) => {
						// RC-AI-2.2 — a staged rewrite whose base went stale cannot be approved as staged:
						// the commit would record a conflict and leave the note untouched while the panel
						// claimed success. When the Core reports a conflict, the three-way choice REPLACES
						// the approve control rather than sitting beside a button that cannot land.
						const conflict = computeMcpProposalConflict(runtime.state, pr);
						return (
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
										{t('settings.ai.proposalMeta', {
											agent: pr.agentId,
											actor: actorName(pr.actorId),
											tool: pr.toolId,
											risk: pr.writeRisk,
										})}
									</div>
									{/* RC-AI-2.1 — what approving this would actually change, computed by the Core. */}
									<AiProposalPreview proposal={pr} />
									{conflict !== null && (
										<AiProposalConflict
											conflict={conflict}
											canWrite={canWrite}
											busy={busy}
											onResolve={(resolution) =>
												run(
													{
														type: 'mcp.resolve-proposal-conflict',
														actorId,
														payload: { proposalId: pr.id, resolution },
													},
													t('settings.ai.conflictResolved'),
												)
											}
										/>
									)}
								</div>
								{conflict === null && (
									<Button
										variant="secondary"
										size="sm"
										icon="check"
										disabled={!canWrite || busy}
										onClick={() =>
											run(
												{ type: 'mcp.approve-proposal', actorId, payload: { proposalId: pr.id } },
												t('settings.ai.proposalApproved'),
											)
										}
									>
										{t('settings.ai.approve')}
									</Button>
								)}
								<Button
									variant="ghost"
									size="sm"
									icon="close"
									disabled={!canWrite || busy}
									onClick={() =>
										run(
											{ type: 'mcp.reject-proposal', actorId, payload: { proposalId: pr.id } },
											t('settings.ai.proposalRejected'),
										)
									}
								>
									{t('settings.ai.reject')}
								</Button>
							</div>
						);
					})
				)}
			</Panel>

			<Panel title={t('settings.ai.registryTitle')}>
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					{t('settings.ai.registryIntro')}
				</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
					{MCP_BASELINE_TOOL_IDS.map((toolId) => (
						<Chip key={toolId} tone="neutral">
							{toolId}
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
							{t('settings.ai.recentActivity')}
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
									{formatDate(new Date(a.recordedAt), {
										dateStyle: 'medium',
										timeStyle: 'short',
									})}
								</span>
							</div>
						))}
					</div>
				)}
			</Panel>
		</div>
	);
}
