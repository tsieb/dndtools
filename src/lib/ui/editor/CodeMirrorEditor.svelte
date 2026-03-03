<script lang="ts">
	import { onMount } from 'svelte';
	import type { EditorView as EditorViewType } from '@codemirror/view';
	import type { EditorSettings } from '$lib/types/settings.js';
	import {
		executeInlineTableSlashCommand,
		executeInlineRollSlashCommand,
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
		wikilinkHighlights?: Array<{ from: number; to: number; kind: 'unresolved' | 'ambiguous' }>;
	}

	let {
		content,
		onchange,
		onviewready,
		onscrollready,
		settings,
		wikilinkHighlights = [],
	}: Props = $props();

	let editorContainer: HTMLDivElement | undefined = $state();
	let view: EditorViewType | undefined;
	let mounted = $state(false);
	let applyWikilinkHighlights: (() => void) | null = null;

	onMount(() => {
		if (!editorContainer) return;

		let destroyed = false;

		(async () => {
			const [
				{ EditorView, keymap, Decoration },
				{ EditorState, StateEffect, StateField },
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
			const setWikilinkHighlightsEffect =
				StateEffect.define<Array<{ from: number; to: number; kind: 'unresolved' | 'ambiguous' }>>();
			const wikilinkHighlightField = StateField.define({
				create: () => Decoration.none,
				update: (decorations, transaction) => {
					let next = decorations.map(transaction.changes);
					for (const effect of transaction.effects) {
						if (!effect.is(setWikilinkHighlightsEffect)) continue;
						const marks = effect.value
							.filter(
								(range) =>
									range.from >= 0 &&
									range.to > range.from &&
									range.to <= transaction.state.doc.length,
							)
							.map((range) =>
								Decoration.mark({
									class:
										range.kind === 'unresolved'
											? 'cm-wikilink-unresolved'
											: 'cm-wikilink-ambiguous',
								}).range(range.from, range.to),
							);
						next = Decoration.set(marks, true);
					}
					return next;
				},
				provide: (field) => EditorView.decorations.from(field),
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
				{
					key: 'Enter',
					run: (v: EditorViewType) =>
						executeInlineTableSlashCommand(v) || executeInlineRollSlashCommand(v),
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
				'.cm-wikilink-unresolved': {
					backgroundColor: 'color-mix(in srgb, var(--color-warning) 16%, transparent)',
					textDecoration: 'underline',
					textDecorationStyle: 'wavy',
					textDecorationColor: 'var(--color-warning)',
				},
				'.cm-wikilink-ambiguous': {
					backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
					textDecoration: 'underline',
					textDecorationStyle: 'dotted',
					textDecorationColor: 'var(--color-accent)',
				},
			});

			function dispatchWikilinkHighlights(): void {
				if (!view) return;
				const docLength = view.state.doc.length;
				const safeRanges = (wikilinkHighlights ?? [])
					.map((range) => ({
						from: Math.max(0, Math.min(range.from, docLength)),
						to: Math.max(0, Math.min(range.to, docLength)),
						kind: range.kind,
					}))
					.filter((range) => range.to > range.from);
				view.dispatch({
					effects: setWikilinkHighlightsEffect.of(safeRanges),
				});
			}
			applyWikilinkHighlights = dispatchWikilinkHighlights;

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
						wikilinkHighlightField,
						theme,
					],
				}),
				parent: editorContainer,
			});
			dispatchWikilinkHighlights();

			mounted = true;
			onviewready?.(view);
			onscrollready?.(view.scrollDOM);
		})();

		return () => {
			destroyed = true;
			applyWikilinkHighlights = null;
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

	$effect(() => {
		if (!view || !mounted || !applyWikilinkHighlights) return;
		applyWikilinkHighlights();
	});
</script>

<div
	bind:this={editorContainer}
	class="min-h-[400px] w-full border border-border dark:border-tavern-border rounded-t-lg bg-surface dark:bg-tavern-surface overflow-hidden focus-within:border-accent/50 dark:focus-within:border-tavern-accent/50 transition-colors"
></div>
