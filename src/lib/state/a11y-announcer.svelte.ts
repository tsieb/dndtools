class A11yAnnouncerState {
	politeMessage = $state('');
	assertiveMessage = $state('');
	private politeTimer: number | null = null;
	private assertiveTimer: number | null = null;

	announcePolite(message: string): void {
		this.schedule('polite', message);
	}

	announceAssertive(message: string): void {
		this.schedule('assertive', message);
	}

	private schedule(channel: 'polite' | 'assertive', message: string): void {
		const normalized = message.trim();
		if (!normalized) return;
		if (typeof window === 'undefined') {
			if (channel === 'polite') {
				this.politeMessage = normalized;
			} else {
				this.assertiveMessage = normalized;
			}
			return;
		}

		if (channel === 'polite') {
			if (this.politeTimer) window.clearTimeout(this.politeTimer);
			this.politeMessage = '';
			this.politeTimer = window.setTimeout(() => {
				this.politeMessage = normalized;
				this.politeTimer = null;
			}, 30);
			return;
		}

		if (this.assertiveTimer) window.clearTimeout(this.assertiveTimer);
		this.assertiveMessage = '';
		this.assertiveTimer = window.setTimeout(() => {
			this.assertiveMessage = normalized;
			this.assertiveTimer = null;
		}, 30);
	}
}

export const a11yAnnouncerState = new A11yAnnouncerState();
