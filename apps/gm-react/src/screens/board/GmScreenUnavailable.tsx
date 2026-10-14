import { useState } from 'react';
import { Button, EmptyState } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { Page } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { BoardPlayerNotice } from './BoardPlayerNotice';

/**
 * RC-CAN-7.9 — what `/board` draws when it cannot resolve to the GM screen, in place of the bespoke
 * board page. A non-GM gets the player notice (the GM screen is GM-only). For the GM it means the
 * provisioning write failed to persist, so it says so honestly and Retry asks again, as `/` and
 * `/session` do; once the write lands, `ScreenRouteAliases` takes `/board` to the screen.
 * RC-POL-1.2 moved it out of `Board.tsx`.
 */
export function GmScreenUnavailable() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
	const [phase, setPhase] = useState<'failed' | 'asking' | 'done'>('failed');
	if (!isDm) return <BoardPlayerNotice />;
	if (phase === 'done') return null;
	const retry = () => {
		setPhase('asking');
		// `dispatch` rethrows a persist failure; a rejection is reported in its result.
		void Promise.resolve(
			runtime.dispatch({
				type: 'command-center.ensure-home',
				actorId,
				payload: {},
			}),
		)
			.then((result) => setPhase(result.status === 'accepted' ? 'done' : 'failed'))
			.catch(() => setPhase('failed'));
	};
	return (
		<Page>
			<EmptyState
				icon="widget"
				title={t('board.setupFailed')}
				description={t('home.setupFailedHint')}
				action={
					<Button
						variant="secondary"
						size="sm"
						icon="refresh"
						disabled={phase === 'asking'}
						onClick={retry}
					>
						{t('common.action.retry')}
					</Button>
				}
			/>
		</Page>
	);
}
