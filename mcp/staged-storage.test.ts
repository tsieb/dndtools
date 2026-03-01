// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StagedMcpAdapter } from './staged-storage.js';
import { FileSystemAdapter } from './storage.js';
import { createFolderId, createNoteId, type Note } from '../src/lib/types/note.js';
import type { McpPolicySettings } from '../src/lib/types/settings.js';

function makeNote(overrides: Partial<Note> = {}): Note {
	return {
		id: createNoteId(`note-${Math.random().toString(36).slice(2, 10)}`),
		title: 'Test Note',
		content: '',
		folder: createFolderId('/'),
		tags: [],
		frontmatter: {},
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

async function withAgent(agentId: string | undefined, run: () => Promise<void>): Promise<void> {
	const previous = process.env.DNDTOOLS_MCP_AGENT;
	if (agentId) {
		process.env.DNDTOOLS_MCP_AGENT = agentId;
	} else {
		delete process.env.DNDTOOLS_MCP_AGENT;
	}

	try {
		await run();
	} finally {
		if (previous === undefined) {
			delete process.env.DNDTOOLS_MCP_AGENT;
		} else {
			process.env.DNDTOOLS_MCP_AGENT = previous;
		}
	}
}

describe('StagedMcpAdapter', () => {
	let tmpDir: string;
	let base: FileSystemAdapter;
	let staged: StagedMcpAdapter;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-staged-'));
		base = new FileSystemAdapter(tmpDir);
		staged = new StagedMcpAdapter(tmpDir);
		await base.initialize();
		await staged.initialize();
	});

	afterEach(async () => {
		await staged.close();
		await base.close();
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('assigns unique file paths for duplicate staged titles in the same folder', async () => {
		const a = makeNote({ id: createNoteId('note-a'), title: 'Goblin Den' });
		const b = makeNote({ id: createNoteId('note-b'), title: 'Goblin Den' });

		await staged.saveNote(a);
		await staged.saveNote(b);

		const noteA = await staged.getNote(a.id);
		const noteB = await staged.getNote(b.id);
		expect(noteA?.filePath).toBe('goblin-den.md');
		expect(noteB?.filePath).toBe('goblin-den-2.md');
	});

	it('keeps staged updates virtual until approval and applies latest content', async () => {
		const original = makeNote({
			id: createNoteId('note-virtual'),
			title: 'Virtual',
			content: 'v1',
		});
		await staged.saveNote(original);
		await staged.saveNote({ ...original, content: 'v2', updatedAt: '2026-01-02T00:00:00.000Z' });

		expect((await staged.getNote(original.id))?.content).toBe('v2');
		expect(await base.getNote(original.id)).toBeNull();
		expect((await base.getPendingMcpChanges()).length).toBe(2);

		await base.approveAllMcpChanges();
		expect((await base.getNote(original.id))?.content).toBe('v2');
	});

	it('derives links from staged content including note-id embeds', async () => {
		const target = makeNote({
			id: createNoteId('note-target'),
			title: 'Phandalin',
		});
		const source = makeNote({
			id: createNoteId('note-source'),
			title: 'Session 1',
			content: 'See ![[note:note-target|Town]] and [[Phandalin]].',
		});

		await staged.saveNote(target);
		await staged.saveNote(source);

		const links = await staged.getLinksFrom(source.id);
		expect(links).toHaveLength(2);
		expect(links.every((entry) => entry.targetId === target.id)).toBe(true);
	});

	it('excludes staged soft-deleted notes from active snapshots and search', async () => {
		const active = makeNote({
			id: createNoteId('note-active'),
			title: 'Active Note',
			content: 'contains dragon lore',
		});
		const trash = makeNote({
			id: createNoteId('note-trash'),
			title: 'Trash Note',
			content: 'contains dragon lore',
		});
		await staged.saveNote(active);
		await staged.saveNote(trash);
		await staged.deleteNote(trash.id);

		const activeNotes = await staged.getAllNotes();
		expect(activeNotes.map((note) => note.id)).toEqual([active.id]);

		const results = await staged.searchNotes('dragon');
		expect(results.map((entry) => entry.note.id)).toEqual([active.id]);
	});

	it('auto-approves non-structural edits under balanced policy preset', async () => {
		const balancedPolicy: McpPolicySettings = {
			defaultPresetId: 'balanced',
			perAgent: {},
		};
		await base.setSetting('mcpPolicySettings', balancedPolicy);
		const baseNote = makeNote({
			id: createNoteId('note-policy-base'),
			title: 'Policy Baseline',
			content: 'v1',
		});
		await base.saveNote(baseNote);
		await staged.refreshFromDisk();

		await staged.saveNote({
			...baseNote,
			content: 'v2 content update only',
			updatedAt: '2026-01-03T00:00:00.000Z',
		});

		expect((await base.getPendingMcpChanges()).length).toBe(0);
		expect((await base.getNote(baseNote.id))?.content).toBe('v2 content update only');

		const audit = await base.getMcpAuditTrail();
		expect(audit[0]?.policy?.decision).toBe('auto_approved');
		expect(audit[0]?.audit?.some((event) => event.action === 'auto_approved')).toBe(true);
	});

	it('keeps structural edits pending under balanced policy preset', async () => {
		const balancedPolicy: McpPolicySettings = {
			defaultPresetId: 'balanced',
			perAgent: {},
		};
		await base.setSetting('mcpPolicySettings', balancedPolicy);

		const created = makeNote({
			id: createNoteId('note-policy-create'),
			title: 'Structural Create',
		});
		await staged.saveNote(created);

		const pending = await base.getPendingMcpChanges();
		expect(pending).toHaveLength(1);
		expect(pending[0]?.preview?.semantic.structural).toBe(true);
		expect(pending[0]?.policy?.presetId).toBe('balanced');
		expect(pending[0]?.policy?.decision).toBe('pending_review');
	});

	it('flags and blocks approval when live edits conflict with staged snapshots', async () => {
		const baseNote = makeNote({
			id: createNoteId('note-conflict'),
			title: 'Conflict Target',
			content: 'base content',
		});
		await base.saveNote(baseNote);
		await staged.refreshFromDisk();

		await staged.saveNote({
			...baseNote,
			content: 'staged content',
			updatedAt: '2026-01-02T00:00:00.000Z',
		});

		await base.saveNote({
			...baseNote,
			content: 'live ui edit',
			updatedAt: '2026-01-03T00:00:00.000Z',
		});

		const pending = await base.getPendingMcpChanges();
		expect(pending).toHaveLength(1);
		expect(pending[0]?.conflict?.reason).toBe('target_changed_since_stage');

		await expect(base.approveMcpChange(pending[0]!.id)).rejects.toThrow('Conflict detected');

		const recorded = (await base.getMcpChangeLog()).find((entry) => entry.id === pending[0]!.id);
		expect(recorded?.audit?.some((event) => event.action === 'conflict_blocked')).toBe(true);
	});

	it('supports filtered batch approvals while leaving non-matching pending changes untouched', async () => {
		await staged.saveNote(
			makeNote({
				id: createNoteId('note-batch-approve-1'),
				title: 'Batch Approve One',
			}),
		);
		await staged.saveNote(
			makeNote({
				id: createNoteId('note-batch-approve-2'),
				title: 'Batch Approve Two',
			}),
		);
		await staged.saveNote(
			makeNote({
				id: createNoteId('note-batch-hold-1'),
				title: 'Batch Hold One',
			}),
		);

		const pendingBefore = await base.getPendingMcpChanges();
		expect(pendingBefore).toHaveLength(3);

		const filtered = pendingBefore.filter((change) => change.title.includes('Approve'));
		expect(filtered).toHaveLength(2);
		for (const change of filtered) {
			await base.approveMcpChange(change.id);
		}

		const pendingAfter = await base.getPendingMcpChanges();
		expect(pendingAfter).toHaveLength(1);
		expect(pendingAfter[0]?.title).toBe('Batch Hold One');

		const approvedNotes = await base.getAllNotes();
		expect(approvedNotes.some((note) => note.title === 'Batch Approve One')).toBe(true);
		expect(approvedNotes.some((note) => note.title === 'Batch Approve Two')).toBe(true);
		expect(approvedNotes.some((note) => note.title === 'Batch Hold One')).toBe(false);
	});

	it('enforces policy presets per agent id', async () => {
		const perAgentPolicy: McpPolicySettings = {
			defaultPresetId: 'strict_review',
			perAgent: {
				'trusted-agent': 'trusted',
				'strict-agent': 'strict_review',
			},
		};
		await base.setSetting('mcpPolicySettings', perAgentPolicy);

		await withAgent('trusted-agent', async () => {
			await staged.saveNote(
				makeNote({
					id: createNoteId('note-policy-trusted'),
					title: 'Trusted Structural Create',
				}),
			);
		});

		await withAgent('strict-agent', async () => {
			await staged.saveNote(
				makeNote({
					id: createNoteId('note-policy-strict'),
					title: 'Strict Structural Create',
				}),
			);
		});

		const pending = await base.getPendingMcpChanges();
		expect(pending).toHaveLength(1);
		expect(pending[0]?.agentId).toBe('strict-agent');
		expect(pending[0]?.policy?.presetId).toBe('strict_review');
		expect(pending[0]?.policy?.decision).toBe('pending_review');

		const auditTrail = await base.getMcpAuditTrail();
		const trustedEntry = auditTrail.find((entry) => entry.noteId === 'note-policy-trusted');
		expect(trustedEntry?.agentId).toBe('trusted-agent');
		expect(trustedEntry?.policy?.presetId).toBe('trusted');
		expect(trustedEntry?.policy?.decision).toBe('auto_approved');
		expect(trustedEntry?.audit?.some((event) => event.action === 'auto_approved')).toBe(true);
	});

	it('records complete audit trails for staged, approved, rejected, and conflict-blocked flows', async () => {
		const approvedBase = makeNote({
			id: createNoteId('note-audit-approved'),
			title: 'Audit Approved',
			content: 'v1',
		});
		await base.saveNote(approvedBase);
		await staged.refreshFromDisk();
		await staged.saveNote({
			...approvedBase,
			content: 'v2',
			updatedAt: '2026-01-04T00:00:00.000Z',
		});
		const approvedPending = (await base.getPendingMcpChanges()).find(
			(entry) => entry.noteId === approvedBase.id,
		);
		expect(approvedPending).toBeTruthy();
		await base.approveMcpChange(approvedPending!.id);

		const rejectedBase = makeNote({
			id: createNoteId('note-audit-rejected'),
			title: 'Audit Rejected',
			content: 'v1',
		});
		await base.saveNote(rejectedBase);
		await staged.refreshFromDisk();
		await staged.saveNote({
			...rejectedBase,
			content: 'v2',
			updatedAt: '2026-01-05T00:00:00.000Z',
		});
		const rejectedPending = (await base.getPendingMcpChanges()).find(
			(entry) => entry.noteId === rejectedBase.id,
		);
		expect(rejectedPending).toBeTruthy();
		await base.rejectMcpChange(rejectedPending!.id);

		const conflictedBase = makeNote({
			id: createNoteId('note-audit-conflict'),
			title: 'Audit Conflict',
			content: 'v1',
		});
		await base.saveNote(conflictedBase);
		await staged.refreshFromDisk();
		await staged.saveNote({
			...conflictedBase,
			content: 'staged content',
			updatedAt: '2026-01-06T00:00:00.000Z',
		});
		await base.saveNote({
			...conflictedBase,
			content: 'live edit content',
			updatedAt: '2026-01-07T00:00:00.000Z',
		});
		const conflictedPending = (await base.getPendingMcpChanges()).find(
			(entry) => entry.noteId === conflictedBase.id,
		);
		expect(conflictedPending).toBeTruthy();
		await expect(base.approveMcpChange(conflictedPending!.id)).rejects.toThrow('Conflict detected');

		const changeLog = await base.getMcpChangeLog();
		const approvedRecord = changeLog.find((entry) => entry.noteId === approvedBase.id);
		const rejectedRecord = changeLog.find((entry) => entry.noteId === rejectedBase.id);
		const conflictedRecord = changeLog.find((entry) => entry.noteId === conflictedBase.id);

		expect(approvedRecord?.audit?.map((entry) => entry.action)).toContain('staged');
		expect(approvedRecord?.audit?.map((entry) => entry.action)).toContain('approved');
		expect(rejectedRecord?.audit?.map((entry) => entry.action)).toContain('staged');
		expect(rejectedRecord?.audit?.map((entry) => entry.action)).toContain('rejected');
		expect(conflictedRecord?.audit?.map((entry) => entry.action)).toContain('staged');
		expect(conflictedRecord?.audit?.map((entry) => entry.action)).toContain('conflict_blocked');

		for (const record of [approvedRecord, rejectedRecord, conflictedRecord]) {
			expect(record).toBeTruthy();
			for (const auditEntry of record?.audit ?? []) {
				expect(auditEntry.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
				expect(auditEntry.actor.length).toBeGreaterThan(0);
				expect(auditEntry.reason.length).toBeGreaterThan(0);
			}
		}
	}, 30_000);
});
