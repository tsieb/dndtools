import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, Icon } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { registerBackHandler } from '../../platform/backNavigation';
import { WidgetGlyph } from '../../app/SceneBoardCanvas';
import type { BoardWidget } from '../../app/board-helpers';
import type {
	PlayerPreviewRead,
	PreviewTileReason,
	PreviewTileTone,
	PreviewTileVerdict,
} from './playerPreview';

/**
 * PlayerPreviewOverlay (RC-CAN-6.1) — "what player X sees", laid over the scene canvas while the
 * runtime previews as another role.
 *
 * It draws the scene's tiles where the DM placed them, fitted to the pane, and gives each one the
 * verdict the PREVIEWED actor's read produced (`playerPreview.ts`): tiles that reach them read
 * normally, placeholders say so, and everything withheld is dimmed — hatched, dashed, muted — with
 * the reason in words. Dimming is colour-and-pattern rather than opacity so the reason text keeps
 * its contrast. On a phone the fitted miniature would be unreadable, so the same tiles stack.
 *
 * Non-destructive by construction: the overlay dispatches nothing, and the canvas under it keeps its
 * view, selection and panels. Escape (and Android Back, and the Exit button) leaves preview — unless
 * something nearer the focus already claimed that Escape, or a modal is open on top.
 */

/** Space around the fitted miniature, in canvas px — geometry for `left`/`top`, not a style token. */
const GUTTER = 16;
/** Below this the tile labels stop being legible; the pane scrolls instead of shrinking further. */
const MIN_SCALE = 0.4;

const TONE_KEY: Record<PreviewTileTone, MessageKey> = {
	visible: 'sceneEditor.preview.tone.visible',
	placeholder: 'sceneEditor.preview.tone.placeholder',
	hidden: 'sceneEditor.preview.tone.hidden',
};

const REASON_KEY: Record<PreviewTileReason, MessageKey> = {
	visible: 'sceneEditor.preview.reason.visible',
	degraded: 'sceneEditor.preview.reason.degraded',
	unbound: 'sceneEditor.preview.reason.unbound',
	missing: 'sceneEditor.preview.reason.missing',
	conflicted: 'sceneEditor.preview.reason.conflicted',
	disabled: 'sceneEditor.preview.reason.disabled',
	tileDmOnly: 'sceneEditor.preview.reason.tileDmOnly',
	tileNotShared: 'sceneEditor.preview.reason.tileNotShared',
	bindingDmOnly: 'sceneEditor.preview.reason.bindingDmOnly',
	bindingNotShared: 'sceneEditor.preview.reason.bindingNotShared',
	bindingFieldHidden: 'sceneEditor.preview.reason.bindingFieldHidden',
	bindingHidden: 'sceneEditor.preview.reason.bindingHidden',
	sceneDmOnly: 'sceneEditor.preview.reason.sceneDmOnly',
	sceneNotShared: 'sceneEditor.preview.reason.sceneNotShared',
	outsideSections: 'sceneEditor.preview.reason.outsideSections',
};

/** The verdict chip: a word and a shape as well as a colour, so no state rests on hue alone. */
const TONE_CHIP: Record<PreviewTileTone, { icon: string; fg: string; bg: string; bd: string }> = {
	visible: {
		icon: 'visibility-players',
		fg: 'var(--color-status-success-text)',
		bg: 'var(--color-status-success-subtle)',
		bd: 'var(--color-status-success-border)',
	},
	placeholder: {
		icon: 'warning',
		fg: 'var(--color-status-warning-text)',
		bg: 'var(--color-status-warning-subtle)',
		bd: 'var(--color-status-warning-border)',
	},
	hidden: {
		icon: 'dm-only',
		fg: 'var(--color-dm-only-badge)',
		bg: 'var(--color-dm-only-subtle)',
		bd: 'var(--color-dm-only-badge)',
	},
};

const HIDDEN_HATCH =
	'repeating-linear-gradient(135deg, var(--color-surface-sunken) 0 6px, var(--color-surface) 6px 12px)';

export interface PlayerPreviewOverlayProps {
	/** The scene's tiles (layout + chrome). Visibility comes from `read`, never from these. */
	widgets: BoardWidget[];
	read: PlayerPreviewRead;
	/** The preview's banner label: "Player", "Maya (Player)". */
	label: string;
	phone: boolean;
	/** Leave preview. `focusWasInOverlay` lets the host put focus somewhere that still exists. */
	onExit: (focusWasInOverlay: boolean) => void;
}

export function PlayerPreviewOverlay({
	widgets,
	read,
	label,
	phone,
	onExit,
}: PlayerPreviewOverlayProps) {
	const { t } = useI18n();
	const rootRef = useRef<HTMLElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState({ w: 0, h: 0 });
	// The listeners below are bound once; they read the latest callback through this ref.
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;

	useEffect(() => {
		const leave = () => onExitRef.current(!!rootRef.current?.contains(document.activeElement));
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
			// A dialog or palette open on top owns this Escape; closing it must not also end preview.
			if (document.querySelector('[aria-modal="true"], dialog[open]')) return;
			e.preventDefault();
			leave();
		};
		window.addEventListener('keydown', onKey);
		const unregister = registerBackHandler('overlay', () => {
			leave();
			return true;
		});
		return () => {
			window.removeEventListener('keydown', onKey);
			unregister();
		};
	}, []);

	useLayoutEffect(() => {
		const el = viewportRef.current;
		if (!el) return undefined;
		const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
		measure();
		if (typeof ResizeObserver === 'undefined') return undefined;
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, [phone]);

	// Reading order: top to bottom, then left to right — the order a sighted DM scans the canvas.
	const ordered = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
	const minX = Math.min(...widgets.map((w) => w.x));
	const minY = Math.min(...widgets.map((w) => w.y));
	const extentW = Math.max(...widgets.map((w) => w.x + w.w)) - minX + GUTTER * 2;
	const extentH = Math.max(...widgets.map((w) => w.y + w.h)) - minY + GUTTER * 2;
	const scale =
		box.w > 0 && box.h > 0 ? Math.max(MIN_SCALE, Math.min(1, box.w / extentW, box.h / extentH)) : 1;

	const listStyle: CSSProperties = {
		listStyle: 'none',
		margin: 'var(--space-0)',
		padding: 'var(--space-0)',
	};

	return (
		<section
			ref={rootRef}
			aria-label={t('sceneEditor.preview.region', { label })}
			data-testid="player-preview-overlay"
			// The e2e's isolation guard reads this: the actor whose read drew every verdict below.
			data-read-actor={read.actorId}
			style={{
				position: 'absolute',
				inset: 0,
				// Above the canvas (which stacks nothing of its own), below the toolbar's "View as" menu.
				zIndex: 'var(--z-raised)',
				display: 'flex',
				flexDirection: 'column',
				background: 'var(--color-surface)',
				border: '1px solid var(--color-border-strong)',
				borderRadius: 'var(--radius-lg)',
				overflow: 'hidden',
			}}
		>
			<header
				style={{
					display: 'flex',
					alignItems: 'center',
					flexWrap: 'wrap',
					gap: 'var(--space-2)',
					padding: 'var(--space-3) var(--space-4)',
					borderBottom: '1px solid var(--color-border)',
					flex: '0 0 auto',
				}}
			>
				<Icon name="visibility-players" size="sm" color="var(--color-accent)" />
				<div style={{ flex: '1 1 16rem', minWidth: 0 }}>
					<h3
						style={{
							margin: 'var(--space-0)',
							// Cinzel starts at --text-xl; a compact overlay title stays in the sans face.
							font: '700 var(--text-lg) var(--font-sans)',
							color: 'var(--color-text-primary)',
						}}
					>
						{t('sceneEditor.preview.title', { label })}
					</h3>
					<p
						role="status"
						style={{
							margin: 'var(--space-0)',
							font: 'var(--text-xs) var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{t('sceneEditor.preview.count', {
							delivered: read.deliveredCount,
							total: widgets.length,
							label,
						})}
						{' · '}
						{t('sceneEditor.preview.paused')}
					</p>
				</div>
				<Button
					variant="secondary"
					size="sm"
					icon="close"
					aria-keyshortcuts="Escape"
					onClick={() => onExitRef.current(true)}
				>
					{t('sceneEditor.preview.exit')}
				</Button>
			</header>

			{!read.sceneDelivered && (
				<p
					role="note"
					style={{
						margin: 'var(--space-0)',
						padding: 'var(--space-2) var(--space-4)',
						font: 'var(--text-sm) var(--font-sans)',
						color: 'var(--color-status-warning-text)',
						background: 'var(--color-status-warning-subtle)',
						borderBottom: '1px solid var(--color-status-warning-border)',
					}}
				>
					{t('sceneEditor.preview.blocked', { label })}
				</p>
			)}

			{widgets.length === 0 ? (
				<p
					style={{
						margin: 'var(--space-0)',
						padding: 'var(--space-4)',
						font: 'var(--text-sm) var(--font-sans)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{t('sceneEditor.preview.empty')}
				</p>
			) : phone ? (
				<ul
					aria-label={t('sceneEditor.preview.tiles', { label })}
					style={{
						...listStyle,
						flex: 1,
						minHeight: 0,
						overflowY: 'auto',
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-2)',
						padding: 'var(--space-3)',
					}}
				>
					{ordered.map((widget) => (
						<PreviewTile
							key={widget.id}
							widget={widget}
							verdict={read.tiles[widget.id]}
							label={label}
							// A tile clips its own overflow, which lets a flex column squeeze it below its
							// content — the reason line was cut in half. The list scrolls instead.
							style={{ flex: '0 0 auto' }}
						/>
					))}
				</ul>
			) : (
				<div
					ref={viewportRef}
					style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}
				>
					<ul
						aria-label={t('sceneEditor.preview.tiles', { label })}
						style={{
							...listStyle,
							position: 'relative',
							width: extentW * scale,
							height: extentH * scale,
						}}
					>
						{ordered.map((widget) => (
							<PreviewTile
								key={widget.id}
								widget={widget}
								verdict={read.tiles[widget.id]}
								label={label}
								style={{
									position: 'absolute',
									left: (widget.x - minX + GUTTER) * scale,
									top: (widget.y - minY + GUTTER) * scale,
									width: widget.w * scale,
									height: widget.h * scale,
								}}
							/>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}

function PreviewTile({
	widget,
	verdict,
	label,
	style,
}: {
	widget: BoardWidget;
	verdict: PreviewTileVerdict | undefined;
	label: string;
	style?: CSSProperties;
}) {
	const { t } = useI18n();
	if (!verdict) return null;
	const chip = TONE_CHIP[verdict.tone];
	const hidden = verdict.tone === 'hidden';
	const reason = t(REASON_KEY[verdict.reason], { label });
	return (
		<li
			data-testid={`preview-tile-${widget.id}`}
			data-tone={verdict.tone}
			data-reason={verdict.reason}
			// A fitted tile can be too small for its reason line; the tooltip keeps the whole sentence.
			title={reason}
			style={{
				boxSizing: 'border-box',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'flex-start',
				gap: 'var(--space-1)',
				padding: 'var(--space-2)',
				borderRadius: 'var(--radius-md)',
				border: `1px ${hidden ? 'dashed var(--color-border-strong)' : 'solid var(--color-border)'}`,
				background: hidden ? HIDDEN_HATCH : 'var(--color-surface-raised)',
				overflow: 'hidden',
				...style,
			}}
		>
			<span
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-1-5)',
					width: '100%',
					minWidth: 0,
				}}
			>
				<WidgetGlyph
					icon={widget.icon}
					color={hidden ? 'var(--color-text-tertiary)' : 'var(--color-accent)'}
				/>
				<span
					style={{
						flex: 1,
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						font: '600 var(--text-sm) var(--font-sans)',
						color: hidden ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
					}}
				>
					{widget.title}
				</span>
			</span>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 'var(--space-1)',
					padding: 'var(--space-0-5) var(--space-1-5)',
					borderRadius: 'var(--radius-full)',
					border: `1px solid ${chip.bd}`,
					background: chip.bg,
					color: chip.fg,
					font: '600 var(--text-2xs) var(--font-sans)',
				}}
			>
				<Icon name={chip.icon} size={11} />
				{t(TONE_KEY[verdict.tone])}
			</span>
			<span
				style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}
			>
				{reason}
			</span>
		</li>
	);
}
