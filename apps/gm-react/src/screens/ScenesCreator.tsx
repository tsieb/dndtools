import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ScreenListEntry } from '@dndtools/core';
import { Button, Callout, EmptyState, Input, Select, Toaster } from '../ds';
import type { MessageKey } from '../i18n';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { useViewport } from '../app/useViewport';
import { Page, T } from '../app/screen-kit';
import { SCENE_CARDS_PATH } from '../app/nav';
import {
	filterScreens,
	screenPath,
	screenTags,
	SCREEN_SORTS,
	type ScreenSort,
} from './screen/screenModel';
import { NewScreenDialog } from './screen/NewScreenDialog';
import { ScreenCard } from './screen/ScreenCard';
import { useEnsureHomeScreen, useScreenActions, useScreens } from './screen/useScreens';

const SORT_LABEL = {
	pinned: 'screens.sort.pinned',
	name: 'screens.sort.name',
	updated: 'screens.sort.updated',
} as const;

/**
 * RC-CAN-8.7 — the library's two sections. A screen the players can see (shared or player-visible) is
 * a scene projected to the table; one only the GM sees is a working screen. Visibility is the line
 * because it is the one the GM draws: sharing a screen moves it to the second section, and nothing is
 * inferred from a screen's name, tags or template.
 */
function isPlayerScene(entry: ScreenListEntry): boolean {
	return entry.visibility !== 'dm-only';
}

/** The route state the palette's "New screen" and other create launchers hand the library. */
export interface ScreensIntent {
	createScreen?: boolean;
}

/**
 * ScenesCreator — the `/screens` page (RC-CAN-7.3; `/scenes` resolves here). A screen is a scene
 * (ADR-041), so the Screens library replaced the old `/scenes` create form and plain scene list.
 *
 * RC-CAN-8.7 — the shell's top bar already titles the page "Screens", so the library carries no
 * heading of its own: its headings are its two sections, the GM's screens first and the scenes
 * projected to the players after them (`isPlayerScene`). The atmosphere scene cards moved to their own
 * page (`/scene-cards`), linked from the player section, rather than sitting under the library as a
 * second, unrelated form.
 *
 * The library lists screens the way the other library sections list their items: a search, a sort
 * and a tag filter over cards that carry a thumbnail, the visibility named for what it is ("GM only",
 * "Shared", "Player visible" — replacing the old "Draft" and "Ready", which were only ever derived
 * from visibility), and a live marker. The GM creates from a template ("Blank" included), and pins,
 * renames, retags, duplicates and deletes (with undo) from each card.
 *
 * Every row comes from `listScreensForActor`, which applies the actor's scene visibility, and every
 * write is an existing core command (see `useScreenActions`) — the same `scene.create`,
 * `scene.update-metadata` and `scene.delete`/`scene.restore` the form used.
 */
export function ScenesCreator() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const viewport = useViewport();
	const navigate = useNavigate();
	const location = useLocation();
	const isDm = runtime.state.permissions.actors[runtime.defaultActorId]?.role === 'dm';
	const { entries, nameOf } = useScreens();
	const actions = useScreenActions();
	useEnsureHomeScreen();

	const [query, setQuery] = useState('');
	const [tag, setTag] = useState('');
	const [sort, setSort] = useState<ScreenSort>('pinned');
	const [creating, setCreating] = useState(false);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Create-intent handoff (the palette's "New screen"): arrive with the dialog open. Consumed once.
	useEffect(() => {
		const intent = (location.state ?? null) as ScreensIntent | null;
		if (intent?.createScreen) {
			setCreating(true);
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.state, location.pathname, navigate]);

	const tags = screenTags(entries);
	const shown = filterScreens(entries, { query, tag: tags.includes(tag) ? tag : '', sort }, nameOf);
	const filtered = query.trim() !== '' || tag !== '';
	const screens = shown.filter((entry) => !isPlayerScene(entry));
	const scenes = shown.filter(isPlayerScene);

	async function busy(entry: ScreenListEntry, work: () => Promise<string | null>) {
		setBusyId(entry.id);
		setError(null);
		try {
			setError(await work());
		} finally {
			setBusyId(null);
		}
	}

	const label = { font: `600 var(--text-xs) ${T.sans}`, color: T.sub };
	const field = {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: T.space.one,
		minWidth: 0,
	};

	const sectionHeading = {
		margin: T.space.zero,
		font: `700 var(--text-lg) ${T.sans}`,
		color: T.ink,
	};
	const note = { margin: T.space.zero, font: `var(--text-sm) ${T.sans}`, color: T.sub };

	function cardList(list: ScreenListEntry[], labelKey: MessageKey) {
		return (
			<ul
				aria-label={t(labelKey)}
				style={{
					margin: T.space.zero,
					padding: T.space.zero,
					display: 'grid',
					gridTemplateColumns:
						viewport === 'phone' ? 'minmax(0, 1fr)' : 'repeat(auto-fill, minmax(220px, 1fr))',
					gap: T.space.three,
				}}
			>
				{list.map((entry) => {
					const name = nameOf(entry);
					return (
						<ScreenCard
							key={entry.id}
							entry={entry}
							name={name}
							editable={isDm}
							renaming={renamingId === entry.id}
							busy={busyId === entry.id}
							actions={{
								onTogglePin: () =>
									void busy(entry, () => actions.setPinned(entry.id, !entry.pinned)),
								onToggleRename: () => setRenamingId((cur) => (cur === entry.id ? null : entry.id)),
								onDuplicate: () =>
									void busy(entry, async () => {
										const result = await actions.duplicate(entry.id, name);
										if ('error' in result) return result.error;
										Toaster.success(t('screens.duplicated', { name }));
										return null;
									}),
								onDelete: () => void busy(entry, () => actions.remove(entry.id, name)),
								onSaveMeta: async (meta) => {
									const rejection = await actions.rename(entry.id, meta);
									if (!rejection) setRenamingId(null);
									return rejection;
								},
							}}
						/>
					);
				})}
			</ul>
		);
	}

	const sectionHead = {
		display: 'flex',
		alignItems: 'center',
		flexWrap: 'wrap' as const,
		gap: T.space.three,
	};

	return (
		// Every routed list screen goes through `Page`, for its gutters and its clearance over the
		// phone tab bar.
		<Page max={1180}>
			<div
				data-testid="screens-library"
				style={{ display: 'flex', flexDirection: 'column', gap: T.space.six }}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'flex-end',
						flexWrap: 'wrap',
						gap: T.space.three,
					}}
				>
					{entries.length > 0 && (
						<div
							role="group"
							aria-label={t('screens.filters')}
							style={{
								display: 'flex',
								alignItems: 'flex-end',
								flexWrap: 'wrap',
								gap: T.space.three,
								flex: '1 1 480px',
								minWidth: 0,
							}}
						>
							<div style={{ ...field, flex: '1 1 220px' }}>
								<label htmlFor="screens-search" style={label}>
									{t('screens.search')}
								</label>
								<Input
									id="screens-search"
									type="search"
									value={query}
									onChange={(e: { target: { value: string } }) => setQuery(e.target.value)}
									placeholder={t('screens.searchPlaceholder')}
								/>
							</div>
							<div style={field}>
								<label htmlFor="screens-sort" style={label}>
									{t('screens.sort')}
								</label>
								<Select
									id="screens-sort"
									value={sort}
									onChange={(e: { target: { value: string } }) =>
										setSort(e.target.value as ScreenSort)
									}
									options={SCREEN_SORTS.map((value) => ({ value, label: t(SORT_LABEL[value]) }))}
								/>
							</div>
							{tags.length > 0 && (
								<div style={field}>
									<label htmlFor="screens-tag" style={label}>
										{t('screens.tag')}
									</label>
									<Select
										id="screens-tag"
										value={tag}
										onChange={(e: { target: { value: string } }) => setTag(e.target.value)}
										options={[
											{ value: '', label: t('screens.allTags') },
											...tags.map((value) => ({ value, label: value })),
										]}
									/>
								</div>
							)}
							<span role="status" style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
								{t('screens.resultCount', { shown: shown.length, total: entries.length })}
							</span>
						</div>
					)}
					{isDm && (
						<Button
							style={{ minHeight: 'var(--space-12)', marginInlineStart: 'auto' }}
							variant="primary"
							size="sm"
							icon="add"
							data-testid="screens-new"
							onClick={() => setCreating(true)}
						>
							{t('screens.new.open')}
						</Button>
					)}
				</div>

				{error && (
					<Callout tone="error" role="alert">
						{error}
					</Callout>
				)}

				{/* The GM's own screens lead. With nothing listed at all, this section carries the
				    library's empty state, so the page still has one heading above it. */}
				{(screens.length > 0 || shown.length === 0 || isDm) && (
					<section
						aria-labelledby="screens-section-screens"
						data-testid="screens-section-screens"
						style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}
					>
						<h2 id="screens-section-screens" style={sectionHeading}>
							{t('screens.section.screens')}
						</h2>
						{screens.length > 0 ? (
							cardList(screens, 'screens.section.screens')
						) : shown.length === 0 ? (
							<EmptyState
								icon="widget"
								illustration={filtered ? 'search-none' : 'scenes-empty'}
								title={t(filtered ? 'screens.noMatches' : 'screens.empty')}
								description={t(filtered ? 'screens.noMatchesHint' : 'screens.emptyHint')}
								action={
									filtered ? (
										<Button
											style={{ minHeight: 'var(--space-12)' }}
											variant="secondary"
											size="sm"
											icon="close"
											onClick={() => {
												setQuery('');
												setTag('');
											}}
										>
											{t('screens.clearFilters')}
										</Button>
									) : undefined
								}
							/>
						) : (
							<p style={note}>{t('screens.section.screensEmpty')}</p>
						)}
					</section>
				)}

				{/* Always there for the GM: it carries the way into the scene cards, which a filter that
				    matches no screen does not take away. */}
				{(scenes.length > 0 || isDm) && (
					<section
						aria-labelledby="screens-section-scenes"
						data-testid="screens-section-scenes"
						style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}
					>
						<div style={sectionHead}>
							<div style={{ flex: '1 1 240px', minWidth: 0 }}>
								<h2 id="screens-section-scenes" style={sectionHeading}>
									{t('screens.section.scenes')}
								</h2>
								<p style={note}>{t('screens.section.scenesHint')}</p>
							</div>
							{isDm && (
								<Button
									style={{ minHeight: 'var(--space-12)' }}
									variant="secondary"
									size="sm"
									icon="scene"
									data-testid="screens-scene-cards"
									onClick={() => navigate(SCENE_CARDS_PATH)}
								>
									{t('sceneCards.title')}
								</Button>
							)}
						</div>
						{scenes.length > 0 ? (
							cardList(scenes, 'screens.section.scenes')
						) : (
							<p style={note}>{t('screens.section.scenesEmpty')}</p>
						)}
					</section>
				)}

				<NewScreenDialog
					open={creating}
					onClose={() => setCreating(false)}
					viewport={viewport}
					onCreated={(id, warning) => {
						if (warning) Toaster.error(warning);
						navigate(screenPath(id));
					}}
				/>
			</div>
		</Page>
	);
}
