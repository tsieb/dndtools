import type React from 'react';
import { useState } from 'react';
import { Button, Card, Field, IconButton, Input, Textarea } from '../../ds';
import { parseTags } from '../../app/scene-helpers';
import { PHONE_PANEL_OVERLAY } from './shared';

/**
 * SceneMetaPanel — rename / re-describe / re-tag the scene AFTER creation, round-tripped through
 * `scene.update-metadata`. A right-docked side panel like the add-widget panel; Escape closes it.
 */
export function SceneMetaPanel({
	name,
	description,
	tags,
	phone,
	onSave,
	onClose,
}: {
	name: string;
	description: string;
	tags: string[];
	phone: boolean;
	onSave: (meta: { name: string; description: string; tags: string[] }) => void;
	onClose: () => void;
}) {
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
					Scene details
				</span>
				<IconButton
					icon="close"
					label="Close scene details"
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
			</div>
			<Field label="Name" htmlFor="scene-meta-name" required>
				<Input
					id="scene-meta-name"
					value={draftName}
					onChange={(e: { target: { value: string } }) => setDraftName(e.target.value)}
				/>
			</Field>
			<Field label="Description" htmlFor="scene-meta-description">
				<Textarea
					id="scene-meta-description"
					rows={3}
					value={draftDescription}
					onChange={(e: { target: { value: string } }) => setDraftDescription(e.target.value)}
				/>
			</Field>
			<Field label="Tags" htmlFor="scene-meta-tags" help="Comma-separated.">
				<Input
					id="scene-meta-tags"
					value={draftTags}
					onChange={(e: { target: { value: string } }) => setDraftTags(e.target.value)}
					placeholder="dungeon, combat"
				/>
			</Field>
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
					})
				}
				style={{ alignSelf: 'flex-start' }}
			>
				Save details
			</Button>
		</Card>
	);
}
