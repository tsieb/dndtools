<script lang="ts">
	import { onMount } from 'svelte';
	import type { EditorView as EditorViewType } from '@codemirror/view';

	interface Props {
		content: string;
		onchange: (value: string) => void;
	}

	let { content, onchange }: Props = $props();

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
				{ defaultKeymap, history, historyKeymap },
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

			const theme = EditorView.theme({
				'&': {
					fontSize: '16px',
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
				},
				'.cm-content': {
					fontFamily: 'inherit',
					lineHeight: '1.6',
					padding: '0.5rem 0',
				},
				'.cm-focused .cm-cursor': {
					borderLeftColor: 'var(--color-accent, #8b4513)',
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
						EditorView.lineWrapping,
						keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
						updateListener,
						theme,
					],
				}),
				parent: editorContainer,
			});

			mounted = true;
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
	class="min-h-[400px] w-full border border-border dark:border-tavern-border rounded-lg bg-surface dark:bg-tavern-surface overflow-hidden"
></div>
