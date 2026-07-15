// S3 helpers for the sync-api handler. The bucket stores ONLY ciphertext (per-vault
// AES-256-GCM envelopes) as JSON objects; the server never holds a key and never
// decrypts. @aws-sdk/client-s3 is provided by the nodejs24.x runtime (esbuild external).
import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	ListObjectVersionsCommand,
	NoSuchKey,
} from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION;
const s3 = new S3Client({ region });

/** Store a JSON value (an encrypted envelope) at `key`. Content is opaque ciphertext. */
export async function putJson(bucket: string, key: string, value: unknown): Promise<void> {
	await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: Buffer.from(JSON.stringify(value)),
			ContentType: 'application/json',
		}),
	);
}

/** Store JSON in a versioned bucket and return the exact immutable version written. */
export async function putJsonVersioned(
	bucket: string,
	key: string,
	value: unknown,
): Promise<string> {
	const result = await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: Buffer.from(JSON.stringify(value)),
			ContentType: 'application/json',
		}),
	);
	if (!result.VersionId) throw new Error('Versioned S3 write returned no version id');
	return result.VersionId;
}

/** Delete an object. Deleting a nonexistent key is a no-op (S3 returns success). */
export async function deleteObject(bucket: string, key: string): Promise<void> {
	await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Delete one failed/stale version without placing a delete marker over the stable key. */
export async function deleteObjectVersion(
	bucket: string,
	key: string,
	versionId: string,
): Promise<void> {
	await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }));
}

/** Place delete markers over a bounded set of stable object keys in one request. */
export async function deleteObjects(bucket: string, keys: readonly string[]): Promise<void> {
	if (keys.length === 0) return;
	const result = await s3.send(
		new DeleteObjectsCommand({
			Bucket: bucket,
			Delete: { Quiet: true, Objects: [...new Set(keys)].map((Key) => ({ Key })) },
		}),
	);
	if (result.Errors && result.Errors.length > 0)
		throw new Error('S3 did not finish an object delete');
}

/**
 * Physically remove one bounded page of every version and delete marker below a tenant prefix.
 * Starting each call from the beginning is intentional: deleted entries disappear, so a caller can
 * repeat until `hasMore` is false without exposing continuation tokens to the renderer.
 */
export async function deleteObjectVersionsPage(
	bucket: string,
	prefix: string,
): Promise<{ deleted: number; hasMore: boolean }> {
	const listed = await s3.send(
		new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000 }),
	);
	const objects = [
		...(listed.Versions ?? []).map(({ Key, VersionId }) => ({ Key, VersionId })),
		...(listed.DeleteMarkers ?? []).map(({ Key, VersionId }) => ({ Key, VersionId })),
	].filter(
		(entry): entry is { Key: string; VersionId: string } =>
			typeof entry.Key === 'string' && typeof entry.VersionId === 'string',
	);
	if (objects.length > 0) {
		const result = await s3.send(
			new DeleteObjectsCommand({ Bucket: bucket, Delete: { Quiet: true, Objects: objects } }),
		);
		if (result.Errors && result.Errors.length > 0)
			throw new Error('S3 did not finish a version delete');
	}
	return { deleted: objects.length, hasMore: listed.IsTruncated === true };
}

/** Read and parse a JSON object, or null when the key does not exist. */
export async function getJson<T = unknown>(bucket: string, key: string): Promise<T | null> {
	try {
		const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
		const body = await res.Body?.transformToString();
		return body ? (JSON.parse(body) as T) : null;
	} catch (err) {
		if (err instanceof NoSuchKey || (err as { name?: string })?.name === 'NoSuchKey') return null;
		throw err;
	}
}

/** Read the exact version referenced by DynamoDB; omit versionId for legacy rows. */
export async function getJsonVersioned<T = unknown>(
	bucket: string,
	key: string,
	versionId?: string,
): Promise<T | null> {
	try {
		const res = await s3.send(
			new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
		);
		const body = await res.Body?.transformToString();
		return body ? (JSON.parse(body) as T) : null;
	} catch (err) {
		if (
			err instanceof NoSuchKey ||
			['NoSuchKey', 'NoSuchVersion'].includes((err as { name?: string })?.name ?? '')
		)
			return null;
		throw err;
	}
}
