import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	getGraphClustersForActor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { seedDemoContent } from './demo-seed';

/**
 * RC-KNW-4.1 ACCEPTANCE — clusters and momentum measured on the REAL demo vault (the seeded Saltreach
 * campaign the app ships), not on a hand-built fixture. The point is that the algorithm says something
 * useful about content a DM actually has: the seeded notes link into arcs rather than dissolving into
 * singletons, and because the seed writes everything "now", nothing in it reads as dormant until time
 * passes. `now` is passed explicitly, so this asserts on a fixed instant and never on the wall clock.
 */

async function seededDemoVault(): Promise<CoreStateSlice> {
	const env = makeEnvironment();
	// The demo seed drafts a character per player, so all three seats must exist for a clean seed.
	let state = buildInitialState(
		DM_ACTOR,
		...['actor-player', 'actor-player-2', 'actor-player-3'].map((id, i) => ({
			id,
			role: 'player' as const,
			displayName: `Player ${i + 1}`,
		})),
	);
	const runtime = {
		get state(): CoreStateSlice {
			return state;
		},
		defaultActorId: DM_ACTOR.id,
		async dispatch(command: CoreCommand): Promise<CommandResult> {
			const result = dispatchCommand(state, env, command);
			state = result.nextState;
			return result;
		},
	};
	await seedDemoContent(runtime as unknown as Parameters<typeof seedDemoContent>[0]);
	return state;
}

// The fixture clock stamps the seed at 2026-06-03; these are days and months after it.
const JUST_AFTER_SEEDING = '2026-06-05T00:00:00.000Z';
const A_SEASON_LATER = '2026-12-01T00:00:00.000Z';

describe('RC-KNW-4.1 — clusters and momentum on the demo vault', () => {
	it('the seeded notes form at least one multi-note arc with a named anchor', async () => {
		const state = await seededDemoVault();
		const report = getGraphClustersForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			JUST_AFTER_SEEDING,
		);
		const arcs = report.clusters.filter((cluster) => cluster.size > 1);
		expect(arcs.length).toBeGreaterThan(0);
		expect(arcs[0]!.label).not.toBe('');
		expect(arcs[0]!.memberTitles).toHaveLength(arcs[0]!.memberIds.length);
	});

	it('every seeded note lands in exactly one cluster', async () => {
		const state = await seededDemoVault();
		const report = getGraphClustersForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			JUST_AFTER_SEEDING,
		);
		const memberIds = report.clusters.flatMap((cluster) => cluster.memberIds);
		expect(new Set(memberIds).size).toBe(memberIds.length);
		const noteCount = Object.values(
			state.content.items as Record<string, { kind: string; deletedAt?: string }>,
		).filter((item) => item.kind === 'note' && !item.deletedAt).length;
		expect(memberIds).toHaveLength(noteCount);
	});

	it('a just-seeded vault is all momentum and no dormant arcs; months later it has gone quiet', async () => {
		const state = await seededDemoVault();
		const fresh = getGraphClustersForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			JUST_AFTER_SEEDING,
		);
		expect(fresh.dormantArcs).toEqual([]);
		expect(fresh.clusters.every((cluster) => cluster.momentum === 1)).toBe(true);

		const later = getGraphClustersForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			A_SEASON_LATER,
		);
		expect(later.dormantArcs.length).toBeGreaterThan(0);
		expect(later.dormantArcs.every((cluster) => cluster.size > 1)).toBe(true);
	});

	it('is deterministic — the same demo vault reports the same arcs twice', async () => {
		const state = await seededDemoVault();
		const once = getGraphClustersForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			JUST_AFTER_SEEDING,
		);
		const twice = getGraphClustersForActor(
			state.content,
			state.permissions,
			DM_ACTOR.id,
			JUST_AFTER_SEEDING,
		);
		expect(twice).toEqual(once);
	});
});
