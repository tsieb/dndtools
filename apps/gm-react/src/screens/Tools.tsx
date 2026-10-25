import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '../ds';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { sectionLabelKey, sectionSubtitleKey, TOOLS } from '../app/nav';
import { Page, Panel, T } from '../app/screen-kit';
import { isSectionShown } from '../app/shell/sections';
import { useSettingsTier } from './settings/Experience';

/**
 * Tools — IA-1's sixth primary section (RC-ENG-15.1). An additive landing, not an alias: Audio,
 * Extensions and Community keep their own routes, state and bookmarks, and this page only links to
 * them. The experience tier still decides which links show (RC-UX-6.4); a hidden tool's route stays
 * open, so the page says so instead of pretending the tool is gone. No plan or account promotion
 * lives here — Plans & cloud belongs to Settings.
 */
export function Tools() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const runtime = useRuntime();
	const tier = useSettingsTier();
	const shown = TOOLS.filter((s) => isSectionShown(s.id, runtime.state, tier));
	return (
		<Page max={960}>
			<p style={{ margin: `0 0 ${T.space.four}`, font: `13.5px ${T.sans}`, color: T.sub }}>
				{t('tools.intro')}
			</p>
			<ul
				style={{
					listStyle: 'none',
					margin: T.space.zero,
					padding: T.space.zero,
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
					gap: T.space.three,
				}}
			>
				{shown.map((s) => {
					const name = t(s.labelKey);
					const sub = sectionSubtitleKey(s.id);
					return (
						<li key={s.id} style={{ display: 'flex', minWidth: 0 }}>
							<Panel
								title={
									<span style={{ display: 'inline-flex', alignItems: 'center', gap: T.space.two }}>
										<Icon name={s.icon} size="sm" color={T.acc} />
										{t(sectionLabelKey(s.id))}
									</span>
								}
								style={{ flex: 1 }}
							>
								{sub && (
									<p
										style={{ margin: T.space.zero, font: `13px ${T.sans}`, color: T.sub, flex: 1 }}
									>
										{t(sub)}
									</p>
								)}
								<div>
									<Button onClick={() => navigate(s.path)}>{t('tools.open', { name })}</Button>
								</div>
							</Panel>
						</li>
					);
				})}
			</ul>
			{shown.length < TOOLS.length && (
				<p
					style={{
						margin: `${T.space.four} 0 0`,
						display: 'flex',
						flexWrap: 'wrap',
						alignItems: 'center',
						gap: T.space.two,
						font: `13px ${T.sans}`,
						color: T.sub,
					}}
				>
					<span>{t('tools.gated')}</span>
					<Button variant="ghost" size="sm" onClick={() => navigate('/settings?tab=appearance')}>
						{t('tools.gatedAction')}
					</Button>
				</p>
			)}
		</Page>
	);
}
