import { useEffect, useMemo, useState } from 'react';
import { CONTENT_ITEM_ENTITY_TYPE, getContentItemsForActor, type MapPoiView } from '@dndtools/core';
import { Button, Dialog, Field, Icon, Input } from '../../../ds';
import { T, eb, radioGroupKeyDown } from '../../screen-kit';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n, type MessageKey } from '../../../i18n';
import type { MapEditorApi } from '../useMapEditor';

/**
 * RC-MAP-3.10 — the POI's LINK section: the note a point of interest points at.
 *
 * Two paths, one section. The DM can point the POI at something that already exists (the entity
 * type/id fields, unchanged), or author the note right here: "Create note here" opens a single-page
 * dialog (title, a type card, a starter body) that dispatches the REAL `content.create-object`
 * command and then links the created item to the POI with `map.update-poi`. Nothing is invented —
 * both writes are ordinary core commands, and a rejected create never leaves a half-made link.
 *
 * The four type cards map onto the published Vault Object subtypes
 * (`packages/core/src/state/vault-object-schema.ts`). There is no `location` subtype, so Location
 * and Note are both `note` objects; they differ only in the starter body the note opens with.
 *
 * It lives beside `InspectorPanel.tsx` rather than inside it because that file sits ON the 800-line
 * hard limit (RC-STB-2.7) — the POI link section moved out whole, no behaviour change.
 */

interface NoteTypeCard {
	readonly id: 'location' | 'npc' | 'faction' | 'note';
	readonly icon: string;
	readonly subtype: 'note' | 'character' | 'faction';
	readonly labelKey: MessageKey;
	readonly descKey: MessageKey;
	readonly starterKey: MessageKey;
}

const NOTE_TYPES: readonly NoteTypeCard[] = [
	{
		id: 'location',
		icon: 'poi',
		subtype: 'note',
		labelKey: 'mapPoiNote.type.location',
		descKey: 'mapPoiNote.type.locationDesc',
		starterKey: 'mapPoiNote.starter.location',
	},
	{
		id: 'npc',
		icon: 'characters-person',
		subtype: 'character',
		labelKey: 'mapPoiNote.type.npc',
		descKey: 'mapPoiNote.type.npcDesc',
		starterKey: 'mapPoiNote.starter.npc',
	},
	{
		id: 'faction',
		icon: 'flag',
		subtype: 'faction',
		labelKey: 'mapPoiNote.type.faction',
		descKey: 'mapPoiNote.type.factionDesc',
		starterKey: 'mapPoiNote.starter.faction',
	},
	{
		id: 'note',
		icon: 'note-edit',
		subtype: 'note',
		labelKey: 'mapPoiNote.type.note',
		descKey: 'mapPoiNote.type.noteDesc',
		starterKey: 'mapPoiNote.starter.note',
	},
] as const;

/** The frontmatter a subtype's schema REQUIRES, derived from the chosen title (fail closed). */
function fieldsFor(card: NoteTypeCard, title: string): Record<string, unknown> {
	if (card.subtype === 'character') return { name: title, characterKind: 'npc' };
	if (card.subtype === 'faction') return { name: title };
	return {};
}

/** The local twin of the Inspector's section heading (the panel keeps its own copy). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			<div style={eb}>{title}</div>
			{children}
		</div>
	);
}

export function PoiLinkSection({ editor, poi }: { editor: MapEditorApi; poi: MapPoiView }) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [linkType, setLinkType] = useState(poi.linkedEntityType ?? '');
	const [linkId, setLinkId] = useState(poi.linkedEntityId ?? '');
	const [creating, setCreating] = useState(false);
	useEffect(() => {
		setLinkType(poi.linkedEntityType ?? '');
		setLinkId(poi.linkedEntityId ?? '');
	}, [poi.id, poi.linkedEntityType, poi.linkedEntityId]);
	const { run, actorId, mapId } = editor;

	// The linked note's title, read ACTOR-SCOPED: a link to an item this actor may not see resolves
	// to nothing at all rather than leaking a title through the inspector.
	const linkedTitle = useMemo(() => {
		if (poi.linkedEntityId === null) return null;
		const items = getContentItemsForActor(
			runtime.state.content,
			runtime.state.permissions,
			actorId,
		);
		return items.find((item) => item.id === poi.linkedEntityId)?.title ?? null;
	}, [runtime.state.content, runtime.state.permissions, actorId, poi.linkedEntityId]);

	return (
		<Section title={t('mapInspector.link')}>
			<div style={{ display: 'flex', gap: 8 }}>
				<Field label={t('mapInspector.entityType')} style={{ flex: 1 }}>
					<Input
						value={linkType}
						placeholder={t('mapInspector.entityTypePlaceholder')}
						onChange={(e: { target: { value: string } }) => setLinkType(e.target.value)}
					/>
				</Field>
				<Field label={t('mapInspector.entityId')} style={{ flex: 1 }}>
					<Input
						value={linkId}
						placeholder={t('mapInspector.entityIdPlaceholder')}
						onChange={(e: { target: { value: string } }) => setLinkId(e.target.value)}
					/>
				</Field>
			</div>
			<Button
				variant="secondary"
				size="sm"
				icon="link"
				disabled={editor.busy}
				onClick={() =>
					void run({
						type: 'map.update-poi',
						actorId,
						payload: {
							mapId,
							poiId: poi.id,
							linkedEntityType: linkType.trim() || null,
							linkedEntityId: linkType.trim() && linkId.trim() ? linkId.trim() : null,
						},
					} as never)
				}
			>
				{t('mapInspector.saveLink')}
			</Button>
			{linkedTitle !== null && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						font: `12px ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="knowledge-book" size={13} />
					<span style={{ color: T.ink }}>{linkedTitle}</span>
				</div>
			)}
			{/* Authoring is DM-only, so a player is not shown a control they could never use. */}
			{editor.isDm && (
				<Button
					variant="secondary"
					size="sm"
					icon="note-edit"
					disabled={editor.busy}
					onClick={() => setCreating(true)}
				>
					{t('mapPoiNote.create')}
				</Button>
			)}
			{creating && (
				<CreateNoteDialog editor={editor} poi={poi} onClose={() => setCreating(false)} />
			)}
		</Section>
	);
}

/**
 * The single-page "Create note here" dialog. One screen: a title, a type card, and the template
 * starter body the note opens with — no wizard, no step count. The note is authored DM-only (the create
 * command fails closed to it); widening it is a deliberate act on the note itself.
 */
function CreateNoteDialog({
	editor,
	poi,
	onClose,
}: {
	editor: MapEditorApi;
	poi: MapPoiView;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const [title, setTitle] = useState(poi.label);
	const [typeId, setTypeId] = useState<NoteTypeCard['id']>('location');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const card = NOTE_TYPES.find((c) => c.id === typeId) ?? NOTE_TYPES[0]!;
	const trimmed = title.trim();

	const create = async () => {
		if (!trimmed || busy) return;
		setBusy(true);
		setError(null);
		try {
			// content.create-object — the real DM-only vault write, schema-validated fail-closed before
			// anything durable lands. The new id comes off the emitted `content.object-changed` event.
			const result = await runtime.dispatch({
				type: 'content.create-object',
				actorId: editor.actorId,
				payload: {
					subtype: card.subtype,
					title: trimmed,
					fields: fieldsFor(card, trimmed),
					body: t(card.starterKey),
					visibility: 'dm-only',
				},
			});
			if (result.status !== 'accepted') {
				setError(result.rejection.message);
				return;
			}
			const created = result.events.find(
				(e) => (e as { kind?: string }).kind === 'content.object-changed',
			) as { itemId?: string } | undefined;
			if (!created?.itemId) {
				setError(t('mapPoiNote.linkFailed'));
				return;
			}
			// Only now is the POI pointed at it: a rejected create can never leave a dangling link.
			const linked = await editor.run({
				type: 'map.update-poi',
				actorId: editor.actorId,
				payload: {
					mapId: editor.mapId,
					poiId: poi.id,
					linkedEntityType: CONTENT_ITEM_ENTITY_TYPE,
					linkedEntityId: created.itemId,
				},
			} as never);
			if (!linked) {
				setError(t('mapPoiNote.linkFailed'));
				return;
			}
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : t('mapPoiNote.linkFailed'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open
			onClose={onClose}
			title={t('mapPoiNote.dialogTitle')}
			description={t('mapPoiNote.dialogDesc')}
			size="md"
			footer={
				<>
					<Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
						{t('common.action.cancel')}
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="check"
						onClick={() => void create()}
						disabled={busy || trimmed.length === 0}
					>
						{t('mapPoiNote.confirm')}
					</Button>
				</>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
				<Field label={t('mapPoiNote.title')}>
					<Input
						value={title}
						onChange={(e: { target: { value: string } }) => setTitle(e.target.value)}
					/>
				</Field>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					<div style={eb}>{t('mapPoiNote.type')}</div>
					<div
						role="radiogroup"
						aria-label={t('mapPoiNote.type')}
						onKeyDown={radioGroupKeyDown}
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
							gap: 8,
						}}
					>
						{NOTE_TYPES.map((c) => {
							const on = c.id === typeId;
							return (
								<button
									key={c.id}
									type="button"
									role="radio"
									aria-checked={on}
									tabIndex={on ? 0 : -1}
									onClick={() => setTypeId(c.id)}
									style={{
										display: 'flex',
										alignItems: 'flex-start',
										gap: 10,
										padding: 12,
										borderRadius: 10,
										cursor: 'pointer',
										textAlign: 'left',
										border: `1px solid ${on ? T.accBd : T.bd}`,
										background: on ? T.accSub : T.surf,
									}}
								>
									<span style={{ color: on ? T.acc : T.sub, flex: '0 0 auto' }}>
										<Icon name={c.icon} size="sm" />
									</span>
									<span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
										<span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>
											{t(c.labelKey)}
										</span>
										<span style={{ font: `11px ${T.sans}`, color: T.sub }}>{t(c.descKey)}</span>
									</span>
								</button>
							);
						})}
					</div>
				</div>
				{/* Not a Field: the starter body is READ-ONLY copy, and a <label> pointing at a <pre> is not a
				    control association at all — the group carries its own name instead. */}
				<div
					role="group"
					aria-label={t('mapPoiNote.starter')}
					style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
				>
					<div style={eb}>{t('mapPoiNote.starter')}</div>
					<pre
						style={{
							margin: 0,
							padding: 10,
							borderRadius: 8,
							border: `1px solid ${T.bd}`,
							background: T.sunken,
							font: `12px ${T.mono}`,
							color: T.sub,
							whiteSpace: 'pre-wrap',
						}}
					>
						{t(card.starterKey)}
					</pre>
					<span style={{ font: `11px ${T.sans}`, color: T.sub }}>
						{t('mapPoiNote.starterHelp')}
					</span>
				</div>
				{error !== null && (
					<p role="alert" style={{ margin: 0, font: `12px ${T.sans}`, color: T.err }}>
						{error}
					</p>
				)}
			</div>
		</Dialog>
	);
}
