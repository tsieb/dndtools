import { Card } from '../../ds';
import { Page } from '../../app/screen-kit';
import { useI18n } from '../../i18n';

/**
 * What a player sees at `/board`: the DM's spatial console is DM-only, so this says so plainly
 * rather than rendering an empty canvas.
 *
 * A pure move out of `Board.tsx` (RC-ENG-2.2 — that screen had grown past the RC-STB-2.7 file-size
 * limit). The markup is unchanged.
 */
export function BoardPlayerNotice() {
	const { t } = useI18n();
	return (
		// `<Page>` rather than a bare max-width div: the raw div has no padding, so on a phone this
		// explainer Card sat flush against both screen edges — every other screen's non-DM/empty
		// state goes through Page and gets the profile's gutters.
		<Page max={640}>
			<Card
				elevation="raised"
				padding="lg"
				style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
			>
				<span
					style={{
						font: '700 var(--text-lg) var(--font-display)',
						color: 'var(--color-text-primary)',
					}}
				>
					{t('board.playerTitle')}
				</span>
				<span
					style={{
						font: 'var(--text-sm) var(--font-sans)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{t('board.playerBody')}
				</span>
			</Card>
		</Page>
	);
}
