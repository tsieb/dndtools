import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, IconButton, NavRail } from '../../ds';
import { useI18n } from '../../i18n';
import { activeSectionId } from '../nav';
import { T } from '../screen-kit';
import { ALL_SECTIONS, SECTION_PATH } from './sections';
import { useSessionPosture } from './session-posture';

/** Tablet: the DS NavRail — icon-only, labels move to the accessible name/tooltip. */
export function RailNav({ onOpenPalette }: { onOpenPalette: () => void }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const location = useLocation();
	const active = activeSectionId(location.pathname);
	// RC-SES-1.1 — one source for "live" across all three navigations: the session workflow.
	const live = useSessionPosture().live;
	return (
		<NavRail
			width={64}
			style={{
				width: 'calc(64px + var(--safe-area-left, 0px))',
				padding:
					'calc(var(--space-2) + var(--safe-area-top, 0px)) var(--space-2) calc(var(--space-2) + var(--safe-area-bottom, 0px)) calc(var(--space-2) + var(--safe-area-left, 0px))',
			}}
			items={ALL_SECTIONS.map((s) => ({
				key: s.id,
				icon: s.icon,
				label: t(s.labelKey),
				badge: s.liveBadge === true && live ? '•' : undefined,
			}))}
			active={active}
			onSelect={(id: string) => navigate(SECTION_PATH[id] ?? '/')}
			header={
				<span
					style={{
						width: 30,
						height: 30,
						borderRadius: 7,
						background: T.acc,
						color: T.accFg,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						boxShadow: T.ssm,
					}}
				>
					<Icon name="dice" size="sm" />
				</span>
			}
			footer={
				<IconButton
					icon="search"
					label={t('shell.searchShortcut')}
					variant="ghost"
					size="sm"
					onClick={onOpenPalette}
				/>
			}
		/>
	);
}
