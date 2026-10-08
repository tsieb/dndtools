import { useI18n } from '../../../i18n';
import { TablesPanel, type TableView } from '../../../screens/session/Tables';
import {
	useSessionDispatch,
	useSessionSeat,
	useTablesView,
} from '../../../screens/session/useSessionView';

/**
 * The Session screen's rollable tables (RC-CAN-7.8, SCREENS_PARITY SE-16): draw a `dice-table`
 * object (`dice.roll-table`, recorded to the dice log) and pin or unpin it for quick reference.
 */
export function SessionTablesBody() {
	const { t } = useI18n();
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { tables, draws, pins } = useTablesView();
	return (
		<TablesPanel
			tables={tables}
			draws={draws}
			pins={pins}
			isDm={isDm}
			previewing={previewing}
			onRoll={(table: TableView) =>
				void dispatch({
					type: 'dice.roll-table',
					actorId,
					payload: { tableItemId: table.id, label: table.title },
				})
			}
			onPin={(table: TableView) =>
				void dispatch(
					{
						type: 'session.pin-quick-reference',
						actorId,
						payload: { kind: 'dice-table', label: table.title, targetId: table.id },
					},
					t('session.tables.pinned'),
				)
			}
			onUnpin={(panelId: string) =>
				void dispatch(
					{ type: 'session.unpin-quick-reference', actorId, payload: { panelId } },
					t('session.tables.unpinned'),
				)
			}
		/>
	);
}
