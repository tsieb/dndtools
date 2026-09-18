import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
} from 'react';
import { Button, Icon, IconButton } from '../../ds';
import { useI18n } from '../../i18n';
import { visibilityChip, type BoardWidget } from '../board-helpers';
import type { SceneBoardCanvasProps } from '../SceneBoardModel';
import { useDirection } from '../useViewport';
import { tileMetadataForWidget } from '../widgets/tileMeta';
import { WidgetRenderSlot, type WidgetCommandHandler } from '../widgets/WidgetRenderSlot';
import { WidgetGlyph } from './WidgetFrame';
import {
	PREFERENCE_KEYS,
	SESSION_KEY_PREFIXES,
	readPreference,
	readSessionValue,
	writePreference,
	writeSessionValue,
} from '../../platform/preferences';

/**
 * StackedBoard — RC-CAN-5.1, how a PHONE can read both spatial surfaces (`/board` and `/scene/:id`).
 *
 * A fitted canvas on a 360px handset paints every tile at about half size: titles near 6px, operate
 * chips that need scale compensation to stay touchable, and a board that has to be zoomed and panned
 * before it can be read. Here the same widgets become one column of collapsible panels, in the order
 * the eye takes on the canvas (top to bottom, then left to right). Each panel is a 48px header — a
 * disclosure button carrying the tile's identity (accent rail, type icon, title, visibility) plus a
 * full-screen toggle — over the widget's real body, drawn by the same `WidgetRenderSlot` the canvas
 * frame uses, so a tile reads and operates exactly as it does on the canvas.
 *
 * - Phones open in List view. The host toolbar's List toggle (`StackedLayoutToggle`) offers
 *   the spatial canvas as an explicit device preference.
 * - Nothing zooms or pans. The column scrolls vertically and only vertically (`touch-action: pan-y`).
 * - Which panels are collapsed is remembered for the browser tab (`sessionStorage`, reached through
 *   the platform layer, one entry per scene). It is a reading preference rather than layout, so it
 *   never reaches the core, the op-log or another device. Panels start expanded: a tile nobody has
 *   collapsed is shown.
 * - Full screen fills the host's pane. AppShell already bounds `<main>` above the phone tab bar, so
 *   the bottom navigation stays in view and in reach; the host hides its own toolbar while a tile is
 *   full screen (`useStackedPosture().hideChrome`). Escape, or the same button, returns to the list.
 * - Editing stays spatial. A layout is an arrangement on the canvas, so the host's "Edit layout"
 *   swaps `SceneBoardCanvas` back in; this component never moves, resizes or removes anything.
 */

/** The header's height, which is also its touch target (`--space-12`). */
const HEADER_PX = 48;
/** However short a tile was authored, its body keeps enough room to show something. */
const MIN_BODY_PX = 120;

/** Reading order: top to bottom, then left to right — how the eye scans the canvas. */
export function stackOrder(widgets: readonly BoardWidget[]): BoardWidget[] {
	return [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
}

type ExpandedById = Record<string, boolean>;

function readExpanded(sceneId: string | null): ExpandedById {
	if (!sceneId) return {};
	try {
		const raw = readSessionValue(SESSION_KEY_PREFIXES.stackedBoard, sceneId);
		const parsed: unknown = raw ? JSON.parse(raw) : null;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
			),
		);
	} catch {
		// Not JSON (a foreign or hand-edited value): start expanded rather than throw into a render.
		return {};
	}
}

function writeExpanded(sceneId: string | null, expanded: ExpandedById): void {
	// Best-effort by way of the platform layer: in private mode the panel still toggles, unremembered.
	if (!sceneId) return;
	writeSessionValue(SESSION_KEY_PREFIXES.stackedBoard, sceneId, JSON.stringify(expanded));
}

/**
 * Phones read panels by default; only an explicit canvas preference opts out. Unset, unreadable
 * and unrecognized preferences all retain the phone posture. Editing stays spatial. `hideChrome`
 * is a full-screen tile taking over the pane, which the host answers by hiding its own toolbar.
 */
export function useStackedPosture(phoneReading: boolean) {
	const [listView, setListView] = useState(
		() => readPreference(PREFERENCE_KEYS.boardPhoneLayout) !== 'canvas',
	);
	const [maximized, setMaximized] = useState(false);
	const stacked = phoneReading && listView;
	function setStacked(next: boolean) {
		setListView(next);
		writePreference(PREFERENCE_KEYS.boardPhoneLayout, next ? 'stacked' : 'canvas');
	}
	return {
		available: phoneReading,
		stacked,
		setStacked,
		hideChrome: stacked && maximized,
		// The host's board region floor. With large text the toolbar alone can fill a phone pane and
		// leave the list a sliver shorter than one panel header, so a header scrolled "into view"
		// stays under the tab bar. A rem floor grows with the text and lets `<main>` scroll the
		// toolbar away instead; a full-screen tile hides that toolbar and must stay bounded.
		regionMinHeight: stacked && !maximized ? '12rem' : 0,
		onMaximizedChange: setMaximized,
	};
}

export type StackedPosture = ReturnType<typeof useStackedPosture>;

/** The phone toolbar's List toggle between the fitted canvas and the panel list. */
export function StackedLayoutToggle({ posture }: { posture: StackedPosture }) {
	const { t } = useI18n();
	if (!posture.available) return null;
	return (
		<Button
			variant={posture.stacked ? 'secondary' : 'ghost'}
			size="sm"
			icon="layout-list"
			aria-pressed={posture.stacked}
			onClick={() => posture.setStacked(!posture.stacked)}
		>
			{t('mapEditor.showListShort')}
		</Button>
	);
}

export interface StackedBoardProps {
	/** Scopes the remembered panels. Null while the host's scene is still being created. */
	sceneId: string | null | undefined;
	widgets: BoardWidget[];
	onWidgetCommand?: SceneBoardCanvasProps['onWidgetCommand'];
	emptyTitle: string;
	emptyHint: string;
	onMaximizedChange?: (maximized: boolean) => void;
}

export function StackedBoard(props: StackedBoardProps) {
	// Keyed by scene: `/scene/:id` reuses one element across scene changes, and both the remembered
	// panels and the full-screen tile belong to the scene they were set on.
	return <StackedList key={props.sceneId ?? ''} {...props} />;
}

function StackedList({
	sceneId,
	widgets,
	onWidgetCommand,
	emptyTitle,
	emptyHint,
	onMaximizedChange,
}: StackedBoardProps) {
	const scene = sceneId ?? null;
	const ordered = useMemo(() => stackOrder(widgets), [widgets]);
	const [expanded, setExpanded] = useState<ExpandedById>(() => readExpanded(scene));
	const [maximizedId, setMaximizedId] = useState<string | null>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const returnFocusId = useRef<string | null>(null);
	// A tile removed while it is full screen (another device, an undo) drops back to the list.
	const maximized = maximizedId && ordered.some((w) => w.id === maximizedId) ? maximizedId : null;

	useEffect(() => {
		onMaximizedChange?.(maximized !== null);
	}, [maximized, onMaximizedChange]);
	// Never leave the host's toolbar hidden behind a tile that is no longer drawn.
	useEffect(() => () => onMaximizedChange?.(false), [onMaximizedChange]);

	useEffect(() => {
		if (maximized !== null || returnFocusId.current === null) return;
		// Wait for the list AND the host toolbar to return before revealing the invoking control.
		// Focusing in the key/click handler uses the full-screen layout, leaving lower tiles offscreen.
		const frame = requestAnimationFrame(() => {
			const toggles = listRef.current?.querySelectorAll<HTMLElement>('[data-stacked-fullscreen]');
			for (const button of toggles ?? []) {
				if (button.getAttribute('data-stacked-fullscreen') !== returnFocusId.current) continue;
				button.focus({ preventScroll: true });
				button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
				break;
			}
			returnFocusId.current = null;
		});
		return () => cancelAnimationFrame(frame);
	}, [maximized]);

	function toggleFullScreen(id: string) {
		returnFocusId.current = maximized === id ? id : null;
		setMaximizedId(maximized === id ? null : id);
	}

	function toggle(id: string) {
		const next = { ...expanded, [id]: !(expanded[id] ?? true) };
		setExpanded(next);
		writeExpanded(scene, next);
	}

	// Escape can come from anywhere inside the full-screen tile — a note, a map, a tracker row — so
	// focus goes back to the toggle it will now read as "Show … full screen", not to <body>.
	function onTileKeyDown(e: KeyboardEvent<HTMLDivElement>, id: string) {
		if (e.key !== 'Escape' || e.defaultPrevented || maximized !== id) return;
		e.preventDefault();
		toggleFullScreen(id);
	}

	if (ordered.length === 0) {
		return (
			<div data-testid="stacked-board" style={LIST}>
				<div style={EMPTY}>
					<Icon name="widget" size="xl" color="var(--color-text-tertiary)" />
					<div style={EMPTY_TITLE}>{emptyTitle}</div>
					<div style={EMPTY_HINT}>{emptyHint}</div>
				</div>
			</div>
		);
	}

	return (
		<div
			ref={listRef}
			data-testid="stacked-board"
			data-fullscreen={maximized ?? undefined}
			style={{ ...LIST, overflowY: maximized ? 'hidden' : 'auto' }}
		>
			{ordered.map((w) => (
				<StackedTile
					key={w.id}
					widget={w}
					open={expanded[w.id] ?? true}
					fullScreen={maximized === w.id}
					hidden={maximized !== null && maximized !== w.id}
					onToggle={() => toggle(w.id)}
					onFullScreen={() => toggleFullScreen(w.id)}
					onKeyDown={(e) => onTileKeyDown(e, w.id)}
					onCommand={
						onWidgetCommand
							? (commandType, payload) => onWidgetCommand(w.id, commandType, payload)
							: undefined
					}
				/>
			))}
		</div>
	);
}

interface StackedTileProps {
	widget: BoardWidget;
	open: boolean;
	fullScreen: boolean;
	hidden: boolean;
	onToggle: () => void;
	onFullScreen: () => void;
	onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
	onCommand?: WidgetCommandHandler;
}

function StackedTile({
	widget: w,
	open,
	fullScreen,
	hidden,
	onToggle,
	onFullScreen,
	onKeyDown,
	onCommand,
}: StackedTileProps) {
	const { t } = useI18n();
	const dir = useDirection();
	const uid = useId();
	const headingId = `${uid}-title`;
	const bodyId = `${uid}-body`;
	const meta = tileMetadataForWidget(w);
	const chip = visibilityChip(w.visibility);
	const accent = `var(${meta.accentToken})`;
	const placeholder = w.status !== 'available';
	const showBody = open || fullScreen;
	// The authored height, less the header, so a tile keeps the proportions it has on the canvas.
	const bodyHeight = Math.max(w.h - HEADER_PX, MIN_BODY_PX);

	const identity = (
		<>
			<WidgetGlyph icon={meta.icon} size={16} color={accent} />
			<span style={TITLE}>{w.title}</span>
			<span style={chip.players ? CHIP_PLAYERS : CHIP_DM}>
				<Icon name={chip.players ? 'visibility-players' : 'dm-only'} size={11} />
				{chip.label}
			</span>
		</>
	);

	return (
		<div
			role="group"
			aria-labelledby={headingId}
			data-testid={`widget-${w.id}`}
			data-stacked-tile=""
			className={meta.silhouetteClass}
			onKeyDown={onKeyDown}
			style={{
				...TILE,
				// `display` rather than the `hidden` attribute, which an inline `display` would override.
				// The tile stays MOUNTED while another is full screen, so its widget keeps its state.
				display: hidden ? 'none' : 'flex',
				flex: fullScreen ? '1 1 auto' : '0 0 auto',
				background: placeholder ? 'var(--color-surface-sunken)' : 'var(--color-surface-raised)',
				border: `1px solid ${placeholder ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
			}}
		>
			{/* A BORDER, not a background, for the same reason as WidgetFrame's rail: forced-colors
			    mode repaints backgrounds as Canvas but keeps a border. */}
			<span
				aria-hidden
				data-testid="tile-accent-rail"
				style={{ ...RAIL, borderInlineStart: `4px solid ${accent}` }}
			/>
			<div
				style={{
					...HEADER,
					borderBottom: showBody ? '1px solid var(--color-border)' : 'none',
				}}
			>
				<h3 style={HEADING}>
					{fullScreen ? (
						<span id={headingId} style={HEADING_ROW}>
							{identity}
						</span>
					) : (
						<button
							type="button"
							id={headingId}
							aria-expanded={open}
							aria-controls={bodyId}
							onClick={onToggle}
							style={{ ...HEADING_ROW, ...DISCLOSURE }}
						>
							<Icon
								name={open ? 'chevron-down' : dir === 'rtl' ? 'chevron-left' : 'chevron-right'}
								size="sm"
							/>
							{identity}
						</button>
					)}
				</h3>
				<IconButton
					icon={fullScreen ? 'minimize-2' : 'maximize-2'}
					label={
						fullScreen
							? t('atlas.collapseMap', { name: w.title })
							: t('atlas.expandMap', { name: w.title })
					}
					variant="ghost"
					data-stacked-fullscreen={w.id}
					onClick={onFullScreen}
					style={TOUCH_TARGET}
				/>
			</div>
			<div
				id={bodyId}
				data-testid="stacked-tile-body"
				style={{
					...BODY,
					display: showBody ? 'flex' : 'none',
					...(fullScreen ? { flex: '1 1 auto' } : { height: bodyHeight }),
				}}
			>
				<div style={CONTENT}>
					<WidgetRenderSlot widget={w} onCommand={onCommand} />
				</div>
				{w.statusNote && (
					<div style={STATUS_NOTE}>
						<Icon name="warning" size={12} />
						{w.statusNote}
					</div>
				)}
			</div>
		</div>
	);
}

const LIST: CSSProperties = {
	flex: 1,
	minHeight: 0,
	minWidth: 0,
	display: 'flex',
	flexDirection: 'column',
	gap: 'var(--space-2)',
	padding: 'var(--space-2)',
	boxSizing: 'border-box',
	overflowX: 'hidden',
	overscrollBehavior: 'contain',
	// Vertical scroll is the ONLY gesture on the stack: no pinch-zoom and no sideways pan.
	touchAction: 'pan-y',
};

const TILE: CSSProperties = {
	position: 'relative',
	flexDirection: 'column',
	minHeight: 0,
	borderRadius: 'var(--radius-md)',
};

const RAIL: CSSProperties = {
	position: 'absolute',
	insetInlineStart: 0,
	top: 0,
	bottom: 0,
	width: 0,
	borderStartStartRadius: 'var(--radius-md)',
	borderEndStartRadius: 'var(--radius-md)',
};

const HEADER: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--space-1)',
	height: 'var(--space-12)',
	boxSizing: 'border-box',
	paddingInline: 'var(--space-1)',
	flex: '0 0 auto',
};

const HEADING: CSSProperties = {
	margin: 'var(--space-0)',
	flex: '1 1 auto',
	minWidth: 0,
	display: 'flex',
	height: '100%',
};

const HEADING_ROW: CSSProperties = {
	flex: '1 1 auto',
	minWidth: 0,
	height: '100%',
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--space-2)',
	padding: 'var(--space-1) var(--space-2)',
	boxSizing: 'border-box',
	color: 'var(--color-text-secondary)',
};

const DISCLOSURE: CSSProperties = {
	background: 'transparent',
	border: 'none',
	cursor: 'pointer',
	font: 'inherit',
	textAlign: 'start',
};

const TITLE: CSSProperties = {
	flex: '1 1 auto',
	minWidth: 0,
	font: '700 var(--text-sm) var(--font-sans)',
	color: 'var(--color-text-primary)',
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
};

const CHIP: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: 'var(--space-1)',
	flex: '0 0 auto',
	padding: 'var(--space-0-5) var(--space-2)',
	borderRadius: 'var(--radius-full)',
	font: '600 var(--text-2xs) var(--font-sans)',
	whiteSpace: 'nowrap',
};

// Secondary, not tertiary, text on the sunken chip: the same 4.5:1 fix WidgetFrame's chip carries.
const CHIP_DM: CSSProperties = {
	...CHIP,
	background: 'var(--color-surface-sunken)',
	color: 'var(--color-text-secondary)',
};

const CHIP_PLAYERS: CSSProperties = {
	...CHIP,
	background: 'var(--color-accent-subtle)',
	color: 'var(--color-accent)',
};

// The design package's touch floor on the phone tier (44px there, via the density lock).
const TOUCH_TARGET: CSSProperties = {
	width: 'var(--density-touch-target)',
	height: 'var(--density-touch-target)',
	flex: '0 0 auto',
};

const BODY: CSSProperties = {
	flexDirection: 'column',
	gap: 'var(--space-2)',
	minHeight: 0,
	padding: 'var(--space-2) var(--space-3) var(--space-3)',
	boxSizing: 'border-box',
	overflow: 'auto',
};

const CONTENT: CSSProperties = {
	flex: '1 1 auto',
	minHeight: 0,
	minWidth: 0,
};

const STATUS_NOTE: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: 'var(--space-1)',
	flex: '0 0 auto',
	font: '600 var(--text-2xs) var(--font-sans)',
	color: 'var(--color-status-warning-text)',
};

const EMPTY: CSSProperties = {
	margin: 'auto',
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: 'var(--space-3)',
	padding: 'var(--space-6)',
	textAlign: 'center',
};

const EMPTY_TITLE: CSSProperties = {
	font: '700 var(--text-lg) var(--font-sans)',
	color: 'var(--color-text-secondary)',
};

const EMPTY_HINT: CSSProperties = {
	font: 'var(--text-sm) var(--font-sans)',
	color: 'var(--color-text-tertiary)',
	maxWidth: '20rem',
};
