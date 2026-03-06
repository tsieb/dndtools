<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ONBOARDING_STEPS, ONBOARDING_TIPS } from '$lib/domain/onboarding.js';
	import {
		DND_VAULT_TEMPLATES,
		getVaultTemplateById,
		type VaultTemplate,
	} from '$lib/domain/vault-templates.js';
	import { buildObsidianImportPreview, type ObsidianImportPreview } from '$lib/domain/export.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { searchService } from '$lib/domain/search.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import { createNewNote } from '$lib/utils/note-factory.js';
	import Button from '$lib/ui/common/Button.svelte';
	import Modal from '$lib/ui/common/Modal.svelte';

	let creatingTemplate = $state<VaultTemplate['id'] | null>(null);
	let importing = $state(false);
	let previewOpen = $state(false);
	let preview = $state<ObsidianImportPreview | null>(null);

	let nonWelcomeNotes = $derived(
		notesState.activeNotes.filter((note) => note.title.trim() !== 'Welcome to DND Tools'),
	);
	let hasUserNote = $derived(nonWelcomeNotes.length > 0);
	let hasAnyTag = $derived(nonWelcomeNotes.some((note) => note.tags.length > 0));
	let hasAnyLink = $derived(
		nonWelcomeNotes.some((note) => linksState.getForwardLinkCount(note.id) > 0),
	);

	let visibleTips = $derived(
		ONBOARDING_TIPS.filter((tip) => !onboardingState.dismissedTips.includes(tip.id)),
	);

	$effect(() => {
		if (hasUserNote) {
			void onboardingState.completeStep('create_first_note');
		}
	});

	$effect(() => {
		if (hasAnyTag) {
			void onboardingState.completeStep('add_tag');
		}
	});

	$effect(() => {
		if (hasAnyLink) {
			void onboardingState.completeStep('add_link');
		}
	});

	async function handleCreateFirstNote(): Promise<void> {
		const note = await notesState.createNote();
		await onboardingState.completeStep('create_first_note');
		goto(resolve(`/knowledge/notes/${note.id}/edit`));
	}

	async function handleUseSearch(): Promise<void> {
		await onboardingState.completeStep('use_search');
		goto(resolve('/knowledge/search'));
	}

	async function handleOpenSettings(): Promise<void> {
		await onboardingState.completeStep('open_settings');
		goto(resolve('/settings'));
	}

	async function handleCreateVaultTemplate(templateId: VaultTemplate['id']): Promise<void> {
		const template = getVaultTemplateById(templateId);
		if (!template) return;

		creatingTemplate = templateId;
		try {
			for (const note of template.notes) {
				await notesState.createNote({
					title: note.title,
					content: note.content,
					tags: [...note.tags],
					folder: note.folder,
				});
			}
			await searchService.buildIndex(notesState.notes);
			await onboardingState.completeStep('create_first_note');
			await onboardingState.completeStep('add_tag');
			await onboardingState.completeStep('add_link');
			toastState.success(`Created "${template.name}" vault starter`);
		} catch (error) {
			toastState.error(`Failed to create vault starter: ${String(error)}`);
		} finally {
			creatingTemplate = null;
		}
	}

	async function handleChooseObsidianFolder(): Promise<void> {
		if (importing) return;
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		input.accept = '.md,.markdown';
		input.setAttribute('webkitdirectory', '');
		input.setAttribute('directory', '');

		input.onchange = async () => {
			if (!input.files?.length) return;
			importing = true;
			try {
				const unpackedFiles = await Promise.all(
					Array.from(input.files).map(async (file) => {
						const withRelative = file as File & { webkitRelativePath?: string };
						return {
							relativePath: withRelative.webkitRelativePath || file.name,
							content: await file.text(),
						};
					}),
				);
				preview = buildObsidianImportPreview(
					unpackedFiles,
					notesState.activeNotes.map((note) => note.title),
				);
				previewOpen = true;
			} catch (error) {
				toastState.error(`Failed to parse selected folder: ${String(error)}`);
			} finally {
				importing = false;
			}
		};

		input.click();
	}

	async function handleConfirmObsidianImport(): Promise<void> {
		if (!preview || importing) return;
		importing = true;

		try {
			const notes = preview.candidates.map((candidate) =>
				createNewNote({
					title: candidate.title,
					content: candidate.content,
					tags: [...candidate.tags],
					folder: candidate.folder,
					frontmatter: { ...candidate.frontmatter },
				}),
			);
			const result = await getStorage().importNotes(notes);
			await notesState.loadAll();
			await searchService.buildIndex(notesState.notes);

			if (result.imported > 0) {
				await onboardingState.completeStep('create_first_note');
				await onboardingState.completeStep('add_tag');
			}

			toastState.success(
				`Imported ${result.imported} ${result.imported === 1 ? 'note' : 'notes'} from Obsidian`,
			);
			if (result.errors.length > 0) {
				toastState.error(result.errors[0]!);
			}
			previewOpen = false;
			preview = null;
		} catch (error) {
			toastState.error(`Failed to import Obsidian vault: ${String(error)}`);
		} finally {
			importing = false;
		}
	}
</script>

{#if onboardingState.dismissed}
	<section class="rounded-xl border border-border bg-surface p-4 mb-6">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<p class="text-sm font-medium text-ink">Onboarding hidden</p>
				<p class="text-xs text-ink-muted mt-1">Reopen it anytime to continue checklist progress.</p>
			</div>
			<Button variant="secondary" size="sm" onclick={() => onboardingState.reopenChecklist()}>
				Reopen onboarding
			</Button>
		</div>
	</section>
{:else}
	<section class="rounded-xl border border-border bg-surface p-4 md:p-5 mb-6 space-y-5">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 class="text-lg font-semibold text-ink">First-run Checklist</h2>
				<p class="text-sm text-ink-muted mt-1">
					Complete the core workflow once to get fast and reliable session-time navigation.
				</p>
				<p class="text-xs text-ink-faint mt-2">
					Progress: {onboardingState.completedCount}/{ONBOARDING_STEPS.length}
				</p>
			</div>
			<Button variant="ghost" size="sm" onclick={() => onboardingState.dismissChecklist()}>
				Dismiss
			</Button>
		</div>

		<ul class="space-y-2">
			{#each ONBOARDING_STEPS as step (step.id)}
				<li class="rounded-lg border border-border px-3 py-2.5 bg-surface-alt/40">
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="text-sm font-medium text-ink">
								{#if onboardingState.completedSteps.includes(step.id)}
									[Done] {step.label}
								{:else}
									{step.label}
								{/if}
							</p>
							<p class="text-xs text-ink-muted mt-1">{step.description}</p>
						</div>
						<div class="shrink-0">
							{#if step.id === 'create_first_note'}
								<Button size="sm" variant="secondary" onclick={handleCreateFirstNote}>
									Create
								</Button>
							{:else if step.id === 'use_search'}
								<Button size="sm" variant="secondary" onclick={handleUseSearch}>Open</Button>
							{:else if step.id === 'open_settings'}
								<Button size="sm" variant="secondary" onclick={handleOpenSettings}>Open</Button>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>

		<div>
			<h3 class="text-sm font-semibold text-ink">Why This Matters</h3>
			<div class="grid gap-2 mt-2 md:grid-cols-3">
				{#if visibleTips.length === 0}
					<p class="text-xs text-ink-muted">
						All tips dismissed. Revisit from Settings when needed.
					</p>
				{:else}
					{#each visibleTips as tip (tip.id)}
						<div class="rounded-lg border border-border bg-surface-alt/40 p-3">
							<div class="flex items-start justify-between gap-2">
								<p class="text-xs font-semibold text-ink">{tip.title}</p>
								<button
									type="button"
									class="text-xs text-ink-faint hover:text-ink"
									onclick={() => onboardingState.dismissTip(tip.id)}
								>
									Dismiss
								</button>
							</div>
							<p class="text-xs text-ink-muted mt-1">{tip.description}</p>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<div>
				<h3 class="text-sm font-semibold text-ink">Sample Vault Templates</h3>
				<p class="text-xs text-ink-muted mt-1">
					Create a starter vault scaffold with connected notes and tags.
				</p>
				<div class="mt-2 space-y-2">
					{#each DND_VAULT_TEMPLATES as template (template.id)}
						<div class="rounded-lg border border-border bg-surface-alt/40 p-3">
							<p class="text-sm font-medium text-ink">{template.name}</p>
							<p class="text-xs text-ink-muted mt-1">
								{template.description}
							</p>
							<div class="mt-2">
								<Button
									size="sm"
									variant="secondary"
									onclick={() => handleCreateVaultTemplate(template.id)}
									disabled={creatingTemplate !== null}
								>
									{creatingTemplate === template.id ? 'Creating...' : 'Create Starter'}
								</Button>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div>
				<h3 class="text-sm font-semibold text-ink">Import from Obsidian</h3>
				<p class="text-xs text-ink-muted mt-1">
					Select an Obsidian vault folder, review a safety preview, then import.
				</p>
				<div class="mt-3 rounded-lg border border-border bg-surface-alt/40 p-3">
					<Button
						size="sm"
						variant="secondary"
						onclick={handleChooseObsidianFolder}
						disabled={importing}
					>
						{importing ? 'Preparing Preview...' : 'Choose Vault Folder'}
					</Button>
					<p class="text-xs text-ink-faint mt-2">
						Safe preview shows importable markdown files and potential title duplicates first.
					</p>
				</div>
			</div>
		</div>
	</section>
{/if}

<Modal open={previewOpen} title="Obsidian Import Preview" onclose={() => (previewOpen = false)}>
	{#if preview}
		<div class="space-y-3">
			<div class="rounded border border-border bg-surface-alt/40 p-3 text-xs text-ink">
				<p>Markdown files detected: {preview.markdownCount}</p>
				<p>Importable notes: {preview.candidates.length}</p>
				<p>Skipped non-markdown files: {preview.skippedPaths.length}</p>
				<p>Potential duplicate titles: {preview.duplicateTitles.length}</p>
				<p>Mapped compatibility features: {preview.featureMapping.mapped.length}</p>
				<p>Manual resolution hints: {preview.featureMapping.manualResolution.length}</p>
			</div>

			{#if preview.duplicateTitles.length > 0}
				<div class="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
					<p class="font-semibold">Potential duplicates detected</p>
					<p class="mt-1">
						{preview.duplicateTitles.slice(0, 6).join(', ')}
						{preview.duplicateTitles.length > 6 ? ', ...' : ''}
					</p>
				</div>
			{/if}

			<div>
				<p class="text-xs font-semibold text-ink mb-1">Preview Paths</p>
				<ul class="text-xs text-ink-muted space-y-1">
					{#each preview.candidates.slice(0, 8) as candidate (candidate.sourcePath)}
						<li class="font-mono">{candidate.sourcePath}</li>
					{/each}
					{#if preview.candidates.length > 8}
						<li>...</li>
					{/if}
				</ul>
			</div>

			<div class="flex items-center justify-end gap-2 pt-2">
				<Button size="sm" variant="ghost" onclick={() => (previewOpen = false)}>Cancel</Button>
				<Button
					size="sm"
					variant="secondary"
					onclick={handleConfirmObsidianImport}
					disabled={importing || preview.candidates.length === 0}
				>
					{importing ? 'Importing...' : 'Import Notes'}
				</Button>
			</div>
		</div>
	{/if}
</Modal>
