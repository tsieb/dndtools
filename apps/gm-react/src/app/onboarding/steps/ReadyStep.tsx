import { Icon } from '../../../ds';
import { useI18n, type MessageKey } from '../../../i18n';
import { T } from '../../screen-kit';

/** Step 7 — the table-readiness checklist, read live from the vault, plus the three orientation
 * cards. Extracted from Onboarding.tsx unchanged (RC-STB-2.6). */
export function ReadyStep({
	isDesktop,
	vault,
	wiping,
	checklist,
	tour,
	finish,
}: {
	isDesktop: boolean;
	vault: 'sample' | 'fresh';
	wiping: boolean;
	checklist: Array<{ id: string; label: MessageKey; done: boolean; to: string; dest: MessageKey }>;
	tour: Array<{ id: string; title: MessageKey; body: MessageKey }>;
	finish: (to?: string) => Promise<void>;
}) {
	const { t } = useI18n();
	return (
		<div style={{ paddingTop: 14 }}>
			<h2 style={{ margin: '0 0 4px', font: `700 21px ${T.disp}` }}>
				{t('onboarding.ready.title')}
			</h2>
			<p style={{ margin: '0 0 18px', font: `13px ${T.sans}`, color: T.ter }}>
				{t('onboarding.ready.intro')}
			</p>
			{vault === 'fresh' && (
				// The checklist is derived from the SAMPLE vault, which finishing is about to erase —
				// saying so here stops the ticked rows from reading as a promise about what survives.
				<div
					style={{
						display: 'flex',
						gap: 9,
						alignItems: 'flex-start',
						padding: '10px 12px',
						borderRadius: 10,
						margin: '0 0 16px',
						background: 'var(--color-status-warning-subtle)',
						border: `1px solid var(--color-status-warning-border)`,
						font: `12.5px ${T.sans}`,
						color: 'var(--color-status-warning-text)',
					}}
				>
					<Icon name="warning" size={15} />
					<span>{t('onboarding.ready.freshWarning')}</span>
				</div>
			)}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr',
					gap: 16,
					alignItems: 'start',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{checklist.map((c) => (
						<button
							key={c.id}
							type="button"
							disabled={wiping}
							// The row is a COMPLETION shortcut, not a plain link: it ends setup and, when
							// the user chose "start fresh", applies the sample wipe. "A map is in the
							// atlas" alone announces none of that, so name the consequence.
							aria-label={t(
								vault === 'fresh' ? 'onboarding.ready.rowFresh' : 'onboarding.ready.row',
								{ label: t(c.label), dest: t(c.dest) },
							)}
							onClick={() => void finish(c.to)}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								padding: '10px 12px',
								borderRadius: 10,
								background: T.surf,
								border: `1px solid ${c.done ? T.bd : T.accBd}`,
								cursor: 'pointer',
								textAlign: 'left',
							}}
						>
							<span
								style={{
									width: 20,
									height: 20,
									borderRadius: '50%',
									flex: '0 0 auto',
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: c.done ? T.ok : 'transparent',
									border: `1.5px solid ${c.done ? T.ok : T.bdS}`,
									color: T.accFg,
								}}
							>
								{c.done && <Icon name="check" size={12} />}
							</span>
							<span
								style={{
									flex: 1,
									font: `12.5px ${T.sans}`,
									color: c.done ? T.ter : T.ink,
									textDecoration: c.done ? 'line-through' : 'none',
								}}
							>
								{t(c.label)}
							</span>
							<Icon name="chevron-right" size={13} color={T.ter} />
						</button>
					))}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{tour.map((card) => (
						<div
							key={card.id}
							style={{
								padding: 12,
								borderRadius: 10,
								background: T.accSub,
								border: `1px solid ${T.accBd}`,
							}}
						>
							<div style={{ font: `600 12.5px ${T.sans}`, color: T.acc, marginBottom: 3 }}>
								{t(card.title)}
							</div>
							<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>{t(card.body)}</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
