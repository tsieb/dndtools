import { describe, expect, it } from 'vitest';
import { widgetRejectionMessage } from './widget-rejection';

// `/board` and `/scene/:id` used to pipe `rejection.message` straight into their role="alert" region,
// so the most common failure a DM can provoke — pressing Roll on the GM Screen's seeded Dice widget
// before going live — announced an internal state machine by name.
describe('widgetRejectionMessage', () => {
	it('translates the live-session gate into an instruction, not a state-machine dump', () => {
		const message = widgetRejectionMessage({
			code: 'invalid-state',
			message: 'Session widget commands require an active workflow; current workflow is idle.',
		});
		expect(message).not.toContain('workflow');
		expect(message).toContain('Go live in Session');
	});

	it('explains a disabled or missing extension package in terms of Extensions', () => {
		for (const code of ['package-disabled', 'package-not-found']) {
			expect(widgetRejectionMessage({ code, message: 'raw' })).toContain('Extensions');
		}
	});

	it('tells the DM what to do about a revision conflict', () => {
		expect(widgetRejectionMessage({ code: 'revision-conflict', message: 'raw' })).toContain(
			'reload',
		);
	});

	it('passes through any other rejection message rather than inventing one', () => {
		expect(widgetRejectionMessage({ code: 'hidden-target', message: 'Widget is hidden.' })).toBe(
			'Widget is hidden.',
		);
	});

	it('still says something useful when the core supplies no message at all', () => {
		expect(widgetRejectionMessage({})).toMatch(/couldn’t be applied/);
	});
});
