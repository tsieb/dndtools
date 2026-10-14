// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { openExternalUrl } from '../../platform/capabilities';
import { BetaFeedbackAction, BETA_FEEDBACK_URL } from './HelpMenu';

vi.mock('../../platform/capabilities', () => ({ openExternalUrl: vi.fn() }));

it.each(['success', 'blocked', 'rejected'] as const)(
	'opens the fixed feedback route and handles %s without losing the destination',
	async (outcome) => {
		const open = vi.mocked(openExternalUrl);
		open.mockReset();
		if (outcome === 'rejected') open.mockRejectedValueOnce(new Error('Native browser unavailable'));
		else open.mockResolvedValueOnce(outcome === 'success');
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		try {
			await act(async () =>
				root.render(
					<I18nProvider>
						<BetaFeedbackAction />
					</I18nProvider>,
				),
			);
			const button = container.querySelector('button')!;
			expect(button.textContent).toBe('Send feedback');
			expect(button.disabled).toBe(false);
			button.focus();
			expect(document.activeElement).toBe(button);
			await act(async () => button.click());
			expect(open).toHaveBeenCalledExactlyOnceWith(BETA_FEEDBACK_URL);
			expect(new URL(BETA_FEEDBACK_URL).search).toBe('?category=beta-feedback');
			expect(container.textContent).toContain('Feedback is public');
			if (outcome === 'success') expect(container.querySelector('[role="status"]')).toBeNull();
			else
				expect(container.querySelector('[role="status"]')?.textContent).toContain(
					BETA_FEEDBACK_URL,
				);
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	},
);
