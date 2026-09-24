import { Badge, EmptyState, Skeleton } from '../../ds';
import { LoadingRegion, T } from '../../app/screen-kit';
import type {
	CompendiumKind,
	CompendiumMonster,
	CompendiumResult,
	CompendiumSpell,
} from '../../app/compendium/types';
import { useI18n } from '../../i18n';
import { ImportControl, monsterMeta, spellMeta, type EntryImportProps } from './CompendiumEntry';

type Entry = CompendiumMonster | CompendiumSpell;

/** The result list: loading skeletons, the two empty states, then one selectable row per entry. */
export function CompendiumResults({
	kind,
	loading,
	result,
	selKey,
	onSelect,
	imports,
}: {
	kind: CompendiumKind;
	loading: boolean;
	result: CompendiumResult<Entry> | null;
	selKey: string | null;
	onSelect: (key: string) => void;
	imports: EntryImportProps;
}) {
	const { t } = useI18n();
	const { inVault, busyKey, confirmKey, setConfirmKey, importEntry, canWrite } = imports;
	const entries = result?.entries ?? [];

	if (loading) {
		return (
			// The region used to name itself with `aria-label` and hold nothing but `aria-hidden`
			// Skeletons, so the debounced compendium search announced neither its loading nor its
			// completion. LoadingRegion puts the text INSIDE.
			<LoadingRegion
				label={t('extensions.compendium.loadingResults')}
				style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
			>
				{[0, 1, 2, 3].map((i) => (
					<Skeleton key={i} height={62} />
				))}
			</LoadingRegion>
		);
	}
	if (!result) {
		return (
			<EmptyState
				illustration="connection-lost"
				title={t('extensions.compendium.unavailableTitle')}
				description={t('extensions.compendium.unavailableBody')}
			/>
		);
	}
	if (entries.length === 0) {
		return (
			<EmptyState
				illustration="search-none"
				title={t('extensions.compendium.noMatchesTitle')}
				description={t('extensions.compendium.noMatchesBody', { document: result.document })}
			/>
		);
	}
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
			{entries.map((entry) => {
				const dup = inVault(entry.name);
				const current = selKey === entry.key;
				return (
					// The row used to be a role="button" div WRAPPING the real Import buttons — nested
					// interactive controls, which collapse the card and its action into one ambiguous
					// control in AT browse mode. The selectable thing is now the text block below, a real
					// <button> that is a SIBLING of the Import control.
					<div
						key={entry.key}
						style={{
							display: 'flex',
							gap: 'var(--space-3)',
							padding: 'var(--space-3)',
							borderRadius: 'var(--radius-lg)',
							textAlign: 'left',
							border: `1px solid ${current ? T.accBd : T.bd}`,
							background: current ? T.accSub : T.surf,
						}}
					>
						<button
							type="button"
							aria-pressed={current}
							aria-label={t('extensions.compendium.selectEntry', { name: entry.name })}
							onClick={() => onSelect(entry.key)}
							style={{
								flex: 1,
								minWidth: 0,
								display: 'block',
								textAlign: 'left',
								padding: 'var(--space-0)',
								border: 'none',
								background: 'transparent',
								color: 'inherit',
								font: 'inherit',
								cursor: 'pointer',
							}}
						>
							<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
								<span style={{ font: `600 var(--text-sm) ${T.sans}` }}>{entry.name}</span>
								{dup && (
									<Badge status="success" icon="check">
										{t('extensions.compendium.inVault')}
									</Badge>
								)}
							</div>
							<div
								style={{
									font: `var(--text-xs) ${T.mono}`,
									color: T.sub,
									marginTop: 'var(--space-0-5)',
								}}
							>
								{kind === 'monster'
									? monsterMeta(entry as CompendiumMonster)
									: spellMeta(entry as CompendiumSpell, t)}
							</div>
						</button>
						<span style={{ alignSelf: 'center' }}>
							<ImportControl
								name={entry.name}
								inVault={dup}
								busy={busyKey === entry.key}
								disabled={!canWrite || (busyKey !== null && busyKey !== entry.key)}
								confirming={confirmKey === entry.key}
								onConfirmChange={(on) => setConfirmKey(on ? entry.key : null)}
								onImport={() => void importEntry(entry)}
							/>
						</span>
					</div>
				);
			})}
			{result.total > entries.length && (
				<div
					style={{
						font: `var(--text-xs) ${T.sans}`,
						color: T.sub,
						textAlign: 'center',
						paddingTop: 'var(--space-0-5)',
					}}
				>
					{t('extensions.compendium.showingFirst', { shown: entries.length, total: result.total })}
				</div>
			)}
		</div>
	);
}
