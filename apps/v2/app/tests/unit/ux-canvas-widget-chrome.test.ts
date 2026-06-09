import { describe, expect, it } from 'vitest';
import {
	bindingChrome,
	bindingState,
	collapseToggle,
	isCollapsed,
	safeBindingEntityId,
	safeWidgetTitle,
	visibilityBadge,
	visibilityToggle,
} from '../../src/lib/gui/ux-canvas/widget-chrome';

// UX-CANVAS-007/008/011: the widget chrome + binding-state model. The security-critical behaviour is the
// SAFE entity-id choke point — a non-DM only ever sees a bound entity id when their own resolution
// already returned the widget available; a hidden/missing/conflicted resolution withholds it.

describe('bindingState', () => {
	it('maps presence + resolution to the indicator state', () => {
		expect(bindingState(false, 'none')).toBe('none');
		expect(bindingState(true, 'available')).toBe('active');
		expect(bindingState(true, 'degraded')).toBe('active');
		expect(bindingState(true, 'missing')).toBe('missing');
		expect(bindingState(true, 'conflicted')).toBe('conflicted');
		expect(bindingState(true, 'hidden')).toBe('hidden');
		expect(bindingState(true, 'unbound')).toBe('none');
	});
});

describe('safeBindingEntityId (NO-LEAK choke point)', () => {
	it('reveals the id to a DM for every resolution', () => {
		expect(safeBindingEntityId('missing', 'forbidden-vault', 'dm')).toBe('forbidden-vault');
		expect(safeBindingEntityId('hidden', 'forbidden-vault', 'dm')).toBe('forbidden-vault');
		expect(safeBindingEntityId('available', 'secret', 'dm')).toBe('secret');
	});

	it('reveals the id to a non-DM ONLY when their resolution is available/degraded', () => {
		expect(safeBindingEntityId('available', 'shared-npc', 'player')).toBe('shared-npc');
		expect(safeBindingEntityId('degraded', 'shared-npc', 'observer')).toBe('shared-npc');
	});

	it('withholds the id from a non-DM for hidden/missing/conflicted/unbound', () => {
		for (const res of ['missing', 'hidden', 'conflicted', 'unbound', 'none'] as const) {
			expect(safeBindingEntityId(res, 'forbidden-vault', 'player')).toBeUndefined();
			expect(safeBindingEntityId(res, 'forbidden-vault', 'observer')).toBeUndefined();
		}
	});

	it('returns undefined when there is no entity id at all', () => {
		expect(safeBindingEntityId('available', undefined, 'dm')).toBeUndefined();
	});
});

describe('bindingChrome', () => {
	it('shows an active label with the safe entity name and no placeholder', () => {
		const chrome = bindingChrome('active', 'Mira');
		expect(chrome.label).toContain('Mira');
		expect(chrome.showPlaceholder).toBe(false);
		expect(chrome.canRebind).toBe(false);
	});

	it('offers a Rebind recovery for a missing binding (UX-CANVAS-007 AC4)', () => {
		const chrome = bindingChrome('missing');
		expect(chrome.showPlaceholder).toBe(true);
		expect(chrome.placeholder).toBe('Binding missing');
		expect(chrome.canRebind).toBe(true);
	});

	it('never renders a stale value for a hidden binding', () => {
		const chrome = bindingChrome('hidden');
		expect(chrome.showPlaceholder).toBe(true);
		expect(chrome.placeholder).toBe('Hidden in this view');
		expect(chrome.canRebind).toBe(false);
	});
});

describe('safeWidgetTitle', () => {
	it('embeds the entity name only when supplied', () => {
		expect(safeWidgetTitle('note', 'Mira')).toBe('note — Mira');
		expect(safeWidgetTitle('note')).toBe('note widget');
	});
});

describe('visibility chrome', () => {
	it('describes the DM-only badge with a redundant non-colour label + icon', () => {
		const badge = visibilityBadge('dm-only');
		expect(badge.label).toBe('DM Only');
		expect(badge.icon).toBe('eye-off');
		expect(badge.ariaLabel).toBe('Hidden from players');
	});

	it('describes the players + shared badges', () => {
		expect(visibilityBadge('player-visible').label).toBe('Players');
		expect(visibilityBadge('shared').label).toBe('Shared');
	});

	it('toggles dm-only ↔ player-visible in one step (UX-CANVAS-011)', () => {
		const reveal = visibilityToggle('dm-only');
		expect(reveal.next).toBe('player-visible');
		expect(reveal.label).toBe('Show to players');
		expect(reveal.announce('Map')).toContain('visible to players');

		const hide = visibilityToggle('player-visible');
		expect(hide.next).toBe('dm-only');
		expect(hide.label).toBe('Hide from players');
	});
});

describe('collapse', () => {
	it('reads the persisted flag and toggles it', () => {
		expect(isCollapsed({})).toBe(false);
		expect(isCollapsed({ collapsed: true })).toBe(true);
		const t = collapseToggle(false);
		expect(t.next).toBe(true);
		// Content is currently expanded (collapsed=false) ⇒ aria-expanded=true.
		expect(t.ariaExpanded).toBe(true);
		expect(t.label).toBe('Collapse widget');
		expect(collapseToggle(true).label).toBe('Expand widget');
	});
});
