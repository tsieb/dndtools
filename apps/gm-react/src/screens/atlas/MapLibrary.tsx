import { useEffect, useMemo, useRef, useState } from 'react';
import { getMapViewForActor, queryMapLayers, type MapListEntry } from '@dndtools/core';
import { Button, EmptyState } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useI18n } from '../../i18n';
import { MapThumbnailClient, type ThumbnailModel } from '../../app/map/thumbnail';
import './map-library.css';

function Thumbnail({ model, client }: { model: ThumbnailModel; client: MapThumbnailClient }) {
	const [result, setResult] = useState<{ model: ThumbnailModel; uri: string } | null>(null);
	useEffect(() => {
		let live = true;
		void client
			.generate(model)
			.then(({ uri }) => {
				if (live) setResult({ model, uri });
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, [client, model]);
	return result?.model === model ? (
		<img className="map-library-thumbnail" src={result.uri} alt="" />
	) : (
		<span className="map-library-thumbnail" aria-hidden="true" />
	);
}

export function MapLibrary({
	maps,
	selectedId,
	delivered,
	onSelect,
}: {
	maps: MapListEntry[];
	selectedId: string | null;
	delivered: Set<string>;
	onSelect: (id: string) => void;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const [query, setQuery] = useState('');
	const [focused, setFocused] = useState<string | null>(null);
	const [colors, setColors] = useState<Record<string, string>>({});
	const [client] = useState(() => new MapThumbnailClient());
	const grid = useRef<HTMLDivElement>(null);
	useEffect(() => () => client.dispose(), [client]);
	useEffect(() => {
		const read = () => {
			const style = getComputedStyle(document.documentElement);
			const next: Record<string, string> = {};
			// Standalone data URIs cannot inherit CSS custom properties from the page.
			for (let i = 0; i < style.length; i++) {
				const key = style.item(i);
				if (key.startsWith('--layer-') || key.startsWith('--map-') || key.startsWith('--color-'))
					next[key] = style.getPropertyValue(key).trim();
			}
			setColors(next);
		};
		read();
		const observer = new MutationObserver(read);
		observer.observe(document.documentElement, { attributes: true });
		return () => observer.disconnect();
	}, []);
	const entries = useMemo(
		() =>
			maps.flatMap((map) => {
				const view = getMapViewForActor(
					runtime.state.maps,
					runtime.state.permissions,
					runtime.defaultActorId,
					map.id,
					{ deliveredMapIds: delivered },
				);
				if (view.kind !== 'available') return [];
				const layers = queryMapLayers(
					runtime.state.maps,
					runtime.state.permissions,
					runtime.defaultActorId,
					{ mapId: map.id },
					{ deliveredMapIds: delivered },
				).layers;
				const region =
					runtime.state.maps.maps[map.id]?.regions.find((r) => r.id === map.defaultRegionId)
						?.name ?? t('atlas.library.noRegion');
				return [{ map, region, model: { view, layers, colors } }];
			}),
		[
			maps,
			runtime.state.maps,
			runtime.state.permissions,
			runtime.defaultActorId,
			delivered,
			colors,
			t,
		],
	);
	const filtered = entries.filter(({ map, region }) =>
		`${map.name} ${region}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
	);
	const tabId = filtered.some(({ map }) => map.id === focused) ? focused : filtered[0]?.map.id;
	return (
		<section className="map-library" aria-label={t('atlas.library.title')}>
			<label className="map-library-search">
				{t('atlas.library.search')}
				<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
			</label>
			<p className="map-library-help">{t('atlas.library.help')}</p>
			{!runtime.loaded ? (
				<p role="status">{t('atlas.library.loading')}</p>
			) : filtered.length === 0 ? (
				<EmptyState
					illustration="map-library"
					title={t(entries.length ? 'atlas.library.noMatches' : 'atlas.library.empty')}
					description={t(entries.length ? 'atlas.library.filterHint' : 'atlas.library.emptyHint')}
					action={
						entries.length ? (
							<Button onClick={() => setQuery('')}>{t('atlas.library.clear')}</Button>
						) : undefined
					}
				/>
			) : (
				<div
					ref={grid}
					className="map-library-grid"
					role="group"
					aria-label={t('atlas.library.title')}
					onKeyDown={(event) => {
						const buttons = Array.from(
							grid.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
						);
						const index = buttons.indexOf(event.target as HTMLButtonElement);
						if (index < 0) return;
						const columns =
							buttons.filter((button) => button.offsetTop === buttons[0]?.offsetTop).length || 1;
						const moves: Record<string, number> = {
							ArrowRight: index + 1,
							ArrowLeft: index - 1,
							ArrowDown: index + columns,
							ArrowUp: index - columns,
							Home: 0,
							End: buttons.length - 1,
						};
						if (event.key in moves) {
							event.preventDefault();
							buttons[Math.max(0, Math.min(buttons.length - 1, moves[event.key]!))]?.focus();
						}
					}}
				>
					{filtered.map(({ map, region, model }) => (
						<button
							key={map.id}
							type="button"
							className="map-library-card"
							tabIndex={tabId === map.id ? 0 : -1}
							aria-current={selectedId === map.id ? 'true' : undefined}
							onFocus={() => setFocused(map.id)}
							onClick={() => onSelect(map.id)}
						>
							<Thumbnail model={model} client={client} />
							<span className="map-library-name">{map.name}</span>
							<span>{region}</span>
							<span className="map-library-chips">
								<span>{t('atlas.library.pois', { count: model.view.pois.length })}</span>
								<span>
									{t(model.layers.length === 1 ? 'atlas.library.layer' : 'atlas.library.layers', {
										count: model.layers.length,
									})}
								</span>
								{runtime.state.session.partyLocation?.mapId === map.id && (
									<span>{t('atlas.library.party')}</span>
								)}
								{delivered.has(map.id) && (
									<span>
										{t(
											runtime.state.permissions.actors[runtime.defaultActorId]?.role === 'dm'
												? 'atlas.library.live'
												: 'atlas.library.onScreen',
										)}
									</span>
								)}
							</span>
						</button>
					))}
				</div>
			)}
		</section>
	);
}
