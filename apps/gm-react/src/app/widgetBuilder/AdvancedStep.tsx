import type { WidgetHostPermission } from '@dndtools/core';
import { Badge, Checkbox, Textarea } from '../../ds';
import { T } from '../screen-kit';
import { StepHeader, StepSection, ToggleGroup, type StepProps } from './fields';
import { HOST_PERMISSIONS, HOST_PERMISSION_LABEL } from './vocabulary';

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
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<StepHeader
				title="Advanced"
				help="What the package asks the host for, and what a reviewer should know before trusting it."
			/>
			<StepSection
				title="Host permissions"
				help="Requested, not granted. Every package installs with all of these denied until a reviewer approves them."
			>
				<ToggleGroup legend="Requested host permissions">
					{HOST_PERMISSIONS.map((permission: WidgetHostPermission) => (
						<Checkbox
							key={permission}
							checked={draft.hostPermissions.includes(permission)}
							label={HOST_PERMISSION_LABEL[permission]}
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
							Needs review
						</Badge>
						<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
							A package asking for host permissions installs denied and stays denied until it is
							reviewed.
						</span>
					</div>
				)}
			</StepSection>
			<StepSection
				title="Portability notes"
				help="One per line. These travel with the package and are shown to anyone reviewing it."
			>
				<Textarea
					value={draft.portabilityWarnings.join('\n')}
					rows={3}
					aria-label="Portability notes"
					placeholder="Needs the party roster to be populated."
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
			<StepSection title="Custom code">
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					This builder writes template widgets, which need no code of their own. Writing custom HTML
					and JavaScript needs the sandboxed widget host, which is not in this build — a package
					that declares it installs but cannot draw yet.
				</div>
			</StepSection>
		</div>
	);
}
