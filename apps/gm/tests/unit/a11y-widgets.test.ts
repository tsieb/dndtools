// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TabsFixture from './fixtures/TabsFixture.svelte';
import DisclosureFixture from './fixtures/DisclosureFixture.svelte';
import DialogOpenFixture from './fixtures/DialogOpenFixture.svelte';
import StateBadgeFixture from './fixtures/StateBadgeFixture.svelte';

// UX-A11Y-012: the shared APG widget components render the canonical ARIA wiring. Rendered via
// Svelte's SSR so the static role/state markup is asserted directly; the keyboard model is covered
// by the roving-tabindex + focus-trap unit tests, and the live trap by the Help-dialog Playwright e2e.

describe('Tabs (UX-A11Y-012 tabs pattern)', () => {
	it('renders tablist/tab/tabpanel with aria-selected, aria-controls, and roving tabindex', () => {
		const body = render(TabsFixture).body;
		expect(body).toContain('role="tablist"');
		expect(body).toContain('aria-label="Demo tabs"');
		expect(body).toContain('role="tab"');
		expect(body).toContain('role="tabpanel"');
		expect(body).toContain('aria-selected="true"');
		expect(body).toContain('aria-selected="false"');
		// The selected tab is in the Tab order; the others are out of it (no positive tabindex, AP-8).
		expect(body).toContain('tabindex="0"');
		expect(body).toContain('tabindex="-1"');
		// Each tab points at its panel.
		expect(body).toMatch(/aria-controls="tabs-\d+-panel-one"/);
	});
});

describe('Disclosure (UX-A11Y-012 disclosure pattern)', () => {
	it('renders aria-expanded + aria-controls and hides the region with hidden, not aria-hidden (AP-9)', () => {
		const body = render(DisclosureFixture).body;
		expect(body).toContain('aria-expanded="false"');
		expect(body).toMatch(/aria-controls="disc-\d+"/);
		expect(body).toContain('hidden');
		expect(body).not.toContain('aria-hidden="true"' + ' data-testid="disclosure-region"');
		// The controlled region must not be removed from the a11y tree via aria-hidden.
		const region = /<div id="disc-\d+"[^>]*>/.exec(body)?.[0] ?? '';
		expect(region).not.toContain('aria-hidden');
	});
});

describe('Dialog (UX-A11Y-012 dialog wiring)', () => {
	it('renders role=dialog, aria-modal, and aria-labelledby pointing at the title', () => {
		const body = render(DialogOpenFixture).body;
		expect(body).toContain('role="dialog"');
		expect(body).toContain('aria-modal="true"');
		const labelledby = /aria-labelledby="(dlg-\d+)"/.exec(body)?.[1];
		expect(labelledby).toBeTruthy();
		// The referenced id is the dialog title element.
		expect(body).toContain(`id="${labelledby}"`);
		expect(body).toContain('Demo dialog');
		expect(body).toContain('aria-label="Close dialog"');
	});
});

describe('StateBadge (UX-A11Y-007 colour independence)', () => {
	it('renders a visible text label as the non-colour cue', () => {
		const body = render(StateBadgeFixture, { props: { kind: 'health', value: 'bloodied' } }).body;
		expect(body).toContain('Bloodied');
		expect(body).toContain('data-state="health:bloodied"');
	});
});
