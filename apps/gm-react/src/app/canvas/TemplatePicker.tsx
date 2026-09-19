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
import { useI18n, type MessageValues } from '../../i18n';
import { formatMessage } from '../../i18n/format';
import { tileMetadataForDefinition } from '../widgets/tileMeta';
import type { Viewport } from '../useViewport';
import { WidgetGlyph } from './WidgetFrame';

// Feature-local translations, the same pattern as AddWidgetGallery: the built-in names come from the
// core in English, so their localized copy lives here keyed by template id.
const pickerMessages = {
	en: {
		'templates.title': 'Start from a template',
		'templates.description':
			'Pick a layout and its tiles land in this scene. Anything already here stays put.',
		'templates.builtin': 'Built-in templates',
		'templates.saved': 'Your templates',
		'templates.savedEmpty':
			'Save a board layout or mark a scene as a template and it shows up here.',
		'templates.tileCount': '{count, plural, one {# tile} other {# tiles}}',
		'templates.presetKind': 'Saved layout',
		'templates.sceneKind': 'Template scene',
		'templates.applied': 'Applied “{name}”.',
		'templates.appliedPartly':
			'Applied “{name}”. Skipped tiles whose widget is no longer installed: {types}.',
		'templates.notSaved': "That template couldn't be saved to this device. Try again.",
		'templates.cancel': 'Cancel',
		'templates.combat.name': 'Combat scene',
		'templates.combat.body': 'Initiative, the battle map, dice and a round timer in reach.',
		'templates.social.name': 'Social encounter',
		'templates.social.body': 'NPC notes, a handout to reveal, dice for checks and ambience.',
		'templates.exploration.name': 'Exploration',
		'templates.exploration.body': 'The region map with travel notes, a watch timer and dice.',
		'templates.town.name': 'Town visit',
		'templates.town.body': 'A town map, shop and rumour notes, and a handout for posted notices.',
		'templates.session-prep.name': 'Session prep',
		'templates.session-prep.body':
			'Prep checklist, session notes, the reference shelf and the next map.',
	},
	es: {
		'templates.title': 'Empieza con una plantilla',
		'templates.description':
			'Elige un diseño y sus widgets se colocarán en esta escena. Lo que ya haya se queda donde está.',
		'templates.builtin': 'Plantillas incluidas',
		'templates.saved': 'Tus plantillas',
		'templates.savedEmpty':
			'Guarda un diseño del tablero o marca una escena como plantilla y aparecerá aquí.',
		'templates.tileCount': '{count, plural, one {# widget} other {# widgets}}',
		'templates.presetKind': 'Diseño guardado',
		'templates.sceneKind': 'Escena plantilla',
		'templates.applied': 'Se aplicó «{name}».',
		'templates.appliedPartly':
			'Se aplicó «{name}». Se omitieron los widgets que ya no están instalados: {types}.',
		'templates.notSaved':
			'No se pudo guardar la plantilla en este dispositivo. Inténtalo de nuevo.',
		'templates.cancel': 'Cancelar',
		'templates.combat.name': 'Escena de combate',
		'templates.combat.body': 'Iniciativa, el mapa de batalla, dados y un temporizador de asalto.',
		'templates.social.name': 'Encuentro social',
		'templates.social.body':
			'Notas de PNJ, un documento para revelar, dados para pruebas y ambientación.',
		'templates.exploration.name': 'Exploración',
		'templates.exploration.body':
			'El mapa de la región con notas de viaje, un temporizador de guardia y dados.',
		'templates.town.name': 'Visita a la ciudad',
		'templates.town.body':
			'Un mapa de la ciudad, notas de tiendas y rumores, y un documento para los avisos.',
		'templates.session-prep.name': 'Preparación de sesión',
		'templates.session-prep.body':
			'Lista de preparación, notas de sesión, la referencia y el próximo mapa.',
	},
} as const;

type PickerKey = keyof typeof pickerMessages.en;

function usePickerCopy() {
	const { locale } = useI18n();
	return (key: PickerKey, values?: MessageValues) =>
		formatMessage(locale, pickerMessages[locale][key], values);
}

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
	const copy = usePickerCopy();
	const baseId = useId();
	const nameId = `${baseId}-name`;
	const descId = `${baseId}-desc`;
	const kind =
		option.source.kind === 'preset'
			? copy('templates.presetKind')
			: option.source.kind === 'scene'
				? copy('templates.sceneKind')
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
					style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}
				>
					{copy('templates.tileCount', { count: option.tiles.length })}
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
	const copy = usePickerCopy();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const builtins: TemplateOption[] = BUILTIN_SCENE_TEMPLATES.map((template) => ({
		id: `builtin-${template.id}`,
		source: { kind: 'builtin', templateId: template.id },
		name: copy(`templates.${template.id}.name` as PickerKey),
		description: copy(`templates.${template.id}.body` as PickerKey),
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
					? copy('templates.appliedPartly', { name: option.name, types: missing.join(', ') })
					: copy('templates.applied', { name: option.name }),
			);
			close();
			onApplied?.();
		} catch {
			setError(copy('templates.notSaved'));
		} finally {
			setBusy(false);
		}
	}

	const heading: React.CSSProperties = {
		margin: 'var(--space-0)',
		font: '700 var(--text-xs) var(--font-sans)',
		letterSpacing: '0.04em',
		textTransform: 'uppercase',
		color: 'var(--color-text-tertiary)',
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
			<h3 style={heading}>{copy('templates.builtin')}</h3>
			{list(builtins, copy('templates.builtin'))}
			<h3 style={heading}>{copy('templates.saved')}</h3>
			{saved.length > 0 ? (
				list(saved, copy('templates.saved'))
			) : (
				<div
					style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}
				>
					{copy('templates.savedEmpty')}
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
				title={copy('templates.title')}
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
			title={copy('templates.title')}
			description={copy('templates.description')}
			size="lg"
			data-testid="template-picker-dialog"
			footer={
				<Button variant="secondary" size="sm" onClick={close}>
					{copy('templates.cancel')}
				</Button>
			}
		>
			{body}
		</Dialog>
	);
}
