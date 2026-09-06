import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Icon, Select, Skeleton, Switch, Textarea, Toaster } from '../../ds';
import { Panel, T, srOnly } from '../../app/screen-kit';
import { useI18n, type MessageKey, type MessageValues } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	platformNotifications,
	usePlatformCapabilities,
	type PlatformNotificationPermission,
} from '../../platform/capabilities';
import { isAiProviderConfigured, resolveAiProviderConfig } from '../../ai/providerConfig';
import { sendAiChat, type AiTurn } from '../../ai/transport';
import {
	buildAiToolSpecs,
	runAssistantExchange,
	type AssistantEvent,
	type AssistantRunStatus,
} from '../../ai/mcpBridge';
/* ---- The assistant itself (ADR-025 — one ask at a time, run as a registered agent) --------------- */
/** The offered tool surface, projected once from the Core's declared registry (pure). */
const AI_TOOL_SPECS = buildAiToolSpecs();

/** One rendered assistant-feed entry (the user ask, assistant text, or a tool-call outcome). */
type AssistantFeedItem = { kind: 'user'; text: string } | ({ kind: 'event' } & AssistantEvent);

const TOOL_OUTCOME_BADGE: Record<string, { status: string; label: MessageKey }> = {
	read: { status: 'info', label: 'settings.assistant.outcome.read' },
	staged: { status: 'warning', label: 'settings.assistant.outcome.staged' },
	'direct-write': { status: 'success', label: 'settings.assistant.outcome.committed' },
	denied: { status: 'error', label: 'settings.assistant.outcome.denied' },
	error: { status: 'error', label: 'settings.assistant.outcome.failed' },
};

/** Renders one catalog message — the panel's `t`, handed to the module-level helpers below. */
type Translate = (key: MessageKey, values?: MessageValues) => string;

// Device-local preference: also raise a desktop notification when a run finishes (opt-in; the browser
// still gates it behind its own permission prompt). Carries no data — a boolean in localStorage.
const AI_NOTIFY_KEY = 'dndtools.ai.notify-on-complete';

function aiNotifyEnabled(): boolean {
	try {
		return localStorage.getItem(AI_NOTIFY_KEY) === '1';
	} catch {
		return false;
	}
}

function persistAiNotifyEnabled(enabled: boolean): void {
	try {
		localStorage.setItem(AI_NOTIFY_KEY, enabled ? '1' : '0');
	} catch {
		/* preference is best-effort */
	}
}

/** Best-effort platform notification; permission was granted during explicit opt-in. */
function maybePlatformNotify(title: string, body: string): void {
	if (!aiNotifyEnabled()) return;
	void platformNotifications.notify(title, body).catch(() => false);
}

/** The completion protocol: an in-app toast on every terminal state, plus the opt-in desktop ping. */
function notifyRunComplete(
	t: Translate,
	status: AssistantRunStatus,
	events: AssistantEvent[],
): void {
	const staged = events.filter((e) => e.type === 'tool' && e.outcome === 'staged').length;
	// The staged count is a clause inside the sentence, not a sentence of its own, so each terminal
	// message formats it as one plural argument rather than gluing two fragments together.
	switch (status) {
		case 'completed':
			Toaster.success(t('settings.assistant.finished', { staged }));
			maybePlatformNotify(
				t('settings.assistant.finishedTitle'),
				t('settings.assistant.finishedBody', { staged }),
			);
			break;
		case 'budget-exhausted':
			Toaster.info(t('settings.assistant.stepLimit', { staged }));
			maybePlatformNotify(
				t('settings.assistant.stepLimitTitle'),
				t('settings.assistant.stepLimitBody'),
			);
			break;
		case 'cancelled':
			Toaster.info(t('settings.assistant.cancelled'));
			break;
		case 'failed':
			Toaster.error(t('settings.assistant.stopped'));
			maybePlatformNotify(
				t('settings.assistant.stoppedTitle'),
				t('settings.assistant.stoppedBody'),
			);
			break;
		default:
			break;
	}
}

/**
 * The assistant — one ask at a time, run AS a registered agent connection through the Core's
 * fail-closed pipeline. Reads come back actor-filtered; writes surface as staged proposals in the
 * review panel below. Disabled honestly (with the reason) until every prerequisite is real:
 * provider key, MCP master switch, a registered binding, DM + not previewing.
 */
export function AiAssistantPanel({ canWrite }: { canWrite: boolean }) {
	const { t } = useI18n();
	const capabilities = usePlatformCapabilities();
	const runtime = useRuntime();
	const mcp = runtime.state.mcp;
	const bindings = Object.values(mcp.bindings);
	// `configured` re-reads on every render; the parent bumps its own state on a provider-config
	// change (see SettingsAI), which re-renders this sibling — no local mirror of ai/ module state.
	const configured = isAiProviderConfigured();
	const [agentId, setAgentId] = useState<string>(bindings[0]?.agentId ?? '');
	const [input, setInput] = useState('');
	const [feed, setFeed] = useState<AssistantFeedItem[]>([]);
	const [turns, setTurns] = useState<AiTurn[]>([]);
	const [asking, setAsking] = useState(false);
	// Live run protocol (ADR-025): the current phase + which pass/tool is in flight, streamed from
	// runAssistantExchange's onEvent, so the panel shows progress instead of a silent spinner.
	const [runStatus, setRunStatus] = useState<AssistantRunStatus | null>(null);
	const [progress, setProgress] = useState<{ pass: number; maxPasses: number; toolId?: string }>({
		pass: 0,
		maxPasses: 0,
	});
	const [notify, setNotify] = useState(aiNotifyEnabled());
	const abortRef = useRef<AbortController | null>(null);
	// An agentic run appends events below the fold; without this the panel silently stops updating
	// as far as the reader is concerned.
	const transcriptRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const el = transcriptRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [feed.length]);

	useEffect(() => {
		if (!notify) return;
		let cancelled = false;
		void platformNotifications
			.permission()
			.then((permission) => {
				if (cancelled || permission === 'granted') return;
				setNotify(false);
				persistAiNotifyEnabled(false);
			})
			.catch(() => {
				if (cancelled) return;
				setNotify(false);
				persistAiNotifyEnabled(false);
			});
		return () => {
			cancelled = true;
		};
	}, [notify]);

	const selectedAgent = mcp.bindings[agentId] ? agentId : (bindings[0]?.agentId ?? '');
	const blockerKey: MessageKey | null = !configured
		? 'settings.assistant.blockerNoKey'
		: !mcp.enabled
			? 'settings.assistant.blockerDisabled'
			: bindings.length === 0
				? 'settings.assistant.blockerNoAgent'
				: !canWrite
					? 'settings.assistant.blockerNotDm'
					: null;
	const blocker = blockerKey ? t(blockerKey) : null;

	const ask = () => {
		const text = input.trim();
		if (text === '' || asking || blocker !== null || selectedAgent === '') return;
		setAsking(true);
		setInput('');
		setFeed((prev) => [...prev, { kind: 'user', text }]);
		setRunStatus('starting');
		setProgress({ pass: 0, maxPasses: 0 });
		const controller = new AbortController();
		abortRef.current = controller;
		const config = resolveAiProviderConfig();
		void runAssistantExchange({
			send: (req) => sendAiChat(config, req),
			invoke: (toolId, toolInput) =>
				runtime.invokeAgentTool({
					agentId: selectedAgent,
					toolId,
					input: toolInput,
					forceStageWrites: true,
				}),
			tools: AI_TOOL_SPECS,
			turns,
			userText: text,
			signal: controller.signal,
			// Stream each display event + status transition live. Feed events append incrementally, so a
			// long multi-step run reveals its tool calls as they happen (no re-append in `.then`).
			onEvent: (event) => {
				if (event.type === 'feed') {
					setFeed((prev) => [...prev, { kind: 'event', ...event.event }]);
				} else {
					setRunStatus(event.status);
					setProgress({ pass: event.pass, maxPasses: event.maxPasses, toolId: event.activeToolId });
				}
			},
		})
			.then((result) => {
				setTurns(result.turns);
				notifyRunComplete(t, result.status, result.events);
			})
			.finally(() => {
				setAsking(false);
				setRunStatus(null);
				abortRef.current = null;
			});
	};

	// The one-line phase readout shown while a run is in flight (the "keep the user informed" protocol).
	const statusText =
		runStatus === 'starting'
			? t('settings.assistant.starting')
			: runStatus === 'working'
				? t(progress.toolId ? 'settings.assistant.workingOnTool' : 'settings.assistant.working', {
						pass: progress.pass,
						total: progress.maxPasses,
						tool: progress.toolId ?? '',
					})
				: asking
					? t('settings.assistant.finishing')
					: null;

	const toggleNotify = async (on: boolean) => {
		if (!on) {
			setNotify(false);
			persistAiNotifyEnabled(false);
			return;
		}
		if (!platformNotifications.available()) return;
		let permission: PlatformNotificationPermission;
		try {
			permission = await platformNotifications.permission();
			if (permission === 'prompt') {
				permission = await platformNotifications.requestPermission();
			}
		} catch {
			permission = 'denied';
		}
		if (permission !== 'granted') {
			setNotify(false);
			persistAiNotifyEnabled(false);
			Toaster.warning(t('settings.assistant.notifyDenied'));
			return;
		}
		setNotify(true);
		persistAiNotifyEnabled(true);
	};

	return (
		<Panel
			title={t('settings.assistant.title')}
			action={
				asking ? (
					<Badge status="info">{statusText ?? t('settings.assistant.workingShort')}</Badge>
				) : undefined
			}
		>
			<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter }}>
				{t('settings.assistant.intro')}
			</div>
			{blocker !== null ? (
				<div
					style={{
						padding: '9px 12px',
						borderRadius: 9,
						border: `1px solid ${T.bd}`,
						background: T.alt,
						font: `12px/1.6 ${T.sans}`,
						color: T.ter,
					}}
				>
					{blocker}
				</div>
			) : (
				<>
					{feed.length > 0 && (
						// The transcript is a bounded scroll region whose every descendant is a plain
						// <div>, so before `tabIndex` a keyboard user could not read past the first 320px
						// of an agentic run at all (WCAG 2.1.1). `role="log"` is the right live-region
						// role for an append-only transcript, and the ref keeps the newest event in view.
						<div
							ref={transcriptRef}
							tabIndex={0}
							role="log"
							aria-label={t('settings.assistant.transcript')}
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 8,
								maxHeight: 320,
								overflowY: 'auto',
								padding: '4px 0',
							}}
						>
							{feed.map((item, i) => {
								if (item.kind === 'user') {
									return (
										<div
											key={i}
											style={{
												alignSelf: 'flex-end',
												maxWidth: '85%',
												padding: '7px 11px',
												borderRadius: 10,
												background: T.accSub,
												border: `1px solid ${T.accBd}`,
												font: `12.5px/1.55 ${T.sans}`,
												color: T.ink,
												whiteSpace: 'pre-wrap',
											}}
										>
											{/* Speaker was alignment + background colour only, so the whole
											    exchange reached AT as one undifferentiated stream. */}
											<span style={srOnly}>{t('settings.assistant.youSaid')} </span>
											{item.text}
										</div>
									);
								}
								if (item.type === 'text') {
									return (
										<div
											key={i}
											style={{
												alignSelf: 'flex-start',
												maxWidth: '85%',
												padding: '7px 11px',
												borderRadius: 10,
												background: T.alt,
												border: `1px solid ${T.bd}`,
												font: `12.5px/1.55 ${T.sans}`,
												color: T.ink,
												whiteSpace: 'pre-wrap',
											}}
										>
											<span style={srOnly}>{t('settings.assistant.assistantSaid')} </span>
											{item.text}
										</div>
									);
								}
								const badge = TOOL_OUTCOME_BADGE[item.outcome] ?? TOOL_OUTCOME_BADGE.error;
								return (
									<div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
										<div
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 8,
												font: `11.5px ${T.sans}`,
												color: T.ter,
											}}
										>
											<Icon name="sparkle" size={13} color={T.ter} />
											<span style={{ font: `11.5px ${T.mono}` }}>{item.toolId}</span>
											<Badge status={badge.status}>{t(badge.label)}</Badge>
											<span
												style={{
													minWidth: 0,
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
												}}
											>
												{item.detail}
											</span>
										</div>
										{item.issues && item.issues.length > 0 && (
											// Inline validation: the exact fields the Core rejected, so the user watches
											// the model fix its input on the next step.
											<div style={{ marginLeft: 21, font: `11px ${T.mono}`, color: T.err }}>
												{item.issues.map((issue, k) => (
													<div key={k}>
														{issue.path ? `${issue.path}: ` : ''}
														{issue.message}
													</div>
												))}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
					{asking && (
						// The "static structure while the model processes" (ADR-025): a skeleton stands in for
						// the forthcoming answer, with a live phase line and a Cancel that aborts between steps.
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 8,
								padding: '10px 12px',
								borderRadius: 9,
								border: `1px solid ${T.bd}`,
								background: T.alt,
							}}
						>
							<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
								<Badge status="info">{statusText ?? t('settings.assistant.workingShort')}</Badge>
								<div style={{ flex: 1 }} />
								<Button
									variant="ghost"
									size="sm"
									icon="close"
									onClick={() => abortRef.current?.abort()}
								>
									{t('common.action.cancel')}
								</Button>
							</div>
							<Skeleton variant="text" lines={3} />
						</div>
					)}
					<Switch
						checked={notify}
						onChange={(on: boolean) => void toggleNotify(on)}
						disabled={!capabilities.notifications.available}
						label={
							!capabilities.notifications.available
								? (capabilities.notifications.unavailableMessage ??
									t('settings.assistant.notifyUnavailable'))
								: t('settings.assistant.notifyLabel')
						}
					/>
					<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
						<span style={{ flex: '0 0 200px' }}>
							<Select
								aria-label={t('settings.assistant.agentSelect')}
								value={selectedAgent}
								disabled={asking}
								onChange={(e: { target: { value: string } }) => setAgentId(e.target.value)}
								options={bindings.map((b) => ({ value: b.agentId, label: b.label || b.agentId }))}
							/>
						</span>
						<span style={{ flex: '1 1 240px', minWidth: 200 }}>
							<Textarea
								value={input}
								rows={2}
								aria-label={t('settings.assistant.askLabel')}
								placeholder={t('settings.assistant.askPlaceholder')}
								disabled={asking}
								onChange={(e: { target: { value: string } }) => setInput(e.target.value)}
								onKeyDown={(e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										ask();
									}
								}}
							/>
						</span>
						<Button
							variant="primary"
							size="sm"
							icon="sparkle"
							disabled={asking || input.trim() === ''}
							onClick={ask}
						>
							{asking ? t('settings.assistant.asking') : t('settings.assistant.ask')}
						</Button>
					</div>
				</>
			)}
		</Panel>
	);
}
