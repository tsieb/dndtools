import { useState } from 'react';
import { Button, Icon, Select, Skeleton } from '../../ds';
import { T } from '../../app/screen-kit';
import { listDocuments, SRD_DOCUMENT_KEY, type Open5eDocument } from '../../app/compendium/open5e';
import type { CompendiumResult } from '../../app/compendium/types';
import { useI18n } from '../../i18n';

/**
 * The compendium's source document. The SRD is the default; any other Open5e document needs an
 * explicit opt-in that shows that source's own license before anything is fetched from it.
 */
export function CompendiumSourcePicker({
	activeDoc,
	resultSource,
	onChoose,
}: {
	/** `null` is the default SRD. */
	activeDoc: Open5eDocument | null;
	resultSource: CompendiumResult<unknown>['source'] | undefined;
	onChoose: (doc: Open5eDocument | null) => void;
}) {
	const { t } = useI18n();
	const [sourceUiOpen, setSourceUiOpen] = useState(false);
	const [docs, setDocs] = useState<Open5eDocument[] | null>(null);
	const [docsError, setDocsError] = useState<string | null>(null);
	const [pendingDocKey, setPendingDocKey] = useState(SRD_DOCUMENT_KEY);

	const openSourcePicker = () => {
		setSourceUiOpen(true);
		if (docs) return;
		// Was `if (docs || docsError) return`, which made a single failed fetch permanent: the error
		// latched, so every later attempt short-circuited and the list could never load again even
		// after the network came back.
		setDocsError(null);
		listDocuments()
			.then(setDocs)
			.catch(() => setDocsError(t('extensions.compendium.sourceListFailed')));
	};
	const pendingDoc = docs?.find((d) => d.key === pendingDocKey) ?? null;
	const notice = {
		display: 'flex',
		alignItems: 'center',
		gap: 'var(--space-1-5)',
		font: `var(--text-xs)/1.5 ${T.sans}`,
		color: T.sub,
	} as const;

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				padding: 'var(--space-2)',
				border: `1px solid ${T.bd}`,
				borderRadius: 'var(--radius-md)',
				background: T.alt,
				marginBottom: 'var(--space-3)',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
				<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub, flex: 1, minWidth: 0 }}>
					{t('extensions.compendium.source')}{' '}
					<span style={{ font: `600 var(--text-xs) ${T.sans}`, color: T.ink }}>
						{activeDoc ? activeDoc.name : 'SRD 5.1'}
					</span>{' '}
					<span>
						·{' '}
						{activeDoc
							? activeDoc.licenses.map((l) => l.name).join(', ') ||
								t('extensions.compendium.seePublisher')
							: 'CC-BY-4.0'}
					</span>
				</span>
				{!sourceUiOpen && (
					<Button variant="ghost" size="sm" onClick={openSourcePicker}>
						{t('extensions.compendium.otherSources')}
					</Button>
				)}
			</div>
			{sourceUiOpen && (
				<>
					{!docs && !docsError && <Skeleton height={30} />}
					{docsError && (
						// Cancel lives inside the `{docs && …}` branch below and the "Other sources…"
						// trigger is hidden while the picker is open, so a failed fetch used to leave
						// this panel stuck open forever — no way out, and no way to try again. The
						// error state needs its own two exits.
						<>
							<div role="alert" style={notice}>
								<Icon name="error" size={14} color={T.err} aria-hidden="true" />
								{docsError}
							</div>
							<div style={{ display: 'flex', gap: 'var(--space-1-5)' }}>
								<Button variant="secondary" size="sm" onClick={openSourcePicker}>
									{t('common.action.retry')}
								</Button>
								<Button variant="ghost" size="sm" onClick={() => setSourceUiOpen(false)}>
									{t('common.action.cancel')}
								</Button>
							</div>
						</>
					)}
					{docs && (
						<>
							<Select
								aria-label={t('extensions.compendium.chooseSource')}
								options={docs.map((d) => ({
									value: d.key,
									label: `${d.name} — ${d.publisher}`,
								}))}
								value={pendingDocKey}
								onChange={(e: { target: { value: string } }) => setPendingDocKey(e.target.value)}
							/>
							{pendingDoc && (
								<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
									{t('extensions.compendium.license')}{' '}
									<span style={{ color: T.ink }}>
										{pendingDoc.licenses.map((l) => l.name).join(', ') ||
											t('extensions.compendium.seeTerms')}
									</span>
									{pendingDoc.permalink ? ` · ${pendingDoc.permalink}` : ''}
									{t('extensions.compendium.licenseNote')}
								</div>
							)}
							<div style={{ display: 'flex', gap: 'var(--space-1-5)' }}>
								<Button
									variant="secondary"
									size="sm"
									disabled={!pendingDoc}
									onClick={() => {
										onChoose(pendingDoc && pendingDoc.key !== SRD_DOCUMENT_KEY ? pendingDoc : null);
										setSourceUiOpen(false);
									}}
								>
									{t('extensions.compendium.useSource')}
								</Button>
								<Button variant="ghost" size="sm" onClick={() => setSourceUiOpen(false)}>
									{t('common.action.cancel')}
								</Button>
							</div>
						</>
					)}
				</>
			)}
			{activeDoc && resultSource === 'bundled' && (
				<div role="status" style={notice}>
					<Icon name="warning" size={14} color={T.warn} aria-hidden="true" />
					{t('extensions.compendium.needsLiveApi', { name: activeDoc.name })}
				</div>
			)}
		</div>
	);
}
