// API Gateway WebSocket REQUEST authorizer for $connect. Browsers cannot set
// headers on a WebSocket handshake, so the Cognito ID token is passed as the
// `token` query-string parameter. We verify it against the user pool with
// aws-jwt-verify (JWKS cached in the container) and, on success, return an Allow
// policy carrying the caller's `sub`/`email` in the authorizer context — the
// signaling handler reads them from requestContext.authorizer.
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type {
  APIGatewayRequestAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from 'aws-lambda';

const USER_POOL_ID = process.env.USER_POOL_ID!;
const APP_CLIENT_ID = process.env.APP_CLIENT_ID!;

const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: APP_CLIENT_ID,
});

function policy(principalId: string, effect: 'Allow' | 'Deny', resource: string, context?: Record<string, string>): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }],
    },
    context,
  };
}

export const handler = async (
  event: APIGatewayRequestAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  const token = event.queryStringParameters?.token;
  if (!token) {
    // No token → deny. Throwing "Unauthorized" yields a 401; an explicit Deny
    // yields 403. Either is fine; Deny keeps the principal for logs.
    throw new Error('Unauthorized');
  }

  try {
    const payload = await verifier.verify(token);
    const sub = String(payload.sub);
    const email = typeof payload.email === 'string' ? payload.email : '';
    return policy(sub, 'Allow', event.methodArn, { sub, email });
  } catch {
    throw new Error('Unauthorized');
  }
};
