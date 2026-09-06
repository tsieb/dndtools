import { useLocation, useNavigate } from 'react-router-dom';
import { Sheet } from '../../ds';
import { useI18n } from '../../i18n';
import { activeSectionId } from '../nav';
import { ALL_SECTIONS, PHONE_TABS, SECTION_PATH } from './sections';
import { SideRow } from './rows';

/** Phone: the bottom sheet listing every section that does not fit in the tab bar. Extracted from
 * AppShell.tsx's PhoneNav unchanged (RC-STB-2.6). */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = useLocation();
	const active = activeSectionId(location.pathname);
	const hotIds = new Set(PHONE_TABS.map((s) => s.id));
	const rest = ALL_SECTIONS.filter((s) => !hotIds.has(s.id));
	return (
		<Sheet open={open} onClose={onClose} side="bottom" title={t('shell.allSections')}>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'minmax(0,1fr)',
					gap: 4,
					paddingBottom: 8,
				}}
			>
				{rest.map((s) => (
					<SideRow
						key={s.id}
						icon={s.icon}
						label={s.label}
						sub={s.sub}
						active={active === s.id}
						onClick={() => {
							onClose();
							navigate(SECTION_PATH[s.id] ?? '/');
						}}
					/>
				))}
			</div>
		</Sheet>
	);
}
