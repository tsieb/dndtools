import { useMemo, useState, type FormEvent } from 'react';
import { isLiveScene } from '@dndtools/core';
import { Button, Callout, Dialog, Field, Input, RadioCard, Sheet } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { radioGroupKeyDown, T } from '../../app/screen-kit';
import type { Viewport } from '../../app/useViewport';
import { BUILTIN_SCREEN_TEMPLATES, templateTiles, type ScreenTemplate } from './screenModel';
import { ScreenThumbnail, type ThumbnailTile } from './ScreenThumbnail';
import { useScreenActions } from './useScreens';

interface TemplateOption {
	template: ScreenTemplate;
	name: string;
	body: string;
	tiles: ThumbnailTile[];
}

/**
 * RC-CAN-7.3 — "New screen": pick a template, name it, create it. The run templates (Command Center,
 * GM screen, Session, Prep, Blank) come first, then the CAN-4.4 scene templates, then the GM's own
 * saved layouts and template scenes — the same three kinds of source the scene template picker
 * offers. The name defaults to the template's, so Create is never blocked on typing.
 *
 * Phone: a DS `Sheet`, as the template picker and the tile gallery use. Wider: a DS `Dialog`.
 */
export function NewScreenDialog({
	open,
	onClose,
	viewport,
	onCreated,
}: {
	open: boolean;
	onClose: () => void;
	viewport: Viewport;
	/** The new screen's id, once the core accepted it; `warning` if a later step was refused. */
	onCreated: (id: string, warning?: string) => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const { createFromTemplate } = useScreenActions();
	const [choice, setChoice] = useState('gm-screen');
	const [name, setName] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const presets = runtime.state.commandCenter.presets;
	const scenes = runtime.state.scenes.scenes;
	const options = useMemo<TemplateOption[]>(() => {
		const builtins = BUILTIN_SCREEN_TEMPLATES.map((template) => ({
			template,
			name: template.nameKey ? t(template.nameKey) : (template.name ?? ''),
			body: template.bodyKey ? t(template.bodyKey) : '',
			tiles: templateTiles(template).map((tile, index) => ({
				...tile,
				key: `${template.id}:${index}`,
			})),
		}));
		const fromPresets = Object.values(presets)
			.filter((preset) => preset.widgets.length > 0)
			.map((preset) => ({
				template: {
					id: `preset-${preset.id}`,
					icon: 'layers',
					layoutPolicy: 'canvas' as const,
					source: { kind: 'preset' as const, presetId: preset.id },
				},
				name: preset.name,
				body: t('screens.template.savedLayout'),
				tiles: preset.widgets.map((widget) => ({
					key: widget.presetWidgetId,
					type: widget.type,
					...widget.layout,
				})),
			}));
		const fromScenes = Object.values(scenes)
			.filter(
				(scene) => scene.templateMeta.isTemplate && isLiveScene(scene) && scene.widgets.length > 0,
			)
			.map((scene) => ({
				template: {
					id: `scene-template-${scene.id}`,
					icon: 'scene',
					layoutPolicy: 'canvas' as const,
					source: { kind: 'scene' as const, templateSceneId: scene.id },
				},
				name: scene.name,
				body: t('screens.template.templateScene'),
				tiles: scene.widgets.map((widget) => ({
					key: widget.id,
					type: widget.type,
					...widget.layout,
				})),
			}));
		const saved = [...fromPresets, ...fromScenes].sort((a, b) => a.name.localeCompare(b.name));
		return [...builtins, ...saved];
	}, [presets, scenes, t]);

	const picked = options.find((option) => option.template.id === choice) ?? options[0];

	function close() {
		setError(null);
		setName('');
		setChoice('gm-screen');
		onClose();
	}

	async function submit(event?: FormEvent) {
		event?.preventDefault();
		if (busy || !picked) return;
		setBusy(true);
		setError(null);
		const result = await createFromTemplate(picked.template, name.trim() || picked.name);
		setBusy(false);
		if ('error' in result) {
			setError(result.error);
			return;
		}
		close();
		onCreated(result.id, result.warning);
	}

	const body = (
		<form
			id="new-screen-form"
			data-testid="new-screen"
			onSubmit={(event) => void submit(event)}
			style={{ display: 'flex', flexDirection: 'column', gap: T.space.four }}
		>
			{error && (
				<Callout tone="error" role="alert">
					{error}
				</Callout>
			)}
			<Field label={t('screens.new.name')} htmlFor="screen-name" help={t('screens.new.nameHelp')}>
				<Input
					id="screen-name"
					value={name}
					onChange={(e: { target: { value: string } }) => setName(e.target.value)}
					placeholder={picked?.name}
				/>
			</Field>
			<div
				role="radiogroup"
				aria-label={t('screens.new.templates')}
				onKeyDown={radioGroupKeyDown}
				style={{
					display: 'grid',
					gridTemplateColumns:
						viewport === 'phone' ? 'minmax(0, 1fr)' : 'repeat(auto-fill, minmax(200px, 1fr))',
					gap: T.space.two,
				}}
			>
				{options.map((option) => (
					<RadioCard
						key={option.template.id}
						value={option.template.id}
						checked={option.template.id === picked?.template.id}
						onChange={setChoice}
						heading={option.name}
						aria-label={option.name}
						data-testid={`screen-template-${option.template.id}`}
						style={{ alignItems: 'stretch' }}
					>
						<ScreenThumbnail tiles={option.tiles} icon={option.template.icon} />
						<span style={{ display: 'block', marginTop: T.space.one }}>{option.body}</span>
					</RadioCard>
				))}
			</div>
		</form>
	);

	// The footer is written out in each overlay rather than shared as a JSX constant: the emphasis
	// lint judges a JSX constant where it is defined, which is outside the Sheet/Dialog region.
	if (viewport === 'phone') {
		return (
			<Sheet
				open={open}
				onClose={close}
				side="bottom"
				title={t('screens.new.title')}
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={close}>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="primary"
							size="sm"
							icon="add"
							type="submit"
							form="new-screen-form"
							disabled={busy}
						>
							{busy ? t('screens.new.creating') : t('screens.new.create')}
						</Button>
					</>
				}
			>
				{body}
			</Sheet>
		);
	}
	return (
		<Dialog
			open={open}
			onClose={close}
			title={t('screens.new.title')}
			description={t('screens.new.description')}
			size="lg"
			footer={
				<>
					<Button variant="secondary" size="sm" disabled={busy} onClick={close}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="add"
						type="submit"
						form="new-screen-form"
						disabled={busy}
					>
						{busy ? t('screens.new.creating') : t('screens.new.create')}
					</Button>
				</>
			}
		>
			{body}
		</Dialog>
	);
}
