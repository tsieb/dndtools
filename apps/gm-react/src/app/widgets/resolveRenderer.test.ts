import { describe, expect, it } from 'vitest';
import type { WidgetRenderEntrypoint } from '@dndtools/core';
import {
	resolveWidgetRenderer,
	widgetCrashPlaceholder,
	WIDGET_PLACEHOLDER_COPY,
	type ResolveRendererInput,
	type WidgetRendererCapabilities,
} from './resolveRenderer';

/**
 * RC-WID-1.1 — one test per branch of the render resolver, plus the rules that make the surface
 * safe: it never throws, and every unrenderable widget still reports `coreStateAvailable`.
 */

const BUILTIN_TYPES = new Set(['note', 'timer', 'map']);

function caps(overrides: Partial<WidgetRendererCapabilities> = {}): WidgetRendererCapabilities {
	return {
		hasBuiltinBody: (type) => BUILTIN_TYPES.has(type),
		hasTemplateRenderer: () => false,
		hasCustomHost: false,
		...overrides,
	};
}

function input(overrides: Partial<ResolveRendererInput> = {}): ResolveRendererInput {
	return {
		widgetType: 'note',
		status: 'available',
		statusNote: null,
		entrypoint: null,
		...overrides,
	};
}

const templateEntry = (template: WidgetRenderEntrypoint['template']): WidgetRenderEntrypoint => ({
	runtime: 'template',
	template,
	hostApiVersion: 1,
});

const customEntry: WidgetRenderEntrypoint = {
	runtime: 'custom-html-js',
	sandbox: 'iframe',
	assetPath: 'index.html',
	hostApiVersion: 1,
};

describe('resolveWidgetRenderer', () => {
	it('routes a declared builtin entrypoint to the builtin branch', () => {
		const plan = resolveWidgetRenderer(
			input({
				widgetType: 'map',
				entrypoint: { runtime: 'builtin', exportName: 'map', hostApiVersion: 1 },
			}),
			caps(),
		);
		expect(plan).toEqual({ kind: 'builtin', coreStateAvailable: true });
	});

	it('routes a template kind to the template branch once a renderer is registered', () => {
		const plan = resolveWidgetRenderer(
			input({ widgetType: 'timer', entrypoint: templateEntry('tracker') }),
			caps({ hasTemplateRenderer: (template) => template === 'tracker' }),
		);
		expect(plan).toEqual({ kind: 'template', template: 'tracker', coreStateAvailable: true });
	});

	it('falls back to the builtin body for a template widget whose renderer has not landed', () => {
		// Every shipped system widget except map/audio declares `runtime: 'template'` while its body
		// is still hand-written, so this fallback is what keeps the board drawing today.
		const plan = resolveWidgetRenderer(
			input({ widgetType: 'timer', entrypoint: templateEntry('tracker') }),
			caps(),
		);
		expect(plan.kind).toBe('builtin');
	});

	it('routes custom-html-js to the custom branch when the sandbox host is present', () => {
		const plan = resolveWidgetRenderer(
			input({ widgetType: 'torchlight', entrypoint: customEntry }),
			caps({ hasCustomHost: true }),
		);
		expect(plan).toEqual({ kind: 'custom', entrypoint: customEntry, coreStateAvailable: true });
	});

	it('placeholders a custom widget while there is no sandbox host, even with a builtin body of the same name', () => {
		const plan = resolveWidgetRenderer(
			input({ widgetType: 'note', entrypoint: customEntry }),
			caps(),
		);
		expect(plan).toEqual({
			kind: 'placeholder',
			diagnostic: WIDGET_PLACEHOLDER_COPY.customHostUnavailable,
			coreStateAvailable: true,
		});
	});

	it('placeholders a disabled package with its own reason, ahead of any entrypoint', () => {
		const plan = resolveWidgetRenderer(
			input({
				widgetType: 'note',
				status: 'disabled',
				statusNote: 'Widget package disabled',
				entrypoint: templateEntry('form-panel'),
			}),
			caps({ hasTemplateRenderer: () => true }),
		);
		expect(plan).toEqual({
			kind: 'placeholder',
			diagnostic: 'Widget package disabled',
			coreStateAvailable: true,
		});
	});

	it('uses the standard disabled copy when the board derived no reason', () => {
		const plan = resolveWidgetRenderer(input({ status: 'disabled' }), caps());
		expect(plan).toMatchObject({ diagnostic: WIDGET_PLACEHOLDER_COPY.packageDisabled });
	});

	it('keeps rendering the other non-available statuses, whose bodies explain the degradation', () => {
		for (const status of ['degraded', 'unbound', 'missing', 'conflicted', 'hidden'] as const) {
			expect(resolveWidgetRenderer(input({ status }), caps()).kind).toBe('builtin');
		}
	});

	it('placeholders an unknown template kind that has neither a renderer nor a builtin body', () => {
		const plan = resolveWidgetRenderer(
			input({ widgetType: 'party-loot', entrypoint: templateEntry('data-table') }),
			caps(),
		);
		expect(plan).toMatchObject({
			kind: 'placeholder',
			diagnostic: WIDGET_PLACEHOLDER_COPY.templateUnavailable,
		});
	});

	it('placeholders a widget with no entrypoint and no builtin body', () => {
		const plan = resolveWidgetRenderer(input({ widgetType: 'mystery' }), caps());
		expect(plan).toMatchObject({
			kind: 'placeholder',
			diagnostic: WIDGET_PLACEHOLDER_COPY.noRenderer,
		});
	});

	it('never throws on a malformed entrypoint', () => {
		const malformed = {
			runtime: 'not-a-runtime',
			hostApiVersion: 99,
		} as unknown as WidgetRenderEntrypoint;
		expect(() =>
			resolveWidgetRenderer(input({ widgetType: 'mystery', entrypoint: malformed }), caps()),
		).not.toThrow();
		expect(
			resolveWidgetRenderer(input({ widgetType: 'note', entrypoint: malformed }), caps()).kind,
		).toBe('builtin');
	});

	it('reports the crash placeholder as preserved core state', () => {
		const plan = widgetCrashPlaceholder('Timer body');
		expect(plan).toEqual({
			kind: 'placeholder',
			diagnostic: `${WIDGET_PLACEHOLDER_COPY.crashed} Timer body`,
			coreStateAvailable: true,
		});
	});

	it('marks every placeholder as preserved, so the copy above it stays true', () => {
		const plans = [
			resolveWidgetRenderer(input({ status: 'disabled' }), caps()),
			resolveWidgetRenderer(input({ widgetType: 'mystery' }), caps()),
			widgetCrashPlaceholder(),
		];
		for (const plan of plans) expect(plan.coreStateAvailable).toBe(true);
		expect(WIDGET_PLACEHOLDER_COPY.label).toBe('Disabled, preserved');
	});
});
