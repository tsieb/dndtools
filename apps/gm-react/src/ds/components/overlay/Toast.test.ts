import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Toast } from './Toast.jsx';

const TestToast = Toast as ComponentType<{ status: string; message: string }>;

describe('Toast announcements', () => {
	it('uses an assertive alert only for errors', () => {
		const error = renderToStaticMarkup(
			createElement(TestToast, { status: 'error', message: 'Backup failed.' }),
		);
		const success = renderToStaticMarkup(
			createElement(TestToast, { status: 'success', message: 'Backup saved.' }),
		);

		expect(error).toContain('role="alert"');
		expect(error).toContain('aria-atomic="true"');
		expect(success).toContain('role="status"');
		expect(success).not.toContain('aria-live=');
	});
});
