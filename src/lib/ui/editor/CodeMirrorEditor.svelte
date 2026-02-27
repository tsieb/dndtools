<script lang="ts">
	import { onMount } from 'svelte';
	import type { EditorView as EditorViewType } from '@codemirror/view';
	import type { EditorSettings } from '$lib/types/settings.js';
	import {
		toggleBold,
		toggleItalic,
		toggleInlineCode,
		insertLink,
	} from '$lib/utils/editor-commands.js';

	interface Props {
		content: string;
		onchange: (value: string) => void;
		onviewready?: (view: EditorViewType) => void;
		onscrollready?: (element: HTMLElement) => void;
		settings?: EditorSettings;
	}

	let { content, onchange, onviewready, onscrollready, settings }: Props = $props();

	let editorContainer: HTMLDivElement | undefined = $state();
	let view: EditorViewType | undefined;
	let mounted = $state(false);

	onMount(() => {
		if (!editorContainer) return;

		let destroyed = false;

		(async () => {
			const [
				{ EditorView, keymap },
				{ EditorState },
				{ markdown, markdownLanguage },
				{ defaultKeymap, history, historyKeymap, undo, redo },
				{ syntaxHighlighting, defaultHighlightStyle, indentOnInput },
				{ closeBrackets, closeBracketsKeymap },
			] = await Promise.all([
				import('@codemirror/view'),
				import('@codemirror/state'),
				import('@codemirror/lang-markdown'),
				import('@codemirror/commands'),
				import('@codemirror/language'),
				import('@codemirror/autocomplete'),
			]);

			if (destroyed) return;

			const updateListener = EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					onchange(update.state.doc.toString());
				}
			});

			// Formatting keyboard shortcuts
			const formattingKeymap = keymap.of([
				{
					key: 'Mod-b',
					run: (v: EditorViewType) => toggleBold(v),
				},
				{
					key: 'Mod-i',
					run: (v: EditorViewType) => toggleItalic(v),
				},
				{
					key: 'Mod-e',
					run: (v: EditorViewType) => toggleInlineCode(v),
				},
				{
					key: 'Mod-k',
					run: (v: EditorViewType) => insertLink(v),
				},
				{
					key: 'Mod-z',
					run: (v: EditorViewType) => undo({ state: v.state, dispatch: v.dispatch }),
				},
				{
					key: 'Mod-Shift-z',
					run: (v: EditorViewType) => redo({ state: v.state, dispatch: v.dispatch }),
				},
			]);

			const theme = EditorView.theme({
				'&': {
					fontSize: `${settings?.fontSize ?? 16}px`,
					fontFamily: 'var(--font-sans)',
				},
				'.cm-content': {
					fontFamily: 'inherit',
					lineHeight: String(settings?.lineHeight ?? 1.6),
					padding: '0.75rem 0',
				},
				'.cm-focused .cm-cursor': {
					borderLeftColor: 'var(--color-accent, #8b4513)',
					borderLeftWidth: '2px',
				},
				'.cm-focused .cm-selectionBackground, ::selection': {
					backgroundColor: 'var(--color-accent-subtle, #f0e6d8) !important',
				},
				'.cm-gutters': {
					display: 'none',
				},
				'.cm-scroller': {
					overflow: 'auto',
				},
				'&.cm-focused': {
					outline: 'none',
				},
				'.cm-activeLine': {
					backgroundColor: 'var(--color-surface-alt, #f5f0e8)',
					borderRadius: '2px',
				},
				'.cm-line': {
					padding: '1px 0.5rem',
				},
			});

			view = new EditorView({
				state: EditorState.create({
					doc: content,
					extensions: [
						markdown({ base: markdownLanguage }),
						syntaxHighlighting(defaultHighlightStyle),
						history(),
						indentOnInput(),
						closeBrackets(),
						...(settings?.wordWrap === false ? [] : [EditorView.lineWrapping]),
						formattingKeymap,
						keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
						updateListener,
						theme,
					],
				}),
				parent: editorContainer,
			});

			mounted = true;
			onviewready?.(view);
			onscrollready?.(view.scrollDOM);
		})();

		return () => {
			destroyed = true;
			view?.destroy();
		};
	});

	// Sync external content changes (e.g. loading a different note)
	$effect(() => {
		if (view && mounted && content !== view.state.doc.toString()) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: content },
			});
		}
	});
</script>

<div
	bind:this={editorContainer}
	class="min-h-[400px] w-full border border-border dark:border-tavern-border rounded-t-lg bg-surface dark:bg-tavern-surface overflow-hidden focus-within:border-accent/50 dark:focus-within:border-tavern-accent/50 transition-colors"
></div>
