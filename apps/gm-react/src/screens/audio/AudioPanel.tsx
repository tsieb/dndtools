import type { ComponentProps } from 'react';
import { Panel } from '../../app/screen-kit';
import { Icon } from '../../ds';
import { useI18n } from '../../i18n';

/** Keep compact panel headings in Inter; Cinzel belongs to the shell's large heading. */
export function AudioPanel({ title, style, ...props }: ComponentProps<typeof Panel>) {
	const { t } = useI18n();
	return (
		<Panel
			{...props}
			style={{ borderInlineStart: 'var(--space-1) solid var(--color-dm-only-badge)', ...style }}
			title={
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						font: '600 var(--text-base) var(--font-sans)',
					}}
				>
					<Icon name="lock" size="sm" aria-label={t('audio.tracks.dmOnly')} />
					{title}
				</span>
			}
		/>
	);
}
