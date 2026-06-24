import { useMemo, useState } from 'react';
import { getContentItemsForActor } from '@dndtools/core';
import { Badge, Button, Icon, Stat, Switch, Tabs, VisibilityChip } from '../ds';
import { Page, Panel, Seg, T, eb } from '../app/screen-kit';
import { DNDCommunity } from '../runtime/mockCampaign';
import { useRuntime } from '../runtime/RuntimeContext';

/**
 * Community — discover modules, export your work, publish the campaign wiki (port of platform.jsx
 * CommunitySection: Discover / Export / Publish / Campaign wiki).
 *
 * REAL CORE WIRING — the EXPORT tab dispatches the real `content.export` command and shows the actual
 * per-export report (exported vs visibility-omitted item counts). Content COUNTS (export + wiki
 * eligibility) come from the live `getContentItemsForActor` actor-filtered read.
 *
 * HONEST STUBS (no core command on this surface, clearly noted in each panel):
 *   - Discover / Install: there is no module-marketplace fetch/install command — local preview state.
 *   - Publish: publishing to a registry has no Core command here — local preview only.
 *   - Wiki publish: hosting a public wiki has no Core command here (eligibility count IS real).
 */

const COMM = DNDCommunity as any;
const VAL_TONE: Record<string, string> = { pass: 'success', warn: 'warning', fail: 'error' };
const VAL_ICON: Record<string, string> = { pass: 'check', warn: 'warning', fail: 'close' };
const MTONE: Record<string, string> = { info: 'var(--color-status-info)', success: T.ok, warning: 'var(--color-status-warning)', neutral: T.sub };

export function Community() {
	const [tab, setTab] = useState('discover');
	const tabs = [
		{ id: 'discover', label: 'Discover', icon: 'globe' },
		{ id: 'export', label: 'Export', icon: 'send' },
		{ id: 'publish', label: 'Publish', icon: 'upload' },
		{ id: 'wiki', label: 'Campaign wiki', icon: 'knowledge-book' },
	];
	return (
		<Page max={1200}>
			<div style={{ marginBottom: 18 }}><Tabs value={tab} onChange={setTab} tabs={tabs} /></div>
			{tab === 'discover' && <CommDiscover />}
			{tab === 'export' && <CommExport />}
			{tab === 'publish' && <CommPublish />}
			{tab === 'wiki' && <CommWiki />}
		</Page>
	);
}

function Stars({ n }: { n: number }) {
	return (
		<span style={{ color: T.acc, font: `12px ${T.sans}`, letterSpacing: '1px' }}>
			{'★'.repeat(Math.round(n))}
			<span style={{ color: T.bd }}>{'★'.repeat(5 - Math.round(n))}</span>
		</span>
	);
}

function CommDiscover() {
	const [type, setType] = useState('all');
	const [sel, setSel] = useState('m-saltmarsh');
	// Honest-local: no module-marketplace fetch/install command — `installed` is local preview state only.
	const [installed, setInstalled] = useState<Record<string, boolean>>({});
	const mods = COMM.modules.filter((m: any) => type === 'all' || m.type === type);
	const selMod = COMM.modules.find((m: any) => m.id === sel) || COMM.modules[0];
	const D = COMM.detail;
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, alignItems: 'start' }}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
				<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
					{COMM.featured.map((f: any) => (
						<div key={f.id} style={{ flex: '1 1 150px', padding: '12px 14px', borderRadius: 11, background: `linear-gradient(135deg, ${T.accSub}, ${T.surf})`, border: `1px solid ${T.bd}` }}>
							<div style={{ font: `600 13px ${T.sans}` }}>{f.label}</div>
							<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 2 }}>{f.count} modules</div>
						</div>
					))}
				</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{COMM.typeFilters.map((t: any) => (
						<button key={t.id} type="button" onClick={() => setType(t.id)} style={{ font: `12px ${T.sans}`, padding: '5px 11px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${type === t.id ? T.accBd : T.bd}`, background: type === t.id ? T.accSub : 'transparent', color: type === t.id ? T.acc : T.sub }}>
							{t.label} <span style={{ color: T.ter }}>{t.count}</span>
						</button>
					))}
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 14 }}>
					{mods.map((m: any) => (
						<button key={m.id} type="button" onClick={() => setSel(m.id)} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 12, cursor: 'pointer', textAlign: 'left', border: `1px solid ${sel === m.id ? T.accBd : T.bd}`, background: T.surf, boxShadow: sel === m.id ? T.smd : 'none' }}>
							<div style={{ height: 60, borderRadius: 9, background: `linear-gradient(135deg, color-mix(in srgb, ${MTONE[m.tone]} 40%, ${T.sunken}), ${T.sunken})`, display: 'flex', alignItems: 'flex-end', padding: 8 }}>
								{m.featured && <Badge status="accent" icon="sparkle">Featured</Badge>}
							</div>
							<div style={{ font: `700 14px ${T.disp}` }}>{m.name}</div>
							<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>by {m.author} · {m.levels} · {m.license}</div>
							<div style={{ font: `12px/1.45 ${T.sans}`, color: T.sub, flex: 1 }}>{m.desc}</div>
							<div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `11.5px ${T.sans}`, color: T.ter }}>
								<Stars n={m.rating} /> {m.rating} · {(m.installs / 1000).toFixed(1)}k installs
							</div>
						</button>
					))}
				</div>
			</div>
			{/* detail panel — install is honest-local (no marketplace command on this surface) */}
			<Panel accent title={selMod.name} action={<Badge status="neutral">{selMod.system}</Badge>}>
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>by {selMod.author} · updated {selMod.updated}</div>
				<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>{selMod.desc}</div>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
					Preview only — discovering and installing community modules is not Core-backed on this surface.
				</div>
				<Button variant="primary" size="md" icon={installed[selMod.id] ? 'check' : 'import'} disabled={installed[selMod.id]} onClick={() => setInstalled((s) => ({ ...s, [selMod.id]: true }))}>
					{installed[selMod.id] ? 'Installed (local preview)' : 'Install to vault'}
				</Button>
				{selMod.id === D.id && (
					<>
						<div style={{ ...eb, marginTop: 4 }}>Contents</div>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
							{D.contents.map((c: any, i: number) => (
								<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
									<Icon name={c.icon} size={15} color={T.acc} /><span style={{ font: `12px ${T.sans}`, flex: 1 }}>{c.kind}</span><span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{c.n}</span>
								</div>
							))}
						</div>
						<div style={{ ...eb, marginTop: 4 }}>Changelog</div>
						{D.changelog.map((c: any, i: number) => (
							<div key={i} style={{ display: 'flex', gap: 9, padding: '4px 0' }}>
								<Badge status="neutral">{c.v}</Badge><div style={{ flex: 1 }}><div style={{ font: `12px ${T.sans}`, color: T.sub }}>{c.note}</div><div style={{ font: `10.5px ${T.sans}`, color: T.ter }}>{c.when}</div></div>
							</div>
						))}
						<div style={{ ...eb, marginTop: 4 }}>Reviews</div>
						{D.reviews.map((r: any, i: number) => (
							<div key={i} style={{ padding: '8px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}><span style={{ font: `600 12px ${T.sans}` }}>{r.who}</span>{r.verified && <Badge status="success" icon="check">Verified install</Badge>}<span style={{ color: T.acc, marginLeft: 'auto' }}>{'★'.repeat(r.stars)}</span></div>
								<div style={{ font: `12px/1.45 ${T.sans}`, color: T.sub }}>{r.text}</div>
							</div>
						))}
					</>
				)}
			</Panel>
		</div>
	);
}

function CommExport() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const E = COMM.export;
	const [scope, setScope] = useState(E.scope);
	const [types, setTypes] = useState<Record<string, boolean>>(() => Object.fromEntries(E.contentTypes.map((t: any) => [t.id, t.on])));
	const [priv, setPriv] = useState(E.includePrivate);
	const [result, setResult] = useState<{ exported: number; omitted: number; mode: string } | null>(null);

	// REAL counts from the live actor-filtered content read (the DM sees every item).
	const items = useMemo(() => getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId), [runtime.state.content, runtime.state.permissions, dmId]);
	const dmOnlyCount = items.filter((i) => i.visibility === 'dm-only').length;
	const playerCount = items.length - dmOnlyCount;

	const runExport = async () => {
		// REAL: core `content.export` selects by VISIBILITY MODE — `dm-backup` keeps DM-only content,
		// `portable` redacts it. The per-type toggles + scope above are local UI; core exports the whole
		// vault by mode (the granular type filter is not a Core parameter).
		const res = await runtime.dispatch({
			type: 'content.export',
			actorId: dmId,
			payload: { mode: priv ? 'dm-backup' : 'portable' },
		});
		if (res.status === 'accepted') {
			const ev = res.events.find((e: any) => e.kind === 'content.exported') as any;
			if (ev) setResult({ exported: ev.exportedItems, omitted: ev.omittedForVisibility, mode: ev.mode });
		}
	};

	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="What to export">
				<div style={{ ...eb }}>Scope</div>
				<Seg value={scope} onChange={setScope} options={E.scopes} />
				<div style={{ ...eb, marginTop: 10 }}>Content types <span style={{ color: T.ter, font: `11px ${T.sans}` }}>(local filter — core exports by visibility mode)</span></div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{E.contentTypes.map((t: any) => (
						<label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', border: `1px solid ${T.bd}`, borderRadius: 9, cursor: 'pointer' }}>
							<Switch checked={types[t.id]} onChange={() => setTypes((s) => ({ ...s, [t.id]: !s[t.id] }))} />
							<span style={{ flex: 1, font: `12.5px ${T.sans}` }}>{t.label}</span>
							<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{t.n}</span>
						</label>
					))}
				</div>
				<label style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', borderRadius: 9, background: priv ? 'var(--color-visibility-dm-subtle)' : T.alt, border: `1px solid ${priv ? 'var(--color-visibility-dm)' : T.bd}`, cursor: 'pointer', marginTop: 4 }}>
					<Switch checked={priv} onChange={() => setPriv((p: boolean) => !p)} />
					<span style={{ flex: 1 }}><span style={{ display: 'flex', alignItems: 'center', gap: 6, font: `600 12.5px ${T.sans}` }}>Include DM-only content <VisibilityChip level="dm-only" compact /></span><span style={{ font: `11px ${T.sans}`, color: T.ter }}>Off → <code>portable</code> mode (secrets redacted). On → <code>dm-backup</code> mode.</span></span>
				</label>
			</Panel>
			<Panel accent title="Pre-export validation">
				<div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, font: `12.5px ${T.sans}`, color: T.sub }}>
						<Icon name="check" size={16} color={T.ok} /><span>{items.length} vault items · {playerCount} player-visible · {dmOnlyCount} DM-only</span>
					</div>
					{E.validation.map((v: any, i: number) => (
						<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, font: `12.5px ${T.sans}`, color: T.sub }}>
							<Icon name={VAL_ICON[v.status]} size={16} color={v.status === 'pass' ? T.ok : v.status === 'warn' ? 'var(--color-status-warning)' : T.err} /><span>{v.label}</span>
						</div>
					))}
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 9, background: T.sunken, border: `1px solid ${T.bd}`, marginTop: 6 }}>
					<Icon name="upload" size={16} color={T.acc} /><span style={{ flex: 1, font: `12px ${T.mono}`, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{priv ? 'dm-backup' : 'portable'} · {E.output}</span>
				</div>
				<Button variant="primary" size="md" icon="send" onClick={runExport}>Export module</Button>
				{result ? (
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12px ${T.sans}`, color: T.sub }}>
						<Icon name="check" size={15} color={T.ok} />
						<span>Exported {result.exported} {result.exported === 1 ? 'item' : 'items'} in <strong>{result.mode}</strong> mode · {result.omitted} omitted for visibility.</span>
					</div>
				) : (
					<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>Warnings won't block export — they ride along in the manifest.</div>
				)}
			</Panel>
		</div>
	);
}

function CommPublish() {
	const P = COMM.publish;
	const blocked = P.checklist.some((c: any) => c.status === 'fail');
	// Honest-local: publishing to a registry has no Core command on this surface — local preview only.
	const [submitted, setSubmitted] = useState(false);
	const r = 26;
	const c = 2 * Math.PI * r;
	const off = c * (1 - P.completeness / 100);
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 18, alignItems: 'start' }}>
			<Panel title="Readiness">
				<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
					<svg width="70" height="70" viewBox="0 0 70 70">
						<circle cx="35" cy="35" r={r} fill="none" stroke={T.bd} strokeWidth="7" />
						<circle cx="35" cy="35" r={r} fill="none" stroke={blocked ? T.err : T.acc} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 35 35)" />
						<text x="35" y="40" textAnchor="middle" style={{ font: `700 17px var(--font-mono)`, fill: T.ink }}>{P.completeness}</text>
					</svg>
					<div>
						<div style={{ font: `700 15px ${T.disp}` }}>{blocked ? 'Not ready' : 'Almost there'}</div>
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{P.completeness}% complete</div>
					</div>
				</div>
				<div style={{ ...eb, marginTop: 8 }}>Version</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 9, font: `13px ${T.mono}` }}>
					<span style={{ color: T.ter }}>{P.version.from}</span><Icon name="chevron-right" size={13} color={T.ter} /><span style={{ color: T.acc }}>{P.version.to}</span><Badge status="info">{P.version.bump}</Badge>
				</div>
				<div style={{ ...eb, marginTop: 8 }}>License</div>
				<Badge status="neutral">{P.license}</Badge>
			</Panel>
			<Panel accent title="Publish checklist" action={blocked ? <Badge status="error" icon="close">1 blocker</Badge> : undefined}>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					Preview only — publishing to a module registry is not Core-backed on this surface.
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{P.checklist.map((c: any, i: number) => (
						<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, border: `1px solid ${c.status === 'fail' ? 'var(--color-status-error-border)' : T.bd}`, background: c.status === 'fail' ? 'var(--color-status-error-subtle)' : T.surf }}>
							<Icon name={VAL_ICON[c.status]} size={16} color={c.status === 'pass' ? T.ok : c.status === 'warn' ? 'var(--color-status-warning)' : T.err} />
							<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: T.sub }}>{c.label}</span>
							<Badge status={VAL_TONE[c.status] as any}>{c.status}</Badge>
						</div>
					))}
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
					<Button variant="primary" size="md" icon="upload" disabled={blocked || submitted} onClick={() => setSubmitted(true)}>
						{submitted ? 'Submitted (preview)' : 'Publish module'}
					</Button>
					{blocked && <span style={{ font: `12px ${T.sans}`, color: T.err }}>Fix the blocker first — fails block publish.</span>}
				</div>
			</Panel>
		</div>
	);
}

function CommWiki() {
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const W = COMM.wiki;
	const [access, setAccess] = useState(W.access);
	// Honest-local: hosting a public wiki has no Core command on this surface — local preview only.
	const [published, setPublished] = useState(false);

	// REAL: only player-visible notes are eligible for a published wiki (DM-only blocks are stripped).
	const items = useMemo(() => getContentItemsForActor(runtime.state.content, runtime.state.permissions, dmId), [runtime.state.content, runtime.state.permissions, dmId]);
	const notes = items.filter((i) => i.kind === 'note');
	const eligible = notes.filter((i) => i.visibility === 'player-visible').length;

	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 18, alignItems: 'start' }}>
			<Panel title="Publish settings">
				<div style={{ ...eb }}>Public address</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, background: T.alt, border: `1px solid ${T.bd}` }}>
					<Icon name="globe" size={15} color={T.acc} /><span style={{ font: `12.5px ${T.mono}`, color: T.sub, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{W.slug}</span>
				</div>
				<div style={{ ...eb, marginTop: 10 }}>Access</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{W.accessModes.map((m: any) => (
						<button key={m.value} type="button" onClick={() => setAccess(m.value)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', border: `1px solid ${access === m.value ? T.accBd : T.bd}`, background: access === m.value ? T.accSub : T.surf }}>
							<span style={{ width: 16, height: 16, borderRadius: '50%', flex: '0 0 auto', border: `2px solid ${access === m.value ? T.acc : T.bdS}`, background: access === m.value ? T.acc : 'transparent' }} />
							<span style={{ flex: 1 }}><div style={{ font: `600 12.5px ${T.sans}` }}>{m.label}</div><div style={{ font: `11px ${T.sans}`, color: T.ter }}>{m.note}</div></span>
						</button>
					))}
				</div>
				<div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
					<Stat label="Eligible pages" value={`${eligible}/${notes.length}`} icon="knowledge-book" />
					<Stat label="Theme" value={W.theme} icon="theme" />
				</div>
				<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
					Eligibility is real — only player-visible notes publish; DM-only blocks are stripped. Hosting itself is preview-only.
				</div>
				<Button variant="primary" size="md" icon="upload" disabled={published} onClick={() => setPublished(true)}>
					{published ? 'Published (preview)' : 'Publish wiki'}
				</Button>
			</Panel>
			<Panel title="Reading preview">
				<div data-theme="parchment" style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid var(--color-border)`, background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
					<div style={{ padding: '18px 20px', borderBottom: `1px solid var(--color-border)`, background: 'var(--color-surface)' }}>
						<div style={{ font: `700 19px var(--font-display)`, color: 'var(--color-text-primary)' }}>The Sunken Outpost</div>
						<div style={{ font: `12px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>A campaign wiki · {W.pages} pages</div>
					</div>
					<div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
						<div style={{ font: `600 12px var(--font-sans)`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Session recaps</div>
						{W.recaps.map((r: any) => (
							<div key={r.n} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
								<span style={{ font: `700 13px var(--font-mono)`, color: 'var(--color-accent)' }}>#{r.n}</span>
								<span style={{ flex: 1, font: `13.5px var(--font-sans)`, color: 'var(--color-text-primary)' }}>{r.title}</span>
								<span style={{ font: `11px var(--font-sans)`, color: 'var(--color-text-tertiary)' }}>{r.when}</span>
							</div>
						))}
					</div>
				</div>
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>Only player-visible notes appear. DM-only blocks are stripped from the published page.</div>
			</Panel>
		</div>
	);
}
