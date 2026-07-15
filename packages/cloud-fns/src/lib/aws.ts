// Thin AWS SDK v3 helpers shared by the signaling handlers. Uses the low-level
// DynamoDB client with hand-rolled marshalling (all our items are flat
// string/number attributes) so we never depend on @aws-sdk/lib-dynamodb being
// present in the Lambda runtime. All @aws-sdk/* packages are provided by the
// nodejs24.x runtime (esbuild marks them external).
import { randomUUID } from 'node:crypto';
import {
	DynamoDBClient,
	PutItemCommand,
	GetItemCommand,
	DeleteItemCommand,
	UpdateItemCommand,
	ScanCommand,
	QueryCommand,
	ConditionalCheckFailedException,
	TransactionCanceledException,
	TransactWriteItemsCommand,
	BatchWriteItemCommand,
	type AttributeValue,
	type WriteRequest,
} from '@aws-sdk/client-dynamodb';
import {
	ApiGatewayManagementApiClient,
	PostToConnectionCommand,
	GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const region = process.env.AWS_REGION;

export const ddb = new DynamoDBClient({ region });
const secrets = new SecretsManagerClient({ region });

/** Marshal a flat record of string|number values to a DynamoDB item. */
export function toItem(
	obj: Record<string, string | number | undefined>,
): Record<string, AttributeValue> {
	const item: Record<string, AttributeValue> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v === undefined) continue;
		item[k] = typeof v === 'number' ? { N: String(v) } : { S: v };
	}
	return item;
}

/** Unmarshal a DynamoDB item (flat S/N attributes) to a plain object. */
export function fromItem(
	item: Record<string, AttributeValue> | undefined,
): Record<string, string> | undefined {
	if (!item) return undefined;
	const obj: Record<string, string> = {};
	for (const [k, v] of Object.entries(item)) {
		if (v.S !== undefined) obj[k] = v.S;
		else if (v.N !== undefined) obj[k] = v.N;
	}
	return obj;
}

export async function putItem(
	table: string,
	obj: Record<string, string | number | undefined>,
): Promise<void> {
	await ddb.send(new PutItemCommand({ TableName: table, Item: toItem(obj) }));
}

export interface ConditionalWrite {
	expression: string;
	names?: Record<string, string>;
	values?: Record<string, string | number>;
}

export type QuotaWriteResult = 'written' | 'quota-exceeded' | 'item-conflict' | 'condition-failed';

export interface QuotaWrite {
	usageKey: Record<string, string>;
	byteDelta: number;
	operationDelta: number;
	maxBytes: number;
	maxOperations: number;
	items: Array<{
		item: Record<string, string | number | undefined>;
		condition: ConditionalWrite;
	}>;
}

/** Conditional flat-item put. Returns false only for a failed condition; AWS faults still throw. */
export async function putItemConditional(
	table: string,
	obj: Record<string, string | number | undefined>,
	condition: ConditionalWrite,
): Promise<boolean> {
	try {
		await ddb.send(
			new PutItemCommand({
				TableName: table,
				Item: toItem(obj),
				ConditionExpression: condition.expression,
				ExpressionAttributeNames: condition.names,
				ExpressionAttributeValues: condition.values ? toItem(condition.values) : undefined,
			}),
		);
		return true;
	} catch (error) {
		if (
			error instanceof ConditionalCheckFailedException ||
			(error as { name?: string })?.name === 'ConditionalCheckFailedException'
		)
			return false;
		throw error;
	}
}

/**
 * Atomically adjust one vault usage row and conditionally put the corresponding
 * immutable index row. The usage row must be initialized first. Conditional
 * cancellation is classified so callers can distinguish a harmless replay/race
 * from a real aggregate-quota rejection; service faults still throw.
 */
export async function transactQuotaWrite(
	table: string,
	write: QuotaWrite,
): Promise<QuotaWriteResult> {
	if (write.items.length < 1 || write.items.length > 99) {
		throw new Error('quota transaction must contain from 1 to 99 item writes');
	}
	const names: Record<string, string> = {
		'#bytes': 'storedBytes',
		'#operations': 'operationCount',
		'#state': 'state',
		'#updatedAt': 'updatedAt',
	};
	const values: Record<string, string | number> = {
		':byteDelta': write.byteDelta,
		':operationDelta': write.operationDelta,
		':active': 'active',
		':updatedAt': new Date().toISOString(),
	};
	const conditions = [
		'#state = :active',
		'attribute_exists(#bytes)',
		'attribute_exists(#operations)',
	];
	if (write.byteDelta > 0) {
		conditions.push('#bytes <= :bytesBeforeLimit');
		values[':bytesBeforeLimit'] = write.maxBytes - write.byteDelta;
	} else if (write.byteDelta < 0) {
		conditions.push('#bytes >= :byteDecrease');
		values[':byteDecrease'] = -write.byteDelta;
	}
	if (write.operationDelta > 0) {
		conditions.push('#operations <= :operationsBeforeLimit');
		values[':operationsBeforeLimit'] = write.maxOperations - write.operationDelta;
	} else if (write.operationDelta < 0) {
		conditions.push('#operations >= :operationDecrease');
		values[':operationDecrease'] = -write.operationDelta;
	}

	const command = new TransactWriteItemsCommand({
		ClientRequestToken: randomUUID(),
		TransactItems: [
			{
				Update: {
					TableName: table,
					Key: toItem(write.usageKey),
					UpdateExpression:
						'SET #bytes = #bytes + :byteDelta, #operations = #operations + :operationDelta, #updatedAt = :updatedAt',
					ConditionExpression: conditions.join(' AND '),
					ExpressionAttributeNames: names,
					ExpressionAttributeValues: toItem(values),
				},
			},
			...write.items.map(({ item, condition }) => ({
				Put: {
					TableName: table,
					Item: toItem(item),
					ConditionExpression: condition.expression,
					ExpressionAttributeNames: condition.names,
					ExpressionAttributeValues: condition.values ? toItem(condition.values) : undefined,
				},
			})),
		],
	});
	for (let attempt = 0; attempt < 4; attempt += 1) {
		try {
			await ddb.send(command);
			return 'written';
		} catch (error) {
			const isCanceled =
				error instanceof TransactionCanceledException ||
				(error as { name?: string })?.name === 'TransactionCanceledException';
			const reasons = isCanceled
				? ((error as TransactionCanceledException).CancellationReasons ?? [])
				: [];
			const hasTransactionConflict =
				(error as { name?: string })?.name === 'TransactionConflictException' ||
				reasons.some((reason) => reason.Code === 'TransactionConflict');
			if (hasTransactionConflict && attempt < 3) {
				// DynamoDB rejects overlapping transactions on the same hot usage item. The
				// command token stays stable across retries, preserving idempotency.
				await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt + Math.random() * 10));
				continue;
			}
			if (!isCanceled) throw error;
			const unexpected = reasons.some(
				(reason) => reason.Code && !['None', 'ConditionalCheckFailed'].includes(reason.Code),
			);
			if (unexpected) throw error;
			// If both conditions failed, an item conflict wins: duplicate immutable
			// revisions are idempotent replays even when the vault is otherwise full.
			if (reasons.slice(1).some((reason) => reason.Code === 'ConditionalCheckFailed')) {
				return 'item-conflict';
			}
			if (reasons[0]?.Code === 'ConditionalCheckFailed') return 'quota-exceeded';
			// Some DynamoDB-compatible test/local services omit cancellation reasons.
			// The caller re-reads both rows to classify this fail-closed result.
			return 'condition-failed';
		}
	}
	throw new Error('unreachable quota transaction retry state');
}

/** Atomically consume one slot from a fixed-window counter. */
export async function incrementCounterBelow(
	table: string,
	key: Record<string, string>,
	limit: number,
	expiresAt: number,
): Promise<boolean> {
	try {
		await ddb.send(
			new UpdateItemCommand({
				TableName: table,
				Key: toItem(key),
				UpdateExpression: 'SET #expires = :expires ADD #count :one',
				ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
				ExpressionAttributeNames: { '#expires': 'expiresAt', '#count': 'requestCount' },
				ExpressionAttributeValues: toItem({ ':expires': expiresAt, ':one': 1, ':limit': limit }),
			}),
		);
		return true;
	} catch (error) {
		if (
			error instanceof ConditionalCheckFailedException ||
			(error as { name?: string })?.name === 'ConditionalCheckFailedException'
		)
			return false;
		throw error;
	}
}

export type FlatTransactionWrite =
	| { put: Record<string, string | number | undefined> }
	| { delete: Record<string, string> };

/** Atomically write/delete a small set of flat records in one DynamoDB table. */
export async function transactWrite(
	table: string,
	writes: readonly FlatTransactionWrite[],
): Promise<void> {
	if (writes.length < 1 || writes.length > 100) throw new Error('invalid transaction size');
	await ddb.send(
		new TransactWriteItemsCommand({
			ClientRequestToken: randomUUID(),
			TransactItems: writes.map((write) =>
				'put' in write
					? { Put: { TableName: table, Item: toItem(write.put) } }
					: { Delete: { TableName: table, Key: toItem(write.delete) } },
			),
		}),
	);
}

/** Delete flat-key rows in DynamoDB's bounded 25-item batches. */
export async function batchDeleteItems(
	table: string,
	keys: readonly Record<string, string>[],
): Promise<void> {
	for (let offset = 0; offset < keys.length; offset += 25) {
		let pending: WriteRequest[] = keys.slice(offset, offset + 25).map((key) => ({
			DeleteRequest: { Key: toItem(key) },
		}));
		for (let attempt = 0; pending.length > 0 && attempt < 5; attempt += 1) {
			const response = await ddb.send(
				new BatchWriteItemCommand({ RequestItems: { [table]: pending } }),
			);
			pending = response.UnprocessedItems?.[table] ?? [];
		}
		if (pending.length > 0) throw new Error('DynamoDB did not finish a batch delete');
	}
}

export async function getItem(
	table: string,
	key: Record<string, string>,
	consistentRead = false,
): Promise<Record<string, string> | undefined> {
	const res = await ddb.send(
		new GetItemCommand({ TableName: table, Key: toItem(key), ConsistentRead: consistentRead }),
	);
	return fromItem(res.Item);
}

export async function deleteItem(table: string, key: Record<string, string>): Promise<void> {
	await ddb.send(new DeleteItemCommand({ TableName: table, Key: toItem(key) }));
}

export async function scanAll(table: string, limit = 200): Promise<Record<string, string>[]> {
	const res = await ddb.send(new ScanCommand({ TableName: table, Limit: limit }));
	return (res.Items ?? []).map((i) => fromItem(i)!).filter(Boolean);
}

/**
 * Query a partition, optionally bounded by a sort-key range, returning items in ascending SK order.
 * `skRange` supplies a `#sk BETWEEN :lo AND :hi` clause (both inclusive) on the given sort-key attribute.
 * Pages through results up to `maxItems`. Callers serving a network response MUST pass
 * a finite maximum so one partition cannot turn into an unbounded Lambda read/cost.
 * Set `consistentRead` for authorization-adjacent cleanup or pagination where omitting
 * a just-committed row could incorrectly advance a durable high-water/tombstone.
 */
export async function queryPartition(
	table: string,
	pk: { name: string; value: string },
	skRange?: { name: string; lo: string; hi: string },
	pageSize = 1000,
	maxItems = Number.POSITIVE_INFINITY,
	consistentRead = false,
): Promise<Record<string, string>[]> {
	const names: Record<string, string> = { '#pk': pk.name };
	const values: Record<string, AttributeValue> = { ':pk': { S: pk.value } };
	let keyExpr = '#pk = :pk';
	if (skRange) {
		names['#sk'] = skRange.name;
		values[':lo'] = { S: skRange.lo };
		values[':hi'] = { S: skRange.hi };
		keyExpr += ' AND #sk BETWEEN :lo AND :hi';
	}
	const out: Record<string, string>[] = [];
	let lastKey: Record<string, AttributeValue> | undefined;
	do {
		const remaining = maxItems - out.length;
		if (remaining <= 0) break;
		const res = await ddb.send(
			new QueryCommand({
				TableName: table,
				KeyConditionExpression: keyExpr,
				ExpressionAttributeNames: names,
				ExpressionAttributeValues: values,
				ExclusiveStartKey: lastKey,
				Limit: Math.min(pageSize, remaining),
				ConsistentRead: consistentRead,
			}),
		);
		for (const item of res.Items ?? []) {
			const row = fromItem(item);
			if (row) out.push(row);
		}
		lastKey = res.LastEvaluatedKey;
	} while (lastKey && out.length < maxItems);
	return out;
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
