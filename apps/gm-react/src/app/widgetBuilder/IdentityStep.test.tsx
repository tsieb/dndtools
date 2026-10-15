// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { describe, expect, it } from 'vitest';
import { WIDGET_TEMPLATE_KINDS } from '@dndtools/core';
import { I18nProvider } from '../../i18n';
import { emptyDraft } from './draft';
import { IdentityStep, iconMeaning } from './IdentityStep';
import { TEMPLATE_SIZES, templateLayoutPatch } from './LayoutStep';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Identity disclosure', () => {
	it('keeps deriving both ids after closing Advanced identity and remounting the step', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const root = createRoot(host);
		let draft = emptyDraft();
		const render = () =>
			root.render(
				<I18nProvider>
					<IdentityStep
						draft={draft}
						issues={[]}
						patch={(next) => {
							draft = { ...draft, ...next };
							render();
						}}
					/>
				</I18nProvider>,
			);
		const name = () => host.querySelector('input')!;
		try {
			act(render);
			act(() => Simulate.change(name(), { target: { value: 'First title' } } as never));
			host.querySelector('details')!.open = true;
			expect(draft.packageId).toBe('workspace.first-title');
			host.querySelector('details')!.open = false;
			act(() => Simulate.change(name(), { target: { value: 'Second title' } } as never));
			expect(draft.packageId).toBe('workspace.second-title');
			expect(draft.typeId).toBe('second-title');
			act(() => root.render(null));
			act(render);
			act(() => Simulate.change(name(), { target: { value: 'Third title' } } as never));
			expect(draft.packageId).toBe('workspace.third-title');
			expect(draft.typeId).toBe('third-title');
			// A manually chosen package id remains stable while the untouched type still follows.
			draft = { ...draft, packageId: 'my.custom-package' };
			act(render);
			act(() => Simulate.change(name(), { target: { value: 'Final title' } } as never));
			expect(draft.packageId).toBe('my.custom-package');
			expect(draft.typeId).toBe('final-title');
		} finally {
			act(() => root.unmount());
			host.remove();
		}
	});
	it('names semantic concepts rather than glyphs', () => {
		expect(iconMeaning('session-bolt')).toBe('Session');
		expect(iconMeaning('cond-poisoned')).toBe('Condition poisoned');
		expect(iconMeaning('dm-only')).toBe('DM only');
	});
});

describe('template layout defaults', () => {
	it.each(WIDGET_TEMPLATE_KINDS)(
		'switches to and from %s while preserving custom sizes',
		(template) => {
			const initial = emptyDraft();
			const selected = { ...initial, ...templateLayoutPatch(initial, { template }) };
			expect(selected.defaultSize.width).toBeGreaterThanOrEqual(selected.minSize.width);
			expect(selected.defaultSize.height).toBeGreaterThanOrEqual(selected.minSize.height);
			const restored = {
				...selected,
				...templateLayoutPatch(selected, { template: initial.template }),
			};
			expect(restored.defaultSize).toEqual(initial.defaultSize);
			const custom = { ...selected, defaultSize: { width: 700, height: 500 } };
			expect(
				{ ...custom, ...templateLayoutPatch(custom, { template: initial.template }) }.defaultSize,
			).toEqual(custom.defaultSize);
		},
	);

	it('adapts an untouched canvas size but preserves an explicit size', () => {
		expect(templateLayoutPatch(emptyDraft(), { template: 'data-table' }).defaultSize).toEqual(
			TEMPLATE_SIZES['data-table'],
		);
		expect(
			templateLayoutPatch(
				{ ...emptyDraft(), defaultSize: { width: 700, height: 500 } },
				{ template: 'data-table' },
			),
		).toEqual({ template: 'data-table' });
	});
});
