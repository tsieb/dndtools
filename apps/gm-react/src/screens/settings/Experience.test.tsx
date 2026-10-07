// @vitest-environment jsdom
import { act } from 'react';
import { removePreference, writePreference } from '../../platform/preferences';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyDraft } from '../../app/widgetBuilder/draft';
import { SettingsSection, shownBuilderSteps } from './Experience';
import { TIER_ATTR, TIER_KEY, readTier, setDocAttr } from './shared';

const fixture = [
	['settings.account.profile', 'profile'],
	['settings.tools.title', 'tools'],
	['settings.analytics.title', 'analytics'],
	['settings.vault.title', 'vault'],
	['settings.privacy.title', 'privacy'],
	['settings.recovery.title', 'recovery'],
	['settings.permissions.roles', 'permissions'],
	['settings.about.storage', 'storage'],
	['settings.about.errors', 'errors'],
	['settings.about.perf', 'performance'],
	['settings.about.export', 'export'],
	['settings.account.dangerZone', 'delete-account'],
] as const;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	host = document.createElement('div');
	document.body.append(host);
	root = createRoot(host);
});
afterEach(() => {
	act(() => root.unmount());
	host.remove();
	removePreference(TIER_KEY);
	document.documentElement.removeAttribute(TIER_ATTR);
});
function renderFixture() {
	act(() =>
		root.render(
			<>
				{fixture.map(([key, label]) => (
					<SettingsSection key={key} gateKey={key}>
						<button>{label}</button>
					</SettingsSection>
				))}
			</>,
		),
	);
}
function sections() {
	return [...host.querySelectorAll('button')].map((node) => node.textContent);
}
describe('Settings section tier fixture', () => {
	it.each([
		['core', ['profile', 'tools']],
		['intermediate', ['profile', 'tools', 'analytics', 'vault']],
		['advanced', fixture.map(([, label]) => label)],
	] as const)('renders the expected section set at %s', (tier, expected) => {
		setDocAttr(TIER_ATTR, TIER_KEY, tier);
		renderFixture();
		expect(sections()).toEqual(expected);
	});
	it('updates the mounted page immediately in both directions', () => {
		setDocAttr(TIER_ATTR, TIER_KEY, 'core');
		renderFixture();
		act(() => setDocAttr(TIER_ATTR, TIER_KEY, 'advanced'));
		expect(sections()).toHaveLength(fixture.length);
		act(() => setDocAttr(TIER_ATTR, TIER_KEY, 'core'));
		expect(sections()).toEqual(['profile', 'tools']);
	});
	it('invalidates the pre-paint tier when another window changes the preference', () => {
		setDocAttr(TIER_ATTR, TIER_KEY, 'advanced');
		renderFixture();
		act(() => {
			writePreference(TIER_KEY, 'core');
			window.dispatchEvent(new StorageEvent('storage', { key: TIER_KEY, newValue: 'core' }));
		});
		expect(sections()).toEqual(['profile', 'tools']);
	});
	it('does not mount hidden controls and fails closed for an unknown gate', () => {
		setDocAttr(TIER_ATTR, TIER_KEY, 'core');
		function Hidden() {
			throw new Error('hidden section mounted');
			return null;
		}
		act(() =>
			root.render(
				<>
					<SettingsSection gateKey="settings.privacy.title">
						<Hidden />
					</SettingsSection>
					<SettingsSection gateKey="unknown">
						<Hidden />
					</SettingsSection>
				</>,
			),
		);
		expect(host.innerHTML).toBe('');
	});
});

describe('RC-UX-6.4 default tier', () => {
	it('reads Standard when this device has never stored a tier', () => {
		removePreference(TIER_KEY);
		document.documentElement.removeAttribute(TIER_ATTR);
		expect(readTier()).toBe('intermediate');
		renderFixture();
		expect(sections()).toEqual(['profile', 'tools', 'analytics', 'vault']);
	});
	it('keeps a stored Beginner choice', () => {
		writePreference(TIER_KEY, 'core');
		expect(readTier()).toBe('core');
	});
});

describe('shownBuilderSteps (RC-UX-6.4)', () => {
	const base = emptyDraft();

	it('leaves Advanced out below Standard and keeps every other step', () => {
		expect(shownBuilderSteps(base, 'core', 'identity', [])).not.toContain('advanced');
		expect(shownBuilderSteps(base, 'core', 'identity', [])).toContain('review');
		expect(shownBuilderSteps(base, 'intermediate', 'identity', [])).toContain('advanced');
		expect(shownBuilderSteps(base, 'advanced', 'identity', [])).toContain('advanced');
	});

	it('keeps Advanced when the draft already has something there, or the builder is open on it', () => {
		expect(
			shownBuilderSteps({ ...base, runtime: 'custom-html-js' }, 'core', 'identity', []),
		).toContain('advanced');
		expect(
			shownBuilderSteps({ ...base, hostPermissions: ['network'] }, 'core', 'identity', []),
		).toContain('advanced');
		expect(shownBuilderSteps(base, 'core', 'advanced', [])).toContain('advanced');
		expect(shownBuilderSteps(base, 'core', 'identity', [{ step: 'advanced' }])).toContain(
			'advanced',
		);
	});
});
