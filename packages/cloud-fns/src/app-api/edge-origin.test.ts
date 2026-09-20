import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

const template = parseDocument(
	readFileSync(new URL('../../../../infra/app-api/template.yaml', import.meta.url), 'utf8'),
	{ logLevel: 'silent' },
).toJS();
const require = createRequire(import.meta.url);

function authorizer(secret: string) {
	const exports: { handler?: (event: unknown) => Promise<{ isAuthorized: boolean }> } = {};
	runInNewContext(template.Resources.OriginAuthorizerFn.Properties.InlineCode, {
		exports,
		require,
		Buffer,
		process: { env: { ORIGIN_SECRET: secret } },
	});
	return exports.handler!;
}

describe('public API origin authorizer', () => {
	it('rejects missing, wrong-length, same-length forged and Unicode credentials', async () => {
		const authorize = authorizer('trusted');
		for (const value of [undefined, '', 'wrong', 'forgery', 'éééé']) {
			expect(await authorize({ headers: { 'x-app-origin': value } })).toEqual({
				isAuthorized: false,
			});
		}
		expect(await authorize({ headers: { 'x-app-origin': 'trusted' } })).toEqual({
			isAuthorized: true,
		});
	});
	it('keeps the explicitly unprotected dev configuration usable', async () => {
		expect(await authorizer('')({})).toEqual({ isAuthorized: true });
	});
	it('replaces a spoofed viewer IP at the distribution boundary', () => {
		const handler = runInNewContext(
			`${template.Resources.AppViewerIp.Properties.FunctionCode}; handler`,
		);
		const request = { headers: { 'x-app-client-ip': { value: 'forged' } } };
		expect(handler({ request, viewer: { ip: '192.0.2.8' } }).headers['x-app-client-ip'].value).toBe(
			'192.0.2.8',
		);
	});
});
