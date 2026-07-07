import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayRequestAuthorizerEvent } from 'aws-lambda';

// The WebSocket REQUEST authorizer gates $connect. Browsers cannot set headers on a
// WS handshake, so the Cognito ID token arrives as the `token` query-string param.
// These tests verify deny-by-default and that a verified token's identity is passed
// through to the handler via the authorizer context — with aws-jwt-verify mocked so
// no network/JWKS fetch happens.

const verify = vi.hoisted(() => vi.fn());
vi.mock('aws-jwt-verify', () => ({
	CognitoJwtVerifier: { create: () => ({ verify }) },
}));

process.env.USER_POOL_ID = 'ca-central-1_TEST';
process.env.APP_CLIENT_ID = 'test-client-id';

const { handler } = await import('./authorizer.ts');

function event(token?: string): APIGatewayRequestAuthorizerEvent {
	return {
		methodArn: 'arn:aws:execute-api:region:acct:api/dev/$connect',
		queryStringParameters: token === undefined ? null : { token },
	} as unknown as APIGatewayRequestAuthorizerEvent;
}

beforeEach(() => {
	verify.mockReset();
});

describe('signaling authorizer', () => {
	it('denies (throws Unauthorized) when no token is supplied', async () => {
		await expect(handler(event(undefined))).rejects.toThrow('Unauthorized');
		expect(verify).not.toHaveBeenCalled();
	});

	it('allows a valid token and forwards sub + email in the authorizer context', async () => {
		verify.mockResolvedValue({ sub: 'user-123', email: 'dm@example.com' });

		const result = await handler(event('good.jwt.token'));

		expect(verify).toHaveBeenCalledWith('good.jwt.token');
		expect(result.principalId).toBe('user-123');
		expect(result.context).toEqual({ sub: 'user-123', email: 'dm@example.com' });
		const stmt = result.policyDocument.Statement[0] as { Effect: string; Resource: string };
		expect(stmt.Effect).toBe('Allow');
		expect(stmt.Resource).toBe('arn:aws:execute-api:region:acct:api/dev/$connect');
	});

	it('tolerates a token without an email claim (email defaults to empty string)', async () => {
		verify.mockResolvedValue({ sub: 'user-456' }); // no email

		const result = await handler(event('token-without-email'));

		expect(result.principalId).toBe('user-456');
		expect(result.context).toEqual({ sub: 'user-456', email: '' });
	});

	it('denies when verification fails (invalid/expired token)', async () => {
		verify.mockRejectedValue(new Error('token expired'));

		await expect(handler(event('bad.jwt.token'))).rejects.toThrow('Unauthorized');
	});
});
