<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import ThemeToggle from '$lib/ui/common/ThemeToggle.svelte';
	import { editorPreferencesState } from '$lib/state/editor-preferences.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { ONBOARDING_STEPS } from '$lib/domain/onboarding.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { settingsStorageState } from '$lib/state/settings-storage.svelte.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';

	let templateCampaignName = $state('');
	let templateSessionNumber = $state(1);
	let templateCharacterNamesText = $state('');
	let savingTemplateContext = $state(false);

	let editorSettings = $derived(editorPreferencesState.settings);

	onMount(() => {
		void loadTemplateContextSettings();
	});

	async function loadTemplateContextSettings(): Promise<void> {
		try {
			const templateContext = await settingsStorageState.getTemplateContext();
			templateCampaignName = templateContext.campaignName;
			templateSessionNumber = templateContext.sessionNumber;
			templateCharacterNamesText = templateContext.characterNames.join(', ');
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_LOAD_TEMPLATE_CONTEXT_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to load template settings: ${String(error)}`);
		}
	}

	async function saveTemplateContextSettings(): Promise<void> {
		savingTemplateContext = true;
		try {
			const characterNames = templateCharacterNamesText
				.split(',')
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0);
			const sessionNumber = Math.max(1, Math.round(templateSessionNumber || 1));
			await settingsStorageState.saveTemplateContext({
				campaignName: templateCampaignName.trim(),
				sessionNumber,
				characterNames,
			});
			templateSessionNumber = sessionNumber;
			templateCharacterNamesText = characterNames.join(', ');
			toastState.success('Template context saved');
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_SAVE_TEMPLATE_CONTEXT_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to save template settings: ${String(error)}`);
		} finally {
			savingTemplateContext = false;
		}
	}

	async function updateEditorSettings(
		updates: Partial<typeof editorPreferencesState.settings>,
	): Promise<void> {
		await editorPreferencesState.update(updates);
		toastState.success('Editor defaults updated');
	}
</script>

<div
	role="tabpanel"
	id="settings-panel-general"
	aria-labelledby="settings-tab-general"
	class="space-y-8"
>
	<section>
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Appearance</h2>
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface divide-y divide-border dark:divide-tavern-border"
		>
			<div class="flex items-center justify-between p-4">
				<div>
					<p class="text-sm font-medium text-ink dark:text-tavern-text">Theme</p>
					<p class="text-xs text-ink-muted dark:text-tavern-muted mt-0.5">
						Choose light, dark, or follow system
					</p>
				</div>
				<ThemeToggle />
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">
			Editor Defaults (Vault)
		</h2>
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4"
		>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Font Size
					<input
						type="number"
						min="12"
						max="24"
						value={editorSettings.fontSize}
						onchange={(event) =>
							updateEditorSettings({
								fontSize: Number((event.currentTarget as HTMLInputElement).value),
							})}
						class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
					/>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Line Wrap
					<select
						value={String(editorSettings.wordWrap)}
						onchange={(event) =>
							updateEditorSettings({
								wordWrap: (event.currentTarget as HTMLSelectElement).value === 'true',
							})}
						class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
					>
						<option value="true">Enabled</option>
						<option value="false">Disabled</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Vim Mode
					<select
						value={String(editorSettings.vimMode)}
						onchange={(event) =>
							updateEditorSettings({
								vimMode: (event.currentTarget as HTMLSelectElement).value === 'true',
							})}
						class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
					>
						<option value="false">Disabled</option>
						<option value="true">Enabled</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Toolbar Density
					<select
						value={editorSettings.toolbarDensity}
						onchange={(event) =>
							updateEditorSettings({
								toolbarDensity: (event.currentTarget as HTMLSelectElement).value as
									| 'compact'
									| 'comfortable',
							})}
						class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
					>
						<option value="comfortable">Comfortable</option>
						<option value="compact">Compact</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Split Pane
					<select
						value={String(editorSettings.splitPane)}
						onchange={(event) =>
							updateEditorSettings({
								splitPane: (event.currentTarget as HTMLSelectElement).value === 'true',
							})}
						class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
					>
						<option value="true">Editor + Preview</option>
						<option value="false">Editor Only</option>
					</select>
				</label>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Onboarding</h2>
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4"
		>
			<p class="text-sm text-ink dark:text-tavern-text font-medium">
				Checklist progress: {onboardingState.completedCount}/{ONBOARDING_STEPS.length}
			</p>
			<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1">
				Use these controls to reopen or reset first-run guidance.
			</p>
			<div class="mt-3 flex items-center gap-2">
				<Button variant="secondary" size="sm" onclick={() => onboardingState.reopenChecklist()}>
					Reopen Checklist
				</Button>
				<Button variant="ghost" size="sm" onclick={() => onboardingState.reset()}>
					Reset Onboarding
				</Button>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Template Automation</h2>
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-3"
		>
			<p class="text-xs text-ink-muted dark:text-tavern-muted">
				Template variables use this context: <code>{'{{date_iso}}'}</code>,
				<code>{'{{campaign_name}}'}</code>, <code>{'{{session_number}}'}</code>, and
				<code>{'{{character_names_csv}}'}</code>.
			</p>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Campaign Name
					<input
						type="text"
						bind:value={templateCampaignName}
						placeholder="Storm King's Thunder"
						class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
					/>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Next Session Number
					<input
						type="number"
						min="1"
						step="1"
						bind:value={templateSessionNumber}
						class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
					/>
				</label>
			</div>
			<label class="text-xs text-ink-muted dark:text-tavern-muted block">
				Character Names (comma-separated)
				<input
					type="text"
					bind:value={templateCharacterNamesText}
					placeholder="Aelar, Mira, Toren"
					class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
				/>
			</label>
			<div class="flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					onclick={saveTemplateContextSettings}
					loading={savingTemplateContext}
				>
					{savingTemplateContext ? 'Saving...' : 'Save Template Context'}
				</Button>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Keyboard Shortcuts</h2>
		<div
			class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface overflow-hidden"
		>
			<table class="w-full text-sm">
				<thead>
					<tr
						class="border-b border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt"
					>
						<th
							class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
							>Shortcut</th
						>
						<th
							class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
							>Action</th
						>
					</tr>
				</thead>
				<tbody>
					{#each [['Ctrl+N', 'Create new note'], ['Ctrl+O', 'Open vault folder'], ['Ctrl+P', 'Command palette'], ['Ctrl+D', 'Open dice tray'], ['Ctrl+Shift+C', 'Open combat tracker'], ['Ctrl+Shift+S', 'Open session boards'], ['Ctrl+Shift+E', 'Export markdown archive'], ['Ctrl+Shift+L', 'Toggle dark mode'], ['Ctrl+/', 'Open keyboard shortcuts'], ['Ctrl+Shift+Space', 'Quick reference HUD'], ['Ctrl+B', 'Toggle local navigation / Bold (in editor)'], ['Ctrl+Shift+R', 'Toggle contextual detail panel'], ['F11', 'Toggle Zen mode'], ['Ctrl+Shift+F', 'Global search'], ['Ctrl+S', 'Save note (in editor)'], ['Ctrl+I', 'Italic (in editor)'], ['Ctrl+E', 'Inline code (in editor)'], ['Ctrl+K', 'Insert link (in editor)'], ['Ctrl+Z', 'Undo (in editor)'], ['Ctrl+Shift+Z', 'Redo (in editor)']] as [shortcut, action] (shortcut)}
						<tr class="border-b border-border dark:border-tavern-border last:border-0">
							<td class="px-4 py-2.5">
								<kbd
									class="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-alt dark:bg-tavern-surface-alt border border-border dark:border-tavern-border text-accent dark:text-tavern-accent"
									>{shortcut}</kbd
								>
							</td>
							<td class="px-4 py-2.5 text-ink dark:text-tavern-text">{action}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
