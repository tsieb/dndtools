import fs from 'node:fs/promises';
import path from 'node:path';

function makeTempPath(targetPath: string): string {
	const directory = path.dirname(targetPath);
	const base = path.basename(targetPath);
	const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	return path.join(directory, `.${base}.${nonce}.tmp`);
}

async function trySyncDirectory(directory: string): Promise<void> {
	let handle: fs.FileHandle | null = null;
	try {
		handle = await fs.open(directory, 'r');
		await handle.sync();
	} catch {
		// Directory sync is best-effort and not supported consistently on Windows.
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

export async function writeFileAtomic(
	targetPath: string,
	data: string | Uint8Array,
): Promise<void> {
	const directory = path.dirname(targetPath);
	const tempPath = makeTempPath(targetPath);
	await fs.mkdir(directory, { recursive: true });

	let handle: fs.FileHandle | null = null;
	try {
		handle = await fs.open(tempPath, 'w');
		await handle.writeFile(data);
		await handle.sync();
		await handle.close();
		handle = null;

		await fs.rename(tempPath, targetPath);
		await trySyncDirectory(directory);
	} catch (error) {
		await handle?.close().catch(() => undefined);
		await fs.rm(tempPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

export interface JsonAtomicWriteOptions {
	validate?: (value: unknown) => boolean;
	label?: string;
}

function serializeAndValidateJson(value: unknown, options?: JsonAtomicWriteOptions): string {
	const serialized = JSON.stringify(value, null, '\t');
	if (typeof serialized !== 'string') {
		throw new Error('Failed to serialize JSON payload for atomic write.');
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(serialized);
	} catch {
		const label = options?.label ?? 'json';
		throw new Error(`Serialized ${label} payload failed JSON parse validation.`);
	}

	if (options?.validate && !options.validate(parsed)) {
		const label = options.label ?? 'json';
		throw new Error(`Serialized ${label} payload failed schema validation.`);
	}

	return serialized;
}

export async function writeJsonAtomic(
	targetPath: string,
	value: unknown,
	options?: JsonAtomicWriteOptions,
): Promise<void> {
	const serialized = serializeAndValidateJson(value, options);
	await writeFileAtomic(targetPath, serialized);
}
