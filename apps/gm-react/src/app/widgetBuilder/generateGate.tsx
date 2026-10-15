import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../ds';
import { T } from '../screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { routeAiTask } from '../../ai/providerConfig';
import { isAiAssistantEnabled } from '../../ai/usagePreference';
import { useI18n, type MessageKey } from '../../i18n';

/*
 * RC-WID-6.7 — whether "Generate a widget" can run, said on the gallery's Generate card with a link
 * to the Settings tab that clears it, and the "More ways to add" card itself. Kept apart from
 * `GenerateDialog` so the gallery and template picker do not load the assistant run on every board
 * (RC-ENG-3.2).
 */

export const PROPOSE_TOOL_ID = 'widget.package.propose';

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
