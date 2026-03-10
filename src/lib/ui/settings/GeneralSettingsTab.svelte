<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import ThemeToggle from '$lib/ui/common/ThemeToggle.svelte';
	import { editorPreferencesState } from '$lib/state/editor-preferences.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { ONBOARDING_STEPS } from '$lib/domain/onboarding.js';
	import { KEYBOARD_SHORTCUT_REGISTRY } from '$lib/domain/keyboard-shortcuts.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { settingsStorageState } from '$lib/state/settings-storage.svelte.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import { ui } from '$lib/state/ui.svelte.js';

	let templateCampaignName = $state('');
	let templateSessionNumber = $state(1);
	let templateCharacterNamesText = $state('');
	let savingTemplateContext = $state(false);

	let editorSettings = $derived(editorPreferencesState.settings);
	const shortcutRows = $derived(
		KEYBOARD_SHORTCUT_REGISTRY.map((entry) => ({
			shortcut: entry.shortcut,
			action: entry.label,
			id: entry.id,
		})),
	);

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

	async function updateAppearanceSettings(updates: {
		uiDensity?: 'standard' | 'compact';
		noteReadingWidth?: 'comfortable' | 'wide' | 'full';
	}): Promise<void> {
		if (updates.uiDensity) {
			await ui.setUiDensity(updates.uiDensity);
		}
		if (updates.noteReadingWidth) {
			await ui.setNoteReadingWidth(updates.noteReadingWidth);
		}
		toastState.success('Appearance preferences updated');
	}
</script>

<div
	role="tabpanel"
	id="settings-panel-general"
	aria-labelledby="settings-tab-general"
	class="space-y-8"
>
	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Appearance</h2>
		<div class="rounded-lg border border-border bg-surface divide-y divide-border">
			<div class="flex items-center justify-between p-4">
				<div>
					<p class="text-sm font-medium text-ink">Theme Preset</p>
					<p class="text-xs text-ink-muted mt-0.5">
						Parchment, Tavern, Scholar, Dungeon, or Auto (system light/dark)
					</p>
				</div>
				<ThemeToggle />
			</div>
			<div class="flex items-center justify-between gap-4 p-4">
				<div>
					<p class="text-sm font-medium text-ink">Density</p>
					<p class="text-xs text-ink-muted mt-0.5">
						Standard spacing or Compact for more visible content.
					</p>
				</div>
				<select
					class="rounded-md border border-border bg-surface-alt px-2.5 py-1.5 text-sm text-ink"
					value={ui.uiDensity}
					onchange={(event) =>
						updateAppearanceSettings({
							uiDensity: (event.currentTarget as HTMLSelectElement).value as 'standard' | 'compact',
						})}
				>
					<option value="standard">Standard</option>
					<option value="compact">Compact</option>
				</select>
			</div>
			<div class="flex items-center justify-between gap-4 p-4">
				<div>
					<p class="text-sm font-medium text-ink">Reading Width</p>
					<p class="text-xs text-ink-muted mt-0.5">Applies to prose notes in viewer and editor.</p>
				</div>
				<select
					class="rounded-md border border-border bg-surface-alt px-2.5 py-1.5 text-sm text-ink"
					value={ui.noteReadingWidth}
					onchange={(event) =>
						updateAppearanceSettings({
							noteReadingWidth: (event.currentTarget as HTMLSelectElement).value as
								| 'comfortable'
								| 'wide'
								| 'full',
						})}
				>
					<option value="comfortable">Comfortable (68ch)</option>
					<option value="wide">Wide (90ch)</option>
					<option value="full">Full Width</option>
				</select>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Editor Defaults (Vault)</h2>
		<div class="rounded-lg border border-border bg-surface p-4">
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<label class="text-xs text-ink-muted">
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
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					/>
				</label>
				<label class="text-xs text-ink-muted">
					Line Wrap
					<select
						value={String(editorSettings.wordWrap)}
						onchange={(event) =>
							updateEditorSettings({
								wordWrap: (event.currentTarget as HTMLSelectElement).value === 'true',
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					>
						<option value="true">Enabled</option>
						<option value="false">Disabled</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted">
					Vim Mode
					<select
						value={String(editorSettings.vimMode)}
						onchange={(event) =>
							updateEditorSettings({
								vimMode: (event.currentTarget as HTMLSelectElement).value === 'true',
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					>
						<option value="false">Disabled</option>
						<option value="true">Enabled</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted">
					Toolbar Density
					<select
						value={editorSettings.toolbarDensity}
						onchange={(event) =>
							updateEditorSettings({
								toolbarDensity: (event.currentTarget as HTMLSelectElement).value as
									| 'compact'
									| 'comfortable',
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					>
						<option value="comfortable">Comfortable</option>
						<option value="compact">Compact</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted">
					Split Pane
					<select
						value={String(editorSettings.splitPane)}
						onchange={(event) =>
							updateEditorSettings({
								splitPane: (event.currentTarget as HTMLSelectElement).value === 'true',
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					>
						<option value="true">Editor + Preview</option>
						<option value="false">Editor Only</option>
					</select>
				</label>
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Onboarding</h2>
		<div class="rounded-lg border border-border bg-surface p-4">
			<p class="text-sm text-ink font-medium">
				Checklist progress: {onboardingState.completedCount}/{ONBOARDING_STEPS.length}
			</p>
			<p class="text-xs text-ink-muted mt-1">
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
		<h2 class="text-lg font-semibold text-ink mb-4">Template Automation</h2>
		<div class="rounded-lg border border-border bg-surface p-4 space-y-3">
			<p class="text-xs text-ink-muted">
				Template variables use this context: <code>{'{{date_iso}}'}</code>,
				<code>{'{{campaign_name}}'}</code>, <code>{'{{session_number}}'}</code>, and
				<code>{'{{character_names_csv}}'}</code>.
			</p>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="text-xs text-ink-muted">
					Campaign Name
					<input
						type="text"
						bind:value={templateCampaignName}
						placeholder="Storm King's Thunder"
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					/>
				</label>
				<label class="text-xs text-ink-muted">
					Next Session Number
					<input
						type="number"
						min="1"
						step="1"
						bind:value={templateSessionNumber}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					/>
				</label>
			</div>
			<label class="text-xs text-ink-muted block">
				Character Names (comma-separated)
				<input
					type="text"
					bind:value={templateCharacterNamesText}
					placeholder="Aelar, Mira, Toren"
					class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
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
		<h2 class="text-lg font-semibold text-ink mb-4">Keyboard Shortcuts</h2>
		<div class="rounded-lg border border-border bg-surface overflow-hidden">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border bg-surface-alt">
						<th
							class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint"
							>Shortcut</th
						>
						<th
							class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint"
							>Action</th
						>
					</tr>
				</thead>
				<tbody>
					{#each shortcutRows as row (`${row.id}-${row.shortcut}`)}
						<tr class="border-b border-border last:border-0">
							<td class="px-4 py-2.5">
								<kbd
									class="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-alt border border-border text-accent"
									>{row.shortcut}</kbd
								>
							</td>
							<td class="px-4 py-2.5 text-ink">{row.action}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
