// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EMPTY_SYSTEMS_STATE, SESSION_WORKFLOW_STATES } from '@dndtools/core';
import { I18nProvider } from '../../i18n';
import { DicePanel } from './DiceTray';

vi.mock('../../runtime/RuntimeContext', () => ({
	useRuntime: () => ({
		activeActorId: 'dm',
		state: {
			systems: EMPTY_SYSTEMS_STATE,
			permissions: { actors: { dm: { id: 'dm', role: 'dm', displayName: 'DM' } } },
		},
	}),
}));

describe('roll history workflow attribution', () => {
	it.each(SESSION_WORKFLOW_STATES)(
		'labels a roll made in %s from its recorded workflow',
		(workflow) => {
			const html = renderToStaticMarkup(
				<I18nProvider>
					<DicePanel
						rolls={[
							{
								id: 'roll',
								expression: '1d20',
								total: 12,
								label: 'Check',
								dice: [12],
								modifier: 0,
								workflow,
							},
						]}
						isLive={true}
						previewing={false}
						expr="1d20"
						label=""
						onExpr={() => {}}
						onLabel={() => {}}
						onRoll={() => {}}
					/>
				</I18nProvider>,
			);
			expect(html.includes('Outside a session')).toBe(workflow !== 'active');
		},
	);
});
