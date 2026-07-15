// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../ds';
import { AuthModal } from './AuthModal';

type Props = ComponentProps<typeof AuthModal>;

let root: Root;
let container: HTMLDivElement;
let props: Props;

function action(label: string): HTMLButtonElement {
	const match = [...container.querySelectorAll('button')].find(
		(button) => button.textContent?.trim() === label,
	);
	if (!match) throw new Error(`Button not found: ${label}`);
	return match;
}

function field(id: string): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>(`#${id}`);
	if (!input) throw new Error(`Input not found: ${id}`);
	return input;
}

async function enter(id: string, value: string): Promise<void> {
	await act(async () => {
		const input = field(id);
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		if (!setter) throw new Error('HTMLInputElement value setter is unavailable');
		setter.call(input, value);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
}

async function click(label: string): Promise<void> {
	await act(async () => {
		action(label).click();
		await Promise.resolve();
	});
}

function title(): string {
	return container.querySelector('h2')?.textContent?.trim() ?? '';
}

beforeEach(async () => {
	(
		globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	vi.spyOn(Toaster, 'info').mockImplementation(() => 1);
	vi.spyOn(Toaster, 'success').mockImplementation(() => 1);
	props = {
		open: true,
		onClose: vi.fn(),
		signIn: vi.fn(async () => undefined),
		signUp: vi.fn(async () => undefined),
		confirm: vi.fn(async () => undefined),
		resend: vi.fn(async () => undefined),
		requestPasswordReset: vi.fn(async () => undefined),
		confirmPasswordReset: vi.fn(async () => undefined),
	};
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
	await act(async () => root.render(<AuthModal {...props} />));
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('AuthModal password recovery', () => {
	it('moves from an enumeration-safe code request to a successful new password', async () => {
		await enter('auth-password', 'OldSignInPassword3');
		await click('Forgot password?');
		expect(title()).toBe('Reset your password');
		expect(container.textContent).toContain(
			'We’ll send a code if an account can use password recovery.',
		);

		await enter('auth-email', 'dm@example.com');
		await click('Send reset code');

		expect(props.requestPasswordReset).toHaveBeenCalledWith('dm@example.com');
		expect(Toaster.info).toHaveBeenCalledWith(
			'If an account uses that email, a reset code is on its way.',
		);
		expect(title()).toBe('Enter your reset code');
		expect(field('auth-email').disabled).toBe(true);
		expect(field('auth-password').value).toBe('');

		await enter('auth-code', '123456');
		await enter('auth-password', 'LongEnoughPassword7');
		await click('Set new password');

		expect(props.confirmPasswordReset).toHaveBeenCalledWith(
			'dm@example.com',
			'123456',
			'LongEnoughPassword7',
		);
		expect(Toaster.success).toHaveBeenCalledWith(
			'Password updated — sign in with your new password.',
		);
		expect(title()).toBe('Sign in');
		expect(field('auth-password').value).toBe('');
	});

	it('keeps local password guidance actionable without calling Cognito', async () => {
		await click('Forgot password?');
		await enter('auth-email', 'dm@example.com');
		await click('Send reset code');
		await enter('auth-code', '123456');
		await enter('auth-password', 'too-short');
		await click('Set new password');

		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			'Use at least 12 characters.',
		);
		expect(props.confirmPasswordReset).not.toHaveBeenCalled();
	});

	it('never displays a raw provider error from the reset request', async () => {
		vi.mocked(props.requestPasswordReset).mockRejectedValue(
			new Error('User alice@example.com exists but SMTP failed'),
		);
		await click('Forgot password?');
		await enter('auth-email', 'alice@example.com');
		await click('Send reset code');

		const alert = container.querySelector('[role="alert"]')?.textContent ?? '';
		expect(alert).toBe('Couldn’t send a reset code. Check your connection and try again.');
		expect(alert).not.toMatch(/alice|smtp|exists/i);
	});

	it('collapses raw confirmation failures to recovery-safe guidance', async () => {
		vi.mocked(props.confirmPasswordReset).mockRejectedValue(
			new Error('unknown@example.com does not exist'),
		);
		await click('Forgot password?');
		await enter('auth-email', 'unknown@example.com');
		await click('Send reset code');
		await enter('auth-code', '000000');
		await enter('auth-password', 'LongEnoughPassword7');
		await click('Set new password');

		const alert = container.querySelector('[role="alert"]')?.textContent ?? '';
		expect(alert).toBe('Couldn’t update the password. Request a new code and try again.');
		expect(alert).not.toMatch(/unknown@example|does not exist/i);
	});
});

describe('AuthModal enrollment errors', () => {
	it('never displays raw provider details when account creation fails', async () => {
		vi.mocked(props.signUp).mockRejectedValue(
			Object.assign(new Error('alice@example.com already exists in pool ca-central-1_private'), {
				code: 'UsernameExistsException',
			}),
		);
		await click('Create an account');
		await enter('auth-email', 'alice@example.com');
		await enter('auth-password', 'LongEnoughPassword7');
		await click('Create account');

		const alert = container.querySelector('[role="alert"]')?.textContent ?? '';
		expect(alert).toBe(
			'An account may already use that email. Try signing in or resetting the password.',
		);
		expect(alert).not.toMatch(/alice|pool|ca-central/i);
	});

	it('maps confirmation and resend failures to safe, actionable guidance', async () => {
		await click('Create an account');
		await enter('auth-email', 'dm@example.com');
		await enter('auth-password', 'LongEnoughPassword7');
		await click('Create account');
		expect(title()).toBe('Confirm your email');

		vi.mocked(props.confirm).mockRejectedValue(
			Object.assign(new Error('private code mismatch for dm@example.com'), {
				code: 'CodeMismatchException',
			}),
		);
		await enter('auth-code', '000000');
		await click('Confirm');
		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			'That confirmation code is invalid or expired. Request a new code and try again.',
		);

		vi.mocked(props.resend).mockRejectedValue(new Error('SMTP private destination detail'));
		await click('Resend code');
		const resendAlert = container.querySelector('[role="alert"]')?.textContent ?? '';
		expect(resendAlert).toBe('Couldn’t confirm the account. Request a new code and try again.');
		expect(resendAlert).not.toMatch(/smtp|private|destination/i);
	});
});
