import { useEffect, useState } from 'react';
import {
	getCharacterForActor,
	getCombatTrackerForActor,
	getContentItemsForActor,
	getDiceHistoryForActor,
	getMapViewForActor,
	getSessionAudioView,
	getTimerCountdown,
	parseDiceExpression,
} from '@dndtools/core';
import { Icon } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { useAssetObjectUrl } from '../platform/assetUrl';
import { pickRasterAssetId } from './mapGeometry';
import type { BoardWidget } from './board-helpers';

/**
 * widget-bodies — the representative BODY each widget renders on the scene canvas, ported from the
 * prototype's `widgets.jsx`. Where the prototype read its mock `w.props`, these read the widget's
 * REAL `configuration` (falling back to the core widget definition's declared `configFields` default),
 * so the body always reflects what the tiered inspector wrote — edit a note's heading or a timer's
 * duration and the canvas updates immediately, and the change persists through `scene.configure-widget`.
 *
 * This component renders ONLY the inner content; the `WidgetFrame` (SceneBoardCanvas) supplies the
 * shared header (glyph · title · visibility chip · type label) so view- and edit-mode chrome stay
 * identical. Bodies are LIVE where the core has a live view: the initiative tracker reads
 * `getCombatTrackerForActor`, the character body its bound character (`getCharacterForActor`), the
 * timer the durable session timer (`getTimerCountdown`), and the dice body the session dice history.
 * In VIEW mode the declared operate affordances (Roll / Start / Pause / Reset) are REAL buttons that
 * dispatch through the parent's `onCommand` (→ `widget.dispatch-command`); each is rendered only when
 * the widget's own `WidgetDefinition.commands` declares that command type. Without `onCommand`
 * (edit mode) they stay the inert, de-emphasized chips of the original design.
 */

/** Read a configuration value, falling back to the field's declared default. */
function cfg<T = unknown>(widget: BoardWidget, key: string): T | undefined {
	const raw = widget.configuration[key];
	if (raw !== undefined && raw !== null && raw !== '') return raw as T;
	const field = widget.configFields.find((f) => f.key === key);
	return field?.default as T | undefined;
}

/** Dispatch a widget-declared durable command; undefined while editing (bodies stay inert). */
export type WidgetCommandHandler = (commandType: string, payload: Record<string, unknown>) => void;

const bodyWrap: React.CSSProperties = {
	height: '100%',
	display: 'flex',
	flexDirection: 'column',
	gap: 'var(--space-2)',
	minHeight: 0,
	overflow: 'hidden',
};

/** Off-canvas but still announced — for text that only completes a visible readout's sentence. */
const SR_ONLY: React.CSSProperties = {
	position: 'absolute',
	width: 1,
	height: 1,
	margin: -1,
	padding: 0,
	overflow: 'hidden',
	clip: 'rect(0 0 0 0)',
	whiteSpace: 'nowrap',
	border: 0,
};

function Chip({
	children,
	tone = 'neutral',
}: {
	children: React.ReactNode;
	tone?: 'neutral' | 'accent';
}) {
	const accent = tone === 'accent';
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				padding: '2px 8px',
				borderRadius: 'var(--radius-full)',
				background: accent ? 'var(--color-accent-subtle)' : 'var(--color-surface-sunken)',
				color: accent ? 'var(--color-accent)' : 'var(--color-text-secondary)',
				font: '600 var(--text-2xs) var(--font-mono)',
				whiteSpace: 'nowrap',
			}}
		>
			{children}
		</span>
	);
}

const opChipStyle: React.CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: 5,
	padding: '4px 10px',
	borderRadius: 'var(--radius-sm)',
	background: 'var(--color-surface-sunken)',
	font: '600 var(--text-2xs) var(--font-sans)',
	color: 'var(--color-text-secondary)',
	whiteSpace: 'nowrap',
};

/**
 * A widget operate affordance. With `onPress` it is a REAL button (accent-toned, keyboard operable);
 * without it it renders the original inert, de-emphasized chip so edit mode keeps the same silhouette.
 */
function OpChip({
	icon,
	label,
	onPress,
	ariaLabel,
	unavailableReason,
}: {
	icon: string;
	label: string;
	onPress?: () => void;
	ariaLabel?: string;
	/** Present when the command exists but the core would refuse it right now — see below. */
	unavailableReason?: string;
}) {
	if (!onPress) {
		return (
			<span style={opChipStyle} aria-hidden>
				<Icon name={icon} size={13} /> {label}
			</span>
		);
	}
	// A SOFT disable, the pattern `Button`/`IconButton` already use: the chip keeps its place in the
	// tab order and still announces its reason, but it looks unavailable and swallows the press. The
	// alternative — rendering the inert `aria-hidden` span — hides an unexplained dead control, and
	// leaving it fully live sent a command the core rejects with an internal state-machine string.
	const unavailable = !!unavailableReason;
	return (
		<button
			className="scene-board-operation"
			type="button"
			aria-label={
				unavailable ? `${ariaLabel ?? label} — ${unavailableReason}` : (ariaLabel ?? label)
			}
			aria-disabled={unavailable || undefined}
			title={unavailableReason}
			onClick={unavailable ? undefined : onPress}
			onPointerDown={(e) => e.stopPropagation()}
			style={{
				...opChipStyle,
				minWidth: 'var(--operation-touch-target, var(--density-touch-target, auto))',
				minHeight: 'var(--operation-touch-target, var(--density-touch-target, auto))',
				border: '1px solid var(--color-border)',
				background: unavailable ? 'var(--color-surface-sunken)' : 'var(--color-accent-subtle)',
				color: unavailable ? 'var(--color-text-tertiary)' : 'var(--color-accent)',
				cursor: unavailable ? 'not-allowed' : 'pointer',
			}}
		>
			<Icon name={icon} size={13} /> {label}
		</button>
	);
}

/**
 * Dice and timer operate commands declare `writesTo: 'session'`, and the core refuses ANY such
 * command while `session.workflow` is not `'active'`
 * (`packages/core/src/commands/widget-command.ts`). The GM Screen ships seeded Dice and Timer
 * widgets, so on a fresh install the app's home dashboard offered fully live-looking accent buttons
 * whose first press printed the raw internal string "Session widget commands require an active
 * workflow; current workflow is idle." into the screen's alert region.
 */
const SESSION_ONLY_REASON = 'Go live in Session first — this reaches the table only during play.';

function useSessionOnlyReason(): string | undefined {
	const runtime = useRuntime();
	return runtime.state.session.workflow === 'active' ? undefined : SESSION_ONLY_REASON;
}

function StatPill({ label, value }: { label: string; value: string }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
			<span
				style={{
					font: '600 var(--text-2xs) var(--font-sans)',
					letterSpacing: 'var(--tracking-wide)',
					textTransform: 'uppercase',
					color: 'var(--color-text-tertiary)',
				}}
			>
				{label}
			</span>
			<span
				style={{
					font: '700 var(--text-sm) var(--font-display)',
					color: 'var(--color-text-primary)',
				}}
			>
				{value}
			</span>
		</div>
	);
}

function Muted({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-tertiary)' }}
		>
			{children}
		</div>
	);
}

function NoteBody({ widget }: { widget: BoardWidget }) {
	const heading = cfg<string>(widget, 'heading');
	const body = cfg<string>(widget, 'body');
	if (!heading && !body) return <Muted>Empty note — select the widget to add text.</Muted>;
	return (
		<div style={{ ...bodyWrap, gap: 6 }}>
			{heading && (
				<div
					style={{
						font: '700 var(--text-sm) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					{heading}
				</div>
			)}
			{body && (
				<div
					style={{
						font: 'var(--text-xs)/1.6 var(--font-sans)',
						color: 'var(--color-text-secondary)',
						overflow: 'hidden',
					}}
				>
					{body}
				</div>
			)}
		</div>
	);
}

function DiceBody({
	widget,
	onCommand,
}: {
	widget: BoardWidget;
	onCommand?: WidgetCommandHandler;
}) {
	const runtime = useRuntime();
	const formulas = (cfg<string>(widget, 'formulas') ?? 'd20')
		.split(',')
		.map((f) => f.trim())
		.filter(Boolean);

	// The last session roll matching one of this widget's formulas (actor-filtered history). The
	// engine records the CANONICAL expression ('d20' → '1d20'), so canonicalize before comparing.
	const canonical = (f: string): string => {
		const parsed = parseDiceExpression(f);
		return parsed.ok ? parsed.expression.source : f;
	};
	const history = getDiceHistoryForActor(
		runtime.state.session,
		runtime.state.permissions,
		runtime.defaultActorId,
	);
	const formulaSet = new Set(formulas.map(canonical));
	let lastRoll = null;
	for (let i = history.rolls.length - 1; i >= 0; i -= 1) {
		const roll = history.rolls[i];
		if (formulaSet.has(roll.expression)) {
			lastRoll = roll;
			break;
		}
	}

	// Only a widget whose definition DECLARES dice.roll gets a live affordance.
	const canRoll = !!onCommand && widget.commands.includes('dice.roll') && formulas.length > 0;
	const sessionOnly = useSessionOnlyReason();
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{formulas.map((f) => (
					<Chip key={f} tone="accent">
						{f}
					</Chip>
				))}
			</div>
			<div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
				<OpChip
					icon="dice"
					label="Roll"
					ariaLabel={`Roll ${formulas[0] ?? 'dice'}`}
					unavailableReason={sessionOnly}
					onPress={canRoll ? () => onCommand('dice.roll', { expression: formulas[0] }) : undefined}
				/>
				{/* The readout used to be a bare <span> carrying an `aria-label`. `role=generic`
				    PROHIBITS an accessible name, so the careful "Last result for 1d20: 15" wording
				    reached nobody — and mutating the text in place announced nothing either, so
				    pressing Roll produced no output at all for a screen-reader user. The region is
				    mounted permanently (empty before the first roll): a live region inserted TOGETHER
				    with its text is routinely dropped. The number appears exactly ONCE in the DOM —
				    only the descriptive prefix is visually hidden — so no locator becomes ambiguous. */}
				<span
					role="status"
					style={{
						font: '700 var(--text-sm) var(--font-mono)',
						color: 'var(--color-text-primary)',
					}}
				>
					{lastRoll && (
						<>
							<span style={SR_ONLY}>Last result for {lastRoll.expression} </span>= {lastRoll.total}
						</>
					)}
				</span>
			</div>
		</div>
	);
}

const URGENCY_COLOR: Record<string, string> = {
	danger: 'var(--color-status-error-text)',
	warning: 'var(--color-status-warning-text)',
	normal: 'var(--color-text-primary)',
};

function TimerBody({
	widget,
	onCommand,
}: {
	widget: BoardWidget;
	onCommand?: WidgetCommandHandler;
}) {
	const runtime = useRuntime();
	const configured = Number(cfg<number>(widget, 'durationSeconds') ?? 60) || 60;
	// The DURABLE session timer for this widget instance (SES-005); the countdown view is a pure
	// function of (timer, now) — the GUI only ticks a clock and re-derives (never owns timer state).
	const timer = runtime.state.session.timers[widget.id] ?? null;
	const [nowIso, setNowIso] = useState(() => new Date().toISOString());
	const countdown = getTimerCountdown(timer, nowIso, configured);
	const ticking = countdown.status === 'running';
	useEffect(() => {
		if (!ticking) return;
		// Re-anchor immediately: `nowIso` may be stale from mount (set before the timer started).
		setNowIso(new Date().toISOString());
		const id = window.setInterval(() => setNowIso(new Date().toISOString()), 500);
		return () => window.clearInterval(id);
	}, [ticking]);

	const declares = (type: string) => !!onCommand && widget.commands.includes(type);
	const op = (type: string, payload: Record<string, unknown> = {}) =>
		declares(type) ? () => onCommand?.(type, payload) : undefined;
	const sessionOnly = useSessionOnlyReason();
	const transport: {
		icon: string;
		label: string;
		ariaLabel?: string;
		command: string;
		payload: Record<string, unknown>;
	} =
		countdown.status === 'running'
			? { icon: 'pause', label: 'Pause', command: 'timer.pause', payload: {} }
			: countdown.status === 'paused'
				? { icon: 'play', label: 'Resume', command: 'timer.resume', payload: {} }
				: {
						icon: 'play',
						label: 'Start',
						ariaLabel: `Start ${configured}-second timer`,
						command: 'timer.start',
						payload: { durationSeconds: configured },
					};

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height: '100%' }}>
			<div style={{ minWidth: 0 }}>
				<div
					style={{
						font: '700 26px var(--font-mono)',
						color: URGENCY_COLOR[countdown.urgency] ?? 'var(--color-text-primary)',
						letterSpacing: '.04em',
					}}
				>
					{countdown.display}
				</div>
				{countdown.status !== 'stopped' && <Muted>{countdown.statusLabel}</Muted>}
			</div>
			<div
				style={{
					marginLeft: 'auto',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'flex-end',
					gap: 4,
				}}
			>
				{/* ONE transport control whose label/icon/command follow the status, NOT three
				    conditionally-rendered siblings. JSX gives each `{cond && …}` expression its own
				    fixed child slot, so React could not reconcile Pause (slot 2) with Resume (slot 3):
				    pressing Pause DESTROYED the very button the user had just activated, dropping
				    focus to <body> so the next Tab restarted at the skip link. */}
				<OpChip
					icon={transport.icon}
					label={transport.label}
					ariaLabel={transport.ariaLabel}
					unavailableReason={sessionOnly}
					onPress={op(transport.command, transport.payload)}
				/>
				{countdown.status !== 'stopped' && declares('timer.reset') && (
					<OpChip
						icon="retry"
						label="Reset"
						unavailableReason={sessionOnly}
						onPress={op('timer.reset')}
					/>
				)}
			</div>
		</div>
	);
}

function AudioBody() {
	const runtime = useRuntime();
	// AUDIO-002/003 — the ONE actor-filtered session-audio read model: the DM sees the authoritative
	// track + ambience mix; a participant only the player-safe track. Names resolve through the audio
	// library only on the DM view (they are DM config, not part of the player-safe projection).
	const view = getSessionAudioView(
		runtime.state.audio,
		runtime.state.session.audioPlayback,
		runtime.state.permissions,
		runtime.defaultActorId,
	);
	const track = view.track;
	if (!track) {
		return <Muted>Nothing playing — cue a track from the session audio controls.</Muted>;
	}
	const isDm = view.role === 'dm';
	const title = isDm
		? ((track.assetId ? runtime.state.audio.assets[track.assetId]?.title : undefined) ??
			runtime.state.audio.sources[track.sourceId]?.displayName ??
			track.sourceId)
		: 'Session audio';
	const ambienceCount = isDm ? Object.keys(view.ambienceLayers).length : 0;
	const playing = track.status === 'playing';
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height: '100%' }}>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 34,
					height: 34,
					borderRadius: 'var(--radius-full)',
					background: 'var(--color-accent-subtle)',
					color: 'var(--color-accent)',
					flex: '0 0 auto',
				}}
			>
				<Icon name={playing ? 'play' : 'pause'} size="sm" />
			</span>
			<div style={{ minWidth: 0 }}>
				<div
					style={{
						font: '600 var(--text-sm) var(--font-sans)',
						color: 'var(--color-text-primary)',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{title}
				</div>
				<Muted>
					{playing ? 'Playing' : 'Paused'} · vol {Math.round(track.volume * 100)}%
					{ambienceCount > 0
						? ` · ${ambienceCount} ambience ${ambienceCount === 1 ? 'layer' : 'layers'}`
						: ''}
				</Muted>
			</div>
		</div>
	);
}

function InitiativeBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const showHp = cfg<boolean>(widget, 'showHp') ?? true;
	// SES-002 — the ONE actor-filtered combat read model; hidden combatants are already redacted.
	const tracker = getCombatTrackerForActor(
		runtime.state.session.combat,
		runtime.state.permissions,
		runtime.defaultActorId,
	);
	const running = tracker.status === 'running';
	const active =
		tracker.combatants.find((c) => c.isActive) ??
		tracker.combatants.find((c) => c.id === tracker.activeCombatantId) ??
		null;
	const orderNames = tracker.combatants.map((c) => c.name);
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill label="Round" value={running ? String(tracker.round) : '—'} />
				<StatPill label="Turn" value={running ? (active?.name ?? `#${tracker.turn + 1}`) : '—'} />
				{running && showHp && active?.resources && (
					<StatPill label="HP" value={`${active.resources.hp} / ${active.resources.maxHp}`} />
				)}
			</div>
			{running && orderNames.length > 0 ? (
				<Muted>
					{orderNames.slice(0, 3).join(' · ')}
					{orderNames.length > 3 ? ` +${orderNames.length - 3}` : ''}
				</Muted>
			) : (
				<Muted>No combat running · {showHp ? 'HP shown' : 'HP hidden'}</Muted>
			)}
		</div>
	);
}

const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

function CharacterBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const showAbilities = cfg<boolean>(widget, 'showAbilities') ?? true;
	if (widget.requiresBinding && widget.status !== 'available') {
		return <Muted>No character linked — choose one to show its stat block.</Muted>;
	}
	// Resolve the BOUND character through the actor-filtered query (redacted per viewer).
	const boundId = widget.bindingRef?.entityType === 'character' ? widget.bindingRef.entityId : null;
	const view = boundId
		? getCharacterForActor(
				runtime.state.characters,
				runtime.state.permissions,
				runtime.defaultActorId,
				boundId,
			)
		: null;
	const scores = (view?.abilityScores ?? {}) as Record<string, number | undefined>;
	return (
		<div style={bodyWrap}>
			{view && (
				<div
					style={{
						font: '700 var(--text-sm) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					{view.name}
				</div>
			)}
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill label="HP" value={view ? `${view.combat.hp} / ${view.combat.maxHp}` : '— / —'} />
				<StatPill label="AC" value={view ? String(view.combat.ac) : '—'} />
			</div>
			{showAbilities && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{ABILITY_ORDER.map((key) => {
						const label = key.toUpperCase();
						const score = scores[key];
						return <Chip key={key}>{score !== undefined ? `${label} ${score}` : label}</Chip>;
					})}
				</div>
			)}
		</div>
	);
}

function MapBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const isDm = runtime.state.permissions.actors[runtime.defaultActorId]?.role === 'dm';
	// Resolve the BOUND map through the actor-filtered view (hidden maps collapse to unavailable),
	// then pick its raster base layer exactly like Atlas does. Hooks run before any early return.
	const boundId = widget.bindingRef?.entityType === 'map' ? widget.bindingRef.entityId : null;
	const view = boundId
		? getMapViewForActor(
				runtime.state.maps,
				runtime.state.permissions,
				runtime.defaultActorId,
				boundId,
			)
		: null;
	const rasterId =
		view && view.kind === 'available'
			? pickRasterAssetId(
					runtime.state.maps.maps[view.mapId]?.assetIds ?? [],
					runtime.state.maps.assets,
				)
			: null;
	const rasterUrl = useAssetObjectUrl(rasterId);
	if (widget.requiresBinding && widget.status !== 'available') {
		return <Muted>No map linked — choose a map to show its layers.</Muted>;
	}
	if (!view || view.kind !== 'available') {
		return (
			<Muted>
				{isDm
					? 'The linked map is missing or was removed. Choose another map in edit mode.'
					: 'The linked map isn’t available to you.'}
			</Muted>
		);
	}
	return (
		<div style={{ ...bodyWrap, gap: 6 }}>
			<div
				style={{
					flex: 1,
					minHeight: 64,
					borderRadius: 'var(--radius-sm)',
					border: '1px solid var(--color-border)',
					overflow: 'hidden',
					// The map-less placeholder used to hard-code the gold grid AND a gold-over-near-black
					// diagonal film, so parchment got a gold wash over its light vellum and high-contrast
					// got a decorative low-alpha layer it must not have. The real map tokens are already
					// cut per theme (and remapped under forced-colors), so use them and drop the film.
					background: rasterUrl
						? 'var(--color-surface-sunken)'
						: 'repeating-linear-gradient(0deg, transparent 0 17px, var(--map-grid-line) 17px 18px), repeating-linear-gradient(90deg, transparent 0 17px, var(--map-grid-line) 17px 18px), var(--map-canvas-bg)',
				}}
			>
				{rasterUrl && (
					<img
						src={rasterUrl}
						alt={`${view.name} map`}
						style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
					/>
				)}
			</div>
			<Muted>
				{view.name} · {view.pois.length} {view.pois.length === 1 ? 'POI' : 'POIs'} ·{' '}
				{view.tokens.length} {view.tokens.length === 1 ? 'token' : 'tokens'}
				{view.fog.length > 0 ? ` · fog ×${view.fog.length}` : ''}
			</Muted>
		</div>
	);
}

function ListBody({
	widget,
	kind,
	unit,
}: {
	widget: BoardWidget;
	kind: 'note' | 'object';
	unit: string;
}) {
	const runtime = useRuntime();
	// The SAME visibility-respecting content read Knowledge lists with — a player-viewed board never
	// shows a DM-only row here. `count` is the widget's configured row cap.
	const count = Math.max(1, Number(cfg<number>(widget, 'count') ?? 5) || 5);
	const items = getContentItemsForActor(
		runtime.state.content,
		runtime.state.permissions,
		runtime.defaultActorId,
	).filter((item) => item.kind === kind);
	if (items.length === 0) {
		return (
			<Muted>
				{kind === 'note'
					? 'No notes visible yet — prep notes appear here as you write them.'
					: 'No reference objects visible yet — imported spells and objects appear here.'}
			</Muted>
		);
	}
	const shown = items.slice(0, count);
	return (
		<div style={bodyWrap}>
			{shown.map((item) => (
				<div
					key={item.id}
					style={{
						font: 'var(--text-xs)/1.4 var(--font-sans)',
						color: 'var(--color-text-secondary)',
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{item.title}
				</div>
			))}
			<Muted>
				{shown.length} of {items.length} {unit}
			</Muted>
		</div>
	);
}

/**
 * The widget types this module has a hand-written body for — the `builtin` branch of the render
 * resolver (RC-WID-1.1). `resolveWidgetRenderer` asks this before choosing `builtin`, and falls back
 * to it for a `template` widget whose declarative renderer has not landed yet, so the list is the
 * authoritative answer to "can the host draw this by hand" rather than a comment that drifts from
 * the switch below.
 */
export const BUILTIN_WIDGET_TYPES: readonly string[] = [
	'note',
	'handout',
	'dice',
	'timer',
	'audio',
	'initiative-tracker',
	'character',
	'map',
	'quick-reference',
	'prep',
];

const BUILTIN_WIDGET_TYPE_SET = new Set(BUILTIN_WIDGET_TYPES);

/** Whether `WidgetBody` renders a real body for this widget type (the resolver's `builtin` test). */
export function hasBuiltinBody(widgetType: string): boolean {
	return BUILTIN_WIDGET_TYPE_SET.has(widgetType);
}

export function WidgetBody({
	widget,
	onCommand,
}: {
	widget: BoardWidget;
	/** VIEW-mode operate dispatch (`widget.dispatch-command`); omit in edit mode to keep bodies inert. */
	onCommand?: WidgetCommandHandler;
}) {
	switch (widget.type) {
		case 'note':
		case 'handout':
			return <NoteBody widget={widget} />;
		case 'dice':
			return <DiceBody widget={widget} onCommand={onCommand} />;
		case 'timer':
			return <TimerBody widget={widget} onCommand={onCommand} />;
		case 'audio':
			return <AudioBody />;
		case 'initiative-tracker':
			return <InitiativeBody widget={widget} />;
		case 'character':
			return <CharacterBody widget={widget} />;
		case 'map':
			return <MapBody widget={widget} />;
		case 'quick-reference':
			return <ListBody widget={widget} kind="object" unit="reference rows" />;
		case 'prep':
			return <ListBody widget={widget} kind="note" unit="prep notes" />;
		default:
			// Unreachable through `resolveWidgetRenderer` (it only picks `builtin` for a type in
			// BUILTIN_WIDGET_TYPES); kept so a direct caller degrades to the description rather than
			// throwing.
			return widget.description ? <Muted>{widget.description}</Muted> : null;
	}
}
