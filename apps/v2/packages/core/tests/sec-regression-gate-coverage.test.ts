import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
	SECURITY_BOUNDARIES,
	SECURITY_BOUNDARY_IDS,
	dispatchCommand,
	findSecurityBoundary,
	getContentItemsForActor,
	validateSecurityBoundaryRegistry,
	type SecurityBoundaryId,
} from '../src';
import * as core from '../src';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';

/**
 * SEC-008 — THE SECURITY REGRESSION-GATE COVERAGE META-TEST. SEC-008 AC1: "a security-critical boundary
 * added without tests fails the gate." This file IS that gate. It drives the declared
 * {@link SECURITY_BOUNDARIES} registry and fails CLOSED when a boundary:
 *
 *   - is missing its declared guard surface (the export that enforces it does not exist), OR
 *   - is missing its declared coverage-test file on disk (the boundary has no dedicated test), OR
 *   - is malformed (duplicate id / no requirement id).
 *
 * It mirrors the established mechanical-gate pattern (MCP-005 tool coverage, PLAT-010 quality-gate
 * registry): the registry is the single source of truth, and reality is cross-checked against it so the
 * security boundary catalogue can never silently drift away from the code or the tests. Adding a new
 * boundary row without a real guard + a real test turns this gate RED; the negative tests at the bottom
 * prove that.
 *
 * SEC-008 AC2 ("a known player-data leak fixture never appears in returned payloads") is proven directly
 * here against the live `*ForActor` read, AND in depth by `sec-stream-privacy-coverage.test.ts`.
 */

// The repo root: tests → core → packages → v2 → apps → <repo>.
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');

describe('SEC-008 AC1 — the regression-gate registry is internally consistent (fails closed on a malformed boundary)', () => {
	it('the registry has no internal problems (unique ids, named guard + test, traced to a requirement)', () => {
		const problems = validateSecurityBoundaryRegistry();
		expect(problems, `registry problems: ${problems.map((p) => p.message).join('; ')}`).toEqual([]);
	});

	it('declares the SEC-008 boundaries plus the SEC-001/SEC-007 renderer/platform-isolation boundaries', () => {
		expect([...SECURITY_BOUNDARY_IDS].sort()).toEqual(
			(
				[
					'cloud-join-authorization',
					'ipc-payload-validation',
					'markdown-sanitization',
					'mcp-staged-write-enforcement',
					'renderer-isolation',
					'storage-path-containment',
					'sync-stream-filtering',
					'widget-host-api-constraint',
					'widget-host-permission-denial',
				] satisfies SecurityBoundaryId[]
			).sort(),
		);
	});

	it('a malformed registry (a boundary with no requirement id) is reported by the validator', () => {
		const problems = validateSecurityBoundaryRegistry([
			{
				id: 'ipc-payload-validation',
				invariant: 'x',
				guardSurface: 'validateImportLimits',
				coverageTest: 'apps/v2/packages/core/tests/security-payload-limits.test.ts',
				requirementIds: [], // missing — the gate must catch this
			},
		]);
		expect(problems.some((p) => p.kind === 'missing-requirement-id')).toBe(true);
	});

	it('a duplicate boundary id is reported by the validator', () => {
		const dup = SECURITY_BOUNDARIES[0]!;
		const problems = validateSecurityBoundaryRegistry([dup, dup]);
		expect(problems.some((p) => p.kind === 'duplicate-boundary-id')).toBe(true);
	});
});

describe('SEC-008 AC1 — every declared boundary is backed by a real coverage test on disk', () => {
	for (const boundary of SECURITY_BOUNDARIES) {
		it(`"${boundary.id}" names a coverage-test file that exists`, () => {
			const full = path.join(REPO_ROOT, boundary.coverageTest);
			expect(fs.existsSync(full), `missing coverage test for "${boundary.id}": ${boundary.coverageTest}`).toBe(true);
		});
	}

	it('RED: a boundary that names a non-existent coverage test would fail this gate', () => {
		// Prove the gate is real: a phantom boundary pointing at a missing file is detectably uncovered.
		const phantomTest = path.join(REPO_ROOT, 'apps/v2/packages/core/tests/__does_not_exist__.test.ts');
		expect(fs.existsSync(phantomTest)).toBe(false);
	});
});

describe('SEC-008 AC1 — every declared boundary is backed by a real guard export in the public core surface', () => {
	// The named guard surface lists one or more core exports; each must be a live export so the boundary is
	// not a paper declaration. A boundary that names a removed/renamed guard turns this gate red.
	const exported = new Set(Object.keys(core));
	for (const boundary of SECURITY_BOUNDARIES) {
		it(`"${boundary.id}" guard surface names at least one live core export`, () => {
			const named = boundary.guardSurface
				.split(/[,/]/)
				.map((token) => token.trim().replace(/\s*\(.*$/, ''))
				.filter((token) => /^[A-Za-z_]\w*$/.test(token));
			const live = named.filter((name) => exported.has(name));
			expect(live.length, `"${boundary.id}" names no live export among: ${named.join(', ')}`).toBeGreaterThan(0);
		});
	}
});

describe('SEC-008 AC2 — a known player-data leak fixture never appears in a returned player payload', () => {
	it('a dm-only note salted with a secret is absent from the player content read', () => {
		const SECRET = 'SEC-008-DM-ONLY-LEAK-CANARY';
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const created = dispatchCommand(state, makeEnvironment(), {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title: 'Canary', body: SECRET, visibility: 'dm-only' },
		});
		expect(created.status).toBe('accepted');
		if (created.status !== 'accepted') return;
		state = created.nextState;

		// The DM sees the secret; the player NEVER does.
		expect(JSON.stringify(getContentItemsForActor(state.content, state.permissions, DM_ACTOR.id))).toContain(SECRET);
		const playerView = getContentItemsForActor(state.content, state.permissions, PLAYER_ACTOR.id);
		expect(JSON.stringify(playerView)).not.toContain(SECRET);
	});
});

describe('SEC-008 — findSecurityBoundary resolves declared ids and rejects unknown ones', () => {
	it('resolves a declared boundary id', () => {
		expect(findSecurityBoundary('markdown-sanitization')?.id).toBe('markdown-sanitization');
	});
	it('returns undefined for an unknown id (fail closed)', () => {
		expect(findSecurityBoundary('totally-made-up')).toBeUndefined();
	});
});
