import { Icon } from '../ds';
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
 * identical. Bodies are purely presentational — no dispatch, no live queries — so the canvas stays a
 * thin, fast read surface; binding-backed widgets (map / character) show an honest bound-data shell.
 */

/** Read a configuration value, falling back to the field's declared default. */
function cfg<T = unknown>(widget: BoardWidget, key: string): T | undefined {
	const raw = widget.configuration[key];
	if (raw !== undefined && raw !== null && raw !== '') return raw as T;
	const field = widget.configFields.find((f) => f.key === key);
	return field?.default as T | undefined;
}

const bodyWrap: React.CSSProperties = {
	height: '100%',
	display: 'flex',
	flexDirection: 'column',
	gap: 'var(--space-2)',
	minHeight: 0,
	overflow: 'hidden',
};

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' }) {
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
			<span style={{ font: '700 var(--text-sm) var(--font-display)', color: 'var(--color-text-primary)' }}>
				{value}
			</span>
		</div>
	);
}

function Muted({ children }: { children: React.ReactNode }) {
	return (
		<div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{children}</div>
	);
}

function NoteBody({ widget }: { widget: BoardWidget }) {
	const heading = cfg<string>(widget, 'heading');
	const body = cfg<string>(widget, 'body');
	if (!heading && !body) return <Muted>Empty note — open the inspector to add text.</Muted>;
	return (
		<div style={{ ...bodyWrap, gap: 6 }}>
			{heading && (
				<div style={{ font: '700 var(--text-sm) var(--font-display)', color: 'var(--color-text-primary)' }}>
					{heading}
				</div>
			)}
			{body && (
				<div style={{ font: 'var(--text-xs)/1.6 var(--font-sans)', color: 'var(--color-text-secondary)', overflow: 'hidden' }}>
					{body}
				</div>
			)}
		</div>
	);
}

function DiceBody({ widget }: { widget: BoardWidget }) {
	const formulas = (cfg<string>(widget, 'formulas') ?? 'd20')
		.split(',')
		.map((f) => f.trim())
		.filter(Boolean);
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{formulas.map((f) => (
					<Chip key={f} tone="accent">
						{f}
					</Chip>
				))}
			</div>
			<div
				style={{
					marginTop: 'auto',
					display: 'inline-flex',
					alignItems: 'center',
					gap: 6,
					alignSelf: 'flex-start',
					padding: '4px 10px',
					borderRadius: 'var(--radius-sm)',
					background: 'var(--color-surface-sunken)',
					font: '600 var(--text-2xs) var(--font-sans)',
					color: 'var(--color-text-secondary)',
				}}
			>
				<Icon name="dice" size={13} /> Roll
			</div>
		</div>
	);
}

function TimerBody({ widget }: { widget: BoardWidget }) {
	const seconds = Number(cfg<number>(widget, 'durationSeconds') ?? 60) || 60;
	const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
	const ss = String(seconds % 60).padStart(2, '0');
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', height: '100%' }}>
			<div style={{ font: '700 26px var(--font-mono)', color: 'var(--color-text-primary)', letterSpacing: '.04em' }}>
				{mm}:{ss}
			</div>
			<span
				style={{
					marginLeft: 'auto',
					display: 'inline-flex',
					alignItems: 'center',
					gap: 5,
					padding: '4px 10px',
					borderRadius: 'var(--radius-sm)',
					background: 'var(--color-surface-sunken)',
					font: '600 var(--text-2xs) var(--font-sans)',
					color: 'var(--color-text-secondary)',
				}}
			>
				<Icon name="play" size={13} /> Start
			</span>
		</div>
	);
}

function AudioBody({ widget }: { widget: BoardWidget }) {
	const loop = cfg<boolean>(widget, 'loop') ?? true;
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
				<Icon name="play" size="sm" />
			</span>
			<div style={{ minWidth: 0 }}>
				<div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Ambient track</div>
				<Muted>{loop ? 'Looping' : 'Play once'}</Muted>
			</div>
		</div>
	);
}

function InitiativeBody({ widget }: { widget: BoardWidget }) {
	const showHp = cfg<boolean>(widget, 'showHp') ?? true;
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill label="Round" value="—" />
				<StatPill label="Turn" value="—" />
			</div>
			<Muted>Live turn order · {showHp ? 'HP shown' : 'HP hidden'}</Muted>
		</div>
	);
}

function CharacterBody({ widget }: { widget: BoardWidget }) {
	const showAbilities = cfg<boolean>(widget, 'showAbilities') ?? true;
	if (widget.requiresBinding && widget.status !== 'available') {
		return <Muted>No character bound — bind one to show its stat block.</Muted>;
	}
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill label="HP" value="— / —" />
				<StatPill label="AC" value="—" />
			</div>
			{showAbilities && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((a) => (
						<Chip key={a}>{a}</Chip>
					))}
				</div>
			)}
		</div>
	);
}

function MapBody({ widget }: { widget: BoardWidget }) {
	if (widget.requiresBinding && widget.status !== 'available') {
		return <Muted>No map bound — bind a map to display its layers.</Muted>;
	}
	return (
		<div
			style={{
				height: '100%',
				minHeight: 64,
				borderRadius: 'var(--radius-sm)',
				border: '1px solid var(--color-border)',
				background:
					'linear-gradient(135deg, rgba(224,176,111,.10), rgba(20,16,11,.20)), repeating-linear-gradient(0deg, transparent 0 17px, rgba(224,176,111,.10) 17px 18px), repeating-linear-gradient(90deg, transparent 0 17px, rgba(224,176,111,.10) 17px 18px)',
			}}
		/>
	);
}

function ListBody({ widget, unit }: { widget: BoardWidget; unit: string }) {
	const count = Number(cfg<number>(widget, 'count') ?? 5) || 5;
	const rows = Math.min(count, 4);
	return (
		<div style={bodyWrap}>
			{Array.from({ length: rows }, (_, i) => (
				<div
					key={i}
					style={{
						height: 8,
						borderRadius: 'var(--radius-full)',
						background: 'var(--color-surface-sunken)',
						width: `${88 - i * 12}%`,
					}}
				/>
			))}
			<Muted>
				{count} {unit}
			</Muted>
		</div>
	);
}

export function WidgetBody({ widget }: { widget: BoardWidget }) {
	switch (widget.type) {
		case 'note':
		case 'handout':
			return <NoteBody widget={widget} />;
		case 'dice':
			return <DiceBody widget={widget} />;
		case 'timer':
			return <TimerBody widget={widget} />;
		case 'audio':
			return <AudioBody widget={widget} />;
		case 'initiative-tracker':
			return <InitiativeBody widget={widget} />;
		case 'character':
			return <CharacterBody widget={widget} />;
		case 'map':
			return <MapBody widget={widget} />;
		case 'quick-reference':
			return <ListBody widget={widget} unit="rows shown" />;
		case 'prep':
			return <ListBody widget={widget} unit="items shown" />;
		default:
			return widget.description ? <Muted>{widget.description}</Muted> : null;
	}
}
