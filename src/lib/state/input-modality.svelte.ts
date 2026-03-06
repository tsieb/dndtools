class InputModalityState {
	keyboardDetected = $state(false);

	observeKeyboardEvent(event: KeyboardEvent): void {
		if (this.keyboardDetected || event.isComposing) return;
		this.keyboardDetected = true;
	}

	resetForTesting(): void {
		this.keyboardDetected = false;
	}
}

export const inputModalityState = new InputModalityState();
