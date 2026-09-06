import { Avatar, Badge, Button, IconButton, Input } from '../../../ds';
import { useI18n } from '../../../i18n';
import { T } from '../../screen-kit';
import { MAX_PARTY_NOTE_CHARS } from '../shared';

/** Step 6 — the optional, device-local party notes. No invitation is implied or sent. Extracted
 * from Onboarding.tsx unchanged (RC-STB-2.6). */
export function PlayersStep({
	emails,
	setEmails,
	draft,
	setDraft,
	addEmail,
}: {
	emails: string[];
	setEmails: (update: (previous: string[]) => string[]) => void;
	draft: string;
	setDraft: (value: string) => void;
	addEmail: () => void;
}) {
	const { t } = useI18n();
	return (
		<div style={{ paddingTop: 14 }}>
			<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
				{t('onboarding.players.title')}
			</h2>
			<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
				{t('onboarding.players.intro')}
			</p>
			<div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
				<Input
					value={draft}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
					onKeyDown={(e: React.KeyboardEvent) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							addEmail();
						}
					}}
					placeholder={t('onboarding.players.field')}
					aria-label={t('onboarding.players.field')}
					maxLength={MAX_PARTY_NOTE_CHARS}
					style={{ flex: 1, minWidth: 0 }}
				/>
				<Button variant="secondary" icon="add" onClick={addEmail}>
					{t('common.action.add')}
				</Button>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
				{emails.map((e, j) => (
					<div
						key={e}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 11,
							padding: '9px 12px',
							borderRadius: 10,
							background: T.surf,
							border: `1px solid ${T.bd}`,
						}}
					>
						<Avatar name={e.split('@')[0]} size="sm" />
						<span
							style={{
								flex: 1,
								minWidth: 0,
								font: `12.5px ${T.sans}`,
								overflowWrap: 'anywhere',
							}}
						>
							{e}
						</span>
						<span style={{ flex: '0 0 auto' }}>
							<Badge status="info">{t('onboarding.players.savedOnDevice')}</Badge>
						</span>
						<IconButton
							icon="close"
							label={t('onboarding.players.remove', { name: e })}
							variant="ghost"
							size="sm"
							onClick={() => setEmails((arr) => arr.filter((_, k) => k !== j))}
						/>
					</div>
				))}
				{emails.length === 0 && (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter, padding: '10px 0' }}>
						{t('onboarding.players.empty')}
					</div>
				)}
			</div>
		</div>
	);
}
