<script lang="ts">
	import { previewBannerModel, type ResolvedPreview } from '@dndtools/core';

	/**
	 * UX-PERM-006 — the persistent, unmistakable preview-mode banner: fixed at the top of the full
	 * viewport (above all content, below modal dialogs), amber, with the previewed role/player name,
	 * the read-only statement, and an always-visible "Exit preview" button. `role="status"` +
	 * `aria-live="assertive"` announces entry; `aria-keyshortcuts` documents `Shift+Escape`.
	 * The shell compensates for the overlap with top padding while the banner is mounted.
	 */
	interface Props {
		preview: ResolvedPreview;
		onexit: () => void;
	}

	let { preview, onexit }: Props = $props();

	const model = $derived(previewBannerModel(preview));
</script>

<div
	class="preview-mode-banner"
	role="status"
	aria-live="assertive"
	aria-keyshortcuts={model.ariaKeyShortcuts}
	data-testid="preview-mode-banner"
	data-preview-role={preview.role}
>
	<span class="preview-mode-text">
		<strong data-testid="preview-mode-title">{model.title}</strong>
		<span class="preview-mode-subtitle"> — {model.subtitle}</span>
	</span>
	<button
		type="button"
		class="preview-mode-exit"
		data-testid="preview-mode-exit"
		data-preview-safe
		onclick={onexit}
	>
		{model.exitLabel}
	</button>
</div>

<style>
	/* Amber warning banner, viewport-fixed; z above content/sticky chrome, below modals (--z-modal). */
	.preview-mode-banner {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: var(--z-overlay);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 48px;
		padding: var(--space-1) var(--space-3);
		background: var(--color-status-warning-subtle);
		border-bottom: 2px solid var(--color-status-warning);
		color: var(--color-status-warning-text);
	}
	.preview-mode-text {
		flex: 1;
		font-size: var(--text-sm);
	}
	.preview-mode-subtitle {
		color: var(--color-text-secondary);
	}
	/* "Exit preview": primary-weight button that is always visible, never scrolled away. */
	.preview-mode-exit {
		min-height: 32px;
		padding: 0 var(--space-3);
		border: 1px solid var(--color-status-warning);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
	}
	:global(html[data-input-modality='touch']) .preview-mode-exit {
		min-height: var(--touch-target-min);
	}
	/* Compact profiles: slightly tighter banner (UX-PERM-006 §platform profiles). */
	@media (max-width: 640px) {
		.preview-mode-banner {
			min-height: 44px;
			padding: var(--space-1) var(--space-2);
		}
	}
</style>
