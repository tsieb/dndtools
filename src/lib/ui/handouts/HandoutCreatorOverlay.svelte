<script lang="ts">
	import {
		createVaultObjectId,
		type HandoutAgingEffect,
		type HandoutObject,
		type HandoutType,
	} from '$lib/types/object.js';
	import {
		buildCipherBundle,
		downloadHandoutPrintableHtml,
		handoutEffectClassNames,
	} from '$lib/domain/handouts.js';
	import { normalizeHandoutData } from '$lib/domain/objects.js';
	import { handoutsState } from '$lib/state/handouts.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';

	interface Props {
		open: boolean;
		onclose: () => void;
		oncreated?: (handoutId: string) => void;
	}

	const HANDOUT_TYPES: ReadonlyArray<{ value: HandoutType; label: string }> = [
		{ value: 'document', label: 'Document' },
		{ value: 'letter', label: 'Letter' },
		{ value: 'rumor', label: 'Rumor' },
		{ value: 'map_fragment', label: 'Map Fragment' },
		{ value: 'image', label: 'Image' },
		{ value: 'cipher', label: 'Cipher' },
	];
	const AGING_EFFECTS: ReadonlyArray<{ value: HandoutAgingEffect; label: string }> = [
		{ value: 'parchment', label: 'Parchment texture' },
		{ value: 'torn_edge', label: 'Torn edge' },
		{ value: 'blood_stain', label: 'Blood stain' },
		{ value: 'burned_edge', label: 'Burned edge' },
		{ value: 'ink_blot', label: 'Ink blot' },
	];

	let { open = $bindable(), onclose, oncreated }: Props = $props();

	let type = $state<HandoutType>('document');
	let title = $state('');
	let content = $state('');
	let summary = $state('');
	let tagsText = $state('handout');
	let campaignSession = $state('');
	let sourceNpcId = $state('');
	let sourceLocationId = $state('');
	let revealAnimation = $state<'scroll_rollout' | 'letter_unfold'>('scroll_rollout');
	let effects = $state<HandoutAgingEffect[]>(['parchment']);
	let cipherDecoded = $state('');
	let cipherEncrypted = $state('');
	let cipherKey = $state('');
	let saving = $state(false);
	let wasOpen = $state(false);

	let previewData = $derived.by(() =>
		normalizeHandoutData({
			title: title.trim(),
			content: type === 'cipher' ? cipherEncrypted || content : content,
			handoutType: type,
			campaignSession: campaignSession.trim() || undefined,
			sourceNpcId: sourceNpcId.trim() || undefined,
			sourceLocationId: sourceLocationId.trim() || undefined,
			delivered: false,
			revealAnimation,
			visualStyle: effects.length > 0 ? { effects } : undefined,
			cipher:
				type === 'cipher'
					? {
							encryptedContent: cipherEncrypted || content,
							decodedContent: cipherDecoded,
							substitutionKey: cipherKey,
							decodedRevealed: false,
						}
					: undefined,
		}),
	);
	let previewClasses = $derived.by(() => handoutEffectClassNames(previewData).join(' '));
	let previewRevealClass = $derived.by(() =>
		previewData.revealAnimation === 'letter_unfold'
			? 'handout-reveal--letter'
			: 'handout-reveal--scroll',
	);
	let previewContent = $derived.by(() => {
		if (type === 'cipher') {
			return previewData.cipher?.encryptedContent || previewData.content || '';
		}
		return previewData.content || '';
	});

	function resetForm(): void {
		type = 'document';
		title = '';
		content = '';
		summary = '';
		tagsText = 'handout';
		campaignSession = '';
		sourceNpcId = '';
		sourceLocationId = '';
		revealAnimation = 'scroll_rollout';
		effects = ['parchment'];
		cipherDecoded = '';
		cipherEncrypted = '';
		cipherKey = '';
		saving = false;
	}

	function toggleEffect(effect: HandoutAgingEffect): void {
		if (effects.includes(effect)) {
			effects = effects.filter((entry) => entry !== effect);
			return;
		}
		effects = [...effects, effect];
	}

	function handleGenerateCipher(): void {
		const source = cipherDecoded || content;
		if (!source.trim()) {
			toastState.info('Add decoded content before generating a cipher.');
			return;
		}
		const bundle = buildCipherBundle(source, cipherKey || undefined);
		cipherDecoded = bundle.decodedContent;
		cipherEncrypted = bundle.encryptedContent;
		cipherKey = bundle.substitutionKey;
		content = bundle.encryptedContent;
		revealAnimation = 'letter_unfold';
	}

	function buildDraftHandoutObject(): HandoutObject {
		const now = new Date().toISOString();
		const data = normalizeHandoutData({
			title: title.trim(),
			content: type === 'cipher' ? cipherEncrypted || content : content,
			handoutType: type,
			sourceNpcId: sourceNpcId.trim() || undefined,
			sourceLocationId: sourceLocationId.trim() || undefined,
			campaignSession: campaignSession.trim() || undefined,
			delivered: false,
			revealAnimation,
			visualStyle: effects.length > 0 ? { effects } : undefined,
			cipher:
				type === 'cipher'
					? {
							encryptedContent: cipherEncrypted || content,
							decodedContent: cipherDecoded,
							substitutionKey: cipherKey,
							decodedRevealed: false,
						}
					: undefined,
		});
		return {
			id: createVaultObjectId('preview-handout'),
			type: 'handout',
			name: title.trim() || 'Handout',
			summary: summary.trim(),
			tags: tagsText
				.split(',')
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0),
			visibility: 'shared',
			relationships: [],
			data,
			createdAt: now,
			updatedAt: now,
		};
	}

	function exportDraft(showDecoded = false): void {
		downloadHandoutPrintableHtml(buildDraftHandoutObject(), { showDecodedCipher: showDecoded });
	}

	async function saveHandout(): Promise<void> {
		if (!title.trim()) {
			toastState.error('Handout title is required.');
			return;
		}
		if (type === 'cipher' && !(cipherDecoded || content).trim()) {
			toastState.error('Cipher handouts require decoded text.');
			return;
		}
		if (!(content || cipherEncrypted).trim()) {
			toastState.error('Handout content is required.');
			return;
		}

		saving = true;
		try {
			if (type === 'cipher' && !cipherKey.trim()) {
				handleGenerateCipher();
			}

			const created = await handoutsState.createHandout({
				name: title.trim(),
				summary: summary.trim(),
				tags: tagsText
					.split(',')
					.map((entry) => entry.trim())
					.filter((entry) => entry.length > 0),
				visibility: 'shared',
				data: {
					title: title.trim(),
					content: type === 'cipher' ? cipherEncrypted || content : content,
					handoutType: type,
					sourceNpcId: sourceNpcId.trim() || undefined,
					sourceLocationId: sourceLocationId.trim() || undefined,
					campaignSession: campaignSession.trim() || undefined,
					delivered: false,
					revealAnimation,
					visualStyle: effects.length > 0 ? { effects } : undefined,
					cipher:
						type === 'cipher'
							? {
									encryptedContent: cipherEncrypted || content,
									decodedContent: cipherDecoded || content,
									substitutionKey: cipherKey,
									decodedRevealed: false,
								}
							: undefined,
				},
			});

			toastState.success('Handout created.');
			oncreated?.(String(created.id));
			onclose();
		} catch (error) {
			toastState.error(`Failed to create handout: ${String(error)}`);
		} finally {
			saving = false;
		}
	}

	function handleBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) onclose();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		}
	}

	$effect(() => {
		if (open && !wasOpen) {
			resetForm();
			wasOpen = true;
			void handoutsState.ensureLoaded();
			return;
		}
		if (!open && wasOpen) {
			wasOpen = false;
		}
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 bg-black/45 flex items-start justify-end p-4 sm:p-6"
		role="dialog"
		aria-modal="true"
		aria-label="Create handout"
		use:focusTrap
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<section
			class="w-full max-w-5xl h-[88vh] rounded-xl border border-border dark:border-tavern-border bg-surface/98 dark:bg-tavern-surface/98 shadow-2xl flex flex-col overflow-hidden"
		>
			<header
				class="px-4 py-3 border-b border-border dark:border-tavern-border flex items-center gap-3"
			>
				<div class="flex-1 min-w-0">
					<h2 class="text-sm font-semibold text-ink dark:text-tavern-text truncate">
						Handout Creator
					</h2>
					<p class="text-[11px] text-ink-muted dark:text-tavern-muted">
						Create handouts with visual aging effects, cipher payloads, and printable export.
					</p>
				</div>
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={() => exportDraft(false)}
				>
					Export HTML
				</button>
				{#if type === 'cipher'}
					<button
						type="button"
						class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
						onclick={() => exportDraft(true)}
					>
						Export Decoded HTML
					</button>
				{/if}
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={onclose}
				>
					Close
				</button>
			</header>

			<div class="flex-1 min-h-0 overflow-hidden grid lg:grid-cols-[360px_minmax(0,1fr)]">
				<div class="border-r border-border dark:border-tavern-border p-4 overflow-y-auto space-y-3">
					<label class="block text-xs text-ink-muted dark:text-tavern-muted">
						Title
						<input
							type="text"
							bind:value={title}
							placeholder="Handout title"
							class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-sm text-ink dark:text-tavern-text"
						/>
					</label>

					<div class="grid grid-cols-2 gap-2">
						<label class="block text-xs text-ink-muted dark:text-tavern-muted">
							Type
							<select
								bind:value={type}
								class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm text-ink dark:text-tavern-text"
							>
								{#each HANDOUT_TYPES as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
						<label class="block text-xs text-ink-muted dark:text-tavern-muted">
							Reveal animation
							<select
								bind:value={revealAnimation}
								class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm text-ink dark:text-tavern-text"
							>
								<option value="scroll_rollout">Scroll rollout</option>
								<option value="letter_unfold">Letter unfold</option>
							</select>
						</label>
					</div>

					<label class="block text-xs text-ink-muted dark:text-tavern-muted">
						Campaign session
						<input
							type="text"
							bind:value={campaignSession}
							placeholder="Session 14"
							class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-sm text-ink dark:text-tavern-text"
						/>
					</label>

					<div class="grid grid-cols-2 gap-2">
						<label class="block text-xs text-ink-muted dark:text-tavern-muted">
							Source NPC
							<input
								type="text"
								bind:value={sourceNpcId}
								placeholder="npc-id"
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-sm text-ink dark:text-tavern-text"
							/>
						</label>
						<label class="block text-xs text-ink-muted dark:text-tavern-muted">
							Source location
							<input
								type="text"
								bind:value={sourceLocationId}
								placeholder="location-id"
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-sm text-ink dark:text-tavern-text"
							/>
						</label>
					</div>

					<label class="block text-xs text-ink-muted dark:text-tavern-muted">
						Summary
						<input
							type="text"
							bind:value={summary}
							placeholder="Optional summary"
							class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-sm text-ink dark:text-tavern-text"
						/>
					</label>

					<label class="block text-xs text-ink-muted dark:text-tavern-muted">
						Tags (comma separated)
						<input
							type="text"
							bind:value={tagsText}
							class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-sm text-ink dark:text-tavern-text"
						/>
					</label>

					<div>
						<p class="text-xs font-medium text-ink dark:text-tavern-text mb-1.5">
							Visual aging effects
						</p>
						<div class="space-y-1.5">
							{#each AGING_EFFECTS as option (option.value)}
								<label
									class="flex items-center gap-2 text-xs text-ink-muted dark:text-tavern-muted"
								>
									<input
										type="checkbox"
										checked={effects.includes(option.value)}
										onchange={() => toggleEffect(option.value)}
									/>
									<span>{option.label}</span>
								</label>
							{/each}
						</div>
					</div>

					{#if type === 'cipher'}
						<div class="space-y-2 rounded border border-border dark:border-tavern-border p-2.5">
							<p class="text-xs font-medium text-ink dark:text-tavern-text">Cipher settings</p>
							<label class="block text-xs text-ink-muted dark:text-tavern-muted">
								Decoded text
								<textarea
									bind:value={cipherDecoded}
									rows="4"
									class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-xs text-ink dark:text-tavern-text"
								></textarea>
							</label>
							<label class="block text-xs text-ink-muted dark:text-tavern-muted">
								Substitution key
								<input
									type="text"
									bind:value={cipherKey}
									placeholder="Auto-generated if blank"
									class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-xs font-mono text-ink dark:text-tavern-text"
								/>
							</label>
							<button
								type="button"
								class="w-full rounded border border-border dark:border-tavern-border px-2 py-1.5 text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
								onclick={handleGenerateCipher}
							>
								Generate substitution cipher
							</button>
							<label class="block text-xs text-ink-muted dark:text-tavern-muted">
								Encrypted output
								<textarea
									bind:value={cipherEncrypted}
									rows="4"
									class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-xs font-mono text-ink dark:text-tavern-text"
								></textarea>
							</label>
						</div>
					{/if}

					<label class="block text-xs text-ink-muted dark:text-tavern-muted">
						{type === 'cipher' ? 'Encrypted markdown content' : 'Markdown content'}
						<textarea
							bind:value={content}
							rows="7"
							class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-sm text-ink dark:text-tavern-text"
						></textarea>
					</label>

					<div class="flex items-center justify-end gap-2 pt-1">
						<button
							type="button"
							class="px-3 py-1.5 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
							onclick={onclose}
							disabled={saving}
						>
							Cancel
						</button>
						<button
							type="button"
							class="px-3 py-1.5 rounded text-xs bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-60"
							onclick={() => void saveHandout()}
							disabled={saving}
						>
							{saving ? 'Saving...' : 'Save Handout'}
						</button>
					</div>
				</div>

				<div class="p-4 overflow-y-auto">
					<p
						class="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-2"
					>
						Live preview
					</p>
					<article
						class={`handout-preview handout-preview--creator ${previewRevealClass} ${previewClasses}`}
					>
						<h3>{previewData.title || 'Untitled handout'}</h3>
						<div class="handout-preview__meta">
							<span>{type.replace('_', ' ')}</span>
							{#if campaignSession.trim()}
								<span>{campaignSession.trim()}</span>
							{/if}
							{#if type === 'cipher' && cipherKey.trim()}
								<span class="font-mono">key: {cipherKey}</span>
							{/if}
						</div>
						<pre>{previewContent || 'Preview your handout content here.'}</pre>
					</article>
				</div>
			</div>
		</section>
	</div>
{/if}
