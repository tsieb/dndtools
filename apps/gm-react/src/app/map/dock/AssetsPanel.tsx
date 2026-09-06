import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
	getProp,
	PROP_CATALOG,
	PROP_CATEGORIES,
	searchProps,
	type PropCatalogEntry,
	type PropCategoryId,
} from '@dndtools/core';
import { Icon, Input } from '../../../ds';
import { T, eb } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';
import { PROP_CATEGORY_LABEL_KEYS, propLabel } from '../mapVocab';
import { useI18n } from '../../../i18n';

/**
 * RC-MAP-3.1 — the stamp/prop library for the Stamp tool. Categories down the side, search across
 * name/category/tags, Favorites and Recents on top; selecting an entry sets `options.stampAsset` and
 * arms Stamp, and the Rotation/Size controls in the tool-options bar apply to the next placement.
 *
 * Every tile draws the entry's own VECTOR GLYPH — the same path the canvas renders the placed prop
 * with — so the library is a picture of what you are about to stamp rather than a grid of the same
 * generic icon. These glyphs are catalogue content, not UI iconography: the Lucide vocabulary in
 * `docs/reference/ICON_VOCABULARY.md` still owns every control icon on this panel.
 *
 * Scatter is deliberately NOT driven from here: it has its own five-set vocabulary (`SCATTER_SETS`,
 * read through `options.scatterObject`) with its own SegmentedControl in the tool options bar.
 *
 * `recent`/`favorites` live in the PARENT because this panel is one of four dock tabs and unmounts
 * whenever you switch tabs — keeping them here wiped both lists on every visit to Layers or History.
 */
export function AssetsPanel({
	editor,
	recent,
	setRecent,
	favorites,
	setFavorites,
}: {
	editor: MapEditorApi;
	recent: string[];
	setRecent: Dispatch<SetStateAction<string[]>>;
	favorites: string[];
	setFavorites: Dispatch<SetStateAction<string[]>>;
}) {
	const { t } = useI18n();
	const [search, setSearch] = useState('');
	const [category, setCategory] = useState<PropCategoryId | null>(null);

	const current = editor.options.stampAsset;

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		// The core searches id/name/category/tags; the panel adds the RENDERED label, so a Spanish
		// reader searching "árbol" matches the tile they can actually see rather than the English key.
		const matched = q
			? new Set(searchProps(q).map((entry) => entry.id))
			: new Set(PROP_CATALOG.map((entry) => entry.id));
		return PROP_CATALOG.filter((entry) => {
			if (category && entry.category !== category) return false;
			if (!q) return true;
			return matched.has(entry.id) || propLabel(entry, t).toLowerCase().includes(q);
		});
	}, [search, category, t]);

	const arm = (entry: PropCatalogEntry) => {
		editor.setOption('stampAsset', entry.id);
		// Scatter used to be exempted from the arm here, but it reads `options.scatterObject`, never
		// `stampAsset` (EditorCanvas.tsx:418 vs :492) — so with Scatter armed, clicking a tile lit it
		// up as selected and then changed absolutely nothing on the canvas. Stamp is the only tool
		// this panel can configure, so arming an asset arms Stamp.
		if (editor.tool !== 'stamp') editor.setTool('stamp');
		setRecent((prev) => [entry.id, ...prev.filter((x) => x !== entry.id)].slice(0, 6));
	};

	const toggleFav = (id: string) =>
		setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

	const recentAssets = recent
		.map((id) => getProp(id))
		.filter((entry): entry is PropCatalogEntry => !!entry);
	const favAssets = favorites
		.map((id) => getProp(id))
		.filter((entry): entry is PropCatalogEntry => !!entry);

	const shelfTitle = category ? t(PROP_CATEGORY_LABEL_KEYS[category]) : t('mapDock.allObjects');

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
			{/* No `autoFocus`: the dock tabs use selection-follows-focus (ds/core/Tabs.jsx calls onChange
			    from moveFocus), so arrowing ONTO the Assets tab yanked focus straight into this text
			    field and a keyboard user could not arrow on to History. */}
			<Input
				value={search}
				icon="search"
				placeholder={t('mapDock.searchObjects')}
				aria-label={t('mapDock.searchAssets')}
				onChange={(e: { target: { value: string } }) => setSearch(e.target.value)}
			/>
			<div style={{ display: 'flex', gap: 10, minHeight: 0, flex: 1 }}>
				{/* category rail — one shelf at a time, because a prop belongs to exactly one shelf */}
				<div
					role="group"
					aria-label={t('mapDock.categories')}
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 3,
						flex: '0 0 auto',
						overflowY: 'auto',
					}}
				>
					{[null, ...PROP_CATEGORIES].map((id) => {
						const on = category === id;
						return (
							<button
								key={id ?? 'all'}
								type="button"
								aria-pressed={on}
								onClick={() => setCategory(id)}
								style={{
									padding: '5px 9px',
									borderRadius: 7,
									border: `1px solid ${on ? T.accBd : 'transparent'}`,
									background: on ? T.accSub : 'transparent',
									color: on ? T.acc : T.sub,
									cursor: 'pointer',
									font: `11.5px ${T.sans}`,
									textAlign: 'left',
									whiteSpace: 'nowrap',
								}}
							>
								{id ? t(PROP_CATEGORY_LABEL_KEYS[id]) : t('mapDock.allCategories')}
							</button>
						);
					})}
				</div>

				{/* grid + recents/favorites */}
				<div
					style={{
						flex: 1,
						minWidth: 0,
						overflowY: 'auto',
						display: 'flex',
						flexDirection: 'column',
						gap: 12,
					}}
				>
					{favAssets.length > 0 && (
						<AssetGrid
							title={t('mapDock.favorites')}
							assets={favAssets}
							current={current}
							favorites={favorites}
							onArm={arm}
							onFav={toggleFav}
						/>
					)}
					{recentAssets.length > 0 && (
						<AssetGrid
							title={t('mapDock.recents')}
							assets={recentAssets}
							current={current}
							favorites={favorites}
							onArm={arm}
							onFav={toggleFav}
						/>
					)}
					{/* Honest about what a door STAMP is: dressing. The Door tool authors the door that
					    opens, and a DM who stamps this one and then wonders why it will not open has been
					    misled by us, not by themselves. */}
					{category === 'doors' && (
						<p style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, margin: 0 }}>
							{t('mapDock.doorsNote')}
						</p>
					)}
					<AssetGrid
						title={shelfTitle}
						assets={filtered}
						current={current}
						favorites={favorites}
						onArm={arm}
						onFav={toggleFav}
					/>
				</div>
			</div>
			<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
				{/* "Drag also works." was removed with the `draggable` attribute below it: no canvas under
				    src/app/map has ever had an `onDrop`/`onDragOver` handler, so dragging a tile did
				    nothing. Click-to-arm is the real path — and the WCAG 2.5.7 dragging-free one. */}
				{t('mapDock.stampHint')}
			</div>
		</div>
	);
}

/**
 * A catalogue glyph at tile size. `viewBox` is the catalogue's own `-1..1` box with a hair of padding,
 * so a tile preview and the placed prop are the same drawing at two sizes.
 */
export function PropGlyph({ glyph, size, color }: { glyph: string; size: number; color: string }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="-1.15 -1.15 2.3 2.3"
			aria-hidden="true"
			focusable="false"
		>
			<path d={glyph} fill={color} fillRule="evenodd" />
		</svg>
	);
}

function AssetGrid({
	title,
	assets,
	current,
	favorites,
	onArm,
	onFav,
}: {
	title: string;
	assets: readonly PropCatalogEntry[];
	current: string;
	favorites: string[];
	onArm: (entry: PropCatalogEntry) => void;
	onFav: (id: string) => void;
}) {
	const { t } = useI18n();
	return (
		<div>
			<div style={{ ...eb, marginBottom: 6 }}>
				{title} · {assets.length}
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
					gap: 6,
				}}
			>
				{assets.map((a) => {
					const on = a.id === current;
					const fav = favorites.includes(a.id);
					const label = propLabel(a, t);
					return (
						<div key={a.id} style={{ position: 'relative' }}>
							<button
								type="button"
								aria-pressed={on}
								title={label}
								onClick={() => onArm(a)}
								style={{
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'center',
									gap: 4,
									width: '100%',
									padding: '10px 4px',
									borderRadius: 10,
									border: `1px solid ${on ? T.accBd : T.bd}`,
									background: on ? T.accSub : T.raised,
									color: on ? T.acc : T.ink,
									cursor: 'pointer',
									font: `11px ${T.sans}`,
								}}
							>
								<PropGlyph glyph={a.glyph} size={26} color={on ? T.acc : T.sub} />
								<span
									style={{
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										maxWidth: '100%',
									}}
								>
									{label}
								</span>
							</button>
							<button
								type="button"
								aria-label={
									fav
										? t('mapDock.unfavorite', { name: label })
										: t('mapDock.favorite', { name: label })
								}
								aria-pressed={fav}
								onClick={() => onFav(a.id)}
								// A ~16px target (under the 24px WCAG 2.5.8 minimum) sitting absolutely on top
								// of the tile's own arm button, so a near-miss on "arm this asset" toggled a
								// favourite instead. 24px square, and pinned to the very corner so it takes as
								// little of the arm button's face as the larger hit area allows.
								style={{
									position: 'absolute',
									top: 0,
									right: 0,
									border: 'none',
									background: 'transparent',
									cursor: 'pointer',
									padding: 2,
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									minWidth: 24,
									minHeight: 24,
									color: fav ? T.acc : T.ter,
								}}
							>
								<Icon name="flag" size={12} />
							</button>
						</div>
					);
				})}
				{assets.length === 0 && (
					<span style={{ font: `12px ${T.sans}`, color: T.ter }}>{t('mapDock.noMatches')}</span>
				)}
			</div>
		</div>
	);
}
