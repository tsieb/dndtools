import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Icon, Input } from '../../../ds';
import { T, eb } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';
import { STAMP_ASSETS, STAMP_TAGS, type StampAsset } from '../mapVocab';
import { useI18n } from '../../../i18n';

/**
 * MAP-021 — the Assets browser for the Stamp tool. Searchable by name+tags, filterable by a tag rail,
 * with Recents + Favorites. Selecting an asset sets `editor.options.stampAsset` and arms Stamp.
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
	const [activeTags, setActiveTags] = useState<string[]>([]);

	const current = editor.options.stampAsset;

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return STAMP_ASSETS.filter((a) => {
			// Search the RENDERED label, so a Spanish reader searching "árbol" matches the tile they
			// can actually see rather than the English key's source text.
			if (q && !t(a.label).toLowerCase().includes(q) && !a.tags.some((tag) => tag.includes(q)))
				return false;
			if (activeTags.length > 0 && !activeTags.every((t) => a.tags.includes(t))) return false;
			return true;
		});
	}, [search, activeTags, t]);

	const arm = (asset: StampAsset) => {
		editor.setOption('stampAsset', asset.id);
		// Scatter used to be exempted from the arm here, but it reads `options.scatterObject`, never
		// `stampAsset` (EditorCanvas.tsx:418 vs :492) — so with Scatter armed, clicking a tile lit it
		// up as selected and then changed absolutely nothing on the canvas. Stamp is the only tool
		// this panel can configure, so arming an asset arms Stamp.
		if (editor.tool !== 'stamp') editor.setTool('stamp');
		setRecent((prev) => [asset.id, ...prev.filter((x) => x !== asset.id)].slice(0, 6));
	};

	const toggleFav = (id: string) =>
		setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

	const recentAssets = recent
		.map((id) => STAMP_ASSETS.find((a) => a.id === id))
		.filter((a): a is StampAsset => !!a);
	const favAssets = favorites
		.map((id) => STAMP_ASSETS.find((a) => a.id === id))
		.filter((a): a is StampAsset => !!a);

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
				{/* tag rail */}
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 3,
						flex: '0 0 auto',
						overflowY: 'auto',
					}}
				>
					{STAMP_TAGS.map((tag) => {
						const on = activeTags.includes(tag.id);
						return (
							<button
								key={tag.id}
								type="button"
								aria-pressed={on}
								onClick={() =>
									setActiveTags((prev) =>
										on ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
									)
								}
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
								{t(tag.label)}
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
					<AssetGrid
						title={t('mapDock.allObjects')}
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

function AssetGrid({
	title,
	assets,
	current,
	favorites,
	onArm,
	onFav,
}: {
	title: string;
	assets: StampAsset[];
	current: string;
	favorites: string[];
	onArm: (a: StampAsset) => void;
	onFav: (id: string) => void;
}) {
	const { t } = useI18n();
	return (
		<div>
			<div style={{ ...eb, marginBottom: 6 }}>{title}</div>
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
					return (
						<div key={a.id} style={{ position: 'relative' }}>
							<button
								type="button"
								aria-pressed={on}
								title={t(a.label)}
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
								<Icon name={a.icon} size={22} color={on ? T.acc : T.sub} />
								<span
									style={{
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										maxWidth: '100%',
									}}
								>
									{t(a.label)}
								</span>
							</button>
							<button
								type="button"
								aria-label={
									fav
										? t('mapDock.unfavorite', { name: t(a.label) })
										: t('mapDock.favorite', { name: t(a.label) })
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
