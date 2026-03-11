<script lang="ts">
	import ThemeToggle from '$lib/ui/common/ThemeToggle.svelte';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';

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
	id="settings-panel-appearance"
	aria-labelledby="settings-tab-appearance"
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
					aria-label="UI density"
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
					aria-label="Note reading width"
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
</div>
