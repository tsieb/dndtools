import { useMemo, useState } from 'react';
import { getContentItemsForActor } from '@dndtools/core';
import { Button, Icon, Switch, Toaster, VisibilityChip } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	downloadJsonFile,
	downloadTextFile,
	fileDateStamp,
	type ExportResult,
} from '../../platform/download';
import { errText } from './shared';

export function CommExport() {
	const isPhone = useViewport() === 'phone';
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const [priv, setPriv] = useState(false);
	const [result, setResult] = useState<{
		exported: number;
		omitted: number;
		mode: string;
		file: string;
	} | null>(null);
	// Busy latch: the export dispatch is async, and an unbuffered double-click would dispatch (and
	// download) twice.
	const [exporting, setExporting] = useState(false);

	// REAL counts from the live actor-filtered content read (the DM sees every item).
	const items = useMemo(
		() => getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId),
		[runtime.state.content, runtime.state.permissions, dmId],
	);
	// A portable export is evaluated from a REPRESENTATIVE PLAYER's perspective (core fails closed to an
	// empty bundle for a DM/unknown viewer, so a portable export MUST name a real player actor or it
	// silently exports nothing). Pick any player; absent one, '' keeps the fail-closed empty result.
	const portableViewerId = useMemo(
		() =>
			(Object.values(runtime.state.permissions.actors) as { id: string; role: string }[]).find(
				(a) => a.role === 'player',
			)?.id ?? '',
		[runtime.state.permissions],
	);
	const dmOnlyCount = items.filter((i) => i.visibility === 'dm-only').length;
	const playerCount = items.length - dmOnlyCount;

	// REAL type scope: distinct item kinds with live counts; the selection feeds core's `itemTypes`
	// export parameter (scoping can only NARROW the visibility-filtered export, never widen it).
	const kinds = useMemo(() => {
		const counts = new Map<string, number>();
		for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
		return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}, [items]);
	const [offKinds, setOffKinds] = useState<Record<string, boolean>>({});
	const selectedKinds = kinds.map(([k]) => k).filter((k) => !offKinds[k]);
	const allSelected = selectedKinds.length === kinds.length;

	const runExport = async () => {
		if (exporting) return;
		// `setResult` is only ever called on SUCCESS, and `doExport` bails early on a rejection, a
		// missing event, or a cancelled save dialog. Without this reset the previous run's green
		// "✓ Downloaded <file> — N items" survived the failure, telling a DM they have a backup they
		// do not have. Clear the claim at the start of every attempt.
		setResult(null);
		setExporting(true);
		try {
			await doExport();
		} catch (error) {
			Toaster.error(errText(error));
		} finally {
			setExporting(false);
		}
	};

	const doExport = async () => {
		// REAL: core `content.export` selects by VISIBILITY MODE — `dm-backup` keeps DM-only content,
		// `portable` redacts it — narrowed by the selected item types.
		const res = await runtime.dispatch({
			type: 'content.export',
			actorId: dmId,
			payload: {
				mode: priv ? 'dm-backup' : 'portable',
				...(priv ? {} : { portableViewerActorId: portableViewerId }),
				...(allSelected ? {} : { itemTypes: selectedKinds }),
			},
		});
		if (res.status !== 'accepted') {
			Toaster.error(res.rejection.message);
			return;
		}
		const ev = res.events.find((e: any) => e.kind === 'content.exported') as any;
		if (!ev) return;
		const files: { path: string; markdown: string }[] = ev.export?.files ?? [];
		const mode: string = ev.mode;
		let fileName: string;
		let exportResult: ExportResult;
		if (files.length === 1) {
			// A single note downloads as plain markdown, named by its stable export path.
			fileName = files[0].path.split('/').pop() || `export-${fileDateStamp()}.md`;
			exportResult = await downloadTextFile(
				fileName,
				files[0].markdown,
				'text/markdown',
				'Export campaign content',
			);
		} else {
			// Multiple files ship as one JSON bundle (round-trips through the Knowledge import).
			fileName = `dndtools-export-${mode}-${fileDateStamp()}.json`;
			exportResult = await downloadJsonFile(
				fileName,
				{
					format: 'dndtools-content-export',
					version: 1,
					mode,
					files,
				},
				'Export campaign content',
			);
		}
		if (exportResult.status === 'cancelled') return;
		setResult({
			exported: ev.exportedItems,
			omitted: ev.omittedForVisibility,
			mode,
			file: fileName,
		});
	};

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<Panel title="What to export">
				<div style={{ ...eb }}>
					Content types{' '}
					<span style={{ color: T.ter, font: `11px ${T.sans}` }}>(current campaign counts)</span>
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{kinds.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							Nothing to export yet — create notes and content in Knowledge first.
						</div>
					) : (
						kinds.map(([kind, count]) => (
							<label
								key={kind}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 11,
									padding: '9px 11px',
									border: `1px solid ${T.bd}`,
									borderRadius: 9,
									cursor: 'pointer',
								}}
							>
								<Switch
									checked={!offKinds[kind]}
									aria-label={`Include ${kind} in module export`}
									onChange={() => setOffKinds((s) => ({ ...s, [kind]: !s[kind] }))}
								/>
								<span style={{ flex: 1, font: `12.5px ${T.sans}`, textTransform: 'capitalize' }}>
									{kind}
								</span>
								<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{count}</span>
							</label>
						))
					)}
				</div>
				<label
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 11,
						padding: '10px 11px',
						borderRadius: 9,
						background: priv ? 'var(--color-dm-only-subtle)' : T.alt,
						border: `1px solid ${priv ? 'var(--color-dm-only-badge)' : T.bd}`,
						cursor: 'pointer',
						marginTop: 4,
					}}
				>
					<Switch
						checked={priv}
						aria-label="Include DM-only content"
						onChange={() => setPriv((p: boolean) => !p)}
					/>
					<span style={{ flex: 1 }}>
						<span
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								font: `600 12.5px ${T.sans}`,
							}}
						>
							Include DM-only content <VisibilityChip level="dm-only" compact />
						</span>
						<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
							Off: a player-safe export with secrets redacted. On: a full DM backup.
						</span>
					</span>
				</label>
			</Panel>
			<Panel accent title="Export">
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						font: `12.5px ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="check" size={16} color={T.ok} />
					<span>
						{items.length} vault items · {playerCount} player-visible · {dmOnlyCount} DM-only
					</span>
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						padding: '10px 12px',
						borderRadius: 9,
						background: T.sunken,
						border: `1px solid ${T.bd}`,
						marginTop: 6,
					}}
				>
					<Icon name="download" size={16} color={T.acc} />
					<span
						style={{
							flex: 1,
							font: `12px ${T.mono}`,
							color: T.sub,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{priv ? 'Full DM backup' : 'Player-safe export'} ·{' '}
						{allSelected ? 'all types' : `${selectedKinds.length}/${kinds.length} types`} ·
						downloads .md / .json
					</span>
				</div>
				<Button
					variant="primary"
					size="md"
					icon="download"
					disabled={items.length === 0 || selectedKinds.length === 0 || exporting}
					onClick={() => void runExport()}
				>
					{exporting ? 'Exporting…' : 'Export & download'}
				</Button>
				{/* An export writes a file and reports what it omitted for visibility — the one thing a DM
				    must hear. The region is mounted unconditionally (and the idle hint kept OUTSIDE it)
				    so the result is announced when it arrives, rather than the region appearing with its
				    content already in place, which assistive tech announces unreliably. */}
				<div
					role="status"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						font: `12px ${T.sans}`,
						color: T.sub,
					}}
				>
					{result ? (
						<>
							<Icon name="check" size={15} color={T.ok} />
							<span>
								Downloaded <code style={{ font: `11.5px ${T.mono}` }}>{result.file}</code> —{' '}
								{result.exported} {result.exported === 1 ? 'item' : 'items'} in{' '}
								<strong>{result.mode}</strong> mode · {result.omitted} omitted for visibility.
							</span>
						</>
					) : null}
				</div>
				{result ? null : (
					<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						One note exports as markdown; more become a JSON bundle you can re-import in Knowledge.
					</div>
				)}
			</Panel>
		</div>
	);
}
