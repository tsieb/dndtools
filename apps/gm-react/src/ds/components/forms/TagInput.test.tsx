// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TagInput as RawTagInput } from './TagInput.jsx';

type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const TagInput = RawTagInput as React.ComponentType<DsProps>;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

function Harness({ initial, maxTags }: { initial?: string[]; maxTags?: number }) {
	const [value, setValue] = React.useState<string[]>(initial ?? []);
	return (
		<>
			<TagInput value={value} onChange={setValue} maxTags={maxTags} />
			<div data-testid="value">{JSON.stringify(value)}</div>
		</>
	);
}

describe('TagInput', () => {
	it('creates tags on Enter and commits draft on blur', () => {
		act(() => {
			root.render(<Harness initial={[]} />);
		});
		const input = container.querySelector('input');
		if (!input) throw new Error('tag input did not render');

		act(() => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
				input,
				'alpha',
			);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
		act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));

		expect(container.querySelector('[data-testid="value"]')?.textContent).toContain('alpha');
	});
});

function typeDraft(input: HTMLInputElement, value: string) {
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
}
it('commits comma-separated tags on blur, deduplicates and respects the limit', () => {
	act(() => root.render(<Harness initial={['Alpha']} maxTags={2} />));
	const input = container.querySelector('input')!;
	typeDraft(input, 'alpha, Beta, Gamma');
	act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
	expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('["Alpha","Beta"]');
	typeDraft(input, 'Delta');
	act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
	expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(2);
	act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })));
	expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('["Alpha"]');
	act(() => container.querySelector('button')!.click());
	expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('[]');
});
