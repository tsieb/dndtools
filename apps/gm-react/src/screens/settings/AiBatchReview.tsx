import { useMemo, useState } from 'react';
import {
	computeMcpProposalConflict,
	type ActorId,
	type CommandResult,
	type McpAgentBinding,
	type McpStagedProposal,
} from '@dndtools/core';
import { Badge, Button, Checkbox, Icon, Select, Toaster } from '../../ds';
import { Panel, Seg, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { errMsg } from './shared';
import { AiProposalPreview } from './AiProposalPreview';
import { AiProposalConflict } from './AiProposalConflict';

/* ---- RC-AI-2.4 — BATCH REVIEW WITH GROUPING AND FILTERS --------------------------------------------
 * A run that stages ten notes left a DM approving or rejecting them one row at a time with no way to
 * see them by agent or narrow to the ones that actually matter. This groups the pending list by the
 * agent that staged it, adds an agent + risk filter over that grouping, and a checkbox selection that
 * batches approve/reject as a sequence of the SAME `mcp.approve-proposal` / `mcp.reject-proposal`
 * commands the single-row buttons already dispatch — no new command, no new write path. A selection
 * with an unresolved three-way conflict is skipped by "Approve selected" (the conflict panel's own
 * resolve buttons are the only way to land it) and the summary toast says so; "Reject selected" has no
 * such restriction, since rejecting a conflicted proposal just discards it like any other. */

type RiskFilter = 'all' | McpStagedProposal['writeRisk'];

export function AiBatchReviewPanel({
	pending,
	bindings,
	actorName,
	actorId,
	canWrite,
	busy,
	setBusy,
}: {
	pending: McpStagedProposal[];
	bindings: McpAgentBinding[];
	actorName: (id: string) => string;
	actorId: ActorId;
	canWrite: boolean;
	busy: boolean;
	setBusy: (busy: boolean) => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [agentFilter, setAgentFilter] = useState<string>('all');
	const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const agentLabel = (id: string): string => bindings.find((b) => b.agentId === id)?.label || id;
	const agentIdsPending = useMemo(
		() => Array.from(new Set(pending.map((p) => p.agentId))).sort(),
		[pending],
	);

	const conflictOf = (pr: McpStagedProposal) => computeMcpProposalConflict(runtime.state, pr);

	const visible = pending.filter(
		(pr) =>
			(agentFilter === 'all' || pr.agentId === agentFilter) &&
			(riskFilter === 'all' || pr.writeRisk === riskFilter),
	);
	const groups = useMemo(() => {
		const byAgent = new Map<string, McpStagedProposal[]>();
		for (const pr of visible) {
			const list = byAgent.get(pr.agentId) ?? [];
			list.push(pr);
			byAgent.set(pr.agentId, list);
		}
		return Array.from(byAgent.entries()).sort(([a], [b]) => a.localeCompare(b));
	}, [visible]);

	const toggle = (id: string) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	const toggleGroup = (ids: string[], allSelected: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			for (const id of ids) {
				if (allSelected) next.delete(id);
				else next.add(id);
			}
			return next;
		});

	const selectedVisible = visible.filter((pr) => selected.has(pr.id));
	// Batch controls (filters, selection, "Approve selected"/"Reject selected") only earn their
	// screen space once there is more than one proposal to batch — with exactly one, they would be
	// redundant with the row's own Approve/Reject and their disabled "Approve selected" button would
	// otherwise sit right next to (and be matched by any loose search for) the single row's "Approve".
	const showBatchControls = pending.length > 1;

	const runBatch = async (
		targets: McpStagedProposal[],
		toCommand: (pr: McpStagedProposal) => Parameters<typeof runtime.dispatch>[0],
	): Promise<{ ok: number; failed: number }> => {
		let ok = 0;
		let failed = 0;
		for (const pr of targets) {
			try {
				// Sequential: an earlier proposal in the batch can be the very state a later one's
				// conflict check reads, so each dispatch must land before the next is evaluated.
				const res: CommandResult = await runtime.dispatch(toCommand(pr));
				if (res.status === 'accepted') ok += 1;
				else failed += 1;
			} catch {
				failed += 1;
			}
		}
		return { ok, failed };
	};

	const approveSelected = () => {
		const approvable = selectedVisible.filter((pr) => conflictOf(pr) === null);
		const skipped = selectedVisible.length - approvable.length;
		if (approvable.length === 0) {
			Toaster.error(t('settings.ai.batchNothingApprovable'));
			return;
		}
		setBusy(true);
		void runBatch(approvable, (pr) => ({
			type: 'mcp.approve-proposal',
			actorId,
			payload: { proposalId: pr.id },
		}))
			.then(({ ok, failed }) => {
				setSelected(new Set());
				if (failed === 0 && skipped === 0)
					Toaster.success(t('settings.ai.batchApproveAllOk', { ok }));
				else Toaster.info(t('settings.ai.batchApproveResult', { ok, failed: failed + skipped }));
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.ai.commandFailed'))))
			.finally(() => setBusy(false));
	};

	const rejectSelected = () => {
		if (selectedVisible.length === 0) return;
		setBusy(true);
		void runBatch(selectedVisible, (pr) => ({
			type: 'mcp.reject-proposal',
			actorId,
			payload: { proposalId: pr.id },
		}))
			.then(({ ok, failed }) => {
				setSelected(new Set());
				if (failed === 0) Toaster.success(t('settings.ai.batchRejectAllOk', { ok }));
				else Toaster.info(t('settings.ai.batchRejectResult', { ok, failed }));
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.ai.commandFailed'))))
			.finally(() => setBusy(false));
	};

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

	return (
		<Panel
			title={t('settings.ai.stagedTitle')}
			action={<Badge status={pending.length ? 'warning' : 'success'}>{pending.length}</Badge>}
		>
			{pending.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					{t('settings.ai.nothingStaged')}
				</div>
			) : (
				<>
					{showBatchControls && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								flexWrap: 'wrap',
								marginBottom: 10,
							}}
						>
							<span style={{ flex: '0 0 170px' }}>
								<Select
									aria-label={t('settings.ai.batchFilterAgent')}
									value={agentFilter}
									onChange={(e: { target: { value: string } }) => setAgentFilter(e.target.value)}
									options={[
										{ value: 'all', label: t('settings.ai.batchFilterAgentAll') },
										...agentIdsPending.map((id) => ({ value: id, label: agentLabel(id) })),
									]}
								/>
							</span>
							<Seg
								value={riskFilter}
								ariaLabel={t('settings.ai.batchFilterRisk')}
								onChange={(v) => setRiskFilter(v as RiskFilter)}
								options={[
									{ value: 'all', label: t('settings.ai.batchFilterRiskAll') },
									{ value: 'low-risk', label: t('settings.ai.batchFilterRiskLow') },
									{ value: 'durable', label: t('settings.ai.batchFilterRiskDurable') },
								]}
							/>
							<div style={{ flex: 1 }} />
							{selectedVisible.length > 0 && (
								<Badge status="info">
									{t('settings.ai.batchSelectedCount', { count: selectedVisible.length })}
								</Badge>
							)}
							<Button
								variant="secondary"
								size="sm"
								icon="check"
								disabled={!canWrite || busy || selectedVisible.length === 0}
								onClick={approveSelected}
							>
								{t('settings.ai.batchApproveSelected')}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								icon="close"
								disabled={!canWrite || busy || selectedVisible.length === 0}
								onClick={rejectSelected}
							>
								{t('settings.ai.batchRejectSelected')}
							</Button>
						</div>
					)}
					{visible.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('settings.ai.batchNoMatch')}
						</div>
					) : (
						groups.map(([groupAgentId, groupProposals]) => {
							const groupIds = groupProposals.map((pr) => pr.id);
							const groupAllSelected = groupIds.every((id) => selected.has(id));
							return (
								<div key={groupAgentId} style={{ marginBottom: 10 }}>
									{showBatchControls && (
										<div
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 8,
												padding: '6px 0',
												font: `600 12px ${T.sans}`,
												color: T.sub,
											}}
										>
											<Checkbox
												checked={groupAllSelected}
												aria-label={t('settings.ai.batchSelectGroup', {
													agent: agentLabel(groupAgentId),
												})}
												onChange={() => toggleGroup(groupIds, groupAllSelected)}
											/>
											{t('settings.ai.batchGroupHeading', {
												agent: agentLabel(groupAgentId),
												count: groupProposals.length,
											})}
										</div>
									)}
									{groupProposals.map((pr, i) => {
										// RC-AI-2.2 — a staged rewrite whose base went stale cannot be approved as
										// staged; the three-way choice REPLACES the approve control rather than
										// sitting beside a button that cannot land.
										const conflict = conflictOf(pr);
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
												{showBatchControls && (
													<Checkbox
														checked={selected.has(pr.id)}
														aria-label={t('settings.ai.selectProposalAria', {
															agent: agentLabel(pr.agentId),
															tool: pr.toolId,
														})}
														onChange={() => toggle(pr.id)}
													/>
												)}
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
																{
																	type: 'mcp.approve-proposal',
																	actorId,
																	payload: { proposalId: pr.id },
																},
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
															{
																type: 'mcp.reject-proposal',
																actorId,
																payload: { proposalId: pr.id },
															},
															t('settings.ai.proposalRejected'),
														)
													}
												>
													{t('settings.ai.reject')}
												</Button>
											</div>
										);
									})}
								</div>
							);
						})
					)}
				</>
			)}
		</Panel>
	);
}
