import { useMemo, useState } from 'react';
import { Icon, Input } from '../../../ds';
import { T, eb } from '../../screen-kit';
import type { MapEditorApi } from '../useMapEditor';
import { STAMP_ASSETS, STAMP_TAGS, type StampAsset } from '../mapVocab';

/**
 * MAP-021 — the Assets browser for the Stamp & Scatter tools. Scoped by default (opens on the active
 * tool's likely set, never "All"), searchable by name+tags, filterable by a tag rail, with Recents +
 * Favorites. Each thumbnail can be BOTH dragged onto the canvas AND clicked to arm-then-place — the
 * click path is the WCAG 2.5.7 non-drag alternative. Selecting an asset sets `editor.options.stampAsset`
 * and arms the Stamp tool.
 */
export function AssetsPanel({ editor }: { editor: MapEditorApi }) {
	const [search, setSearch] = useState('');
	const [activeTags, setActiveTags] = useState<string[]>([]);
	const [recent, setRecent] = useState<string[]>([]);
	const [favorites, setFavorites] = useState<string[]>([]);

	const current = editor.options.stampAsset;

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return STAMP_ASSETS.filter((a) => {
			if (q && !a.label.toLowerCase().includes(q) && !a.tags.some((t) => t.includes(q)))
				return false;
			if (activeTags.length > 0 && !activeTags.every((t) => a.tags.includes(t))) return false;
			return true;
		});
	}, [search, activeTags]);

	const arm = (asset: StampAsset) => {
		editor.setOption('stampAsset', asset.id);
		if (editor.tool !== 'stamp' && editor.tool !== 'scatter') editor.setTool('stamp');
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
			<Input
				value={search}
				icon="search"
				autoFocus
				placeholder="Search objects"
				aria-label="Search assets"
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
						const on = activeTags.includes(tag);
						return (
							<button
								key={tag}
								type="button"
								aria-pressed={on}
								onClick={() =>
									setActiveTags((prev) => (on ? prev.filter((t) => t !== tag) : [...prev, tag]))
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
								{tag}
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
							title="Favorites"
							assets={favAssets}
							current={current}
							favorites={favorites}
							onArm={arm}
							onFav={toggleFav}
						/>
					)}
					{recentAssets.length > 0 && (
						<AssetGrid
							title="Recents"
							assets={recentAssets}
							current={current}
							favorites={favorites}
							onArm={arm}
							onFav={toggleFav}
						/>
					)}
					<AssetGrid
						title="All objects"
						assets={filtered}
						current={current}
						favorites={favorites}
						onArm={arm}
						onFav={toggleFav}
					/>
				</div>
			</div>
			<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
				Click an object to arm the Stamp tool, then click the map to place. Drag also works.
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
						<div
							key={a.id}
							draggable
							onDragStart={(e) => e.dataTransfer.setData('text/plain', a.id)}
							style={{ position: 'relative' }}
						>
							<button
								type="button"
								aria-pressed={on}
								title={a.label}
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
									{a.label}
								</span>
							</button>
							<button
								type="button"
								aria-label={fav ? `Unfavorite ${a.label}` : `Favorite ${a.label}`}
								aria-pressed={fav}
								onClick={() => onFav(a.id)}
								style={{
									position: 'absolute',
									top: 2,
									right: 2,
									border: 'none',
									background: 'transparent',
									cursor: 'pointer',
									padding: 2,
									color: fav ? T.acc : T.ter,
								}}
							>
								<Icon name="flag" size={12} />
							</button>
						</div>
					);
				})}
				{assets.length === 0 && (
					<span style={{ font: `12px ${T.sans}`, color: T.ter }}>No matches.</span>
				)}
			</div>
		</div>
	);
}
