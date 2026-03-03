<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { downloadHandoutPrintableHtml, handoutTypeLabel } from '$lib/domain/handouts.js';
	import { handoutsState } from '$lib/state/handouts.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import type { HandoutObject, HandoutType } from '$lib/types/object.js';

	interface Props {
		onopencreator?: () => void;
	}

	type StatusFilter = 'all' | 'delivered' | 'pending';

	let { onopencreator }: Props = $props();
	let query = $state('');
	let typeFilter = $state<'all' | HandoutType>('all');
	let statusFilter = $state<StatusFilter>('all');
	let sessionFilter = $state('all');
	let contextMenu = $state<{ handoutId: string; x: number; y: number } | null>(null);
	let processingId = $state<string | null>(null);

	let handouts = $derived(handoutsState.sortedHandouts);
	let connectedPlayers = $derived(handoutsState.connectedPlayerCount);
	let sessions = $derived.by(() =>
		[
			...new Set(
				handouts
					.map((handout) => handout.data.campaignSession?.trim() || '')
					.filter((session) => session.length > 0),
			),
		].sort((a, b) => a.localeCompare(b)),
	);
	let filteredHandouts = $derived.by(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return handouts.filter((handout) => {
			if (typeFilter !== 'all' && handout.data.handoutType !== typeFilter) return false;
			if (statusFilter === 'delivered' && !handout.data.delivered) return false;
			if (statusFilter === 'pending' && handout.data.delivered) return false;
			if (sessionFilter !== 'all' && (handout.data.campaignSession ?? '') !== sessionFilter)
				return false;
			if (!normalizedQuery) return true;
			const haystack = [
				handout.data.title,
				handout.summary,
				handout.data.content,
				handout.tags.join(' '),
			]
				.join(' ')
				.toLowerCase();
			return haystack.includes(normalizedQuery);
		});
	});
	let contextHandout = $derived.by(() =>
		contextMenu ? (handoutsState.getById(contextMenu.handoutId) ?? null) : null,
	);

	$effect(() => {
		void handoutsState.ensureLoaded();
	});

	$effect(() => {
		if (!contextMenu || typeof window === 'undefined') return;
		const handlePointerDown = (event: MouseEvent): void => {
			const target = event.target as HTMLElement;
			if (target.closest('[data-handout-context-menu="true"]')) return;
			contextMenu = null;
		};
		const handleEscape = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') contextMenu = null;
		};
		window.addEventListener('mousedown', handlePointerDown);
		window.addEventListener('keydown', handleEscape);
		return () => {
			window.removeEventListener('mousedown', handlePointerDown);
			window.removeEventListener('keydown', handleEscape);
		};
	});

	function requestCreatorOpen(): void {
		if (onopencreator) {
			onopencreator();
			return;
		}
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('dndtools:open-handout-creator'));
		}
	}

	function openHandoutNote(handout: HandoutObject): void {
		void goto(resolve(`/notes/${handout.id}`));
	}

	function openContextMenu(event: MouseEvent, handout: HandoutObject): void {
		event.preventDefault();
		contextMenu = {
			handoutId: String(handout.id),
			x: event.clientX,
			y: event.clientY,
		};
	}

	async function deliver(handout: HandoutObject): Promise<void> {
		processingId = String(handout.id);
		try {
			const result = await handoutsState.deliverHandout(String(handout.id));
			if (!result) {
				toastState.error('Handout no longer exists.');
				return;
			}
			if (result.connectedPlayerCount > 0) {
				toastState.success(
					`Delivered to ${result.connectedPlayerCount} connected player ${result.connectedPlayerCount === 1 ? 'device' : 'devices'}.`,
				);
				return;
			}
			toastState.info(
				'No connected player devices detected. Handout marked delivered, physically hand it to players.',
			);
		} catch (error) {
			toastState.error(`Failed to deliver handout: ${String(error)}`);
		} finally {
			processingId = null;
			contextMenu = null;
		}
	}

	async function revealDecoded(handout: HandoutObject): Promise<void> {
		processingId = String(handout.id);
		try {
			const updated = await handoutsState.revealCipherDecoded(String(handout.id));
			if (!updated) {
				toastState.error('Decoded reveal is only available for cipher handouts.');
				return;
			}
			toastState.success('Decoded cipher revealed to players.');
		} catch (error) {
			toastState.error(`Failed to reveal decoded cipher: ${String(error)}`);
		} finally {
			processingId = null;
			contextMenu = null;
		}
	}

	function exportPrintable(handout: HandoutObject, showDecoded = false): void {
		downloadHandoutPrintableHtml(handout, { showDecodedCipher: showDecoded });
		contextMenu = null;
	}
</script>

<section class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<h2 class="text-lg font-semibold text-ink dark:text-tavern-text">Handout Library</h2>
			<p class="text-xs text-ink-muted dark:text-tavern-muted mt-0.5">
				Right-click any handout row and choose "Deliver to players" for session delivery.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<span
				class="px-2 py-0.5 rounded-full text-xs font-medium {connectedPlayers > 0
					? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-200'
					: 'bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-200'}"
			>
				{connectedPlayers > 0
					? `${connectedPlayers} connected player${connectedPlayers === 1 ? '' : 's'}`
					: 'Disconnected mode'}
			</span>
			<button
				type="button"
				class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
				onclick={requestCreatorOpen}
			>
				Create Handout
			</button>
		</div>
	</div>

	<div class="grid gap-2 md:grid-cols-4">
		<label class="text-xs text-ink-muted dark:text-tavern-muted">
			Search
			<input
				type="text"
				bind:value={query}
				placeholder="Title, tags, content..."
				class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5 text-sm text-ink dark:text-tavern-text"
			/>
		</label>
		<label class="text-xs text-ink-muted dark:text-tavern-muted">
			Type
			<select
				bind:value={typeFilter}
				class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm text-ink dark:text-tavern-text"
			>
				<option value="all">All types</option>
				<option value="document">Document</option>
				<option value="letter">Letter</option>
				<option value="rumor">Rumor</option>
				<option value="map_fragment">Map fragment</option>
				<option value="image">Image</option>
				<option value="cipher">Cipher</option>
			</select>
		</label>
		<label class="text-xs text-ink-muted dark:text-tavern-muted">
			Status
			<select
				bind:value={statusFilter}
				class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm text-ink dark:text-tavern-text"
			>
				<option value="all">All statuses</option>
				<option value="delivered">Delivered</option>
				<option value="pending">Undelivered</option>
			</select>
		</label>
		<label class="text-xs text-ink-muted dark:text-tavern-muted">
			Campaign session
			<select
				bind:value={sessionFilter}
				class="mt-1 h-9 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm text-ink dark:text-tavern-text"
			>
				<option value="all">All sessions</option>
				{#each sessions as session (session)}
					<option value={session}>{session}</option>
				{/each}
			</select>
		</label>
	</div>

	{#if handoutsState.loading}
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 text-sm text-ink-muted dark:text-tavern-muted"
		>
			Loading handouts...
		</div>
	{:else if filteredHandouts.length === 0}
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 text-sm text-ink-muted dark:text-tavern-muted"
		>
			{handouts.length === 0
				? 'No handouts yet. Create your first handout from the toolbar or this tab.'
				: 'No handouts match the current filters.'}
		</div>
	{:else}
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface overflow-hidden"
		>
			<ul class="divide-y divide-border dark:divide-tavern-border">
				{#each filteredHandouts as handout (handout.id)}
					<li class="p-3" oncontextmenu={(event) => openContextMenu(event, handout)}>
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-semibold text-ink dark:text-tavern-text truncate">
										{handout.data.title || handout.name}
									</p>
									<span
										class="text-[11px] px-1.5 py-0.5 rounded border border-border/70 dark:border-tavern-border/70 text-ink-faint dark:text-tavern-faint"
									>
										{handoutTypeLabel(handout.data.handoutType)}
									</span>
									<span
										class="text-[11px] px-1.5 py-0.5 rounded {handout.data.delivered
											? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-200'
											: 'bg-slate-100 text-slate-700 dark:bg-slate-900/35 dark:text-slate-300'}"
									>
										{handout.data.delivered ? 'Delivered' : 'Undelivered'}
									</span>
									{#if handout.data.handoutType === 'cipher' && !handout.data.cipher?.decodedRevealed}
										<span
											class="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-200"
										>
											Locked
										</span>
									{/if}
								</div>
								{#if handout.data.campaignSession}
									<p class="text-xs text-ink-faint dark:text-tavern-faint mt-0.5">
										{handout.data.campaignSession}
									</p>
								{/if}
								<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1 line-clamp-2">
									{handout.summary || handout.data.content || 'No summary provided.'}
								</p>
							</div>
							<div class="flex flex-wrap items-center gap-1.5">
								<button
									type="button"
									class="px-2 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors disabled:opacity-60"
									onclick={() => void deliver(handout)}
									disabled={processingId === String(handout.id)}
								>
									Deliver
								</button>
								{#if handout.data.handoutType === 'cipher'}
									<button
										type="button"
										class="px-2 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors disabled:opacity-60"
										onclick={() => void revealDecoded(handout)}
										disabled={processingId === String(handout.id) ||
											handout.data.cipher?.decodedRevealed}
									>
										Reveal Decoded
									</button>
								{/if}
								<button
									type="button"
									class="px-2 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
									onclick={() => exportPrintable(handout, false)}
								>
									Export HTML
								</button>
								<button
									type="button"
									class="px-2 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
									onclick={() => openHandoutNote(handout)}
								>
									Open
								</button>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>

{#if contextMenu && contextHandout}
	<div
		data-handout-context-menu="true"
		class="fixed z-[70] min-w-[200px] rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface shadow-xl p-1"
		style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
		role="menu"
	>
		<button
			type="button"
			class="w-full text-left px-2.5 py-1.5 rounded text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			role="menuitem"
			onclick={() => void deliver(contextHandout)}
			disabled={processingId === String(contextHandout.id)}
		>
			Deliver to players
		</button>
		{#if contextHandout.data.handoutType === 'cipher'}
			<button
				type="button"
				class="w-full text-left px-2.5 py-1.5 rounded text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt disabled:opacity-60"
				role="menuitem"
				onclick={() => void revealDecoded(contextHandout)}
				disabled={contextHandout.data.cipher?.decodedRevealed}
			>
				Reveal decoded version
			</button>
			<button
				type="button"
				class="w-full text-left px-2.5 py-1.5 rounded text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
				role="menuitem"
				onclick={() => exportPrintable(contextHandout, true)}
			>
				Export decoded HTML
			</button>
		{/if}
		<button
			type="button"
			class="w-full text-left px-2.5 py-1.5 rounded text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			role="menuitem"
			onclick={() => exportPrintable(contextHandout, false)}
		>
			Export printable HTML
		</button>
		<button
			type="button"
			class="w-full text-left px-2.5 py-1.5 rounded text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			role="menuitem"
			onclick={() => openHandoutNote(contextHandout)}
		>
			Open handout note
		</button>
	</div>
{/if}
