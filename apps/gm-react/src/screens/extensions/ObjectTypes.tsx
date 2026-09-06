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
				title="Object types"
				action={<Badge status="neutral">{schemas.length} built-in</Badge>}
			>
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					These definitions control the fields and columns shown wherever each object type appears.
					Counts reflect the campaign items visible to you now.
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
										<Badge status="neutral">Built-in</Badge>
										{s.dmOnlyFields.length > 0 && (
											<Badge status="accent">
												{s.dmOnlyFields.length} DM-only{' '}
												{s.dmOnlyFields.length === 1 ? 'field' : 'fields'}
											</Badge>
										)}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										<span style={mono}>{s.subtype}</span> · defaults to{' '}
										{VISIBILITY_WORD[s.defaultVisibility] ?? s.defaultVisibility} ·{' '}
										{s.requiredFields.length} required{' '}
										{s.requiredFields.length === 1 ? 'field' : 'fields'}
									</div>
								</div>
								<span style={{ font: `12px ${T.mono}`, color: count ? T.ink : T.ter }}>
									{count} in vault
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
