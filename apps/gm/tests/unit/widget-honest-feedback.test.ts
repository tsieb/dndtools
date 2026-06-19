// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { WidgetDefinition } from '@dndtools/core';
import AudioWidget from '../../src/lib/gui/ux-canvas/widgets/AudioWidget.svelte';
import TemplateActionPanel from '../../src/lib/gui/ux-canvas/widgets/templates/TemplateActionPanel.svelte';

// Both renderers ignore `definition` (they read only `config`/`onCommand`), so a minimal cast keeps
// the required-prop contract satisfied without coupling the test to a specific system widget.
const def = { displayName: 'Test' } as unknown as WidgetDefinition;

// These two renderers need no runtime context, so they render directly via Svelte SSR. The
// data-table / chart / custom-frame templates depend on `useRuntime()` and are covered by typecheck
// + e2e instead (see the fix report's "not unit-covered" note).

describe('AudioWidget — honest read-only status (A4)', () => {
	it('renders a read-only status glance, no fake play/pause toggle or playing animation', () => {
		const body = render(AudioWidget, { props: { definition: def, config: { loop: true } } }).body;
		// The on-canvas widget controls no playback, so it must not present a pressable toggle…
		expect(body).not.toContain('aria-pressed');
		// …nor an equalizer that animates as if sound is playing.
		expect(body).not.toContain('data-playing');
		expect(body).not.toContain('audio-viz');
		// The status + launch testids are preserved (DOM contract).
		expect(body).toContain('data-testid="widget-audio-toggle"');
		expect(body).toContain('data-testid="widget-audio-launch"');
		// Copy describes configuration + where playback actually happens — not a live "playing" state.
		expect(body).toContain('Set to loop');
		expect(body).toContain('session audio tools');
	});

	it('reflects the play-once configuration honestly', () => {
		const body = render(AudioWidget, { props: { definition: def, config: { loop: false } } }).body;
		expect(body).toContain('Set to play once');
	});
});

describe('TemplateActionPanel — consistent button emphasis (A8)', () => {
	it('has exactly one filled primary action (Roll); quick-rolls are the secondary grammar', () => {
		const body = render(TemplateActionPanel, { props: { definition: def, config: { formulas: 'd20,2d6' } } }).body;
		// Quick-roll chips render with their per-formula testids.
		expect(body).toContain('data-testid="widget-roll-d20"');
		expect(body).toContain('data-testid="widget-roll-2d6"');
		// Exactly one element carries the primary-action class (the freeform "Roll" submit).
		const primaryCount = body.split('tpl-primary-action').length - 1;
		expect(primaryCount).toBe(1);
	});

	it('disables actions when no command dispatcher is wired (read-only context)', () => {
		const body = render(TemplateActionPanel, { props: { definition: def, config: { formulas: 'd20' } } }).body;
		expect(body).toContain('disabled');
	});
});
