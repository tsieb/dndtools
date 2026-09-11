import { describe, expect, it } from 'vitest';
import type { WidgetDefinition } from '@dndtools/core';
import { collectSandboxThemeVariables } from './SandboxHost';
import { FORWARDED_THEME_TOKENS } from './hostBridge';
import { SEMANTIC_TOKEN_VALUES } from '../widgetBuilder/vocabulary';

const definition = (capabilities: string[]) =>
	({
		type: 'theme-probe',
		style: { isolation: 'iframe-document', capabilities },
	}) as unknown as WidgetDefinition;

const read = (token: string) => `value-for${token}`;

describe('SandboxHost theme variables (RC-WID-2.4)', () => {
	it('forwards every semantic token the Style step offers, not only the bridge list', () => {
		const forwarded = collectSandboxThemeVariables(definition(['host-theme-tokens']), read);
		for (const option of SEMANTIC_TOKEN_VALUES) {
			const token = option.value.slice('var('.length, -1);
			expect(forwarded[token]).toBe(`value-for${token}`);
		}
		for (const token of FORWARDED_THEME_TOKENS) expect(forwarded[token]).toBe(`value-for${token}`);
	});

	it('forwards nothing to a package that did not declare host-theme-tokens', () => {
		expect(collectSandboxThemeVariables(definition(['css-variables']), read)).toEqual({});
	});

	it('drops a token the host has no value for', () => {
		expect(collectSandboxThemeVariables(definition(['host-theme-tokens']), () => ' ')).toEqual({});
	});
});
