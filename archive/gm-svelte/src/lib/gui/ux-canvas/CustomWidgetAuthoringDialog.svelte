<script lang="ts">
	import type { WidgetHostPermission, WidgetWizardDraft } from '@dndtools/core';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import {
		DEFAULT_CUSTOM_WIDGET_CSS,
		DEFAULT_CUSTOM_WIDGET_HTML,
		DEFAULT_CUSTOM_WIDGET_JS,
		buildCustomWidgetAuthoringDraft,
		composeCustomWidgetPreviewSrcdoc,
	} from './custom-widget-authoring';

	interface Props {
		open: boolean;
		idSuffix: string;
		oncreate: (draft: WidgetWizardDraft) => void | Promise<void>;
		onclose?: () => void;
	}

	let { open = $bindable(), idSuffix, oncreate, onclose }: Props = $props();

	let displayName = $state('Custom Widget');
	let description = $state('');
	let html = $state(DEFAULT_CUSTOM_WIDGET_HTML);
	let css = $state(DEFAULT_CUSTOM_WIDGET_CSS);
	let javascript = $state(DEFAULT_CUSTOM_WIDGET_JS);
	let accent = $state('#2563eb');
	let surface = $state('#101827');
	let text = $state('#f8fafc');
	let clipboard = $state(false);
	let network = $state(false);
	let externalLink = $state(false);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const hostPermissions = $derived.by<WidgetHostPermission[]>(() => {
		const permissions: WidgetHostPermission[] = [];
		if (clipboard) permissions.push('clipboard');
		if (network) permissions.push('network');
		if (externalLink) permissions.push('external-link');
		return permissions;
	});

	const draft = $derived(
		buildCustomWidgetAuthoringDraft({
			idSuffix: `${displayName}-${idSuffix}`,
			displayName,
			description,
			html,
			css,
			javascript,
			accent,
			surface,
			text,
			hostPermissions,
		}),
	);
	const previewSrcdoc = $derived(composeCustomWidgetPreviewSrcdoc({ html, css, javascript }));
	const review = $derived(draft.review);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (submitting) return;
		submitting = true;
		error = null;
		try {
			await oncreate(draft);
			open = false;
			onclose?.();
		} catch (reason) {
			error = reason instanceof Error ? reason.message : String(reason);
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog bind:open title="Create custom widget" testid="custom-widget-authoring" {onclose}>
	<form class="authoring" data-testid="custom-widget-form" onsubmit={submit}>
		<div class="main-grid">
			<section class="editor-column" aria-label="Widget source">
				<div class="field-row">
					<label>
						<span>Name</span>
						<input
							bind:value={displayName}
							data-testid="custom-widget-name"
							required
							autocomplete="off"
						/>
					</label>
					<label>
						<span>Summary</span>
						<input
							bind:value={description}
							data-testid="custom-widget-summary"
							autocomplete="off"
						/>
					</label>
				</div>

				<div class="token-row" aria-label="Style tokens">
					<label>
						<span>Accent</span>
						<input type="color" bind:value={accent} data-testid="custom-widget-accent" />
					</label>
					<label>
						<span>Surface</span>
						<input type="color" bind:value={surface} data-testid="custom-widget-surface" />
					</label>
					<label>
						<span>Text</span>
						<input type="color" bind:value={text} data-testid="custom-widget-text" />
					</label>
				</div>

				<div class="permission-row" aria-label="Host permissions">
					<label><input type="checkbox" bind:checked={clipboard} /> Clipboard</label>
					<label><input type="checkbox" bind:checked={network} /> Network</label>
					<label><input type="checkbox" bind:checked={externalLink} /> External links</label>
				</div>

				<label>
					<span>HTML</span>
					<textarea bind:value={html} data-testid="custom-widget-html" rows="7"></textarea>
				</label>
				<label>
					<span>CSS</span>
					<textarea bind:value={css} data-testid="custom-widget-css" rows="8"></textarea>
				</label>
				<label>
					<span>JavaScript</span>
					<textarea bind:value={javascript} data-testid="custom-widget-js" rows="7"></textarea>
				</label>
			</section>

			<section class="review-column" aria-label="Widget review">
				<div class="preview-frame">
					<iframe
						title="Custom widget preview"
						data-testid="custom-widget-preview"
						sandbox="allow-scripts"
						srcdoc={previewSrcdoc}
					></iframe>
				</div>
				<div class="review-block" data-testid="custom-widget-review">
					<div><strong>{review.trustRecommendation}</strong></div>
					<div class="meta">Widget type {draft.package.widgets[0]?.type}</div>
					<div class="meta">Style {review.requestedStyleCapabilities.join(', ')}</div>
					{#if review.requestedHostPermissions.length > 0}
						<div class="meta">Host {review.requestedHostPermissions.join(', ')}</div>
					{/if}
					{#if review.playerVisibleOutputs.length > 0}
						<div class="meta">Outputs {review.playerVisibleOutputs.length}</div>
					{/if}
					{#if review.diagnostics.length > 0}
						<ul>
							{#each review.diagnostics as diagnostic (diagnostic.id)}
								<li>{diagnostic.severity}: {diagnostic.message}</li>
							{/each}
						</ul>
					{/if}
				</div>
				{#if error}
					<p class="error" role="alert" data-testid="custom-widget-error">{error}</p>
				{/if}
			</section>
		</div>
		<div class="actions">
			<button type="button" class="button secondary" onclick={() => (open = false)}>
				Cancel
			</button>
			<button class="button" type="submit" data-testid="custom-widget-create" disabled={submitting}>
				{submitting ? 'Creating...' : 'Create widget'}
			</button>
		</div>
	</form>
</Dialog>

<style>
	.authoring {
		width: min(960px, 88vw);
	}
	.main-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
		gap: var(--space-3);
	}
	.editor-column,
	.review-column {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.field-row,
	.token-row,
	.permission-row,
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		min-width: 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.field-row label {
		flex: 1 1 220px;
	}
	.permission-row label {
		flex-direction: row;
		align-items: center;
		color: var(--color-text-primary);
	}
	input,
	textarea {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
	}
	input {
		min-height: var(--touch-target-min);
		padding: var(--space-1) var(--space-2);
	}
	input[type='color'] {
		width: 4.5rem;
		padding: var(--space-0-5);
	}
	textarea {
		min-height: 6rem;
		padding: var(--space-1);
		font:
			12px ui-monospace,
			SFMono-Regular,
			Menlo,
			Monaco,
			Consolas,
			monospace;
		resize: vertical;
	}
	.preview-frame {
		min-height: 260px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--color-surface-sunken);
	}
	iframe {
		display: block;
		width: 100%;
		height: 260px;
		border: 0;
		background: white;
	}
	.review-block {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
	}
	.review-block ul {
		margin: 0;
		padding-left: var(--space-3);
	}
	.actions {
		justify-content: flex-end;
		margin-top: var(--space-3);
	}
	.meta {
		margin: 0;
		color: var(--color-text-tertiary);
		font-size: var(--text-sm);
	}
	.error {
		color: var(--color-status-danger-text);
	}
	@media (max-width: 760px) {
		.authoring {
			width: min(92vw, 560px);
		}
		.main-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
