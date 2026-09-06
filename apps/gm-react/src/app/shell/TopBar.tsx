import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon, IconButton, Sheet } from '../../ds';
import { useI18n } from '../../i18n';
import { ViewAsControl } from '../ViewAsControl';
import { ProjectionControl } from '../ProjectionControl';
import { HostSessionButton, AccountButton } from '../../net/SessionPanel';
import { useViewport } from '../useViewport';
import { activeSectionId, sectionLabelKey, sectionSubtitleKey } from '../nav';
import { T } from '../screen-kit';

/* The calm top bar — title / subtitle, ⌘K search, view-as + projection, and on compact widths the
 * overflow sheet that holds them. Extracted from AppShell.tsx unchanged (RC-STB-2.6). */

export function TopBar({
	onOpenPalette,
	viewport,
	compactToolbar,
}: {
	onOpenPalette: () => void;
	viewport: ReturnType<typeof useViewport>;
	compactToolbar: boolean;
}) {
	const { t } = useI18n();
	const location = useLocation();
	const [controlsOpen, setControlsOpen] = useState(false);
	const id = activeSectionId(location.pathname);
	// Title and subtitle are message keys (RC-UX-1.2) whose text may carry the system package's
	// vocabulary (RC-SYS-2.6) — "DM screen" under 5e, "GM screen" under Generic.
	const title = t(sectionLabelKey(id));
	const subtitleKey = sectionSubtitleKey(id);
	const sub = subtitleKey ? t(subtitleKey) : '';
	const compact = viewport !== 'desktop' || compactToolbar;
	return (
		<>
			<header
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: compact ? 6 : 14,
					padding:
						viewport === 'phone'
							? 'calc(10px + var(--safe-area-top, 0px)) max(12px, var(--safe-area-right, 0px)) 10px max(12px, var(--safe-area-left, 0px))'
							: compact
								? 'calc(11px + var(--safe-area-top, 0px)) max(16px, var(--safe-area-right, 0px)) 11px 16px'
								: 'calc(13px + var(--safe-area-top, 0px)) max(24px, var(--safe-area-right, 0px)) 13px 24px',
					borderBottom: `1px solid ${T.bd}`,
					background: 'color-mix(in srgb, var(--color-bg) 86%, transparent)',
					backdropFilter: 'blur(6px)',
					flex: '0 0 auto',
				}}
			>
				<div style={{ minWidth: 0, flex: '1 1 auto' }}>
					<h1
						style={{
							margin: 0,
							font: `700 ${viewport === 'phone' ? 17 : 21}px ${T.disp}`,
							letterSpacing: '-.01em',
							lineHeight: 1.15,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{title}
					</h1>
					{!compact && (
						<div
							style={{
								font: `12.5px ${T.sans}`,
								color: T.ter,
								marginTop: 1,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							{sub}
						</div>
					)}
				</div>
				{compact ? (
					<IconButton
						icon="search"
						label={t('shell.search')}
						variant="outline"
						size="lg"
						onClick={onOpenPalette}
					/>
				) : (
					<button
						type="button"
						onClick={onOpenPalette}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							padding: '8px 12px',
							flex: '1 1 150px',
							minWidth: 46,
							background: T.surf,
							border: `1px solid ${T.bd}`,
							borderRadius: 9,
							cursor: 'pointer',
							color: T.ter,
						}}
					>
						<Icon name="search" size="sm" />
						<span
							style={{
								flex: 1,
								textAlign: 'left',
								font: `13px ${T.sans}`,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							{t('shell.searchEverything')}
						</span>
						<span
							style={{
								font: `11px ${T.mono}`,
								color: T.ter,
								border: `1px solid ${T.bd}`,
								borderRadius: 5,
								padding: '1px 5px',
							}}
						>
							⌘K
						</span>
					</button>
				)}
				{viewport === 'phone' ? (
					<IconButton
						icon="session-bolt"
						label={t('shell.tableControls')}
						variant="outline"
						size="lg"
						onClick={() => setControlsOpen(true)}
					/>
				) : (
					<>
						<HostSessionButton compact />
						<ViewAsControl compact />
						<ProjectionControl compact />
						<AccountButton compact />
					</>
				)}
			</header>
			{viewport === 'phone' && (
				<Sheet
					open={controlsOpen}
					onClose={() => setControlsOpen(false)}
					side="bottom"
					title={t('shell.tableControls')}
				>
					<div
						className="table-controls-sheet"
						style={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							gap: 10,
							paddingBottom: 8,
						}}
					>
						<HostSessionButton />
						<ViewAsControl />
						<ProjectionControl />
						<AccountButton />
					</div>
				</Sheet>
			)}
		</>
	);
}
