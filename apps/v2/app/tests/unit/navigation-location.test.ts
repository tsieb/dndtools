import { describe, expect, it } from 'vitest';
import { locationFromPath } from '../../src/lib/state/navigation-location';

// NAV-003: the route is the single source of truth. These cases pin the route ->
// location mapping the whole navigation view is derived from.
describe('locationFromPath', () => {
	it('maps the home route to the command-center section', () => {
		expect(locationFromPath('/')).toEqual({ sectionId: 'command-center' });
	});

	it('maps section roots with or without trailing slashes', () => {
		expect(locationFromPath('/scenes/')).toEqual({ sectionId: 'scenes' });
		expect(locationFromPath('/scenes')).toEqual({ sectionId: 'scenes' });
		expect(locationFromPath('/settings/')).toEqual({ sectionId: 'settings' });
	});

	it('maps every seven-section global destination root (UX-SHELL / UX-NAV-002)', () => {
		expect(locationFromPath('/session/')).toEqual({ sectionId: 'session' });
		expect(locationFromPath('/characters/')).toEqual({ sectionId: 'characters' });
		expect(locationFromPath('/atlas/')).toEqual({ sectionId: 'atlas' });
		expect(locationFromPath('/campaign/')).toEqual({ sectionId: 'campaign' });
		expect(locationFromPath('/knowledge/')).toEqual({ sectionId: 'knowledge' });
	});

	it('maps a descendant route to its owning section', () => {
		expect(locationFromPath('/session/active/')).toEqual({ sectionId: 'session' });
		expect(locationFromPath('/characters/char-7/')).toEqual({ sectionId: 'characters' });
	});

	it('maps a scene detail route to the scenes section with the open entity', () => {
		expect(locationFromPath('/scene/scene-123/')).toEqual({
			sectionId: 'scenes',
			entity: { type: 'scene', id: 'scene-123' },
		});
		expect(locationFromPath('/scene/scene-123')).toEqual({
			sectionId: 'scenes',
			entity: { type: 'scene', id: 'scene-123' },
		});
	});

	it('falls back to the home section for unknown routes', () => {
		expect(locationFromPath('/totally/unknown/')).toEqual({ sectionId: 'command-center' });
	});
});
