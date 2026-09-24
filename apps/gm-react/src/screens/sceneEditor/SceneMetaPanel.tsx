import { findWidgetDefinition, type Scene, type SceneBackground } from '@dndtools/core';
import type React from 'react';
import { useState, type CSSProperties } from 'react';
import { Button, Card, Field, IconButton, Input, Select, Textarea } from '../../ds';
import { parseTags } from '../../app/scene-helpers';
import { Section } from './fields';
import { PHONE_PANEL_OVERLAY, usePhonePanelBack } from './shared';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';

const NOTE: CSSProperties = {
	font: 'var(--text-sm)/1.5 var(--font-sans)',
	color: 'var(--color-text-secondary)',
};

const TERTIARY_AS_SECONDARY = {
	'--color-text-tertiary': 'var(--color-text-secondary)',
} as CSSProperties;

/**
 * SceneMetaPanel — rename / re-describe / re-tag the scene AFTER creation, round-tripped through
 * `scene.update-metadata`. A right-docked side panel like the add-widget panel; Escape closes it.
 */
export function SceneMetaPanel({
	scene,
	name,
	description,
	tags,
	phone,
	belowCanvas = false,
	onSave,
	onClose,
}: {
	scene: Scene;
	name: string;
	description: string;
	tags: string[];
	phone: boolean;
	/** Automatic phone properties share space with the canvas instead of covering its controls. */
	belowCanvas?: boolean;
	onSave: (meta: {
		name: string;
		description: string;
		tags: string[];
		visualSettings: { background: SceneBackground };
	}) => void;
	onClose: () => void;
}) {
	const { t } = useI18n();
	usePhonePanelBack(phone, onClose);
	const runtime = useRuntime();
	const sourceId = scene.templateMeta.instantiatedFromTemplateSceneId;
	const [background, setBackground] = useState(scene.visualSettings.background);
	const [draftName, setDraftName] = useState(name);
	const [draftDescription, setDraftDescription] = useState(description);
	const [draftTags, setDraftTags] = useState(tags.join(', '));
	return (
		<Card
			elevation="overlay"
			padding="md"
			data-testid="scene-meta-panel"
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === 'Escape') {
					e.stopPropagation();
					onClose();
				}
			}}
			style={{
				width: 300,
				flex: '0 0 auto',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				maxHeight: '100%',
				overflow: 'auto',
				// DS Field help text is tertiary, which measured below 4.5:1 on this raised panel.
				...TERTIARY_AS_SECONDARY,
				...(belowCanvas
					? { width: '100%', maxHeight: '40%', minHeight: 0, flex: '0 1 auto' }
					: phone
						? PHONE_PANEL_OVERLAY
						: {}),
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				{/* Cinzel starts at --text-xl, so a panel title stays in the sans face. */}
				<h3
					style={{
						flex: 1,
						margin: 'var(--space-0)',
						font: '700 var(--text-md) var(--font-sans)',
						color: 'var(--color-text-primary)',
					}}
				>
					{t('sceneEditor.sceneDetails')}
				</h3>
				<IconButton
					icon="close"
					label={t('sceneEditor.closeDetails')}
					variant="ghost"
					size={phone ? 'lg' : 'sm'}
					onClick={onClose}
				/>
			</div>
			<Field label={t('sceneEditor.name')} htmlFor="scene-meta-name" required>
				<Input
					id="scene-meta-name"
					value={draftName}
					onChange={(e: { target: { value: string } }) => setDraftName(e.target.value)}
				/>
			</Field>
			<Field label={t('sceneEditor.description')} htmlFor="scene-meta-description">
				<Textarea
					id="scene-meta-description"
					rows={3}
					value={draftDescription}
					onChange={(e: { target: { value: string } }) => setDraftDescription(e.target.value)}
				/>
			</Field>
			<Field
				label={t('sceneEditor.tags')}
				htmlFor="scene-meta-tags"
				help={t('sceneEditor.tagsHelp')}
			>
				<Input
					id="scene-meta-tags"
					value={draftTags}
					onChange={(e: { target: { value: string } }) => setDraftTags(e.target.value)}
					placeholder={t('sceneEditor.tagsPlaceholder')}
				/>
			</Field>
			<Field label={t('sceneEditor.background')} htmlFor="scene-meta-background">
				<Select
					id="scene-meta-background"
					value={background}
					onChange={(e: { target: { value: string } }) =>
						setBackground(e.target.value as SceneBackground)
					}
					options={(['paper', 'parchment', 'dark', 'grid'] as const).map((value) => ({
						value,
						label: t(`sceneEditor.background.${value}`),
					}))}
				/>
			</Field>
			<Section label={t('sceneEditor.docks')}>
				{scene.widgets.some((widget) => widget.layout.dock) ? (
					scene.widgets
						.filter((widget) => widget.layout.dock)
						.map((widget) => (
							<div key={widget.id} style={NOTE}>
								{String(
									widget.configuration.title ??
										findWidgetDefinition(runtime.state.widgets, widget.type)?.displayName ??
										widget.type,
								)}
								:{' '}
								{widget.layout.dock === 'top'
									? t('sceneEditor.topDock')
									: widget.layout.dock && t(`builder.dock.${widget.layout.dock}`)}
							</div>
						))
				) : (
					<div style={NOTE}>{t('sceneEditor.none')}</div>
				)}
			</Section>
			<Section label={t('sceneEditor.sections')}>
				{scene.sections.length ? (
					scene.sections.map((section) => (
						<div key={section.id} style={NOTE}>
							{section.name} ({section.widgetInstanceIds.length})
						</div>
					))
				) : (
					<div style={NOTE}>{t('sceneEditor.none')}</div>
				)}
			</Section>
			<Section label={t('sceneEditor.template')}>
				<div style={NOTE}>
					{t(scene.templateMeta.isTemplate ? 'sceneEditor.isTemplate' : 'sceneEditor.notTemplate')}
				</div>
				<div style={NOTE}>
					{t('sceneEditor.sourceTemplate')}:{' '}
					{sourceId
						? (runtime.state.scenes.scenes[sourceId]?.name ?? t('sceneEditor.notAvailable'))
						: t('sceneEditor.none')}
				</div>
			</Section>
			{/* The subtle accent, like the toolbar's Done: one gold primary per region (RC-ENG-8.4). */}
			<Button
				variant="accent"
				size="sm"
				icon="check"
				disabled={!draftName.trim()}
				onClick={() =>
					onSave({
						name: draftName.trim(),
						description: draftDescription.trim(),
						tags: parseTags(draftTags),
						visualSettings: { background },
					})
				}
				style={{ alignSelf: 'flex-start' }}
			>
				{t('sceneEditor.saveDetails')}
			</Button>
		</Card>
	);
}
