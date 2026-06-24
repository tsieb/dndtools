import { useMemo, useState } from 'react';
import { buildWidgetPackageReviewSummary } from '@dndtools/core';
import { Badge, Button, HPBar, Icon, Switch, Tabs, VisibilityChip } from '../ds';
import { Page, Panel, T, eb, mono } from '../app/screen-kit';
import { DNDExt } from '../runtime/mockCampaign';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Extensions & Systems — plugins, compendium import, custom object types, the rules-system switch, and
 * the theme studio (port of app.jsx ExtensibilitySection).
 *
 * REAL CORE WIRING — the Plugins tab is the live widget-package registry (`runtime.state.widgets`): each
 * card renders the actual installed package, its computed capability/host-permission profile from
 * `buildWidgetPackageReviewSummary`, and its trust posture; the Switch dispatches the real
 * `widget.package.enable` / `widget.package.disable` commands (DM-only, reversible).
 *
 * HONEST STUBS (no core command on this surface, clearly noted in each panel):
 *   - Compendium (Open5e SRD): external SRD fetch + field-mapping are not Core-backed — local preview state.
 *   - Object types: a custom-type schema editor has no Core command here — local draft state.
 *   - System switch: swapping the rules system has no Core command here — local selection only.
 *   - Theme studio: the live `data-theme` swap IS real (DOM), token import/export is a local preview.
 */

const EXT = DNDExt as any;
const MAP_KIND_TONE: Record<string, string> = { text: 'neutral', num: 'info', list: 'accent', new: 'success' };
const TRUST_TONE: Record<string, string> = { trusted: 'success', unreviewed: 'warning', denied: 'error' };
const HOST_PERM_LABEL: Record<string, string> = {
	filesystem: 'Filesystem',
	clipboard: 'Clipboard',
	network: 'Network',
	'source-adapter': 'Source adapter',
	asset: 'Assets',
	'external-link': 'External links',
};

function ExtPlugins() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	// The live widget-package registry — the "plugins" of this app. A removed package is gone, not listed.
	const packages = useMemo(
		() => Object.values(runtime.state.widgets.packages).filter((rec: any) => !rec.removedAt),
		[runtime.state.widgets],
	);

	const setEnabled = (packageId: string, enabled: boolean) => {
		if (enabled) {
			void runtime.dispatch({ type: 'widget.package.enable', actorId: dmId, payload: { packageId } });
		} else {
			void runtime.dispatch({
				type: 'widget.package.disable',
				actorId: dmId,
				payload: { packageId, reason: 'Disabled by widget manager.' },
			});
		}
	};

	return (
		<Panel title="Installed packages" action={<Badge status="neutral">{packages.length} installed</Badge>}>
			<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
				Each package runs in a capability sandbox. The badges below are exactly what its manifest is permitted to do —
				computed live from the package, nothing more. Toggling enable/disable dispatches a real Core command.
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
				{packages.length === 0 && <div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No widget packages installed.</div>}
				{packages.map((rec: any) => {
					const def = rec.package;
					const review = buildWidgetPackageReviewSummary(def);
					const needsReview = rec.trust.state === 'unreviewed' || review.trustRecommendation !== 'trusted-after-review';
					const perms: string[] = review.requestedHostPermissions;
					const widgetCount = def.widgets.length;
					return (
						<div key={def.id} style={{ display: 'flex', gap: 12, padding: 13, border: `1px solid ${needsReview ? T.accBd : T.bd}`, borderRadius: 11, background: T.surf }}>
							<span style={{ width: 38, height: 38, borderRadius: 9, background: T.accSub, color: T.acc, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
								<Icon name="widget" size="md" />
							</span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
									<span style={{ font: `600 13.5px ${T.sans}` }}>{def.displayName}</span>
									<Badge status={TRUST_TONE[rec.trust.state] as 'neutral'}>{rec.trust.state}</Badge>
									{needsReview && (
										<Badge status="warning" icon="warning">
											Needs review
										</Badge>
									)}
									{review.customCodeWidgets.length > 0 && <Badge status="info">custom code</Badge>}
								</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter, marginBottom: 6 }}>
									v{def.version} · {widgetCount} {widgetCount === 1 ? 'widget' : 'widgets'} · {review.trustRecommendation}
								</div>
								<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
									{perms.length === 0 ? (
										<Badge status="neutral">No host permissions</Badge>
									) : (
										perms.map((p) => (
											<Badge key={p} status="accent">
												{HOST_PERM_LABEL[p] ?? p}
											</Badge>
										))
									)}
									{review.requestedNetworkDestinations.map((d: string) => (
										<Badge key={d} status="warning">
											net: {d}
										</Badge>
									))}
								</div>
							</div>
							<Switch checked={rec.enabled} onChange={() => setEnabled(def.id, !rec.enabled)} />
						</div>
					);
				})}
			</div>
		</Panel>
	);
}

function ExtCompendium() {
	const C = EXT.compendium;
	const [type, setType] = useState('monster');
	const [sel, setSel] = useState(C.selected);
	// Honest-local: external SRD fetch is not Core-backed — `imported`/`saved` are local preview state only.
	const [imported, setImported] = useState<Record<string, boolean>>(() => Object.fromEntries(C.results.map((r: any) => [r.id, r.imported])));
	const [saved, setSaved] = useState(false);
	const results = C.results.filter((r: any) => r.type === type);
	const selRow = C.results.find((r: any) => r.id === sel);
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="Open5e SRD" action={<div style={{ display: 'flex', gap: 6 }}>{C.sources.map((s: any) => <Badge key={s.id} status={s.on ? 'success' : 'neutral'}>{s.label} · {s.count}</Badge>)}</div>}>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 10 }}>
					Preview only — fetching the external SRD and committing the import are not Core-backed on this surface.
					Create real vault content from the Knowledge screen.
				</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
					{C.types.map((t: any) => (
						<button
							key={t.id}
							type="button"
							onClick={() => setType(t.id)}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 6,
								font: `12px ${T.sans}`,
								padding: '6px 11px',
								borderRadius: 8,
								cursor: 'pointer',
								border: `1px solid ${type === t.id ? T.accBd : T.bd}`,
								background: type === t.id ? T.accSub : T.surf,
								color: type === t.id ? T.acc : T.sub,
							}}
						>
							<Icon name={t.icon} size={14} />
							{t.label}
							<span style={{ color: T.ter }}>{t.count}</span>
						</button>
					))}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
					{results.map((r: any) => {
						const imp = imported[r.id];
						return (
							<div
								key={r.id}
								role="button"
								tabIndex={0}
								aria-pressed={sel === r.id}
								aria-label={`Select ${r.name}`}
								onClick={() => setSel(r.id)}
								onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(r.id); } }}
								style={{
									display: 'flex',
									gap: 12,
									padding: 12,
									borderRadius: 10,
									cursor: 'pointer',
									textAlign: 'left',
									border: `1px solid ${sel === r.id ? T.accBd : T.bd}`,
									background: sel === r.id ? T.accSub : T.surf,
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
										<span style={{ font: `600 13.5px ${T.sans}` }}>{r.name}</span>
										{imp && (
											<Badge status="success" icon="check">
												In vault
											</Badge>
										)}
									</div>
									<div style={{ font: `11.5px ${T.mono}`, color: T.ter, margin: '2px 0 4px' }}>{r.meta}</div>
									<div style={{ font: `12px/1.45 ${T.sans}`, color: T.sub }}>{r.line}</div>
								</div>
								{!imp && (
									<span
										onClick={(e) => {
											e.stopPropagation();
											setImported((m) => ({ ...m, [r.id]: true }));
										}}
										style={{ alignSelf: 'center' }}
									>
										<Button variant="secondary" size="sm" icon="import">
											Import
										</Button>
									</span>
								)}
							</div>
						);
					})}
				</div>
			</Panel>
			<Panel accent title="Field map" action={selRow && <Badge status="info">{selRow.name}</Badge>}>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					Each API field maps to a vault object field. Edit before saving — the import never overwrites silently.
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
					{C.mapping.map((m: any, i: number) => (
						<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i ? `1px solid ${T.bd}` : 'none', background: i % 2 ? T.alt : 'transparent' }}>
							<span style={{ font: `11px ${T.mono}`, color: T.ter, width: 90, flex: '0 0 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.api}</span>
							<Icon name="chevron-right" size={12} color={T.ter} />
							<span style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
									<span style={{ font: `600 12px ${T.sans}` }}>{m.field}</span>
									<Badge status={MAP_KIND_TONE[m.kind] || 'neutral'}>{m.kind}</Badge>
								</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.sub }}>{m.value}</div>
							</span>
						</div>
					))}
				</div>
				{/* no core command — external SRD import is not Core-backed; mark saved locally only. */}
				<Button variant="primary" size="sm" icon="check" disabled={saved} onClick={() => setSaved(true)}>
					{saved ? 'Saved (local preview)' : 'Save to vault'}
				</Button>
			</Panel>
		</div>
	);
}

function ExtObjects() {
	const O = EXT.objectTypes;
	const fts: Record<string, any> = Object.fromEntries(O.fieldTypes.map((f: any) => [f.id, f]));
	// Honest-local: no Core command for a custom-type schema editor on this surface — local draft state.
	const [fields, setFields] = useState<any[]>(O.draft.fields.map((f: any) => ({ ...f })));
	const addField = () =>
		setFields((fs) => [...fs, { label: `Field ${fs.length + 1}`, key: `field_${fs.length + 1}`, type: O.fieldTypes[0]?.id ?? 'text', required: false }]);
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="Object types" action={<Badge status="neutral">preview</Badge>}>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
					Preview only — defining custom object types is not wired to a Core command on this surface.
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{O.types.map((t: any) => (
						<div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: `1px solid ${T.bd}`, borderRadius: 10, background: T.surf }}>
							<span style={{ width: 36, height: 36, borderRadius: 9, background: T.alt, color: T.acc, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
								<Icon name={t.icon} size="md" />
							</span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<span style={{ font: `600 13.5px ${T.sans}` }}>{t.name}</span>
									{t.builtin && <Badge status="neutral">Built-in</Badge>}
								</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									{t.from} · {t.fields} fields · {t.count} objects
								</div>
							</div>
							<Icon name="chevron-right" size={15} color={T.ter} />
						</div>
					))}
				</div>
			</Panel>
			<Panel accent title={`New type · ${O.draft.name}`}>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					A schema-backed type — these fields become the form and the columns everywhere this type appears. Local draft.
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{fields.map((f: any, i: number) => {
						const ft = fts[f.type];
						return (
							<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 10, background: T.surf }}>
								<Icon name={ft?.icon || 'tag'} size={16} color={T.acc} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
										<span style={{ font: `600 12.5px ${T.sans}` }}>{f.label}</span>
										{f.required && (
											<span style={{ font: `9px ${T.sans}`, letterSpacing: '.06em', color: T.err, border: `1px solid ${T.bd}`, borderRadius: 4, padding: '1px 5px' }}>REQ</span>
										)}
									</div>
									<div style={{ font: `11px ${T.mono}`, color: T.ter }}>{f.key}</div>
								</div>
								<Badge status="neutral">{ft?.label || f.type}</Badge>
							</div>
						);
					})}
					<button
						type="button"
						onClick={addField}
						style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px', borderRadius: 10, border: `1.5px dashed ${T.bdS}`, background: 'transparent', cursor: 'pointer', color: T.ter, font: `600 12.5px ${T.sans}` }}
					>
						<Icon name="add" size={14} />
						Add field
					</button>
				</div>
			</Panel>
		</div>
	);
}

function ExtSystem() {
	const cs = EXT.campaignSystem;
	// Honest-local: swapping the campaign rules-system is not Core-backed on this surface — local selection.
	const [activeSystem, setActiveSystem] = useState<string>(cs.modules.find((m: any) => m.active)?.id ?? cs.active ?? cs.modules[0]?.id);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Campaign system" accent>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					The rules vocabulary the whole interface reads at runtime — stats, conditions, dice, action economy.
					Switching is a local preview here; the migration dry-run has no Core command on this surface.
				</div>
			</Panel>
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
				{cs.modules.map((m: any) => {
					const active = m.id === activeSystem;
					return (
						<div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 12, border: `1px solid ${active ? T.accBd : T.bd}`, background: T.surf, boxShadow: active ? T.smd : 'none' }}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
								<span style={{ font: `700 15px ${T.disp}`, color: active ? T.acc : T.ink }}>{m.name}</span>
								{active ? (
									<Badge status="accent" icon="check">
										Active
									</Badge>
								) : (
									<Badge status="neutral">{m.from}</Badge>
								)}
							</div>
							<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub, flex: 1 }}>{m.desc}</div>
							{active ? (
								<Button variant="secondary" size="sm" disabled>
									Current system
								</Button>
							) : (
								<Button variant="primary" size="sm" icon="retry" onClick={() => setActiveSystem(m.id)}>
									Switch (preview)
								</Button>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ExtTheme() {
	const TH = EXT.theme;
	const presetToTheme: Record<string, string> = { tavern: 'tavern', parchment: 'parchment', 'high-contrast': 'high-contrast' };
	// REAL: the live `data-theme` swap drives the actual document theme (DOM). Token import/export is local.
	const [theme, setTheme] = useState<string>(document.documentElement.getAttribute('data-theme') || 'tavern');
	const applyTheme = (v: string) => {
		setTheme(v);
		document.documentElement.setAttribute('data-theme', v);
	};
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="Token overrides" action={<Badge status="neutral">live theme: {theme}</Badge>}>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
					{TH.presets.map((p: any) => (
						<button
							key={p.id}
							type="button"
							onClick={() => presetToTheme[p.id] && applyTheme(presetToTheme[p.id])}
							style={{
								font: `12px ${T.sans}`,
								padding: '6px 12px',
								borderRadius: 8,
								cursor: 'pointer',
								border: `1px solid ${theme === presetToTheme[p.id] ? T.accBd : T.bd}`,
								background: theme === presetToTheme[p.id] ? T.accSub : T.surf,
								color: theme === presetToTheme[p.id] ? T.acc : T.sub,
							}}
						>
							{p.label}
							{p.custom && ' ✎'}
						</button>
					))}
				</div>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 12 }}>
					Theme swap is real (drives the document <span style={mono}>data-theme</span>). The token rows below are a
					display-only preview — there is no Core command for per-token overrides on this surface.
				</div>
				{TH.groups.map((g: any) => (
					<div key={g.label} style={{ marginBottom: 14 }}>
						<div style={{ ...eb, marginBottom: 8 }}>{g.label}</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
							{g.tokens.map((t: any) => (
								<div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
									<span style={{ width: 26, height: 26, borderRadius: 7, flex: '0 0 auto', background: t.swatch, border: `1px solid ${T.bd}` }} />
									<span style={{ flex: 1, font: `11.5px ${T.mono}`, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
									{t.edited && <Badge status="accent">edited</Badge>}
									<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{t.value}</span>
								</div>
							))}
						</div>
					</div>
				))}
			</Panel>
			<Panel title="Live preview">
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 12, background: T.bg, border: `1px solid ${T.bd}` }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
						<span style={{ width: 30, height: 30, borderRadius: 7, background: T.acc, color: T.accFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
							<Icon name="dice" size="sm" />
						</span>
						<span style={{ font: `700 15px ${T.disp}` }}>Sample surface</span>
					</div>
					<HPBar current={27} max={38} label="Mara Quill" />
					<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
						<Badge status="success" icon="check">
							Saved
						</Badge>
						<Badge status="warning" icon="warning">
							Stale
						</Badge>
						<Badge status="error" icon="close">
							Conflict
						</Badge>
						<VisibilityChip level="dm-only" compact />
					</div>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
						Body copy renders in the secondary text token. Numbers like <span style={mono}>1d20+7</span> use the mono face.
					</div>
				</div>
			</Panel>
		</div>
	);
}

export function Extensions() {
	const [tab, setTab] = useState('plugins');
	const tabs = [
		{ id: 'plugins', label: 'Plugins', icon: 'widget' },
		{ id: 'compendium', label: 'Compendium', icon: 'search' },
		{ id: 'objects', label: 'Object types', icon: 'tag' },
		{ id: 'system', label: 'System', icon: 'retry' },
		{ id: 'theme', label: 'Theme studio', icon: 'theme' },
	];
	return (
		<Page max={1180}>
			<div style={{ marginBottom: 18 }}>
				<Tabs value={tab} onChange={setTab} tabs={tabs} />
			</div>
			{tab === 'plugins' && <ExtPlugins />}
			{tab === 'compendium' && <ExtCompendium />}
			{tab === 'objects' && <ExtObjects />}
			{tab === 'system' && <ExtSystem />}
			{tab === 'theme' && <ExtTheme />}
		</Page>
	);
}
