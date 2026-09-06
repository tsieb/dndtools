import {
	getContentItemsForActor,
	listVaultObjectSchemas,
	VAULT_OBJECT_SUBTYPE_KEY,
} from '@dndtools/core';
import { Badge, Icon } from '../../ds';
import { Panel, T, mono } from '../../app/screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import { CustomObjectTypes } from './CustomTypes';
import { VISIBILITY_WORD } from './shared';
import { useI18n } from '../../i18n';

/* ---- Object types (REAL — the Core's declared vault-object schema registry + live counts) ------- */
const SUBTYPE_ICON: Record<string, string> = {
	note: 'note',
	character: 'players',
	map: 'atlas-map',
	handout: 'scroll',
	spell: 'spell-sparkle',
	encounter: 'monster-claw',
	'dice-table': 'dice',
	'audio-preset': 'play',
};

export function ExtObjects() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const schemas = listVaultObjectSchemas();
	// Live per-subtype counts through the SAME visibility-respecting content read Knowledge lists with.
	const items = getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId);
	const countFor = (subtype: string): number =>
		subtype === 'note'
			? items.filter((i) => i.kind === 'note').length
			: items.filter((i) => i.kind === 'object' && i.fields[VAULT_OBJECT_SUBTYPE_KEY] === subtype)
					.length;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel
				title={t('extensions.objects.title')}
				action={
					<Badge status="neutral">
						{t('extensions.objects.builtInCount', { count: schemas.length })}
					</Badge>
				}
			>
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					{t('extensions.objects.intro')}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{schemas.map((s) => {
						const count = countFor(s.subtype);
						return (
							<div
								key={s.subtype}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 12,
									padding: 12,
									border: `1px solid ${T.bd}`,
									borderRadius: 10,
									background: T.surf,
								}}
							>
								<span
									style={{
										width: 36,
										height: 36,
										borderRadius: 9,
										background: T.alt,
										color: T.acc,
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										flex: '0 0 auto',
									}}
								>
									<Icon name={SUBTYPE_ICON[s.subtype] ?? 'tag'} size="md" />
								</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
										<span style={{ font: `600 13.5px ${T.sans}` }}>{s.displayName}</span>
										<Badge status="neutral">{t('extensions.objects.builtIn')}</Badge>
										{s.dmOnlyFields.length > 0 && (
											<Badge status="accent">
												{t('extensions.objects.dmOnlyFields', { count: s.dmOnlyFields.length })}
											</Badge>
										)}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										<span style={mono}>{s.subtype}</span>{' '}
										{t('extensions.objects.schemaMeta', {
											visibility: VISIBILITY_WORD[s.defaultVisibility]
												? t(VISIBILITY_WORD[s.defaultVisibility])
												: s.defaultVisibility,
											required: s.requiredFields.length,
										})}
									</div>
								</div>
								<span style={{ font: `12px ${T.mono}`, color: count ? T.ink : T.ter }}>
									{t('extensions.objects.inVault', { count })}
								</span>
							</div>
						);
					})}
				</div>
			</Panel>
			<CustomObjectTypes />
		</div>
	);
}
