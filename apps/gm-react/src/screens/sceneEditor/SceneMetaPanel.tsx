import { findWidgetDefinition, type Scene, type SceneBackground } from '@dndtools/core';
import type React from 'react';
import { useState } from 'react';
import { Button, Card, Field, IconButton, Input, Select, Textarea } from '../../ds';
import { parseTags } from '../../app/scene-helpers';
import { Section } from './fields';
import { inspectorLabels, PHONE_PANEL_OVERLAY } from './shared';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';

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
	onSave,
	onClose,
}: {
	scene: Scene;
	name: string;
	description: string;
	tags: string[];
	phone: boolean;
	onSave: (meta: {
		name: string;
		description: string;
		tags: string[];
		visualSettings: { background: SceneBackground };
	}) => void;
	onClose: () => void;
}) {
	const { t, locale } = useI18n();
	const labels = inspectorLabels(locale);
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
				...(phone ? PHONE_PANEL_OVERLAY : {}),
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span
					style={{
						flex: 1,
						font: '700 var(--text-md) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					{t('sceneEditor.sceneDetails')}
				</span>
				<IconButton
					icon="close"
					label={t('sceneEditor.closeDetails')}
					variant="ghost"
					size="sm"
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
			<Field label={labels.background}>
				<Select
					value={background}
					onChange={(e: { target: { value: string } }) =>
						setBackground(e.target.value as SceneBackground)
					}
					options={(['paper', 'parchment', 'dark', 'grid'] as const).map((value) => ({
						value,
						label: labels[value],
					}))}
				/>
			</Field>
			<Section label={labels.docks}>
				{scene.widgets.some((widget) => widget.layout.dock)
					? scene.widgets
							.filter((widget) => widget.layout.dock)
							.map((widget) => (
								<div key={widget.id}>
									{String(
										widget.configuration.title ??
											findWidgetDefinition(runtime.state.widgets, widget.type)?.displayName ??
											widget.type,
									)}
									:{' '}
									{widget.layout.dock === 'top'
										? labels.topDock
										: widget.layout.dock && t(`builder.dock.${widget.layout.dock}`)}
								</div>
							))
					: labels.none}
			</Section>
			<Section label={labels.sections}>
				{scene.sections.length
					? scene.sections.map((section) => (
							<div key={section.id}>
								{section.name} ({section.widgetInstanceIds.length})
							</div>
						))
					: labels.none}
			</Section>
			<Section label={labels.template}>
				<div>{scene.templateMeta.isTemplate ? labels.yes : labels.no}</div>
				<div>
					{labels.source}:{' '}
					{sourceId
						? (runtime.state.scenes.scenes[sourceId]?.name ?? labels.unavailable)
						: labels.none}
				</div>
			</Section>
			<Button
				variant="primary"
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
