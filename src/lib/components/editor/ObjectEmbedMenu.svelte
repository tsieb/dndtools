<script lang="ts">
	import type { EditorView } from '@codemirror/view';
	import type {
		CharacterObject,
		ImageObject,
		StatBlockObject,
		VaultObject,
		VaultObjectType,
	} from '$lib/types/object.js';
	import type { Note } from '$lib/types/note.js';
	import { getStorage } from '$lib/storage/index.js';
	import { generateVaultObjectId } from '$lib/utils/id.js';
	import { nowISO } from '$lib/utils/date.js';
	import {
		normalizeCharacterData,
		normalizeImageData,
		normalizeStatBlockData,
		summarizeVaultObject,
	} from '$lib/services/objects.js';
	import { formatNoteEmbed } from '$lib/services/object-embeds.js';

	interface Props {
		editorView: EditorView | null;
	}

	let { editorView }: Props = $props();

	let expanded = $state(false);
	let mode = $state<'create' | 'embed-objects' | 'embed-notes'>('create');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let objects = $state<VaultObject[]>([]);
	let notes = $state<Note[]>([]);
	let query = $state('');
	let filterType = $state<'all' | VaultObjectType>('all');
	let noteQuery = $state('');

	let createType = $state<VaultObjectType>('stat_block');
	let name = $state('');
	let summary = $state('');
	let tags = $state('');

	let statCreatureType = $state('');
	let statAlignment = $state('');
	let statArmorClass = $state('');
	let statHitPoints = $state('');
	let statSpeed = $state('');
	let statChallenge = $state('');

	let characterAncestry = $state('');
	let characterClassName = $state('');
	let characterLevel = $state('');
	let characterAlignment = $state('');
	let characterHitPoints = $state('');
	let characterArmorClass = $state('');

	let imageUrl = $state('');
	let imageAlt = $state('');
	let imageCaption = $state('');
	let imageCredit = $state('');

	const filteredObjects = $derived.by(() => {
		const lower = query.trim().toLowerCase();
		return objects
			.filter((object) => filterType === 'all' || object.type === filterType)
			.filter((object) => {
				if (!lower) return true;
				const haystack = `${object.name} ${object.summary} ${object.tags.join(' ')}`.toLowerCase();
				return haystack.includes(lower);
			})
			.slice(0, 24);
	});

	const filteredNotes = $derived.by(() => {
		const lower = noteQuery.trim().toLowerCase();
		return notes
			.filter((note) => !note.deleted)
			.filter((note) => {
				if (!lower) return true;
				const haystack = `${note.title} ${note.tags.join(' ')}`.toLowerCase();
				return haystack.includes(lower);
			})
			.slice(0, 30);
	});

	$effect(() => {
		if (!expanded) return;
		void loadObjects();
	});

	function parseTags(raw: string): string[] {
		return raw
			.split(',')
			.map((tag) => tag.trim().replace(/^#/, ''))
			.filter(Boolean);
	}

	function parseIntOrUndefined(value: string): number | undefined {
		const parsed = Number.parseInt(value.trim(), 10);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	async function loadObjects(): Promise<void> {
		loading = true;
		error = null;
		try {
			const storage = getStorage();
			const [objectEntries, noteEntries] = await Promise.all([
				storage.getAllObjects(),
				storage.getAllNotes(),
			]);
			objects = objectEntries;
			notes = noteEntries;
		} catch (err) {
			error = String(err);
		} finally {
			loading = false;
		}
	}

	function insertEmbed(object: VaultObject): void {
		if (!editorView) return;
		const embed = formatNoteEmbed({ id: object.id }, object.name, { view: 'card' });
		const selection = editorView.state.selection.main;
		const before = editorView.state.sliceDoc(Math.max(0, selection.from - 1), selection.from);
		const prefix = before && before !== '\n' ? '\n' : '';
		editorView.dispatch({
			changes: {
				from: selection.from,
				to: selection.to,
				insert: `${prefix}${embed}`,
			},
			selection: {
				anchor: selection.from + prefix.length + embed.length,
			},
			scrollIntoView: true,
		});
		editorView.focus();
	}

	function insertNoteEmbed(note: Note): void {
		if (!editorView) return;
		const embed = formatNoteEmbed({ id: note.id }, note.title, { view: 'card' });
		const selection = editorView.state.selection.main;
		const before = editorView.state.sliceDoc(Math.max(0, selection.from - 1), selection.from);
		const prefix = before && before !== '\n' ? '\n' : '';
		editorView.dispatch({
			changes: {
				from: selection.from,
				to: selection.to,
				insert: `${prefix}${embed}`,
			},
			selection: {
				anchor: selection.from + prefix.length + embed.length,
			},
			scrollIntoView: true,
		});
		editorView.focus();
	}

	function resetCreateForm(): void {
		name = '';
		summary = '';
		tags = '';
		statCreatureType = '';
		statAlignment = '';
		statArmorClass = '';
		statHitPoints = '';
		statSpeed = '';
		statChallenge = '';
		characterAncestry = '';
		characterClassName = '';
		characterLevel = '';
		characterAlignment = '';
		characterHitPoints = '';
		characterArmorClass = '';
		imageUrl = '';
		imageAlt = '';
		imageCaption = '';
		imageCredit = '';
	}

	async function createObject(): Promise<void> {
		if (!name.trim()) {
			error = 'Name is required.';
			return;
		}
		if (createType === 'image' && !imageUrl.trim()) {
			error = 'Image URL is required for image objects.';
			return;
		}

		error = null;
		loading = true;
		try {
			const storage = getStorage();
			const now = nowISO();
			let object: VaultObject;

			if (createType === 'stat_block') {
				const created: StatBlockObject = {
					id: generateVaultObjectId(),
					type: 'stat_block',
					name: name.trim(),
					summary: summary.trim(),
					tags: parseTags(tags),
					data: normalizeStatBlockData({
						creatureType: statCreatureType.trim(),
						alignment: statAlignment.trim(),
						armorClass: parseIntOrUndefined(statArmorClass),
						hitPoints: statHitPoints.trim(),
						speed: statSpeed.trim(),
						challengeRating: statChallenge.trim(),
					}),
					createdAt: now,
					updatedAt: now,
				};
				if (!created.summary) created.summary = summarizeVaultObject(created);
				object = created;
			} else if (createType === 'character') {
				const created: CharacterObject = {
					id: generateVaultObjectId(),
					type: 'character',
					name: name.trim(),
					summary: summary.trim(),
					tags: parseTags(tags),
					data: normalizeCharacterData({
						ancestry: characterAncestry.trim(),
						className: characterClassName.trim(),
						level: parseIntOrUndefined(characterLevel),
						alignment: characterAlignment.trim(),
						hitPoints: parseIntOrUndefined(characterHitPoints),
						armorClass: parseIntOrUndefined(characterArmorClass),
					}),
					createdAt: now,
					updatedAt: now,
				};
				if (!created.summary) created.summary = summarizeVaultObject(created);
				object = created;
			} else {
				const created: ImageObject = {
					id: generateVaultObjectId(),
					type: 'image',
					name: name.trim(),
					summary: summary.trim(),
					tags: parseTags(tags),
					data: normalizeImageData({
						url: imageUrl.trim(),
						alt: imageAlt.trim(),
						caption: imageCaption.trim(),
						credit: imageCredit.trim(),
					}),
					createdAt: now,
					updatedAt: now,
				};
				if (!created.summary) created.summary = summarizeVaultObject(created);
				object = created;
			}

			await storage.saveObject(object);
			insertEmbed(object);
			await loadObjects();
			resetCreateForm();
			mode = 'embed-objects';
		} catch (err) {
			error = String(err);
		} finally {
			loading = false;
		}
	}
</script>

<div class="mb-2 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface">
	<button
		class="w-full px-3 py-2 text-left text-sm font-medium text-ink dark:text-tavern-text hover:bg-surface-alt dark:hover:bg-tavern-surface-alt rounded-lg"
		onclick={() => (expanded = !expanded)}
	>
		{expanded ? 'Hide Embeds' : 'Embeds'}
	</button>

	{#if expanded}
		<div class="px-3 pb-3">
			<div class="flex gap-2 mb-2">
				<button
					class="px-2 py-1 text-xs rounded-md {mode === 'create'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
						: 'bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted'}"
					onclick={() => (mode = 'create')}
				>
					Create
				</button>
				<button
					class="px-2 py-1 text-xs rounded-md {mode === 'embed-objects'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
						: 'bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted'}"
					onclick={() => (mode = 'embed-objects')}
				>
					Embed Objects
				</button>
				<button
					class="px-2 py-1 text-xs rounded-md {mode === 'embed-notes'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
						: 'bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted'}"
					onclick={() => (mode = 'embed-notes')}
				>
					Embed Notes
				</button>
			</div>

			{#if mode === 'create'}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
					<label class="text-xs text-ink-muted dark:text-tavern-muted">
						Type
						<select
							bind:value={createType}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
						>
							<option value="stat_block">Stat Block</option>
							<option value="character">Character</option>
							<option value="image">Image</option>
						</select>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted">
						Name
						<input
							type="text"
							bind:value={name}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
							placeholder="Object name"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
						Summary
						<input
							type="text"
							bind:value={summary}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
							placeholder="Optional short summary"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
						Tags
						<input
							type="text"
							bind:value={tags}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
							placeholder="comma,separated,tags"
						/>
					</label>
				</div>

				{#if createType === 'stat_block'}
					<div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
						<input bind:value={statCreatureType} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="Creature type" />
						<input bind:value={statAlignment} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="Alignment" />
						<input bind:value={statArmorClass} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="AC" />
						<input bind:value={statHitPoints} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="HP" />
						<input bind:value={statSpeed} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="Speed" />
						<input bind:value={statChallenge} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="CR" />
					</div>
				{:else if createType === 'character'}
					<div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
						<input bind:value={characterAncestry} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="Ancestry" />
						<input bind:value={characterClassName} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="Class" />
						<input bind:value={characterLevel} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="Level" />
						<input bind:value={characterAlignment} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="Alignment" />
						<input bind:value={characterHitPoints} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="HP" />
						<input bind:value={characterArmorClass} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="AC" />
					</div>
				{:else}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
						<input bind:value={imageUrl} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface md:col-span-2" placeholder="Image URL (required)" />
						<input bind:value={imageAlt} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="Alt text" />
						<input bind:value={imageCaption} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface" placeholder="Caption" />
						<input bind:value={imageCredit} class="px-2 py-1 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface md:col-span-2" placeholder="Credit" />
					</div>
				{/if}

				<div class="flex items-center gap-2">
					<button
						class="px-2.5 py-1.5 text-xs rounded-md bg-accent text-white disabled:opacity-60"
						onclick={createObject}
						disabled={loading || !editorView}
					>
						Create + Embed
					</button>
				</div>
			{:else if mode === 'embed-objects'}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
					<input
						type="text"
						bind:value={query}
						class="px-2 py-1.5 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
						placeholder="Search objects..."
					/>
					<select
						bind:value={filterType}
						class="px-2 py-1.5 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
					>
						<option value="all">All types</option>
						<option value="stat_block">Stat blocks</option>
						<option value="character">Characters</option>
						<option value="image">Images</option>
					</select>
				</div>

				<div class="max-h-52 overflow-y-auto border border-border dark:border-tavern-border rounded-md">
					{#if loading}
						<div class="px-2 py-2 text-xs text-ink-muted dark:text-tavern-muted">Loading objects...</div>
					{:else if filteredObjects.length === 0}
						<div class="px-2 py-2 text-xs text-ink-muted dark:text-tavern-muted">No objects found.</div>
					{:else}
						{#each filteredObjects as object (object.id)}
							<div class="flex items-center gap-2 px-2 py-1.5 border-b border-border dark:border-tavern-border last:border-b-0">
								<div class="min-w-0 flex-1">
									<p class="text-xs font-medium text-ink dark:text-tavern-text truncate">{object.name}</p>
									<p class="text-[11px] text-ink-muted dark:text-tavern-muted truncate">{object.type} {object.summary ? `- ${object.summary}` : ''}</p>
								</div>
								<button
									class="px-2 py-1 text-[11px] rounded-md bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent"
									onclick={() => insertEmbed(object)}
									disabled={!editorView}
								>
									Embed
								</button>
							</div>
						{/each}
					{/if}
				</div>
			{:else}
				<div class="mb-2">
					<input
						type="text"
						bind:value={noteQuery}
						class="w-full px-2 py-1.5 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
						placeholder="Search notes..."
					/>
				</div>

				<div class="max-h-52 overflow-y-auto border border-border dark:border-tavern-border rounded-md">
					{#if loading}
						<div class="px-2 py-2 text-xs text-ink-muted dark:text-tavern-muted">Loading notes...</div>
					{:else if filteredNotes.length === 0}
						<div class="px-2 py-2 text-xs text-ink-muted dark:text-tavern-muted">No notes found.</div>
					{:else}
						{#each filteredNotes as note (note.id)}
							<div class="flex items-center gap-2 px-2 py-1.5 border-b border-border dark:border-tavern-border last:border-b-0">
								<div class="min-w-0 flex-1">
									<p class="text-xs font-medium text-ink dark:text-tavern-text truncate">{note.title}</p>
									<p class="text-[11px] text-ink-muted dark:text-tavern-muted truncate">{note.folder}</p>
								</div>
								<button
									class="px-2 py-1 text-[11px] rounded-md bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent"
									onclick={() => insertNoteEmbed(note)}
									disabled={!editorView}
								>
									Embed
								</button>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			{#if error}
				<p class="mt-2 text-xs text-error dark:text-tavern-error">{error}</p>
			{/if}
		</div>
	{/if}
</div>
