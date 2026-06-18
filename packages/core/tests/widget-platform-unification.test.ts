import { describe, expect, it } from 'vitest';
import { listWidgetLibrary, resolveAddWidgetCommand } from '../src/queries/widget-library';
import {
	createSystemWidgetPackages,
	findWidgetDefinition,
	isWidgetLibraryListed,
	readStyleTokenOverrides,
	resolveWidgetConfig,
	resolveWidgetStyleVariables,
	widgetSurfaces,
	widgetSupportsSurface,
	type WidgetDefinition,
} from '../src/state/widget-package-state';
import { widgetPackageDefinitionSchema } from '../src/schemas/widget-package';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState } from '../src/testing/fixtures';

const SYSTEM = createSystemWidgetPackages();

function def(type: string): WidgetDefinition {
	const d = findWidgetDefinition(SYSTEM, type);
	if (!d) throw new Error(`missing widget definition ${type}`);
	return d;
}

describe('system widget platform — definitions', () => {
	it('ships both the scene and command-center system packages', () => {
		expect(SYSTEM.packages['system.scene-widgets']).toBeDefined();
		expect(SYSTEM.packages['system.command-center-widgets']).toBeDefined();
	});

	it('gives every system scene widget a render entrypoint, style tokens, and placement', () => {
		for (const type of ['note', 'dice', 'timer', 'initiative-tracker', 'character', 'map', 'audio']) {
			const widget = def(type);
			expect(widget.renderEntrypoint).toBeDefined();
			expect(widget.style?.tokens?.length ?? 0).toBeGreaterThan(0);
			expect(widgetSupportsSurface(widget, 'scene')).toBe(true);
			expect(isWidgetLibraryListed(widget)).toBe(true);
		}
	});

	it('ships only functional default style tokens (accent + text, no dead surface picker)', () => {
		// `--widget-surface` is consumed by NOTHING for host-scoped system widgets (only the iframe
		// custom-widget runtime reads it), so a surface token would render a no-op picker. B10 removes it.
		const tokenNames = (def('note').style?.tokens ?? []).map((t) => t.name);
		expect(tokenNames).toEqual(['accent', 'text']);
		expect(tokenNames).not.toContain('surface');
	});

	it('scopes command-center widgets to the command-center surface and hides them from the library', () => {
		for (const type of ['data-hub', 'combat', 'notes', 'characters', 'atlas', 'session', 'tools']) {
			const widget = def(type);
			expect(widgetSurfaces(widget)).toEqual(['command-center']);
			expect(isWidgetLibraryListed(widget)).toBe(false);
			expect(widget.renderEntrypoint?.runtime).toBe('builtin');
			expect(widget.renderEntrypoint?.exportName).toBe(type);
		}
	});

	it('defaults placement to a listed scene widget when absent (back-compat)', () => {
		const bare = { placement: undefined } as Pick<WidgetDefinition, 'placement'>;
		expect(widgetSurfaces(bare)).toEqual(['scene']);
		expect(isWidgetLibraryListed(bare)).toBe(true);
	});
});

describe('widget customization helpers', () => {
	it('merges configField defaults under instance configuration', () => {
		const combat = def('combat');
		expect(resolveWidgetConfig(combat, {})).toMatchObject({ showChallenge: true });
		expect(resolveWidgetConfig(combat, { showChallenge: false })).toMatchObject({
			showChallenge: false,
		});
	});

	it('resolves style tokens to --widget-* CSS variables with per-instance overrides', () => {
		const note = def('note');
		const base = resolveWidgetStyleVariables(note, {});
		expect(base['--widget-accent']).toBe('var(--color-accent)');
		const overridden = resolveWidgetStyleVariables(note, {
			styleTokens: { accent: '#ff0000' },
		});
		expect(overridden['--widget-accent']).toBe('#ff0000');
	});
});

describe('widget library surface scoping (CMD-005)', () => {
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);

	it('lists scene widgets with real types and excludes command-center widgets', () => {
		const entries = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
		});
		const types = entries.map((e) => e.type);
		// Real, definition-backed types (the former initiative/ambience/reference mismatch is gone).
		expect(types).toContain('initiative-tracker');
		expect(types).toContain('audio');
		expect(types).toContain('quick-reference');
		// Command Center widgets never appear in the add-to-scene library.
		for (const cc of ['data-hub', 'combat', 'notes', 'characters', 'atlas', 'session']) {
			expect(types).not.toContain(cc);
		}
	});

	it('seeds a placed widget with its config defaults', () => {
		const entries = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
			filter: 'character',
		});
		const entry = entries.find((e) => e.type === 'character');
		expect(entry).toBeDefined();
		const command = resolveAddWidgetCommand(entry!, 'scene-1');
		expect(command?.payload.widget.configuration).toMatchObject({ showAbilities: true });
	});
});

describe('widget package schema', () => {
	it('accepts the new builtin runtime + placement + configFields fields', () => {
		const parsed = widgetPackageDefinitionSchema.safeParse({
			id: 'workspace.x',
			version: '1.0.0',
			displayName: 'X',
			widgets: [
				{
					type: 'x',
					version: '1.0.0',
					displayName: 'X',
					author: 'workspace',
					placement: { surfaces: ['command-center'], libraryListed: false },
					configFields: [
						{ key: 'count', label: 'Count', control: 'number', group: 'content', default: 3 },
					],
					renderEntrypoint: { runtime: 'builtin', exportName: 'x', hostApiVersion: 1 },
					supportedProfiles: ['desktop'],
					defaultSize: { width: 100, height: 100 },
					minSize: { width: 50, height: 50 },
					resizePolicy: 'free',
					requiredBindings: [],
					optionalBindings: [],
					configurationSchema: { type: 'object', additionalProperties: true },
					capabilitySets: ['viewer'],
					commands: [],
					events: [],
					hostPermissions: [],
				},
			],
		});
		expect(parsed.success).toBe(true);
	});
});

// All system widget types (scene + command-center), enumerated off the live packages so this stays
// in sync if a widget is added/removed — every one must carry the same functional default style.
const ALL_SYSTEM_WIDGET_TYPES = Object.values(SYSTEM.packages).flatMap((record) =>
	record.package.widgets.map((widget) => widget.type),
);

describe('default widget style — exactly accent + text, never a dead surface knob (B10)', () => {
	it('ships accent + text (and only those) for EVERY system widget on both surfaces', () => {
		expect(ALL_SYSTEM_WIDGET_TYPES.length).toBeGreaterThan(10);
		for (const type of ALL_SYSTEM_WIDGET_TYPES) {
			const tokens = def(type).style?.tokens ?? [];
			const names = tokens.map((t) => t.name);
			expect(names, `${type} style tokens`).toEqual(['accent', 'text']);
			// `--widget-surface` is consumed only by the iframe custom-widget runtime, so a surface token
			// on a host-scoped system widget would render a no-op picker — it must never reappear.
			expect(names, `${type} must not declare a dead surface token`).not.toContain('surface');
		}
	});

	it('tracks the app theme by default (token values are theme CSS vars, not literal colors)', () => {
		const tokens = def('note').style?.tokens ?? [];
		expect(tokens.find((t) => t.name === 'accent')?.value).toBe('var(--color-accent)');
		expect(tokens.find((t) => t.name === 'text')?.value).toBe('var(--color-text-primary)');
	});
});

describe('resolveWidgetConfig — config-field defaults merged under the instance', () => {
	const definition = {
		configFields: [
			{ key: 'count', label: 'Count', control: 'number', default: 8 },
			{ key: 'loop', label: 'Loop', control: 'toggle', default: true },
			{ key: 'mode', label: 'Mode', control: 'text' }, // no default ⇒ contributes no key
		],
	} as unknown as WidgetDefinition;

	it('returns only the fields with declared defaults for an empty instance config', () => {
		expect(resolveWidgetConfig(definition, {})).toEqual({ count: 8, loop: true });
	});

	it('null / undefined configuration falls back to the defaults', () => {
		expect(resolveWidgetConfig(definition, null)).toEqual({ count: 8, loop: true });
		expect(resolveWidgetConfig(definition, undefined)).toEqual({ count: 8, loop: true });
	});

	it('lets the instance value win over the default, including falsy overrides', () => {
		expect(resolveWidgetConfig(definition, { count: 3, loop: false })).toEqual({
			count: 3,
			loop: false,
		});
	});

	it('ignores an explicit `undefined` instance value (keeps the default, never writes undefined)', () => {
		const resolved = resolveWidgetConfig(definition, { count: undefined });
		expect(resolved.count).toBe(8);
		expect('count' in resolved).toBe(true);
	});

	it('passes reserved / extra keys through untouched (visibility, rotation, styleTokens)', () => {
		const resolved = resolveWidgetConfig(definition, {
			visibility: 'dm-only',
			rotation: 90,
			styleTokens: { accent: '#fff' },
		});
		expect(resolved).toMatchObject({
			count: 8,
			loop: true,
			visibility: 'dm-only',
			rotation: 90,
			styleTokens: { accent: '#fff' },
		});
	});

	it('returns an empty object for a definition with no config fields', () => {
		expect(resolveWidgetConfig({} as WidgetDefinition, {})).toEqual({});
	});
});

describe('resolveWidgetStyleVariables — prefixing, cssVariables, and per-instance overrides', () => {
	const definition = {
		style: {
			isolation: 'host-scoped',
			tokens: [
				{ name: 'accent', value: 'var(--color-accent)' },
				{ name: 'text', value: 'var(--color-text-primary)' },
			],
			cssVariables: { '--widget-radius': '8px' },
		},
	} as unknown as WidgetDefinition;

	it('exposes each declared token as a prefixed --widget-<name> variable plus raw cssVariables', () => {
		const vars = resolveWidgetStyleVariables(definition, {});
		expect(vars['--widget-accent']).toBe('var(--color-accent)');
		expect(vars['--widget-text']).toBe('var(--color-text-primary)');
		// cssVariables are passed through verbatim (already fully-qualified, not re-prefixed).
		expect(vars['--widget-radius']).toBe('8px');
	});

	it('applies a per-instance override (prefixed) over the declared token', () => {
		const vars = resolveWidgetStyleVariables(definition, { styleTokens: { accent: '#ff0000' } });
		expect(vars['--widget-accent']).toBe('#ff0000');
		expect(vars['--widget-text']).toBe('var(--color-text-primary)'); // untouched
	});

	it('DROPS an empty / whitespace-only override so the token reverts to the theme default', () => {
		const empty = resolveWidgetStyleVariables(definition, { styleTokens: { accent: '' } });
		expect(empty['--widget-accent']).toBe('var(--color-accent)');
		const blank = resolveWidgetStyleVariables(definition, { styleTokens: { accent: '   ' } });
		expect(blank['--widget-accent']).toBe('var(--color-accent)');
	});

	it('ignores a non-string override value (never writes a bogus CSS var)', () => {
		const vars = resolveWidgetStyleVariables(definition, {
			styleTokens: { accent: 123 as unknown as string },
		});
		expect(vars['--widget-accent']).toBe('var(--color-accent)');
	});

	it('returns no variables for a definition with no style block', () => {
		expect(resolveWidgetStyleVariables({} as WidgetDefinition, {})).toEqual({});
	});
});

describe('readStyleTokenOverrides — the raw override map the customize surfaces edit', () => {
	it('extracts only string values stored under configuration.styleTokens', () => {
		expect(
			readStyleTokenOverrides({ styleTokens: { accent: '#fff', text: '', n: 5, ok: '#000' } }),
		).toEqual({ accent: '#fff', text: '', ok: '#000' });
	});

	it('returns an empty map when styleTokens is missing or not an object', () => {
		expect(readStyleTokenOverrides({})).toEqual({});
		expect(readStyleTokenOverrides(null)).toEqual({});
		expect(readStyleTokenOverrides({ styleTokens: 'nope' })).toEqual({});
	});

	it('round-trips with resolveWidgetStyleVariables (non-empty overrides win, empties drop)', () => {
		const definition = {
			style: { isolation: 'host-scoped', tokens: [{ name: 'accent', value: 'var(--color-accent)' }] },
		} as unknown as WidgetDefinition;
		const overrides = readStyleTokenOverrides({ styleTokens: { accent: '#abcabc', text: '' } });
		const vars = resolveWidgetStyleVariables(definition, { styleTokens: overrides });
		expect(vars['--widget-accent']).toBe('#abcabc');
	});
});
