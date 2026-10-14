import type React from 'react';
import { useId, useMemo, useState } from 'react';
import {
	BUILTIN_SCENE_TEMPLATES,
	findWidgetDefinition,
	isLiveScene,
	type BuiltinSceneTemplateId,
} from '@dndtools/core';
import { Button, Callout, Dialog, Sheet, Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n, type MessageKey } from '../../i18n';
import { tileMetadataForDefinition } from '../widgets/tileMeta';
import type { Viewport } from '../useViewport';
import { WidgetGlyph } from './frameParts';
import { AddEntry } from './GalleryParts';

/** A built-in template's catalog keys; the core names them in English (RC-POL-1.2). */
const TEMPLATE_COPY: Record<BuiltinSceneTemplateId, readonly [name: MessageKey, body: MessageKey]> =
	{
		combat: ['boardCanvas.templates.combat.name', 'boardCanvas.templates.combat.body'],
		social: ['boardCanvas.templates.social.name', 'boardCanvas.templates.social.body'],
		exploration: [
			'boardCanvas.templates.exploration.name',
			'boardCanvas.templates.exploration.body',
		],
		town: ['boardCanvas.templates.town.name', 'boardCanvas.templates.town.body'],
		'session-prep': [
			'boardCanvas.templates.sessionPrep.name',
			'boardCanvas.templates.sessionPrep.body',
		],
	};

/** The miniature's box. A layout is scaled down into it, never up. */
const MINI_WIDTH = 224;
const MINI_HEIGHT = 120;

/** One tile of a layout, in board coordinates: the shape every template kind reduces to. */
interface MiniTile {
	key: string;
	type: string;
	title: string | null;
	x: number;
	y: number;
	w: number;
	h: number;
}

type TemplateSource =
	| { kind: 'builtin'; templateId: BuiltinSceneTemplateId }
	| { kind: 'preset'; presetId: string }
	| { kind: 'scene'; templateSceneId: string };

interface TemplateOption {
	id: string;
	source: TemplateSource;
	name: string;
	description: string;
	icon: string;
	tiles: MiniTile[];
	/** Built-ins are drawn from code (`generated`); a saved template from its stored layout (`live`). */
	preview: 'generated' | 'live';
}

function titleOf(configuration: Record<string, unknown>): string | null {
	const title = configuration.title;
	return typeof title === 'string' && title.trim() ? title.trim() : null;
}

/**
 * The layout drawn as a schematic: every tile at its authored position and size, wearing its type's
 * accent rail and icon (the same identity the canvas frame and the gallery card use). It is read
 * straight from the template, so a saved template's miniature changes the moment its layout does.
 */
function LayoutMiniature({ tiles, preview }: { tiles: MiniTile[]; preview: 'generated' | 'live' }) {
	const runtime = useRuntime();
	const left = Math.min(...tiles.map((tile) => tile.x));
	const top = Math.min(...tiles.map((tile) => tile.y));
	const right = Math.max(...tiles.map((tile) => tile.x + tile.w));
	const bottom = Math.max(...tiles.map((tile) => tile.y + tile.h));
	const scale = Math.min(MINI_WIDTH / (right - left), MINI_HEIGHT / (bottom - top), 1);
	return (
		<div
			aria-hidden
			data-preview={preview}
			style={{
				position: 'relative',
				height: MINI_HEIGHT,
				overflow: 'hidden',
				borderRadius: 'var(--radius-sm)',
				background: 'var(--color-surface-sunken)',
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: '50%',
					top: '50%',
					width: (right - left) * scale,
					height: (bottom - top) * scale,
					transform: 'translate(-50%, -50%)',
				}}
			>
				{tiles.map((tile) => {
					const definition = findWidgetDefinition(runtime.state.widgets, tile.type);
					const meta = definition
						? tileMetadataForDefinition(definition)
						: tileMetadataForDefinition({ category: '', icon: 'widget', description: '' });
					const w = tile.w * scale;
					const h = tile.h * scale;
					return (
						<div
							key={tile.key}
							style={{
								position: 'absolute',
								left: (tile.x - left) * scale,
								top: (tile.y - top) * scale,
								width: w,
								height: h,
								boxSizing: 'border-box',
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								justifyContent: 'center',
								gap: 'var(--space-1)',
								padding: 'var(--space-1)',
								overflow: 'hidden',
								border: '1px solid var(--color-border)',
								borderLeft: `3px solid var(${meta.accentToken})`,
								borderRadius: 'var(--radius-sm)',
								background: 'var(--color-surface-raised)',
							}}
						>
							<WidgetGlyph icon={meta.icon} size={12} color={`var(${meta.accentToken})`} />
							{h >= 36 && w >= 56 && (
								<span
									style={{
										maxWidth: '100%',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
										font: '600 var(--text-2xs)/1.2 var(--font-sans)',
										color: 'var(--color-text-secondary)',
									}}
								>
									{tile.title ?? definition?.displayName ?? tile.type}
								</span>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function TemplateCard({
	option,
	disabled,
	onPick,
}: {
	option: TemplateOption;
	disabled: boolean;
	onPick: () => void;
}) {
	const { t } = useI18n();
	const baseId = useId();
	const nameId = `${baseId}-name`;
	const descId = `${baseId}-desc`;
	const kind =
		option.source.kind === 'preset'
			? t('boardCanvas.templates.presetKind')
			: option.source.kind === 'scene'
				? t('boardCanvas.templates.sceneKind')
				: null;
	return (
		<li
			data-testid={`template-card-${option.id}`}
			style={{
				position: 'relative',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				padding: 'var(--space-3)',
				border: '1px solid var(--color-border)',
				borderRadius: 'var(--radius-md)',
				background: 'var(--color-surface-raised)',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<WidgetGlyph icon={option.icon} size={16} />
				<span
					id={nameId}
					style={{
						flex: 1,
						minWidth: 0,
						font: '600 var(--text-sm) var(--font-sans)',
						color: 'var(--color-text-primary)',
					}}
				>
					{option.name}
				</span>
				<span
					style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}
				>
					{t('boardCanvas.templates.tileCount', { count: option.tiles.length })}
				</span>
			</div>
			<div
				id={descId}
				style={{
					font: 'var(--text-2xs)/1.4 var(--font-sans)',
					color: 'var(--color-text-secondary)',
				}}
			>
				{kind ? `${kind} · ${option.description}` : option.description}
			</div>
			<LayoutMiniature tiles={option.tiles} preview={option.preview} />
			{/* The whole card is the target; the button stretches over it, as the gallery card does. */}
			<button
				type="button"
				data-testid={`template-apply-${option.id}`}
				aria-labelledby={nameId}
				aria-describedby={descId}
				aria-disabled={disabled || undefined}
				onClick={() => disabled || onPick()}
				style={{
					position: 'absolute',
					inset: 0,
					background: 'transparent',
					border: 0,
					borderRadius: 'var(--radius-md)',
					cursor: disabled ? 'progress' : 'pointer',
				}}
			/>
		</li>
	);
}

/** The gallery header's "Use a scene template" entry (its `startAction` slot, shown while empty). */
export function TemplateStartEntry({ onPick }: { onPick: () => void }) {
	const { t } = useI18n();
	return (
		<AddEntry
			icon="layers"
			label={t('boardCanvas.templates.startEntry')}
			hint={t('boardCanvas.templates.startEntryHint')}
			onClick={onPick}
		/>
	);
}

export interface TemplatePickerProps {
	open: boolean;
	onClose: () => void;
	viewport: Viewport;
	/** The scene the chosen template is applied to. Nothing is offered without one. */
	sceneId: string | null;
	/** Called once the core accepted the template, after the picker has closed. */
	onApplied?: () => void;
}

/**
 * TemplatePicker — "start from a template" for any scene (RC-CAN-4.4).
 *
 * Offers the five built-in layouts (Combat scene, Social encounter, Exploration, Town visit, Session
 * prep) with generated miniatures, then the DM's own templates — saved board layouts (Command Center
 * presets) and scenes marked as templates — with miniatures drawn live from their stored layouts.
 * Picking one dispatches `scene.apply-template`, which appends the template's tiles to the scene (on an
 * empty scene: exactly as authored). The hosts open it only at the contextual moments the roadmap
 * names — the empty canvas, the gallery header while the scene is empty, and the palette.
 *
 * Phone: a DS `Sheet`, like the gallery. Wider: a DS `Dialog`, because picking a template is a
 * one-shot decision rather than a panel the DM keeps open beside the canvas.
 */
export function TemplatePicker({
	open,
	onClose,
	viewport,
	sceneId,
	onApplied,
}: TemplatePickerProps) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const builtins: TemplateOption[] = BUILTIN_SCENE_TEMPLATES.map((template) => ({
		id: `builtin-${template.id}`,
		source: { kind: 'builtin', templateId: template.id },
		name: t(TEMPLATE_COPY[template.id][0]),
		description: t(TEMPLATE_COPY[template.id][1]),
		icon: template.icon,
		preview: 'generated',
		tiles: template.widgets.map((widget, index) => ({
			key: `${template.id}:${index}`,
			type: widget.type,
			title: widget.title ?? null,
			x: widget.x,
			y: widget.y,
			w: widget.w,
			h: widget.h,
		})),
	}));

	const presets = runtime.state.commandCenter.presets;
	const scenes = runtime.state.scenes.scenes;
	const saved = useMemo<TemplateOption[]>(() => {
		if (!open) return [];
		const fromPresets: TemplateOption[] = Object.values(presets)
			.filter((preset) => preset.widgets.length > 0)
			.map((preset) => ({
				id: `preset-${preset.id}`,
				source: { kind: 'preset', presetId: preset.id },
				name: preset.name,
				description: '',
				icon: 'layers',
				preview: 'live',
				tiles: preset.widgets.map((widget) => ({
					key: widget.presetWidgetId,
					type: widget.type,
					title: titleOf(widget.configuration),
					x: widget.layout.x,
					y: widget.layout.y,
					w: widget.layout.w,
					h: widget.layout.h,
				})),
			}));
		const fromScenes: TemplateOption[] = Object.values(scenes)
			.filter(
				(scene) =>
					scene.templateMeta.isTemplate &&
					isLiveScene(scene) &&
					scene.id !== sceneId &&
					scene.widgets.length > 0,
			)
			.map((scene) => ({
				id: `scene-${scene.id}`,
				source: { kind: 'scene', templateSceneId: scene.id },
				name: scene.name,
				description: scene.description,
				icon: 'scene',
				preview: 'live',
				tiles: scene.widgets.map((widget) => ({
					key: widget.id,
					type: widget.type,
					title: titleOf(widget.configuration),
					x: widget.layout.x,
					y: widget.layout.y,
					w: widget.layout.w,
					h: widget.layout.h,
				})),
			}));
		return [...fromPresets, ...fromScenes].sort((a, b) => a.name.localeCompare(b.name));
	}, [open, presets, scenes, sceneId]);

	function close() {
		setError(null);
		onClose();
	}

	async function apply(option: TemplateOption) {
		if (busy || !sceneId) return;
		setBusy(true);
		setError(null);
		try {
			const result = await runtime.dispatch({
				type: 'scene.apply-template',
				actorId,
				payload: { sceneId, source: option.source },
			});
			if (result.status === 'rejected') {
				setError(result.rejection.message);
				return;
			}
			const event = result.events.find((e) => e.kind === 'scene.template-applied');
			const missing =
				event && event.kind === 'scene.template-applied' ? event.missingWidgetTypes : [];
			Toaster.success(
				missing.length > 0
					? t('boardCanvas.templates.appliedPartly', {
							name: option.name,
							types: missing.join(', '),
						})
					: t('boardCanvas.templates.applied', { name: option.name }),
			);
			close();
			onApplied?.();
		} catch {
			setError(t('boardCanvas.templates.notSaved'));
		} finally {
			setBusy(false);
		}
	}

	const heading: React.CSSProperties = {
		margin: 'var(--space-0)',
		font: '700 var(--text-xs) var(--font-sans)',
		letterSpacing: '0.04em',
		textTransform: 'uppercase',
		color: 'var(--color-text-secondary)',
	};
	const grid: React.CSSProperties = {
		listStyle: 'none',
		margin: 'var(--space-0)',
		padding: 'var(--space-0)',
		display: 'grid',
		gridTemplateColumns: `repeat(auto-fill, minmax(${MINI_WIDTH + 26}px, 1fr))`,
		gap: 'var(--space-2)',
	};
	const list = (options: TemplateOption[], label: string) => (
		<ul aria-label={label} aria-busy={busy || undefined} style={grid}>
			{options.map((option) => (
				<TemplateCard
					key={option.id}
					option={option}
					disabled={busy}
					onPick={() => void apply(option)}
				/>
			))}
		</ul>
	);

	const body = (
		<div
			data-testid="template-picker"
			style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
		>
			{error && (
				<Callout tone="error" role="alert">
					{error}
				</Callout>
			)}
			<h3 style={heading}>{t('boardCanvas.templates.builtin')}</h3>
			{list(builtins, t('boardCanvas.templates.builtin'))}
			<h3 style={heading}>{t('boardCanvas.templates.saved')}</h3>
			{saved.length > 0 ? (
				list(saved, t('boardCanvas.templates.saved'))
			) : (
				<div
					style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}
				>
					{t('boardCanvas.templates.savedEmpty')}
				</div>
			)}
		</div>
	);

	if (viewport === 'phone') {
		return (
			<Sheet
				open={open}
				onClose={close}
				side="bottom"
				title={t('boardCanvas.templates.title')}
				data-testid="template-picker-sheet"
			>
				{body}
			</Sheet>
		);
	}
	return (
		<Dialog
			open={open}
			onClose={close}
			title={t('boardCanvas.templates.title')}
			description={t('boardCanvas.templates.description')}
			size="lg"
			data-testid="template-picker-dialog"
			footer={
				<Button variant="secondary" size="sm" onClick={close}>
					{t('common.action.cancel')}
				</Button>
			}
		>
			{body}
		</Dialog>
	);
}
