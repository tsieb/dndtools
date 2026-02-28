/**
 * vault-verify — read-only integrity scan for the DND Tools vault.
 *
 * Usage:
 *   pnpm vault:verify [vaultDir]
 *
 * If vaultDir is omitted, DNDTOOLS_VAULT env var is tried, then
 * ~/Documents/dndtools-vault.
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more integrity issues found
 *   2 — fatal error (vault not found, etc.)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';

// ─── ANSI colours (strip when not a TTY) ──────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
	reset: isTTY ? '\x1b[0m' : '',
	bold: isTTY ? '\x1b[1m' : '',
	dim: isTTY ? '\x1b[2m' : '',
	red: isTTY ? '\x1b[31m' : '',
	green: isTTY ? '\x1b[32m' : '',
	yellow: isTTY ? '\x1b[33m' : '',
	cyan: isTTY ? '\x1b[36m' : '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOTE_MARKER_KEY = 'dndtools_integrity';
const NOTE_MARKER_VERSION = 1;

function computeChecksum(content: string): string {
	const normalized = content.replace(/^\n+/, '').replace(/\n$/, '');
	return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function resolveVaultDir(): string {
	const arg = process.argv[2];
	if (arg && !arg.startsWith('-')) return path.resolve(arg);
	if (process.env.DNDTOOLS_VAULT) return path.resolve(process.env.DNDTOOLS_VAULT);
	return path.join(os.homedir(), 'Documents', 'dndtools-vault');
}

async function findMarkdownFiles(dir: string, metaDir: string): Promise<string[]> {
	const results: string[] = [];
	async function walk(current: string): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				if (full === metaDir || entry.name === 'node_modules') continue;
				await walk(full);
			} else if (entry.isFile() && entry.name.endsWith('.md')) {
				results.push(full);
			}
		}
	}
	await walk(dir);
	return results;
}

type NoteIssue =
	| { kind: 'missing_marker'; filePath: string }
	| { kind: 'invalid_marker'; filePath: string; details: string }
	| { kind: 'checksum_mismatch'; filePath: string; stored: string; computed: string };

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const vaultDir = resolveVaultDir();
	const metaDir = path.join(vaultDir, '.vault');
	const indexPath = path.join(metaDir, 'index.json');

	// ── 1. Confirm vault exists ──────────────────────────────────────────────
	try {
		await fs.stat(vaultDir);
	} catch {
		console.error(`${c.red}${c.bold}Error:${c.reset} vault directory not found: ${vaultDir}`);
		process.exit(2);
	}

	console.log(`${c.bold}DND Tools vault-verify${c.reset}`);
	console.log(`${c.dim}Vault:${c.reset} ${vaultDir}\n`);

	// ── 2. Load index ────────────────────────────────────────────────────────
	const indexNotes: Record<string, { filename: string; folder: string; title: string }> = {};
	try {
		const raw = await fs.readFile(indexPath, 'utf-8');
		const parsed = JSON.parse(raw) as { notes?: Record<string, unknown> };
		if (parsed.notes && typeof parsed.notes === 'object') {
			for (const [id, entry] of Object.entries(parsed.notes)) {
				if (
					entry &&
					typeof entry === 'object' &&
					'filename' in entry &&
					'folder' in entry &&
					'title' in entry
				) {
					const e = entry as Record<string, unknown>;
					indexNotes[id] = {
						filename: String(e.filename),
						folder: String(e.folder),
						title: String(e.title),
					};
				}
			}
		}
	} catch {
		console.warn(
			`${c.yellow}Warning:${c.reset} could not read index.json — skipping cross-reference check\n`,
		);
	}

	// ── 3. Find markdown files ───────────────────────────────────────────────
	console.log(`${c.cyan}Scanning markdown files...${c.reset}`);
	const mdFiles = await findMarkdownFiles(vaultDir, metaDir);
	console.log(`Found ${mdFiles.length} file${mdFiles.length === 1 ? '' : 's'}\n`);

	// ── 4. Cross-reference: index entries vs files on disk ──────────────────
	const orphanIssues: Array<{ noteId: string; expectedPath: string; title: string }> = [];

	for (const [noteId, entry] of Object.entries(indexNotes)) {
		const relFolder = entry.folder.replace(/^\/+/, '');
		const expectedPath = relFolder
			? path.join(vaultDir, relFolder, entry.filename)
			: path.join(vaultDir, entry.filename);
		try {
			await fs.stat(expectedPath);
		} catch {
			orphanIssues.push({ noteId, expectedPath, title: entry.title });
		}
	}

	// ── 5. Checksum validation ───────────────────────────────────────────────
	const noteIssues: NoteIssue[] = [];
	let checkedCount = 0;
	let skippedCount = 0;

	for (const filePath of mdFiles) {
		const relPath = path.relative(vaultDir, filePath).replace(/\\/g, '/');
		let raw: string;
		try {
			raw = await fs.readFile(filePath, 'utf-8');
		} catch {
			skippedCount++;
			continue;
		}

		let parsed: { data: Record<string, unknown>; content: string };
		try {
			parsed = matter(raw) as { data: Record<string, unknown>; content: string };
		} catch {
			skippedCount++;
			continue;
		}

		const marker = parsed.data[NOTE_MARKER_KEY];
		if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
			noteIssues.push({ kind: 'missing_marker', filePath: relPath });
			checkedCount++;
			continue;
		}

		const m = marker as Record<string, unknown>;
		if (typeof m.version !== 'number' || typeof m.contentChecksum !== 'string') {
			noteIssues.push({
				kind: 'invalid_marker',
				filePath: relPath,
				details: `version=${JSON.stringify(m.version)}, contentChecksum=${JSON.stringify(m.contentChecksum)}`,
			});
			checkedCount++;
			continue;
		}

		if (m.version !== NOTE_MARKER_VERSION) {
			noteIssues.push({
				kind: 'invalid_marker',
				filePath: relPath,
				details: `unsupported marker version ${m.version} (expected ${NOTE_MARKER_VERSION})`,
			});
			checkedCount++;
			continue;
		}

		const computed = computeChecksum(parsed.content);
		if (computed !== m.contentChecksum) {
			noteIssues.push({
				kind: 'checksum_mismatch',
				filePath: relPath,
				stored: m.contentChecksum,
				computed,
			});
		}
		checkedCount++;
	}

	// ── 6. Report ────────────────────────────────────────────────────────────
	const totalIssues = orphanIssues.length + noteIssues.length;

	if (orphanIssues.length > 0) {
		console.log(
			`${c.yellow}${c.bold}Orphaned index entries${c.reset} (in index.json but no file on disk): ${orphanIssues.length}`,
		);
		for (const issue of orphanIssues) {
			console.log(`  ${c.yellow}⚠${c.reset}  ${c.dim}${issue.noteId}${c.reset} "${issue.title}"`);
			console.log(`       Expected: ${issue.expectedPath}`);
		}
		console.log();
	}

	if (noteIssues.length > 0) {
		const missingMarker = noteIssues.filter((i) => i.kind === 'missing_marker');
		const invalidMarker = noteIssues.filter((i) => i.kind === 'invalid_marker');
		const checksumMismatch = noteIssues.filter((i) => i.kind === 'checksum_mismatch');

		if (checksumMismatch.length > 0) {
			console.log(`${c.red}${c.bold}Checksum mismatches${c.reset}: ${checksumMismatch.length}`);
			for (const issue of checksumMismatch) {
				if (issue.kind === 'checksum_mismatch') {
					console.log(`  ${c.red}✗${c.reset}  ${issue.filePath}`);
					console.log(`       stored:   ${c.dim}${issue.stored}${c.reset}`);
					console.log(`       computed: ${c.dim}${issue.computed}${c.reset}`);
				}
			}
			console.log();
		}

		if (invalidMarker.length > 0) {
			console.log(`${c.yellow}${c.bold}Invalid markers${c.reset}: ${invalidMarker.length}`);
			for (const issue of invalidMarker) {
				if (issue.kind === 'invalid_marker') {
					console.log(`  ${c.yellow}⚠${c.reset}  ${issue.filePath}`);
					console.log(`       ${c.dim}${issue.details}${c.reset}`);
				}
			}
			console.log();
		}

		if (missingMarker.length > 0) {
			console.log(
				`${c.dim}${c.bold}Missing markers${c.reset}${c.dim} (files with no integrity marker):${c.reset} ${missingMarker.length}`,
			);
			for (const issue of missingMarker) {
				console.log(`  ${c.dim}•${c.reset}  ${c.dim}${issue.filePath}${c.reset}`);
			}
			console.log();
		}
	}

	// ── 7. Summary ───────────────────────────────────────────────────────────
	console.log('─'.repeat(50));
	console.log(
		`Checked: ${c.bold}${checkedCount}${c.reset} files  |  ` +
			`Orphaned entries: ${c.bold}${orphanIssues.length}${c.reset}  |  ` +
			`Issues: ${c.bold}${totalIssues}${c.reset}` +
			(skippedCount ? `  |  Skipped: ${skippedCount}` : ''),
	);

	if (totalIssues === 0) {
		console.log(`\n${c.green}${c.bold}✓ All checks passed.${c.reset}`);
		process.exit(0);
	} else {
		console.log(
			`\n${c.red}${c.bold}✗ ${totalIssues} issue${totalIssues === 1 ? '' : 's'} found.${c.reset}`,
		);
		console.log(
			`${c.dim}Run the app and open Settings → Vault → Repair Vault to fix automatically.${c.reset}`,
		);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(`${c.red}Fatal error:${c.reset}`, err instanceof Error ? err.message : String(err));
	process.exit(2);
});
