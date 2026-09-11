// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n';
import { Privacy } from './Privacy';
import { Terms } from './Terms';
import {
	LEGAL_DOCUMENTS,
	LEGAL_PLACEHOLDERS,
	PLACEHOLDER_PATTERN,
	collectPlaceholders,
} from './legalContent';

// `/legal/privacy` and `/legal/terms` are the URLs a Stripe reviewer (and every buyer, from
// Checkout) opens with no account and no onboarding. These tests mount the screens with NOTHING
// but the router and the message catalog — no RuntimeProvider, no AuthProvider, no entitlements —
// which is the proof that they depend on none of it.

let root: Root;
let container: HTMLDivElement;

async function mount(path: '/legal/privacy' | '/legal/terms') {
	await act(async () => {
		root.render(
			<I18nProvider>
				<MemoryRouter initialEntries={[path]}>
					<Routes>
						<Route path="/legal/privacy" element={<Privacy />} />
						<Route path="/legal/terms" element={<Terms />} />
					</Routes>
				</MemoryRouter>
			</I18nProvider>,
		);
	});
}

beforeEach(() => {
	(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
	document.title = 'Lamplight';
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe('the legal pages render for a signed-out, never-onboarded visitor', () => {
	it('renders the Privacy Policy with its heading, sections and a way back', async () => {
		await mount('/legal/privacy');
		expect(container.querySelector('h1')?.textContent).toBe('Privacy policy');
		const h2s = [...container.querySelectorAll('h2')].map((h) => h.textContent);
		expect(h2s).toEqual(LEGAL_DOCUMENTS.privacy.sections.map((s) => s.heading));
		expect(h2s).toContain('Billing through Stripe');
		expect(container.querySelector('a[href="/"]')?.textContent).toContain('Back to Lamplight');
		expect(container.querySelector('a[href="/legal/terms"]')?.textContent).toBe('Terms of service');
		expect(document.title).toBe('Privacy policy — Lamplight');
	});

	it('renders the Terms of Service with its heading, sections and a way back', async () => {
		await mount('/legal/terms');
		expect(container.querySelector('h1')?.textContent).toBe('Terms of service');
		const h2s = [...container.querySelectorAll('h2')].map((h) => h.textContent);
		expect(h2s).toEqual(LEGAL_DOCUMENTS.terms.sections.map((s) => s.heading));
		expect(h2s).toContain('Plans, subscriptions and billing');
		expect(container.querySelector('a[href="/"]')?.textContent).toContain('Back to Lamplight');
		expect(container.querySelector('a[href="/legal/privacy"]')?.textContent).toBe('Privacy policy');
		expect(document.title).toBe('Terms of service — Lamplight');
	});

	it('restores the previous tab title on unmount', async () => {
		await mount('/legal/privacy');
		await act(async () => {
			root.unmount();
		});
		expect(document.title).toBe('Lamplight');
		// afterEach unmounts again; React tolerates the double unmount.
	});
});

describe('the operator fill-in list is exactly the placeholders the prose contains', () => {
	// The point of this test: a placeholder added to the prose but not to the checklist would ship
	// unnoticed on a public page, and a checklist entry the prose no longer uses would send the
	// operator hunting for text that is not there. Both directions must be exact.
	const expected = [...LEGAL_PLACEHOLDERS].sort();
	const union = [
		...new Set([
			...collectPlaceholders(LEGAL_DOCUMENTS.privacy),
			...collectPlaceholders(LEGAL_DOCUMENTS.terms),
		]),
	].sort();

	it('across both documents, the set of bracketed tokens equals LEGAL_PLACEHOLDERS', () => {
		expect(union).toEqual(expected);
	});

	it('each document carries the entity, address, contact and effective-date placeholders', () => {
		for (const id of ['privacy', 'terms'] as const) {
			const found = collectPlaceholders(LEGAL_DOCUMENTS[id]);
			for (const token of [
				'[LEGAL ENTITY NAME]',
				'[MAILING ADDRESS]',
				'[CONTACT EMAIL]',
				'[EFFECTIVE DATE]',
			]) {
				expect(found, `${id} is missing ${token}`).toContain(token);
			}
		}
		// The two Terms-only decisions live in the Terms alone.
		expect(collectPlaceholders(LEGAL_DOCUMENTS.terms)).toContain('[GOVERNING LAW JURISDICTION]');
		expect(collectPlaceholders(LEGAL_DOCUMENTS.terms)).toContain(
			'[POST-CANCELLATION CLOUD RETENTION PERIOD]',
		);
	});

	it('renders every placeholder visibly marked, and nothing else as a placeholder', async () => {
		await mount('/legal/terms');
		const marked = [...container.querySelectorAll('[data-legal-placeholder]')].map(
			(m) => m.textContent,
		);
		expect(new Set(marked)).toEqual(new Set(collectPlaceholders(LEGAL_DOCUMENTS.terms)));
		// Any bracketed token in the rendered text is one of ours — no stray `[TODO]`-style leftovers.
		for (const token of container.textContent?.match(PLACEHOLDER_PATTERN) ?? []) {
			expect(expected).toContain(token);
		}
	});
});
