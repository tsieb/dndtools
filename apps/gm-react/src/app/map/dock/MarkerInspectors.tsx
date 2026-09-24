import {
	listSceneCardsForActor,
	type MapPoiView,
	type MapTokenView,
	type SceneVisibility,
} from '@dndtools/core';
import { useEffect, useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '../../../ds';
import type { MessageKey } from '../../../i18n';
import { useI18n } from '../../../i18n';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { T } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';
import { Section } from './InspectorSections';
import { POI_CATEGORIES, VIS_OPTION_KEYS } from './inspectorVocab';
import { CommitSlider } from './MapInspector';
import { PoiLinkSection } from './PoiNoteSection';

// ── POI inspector ───────────────────────────────────────────────────────────────────────────────
export function PoiInspector({
	editor,
	poi,
	announce,
}: {
	editor: MapEditorApi;
	poi: MapPoiView;
	announce: (m: string) => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [label, setLabel] = useState(poi.label);
	const [notes, setNotes] = useState(poi.notes);
	useEffect(() => {
		setLabel(poi.label);
		setNotes(poi.notes);
	}, [poi.id, poi.label, poi.notes]);
	const { run, actorId, mapId } = editor;
	const patch = (payload: Record<string, unknown>) =>
		void run({
			type: 'map.update-poi',
			actorId,
			payload: { mapId, poiId: poi.id, ...payload },
		} as never);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			<Section title={t('mapInspector.poi')}>
				<Field label={t('mapInspector.label')}>
					<Input
						value={label}
						onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
						onBlur={() => label.trim() && label !== poi.label && patch({ label: label.trim() })}
					/>
				</Field>
				<Field label={t('mapInspector.category')}>
					<Select
						value={poi.category}
						options={POI_CATEGORIES.map((c) => ({
							value: c,
							label: t(`mapInspector.poiCategory.${c}` as MessageKey),
						}))}
						onChange={(e: { target: { value: string } }) => patch({ category: e.target.value })}
					/>
				</Field>
				<Field label={t('common.visibility.label')}>
					<Select
						value={poi.visibility}
						options={VIS_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.label) }))}
						onChange={(e: { target: { value: string } }) =>
							patch({ visibility: e.target.value as SceneVisibility })
						}
					/>
				</Field>
				<Field label={t('mapInspector.notes')} help={t('mapInspector.notesHelp')}>
					<Textarea
						rows={3}
						value={notes}
						onChange={(e: { target: { value: string } }) => setNotes(e.target.value)}
						onBlur={() => notes !== poi.notes && patch({ notes })}
					/>
				</Field>
			</Section>

			{/* RC-MAP-3.10 — the link section (existing link + "Create note here") lives next door. */}
			<PoiLinkSection editor={editor} poi={poi} />

			<Section title={t('mapInspector.scenePackage')}>
				<Field label={t('mapInspector.scenePackage')} help={t('mapInspector.scenePackageHelp')}>
					<Select
						value={poi.linkedEntityType === 'scene-card' ? (poi.linkedEntityId ?? '') : ''}
						options={[
							{ value: '', label: t('mapInspector.scenePackageNone') },
							...listSceneCardsForActor(
								runtime.state.session,
								runtime.state.permissions,
								editor.actorId,
							).map((card) => ({ value: card.id, label: card.title })),
						]}
						onChange={(e: { target: { value: string } }) => {
							const cardId = e.target.value || null;
							patch({
								linkedEntityType: cardId ? 'scene-card' : null,
								linkedEntityId: cardId,
							});
						}}
					/>
				</Field>
			</Section>

			<Button
				variant="danger"
				size="sm"
				icon="delete"
				disabled={editor.busy}
				// Await the command before clearing + announcing: fire-and-forget claimed success and
				// dropped the selection even when the dispatch was rejected, hiding the failure.
				onClick={async () => {
					const ok = await run({
						type: 'map.delete-poi',
						actorId,
						payload: { mapId, poiId: poi.id },
					} as never);
					if (!ok) return;
					editor.clearSelection();
					announce(t('mapInspector.poiDeleted', { label: poi.label }));
				}}
			>
				{t('mapInspector.deletePoi')}
			</Button>
		</div>
	);
}

// ── Token inspector ─────────────────────────────────────────────────────────────────────────────
export function TokenInspector({
	editor,
	token,
	announce,
}: {
	editor: MapEditorApi;
	token: MapTokenView;
	announce: (m: string) => void;
}) {
	const { t } = useI18n();
	const [label, setLabel] = useState(token.label);
	useEffect(() => setLabel(token.label), [token.id, token.label]);
	const { run, actorId, mapId } = editor;
	const patch = (payload: Record<string, unknown>) =>
		void run({
			type: 'map.update-token',
			actorId,
			payload: { mapId, tokenId: token.id, ...payload },
		} as never);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			<Section title={t('mapInspector.token')}>
				<Field label={t('mapInspector.label')}>
					<Input
						value={label}
						onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
						onBlur={() => label.trim() && label !== token.label && patch({ label: label.trim() })}
					/>
				</Field>
				<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
					<span style={{ font: `12.5px ${T.sans}`, color: T.sub, minWidth: 40 }}>
						{t('mapInspector.size')}
					</span>
					<CommitSlider
						min={0.5}
						max={4}
						step={0.5}
						value={token.size}
						aria-label={t('mapInspector.tokenSize')}
						format={(v: number) => `${v}×`}
						onCommit={(v: number) => patch({ size: v })}
						style={{ flex: 1 }}
						readoutStyle={{ font: `12px ${T.mono}`, color: T.ink }}
					/>
				</div>
				<Field label={t('common.visibility.label')}>
					<Select
						value={token.visibility}
						options={VIS_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.label) }))}
						onChange={(e: { target: { value: string } }) =>
							patch({ visibility: e.target.value as SceneVisibility })
						}
					/>
				</Field>
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					{token.linkedActorId ? t('mapInspector.linkedActor') : t('mapInspector.notLinkedActor')}
				</div>
			</Section>

			<Button
				variant="danger"
				size="sm"
				icon="delete"
				disabled={editor.busy}
				onClick={async () => {
					const ok = await run({
						type: 'map.delete-token',
						actorId,
						payload: { mapId, tokenId: token.id },
					} as never);
					if (!ok) return;
					editor.clearSelection();
					announce(t('mapInspector.tokenDeleted', { label: token.label }));
				}}
			>
				{t('mapInspector.deleteToken')}
			</Button>
		</div>
	);
}
