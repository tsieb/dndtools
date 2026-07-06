// Thin AWS SDK v3 helpers shared by the signaling handlers. Uses the low-level
// DynamoDB client with hand-rolled marshalling (all our items are flat
// string/number attributes) so we never depend on @aws-sdk/lib-dynamodb being
// present in the Lambda runtime. All @aws-sdk/* packages are provided by the
// nodejs20.x runtime (esbuild marks them external).
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  ScanCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const region = process.env.AWS_REGION;

export const ddb = new DynamoDBClient({ region });
const secrets = new SecretsManagerClient({ region });

/** Marshal a flat record of string|number values to a DynamoDB item. */
export function toItem(obj: Record<string, string | number | undefined>): Record<string, AttributeValue> {
  const item: Record<string, AttributeValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    item[k] = typeof v === 'number' ? { N: String(v) } : { S: v };
  }
  return item;
}

/** Unmarshal a DynamoDB item (flat S/N attributes) to a plain object. */
export function fromItem(item: Record<string, AttributeValue> | undefined): Record<string, string> | undefined {
  if (!item) return undefined;
  const obj: Record<string, string> = {};
  for (const [k, v] of Object.entries(item)) {
    if (v.S !== undefined) obj[k] = v.S;
    else if (v.N !== undefined) obj[k] = v.N;
  }
  return obj;
}

export async function putItem(table: string, obj: Record<string, string | number | undefined>): Promise<void> {
  await ddb.send(new PutItemCommand({ TableName: table, Item: toItem(obj) }));
}

export async function getItem(table: string, key: Record<string, string>): Promise<Record<string, string> | undefined> {
  const res = await ddb.send(new GetItemCommand({ TableName: table, Key: toItem(key) }));
  return fromItem(res.Item);
}

export async function deleteItem(table: string, key: Record<string, string>): Promise<void> {
  await ddb.send(new DeleteItemCommand({ TableName: table, Key: toItem(key) }));
}

export async function scanAll(table: string, limit = 200): Promise<Record<string, string>[]> {
  const res = await ddb.send(new ScanCommand({ TableName: table, Limit: limit }));
  return (res.Items ?? []).map((i) => fromItem(i)!).filter(Boolean);
}

/** In-memory cache of secret values (Lambda container reuse). */
const secretCache = new Map<string, string>();

/** Fetch and cache a Secrets Manager secret, returning a named JSON field. */
export async function getSecretField(secretArn: string, field: string): Promise<string> {
  const cacheKey = `${secretArn}#${field}`;
  const cached = secretCache.get(cacheKey);
  if (cached) return cached;
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = res.SecretString ?? '{}';
  const value = String(JSON.parse(raw)[field] ?? '');
  secretCache.set(cacheKey, value);
  return value;
}

/** Build an API Gateway Management client for a given WebSocket endpoint. */
export function managementClient(endpoint: string): ApiGatewayManagementApiClient {
  return new ApiGatewayManagementApiClient({ region, endpoint });
}

/**
 * Post a JSON message to a WebSocket connection. Returns false (and swallows the
 * error) if the connection is gone (410) so callers can prune stale entries.
 */
export async function postToConnection(
  client: ApiGatewayManagementApiClient,
  connectionId: string,
  payload: unknown,
): Promise<boolean> {
  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(payload)),
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof GoneException || (err as { name?: string })?.name === 'GoneException') {
      return false;
    }
    throw err;
  }
}
