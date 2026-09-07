import { ConditionBadge, Dialog, useConditionCatalog } from '../../ds';
import { useI18n } from '../../i18n';
import { T } from '../../app/screen-kit';
import type { CombatantRow } from '../../app/combat/HpKeypadSheet';

// ── Condition picker (design-b condPick modal, wired to combat.apply-resource) ────────────────────

export function ConditionPickerDialog({
	target,
	onClose,
	onPick,
}: {
	target: CombatantRow | null;
	onClose: () => void;
	onPick: (combatantId: string, condition: string) => void;
}) {
	const { t } = useI18n();
	// RC-SYS-2.3 — the ACTIVE system package decides what can be applied, in the order it authored.
	const { conditions } = useConditionCatalog();
	const present = new Set(target?.resources?.conditions ?? []);
	const keys = conditions.map((c) => c.key).filter((k) => !present.has(k));
	return (
		<Dialog
			open={!!target}
			onClose={onClose}
			title={
				target
					? t('session.combat.addConditionFor', { name: target.name })
					: t('session.combat.addCondition')
			}
			description={t('session.combat.addConditionHelp')}
			icon="cond-poisoned"
			size="md"
		>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
				{keys.map((k) => (
					<button
						key={k}
						type="button"
						aria-label={t('session.combat.addNamedCondition', {
							condition: conditions.find((c) => c.key === k)?.label ?? k,
						})}
						onClick={() => target && onPick(target.id, k)}
						style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
					>
						<ConditionBadge condition={k} />
					</button>
				))}
				{keys.length === 0 && (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{t(
							conditions.length === 0
								? 'session.combat.noSystemConditions'
								: 'session.combat.allConditionsApplied',
						)}
					</div>
				)}
			</div>
		</Dialog>
	);
}
