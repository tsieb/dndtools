import { beforeEach, describe, expect, it } from 'vitest';
import { inputModalityState } from './input-modality.svelte.js';

describe('inputModalityState', () => {
	beforeEach(() => {
		inputModalityState.resetForTesting();
	});

	it('defaults to touch-first modality until a key is pressed', () => {
		expect(inputModalityState.keyboardDetected).toBe(false);
	});

	it('detects keyboard presence on first keydown event', () => {
		inputModalityState.observeKeyboardEvent(new KeyboardEvent('keydown', { key: 'a' }));
		expect(inputModalityState.keyboardDetected).toBe(true);
	});

	it('ignores IME composition key events for keyboard detection', () => {
		const composingEvent = new KeyboardEvent('keydown', { key: 'a' });
		Object.defineProperty(composingEvent, 'isComposing', { value: true });
		inputModalityState.observeKeyboardEvent(composingEvent);
		expect(inputModalityState.keyboardDetected).toBe(false);
	});
});
