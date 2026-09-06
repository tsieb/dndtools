import { listMapsForActor } from '@dndtools/core';
import { Button, Select } from '../../ds';
import { useI18n } from '../../i18n';
import { Panel, SetRow, T } from '../../app/screen-kit';
import { PlayerViewAssignments } from '../../app/ProjectionControl';

type MapEntry = ReturnType<typeof listMapsForActor>[number];

export function StagePanel({
	maps,
	activeMapId,
	isDm,
	isLive,
	previewing,
	onSelect,
	onProject,
}: {
	maps: MapEntry[];
	activeMapId: string | null;
	isDm: boolean;
	isLive: boolean;
	previewing: boolean;
	onSelect: (mapId: string) => void;
	onProject: () => void;
}) {
	const { t } = useI18n();
	if (!isDm) return null;
	return (
		<Panel title={t('session.stage.title')}>
			{maps.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('session.stage.noMaps')}</div>
			) : (
				<>
					<SetRow
						label={t('session.stage.activeMap')}
						help={t('session.stage.activeMapHelp')}
						control={
							<Select
								aria-label={t('session.stage.activeMap')}
								value={activeMapId ?? ''}
								disabled={previewing}
								options={[
									// Only offered while nothing IS staged, i.e. as an honest description of the
									// current value. Clearing the active map is not expressible as a command
									// (`session.set-active-map` requires a real id), so leaving "— none —"
									// selectable meant the DM picked it, the dropdown snapped back, and nothing
									// explained why.
									...(activeMapId ? [] : [{ value: '', label: t('session.stage.noneOption') }]),
									...maps.map((m) => ({ value: m.id, label: m.name })),
								]}
								onChange={(e: { target: { value: string } }) => {
									if (e.target.value) onSelect(e.target.value);
								}}
							/>
						}
					/>
					<Button
						variant="secondary"
						size="sm"
						icon="visibility-players"
						disabled={!isLive || previewing || !activeMapId}
						onClick={onProject}
					>
						{t('session.stage.project')}
					</Button>
				</>
			)}
			{/* RC-CAN-6.2: broadcasting the active map to every player is the row above; this lets the
			    DM send a DIFFERENT scene to each one instead. */}
			<PlayerViewAssignments isLive={isLive} previewing={previewing} />
		</Panel>
	);
}
