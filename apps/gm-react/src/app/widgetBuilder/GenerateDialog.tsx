import { useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { WidgetPackageDefinition } from '@dndtools/core';
import { Button, Dialog, Field, Icon, Textarea } from '../../ds';
import { T } from '../screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { resolveAiProviderConfig, routeAiTask } from '../../ai/providerConfig';
import { isAiAssistantEnabled } from '../../ai/usagePreference';
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
 *
 * RC-WID-6.7 — the same gate is said on the gallery's Generate card ({@link useGenerateGate},
 * {@link GenerateGateNote}), with a link to the Settings tab that clears it, so the card never opens
 * a dialog that can only send the GM to Settings. A ready local model makes it "Generate (local)".
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

/** Whether a widget can be generated right now and, if not, the first thing to set up and where. */
export type GenerateGate =
	| { ready: true; local: boolean; agentId: string }
	| { ready: false; reason: MessageKey; settingsTab: 'ai' | 'tools' | null };

export function useGenerateGate(): GenerateGate {
	const runtime = useRuntime();
	const mcp = runtime.state.mcp;
	const dmId = runtime.defaultActorId;
	const canWrite = runtime.state.permissions.actors[dmId]?.role === 'dm' && !runtime.preview;
	// The first agent whose policy actually allows the widget tool. An agent without it would be
	// denied at the policy gate, so offering the run against one would be a dead control.
	const agentId = useMemo(() => {
		const allowed = Object.values(mcp.bindings)
			.map((binding) => binding.agentId)
			.filter((id) => mcp.policies[id]?.allowedToolIds.includes(PROPOSE_TOOL_ID));
		return allowed[0] ?? '';
	}, [mcp.bindings, mcp.policies]);
	if (!canWrite) return { ready: false, reason: 'widgetGen.blockerNotDm', settingsTab: null };
	// The assistant switch lives on Tool preferences, and the AI tab is hidden until it is on.
	if (!isAiAssistantEnabled()) {
		return { ready: false, reason: 'widgetGen.blockerConsent', settingsTab: 'tools' };
	}
	const route = routeAiTask('assistant');
	if (!route.available) {
		return { ready: false, reason: 'widgetGen.blockerNoKey', settingsTab: 'ai' };
	}
	if (!mcp.enabled) return { ready: false, reason: 'widgetGen.blockerDisabled', settingsTab: 'ai' };
	if (agentId === '')
		return { ready: false, reason: 'widgetGen.blockerNoAgent', settingsTab: 'ai' };
	return { ready: true, local: route.backendId === 'local', agentId };
}

/** The unmet prerequisite in words, and a link to the Settings tab that clears it. */
export function GenerateGateNote({
	gate,
	onFollow,
}: {
	gate: Extract<GenerateGate, { ready: false }>;
	/** Runs before the link navigates (the gallery closes itself). */
	onFollow?: () => void;
}) {
	const { t } = useI18n();
	return (
		<span
			data-testid="widget-generate-blocker"
			style={{ display: 'flex', flexDirection: 'column', gap: T.space.one }}
		>
			<span>{t(gate.reason)}</span>
			{gate.settingsTab && (
				<Link
					to={`/settings?tab=${gate.settingsTab}`}
					onClick={onFollow}
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: T.space.one,
						alignSelf: 'flex-start',
						color: T.acc,
						fontWeight: 600,
					}}
				>
					{t(gate.settingsTab === 'ai' ? 'widgetGen.openAiSettings' : 'widgetGen.openToolSettings')}
					<Icon name="arrow-right" size="sm" />
				</Link>
			)}
		</span>
	);
}

const CARD: CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'flex-start',
	gap: 'var(--space-1)',
	padding: 'var(--space-2)',
	textAlign: 'left',
	border: '1px dashed var(--color-border-strong)',
	borderRadius: 'var(--radius-md)',
	background: 'var(--color-surface-alt)',
	color: 'var(--color-text-primary)',
};

/**
 * One "More ways to add" card (RC-CAN-8.5): a dashed button with a label and a one-line hint, used
 * by the gallery and the template picker. RC-WID-6.7 — with `blocked` it is not a button: the label
 * stays, dimmed, and the note says what is missing and links to where to set it up (a link cannot
 * sit inside a button, and a button that only opens a "go to Settings" dialog is a dead end).
 */
export function CreateEntry({
	icon,
	label,
	hint,
	onClick,
	blocked,
}: {
	icon: string;
	label: string;
	hint: string;
	onClick: () => void;
	blocked?: ReactNode;
}) {
	const hintId = useId();
	const title = (
		<span
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-1)',
				font: '600 var(--text-xs) var(--font-sans)',
				color: blocked ? 'var(--color-text-secondary)' : undefined,
			}}
		>
			<Icon name={icon} size="sm" />
			{label}
		</span>
	);
	const note: CSSProperties = {
		font: 'var(--text-2xs)/1.4 var(--font-sans)',
		color: 'var(--color-text-tertiary)',
	};
	if (blocked) {
		return (
			<div role="group" aria-label={label} style={CARD}>
				{title}
				<div style={note}>{blocked}</div>
			</div>
		);
	}
	return (
		<button
			type="button"
			aria-label={label}
			aria-describedby={hintId}
			onClick={onClick}
			style={{ ...CARD, cursor: 'pointer' }}
		>
			{title}
			<span id={hintId} style={note}>
				{hint}
			</span>
		</button>
	);
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
	const gate = useGenerateGate();
	const agentId = gate.ready ? gate.agentId : '';

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

	const blocked = gate.ready ? null : gate;

	const close = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		onClose();
	};

	const generate = () => {
		const text = prompt.trim();
		const config = resolveAiProviderConfig();
		if (text === '' || running || blocked !== null || config === null) return;
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
				<div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
					<Button variant="ghost" size="sm" onClick={close}>
						{running ? t('widgetGen.cancel') : t('common.action.close')}
					</Button>
					{blocked === null && (
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
			{blocked ? (
				<div role="status" style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
					<GenerateGateNote gate={blocked} onFollow={close} />
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
						style={{ font: `var(--text-xs)/1.6 ${T.sans}`, color: T.sub, minHeight: 19 }}
						data-testid="widget-generate-status"
					>
						{statusText ?? ''}
					</div>
					{failure && (
						<div
							role="alert"
							style={{ font: `var(--text-xs)/1.6 ${T.sans}`, color: 'var(--color-status-error)' }}
							data-testid="widget-generate-failure"
						>
							{failure}
						</div>
					)}
					<div style={{ font: `var(--text-xs)/1.6 ${T.sans}`, color: T.sub }}>
						{t('widgetGen.reviewNote')}
					</div>
				</>
			)}
		</Dialog>
	);
}
