// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	EMPTY_SYSTEMS_STATE,
	SESSION_WORKFLOW_STATES,
	allowedTransitionsFrom,
	type SessionWorkflowState,
} from '@dndtools/core';
import { I18nProvider } from '../../i18n';
import { DicePanel } from './DiceTray';
import { HandoutsPanel } from './Handouts';
import { SessionHeader, StandbyStatus } from './Lifecycle';
import { TablesPanel } from './Tables';

vi.mock('../../runtime/RuntimeContext', () => ({
	useRuntime: () => ({
		activeActorId: 'dm',
		state: {
			systems: EMPTY_SYSTEMS_STATE,
			permissions: { actors: { dm: { id: 'dm', role: 'dm', displayName: 'DM' } } },
		},
	}),
}));

// RC-SES-6.2 — the Session screen's table tools are not gated on the workflow. Rendered in every
// state, the dice, table and handout controls are operable, nothing tells the DM to "go live", and
// while no session runs the header's one primary starts one and the status says only that nothing
// is logged yet.

function render(workflow: SessionWorkflowState): Document {
	const html = renderToStaticMarkup(
		<I18nProvider>
			<SessionHeader
				workflow={workflow}
				sceneName={null}
				sessionTitle={null}
				previewing={false}
				isDm
				canStart={allowedTransitionsFrom(workflow).includes('active')}
				onSetWorkflow={() => {}}
				onStart={() => {}}
				onEnd={() => {}}
			/>
			{workflow !== 'active' && (
				<StandbyStatus
					workflow={workflow}
					canStart={allowedTransitionsFrom(workflow).includes('active')}
					t={(key) => key}
				/>
			)}
			<DicePanel
				rolls={[]}
				previewing={false}
				expr="1d20"
				label=""
				onExpr={() => {}}
				onLabel={() => {}}
				onRoll={() => {}}
			/>
			<TablesPanel
				tables={[
					{ id: 't1', title: 'Weather', dice: '1d4', rows: ['a', 'b', 'c', 'd'], maxTotal: 4 },
				]}
				draws={new Map()}
				pins={[]}
				isDm
				previewing={false}
				onRoll={() => {}}
				onPin={() => {}}
				onUnpin={() => {}}
			/>
			<HandoutsPanel
				handouts={[]}
				status={[]}
				isDm
				previewing={false}
				canDeliver
				title="A letter"
				body=""
				onTitle={() => {}}
				onBody={() => {}}
				onDeliver={() => {}}
				onRevoke={() => {}}
				onAcknowledge={() => {}}
			/>
		</I18nProvider>,
	);
	return new DOMParser().parseFromString(html, 'text/html');
}

function button(doc: Document, name: string | RegExp): HTMLButtonElement {
	const found = [...doc.querySelectorAll('button')].find((b) =>
		typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''),
	);
	if (!found) throw new Error(`no button ${String(name)}`);
	return found;
}

function operable(el: HTMLButtonElement): boolean {
	return !el.disabled && el.getAttribute('aria-disabled') !== 'true';
}

describe.each(SESSION_WORKFLOW_STATES)('the Session screen in %s', (workflow) => {
	it('rolls, draws and pushes without a live gate', () => {
		const doc = render(workflow);
		expect(operable(button(doc, '1d20'))).toBe(true);
		expect(operable(button(doc, 'Roll'))).toBe(true);
		const tableRoll = doc.querySelector('[data-testid="table-row-t1"] button');
		expect(tableRoll && operable(tableRoll as HTMLButtonElement)).toBe(true);
		expect(operable(button(doc, 'Push to players'))).toBe(true);
	});

	it('never tells the DM to go live', () => {
		const doc = render(workflow);
		const text = `${doc.body.textContent ?? ''} ${[...doc.querySelectorAll('[title],[aria-label]')]
			.map((el) => `${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''}`)
			.join(' ')}`;
		expect(text).not.toMatch(/\bgo(?:es|ing)?\s+live\b/i);
	});

	it('offers Start session as the header primary only while no session runs', () => {
		const doc = render(workflow);
		const start = [...doc.querySelectorAll('button')].find(
			(b) => b.textContent?.trim() === 'Start session',
		);
		if (workflow === 'active') {
			expect(start).toBeUndefined();
			return;
		}
		expect(start).toBeDefined();
		const canStart = allowedTransitionsFrom(workflow).includes('active');
		expect(start!.getAttribute('aria-disabled') === 'true').toBe(!canStart);
		expect(start!.getAttribute('title')).toEqual(
			canStart
				? 'Starts the session log, the clock and the automations.'
				: expect.stringMatching(/return to Standby before starting a session/),
		);
		expect(doc.body.textContent).toContain('session.standby.notRecording');
	});
});
