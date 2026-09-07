import { Badge } from '../../ds';
import { useViewport } from '../../app/useViewport';
import { PartyQuickPanel, PartySheet } from '../../app/character/PartyPanel';
import { useI18n } from '../../i18n';
import { Panel, PvPage, SectionHead, type LiveData } from './shared';

// 4 · PARTY — the visible party (PCs), from the actor-filtered overview.
//
// RC-CHR-3.1: the rows themselves live in `app/character/PartyPanel.tsx` so the board tile, this
// section and the sheet all paint ONE shape (`data.partyVitals`) — the DM device computes it through
// the same actor-filtered queries and replicates it verbatim to a joined player. On a phone the
// section drops to the quick panel: same vitals, no per-level slot expansion competing for the width.
export function PartySection({ data }: { data: LiveData }) {
	const { t } = useI18n();
	const viewport = useViewport();
	const members = data.partyVitals;
	return (
		<PvPage max={1140}>
			<SectionHead
				title={t('play.party.title')}
				sub={t('play.party.sub')}
				action={
					<Badge status="neutral">{t('play.party.members', { count: members.length })}</Badge>
				}
			/>
			<Panel title={t('play.party.roster')}>
				{viewport === 'phone' ? (
					<PartyQuickPanel members={members} />
				) : (
					<PartySheet members={members} />
				)}
			</Panel>
		</PvPage>
	);
}
