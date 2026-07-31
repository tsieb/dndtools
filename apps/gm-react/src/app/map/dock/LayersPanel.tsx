import { useMemo, useRef, useState } from 'react';
import type { MapLayerQueryEntry, SceneVisibility } from '@dndtools/core';
import { Button, Chip, Dialog, EmptyState, Icon, Input, LayerRow, Popover } from '../../../ds';
import { T, eb } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';
import { CATEGORY_TO_BADGE, VIS_CORE_TO_DS, VIS_DS_TO_CORE } from '../mapVocab';
import { categoryForTool } from '../useMapEditor';

/**
 * MAP-021 — the real Layers panel. A tag/category filter bar, then the render-ordered list built on the
 * DS `LayerRow` (anti-pattern AP-6: player-visibility, DM display, and opacity are THREE independent
 * controls). Reorder works by drag AND by Alt+↑/↓ (the WCAG 2.5.7 keyboard alternative). A `readOnly`
 * variant strips authoring for the non-DM path so the panel doubles as a keyboard-navigable object list.
 */
export function LayersPanel({
	editor,
	announce,
}: {
	editor: MapEditorApi;
	announce: (message: string) => void;
}) {
	const { layers, isDm, activeLayerId, run, mapId, actorId, nextId } = editor;
	const [filter, setFilter] = useState('');
	const [menuFor, setMenuFor] = useState<string | null>(null);
	// Handed to whichever row's ⋯ button currently owns the open menu, so Popover's outside-pointerdown
	// dismissal does not race that same button's toggle and leave the menu stuck open.
	const menuTriggerRef = useRef<HTMLButtonElement>(null);
	const [confirmDelete, setConfirmDelete] = useState<MapLayerQueryEntry | null>(null);
	const [tagsFor, setTagsFor] = useState<MapLayerQueryEntry | null>(null);
	const [dragIndex, setDragIndex] = useState<number | null>(null);

	const allTags = useMemo(() => {
		const set = new Set<string>();
		for (const l of layers) for (const t of l.tags) set.add(t);
		return [...set].sort();
	}, [layers]);

	const shown = useMemo(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return layers;
		return layers.filter(
			(l) => l.name.toLowerCase().includes(q) || l.tags.some((t) => t.toLowerCase().includes(q)),
		);
	}, [layers, filter]);

	const activeId =
		activeLayerId && layers.some((l) => l.layerId === activeLayerId) ? activeLayerId : null;

	const reorder = (layerId: string, toOrder: number) => {
		if (toOrder < 0 || toOrder >= layers.length) return;
		void run({ type: 'map.reorder-layer', actorId, payload: { mapId, layerId, toOrder } } as never);
	};

	function addLayer() {
		const group = categoryForTool(editor.tool);
		// `run` is SINGLE-FLIGHT: false while another command is in flight, and false again when the
		// core refuses. Announcing on the next line said "Layer added." when nothing had been added.
		// `EditorCanvas.addFeatures` is the in-repo shape for this.
		void run({
			type: 'map.create-layer',
			actorId,
			payload: {
				mapId,
				id: nextId('layer'),
				name: `Layer ${layers.length + 1}`,
				category: group,
				visibility: 'dm-only',
			},
		} as never).then((accepted) => {
			if (accepted) announce('Layer added.');
		});
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<span style={eb}>Layers · {layers.length}</span>
				<span style={{ flex: 1 }} />
				{isDm && (
					<Button
						variant="secondary"
						size="sm"
						icon="add"
						onClick={addLayer}
						disabled={editor.busy}
					>
						Add layer
					</Button>
				)}
			</div>

			<Input
				value={filter}
				icon="search"
				placeholder="Filter by name or tag"
				aria-label="Filter layers"
				onChange={(e: { target: { value: string } }) => setFilter(e.target.value)}
			/>
			{allTags.length > 0 && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
					{allTags.map((tag) => {
						const on = filter.trim().toLowerCase() === tag.toLowerCase();
						return (
							<button
								key={tag}
								type="button"
								onClick={() => setFilter(on ? '' : tag)}
								style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
							>
								<Chip tone={on ? 'accent' : 'neutral'} selected={on}>
									{tag}
								</Chip>
							</button>
						);
					})}
				</div>
			)}

			<div
				role="list"
				aria-label="Map layers"
				style={{ display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto', flex: 1 }}
			>
				{shown.map((l) => {
					const index = layers.findIndex((x) => x.layerId === l.layerId);
					return (
						<div
							key={l.layerId}
							draggable={isDm}
							onDragStart={() => setDragIndex(index)}
							onDragOver={(e) => e.preventDefault()}
							onDrop={() => {
								if (dragIndex !== null && dragIndex !== index)
									reorder(layers[dragIndex]!.layerId, index);
								setDragIndex(null);
							}}
							onClick={() => editor.setActiveLayerId(l.layerId)}
							// The active layer decides where every drawing tool paints, but selecting one was
							// mouse-ONLY: LayerRow is `role="listitem" tabIndex={0}` and its own onKeyDown
							// handles just Alt+Arrow reorder. Handle Enter/Space on the wrapper — NOT as a
							// LayerRow prop, whose `{...rest}` spread would clobber that Alt+Arrow handler.
							onKeyDown={(e) => {
								if (
									e.target !== e.currentTarget &&
									!(e.target as HTMLElement).matches('[role="listitem"]')
								)
									return;
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									editor.setActiveLayerId(l.layerId);
								}
							}}
							style={{
								position: 'relative',
								borderRadius: 8,
								background: activeId === l.layerId ? T.accSub : 'transparent',
							}}
						>
							<LayerRow
								layer={{
									name: l.name,
									type: CATEGORY_TO_BADGE[l.category] ?? 'custom',
									opacity: Math.round(l.opacity * 100),
									dmDisplay: l.enabled,
									visibility: VIS_CORE_TO_DS[l.visibility] ?? 'dm-only',
									locked: l.locked,
								}}
								readOnly={!isDm}
								selected={activeId === l.layerId}
								onRename={(name: string) =>
									void run({
										type: 'map.rename-layer',
										actorId,
										payload: { mapId, layerId: l.layerId, name },
									} as never)
								}
								onToggleDisplay={() =>
									void run({
										type: 'map.set-layer-enabled',
										actorId,
										payload: { mapId, layerId: l.layerId, enabled: !l.enabled },
									} as never)
								}
								onCycleVisibility={(next: string) =>
									void run({
										type: 'map.set-layer-visibility',
										actorId,
										payload: {
											mapId,
											layerId: l.layerId,
											visibility: (VIS_DS_TO_CORE[next] ?? 'dm-only') as SceneVisibility,
										},
									} as never)
								}
								onOpacityChange={(v: number) =>
									void run({
										type: 'map.set-layer-opacity',
										actorId,
										payload: { mapId, layerId: l.layerId, opacity: v / 100 },
									} as never)
								}
								onToggleLock={() =>
									void run({
										type: 'map.lock-layer',
										actorId,
										payload: { mapId, layerId: l.layerId, locked: !l.locked },
									} as never)
								}
								onMove={(dir: number) => reorder(l.layerId, index + dir)}
								onAction={() => setMenuFor(menuFor === l.layerId ? null : l.layerId)}
								actionRef={menuFor === l.layerId ? menuTriggerRef : undefined}
								actionExpanded={menuFor === l.layerId}
							/>
							{menuFor === l.layerId && (
								<Popover
									open
									onClose={() => setMenuFor(null)}
									triggerRef={menuTriggerRef}
									// Named without a visible header: an unnamed role="dialog" is an axe
									// `aria-dialog-name` violation, and this menu is reached from a row
									// whose identity is the only thing that makes its actions meaningful.
									aria-label={`Layer actions — ${l.name}`}
									width={200}
									placement="bottom"
									style={{
										position: 'absolute',
										right: 4,
										top: 'calc(100% + 2px)',
										transform: 'none',
										zIndex: 20,
									}}
								>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
										<MenuItem
											icon="chevron-up"
											label="Move up"
											disabled={index === 0}
											onClick={() => {
												reorder(l.layerId, index - 1);
												setMenuFor(null);
											}}
										/>
										<MenuItem
											icon="chevron-down"
											label="Move down"
											disabled={index === layers.length - 1}
											onClick={() => {
												reorder(l.layerId, index + 1);
												setMenuFor(null);
											}}
										/>
										<MenuItem
											icon="duplicate"
											label="Duplicate"
											onClick={() => {
												void run({
													type: 'map.duplicate-layer',
													actorId,
													payload: { mapId, layerId: l.layerId, id: nextId('layer') },
												} as never);
												setMenuFor(null);
											}}
										/>
										<MenuItem
											icon="tag"
											label="Edit tags"
											onClick={() => {
												setTagsFor(l);
												setMenuFor(null);
											}}
										/>
										<MenuItem
											icon="delete"
											label="Delete"
											danger
											onClick={() => {
												setConfirmDelete(l);
												setMenuFor(null);
											}}
										/>
									</div>
								</Popover>
							)}
						</div>
					);
				})}
				{shown.length === 0 && (
					<EmptyState
						inset
						icon="layers"
						title={
							layers.length === 0
								? isDm
									? 'No layers yet'
									: 'No layers are visible to you'
								: 'No layers match the filter'
						}
						description={
							isDm && layers.length === 0
								? 'Add one above, or generate a map with the Generate tool.'
								: undefined
						}
					/>
				)}
			</div>

			<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
				The <strong style={{ color: T.sub }}>active</strong> layer (click to set) receives new
				content. Drag a row or press Alt+↑/↓ to reorder.
			</div>

			{tagsFor && <TagsDialog editor={editor} layer={tagsFor} onClose={() => setTagsFor(null)} />}

			{confirmDelete && (
				<Dialog
					open
					onClose={() => setConfirmDelete(null)}
					title={`Delete layer “${confirmDelete.name}”?`}
					description="The layer and its content are removed. You can undo this."
					tone="danger"
					icon="delete"
					size="sm"
					footer={
						<>
							<Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
								Cancel
							</Button>
							<Button
								variant="danger"
								size="sm"
								icon="delete"
								onClick={() => {
									// Same single-flight trap as `addLayer`, plus: closing the dialog
									// unconditionally meant a REFUSED delete looked exactly like a
									// successful one — the confirm vanished and the live region said
									// the layer was gone while it was still in the list.
									const name = confirmDelete.name;
									void run({
										type: 'map.delete-layer',
										actorId,
										payload: { mapId, layerId: confirmDelete.layerId },
									} as never).then((accepted) => {
										if (!accepted) return;
										announce(`Layer “${name}” deleted.`);
										setConfirmDelete(null);
									});
								}}
							>
								Delete
							</Button>
						</>
					}
				/>
			)}
		</div>
	);
}

function MenuItem({
	icon,
	label,
	onClick,
	disabled,
	danger,
}: {
	icon: string;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
}) {
	// There is no global `button:hover` rule anywhere in this app and an inline style cannot express
	// `:hover`, so this menu had ZERO pointer feedback: the row under the cursor looked exactly like
	// the other four. A menu you cannot see yourself pointing at is genuinely hard to operate.
	// `ds/components/map/LayerRow.jsx` is the in-repo pattern.
	const [hov, setHov] = useState(false);
	const highlight = hov && !disabled;
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			onFocus={() => setHov(true)}
			onBlur={() => setHov(false)}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 9,
				padding: '8px 10px',
				borderRadius: 7,
				border: 'none',
				background: highlight
					? danger
						? 'var(--color-status-error-subtle)'
						: T.hover
					: 'transparent',
				cursor: disabled ? 'not-allowed' : 'pointer',
				opacity: disabled ? 0.4 : 1,
				color: danger ? T.err : T.ink,
				font: `12.5px ${T.sans}`,
				textAlign: 'left',
			}}
		>
			<Icon name={icon} size={14} color={danger ? T.err : T.ter} />
			{label}
		</button>
	);
}

function TagsDialog({
	editor,
	layer,
	onClose,
}: {
	editor: MapEditorApi;
	layer: MapLayerQueryEntry;
	onClose: () => void;
}) {
	const [draft, setDraft] = useState(layer.tags.join(', '));
	return (
		<Dialog
			open
			onClose={onClose}
			title={`Tags — ${layer.name}`}
			icon="tag"
			size="sm"
			footer={
				<>
					<Button variant="ghost" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="check"
						onClick={() => {
							const tags = draft
								.split(',')
								.map((t) => t.trim())
								.filter(Boolean);
							void editor.run({
								type: 'map.set-layer-tags',
								actorId: editor.actorId,
								payload: { mapId: editor.mapId, layerId: layer.layerId, tags, query: layer.query },
							} as never);
							onClose();
						}}
					>
						Save
					</Button>
				</>
			}
		>
			<Input
				value={draft}
				aria-label="Comma-separated tags"
				placeholder="e.g. combat, ruins, flooded"
				onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
			/>
			<div style={{ marginTop: 8, font: `11.5px ${T.sans}`, color: T.ter }}>
				Comma-separated. Tags drive the filter bar and layer queries.
			</div>
		</Dialog>
	);
}
