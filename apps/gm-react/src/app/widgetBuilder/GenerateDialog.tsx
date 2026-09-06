import { useMemo, useRef, useState } from 'react';
import type { WidgetPackageDefinition } from '@dndtools/core';
import { Button, Dialog, Field, Textarea } from '../../ds';
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

/**
 * "Generate a widget" (RC-WID-3.2) — the one place the assistant is asked to author a widget.
 *
 * The DM describes what they want; the run offers the model exactly ONE tool,
 * `widget.package.propose` (RC-WID-3.1), which cannot express code, host permissions, or a network
 * destination. Whatever the model composes is STAGED by the core as a proposal, never applied — so
 * when the run ends this dialog does not install anything. It reads the staged proposal's package
 * out of the MCP slice and hands it to the manual builder, which opens on the Review step with
 * every generated field editable and the same trust summary a hand-built widget is judged by.
 * Nothing is installed until the DM presses Install there.
 *
 * The staged proposal is deliberately LEFT PENDING in Settings → AI & tools. The agent proposed it;
 * withdrawing it on the DM's behalf is a disposal this dialog has no mandate for, and if the DM
 * installs from the builder instead, approving the leftover proposal afterwards fails closed on its
 * own (install refuses to overwrite a live package).
 *
 * Fail closed: with no provider key, MCP off, or no agent allowed to use the widget tool, there is
 * no send affordance at all — just the first unmet prerequisite, stated plainly.
 */

const PROPOSE_TOOL_ID = 'widget.package.propose';

/** The instruction wrapped around the DM's own words. The system prompt is the assistant's; this is
 *  the task, and it says out loud that the DM reviews the result. */
function generationAsk(prompt: string): string {
	return [
		'Author one Lamplight widget for this campaign and propose it with the',
		`${PROPOSE_TOOL_ID} tool. Call that tool exactly once, then stop and say in one sentence`,
		'what you made. The DM reviews and edits every field before anything is installed, so',
		'propose your best complete draft rather than asking follow-up questions.',
		'',
		'What the DM asked for:',
		prompt,
	].join(' \n');
}

/** The package a staged `widget.package.install` proposal carries, if it carries a plausible one. */
function proposedPackage(payload: unknown): WidgetPackageDefinition | null {
	if (typeof payload !== 'object' || payload === null) return null;
	const pkg = (payload as { package?: unknown }).package;
	if (typeof pkg !== 'object' || pkg === null) return null;
	const candidate = pkg as WidgetPackageDefinition;
	return typeof candidate.id === 'string' && Array.isArray(candidate.widgets) ? candidate : null;
}

export function GenerateDialog({
	open,
	onClose,
	onGenerated,
}: {
	open: boolean;
	onClose: () => void;
	/** The staged proposal's package, handed to the builder's Review step. Never installed here. */
	onGenerated: (pkg: WidgetPackageDefinition) => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const mcp = runtime.state.mcp;
	const dmId = runtime.defaultActorId;
	const canWrite = runtime.state.permissions.actors[dmId]?.role === 'dm' && !runtime.preview;

	const [prompt, setPrompt] = useState('');
	const [running, setRunning] = useState(false);
	const [runStatus, setRunStatus] = useState<AssistantRunStatus | null>(null);
	const [progress, setProgress] = useState<{ pass: number; total: number; toolId?: string }>({
		pass: 0,
		total: 0,
	});
	const [failure, setFailure] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	// One tool, and only one: the model is never offered the rest of the baseline on this run.
	const tools = useMemo(
		() => buildAiToolSpecs().filter((spec) => spec.name === providerToolName(PROPOSE_TOOL_ID)),
		[],
	);

	// The first agent whose policy actually allows the widget tool. An agent without it would be
	// denied at the policy gate, so offering the run against one would be a dead control.
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

	const close = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		onClose();
	};

	const generate = () => {
		const text = prompt.trim();
		const config = resolveAiProviderConfig();
		if (text === '' || running || blockerKey !== null || config === null) return;
		setRunning(true);
		setFailure(null);
		setRunStatus('starting');
		setProgress({ pass: 0, total: 0 });
		const controller = new AbortController();
		abortRef.current = controller;
		// Everything already staged, so the run's own proposal is identified by what is NEW rather
		// than by parsing a message.
		const before = new Set(Object.keys(runtime.state.mcp.proposals));
		void runAssistantExchange({
			send: (req, options) => sendAiChat(config, req, options),
			invoke: (toolId, input) =>
				runtime.invokeAgentTool({ agentId, toolId, input, forceStageWrites: true }),
			tools,
			turns: [],
			userText: generationAsk(text),
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
					onGenerated(pkg);
					return;
				}
				// No proposal means the model answered without authoring anything, or the core denied
				// the call. Say so; never pretend a widget exists.
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

	// The ADR-025 phase line: which pass is in flight and which tool it is calling.
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
			title={t('widgetGen.title')}
			description={t('widgetGen.intro')}
			size="md"
			backdropDismissible={false}
			data-testid="widget-generate-dialog"
			footer={
				<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
					<Button variant="ghost" size="sm" onClick={close}>
						{running ? t('widgetGen.cancel') : t('common.action.close')}
					</Button>
					{blockerKey === null && (
						<Button
							variant="primary"
							size="sm"
							icon="sparkle"
							disabled={running || prompt.trim() === ''}
							onClick={generate}
						>
							{t('widgetGen.generate')}
						</Button>
					)}
				</div>
			}
		>
			{blockerKey ? (
				<div
					role="status"
					style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}
					data-testid="widget-generate-blocker"
				>
					{t(blockerKey)}
				</div>
			) : (
				<>
					<Field label={t('widgetGen.promptField')} help={t('widgetGen.promptHelp')}>
						<Textarea
							value={prompt}
							onChange={(e: { target: { value: string } }) => setPrompt(e.target.value)}
							rows={4}
							disabled={running}
							maxLength={2000}
							placeholder={t('widgetGen.promptPlaceholder')}
						/>
					</Field>
					<div
						role="status"
						aria-live="polite"
						style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, minHeight: 19 }}
						data-testid="widget-generate-status"
					>
						{statusText ?? ''}
					</div>
					{failure && (
						<div
							role="alert"
							style={{ font: `12px/1.6 ${T.sans}`, color: 'var(--color-status-error)' }}
							data-testid="widget-generate-failure"
						>
							{failure}
						</div>
					)}
					<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>
						{t('widgetGen.reviewNote')}
					</div>
				</>
			)}
		</Dialog>
	);
}
