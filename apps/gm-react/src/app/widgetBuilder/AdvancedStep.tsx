import type { WidgetHostPermission } from '@dndtools/core';
import { Badge, Checkbox, Textarea } from '../../ds';
import { T } from '../screen-kit';
import { StepHeader, StepSection, ToggleGroup, type StepProps } from './fields';
import { HOST_PERMISSIONS, HOST_PERMISSION_LABEL } from './vocabulary';
import { useI18n } from '../../i18n';

/**
 * Advanced — the host permissions the package asks for, and the portability notes that travel with
 * it (RC-WID-2.1).
 *
 * Permissions here are a REQUEST, never a grant: a package installs unreviewed with every host
 * permission denied, and there is no trust-review command in this build, so asking for one is a
 * declaration a reviewer will read rather than access the widget receives. The step says so instead
 * of implying a toggle grants anything.
 *
 * RC-WID-2.5 turns this step into the custom HTML/JS editor once the WID-1.3 sandbox exists; a
 * template widget needs no code, which is why nothing here writes any.
 */

export function AdvancedStep({ draft, patch }: StepProps) {
	const { t } = useI18n();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader title={t('builder.advanced.title')} help={t('builder.advanced.help')} />
			<StepSection title={t('builder.advanced.permsTitle')} help={t('builder.advanced.permsHelp')}>
				<ToggleGroup legend={t('builder.advanced.permsLegend')}>
					{HOST_PERMISSIONS.map((permission: WidgetHostPermission) => (
						<Checkbox
							key={permission}
							checked={draft.hostPermissions.includes(permission)}
							label={t(HOST_PERMISSION_LABEL[permission])}
							onChange={() =>
								patch({
									hostPermissions: draft.hostPermissions.includes(permission)
										? draft.hostPermissions.filter((entry) => entry !== permission)
										: [...draft.hostPermissions, permission],
								})
							}
						/>
					))}
				</ToggleGroup>
				{draft.hostPermissions.length > 0 && (
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
						<Badge status="warning" icon="warning">
							{t('extensions.plugins.needsReview')}
						</Badge>
						<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
							{t('builder.advanced.permsWarning')}
						</span>
					</div>
				)}
			</StepSection>
			<StepSection title={t('builder.advanced.notesTitle')} help={t('builder.advanced.notesHelp')}>
				<Textarea
					value={draft.portabilityWarnings.join('\n')}
					rows={3}
					aria-label={t('builder.advanced.notesTitle')}
					placeholder={t('builder.advanced.notesPlaceholder')}
					onChange={(e: { target: { value: string } }) =>
						patch({
							portabilityWarnings: e.target.value
								.split('\n')
								.map((line) => line.trim())
								.filter(Boolean),
						})
					}
				/>
			</StepSection>
			<StepSection title={t('extensions.plugins.customCode')}>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					{t('builder.advanced.customCodeBody')}
				</div>
			</StepSection>
		</div>
	);
}
