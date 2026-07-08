import { describe, expect, it } from 'vitest';
import type { WidgetBindingPayload, WidgetInstance } from '@dndtools/core';
import { widgetAccessibleName } from './widget-name';

/**
 * A11Y-007 AC1 — widget accessible name derivation.
 *
 * Key invariant: a payload whose binding is NOT visible to the actor (hidden,
 * missing, unbound, disabled, conflicted) MUST NOT expose the entity id in the
 * accessible name. Only `available` and `degraded` payloads (where the binding
 * was resolved as visible by the Processing Core) may include the entity id.
 */

function makeWidget(
	type: string,
	entityId?: string,
): WidgetInstance {
	return {
		id: 'w-1',
		type,
		version: '1.0.0',
		layout: { x: 0, y: 0, w: 100, h: 100, z: 1, groupId: null, dock: null, pinned: false, focusOrder: null },
		configuration: {},
		localState: {},
		binding: entityId
			? { source: { entityType: 'character', entityId, selector: undefined }, mode: 'read', requiredCapability: 'viewer' }
			: null,
		disabled: null,
	};
}

describe('A11Y-007 AC1: widgetAccessibleName — visibility-safe accessible name derivation', () => {
	it('available widget without a binding returns only the type', () => {
		const payload: WidgetBindingPayload = { kind: 'available', widget: makeWidget('note') };
		expect(widgetAccessibleName(payload)).toBe('note widget');
	});

	it('available widget with a visible binding includes the entity id', () => {
		const payload: WidgetBindingPayload = {
			kind: 'available',
			widget: makeWidget('character-sheet', 'char-042'),
		};
		expect(widgetAccessibleName(payload)).toBe('character-sheet widget bound to char-042');
	});

	it('degraded widget with a visible binding includes the entity id', () => {
		const payload: WidgetBindingPayload = {
			kind: 'degraded',
			widget: makeWidget('character-sheet', 'char-007'),
			unavailableHostPermissions: ['network'],
		};
		expect(widgetAccessibleName(payload)).toBe('character-sheet widget bound to char-007');
	});

	it('[NO-LEAK] hidden payload does not expose the entity id', () => {
		// This simulates a widget whose binding resolved to `hidden` in the data layer —
		// the entity id is never included in the accessible name.
		const payload: WidgetBindingPayload = {
			kind: 'hidden',
			widgetInstanceId: 'w-hidden',
			type: 'character-sheet',
			reason: 'dm-only',
		};
		const name = widgetAccessibleName(payload);
		expect(name).not.toContain('char-');
		expect(name).toBe('character-sheet widget (unavailable)');
	});

	it('[NO-LEAK] missing payload does not expose the entity id', () => {
		const payload: WidgetBindingPayload = {
			kind: 'missing',
			widgetInstanceId: 'w-missing',
			type: 'map',
		};
		const name = widgetAccessibleName(payload);
		expect(name).toBe('map widget (unavailable)');
	});

	it('[NO-LEAK] unbound payload does not expose an entity id', () => {
		const payload: WidgetBindingPayload = {
			kind: 'unbound',
			widgetInstanceId: 'w-unbound',
			type: 'timer',
		};
		expect(widgetAccessibleName(payload)).toBe('timer widget (unavailable)');
	});

	it('[NO-LEAK] disabled payload does not expose an entity id', () => {
		const payload: WidgetBindingPayload = {
			kind: 'disabled',
			widgetInstanceId: 'w-disabled',
			type: 'dice-roller',
			reason: 'Package not installed.',
			packageId: null,
		};
		expect(widgetAccessibleName(payload)).toBe('dice-roller widget (unavailable)');
	});

	it('[NO-LEAK] conflicted payload does not expose an entity id', () => {
		const payload: WidgetBindingPayload = {
			kind: 'conflicted',
			widgetInstanceId: 'w-conflict',
			type: 'note',
			conflictPaths: ['content'],
		};
		expect(widgetAccessibleName(payload)).toBe('note widget (unavailable)');
	});
});
