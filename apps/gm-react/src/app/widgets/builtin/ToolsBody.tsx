import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import { Chip, Muted, StatPill, bodyWrap } from '../../widget-body-kit';

/**
 * The `tools` Command Center widget (RC-WID-4.1) — what the GM Screen currently holds and what can
 * be restored onto it: the home scene's widget count, the DM's saved layout presets, and whether an
 * auto-save safe point exists (CMD-008).
 */
export function ToolsBody() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const homeSceneId = runtime.state.commandCenter.homeSceneId;
	const widgetCount = homeSceneId
		? (runtime.state.scenes.scenes[homeSceneId]?.widgets.length ?? 0)
		: 0;
	const presets = Object.values(runtime.state.commandCenter.presets);
	return (
		<div style={bodyWrap}>
			<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
				<StatPill label={t('widgetBody.tools.widgets')} value={String(widgetCount)} />
				<StatPill label={t('widgetBody.tools.layouts')} value={String(presets.length)} />
			</div>
			{presets.length > 0 ? (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{presets.slice(0, 3).map((preset) => (
						<Chip key={preset.id}>{preset.name}</Chip>
					))}
				</div>
			) : (
				<Muted>{t('widgetBody.tools.noLayouts')}</Muted>
			)}
			{runtime.state.commandCenter.autoSave && <Muted>{t('widgetBody.tools.safePoint')}</Muted>}
		</div>
	);
}
