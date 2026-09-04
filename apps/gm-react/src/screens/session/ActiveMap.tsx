import { listMapsForActor } from '@dndtools/core';
import { Button, Select } from '../../ds';
import { Panel, SetRow, T } from '../../app/screen-kit';

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
	if (!isDm) return null;
	return (
		<Panel title="Stage">
			{maps.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					No maps yet — create one in the Atlas.
				</div>
			) : (
				<>
					<SetRow
						label="Active map"
						help="What you stage for the table."
						control={
							<Select
								aria-label="Active map"
								value={activeMapId ?? ''}
								disabled={previewing}
								options={[
									// Only offered while nothing IS staged, i.e. as an honest description of the
									// current value. Clearing the active map is not expressible as a command
									// (`session.set-active-map` requires a real id), so leaving "— none —"
									// selectable meant the DM picked it, the dropdown snapped back, and nothing
									// explained why.
									...(activeMapId ? [] : [{ value: '', label: '— none —' }]),
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
						Project to players
					</Button>
				</>
			)}
		</Panel>
	);
}
