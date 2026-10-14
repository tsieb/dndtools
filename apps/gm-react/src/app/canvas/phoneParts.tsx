import { useEffect, useId, useRef, type CSSProperties, type RefObject } from 'react';
import { IconButton } from '../../ds';
import { useI18n } from '../../i18n';
import type { BoardWidget } from '../board-helpers';
import { tileMetadataForWidget } from '../widgets/tileMeta';
import { WidgetRenderSlot } from '../widgets/WidgetRenderSlot';
import { WidgetGlyph } from './frameParts';

// RC-POL-1.2 — the phone layout's overview, minimap, full-screen tile and styles, out of
// `PhoneNavigator.tsx`.

/** Overview inset, so a tile at the board's origin does not touch the frame. */
export const PAD = 8;
export const MINI = { width: 112, height: 64 };

export type Metrics = Record<
	'left' | 'top' | 'width' | 'height' | 'scrollWidth' | 'scrollHeight',
	number
>;

export type Edge = 'left' | 'right' | 'top' | 'bottom';

export function edgesOf(m: Metrics): Record<Edge, boolean> {
	return {
		left: m.left > 1,
		right: m.left + m.width < m.scrollWidth - 1,
		top: m.top > 1,
		bottom: m.top + m.height < m.scrollHeight - 1,
	};
}

/** Fit on a phone: every tile at its fitted place, titled at a readable size, no body. */
export function Overview({
	scrollRef,
	widgets,
	extent,
	width,
	onOpen,
}: {
	scrollRef: RefObject<HTMLDivElement>;
	widgets: BoardWidget[];
	extent: { width: number; height: number };
	width: number;
	onOpen: (id: string) => void;
}) {
	const { t } = useI18n();
	const scale = Math.min(1, Math.max(0.05, (width - 2 * PAD - 2) / extent.width));
	return (
		<div
			ref={scrollRef}
			role="group"
			aria-label={t('phoneNavigator.overview')}
			data-testid="phone-layout-overview"
			style={OVERVIEW}
		>
			<div
				style={{
					position: 'relative',
					width: extent.width * scale + 2 * PAD,
					height: extent.height * scale + 2 * PAD,
				}}
			>
				{widgets.map((w) => {
					const meta = tileMetadataForWidget(w);
					return (
						<button
							key={w.id}
							type="button"
							data-testid={`phone-overview-${w.id}`}
							aria-label={t('atlas.expandMap', { name: w.title })}
							onClick={() => onOpen(w.id)}
							style={{
								...OVERVIEW_TILE,
								left: PAD + w.x * scale,
								top: PAD + w.y * scale,
								width: w.w * scale,
								height: w.h * scale,
								borderInlineStart: `4px solid var(${meta.accentToken})`,
							}}
						>
							<WidgetGlyph icon={meta.icon} size={14} color={`var(${meta.accentToken})`} />
							<span style={OVERVIEW_TITLE}>{w.title}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/** The whole board in a thumbnail, with the part in view outlined. Tap to centre the view there. */
export function Minimap({
	widgets,
	extent,
	metrics,
	onJump,
}: {
	widgets: BoardWidget[];
	extent: { width: number; height: number };
	metrics: Metrics | null;
	onJump: (fx: number, fy: number) => void;
}) {
	const scale = Math.min(MINI.width / extent.width, MINI.height / extent.height);
	const width = extent.width * scale;
	const height = extent.height * scale;
	const view = metrics && {
		left: (metrics.left / metrics.scrollWidth) * width,
		top: (metrics.top / metrics.scrollHeight) * height,
		width: Math.min(1, metrics.width / metrics.scrollWidth) * width,
		height: Math.min(1, metrics.height / metrics.scrollHeight) * height,
	};
	return (
		<div
			aria-hidden="true"
			data-testid="phone-minimap"
			onClick={(e) => {
				const box = e.currentTarget.getBoundingClientRect();
				onJump((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
			}}
			style={{ ...MINIMAP, width, height }}
		>
			{widgets.map((w) => (
				<span
					key={w.id}
					style={{
						...MINI_TILE,
						left: w.x * scale,
						top: w.y * scale,
						width: Math.max(2, w.w * scale),
						height: Math.max(2, w.h * scale),
					}}
				/>
			))}
			{view && <span data-testid="phone-minimap-view" style={{ ...MINI_VIEW, ...view }} />}
		</div>
	);
}

/** One tile filling the navigator's box — above the tab bar, which AppShell keeps outside `<main>`. */
export function FullScreenTile({
	widget: w,
	onClose,
	onCommand,
}: {
	widget: BoardWidget;
	onClose: () => void;
	onCommand?: Parameters<typeof WidgetRenderSlot>[0]['onCommand'];
}) {
	const { t } = useI18n();
	const headingId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const meta = tileMetadataForWidget(w);
	// Its opener (a sheet row, an overview tile) is gone or hidden now, so focus starts on the way out.
	useEffect(() => {
		rootRef.current
			?.querySelector<HTMLElement>('[data-testid="phone-fullscreen-close"]')
			?.focus({ preventScroll: true });
	}, [w.id]);
	return (
		<div
			ref={rootRef}
			role="group"
			aria-labelledby={headingId}
			data-testid="phone-fullscreen"
			data-fullscreen-tile={w.id}
			className={meta.silhouetteClass}
			onKeyDown={(e) => {
				if (e.key !== 'Escape' || e.defaultPrevented) return;
				e.preventDefault();
				onClose();
			}}
			style={{ ...FULL, borderInlineStart: `4px solid var(${meta.accentToken})` }}
		>
			<div style={FULL_HEADER}>
				<WidgetGlyph icon={meta.icon} size={16} color={`var(${meta.accentToken})`} />
				<h2 id={headingId} style={FULL_TITLE}>
					{w.title}
				</h2>
				<IconButton
					icon="minimize-2"
					label={t('atlas.collapseMap', { name: w.title })}
					variant="ghost"
					data-testid="phone-fullscreen-close"
					onClick={onClose}
					style={TOUCH_TARGET}
				/>
			</div>
			<div style={FULL_BODY}>
				<WidgetRenderSlot widget={w} onCommand={onCommand} />
			</div>
		</div>
	);
}

export const STAGE: CSSProperties = { flex: 1, minWidth: 0, minHeight: 0, position: 'relative' };
export const ROOT: CSSProperties = { ...STAGE, display: 'flex', flexDirection: 'column' };

export const SWITCH: CSSProperties = {
	display: 'flex',
	flexWrap: 'wrap',
	gap: 'var(--space-0-5)',
	flex: '0 1 auto',
	minWidth: 0,
};

export const OVERVIEW: CSSProperties = {
	flex: 1,
	minWidth: 0,
	minHeight: 0,
	overflow: 'auto',
	overscrollBehavior: 'contain',
	touchAction: 'pan-x pan-y',
	background: 'var(--color-bg)',
	border: '1px solid var(--color-border)',
	borderRadius: 'var(--radius-lg)',
};

export const OVERVIEW_TILE: CSSProperties = {
	position: 'absolute',
	boxSizing: 'border-box',
	minWidth: 'var(--space-6)',
	minHeight: 'var(--space-6)',
	display: 'flex',
	alignItems: 'flex-start',
	gap: 'var(--space-1)',
	padding: 'var(--space-1)',
	overflow: 'hidden',
	background: 'var(--color-surface-raised)',
	border: '1px solid var(--color-border)',
	borderRadius: 'var(--radius-sm)',
	color: 'var(--color-text-primary)',
	font: '600 var(--text-xs) var(--font-sans)',
	textAlign: 'start',
	cursor: 'pointer',
};

export const OVERVIEW_TITLE: CSSProperties = {
	minWidth: 0,
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
};

export const fade = (edge: Edge): CSSProperties => {
	const across = edge === 'left' || edge === 'right';
	return {
		position: 'absolute',
		pointerEvents: 'none',
		[edge]: 0,
		...(across
			? { top: 0, bottom: 0, width: 'var(--space-6)' }
			: { left: 0, right: 0, height: 'var(--space-6)' }),
		background: `linear-gradient(to ${{ left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[edge]}, color-mix(in srgb, var(--color-text-primary) 22%, transparent), transparent)`,
	};
};

export const FADE = Object.fromEntries(
	(['left', 'right', 'top', 'bottom'] as const).map((edge) => [edge, fade(edge)]),
) as Record<Edge, CSSProperties>;

export const BAR: CSSProperties = {
	flex: '0 0 auto',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'space-between',
	gap: 'var(--space-2)',
	paddingTop: 'var(--space-2)',
};

export const MINIMAP: CSSProperties = {
	position: 'relative',
	flex: '0 0 auto',
	boxSizing: 'content-box',
	background: 'var(--color-surface-sunken)',
	border: '1px solid var(--color-border-strong)',
	borderRadius: 'var(--radius-sm)',
	overflow: 'hidden',
	cursor: 'pointer',
	touchAction: 'manipulation',
};

export const MINI_TILE: CSSProperties = {
	position: 'absolute',
	boxSizing: 'border-box',
	background: 'var(--color-surface-raised)',
	border: '1px solid var(--color-border-strong)',
};

export const MINI_VIEW: CSSProperties = {
	position: 'absolute',
	boxSizing: 'border-box',
	border: '2px solid var(--color-accent)',
	pointerEvents: 'none',
};

export const JUMP_LIST: CSSProperties = {
	listStyle: 'none',
	margin: 'var(--space-0)',
	padding: 'var(--space-0)',
	display: 'flex',
	flexDirection: 'column',
	gap: 'var(--space-1)',
};

export const JUMP_ROW: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--space-1)',
};

export const JUMP_BUTTON: CSSProperties = {
	flex: '1 1 auto',
	minWidth: 0,
	justifyContent: 'flex-start',
	textAlign: 'start',
};

export const JUMP_TITLE: CSSProperties = {
	minWidth: 0,
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
	color: 'var(--color-text-primary)',
};

export const JUMP_TYPE: CSSProperties = {
	flex: '0 0 auto',
	marginInlineStart: 'auto',
	font: 'var(--text-xs) var(--font-sans)',
	color: 'var(--color-text-secondary)',
};

// The design package's touch floor on the phone tier (44px there, via the density lock).
export const TOUCH_TARGET: CSSProperties = {
	width: 'var(--density-touch-target)',
	height: 'var(--density-touch-target)',
	flex: '0 0 auto',
};

export const FULL: CSSProperties = {
	flex: 1,
	minHeight: 0,
	display: 'flex',
	flexDirection: 'column',
	boxSizing: 'border-box',
	background: 'var(--color-surface-raised)',
	border: '1px solid var(--color-border)',
	borderRadius: 'var(--radius-md)',
};

export const FULL_HEADER: CSSProperties = {
	flex: '0 0 auto',
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--space-2)',
	minHeight: 'var(--space-12)',
	paddingInline: 'var(--space-3) var(--space-1)',
	borderBottom: '1px solid var(--color-border)',
};

export const FULL_TITLE: CSSProperties = {
	flex: '1 1 auto',
	minWidth: 0,
	margin: 'var(--space-0)',
	font: '700 var(--text-sm) var(--font-sans)',
	color: 'var(--color-text-primary)',
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
};

export const FULL_BODY: CSSProperties = {
	flex: '1 1 auto',
	minHeight: 0,
	overflow: 'auto',
	padding: 'var(--space-2) var(--space-3) var(--space-3)',
};
