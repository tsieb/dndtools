// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import { HubTemplate, type HubTemplateKind } from './Hub';
import { hubFixture } from './hubFixtures';
import { widgetPresentation } from '@dndtools/core';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);
afterEach(() => act(() => root.render(null)));
const kinds: HubTemplateKind[] = ['hero', 'card-grid', 'launcher', 'link-list'];
for (const kind of kinds) {
	it(`${kind}: content, empty, loading and selected snapshots`, () => {
		const props = hubFixture(kind);
		for (const state of ['content', 'empty', 'loading', 'selected'] as const) {
			const query = {
				...props.data.primary!,
				rows:
					state === 'empty'
						? []
						: props.data.primary!.rows.map((row) => ({ ...row, active: state === 'selected' })),
			};
			act(() =>
				root.render(
					<I18nProvider>
						<HubTemplate
							{...props}
							kind={kind}
							data={{ ...props.data, primary: query }}
							loading={state === 'loading'}
							onIntent={() => {}}
						/>
					</I18nProvider>,
				),
			);
			expect(container.innerHTML).toMatchSnapshot(state);
			if (state === 'empty') expect(container.textContent).toContain('No scenes yet.');
			if (state === 'loading') expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
		}
	});
	it(`${kind}: declared intent dispatch and inert editing`, () => {
		const props = hubFixture(kind);
		const onIntent = vi.fn();
		act(() =>
			root.render(
				<I18nProvider>
					<HubTemplate {...props} kind={kind} onIntent={onIntent} />
				</I18nProvider>,
			),
		);
		act(() => container.querySelector('button')!.click());
		expect(onIntent).toHaveBeenCalledTimes(1);
		expect(onIntent.mock.calls[0][0].intentId).toBe(props.definition!.intents![0].id);
		act(() =>
			root.render(
				<I18nProvider>
					<HubTemplate {...props} kind={kind} />
				</I18nProvider>,
			),
		);
		expect(container.querySelector('button')!.getAttribute('aria-disabled')).toBe('true');
	});
}
it('binds card intents by row identity after reorder', () => {
	const props = hubFixture('card-grid');
	props.definition!.intents!.unshift({
		id: 'crypt',
		kind: 'open-screen',
		targetId: 'crypt',
		displayName: 'Open crypt',
	});
	props.data.primary!.rows.reverse();
	const onIntent = vi.fn();
	act(() =>
		root.render(
			<I18nProvider>
				<HubTemplate {...props} kind="card-grid" onIntent={onIntent} />
			</I18nProvider>,
		),
	);
	act(() => container.querySelector('button')!.click());
	expect(onIntent).toHaveBeenCalledWith({ intentId: 'crypt', targetId: 'crypt' });
});
it('legacy and unknown presentation values remain framed', () => {
	expect(widgetPresentation({})).toBe('framed');
	expect(widgetPresentation({ presentation: 'unknown' })).toBe('framed');
	expect(widgetPresentation(JSON.parse(JSON.stringify({ presentation: 'bare' })))).toBe('bare');
});
