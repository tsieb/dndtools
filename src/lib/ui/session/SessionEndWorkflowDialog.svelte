<script lang="ts">
	import { createFolderId } from '$lib/types/note.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { nowISO } from '$lib/utils/date.js';
	import {
		parseTagEntryInput,
		buildSessionLogNoteContent,
		loadSessionContinuitySummary,
		type SessionContinuitySummary,
	} from '$lib/domain/session-prep-workflow.js';
	import Dialog from '$lib/ui/common/Dialog.svelte';
	import ConfirmDialog from '$lib/ui/common/ConfirmDialog.svelte';

	interface Props {
		open: boolean;
		sessionboardid: string | null;
		onclose: () => void;
	}

	let { open, sessionboardid, onclose }: Props = $props();

	let step = $state<'confirm' | 'capture' | 'continuity'>('confirm');
	let whatHappened = $state('');
	let npcInput = $state('');
	let locationInput = $state('');
	let questInput = $state('');
	let followUp = $state('');
	let processing = $state(false);
	let continuity = $state<SessionContinuitySummary | null>(null);
	let creatingNpcNames = $state<string[]>([]);
	let creatingLocationNames = $state<string[]>([]);
	let lastOpen = $state(false);

	$effect(() => {
		if (open && !lastOpen) {
			step = 'confirm';
			processing = false;
			continuity = null;
			npcInput = '';
			locationInput = '';
			questInput = '';
			followUp = '';
			const rollLog = sessionModeState.formatRollHistoryForSummary().trim();
			whatHappened = rollLog;
		}
		lastOpen = open;
	});

	function closeDialog(): void {
		if (processing) return;
		onclose();
	}

	function proceedToCapture(): void {
		step = 'capture';
	}

	async function saveCaptureAndEndSession(): Promise<void> {
		if (processing) return;
		processing = true;
		try {
			const activeSession = sessionModeState.activeSession;
			const endedAt = nowISO();
			const npcNames = parseTagEntryInput(npcInput);
			const locationNames = parseTagEntryInput(locationInput);
			const questNames = parseTagEntryInput(questInput);
			const boardId = sessionboardid ?? activeSession?.sessionBoardId ?? null;
			const rollLogMarkdown = sessionModeState.formatRollHistoryForSummary();
			const note = buildSessionLogNoteContent({
				sessionBoardId: boardId,
				startedAt: activeSession?.startedAt ?? null,
				endedAt,
				whatHappened,
				npcNames,
				locationNames,
				questNames,
				followUp,
				rollLogMarkdown,
			});
			const dateSlug = endedAt.slice(0, 10);
			await notesState.createNote({
				title: `session-${dateSlug}`,
				folder: createFolderId('/sessions'),
				tags: ['session', 'session-log'],
				content: note,
			});
			continuity = await loadSessionContinuitySummary({
				npcNames,
				locationNames,
			});
			await sessionModeState.endSession();
			toastState.success('Session ended. Session log saved.');
			step = 'continuity';
		} catch (error) {
			toastState.error(`Failed to finalize session capture: ${String(error)}`);
		} finally {
			processing = false;
		}
	}

	async function quickCreateEntity(name: string, kind: 'npc' | 'location'): Promise<void> {
		const normalized = name.trim();
		if (!normalized || !continuity) return;
		if (kind === 'npc') {
			if (creatingNpcNames.includes(normalized)) return;
			creatingNpcNames = [...creatingNpcNames, normalized];
		} else {
			if (creatingLocationNames.includes(normalized)) return;
			creatingLocationNames = [...creatingLocationNames, normalized];
		}
		try {
			await notesState.createNote({
				title: normalized,
				folder: createFolderId(kind === 'npc' ? '/npcs' : '/locations'),
				tags: [kind, 'session-followup'],
				content: `# ${normalized}\n\nCreated from session continuity check.\n`,
			});
			if (kind === 'npc') {
				continuity = {
					...continuity,
					missingNpcNames: continuity.missingNpcNames.filter((entry) => entry !== normalized),
				};
				toastState.success(`Created NPC note: ${normalized}`);
			} else {
				continuity = {
					...continuity,
					unmappedLocationNames: continuity.unmappedLocationNames.filter(
						(entry) => entry !== normalized,
					),
				};
				toastState.success(`Created location note: ${normalized}`);
			}
		} catch (error) {
			toastState.error(`Failed to create ${kind} note: ${String(error)}`);
		} finally {
			if (kind === 'npc') {
				creatingNpcNames = creatingNpcNames.filter((entry) => entry !== normalized);
			} else {
				creatingLocationNames = creatingLocationNames.filter((entry) => entry !== normalized);
			}
		}
	}
</script>

<ConfirmDialog
	open={open && step === 'confirm'}
	title="End Session"
	message="End this session? You'll be asked to capture what happened before returning to idle mode."
	confirmText="Continue"
	onconfirm={proceedToCapture}
	oncancel={closeDialog}
/>

<Dialog
	open={open && step === 'capture'}
	title="Session Capture"
	maxWidth="lg"
	onclose={closeDialog}
>
	<div class="space-y-3 text-sm text-ink">
		<label class="block space-y-1">
			<span class="text-xs font-semibold text-ink-muted">What happened this session?</span>
			<textarea
				class="h-32 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
				bind:value={whatHappened}
				placeholder="Captured recap (pre-filled from roll log when available)"
			></textarea>
		</label>

		<div class="grid gap-3 md:grid-cols-3">
			<label class="block space-y-1">
				<span class="text-xs font-semibold text-ink-muted">NPCs encountered (comma separated)</span>
				<input
					type="text"
					class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
					bind:value={npcInput}
					placeholder="Captain Aria, Innkeeper Doran"
				/>
			</label>
			<label class="block space-y-1">
				<span class="text-xs font-semibold text-ink-muted">Locations visited</span>
				<input
					type="text"
					class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
					bind:value={locationInput}
					placeholder="Stonehill Inn, Old Ruins"
				/>
			</label>
			<label class="block space-y-1">
				<span class="text-xs font-semibold text-ink-muted">Quests advanced</span>
				<input
					type="text"
					class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
					bind:value={questInput}
					placeholder="Recover the Crown, Find the Scout"
				/>
			</label>
		</div>

		<label class="block space-y-1">
			<span class="text-xs font-semibold text-ink-muted">What to follow up next session?</span>
			<textarea
				class="h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
				bind:value={followUp}
				placeholder="Open items and prep notes for next session"
			></textarea>
		</label>

		<div class="flex justify-end gap-2">
			<button
				type="button"
				class="rounded border border-border px-3 py-1.5 text-xs"
				onclick={closeDialog}
				disabled={processing}
			>
				Cancel
			</button>
			<button
				type="button"
				class="rounded bg-accent px-3 py-1.5 text-xs text-white"
				onclick={() => void saveCaptureAndEndSession()}
				disabled={processing}
			>
				{processing ? 'Saving...' : 'Save Capture and End Session'}
			</button>
		</div>
	</div>
</Dialog>

<Dialog
	open={open && step === 'continuity'}
	title="Session Continuity Check"
	maxWidth="lg"
	onclose={closeDialog}
>
	{#if continuity}
		<div class="space-y-3 text-sm text-ink">
			<section class="rounded border border-border bg-surface p-2.5">
				<p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">Continuity Risks</p>
				{#if continuity.continuityRisks.length === 0}
					<p class="mt-1 text-xs text-ink-muted">
						No major continuity risks detected in the bundle.
					</p>
				{:else}
					<ul class="mt-2 space-y-1.5">
						{#each continuity.continuityRisks as risk (risk.key)}
							<li class="rounded border border-border/70 px-2 py-1.5 text-xs text-ink-muted">
								<span class="font-semibold text-ink">{risk.severity}</span>: {risk.message}
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="rounded border border-border bg-surface p-2.5">
				<p class="text-xs font-semibold text-ink">
					{continuity.missingNpcNames.length} NPCs appeared this session without vault notes — create
					them now?
				</p>
				{#if continuity.missingNpcNames.length === 0}
					<p class="mt-1 text-xs text-ink-muted">No missing NPC notes detected.</p>
				{:else}
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#each continuity.missingNpcNames as name (name)}
							<button
								type="button"
								class="rounded border border-border px-2 py-1 text-2xs hover:bg-surface-alt disabled:opacity-60"
								onclick={() => void quickCreateEntity(name, 'npc')}
								disabled={creatingNpcNames.includes(name)}
							>
								{creatingNpcNames.includes(name) ? `Creating ${name}...` : `Create ${name}`}
							</button>
						{/each}
					</div>
				{/if}
			</section>

			<section class="rounded border border-border bg-surface p-2.5">
				<p class="text-xs font-semibold text-ink">
					{continuity.unmappedLocationNames.length} locations were visited but are not represented on
					any map — add notes now?
				</p>
				{#if continuity.unmappedLocationNames.length === 0}
					<p class="mt-1 text-xs text-ink-muted">No unmapped locations detected.</p>
				{:else}
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#each continuity.unmappedLocationNames as name (name)}
							<button
								type="button"
								class="rounded border border-border px-2 py-1 text-2xs hover:bg-surface-alt disabled:opacity-60"
								onclick={() => void quickCreateEntity(name, 'location')}
								disabled={creatingLocationNames.includes(name)}
							>
								{creatingLocationNames.includes(name) ? `Creating ${name}...` : `Create ${name}`}
							</button>
						{/each}
					</div>
				{/if}
			</section>

			<div class="flex justify-end">
				<button
					type="button"
					class="rounded bg-accent px-3 py-1.5 text-xs text-white"
					onclick={closeDialog}
				>
					Done
				</button>
			</div>
		</div>
	{/if}
</Dialog>
