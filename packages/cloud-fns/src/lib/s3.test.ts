import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
	commands: [] as Array<{ kind: string; input: Record<string, unknown> }>,
	listResponse: {} as Record<string, unknown>,
	deleteResponse: {} as Record<string, unknown>,
}));

vi.mock('@aws-sdk/client-s3', () => {
	const command = (kind: string) =>
		class {
			readonly kind = kind;
			constructor(readonly input: Record<string, unknown>) {}
		};
	return {
		S3Client: class {
			async send(cmd: { kind: string; input: Record<string, unknown> }) {
				fake.commands.push({ kind: cmd.kind, input: cmd.input });
				if (cmd.kind === 'ListObjectVersions') return fake.listResponse;
				if (cmd.kind === 'DeleteObjects') return fake.deleteResponse;
				return {};
			}
		},
		PutObjectCommand: command('PutObject'),
		GetObjectCommand: command('GetObject'),
		DeleteObjectCommand: command('DeleteObject'),
		DeleteObjectsCommand: command('DeleteObjects'),
		ListObjectVersionsCommand: command('ListObjectVersions'),
		NoSuchKey: class extends Error {},
	};
});

const { deleteObjectVersionsPage } = await import('./s3.ts');

beforeEach(() => {
	fake.commands.length = 0;
	fake.listResponse = {};
	fake.deleteResponse = {};
});

describe('deleteObjectVersionsPage', () => {
	it('physically deletes exact object versions and delete markers in a bounded page', async () => {
		fake.listResponse = {
			Versions: [
				{ Key: 'user/primary/ops/1.json', VersionId: 'v1' },
				{ Key: 'user/primary/ops/1.json', VersionId: 'v2' },
			],
			DeleteMarkers: [{ Key: 'user/primary/ops/1.json', VersionId: 'marker' }],
			IsTruncated: true,
		};

		await expect(deleteObjectVersionsPage('bucket', 'user/primary/')).resolves.toEqual({
			deleted: 3,
			hasMore: true,
		});
		expect(fake.commands).toEqual([
			{
				kind: 'ListObjectVersions',
				input: { Bucket: 'bucket', Prefix: 'user/primary/', MaxKeys: 1000 },
			},
			{
				kind: 'DeleteObjects',
				input: {
					Bucket: 'bucket',
					Delete: {
						Quiet: true,
						Objects: [
							{ Key: 'user/primary/ops/1.json', VersionId: 'v1' },
							{ Key: 'user/primary/ops/1.json', VersionId: 'v2' },
							{ Key: 'user/primary/ops/1.json', VersionId: 'marker' },
						],
					},
				},
			},
		]);
	});

	it('reports version-only cleanup as progress without adding a delete marker', async () => {
		fake.listResponse = {
			Versions: [{ Key: 'user/primary/orphan.json', VersionId: 'orphan-v1' }],
			IsTruncated: false,
		};

		const result = await deleteObjectVersionsPage('bucket', 'user/primary/');
		expect(result).toEqual({ deleted: 1, hasMore: false });
		expect(fake.commands.at(-1)?.input).toMatchObject({
			Delete: { Objects: [{ Key: 'user/primary/orphan.json', VersionId: 'orphan-v1' }] },
		});
	});

	it('fails the purge when S3 reports an undeleted version', async () => {
		fake.listResponse = {
			Versions: [{ Key: 'user/primary/orphan.json', VersionId: 'v1' }],
		};
		fake.deleteResponse = { Errors: [{ Key: 'user/primary/orphan.json', VersionId: 'v1' }] };

		await expect(deleteObjectVersionsPage('bucket', 'user/primary/')).rejects.toThrow(
			'S3 did not finish a version delete',
		);
	});
});
