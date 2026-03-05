<script lang="ts">
	import Button from '$lib/ui/common/Button.svelte';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import {
		checkDesktopForUpdates,
		downloadDesktopUpdate,
		installDesktopUpdate,
		remindLaterDesktopUpdate,
		type DesktopUpdateStatus,
	} from '$lib/platform/desktop/bridge.js';

	type BrowserModeGap = {
		feature: string;
		electronBehavior: string;
		browserBehavior: string;
	};

	interface Props {
		updateStatus: DesktopUpdateStatus | null;
		isBrowserMode: boolean;
		browserModeGaps: readonly BrowserModeGap[];
		webNotificationsSupported: boolean;
		onupdatestatus: (status: DesktopUpdateStatus | null) => void;
	}

	let {
		updateStatus,
		isBrowserMode,
		browserModeGaps,
		webNotificationsSupported,
		onupdatestatus,
	}: Props = $props();

	let checkingUpdates = $state(false);
	let applyingUpdate = $state(false);
	let deferringUpdate = $state(false);

	async function handleCheckForUpdates(): Promise<void> {
		if (isBrowserMode) {
			toastState.error('Desktop update controls are unavailable in browser mode.');
			return;
		}
		checkingUpdates = true;
		try {
			onupdatestatus(await checkDesktopForUpdates());
		} catch (error) {
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_CHECK_UPDATES_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to check for updates: ${String(error)}`);
		} finally {
			checkingUpdates = false;
		}
	}

	async function handleUpdateNow(): Promise<void> {
		if (isBrowserMode) {
			toastState.error('Desktop update controls are unavailable in browser mode.');
			return;
		}
		if (!updateStatus) return;
		applyingUpdate = true;
		try {
			if (updateStatus.state === 'downloaded') {
				onupdatestatus(await installDesktopUpdate());
				return;
			}
			onupdatestatus(await downloadDesktopUpdate());
		} catch (error) {
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_APPLY_UPDATE_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to apply update: ${String(error)}`);
		} finally {
			applyingUpdate = false;
		}
	}

	async function handleRemindUpdateLater(): Promise<void> {
		if (isBrowserMode) {
			toastState.error('Desktop update controls are unavailable in browser mode.');
			return;
		}
		deferringUpdate = true;
		try {
			onupdatestatus(await remindLaterDesktopUpdate(24));
		} catch (error) {
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_REMIND_UPDATE_LATER_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to defer update reminder: ${String(error)}`);
		} finally {
			deferringUpdate = false;
		}
	}
</script>

<div
	role="tabpanel"
	id="settings-panel-about"
	aria-labelledby="settings-tab-about"
	class="space-y-8"
>
	<section>
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">About</h2>
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4"
		>
			<p class="text-sm text-ink dark:text-tavern-text font-medium">
				DND Tools v{updateStatus?.currentVersion ?? 'web'}
			</p>
			<p class="text-sm text-ink-muted dark:text-tavern-muted mt-1">
				{#if isBrowserMode}
					Browser-mode PWA runtime with offline-first IndexedDB storage.
				{:else}
					Electron-first local vault editor with built-in MCP sidecar support.
				{/if}
			</p>
			<p class="text-xs text-ink-faint dark:text-tavern-faint mt-3">
				{#if isBrowserMode}
					Data is stored in your browser vault (IndexedDB). Use import/export to move data.
				{:else}
					Data is stored in local markdown files in your selected vault folder.
				{/if}
			</p>
			<div
				class="mt-3 inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-surface-alt dark:bg-tavern-surface-alt text-ink dark:text-tavern-text"
			>
				Runtime mode: {isBrowserMode ? 'Browser' : 'Desktop'}
			</div>
		</div>
	</section>

	<section>
		<div class="flex items-center justify-between gap-3 mb-4">
			<h2 class="text-lg font-semibold text-ink dark:text-tavern-text">Updates</h2>
			<Button
				variant="secondary"
				size="sm"
				onclick={handleCheckForUpdates}
				disabled={checkingUpdates || isBrowserMode}
			>
				{checkingUpdates ? 'Checking…' : 'Check for Updates'}
			</Button>
		</div>
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-3"
		>
			{#if isBrowserMode}
				<p class="text-sm text-ink-muted dark:text-tavern-muted">
					Browser mode does not use Electron auto-update. Update by refreshing the app in your
					browser.
				</p>
			{:else if !updateStatus}
				<p class="text-sm text-ink-muted dark:text-tavern-muted">Update status unavailable.</p>
			{:else}
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-surface-alt dark:bg-tavern-surface-alt text-ink dark:text-tavern-text"
					>
						State: {updateStatus.state}
					</span>
					{#if updateStatus.latestVersion}
						<span
							class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
						>
							Latest: {updateStatus.latestVersion}
						</span>
					{/if}
				</div>
				<p class="text-sm text-ink-muted dark:text-tavern-muted">
					{updateStatus.message ?? 'No update message.'}
				</p>
				{#if updateStatus.lastCheckedAt}
					<p class="text-xs text-ink-faint dark:text-tavern-faint">
						Last checked: {updateStatus.lastCheckedAt}
					</p>
				{/if}
				{#if updateStatus.downloadProgressPercent !== null}
					<p class="text-xs text-ink-faint dark:text-tavern-faint">
						Download progress: {updateStatus.downloadProgressPercent.toFixed(1)}%
					</p>
				{/if}
				{#if updateStatus.releaseNotes}
					<details class="rounded border border-border dark:border-tavern-border p-2">
						<summary class="text-sm text-ink dark:text-tavern-text cursor-pointer">
							Changelog preview
						</summary>
						<pre
							class="mt-2 whitespace-pre-wrap text-xs text-ink-muted dark:text-tavern-muted max-h-48 overflow-y-auto">{updateStatus.releaseNotes}</pre>
					</details>
				{/if}
				{#if updateStatus.state === 'available' || updateStatus.state === 'downloaded'}
					<div class="flex flex-wrap items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onclick={handleUpdateNow}
							disabled={applyingUpdate}
						>
							{#if applyingUpdate}
								Working…
							{:else if updateStatus.state === 'downloaded'}
								Install Update Now
							{:else}
								Update Now
							{/if}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={handleRemindUpdateLater}
							disabled={deferringUpdate || applyingUpdate}
						>
							{deferringUpdate ? 'Deferring…' : 'Remind Later'}
						</Button>
					</div>
				{/if}
				{#if updateStatus.stagedRollout?.active}
					<p class="text-xs text-ink-faint dark:text-tavern-faint">
						Staged rollout: {updateStatus.stagedRollout.allowedPercent}% eligibility window, your
						cohort {updateStatus.stagedRollout.cohortPercent}%.
					</p>
				{/if}
			{/if}
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Browser Mode Limits</h2>
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-3"
		>
			<p class="text-xs text-ink-muted dark:text-tavern-muted">
				Feature parity audit for browser mode versus Electron desktop behavior.
			</p>
			<div class="overflow-x-auto">
				<table class="w-full text-xs">
					<thead
						class="bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted"
					>
						<tr>
							<th class="text-left px-3 py-2 font-medium">Feature</th>
							<th class="text-left px-3 py-2 font-medium">Desktop</th>
							<th class="text-left px-3 py-2 font-medium">Browser</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border dark:divide-tavern-border">
						{#each browserModeGaps as gap (gap.feature)}
							<tr>
								<td class="px-3 py-2 font-medium text-ink dark:text-tavern-text">
									{gap.feature}
								</td>
								<td class="px-3 py-2 text-ink-muted dark:text-tavern-muted">
									{gap.electronBehavior}
								</td>
								<td class="px-3 py-2 text-ink-muted dark:text-tavern-muted">
									{gap.browserBehavior}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="text-xs text-ink-faint dark:text-tavern-faint">
				Web Notifications API status: {webNotificationsSupported
					? 'supported by this browser'
					: 'not supported by this browser'}.
			</p>
		</div>
	</section>
</div>
