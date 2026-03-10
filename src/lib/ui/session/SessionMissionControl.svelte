<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { nanoid } from 'nanoid';
	import { resolveHandoutRenderView } from '$lib/domain/handouts.js';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';
	import { handoutsState } from '$lib/state/handouts.svelte.js';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { objectsState } from '$lib/state/objects.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { createNoteId, type Note } from '$lib/types/note.js';
	import type { ImageObject } from '$lib/types/object.js';
	import type { SessionBoard, SessionBoardHandoutSourceKind } from '$lib/types/session-board.js';
	import { nowISO } from '$lib/utils/date.js';
	import Dialog from '$lib/ui/common/Dialog.svelte';
	import SessionEndWorkflowDialog from '$lib/ui/session/SessionEndWorkflowDialog.svelte';

	interface Props {
		board: SessionBoard;
		active: boolean;
		onrequestedit?: () => void;
	}

	interface PickerCandidate {
		id: string;
		sourceKind: SessionBoardHandoutSourceKind;
		title: string;
		subtitle: string;
		previewContent: string;
		handoutId?: string;
	}

	let { board, active, onrequestedit }: Props = $props();

	let showHandoutPicker = $state(false);
	let showHandoutPreview = $state(false);
	let showEndSessionFlow = $state(false);
	let handoutQuery = $state('');
	let selectedCandidate = $state<PickerCandidate | null>(null);
	let delivering = $state(false);
	let sceneDraftTitle = $state('');
	let sceneDraftDescription = $state('');
	let sceneDraftDescriptionNoteId = $state('');
	let sceneDraftImagePath = $state('');
	let sceneDraftWeather = $state('');
	let sceneDraftTimeOfDay = $state('');
	let sceneDraftEntityIds = $state<string[]>([]);
	let sceneDraftReferenceIds = $state<string[]>([]);
	let sceneDraftThreadIds = $state<string[]>([]);
	let newSceneTitle = $state('');
	let lastSceneId = $state<string | null>(null);
	let now = $state(Date.now());
	let activeSceneDescriptionHtml = $state('');
	let referencePreviewHtmlByNoteId = $state<Record<string, string>>({});

	const allNotes = $derived(
		[...notesState.activeNotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
	);
	const noteById = $derived(notesState.activeNoteById);
	const boardScenes = $derived(board.scenes ?? []);
	const activeScene = $derived.by(
		() => boardScenes.find((scene) => scene.id === board.activeSceneId) ?? boardScenes[0] ?? null,
	);
	const sceneDescriptionSourceNote = $derived.by(() => {
		const scene = activeScene;
		if (!scene?.descriptionNoteId) return null;
		return noteById.get(scene.descriptionNoteId) ?? null;
	});
	const sceneImagePath = $derived.by(() => {
		const explicitPath = activeScene?.imagePath?.trim();
		if (explicitPath) return explicitPath;
		const descriptionSource = activeScene?.description || sceneDescriptionSourceNote?.content || '';
		const imageMatch = descriptionSource.match(/!\[[^\]]*]\(([^)]+)\)/);
		return imageMatch?.[1]?.trim() || '';
	});
	const activeSceneDescriptionSource = $derived.by(() => {
		const inline = activeScene?.description?.trim() || '';
		if (inline) return inline;
		return sceneDescriptionSourceNote?.content ?? '';
	});
	const referenceNoteIds = $derived.by(() => {
		const sceneIds = activeScene?.referenceNoteIds ?? [];
		if (sceneIds.length > 0) return sceneIds;
		return board.tiles
			.filter((tile): tile is (typeof board.tiles)[number] & { noteId: string } => !!tile.noteId)
			.slice(0, 8)
			.map((tile) => tile.noteId);
	});
	const referenceNotes = $derived.by(() =>
		referenceNoteIds.map((id) => noteById.get(id)).filter((note): note is Note => !!note),
	);
	const entityNoteIds = $derived.by(() => {
		const sceneIds = activeScene?.entityNoteIds ?? [];
		if (sceneIds.length > 0) return sceneIds;
		return (board.sessionContext?.items ?? [])
			.filter((item) => item.category === 'npc' || item.category === 'location')
			.slice(0, 10)
			.map((item) => item.noteId);
	});
	const entityNotes = $derived.by(() =>
		entityNoteIds.map((id) => noteById.get(id)).filter((note): note is Note => !!note),
	);
	const threadNoteIds = $derived.by(() => {
		const sceneIds = activeScene?.threadNoteIds ?? [];
		if (sceneIds.length > 0) return sceneIds;
		return (board.sessionContext?.items ?? [])
			.filter((item) => item.category === 'quest')
			.slice(0, 8)
			.map((item) => item.noteId);
	});
	const threadNotes = $derived.by(() =>
		threadNoteIds.map((id) => noteById.get(id)).filter((note): note is Note => !!note),
	);
	const sessionElapsedText = $derived.by(() => {
		if (!active) return '00:00';
		const startedAt = sessionModeState.activeSession?.startedAt;
		if (!startedAt) return '00:00';
		const startedMs = Date.parse(startedAt);
		if (!Number.isFinite(startedMs)) return '00:00';
		const totalSeconds = Math.floor(Math.max(0, now - startedMs) / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) {
			return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
		}
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	});
	const worldClockText = $derived.by(() =>
		new Date(now).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
		}),
	);
	const handoutHistory = $derived(board.handoutHistory ?? []);

	const noteHandoutCandidates = $derived.by(() =>
		allNotes
			.filter((note) =>
				note.tags.some((tag) => {
					const normalized = tag.trim().toLowerCase();
					return normalized === 'handout' || normalized === 'player-facing';
				}),
			)
			.slice(0, 60)
			.map<PickerCandidate>((note) => ({
				id: `note:${note.id}`,
				sourceKind: 'note',
				title: note.title,
				subtitle: 'Tagged note',
				previewContent: note.content,
			})),
	);

	const handoutObjectCandidates = $derived.by(() =>
		handoutsState.sortedHandouts.slice(0, 80).map<PickerCandidate>((handout) => {
			const view = resolveHandoutRenderView(handout);
			return {
				id: `handout:${handout.id}`,
				sourceKind: 'handout',
				title: handout.data.title || handout.name,
				subtitle: 'Handout library',
				previewContent: view.content,
				handoutId: String(handout.id),
			};
		}),
	);

	const imageCandidates = $derived.by(() =>
		objectsState.objects
			.filter((entry): entry is ImageObject => entry.type === 'image')
			.slice(0, 80)
			.map<PickerCandidate>((image) => ({
				id: `image:${image.id}`,
				sourceKind: 'image',
				title: image.name,
				subtitle: 'Vault image',
				previewContent: `![${image.data.alt || image.name}](${image.data.url})`,
			})),
	);

	const mapRegionCandidates = $derived.by(() => {
		const candidates: PickerCandidate[] = [];
		for (const map of mapsState.maps) {
			for (const poi of map.data.pois ?? []) {
				candidates.push({
					id: `map-region:${map.id}:${poi.id}`,
					sourceKind: 'map_region',
					title: `${poi.label} (${map.name})`,
					subtitle: 'Map region',
					previewContent: `### ${poi.label}\n\nMap: ${map.name}\nCategory: ${poi.category}\nCoordinates: ${Math.round(poi.x * 100)}%, ${Math.round(poi.y * 100)}%`,
				});
				if (candidates.length >= 80) return candidates;
			}
		}
		return candidates;
	});

	const pickerCandidates = $derived.by(() => {
		const normalized = handoutQuery.trim().toLowerCase();
		const candidates = [
			...handoutObjectCandidates,
			...noteHandoutCandidates,
			...imageCandidates,
			...mapRegionCandidates,
		];
		if (!normalized) return candidates;
		return candidates.filter((candidate) =>
			`${candidate.title} ${candidate.subtitle} ${candidate.previewContent}`
				.toLowerCase()
				.includes(normalized),
		);
	});

	function markdownExcerpt(content: string, lineCount = 4): string {
		return content.replace(/\r\n/g, '\n').split('\n').slice(0, lineCount).join('\n').trim();
	}

	async function switchScene(sceneId: string): Promise<void> {
		await sessionBoardsState.setActiveScene(board.id, sceneId);
		if (active) {
			await sessionModeState.setSceneId(sceneId);
		}
	}

	async function advanceScene(): Promise<void> {
		const next = await sessionBoardsState.advanceScene(board.id);
		if (!next) return;
		if (active) {
			await sessionModeState.setSceneId(next.id);
		}
	}

	async function saveSceneDraft(): Promise<void> {
		if (!activeScene) return;
		const normalizeIds = (values: string[]) =>
			values
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0)
				.map((entry) => createNoteId(entry));
		await sessionBoardsState.updateScene(board.id, activeScene.id, {
			title: sceneDraftTitle,
			description: sceneDraftDescription,
			descriptionNoteId: sceneDraftDescriptionNoteId
				? createNoteId(sceneDraftDescriptionNoteId)
				: undefined,
			imagePath: sceneDraftImagePath || undefined,
			entityNoteIds: normalizeIds(sceneDraftEntityIds),
			referenceNoteIds: normalizeIds(sceneDraftReferenceIds),
			threadNoteIds: normalizeIds(sceneDraftThreadIds),
			weather: sceneDraftWeather,
			timeOfDay: sceneDraftTimeOfDay,
		});
	}

	async function addScene(): Promise<void> {
		const scene = await sessionBoardsState.addScene(board.id, newSceneTitle || undefined);
		newSceneTitle = '';
		if (scene && active) {
			await sessionModeState.setSceneId(scene.id);
		}
	}

	async function removeActiveScene(): Promise<void> {
		if (!activeScene) return;
		await sessionBoardsState.removeScene(board.id, activeScene.id);
	}

	async function startSessionFromBoard(): Promise<void> {
		await sessionModeState.startSession({
			sessionBoardId: board.id,
			sceneId: board.activeSceneId ?? null,
		});
	}

	function openCandidatePreview(candidate: PickerCandidate): void {
		selectedCandidate = candidate;
		showHandoutPicker = false;
		showHandoutPreview = true;
	}

	async function deliverSelectedCandidate(): Promise<void> {
		if (!selectedCandidate) return;
		delivering = true;
		try {
			let handoutId = selectedCandidate.handoutId ?? '';
			let handoutTitle = selectedCandidate.title;
			if (!handoutId) {
				const handoutType =
					selectedCandidate.sourceKind === 'image'
						? 'image'
						: selectedCandidate.sourceKind === 'map_region'
							? 'map_fragment'
							: 'document';
				const created = await handoutsState.createHandout({
					name: selectedCandidate.title,
					tags: ['handout', 'player-facing'],
					visibility: 'shared',
					data: {
						title: selectedCandidate.title,
						content: selectedCandidate.previewContent,
						handoutType,
						delivered: false,
						revealAnimation: 'scroll_rollout',
					},
				});
				handoutId = String(created.id);
				handoutTitle = created.data.title || created.name;
			}
			const result = await handoutsState.deliverHandout(handoutId);
			if (!result) {
				toastState.error('Handout could not be delivered.');
				return;
			}
			await sessionBoardsState.recordHandoutDelivery(board.id, {
				id: nanoid(10),
				handoutId,
				title: handoutTitle,
				sourceKind: selectedCandidate.sourceKind,
				deliveredAt: result.deliveredAt || nowISO(),
			});
			showHandoutPreview = false;
			selectedCandidate = null;
			toastState.success('Handout delivered to Player Screen.');
		} catch (error) {
			toastState.error(`Failed to deliver handout: ${String(error)}`);
		} finally {
			delivering = false;
		}
	}

	function openNote(noteId: string): void {
		void goto(resolve(`/knowledge/notes/${noteId}`), { state: { label: 'Session reference' } });
	}

	$effect(() => {
		if (!active) return;
		const id = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(id);
	});

	$effect(() => {
		if (!showHandoutPicker && !showHandoutPreview) return;
		void handoutsState.ensureLoaded();
		if (mapsState.maps.length === 0 && !mapsState.loading) {
			void mapsState.loadAll();
		}
		if (objectsState.objects.length === 0 && !objectsState.loading) {
			void objectsState.loadAll();
		}
	});

	$effect(() => {
		const scene = activeScene;
		if (!scene || scene.id === lastSceneId) return;
		sceneDraftTitle = scene.title;
		sceneDraftDescription = scene.description;
		sceneDraftDescriptionNoteId = scene.descriptionNoteId ?? '';
		sceneDraftImagePath = scene.imagePath ?? '';
		sceneDraftWeather = scene.weather ?? '';
		sceneDraftTimeOfDay = scene.timeOfDay ?? '';
		sceneDraftEntityIds = [...scene.entityNoteIds];
		sceneDraftReferenceIds = [...scene.referenceNoteIds];
		sceneDraftThreadIds = [...scene.threadNoteIds];
		lastSceneId = scene.id;
	});

	$effect(() => {
		let stale = false;
		const source = activeSceneDescriptionSource;
		if (!source) {
			activeSceneDescriptionHtml = '<p>No scene description yet.</p>';
			return;
		}
		void renderMarkdown(source, {
			resolveLink: (title) => {
				const id = notesState.resolveTitle(title);
				return id
					? { href: `/knowledge/notes/${id}`, exists: true }
					: { href: `/knowledge/notes?create=${encodeURIComponent(title)}`, exists: false };
			},
		}).then((html) => {
			if (!stale) activeSceneDescriptionHtml = html;
		});
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		let stale = false;
		if (referenceNotes.length === 0) {
			referencePreviewHtmlByNoteId = {};
			return;
		}
		void Promise.all(
			referenceNotes.map(async (note) => {
				const html = await renderMarkdown(markdownExcerpt(note.content, 5), {
					resolveLink: (title) => {
						const id = notesState.resolveTitle(title);
						return id
							? { href: `/knowledge/notes/${id}`, exists: true }
							: { href: `/knowledge/notes?create=${encodeURIComponent(title)}`, exists: false };
					},
				});
				return [String(note.id), html] as const;
			}),
		).then((entries) => {
			if (stale) return;
			referencePreviewHtmlByNoteId = Object.fromEntries(entries);
		});
		return () => {
			stale = true;
		};
	});
</script>

<div class="h-full min-h-0 flex flex-col bg-surface">
	<div
		class={`border-b border-border px-4 py-3 ${active ? 'bg-accent-subtle/25' : 'bg-surface-alt/35'}`}
	>
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div>
				<p class={`font-semibold ${active ? 'text-lg text-ink' : 'text-base text-ink'}`}>
					Mission Control
				</p>
				<p class="text-xs text-ink-muted">
					{active
						? 'Live session mode: scene transitions and handouts are session-time actions.'
						: 'Prep mode: edit scenes, references, and status context before session start.'}
				</p>
			</div>
			<div class="flex items-center gap-2 text-xs">
				{#if active}
					<span
						class="rounded-full border border-accent/40 bg-accent-subtle px-2 py-0.5 text-accent"
					>
						Session {sessionElapsedText}
					</span>
				{:else}
					<button
						type="button"
						class="rounded border border-border px-2 py-1 hover:bg-surface-alt"
						onclick={onrequestedit}
					>
						Customize Tile Layout
					</button>
				{/if}
			</div>
		</div>
	</div>

	<div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
		<section class="rounded-xl border border-border bg-surface-elevated p-4">
			<div class="mb-3 flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-ink-faint">
					Active Scene Zone
				</h2>
				{#if activeScene}
					<span class="text-xs text-ink-muted"
						>Scene {boardScenes.findIndex((scene) => scene.id === activeScene.id) + 1}</span
					>
				{/if}
			</div>
			{#if activeScene}
				<div class="grid gap-3 lg:grid-cols-[2fr_1fr]">
					<div>
						<p class={`font-semibold ${active ? 'text-2xl' : 'text-xl'} text-ink`}>
							{activeScene.title}
						</p>
						{#if entityNotes.length > 0}
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#each entityNotes as note (note.id)}
									<button
										type="button"
										class="rounded-full border border-border px-2 py-0.5 text-xs text-ink hover:bg-surface-alt"
										onclick={() => openNote(String(note.id))}
									>
										{note.title}
									</button>
								{/each}
							</div>
						{/if}
						<div class="mt-3 rounded-lg border border-border/70 bg-surface p-3">
							<div class="markdown-content text-sm" role="document">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html activeSceneDescriptionHtml}
							</div>
						</div>
					</div>
					<div>
						{#if sceneImagePath}
							<img
								src={sceneImagePath}
								alt="Scene"
								class="h-48 w-full rounded-lg border border-border object-cover bg-surface-alt"
							/>
						{:else}
							<div
								class="h-48 w-full rounded-lg border border-dashed border-border bg-surface-alt/60 p-3 text-xs text-ink-muted flex items-center justify-center text-center"
							>
								No scene image selected
							</div>
						{/if}
					</div>
				</div>

				<div class="mt-3">
					<div class="overflow-x-auto pb-1">
						<div class="flex items-center gap-2">
							{#each boardScenes as scene (scene.id)}
								<button
									type="button"
									class={`whitespace-nowrap rounded-md border px-2.5 py-1 text-xs transition-colors ${
										scene.id === activeScene.id
											? 'border-accent/45 bg-accent-subtle text-accent'
											: 'border-border text-ink-muted hover:bg-surface-alt'
									}`}
									onclick={() => void switchScene(scene.id)}
								>
									{scene.title}
								</button>
							{/each}
						</div>
					</div>
					{#if !active}
						<div class="mt-2 flex flex-wrap items-center gap-2">
							<input
								type="text"
								bind:value={newSceneTitle}
								class="min-w-[220px] flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-ink"
								placeholder="New scene title"
							/>
							<button
								type="button"
								class="rounded border border-border px-2.5 py-1 text-xs hover:bg-surface-alt"
								onclick={() => void addScene()}
							>
								Add Scene
							</button>
							{#if boardScenes.length > 1}
								<button
									type="button"
									class="rounded border border-error/40 px-2.5 py-1 text-xs text-error hover:bg-error/5"
									onclick={() => void removeActiveScene()}
								>
									Remove Active Scene
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<p class="text-sm text-ink-muted">No scene configured yet.</p>
			{/if}
		</section>

		<div class="grid gap-4 xl:grid-cols-2">
			<section class="rounded-xl border border-border bg-surface-elevated p-4">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-ink-faint">Reference Zone</h2>
				{#if referenceNotes.length === 0}
					<p class="mt-2 text-sm text-ink-muted">No reference notes pinned for this scene.</p>
				{:else}
					<div class="mt-2 space-y-2">
						{#each referenceNotes as note (note.id)}
							<button
								type="button"
								class="w-full rounded-lg border border-border/70 bg-surface p-3 text-left hover:bg-surface-alt"
								onclick={() => openNote(String(note.id))}
							>
								<p class="text-sm font-semibold text-ink">{note.title}</p>
								<div class="markdown-content mt-1 line-clamp-6 text-xs text-ink-muted">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html referencePreviewHtmlByNoteId[String(note.id)] ?? '<p>(No preview)</p>'}
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</section>

			<section class="rounded-xl border border-border bg-surface-elevated p-4">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-ink-faint">Status Zone</h2>
				<div class="mt-2 grid gap-2 sm:grid-cols-2">
					<div class="rounded border border-border bg-surface p-2">
						<p class="text-2xs uppercase tracking-wide text-ink-faint">Session Timer</p>
						<p class="text-sm font-semibold text-ink">{active ? sessionElapsedText : 'Idle'}</p>
					</div>
					<div class="rounded border border-border bg-surface p-2">
						<p class="text-2xs uppercase tracking-wide text-ink-faint">World Clock</p>
						<p class="text-sm font-semibold text-ink">{activeScene?.timeOfDay || worldClockText}</p>
					</div>
				</div>
				<div class="mt-2 rounded border border-border bg-surface p-2">
					<p class="text-2xs uppercase tracking-wide text-ink-faint">Environment</p>
					<p class="text-sm text-ink">{activeScene?.weather || 'No weather notes'}</p>
				</div>
				<div class="mt-2 rounded border border-border bg-surface p-2">
					<p class="text-2xs uppercase tracking-wide text-ink-faint">Open Threads</p>
					{#if threadNotes.length === 0}
						<p class="text-xs text-ink-muted">No scene thread notes pinned.</p>
					{:else}
						<ul class="mt-1 space-y-1">
							{#each threadNotes as note (note.id)}
								<li>
									<button
										type="button"
										class="text-xs text-accent hover:text-accent-hover underline underline-offset-2"
										onclick={() => openNote(String(note.id))}
									>
										{note.title}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
				{#if handoutHistory.length > 0}
					<div class="mt-2 rounded border border-border bg-surface p-2">
						<p class="text-2xs uppercase tracking-wide text-ink-faint">Handout History</p>
						<ul class="mt-1 space-y-1">
							{#each handoutHistory.slice(0, 5) as entry (entry.id)}
								<li class="text-xs text-ink-muted">
									{entry.title} · {new Date(entry.deliveredAt).toLocaleTimeString([], {
										hour: '2-digit',
										minute: '2-digit',
									})}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</section>
		</div>

		{#if !active && activeScene}
			<section class="rounded-xl border border-border bg-surface-elevated p-4">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-ink-faint">
					Prep Scene Editor
				</h2>
				<div class="mt-2 grid gap-2 lg:grid-cols-2">
					<label class="text-xs text-ink-muted">
						Scene title
						<input
							type="text"
							bind:value={sceneDraftTitle}
							class="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
						/>
					</label>
					<label class="text-xs text-ink-muted">
						Description source note
						<select
							bind:value={sceneDraftDescriptionNoteId}
							class="mt-1 h-9 w-full rounded border border-border bg-surface px-2 text-sm text-ink"
						>
							<option value="">Inline description only</option>
							{#each allNotes.slice(0, 160) as note (note.id)}
								<option value={note.id}>{note.title}</option>
							{/each}
						</select>
					</label>
					<label class="text-xs text-ink-muted lg:col-span-2">
						Inline description
						<textarea
							bind:value={sceneDraftDescription}
							rows="4"
							class="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
						></textarea>
					</label>
					<label class="text-xs text-ink-muted">
						Image path (optional)
						<input
							type="text"
							bind:value={sceneDraftImagePath}
							placeholder="/path/or/url"
							class="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
						/>
					</label>
					<label class="text-xs text-ink-muted">
						Weather
						<input
							type="text"
							bind:value={sceneDraftWeather}
							class="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
						/>
					</label>
					<label class="text-xs text-ink-muted">
						Time of day
						<input
							type="text"
							bind:value={sceneDraftTimeOfDay}
							class="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
						/>
					</label>
					<label class="text-xs text-ink-muted">
						Entity chips
						<select
							multiple
							bind:value={sceneDraftEntityIds}
							class="mt-1 h-32 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-ink"
						>
							{#each allNotes.slice(0, 160) as note (note.id)}
								<option value={note.id}>{note.title}</option>
							{/each}
						</select>
					</label>
					<label class="text-xs text-ink-muted">
						Reference notes
						<select
							multiple
							bind:value={sceneDraftReferenceIds}
							class="mt-1 h-32 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-ink"
						>
							{#each allNotes.slice(0, 160) as note (note.id)}
								<option value={note.id}>{note.title}</option>
							{/each}
						</select>
					</label>
					<label class="text-xs text-ink-muted lg:col-span-2">
						Thread notes
						<select
							multiple
							bind:value={sceneDraftThreadIds}
							class="mt-1 h-28 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-ink"
						>
							{#each allNotes.slice(0, 160) as note (note.id)}
								<option value={note.id}>{note.title}</option>
							{/each}
						</select>
					</label>
				</div>
				<div class="mt-3 flex justify-end">
					<button
						type="button"
						class="rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
						onclick={() => void saveSceneDraft()}
					>
						Save Scene
					</button>
				</div>
			</section>
		{/if}
	</div>

	<footer class="border-t border-border bg-surface-alt/40 px-4 py-3">
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="rounded bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent-hover"
				onclick={() => (showHandoutPicker = true)}
			>
				Deliver Handout to Players
			</button>
			<button
				type="button"
				class="rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
				onclick={() => void advanceScene()}
				disabled={boardScenes.length < 2}
			>
				Scene Transition
			</button>
			{#if active}
				<button
					type="button"
					class="rounded border border-error/40 px-3 py-1.5 text-xs text-error hover:bg-error/5"
					onclick={() => (showEndSessionFlow = true)}
				>
					End Session
				</button>
			{:else}
				<button
					type="button"
					class="rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
					onclick={() => void startSessionFromBoard()}
				>
					Start Session
				</button>
			{/if}
		</div>
	</footer>
</div>

<Dialog
	open={showHandoutPicker}
	title="Handout Picker"
	maxWidth="xl"
	onclose={() => (showHandoutPicker = false)}
>
	<div class="space-y-3">
		<input
			type="text"
			bind:value={handoutQuery}
			placeholder="Search handout notes, images, map regions"
			class="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-ink"
		/>
		{#if pickerCandidates.length === 0}
			<p class="text-sm text-ink-muted">No deliverable handout sources found.</p>
		{:else}
			<div class="max-h-[50vh] space-y-1 overflow-y-auto">
				{#each pickerCandidates as candidate (candidate.id)}
					<button
						type="button"
						class="w-full rounded border border-border px-3 py-2 text-left hover:bg-surface-alt"
						onclick={() => openCandidatePreview(candidate)}
					>
						<p class="text-sm font-semibold text-ink">{candidate.title}</p>
						<p class="text-xs text-ink-faint">{candidate.subtitle}</p>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</Dialog>

<Dialog
	open={showHandoutPreview}
	title="Player Preview"
	maxWidth="lg"
	onclose={() => {
		if (delivering) return;
		showHandoutPreview = false;
		selectedCandidate = null;
	}}
>
	{#if selectedCandidate}
		<div class="space-y-3">
			<p class="text-xs text-ink-muted">
				This is the exact handout content that will appear in Player Screen inbox.
			</p>
			<div class="rounded border border-border bg-surface p-3">
				<p class="text-sm font-semibold text-ink">{selectedCandidate.title}</p>
				<p class="text-2xs uppercase tracking-wide text-ink-faint">{selectedCandidate.subtitle}</p>
				<pre
					class="mt-2 whitespace-pre-wrap text-xs text-ink">{selectedCandidate.previewContent}</pre>
			</div>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					class="rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
					onclick={() => {
						showHandoutPreview = false;
						showHandoutPicker = true;
					}}
					disabled={delivering}
				>
					Back
				</button>
				<button
					type="button"
					class="rounded bg-accent px-3 py-1.5 text-xs text-white hover:bg-accent-hover disabled:opacity-60"
					onclick={() => void deliverSelectedCandidate()}
					disabled={delivering}
				>
					{delivering ? 'Delivering...' : 'Confirm and Deliver'}
				</button>
			</div>
		</div>
	{/if}
</Dialog>

<SessionEndWorkflowDialog
	open={showEndSessionFlow}
	sessionboardid={board.id}
	onclose={() => (showEndSessionFlow = false)}
/>
