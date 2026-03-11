import { describe, expect, it } from 'vitest';
import { detailPanelContextFromUrl, isDetailPanelAvailable } from './detail-panel-context.js';

function url(path: string): URL {
	return new URL(`https://dndtools.test${path}`);
}

describe('detailPanelContextFromUrl', () => {
	it('returns note context for canonical note detail views', () => {
		expect(detailPanelContextFromUrl(url('/knowledge/notes/note-1'))).toBe('note');
		expect(detailPanelContextFromUrl(url('/knowledge/notes/note-1/edit'))).toBeNull();
	});

	it('returns map context for map detail routes and library previews', () => {
		expect(detailPanelContextFromUrl(url('/atlas/maps'))).toBeNull();
		expect(detailPanelContextFromUrl(url('/atlas/maps?map=map-1'))).toBe('map');
		expect(detailPanelContextFromUrl(url('/atlas/maps?previewMap=map-1'))).toBe('map');
		expect(detailPanelContextFromUrl(url('/atlas/maps/map-1'))).toBe('map');
	});

	it('returns session context for session routes', () => {
		expect(detailPanelContextFromUrl(url('/session/boards'))).toBe('session');
		expect(detailPanelContextFromUrl(url('/session/combat'))).toBe('session');
	});

	it('exposes a boolean availability helper', () => {
		expect(isDetailPanelAvailable(url('/settings'))).toBe(false);
		expect(isDetailPanelAvailable(url('/knowledge/notes/example'))).toBe(true);
	});
});
