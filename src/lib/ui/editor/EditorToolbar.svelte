<script lang="ts">
	import type { EditorView } from '@codemirror/view';
	import { executeEditorAction } from '$lib/utils/editor-commands.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { desktopShellState } from '$lib/state/desktop-shell.svelte.js';

	interface Props {
		editorView: EditorView | null;
		density?: 'compact' | 'comfortable';
	}

	let { editorView, density = 'comfortable' }: Props = $props();
	let buttonSizeClass = $derived(density === 'compact' ? 'w-7 h-7 text-[11px]' : 'w-8 h-8');

	interface ToolbarAction {
		action: string;
		label: string;
		title: string;
		icon: string;
		class?: string;
	}

	const textGroup: ToolbarAction[] = [
		{ action: 'bold', label: 'B', title: 'Bold (Ctrl+B)', icon: '', class: 'font-bold' },
		{ action: 'italic', label: 'I', title: 'Italic (Ctrl+I)', icon: '', class: 'italic' },
		{
			action: 'strikethrough',
			label: 'S',
			title: 'Strikethrough',
			icon: '',
			class: 'line-through',
		},
		{ action: 'code', label: '`', title: 'Inline code (Ctrl+E)', icon: '', class: 'font-mono' },
	];

	const blockGroup: ToolbarAction[] = [
		{ action: 'heading2', label: 'H2', title: 'Heading 2', icon: '', class: 'font-bold text-xs' },
		{
			action: 'heading3',
			label: 'H3',
			title: 'Heading 3',
			icon: '',
			class: 'font-semibold text-xs',
		},
		{
			action: 'blockquote',
			label: '\u201C',
			title: 'Blockquote',
			icon: '',
			class: 'text-lg leading-none',
		},
		{
			action: 'code-block',
			label: '{}',
			title: 'Code block',
			icon: '',
			class: 'font-mono text-xs',
		},
	];

	const listGroup: ToolbarAction[] = [
		{
			action: 'bullet-list',
			label: '\u2022',
			title: 'Bullet list',
			icon: '',
			class: 'text-lg leading-none',
		},
		{
			action: 'numbered-list',
			label: '1.',
			title: 'Numbered list',
			icon: '',
			class: 'text-xs font-mono',
		},
		{ action: 'task-list', label: '\u2611', title: 'Task list', icon: '', class: 'text-sm' },
	];

	const insertGroup: ToolbarAction[] = [
		{ action: 'link', label: '\uD83D\uDD17', title: 'Link (Ctrl+K)', icon: '', class: 'text-sm' },
		{ action: 'wikilink', label: '[[]]', title: 'Wikilink', icon: '', class: 'font-mono text-xs' },
		{
			action: 'object-embed',
			label: 'EMB',
			title: 'Embed template',
			icon: '',
			class: 'font-mono text-[10px]',
		},
		{ action: 'table', label: '\u2637', title: 'Table', icon: '', class: 'text-sm' },
		{ action: 'horizontal-rule', label: '\u2015', title: 'Divider', icon: '', class: 'text-sm' },
	];

	function handleAction(action: string): void {
		if (!editorView) return;
		executeEditorAction(editorView, action);
		editorView.focus();
	}

	function toggleZenMode(): void {
		if (!layoutState.isExpanded) return;
		desktopShellState.setZenMode(!desktopShellState.zenMode);
	}
</script>

<div
	class="flex items-center gap-0.5 px-2 py-1.5 border border-border rounded-lg bg-surface mb-2 flex-wrap"
	role="toolbar"
	aria-label="Editor formatting"
>
	<!-- Text formatting -->
	{#each textGroup as act (act.action)}
		<button
			type="button"
			class="{buttonSizeClass} flex items-center justify-center rounded text-ink-muted hover:bg-accent-subtle hover:text-accent transition-[transform,colors] active:scale-[0.97] active:brightness-95 {act.class ??
				''}"
			title={act.title}
			aria-label={act.title}
			onclick={() => handleAction(act.action)}
			disabled={!editorView}
		>
			{act.label}
		</button>
	{/each}

	<div class="w-px h-5 bg-border mx-0.5"></div>

	<!-- Block formatting -->
	{#each blockGroup as act (act.action)}
		<button
			type="button"
			class="{buttonSizeClass} flex items-center justify-center rounded text-ink-muted hover:bg-accent-subtle hover:text-accent transition-[transform,colors] active:scale-[0.97] active:brightness-95 {act.class ??
				''}"
			title={act.title}
			aria-label={act.title}
			onclick={() => handleAction(act.action)}
			disabled={!editorView}
		>
			{act.label}
		</button>
	{/each}

	<div class="w-px h-5 bg-border mx-0.5"></div>

	<!-- Lists -->
	{#each listGroup as act (act.action)}
		<button
			type="button"
			class="{buttonSizeClass} flex items-center justify-center rounded text-ink-muted hover:bg-accent-subtle hover:text-accent transition-[transform,colors] active:scale-[0.97] active:brightness-95 {act.class ??
				''}"
			title={act.title}
			aria-label={act.title}
			onclick={() => handleAction(act.action)}
			disabled={!editorView}
		>
			{act.label}
		</button>
	{/each}

	<div class="w-px h-5 bg-border mx-0.5"></div>

	<!-- Insert -->
	{#each insertGroup as act (act.action)}
		<button
			type="button"
			class="{buttonSizeClass} flex items-center justify-center rounded text-ink-muted hover:bg-accent-subtle hover:text-accent transition-[transform,colors] active:scale-[0.97] active:brightness-95 {act.class ??
				''}"
			title={act.title}
			aria-label={act.title}
			onclick={() => handleAction(act.action)}
			disabled={!editorView}
		>
			{act.label}
		</button>
	{/each}

	{#if layoutState.isExpanded}
		<div class="w-px h-5 bg-border mx-0.5"></div>
		<button
			type="button"
			class="{buttonSizeClass} flex items-center justify-center rounded text-[10px] font-semibold uppercase tracking-wide text-ink-muted hover:bg-accent-subtle hover:text-accent transition-[transform,colors] active:scale-[0.97] active:brightness-95"
			title="Toggle Zen mode (F11)"
			aria-label="Toggle zen mode"
			aria-pressed={desktopShellState.zenMode}
			onclick={toggleZenMode}
		>
			Zen
		</button>
	{/if}
</div>
