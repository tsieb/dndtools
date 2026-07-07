// S3 helpers for the sync-api handler. The bucket stores ONLY ciphertext (per-vault
// AES-256-GCM envelopes) as JSON objects; the server never holds a key and never
// decrypts. @aws-sdk/client-s3 is provided by the nodejs20.x runtime (esbuild external).
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
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
