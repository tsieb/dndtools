import { useMemo, useRef, useState } from 'react';
import type { WidgetPackageDefinition } from '@dndtools/core';
import { Button, Checkbox, Dialog, Field, Textarea } from '../../ds';
import { T } from '../screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { isAiProviderConfigured, resolveAiProviderConfig } from '../../ai/providerConfig';
import {
	buildAiToolSpecs,
	providerToolName,
	runAssistantExchange,
	type AssistantRunStatus,
} from '../../ai/mcpBridge';
import { sendAiChat } from '../../ai/transport';
import { useI18n, type MessageKey } from '../../i18n';
import { buildPackage, readPackage, type WidgetDraft } from './draft';
import { diffDrafts, type DraftFieldDiff } from './draftDiff';

/**
 * "Ask the assistant to change…" (RC-WID-3.3) — iterate on a widget the assistant already
 * generated (RC-WID-3.2), without throwing away edits the DM already made in the builder.
 *
 * The re-run gets the CURRENT draft as its starting point (serialized the same way the Review
 * step's JSON pane shows it) and the same one-tool `widget.package.propose` run as the first
 * generation. Its result is never applied directly: `diffDrafts` compares it field-by-field
 * against the draft on screen, and the DM chooses which of those fields to bring in. Fields left
 * unchecked keep exactly what the DM already had.
 */

const PROPOSE_TOOL_ID = 'widget.package.propose';

function iterationAsk(currentPackageJson: string, ask: string): string {
	return [
		'You already authored this Lamplight widget package for this DM:',
		'',
		currentPackageJson,
		'',
		`The DM now wants a change: ${ask}`,
		'',
		`Call the ${PROPOSE_TOOL_ID} tool exactly once with your FULL revised package — every field,`,
		'not only the ones that changed — then stop and say in one sentence what you changed. The DM',
		'reviews a field-by-field diff before anything is applied, so propose your best complete',
		'revision rather than asking follow-up questions.',
	].join('\n');
}

/** The package a staged `widget.package.install` proposal carries, if it carries a plausible one. */
function proposedPackage(payload: unknown): WidgetPackageDefinition | null {
	if (typeof payload !== 'object' || payload === null) return null;
	const pkg = (payload as { package?: unknown }).package;
	if (typeof pkg !== 'object' || pkg === null) return null;
	const candidate = pkg as WidgetPackageDefinition;
	return typeof candidate.id === 'string' && Array.isArray(candidate.widgets) ? candidate : null;
}

export function IterateDialog({
	open,
	onClose,
	draft,
	onApply,
}: {
	open: boolean;
	onClose: () => void;
	/** The draft on screen, unmodified until the DM applies a chosen subset of the diff. */
	draft: WidgetDraft;
	/** Only the fields the DM checked, copied from the re-run's draft. */
	onApply: (fields: readonly (keyof WidgetDraft)[], revised: WidgetDraft) => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const mcp = runtime.state.mcp;
	const dmId = runtime.defaultActorId;
	const canWrite = runtime.state.permissions.actors[dmId]?.role === 'dm' && !runtime.preview;

	const [ask, setAsk] = useState('');
	const [running, setRunning] = useState(false);
	const [runStatus, setRunStatus] = useState<AssistantRunStatus | null>(null);
	const [progress, setProgress] = useState<{ pass: number; total: number; toolId?: string }>({
		pass: 0,
		total: 0,
	});
	const [failure, setFailure] = useState<string | null>(null);
	const [revised, setRevised] = useState<WidgetDraft | null>(null);
	const [diffs, setDiffs] = useState<DraftFieldDiff[]>([]);
	const [selected, setSelected] = useState<Set<keyof WidgetDraft>>(new Set());
	const abortRef = useRef<AbortController | null>(null);

	const tools = useMemo(
		() => buildAiToolSpecs().filter((spec) => spec.name === providerToolName(PROPOSE_TOOL_ID)),
		[],
	);

	const agentId = useMemo(() => {
		const allowed = Object.values(mcp.bindings)
			.map((binding) => binding.agentId)
			.filter((id) => mcp.policies[id]?.allowedToolIds.includes(PROPOSE_TOOL_ID));
		return allowed[0] ?? '';
	}, [mcp.bindings, mcp.policies]);

	const blockerKey: MessageKey | null = !canWrite
		? 'widgetGen.blockerNotDm'
		: !isAiProviderConfigured()
			? 'widgetGen.blockerNoKey'
			: !mcp.enabled
				? 'widgetGen.blockerDisabled'
				: agentId === ''
					? 'widgetGen.blockerNoAgent'
					: null;

	const reset = () => {
		setAsk('');
		setFailure(null);
		setRevised(null);
		setDiffs([]);
		setSelected(new Set());
	};

	const close = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		reset();
		onClose();
	};

	const run = () => {
		const text = ask.trim();
		const config = resolveAiProviderConfig();
		if (text === '' || running || blockerKey !== null || config === null) return;
		setRunning(true);
		setFailure(null);
		setRunStatus('starting');
		setProgress({ pass: 0, total: 0 });
		const controller = new AbortController();
		abortRef.current = controller;
		const before = new Set(Object.keys(runtime.state.mcp.proposals));
		const currentPackageJson = JSON.stringify(buildPackage(draft), null, 2);
		void runAssistantExchange({
			send: (req, options) => sendAiChat(config, req, options),
			invoke: (toolId, input) =>
				runtime.invokeAgentTool({ agentId, toolId, input, forceStageWrites: true }),
			tools,
			turns: [],
			userText: iterationAsk(currentPackageJson, text),
			signal: controller.signal,
			onEvent: (event) => {
				if (event.type !== 'status') return;
				setRunStatus(event.status);
				setProgress({
					pass: event.pass,
					total: event.maxPasses,
					...(event.activeToolId ? { toolId: event.activeToolId } : {}),
				});
			},
		})
			.then((result) => {
				if (controller.signal.aborted) return;
				const staged = Object.values(runtime.state.mcp.proposals).find(
					(proposal) =>
						!before.has(proposal.id) &&
						proposal.commandType === 'widget.package.install' &&
						proposal.status === 'pending',
				);
				const pkg = staged ? proposedPackage(staged.payload) : null;
				if (pkg) {
					const next = readPackage(pkg, 'proposed');
					const fieldDiffs = diffDrafts(draft, next);
					setRevised(next);
					setDiffs(fieldDiffs);
					// Every changed field starts checked: the DM asked for a change and unchecking a field
					// they don't want is one click, same as accepting the whole diff.
					setSelected(new Set(fieldDiffs.map((d) => d.field)));
					return;
				}
				const spoken = [...result.events]
					.reverse()
					.find((event) => event.type === 'text' || event.type === 'tool');
				const detail =
					spoken?.type === 'text' ? spoken.text : spoken?.type === 'tool' ? spoken.detail : '';
				setFailure(
					detail !== '' ? t('widgetGen.noWidgetDetail', { detail }) : t('widgetGen.noWidget'),
				);
			})
			.finally(() => {
				if (abortRef.current === controller) abortRef.current = null;
				setRunning(false);
				setRunStatus(null);
			});
	};

	const toggle = (field: keyof WidgetDraft) => {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(field)) next.delete(field);
			else next.add(field);
			return next;
		});
	};

	const apply = () => {
		if (!revised) return;
		onApply([...selected], revised);
		close();
	};

	const statusText =
		runStatus === 'starting'
			? t('widgetGen.starting')
			: runStatus === 'working'
				? t(progress.toolId ? 'widgetGen.workingOnTool' : 'widgetGen.working', {
						pass: progress.pass,
						total: progress.total,
						tool: progress.toolId ?? '',
					})
				: running
					? t('widgetGen.finishing')
					: null;

	return (
		<Dialog
			open={open}
			onClose={close}
			title={t('widgetIterate.title')}
			description={t('widgetIterate.intro')}
			size="md"
			backdropDismissible={false}
			data-testid="widget-iterate-dialog"
			footer={
				<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
					<Button variant="ghost" size="sm" onClick={close}>
						{running ? t('widgetGen.cancel') : t('common.action.close')}
					</Button>
					{revised ? (
						<Button
							variant="primary"
							size="sm"
							icon="check"
							disabled={selected.size === 0}
							onClick={apply}
						>
							{t('widgetIterate.apply')}
						</Button>
					) : (
						blockerKey === null && (
							<Button
								variant="primary"
								size="sm"
								icon="sparkle"
								disabled={running || ask.trim() === ''}
								onClick={run}
							>
								{t('widgetIterate.run')}
							</Button>
						)
					)}
				</div>
			}
		>
			{blockerKey ? (
				<div
					role="status"
					style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}
					data-testid="widget-iterate-blocker"
				>
					{t(blockerKey)}
				</div>
			) : revised ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{diffs.length === 0 ? (
						<div role="status" style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
							{t('widgetIterate.noChanges')}
						</div>
					) : (
						<ul
							data-testid="widget-iterate-diff"
							style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}
						>
							{diffs.map((diff) => (
								<li
									key={diff.field}
									style={{
										display: 'grid',
										gap: 4,
										padding: 9,
										border: `1px solid ${T.bd}`,
										borderRadius: 8,
									}}
								>
									<Checkbox
										checked={selected.has(diff.field)}
										onChange={() => toggle(diff.field)}
										label={t(diff.label)}
									/>
									<div style={{ font: `12px/1.5 ${T.mono}`, color: T.ter, paddingLeft: 26 }}>
										<span style={{ textDecoration: 'line-through' }}>{diff.before}</span>
									</div>
									<div style={{ font: `12px/1.5 ${T.mono}`, color: T.ink, paddingLeft: 26 }}>
										{diff.after}
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			) : (
				<>
					<Field label={t('widgetIterate.askField')} help={t('widgetIterate.askHelp')}>
						<Textarea
							value={ask}
							onChange={(e: { target: { value: string } }) => setAsk(e.target.value)}
							rows={4}
							disabled={running}
							maxLength={2000}
							placeholder={t('widgetIterate.askPlaceholder')}
						/>
					</Field>
					<div
						role="status"
						aria-live="polite"
						style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, minHeight: 19 }}
						data-testid="widget-iterate-status"
					>
						{statusText ?? ''}
					</div>
					{failure && (
						<div
							role="alert"
							style={{ font: `12px/1.6 ${T.sans}`, color: 'var(--color-status-error)' }}
							data-testid="widget-iterate-failure"
						>
							{failure}
						</div>
					)}
				</>
			)}
		</Dialog>
	);
}
