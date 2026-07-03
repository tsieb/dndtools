// Community & Content Ecosystem (Initiative 12) — the platform layer. Four views behind a switch:
//   • Discover — the in-app directory browser (/community): featured collections, faceted search,
//     a module card grid, and a detail panel (contents, dependencies, changelog, reviews).         (E12.2)
//   • Export   — the module export workflow: scope, content-type selection, DM-private toggle, a
//     pre-export validation gate, and the .dndmodule output.                                        (E12.1)
//   • Publish  — the creator workspace: completeness score, the publish validation checklist
//     (pass/warn/fail), semver bump + changelog + license.                                          (E12.3)
//   • Wiki     — publish a public campaign wiki: scope, slug, access control, theme, recap journal. (E12.4)
// One campaign runs through all of it; sharing is one click, importing respects naming conflicts.
const CM = window.DNDToolsDesignSystem_8ae046;

const STARS = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
const VSTAT = { pass: { tone: 'success', icon: 'success' }, warn: { tone: 'warning', icon: 'warning' }, fail: { tone: 'error', icon: 'error' } };
function vRow(v) {
  const s = VSTAT[v.status];
  return (
    <div key={v.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '5px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)' }}>
      <CM.Icon name={s.icon} size="sm" color={`var(--color-status-${s.tone}-text)`} />
      <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{v.label}</span>
      <CM.Badge status={s.tone}>{v.status}</CM.Badge>
    </div>
  );
}

/* ════ 1 · DISCOVER ════ */
function Discover({ d }) {
  const [type, setType] = React.useState('all');
  const [sel, setSel] = React.useState(d.detail.id);
  const mods = type === 'all' ? d.modules : d.modules.filter((m) => m.type === type);
  const selected = d.modules.find((m) => m.id === sel) || mods[0];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr) 340px', gap: 'var(--space-5)', maxWidth: 1320, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      {/* facets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel title="Featured" pad="md">
          {d.featured.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0', cursor: 'pointer' }}>
              <CM.Icon name="flag" size={13} color="var(--color-accent)" />
              <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{f.label}</span>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{f.count}</span>
            </div>
          ))}
        </window.Panel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {d.typeFilters.map((t) => {
            const on = t.id === type;
            return (
              <button key={t.id} type="button" onClick={() => setType(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                <span style={{ flex: 1, textAlign: 'left', font: `${on ? 600 : 500} var(--text-sm) var(--font-sans)` }}>{t.label}</span>
                <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* card grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
          <CM.Icon name="search" size="sm" color="var(--color-text-tertiary)" />
          <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>Search community content…</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          {mods.map((m) => {
            const on = selected && m.id === selected.id;
            return (
              <button key={m.id} type="button" onClick={() => setSel(m.id)} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 0, borderRadius: 'var(--radius-md)', cursor: 'pointer', overflow: 'hidden', background: 'var(--color-surface-raised)', border: `1px solid ${on ? 'var(--color-accent-border)' : 'var(--color-border)'}` }}>
                {/* thumbnail placeholder — striped */}
                <div style={{ height: 92, position: 'relative', background: `repeating-linear-gradient(135deg, var(--color-status-${m.tone}-subtle) 0 14px, var(--color-surface-sunken) 14px 28px)`, borderBottom: '1px solid var(--color-border)' }}>
                  {m.featured && <span style={{ position: 'absolute', top: 8, left: 8 }}><CM.Badge status="warning" icon="sparkle">Featured</CM.Badge></span>}
                  <span style={{ position: 'absolute', bottom: 8, right: 8, font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', background: 'var(--color-bg)', padding: '1px 6px', borderRadius: 'var(--radius-full)' }}>cover art</span>
                </div>
                <div style={{ padding: '0 var(--space-3) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{m.name}</div>
                  <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>by {m.author} · {m.system} · {m.levels}</div>
                  <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.desc}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 2 }}>
                    <span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-accent)' }}>{STARS(Math.round(m.rating))}</span>
                    <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}>{m.rating}</span>
                    <span style={{ marginLeft: 'auto', font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{m.installs.toLocaleString()} installs</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* detail */}
      <window.Panel pad="md" style={{ borderColor: 'var(--color-accent-border)', position: 'sticky', top: 'var(--space-5)' }}>
        <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>{selected.name}</div>
        <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>by {selected.author} · {selected.license} · updated {selected.updated}</div>
        <CM.Button variant="primary" size="sm" icon="import">Install — one click</CM.Button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {d.detail.contents.map((c) => (
            <div key={c.kind} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)' }}>
              <CM.Icon name={c.icon} size={13} color="var(--color-accent)" />
              <span style={{ flex: 1, font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{c.kind}</span>
              <span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-primary)' }}>{c.n}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
          <CM.Icon name="link" size={12} /> Depends on <b style={{ color: 'var(--color-text-secondary)' }}>{d.detail.deps[0].name}</b> ({d.detail.deps[0].need})
        </div>
        <div style={{ paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ font: '600 var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>Reviews</div>
          {d.detail.reviews.map((r, i) => (
            <div key={i} style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-accent)' }}>{STARS(r.stars)}</span>
                <span style={{ font: '600 var(--text-xs) var(--font-sans)', color: 'var(--color-text-primary)' }}>{r.who}</span>
                {r.verified && <CM.Chip tone="success">installed</CM.Chip>}
              </div>
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>{r.text}</div>
            </div>
          ))}
        </div>
      </window.Panel>
    </div>
  );
}

/* ════ 2 · EXPORT ════ */
function ExportModule({ d }) {
  const [scope, setScope] = React.useState(d.scope);
  const [priv, setPriv] = React.useState(d.includePrivate);
  const [types, setTypes] = React.useState(Object.fromEntries(d.contentTypes.map((t) => [t.id, t.on])));
  const blocked = d.validation.some((v) => v.status === 'fail');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 'var(--space-4)', maxWidth: 980, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel title="Scope" pad="md">
          <window.Seg value={scope} onChange={setScope} options={d.scopes} />
          <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Exporting notes tagged <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>#tidewater</span>.</div>
        </window.Panel>
        <window.Panel title="Content to include" pad="md">
          {d.contentTypes.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
              <CM.Checkbox checked={types[t.id]} onChange={() => setTypes((s) => ({ ...s, [t.id]: !s[t.id] }))} />
              <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{t.label}</span>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{t.n}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: priv ? 'var(--color-dm-only-subtle)' : 'var(--color-surface-sunken)', border: `1px solid ${priv ? 'var(--color-dm-only-badge)' : 'var(--color-border)'}` }}>
            <CM.Icon name={priv ? 'dm-only' : 'hidden'} size="sm" color={priv ? 'var(--color-dm-only-badge)' : 'var(--color-text-tertiary)'} />
            <div style={{ flex: 1 }}>
              <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Include DM-private content</div>
              <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Off by default — recipients would see your secrets.</div>
            </div>
            <CM.Switch checked={priv} onChange={() => setPriv((v) => !v)} label="Include DM-private content" />
          </div>
        </window.Panel>
      </div>
      <window.Panel pad="md" style={{ position: 'sticky', top: 'var(--space-5)' }}>
        <div style={{ font: '600 var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--color-text-tertiary)' }}>Pre-export validation</div>
        {d.validation.map(vRow)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
          <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Output</span>
          <span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-primary)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)' }}>{d.output}</span>
          <CM.Button variant="primary" size="sm" icon="send" disabled={blocked}>Export .dndmodule</CM.Button>
        </div>
      </window.Panel>
    </div>
  );
}

/* ════ 3 · PUBLISH ════ */
function Publish({ d }) {
  const blocked = d.checklist.some((v) => v.status === 'fail');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 'var(--space-4)', maxWidth: 980, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel pad="md" style={{ borderColor: 'var(--color-accent-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{ position: 'relative', width: 52, height: 52, flex: '0 0 auto' }}>
              <svg viewBox="0 0 36 36" style={{ width: 52, height: 52, transform: 'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-surface-sunken)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${d.completeness} 100`} pathLength="100" />
              </svg>
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 var(--text-sm) var(--font-mono)', color: 'var(--color-accent)' }}>{d.completeness}%</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: 'var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--color-text-tertiary)' }}>Creator mode</div>
              <div style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>Module completeness</div>
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>Notes, descriptions, dependencies — filled in.</div>
            </div>
          </div>
        </window.Panel>
        <window.Panel title="Publish checklist" action={<CM.Chip tone="neutral">fails block · warns advise</CM.Chip>} pad="md">
          {d.checklist.map(vRow)}
        </window.Panel>
      </div>
      <window.Panel title="Publish" pad="md" style={{ position: 'sticky', top: 'var(--space-5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Version bump</span>
          <window.Seg value={d.version.bump} onChange={() => {}} options={[{ value: 'patch', label: 'Patch' }, { value: 'minor', label: 'Minor' }, { value: 'major', label: 'Major' }]} />
          <div style={{ font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-primary)' }}>{d.version.from} → <b style={{ color: 'var(--color-accent)' }}>{d.version.to}</b></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Changelog</span>
          <CM.Textarea defaultValue="Added the Lower Vaults map + linked secrets." rows={3} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>License</span>
          <CM.Badge status="info">{d.license}</CM.Badge>
        </div>
        <CM.Button variant="primary" size="sm" icon="upload" disabled={blocked}>{blocked ? 'Fix 1 blocker to publish' : 'Publish to directory'}</CM.Button>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>Published versions are immutable. A “yank” de-lists without removing it for current users.</div>
      </window.Panel>
    </div>
  );
}

/* ════ 4 · WIKI ════ */
function Wiki({ d }) {
  const [access, setAccess] = React.useState(d.access);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 'var(--space-4)', maxWidth: 1040, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel title="Publish campaign wiki" pad="md">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)' }}>
            <CM.Icon name="globe" size="sm" color="var(--color-accent)" />
            <span style={{ flex: 1, font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-primary)' }}>{d.slug}</span>
            <CM.IconButton icon="edit" label="Edit slug" variant="ghost" size="sm" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>
            <CM.Icon name="success" size={13} color="var(--color-status-success-text)" />
            {d.eligible} of {d.totalNotes} notes eligible — only <b style={{ color: 'var(--color-text-primary)' }}>public</b> & <b style={{ color: 'var(--color-text-primary)' }}>shared</b> notes publish. DM-only stays home.
          </div>
        </window.Panel>
        <window.Panel title="Access" pad="md">
          {d.accessModes.map((a) => {
            const on = a.value === access;
            return (
              <button key={a.value} type="button" onClick={() => setAccess(a.value)} style={{ textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: on ? 'var(--color-accent-subtle)' : 'transparent', border: `1px solid ${on ? 'var(--color-accent-border)' : 'transparent'}` }}>
                <span style={{ marginTop: 2, width: 14, height: 14, borderRadius: '50%', flex: '0 0 auto', border: `2px solid ${on ? 'var(--color-accent)' : 'var(--color-border-strong)'}`, background: on ? 'radial-gradient(circle, var(--color-accent) 0 3px, transparent 4px)' : 'transparent' }} />
                <div>
                  <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{a.label}</div>
                  <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{a.note}</div>
                </div>
              </button>
            );
          })}
        </window.Panel>
        <window.Panel title="Recap journal" sub pad="md">
          <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: -4 }}>Published recaps appear on the wiki home as a campaign journal; visitors can subscribe via RSS.</div>
          {d.recaps.map((r) => (
            <div key={r.n} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', width: 22 }}>#{r.n}</span>
              <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{r.title}</span>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{r.when}</span>
            </div>
          ))}
        </window.Panel>
      </div>

      {/* reading preview */}
      <window.Panel title="Reading preview" pad="md" style={{ position: 'sticky', top: 'var(--space-5)' }}>
        <div data-theme="parchment" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
          <div style={{ padding: 'var(--space-4)', background: 'var(--color-surface-raised)', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>Ghosts of the Tidewater</div>
            <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>A living campaign wiki · {d.pages} pages</div>
          </div>
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>The Pier</div>
            <div style={{ font: 'var(--text-sm)/1.6 var(--font-sans)', color: 'var(--color-text-secondary)' }}>Brackish water laps at the rotting pier. A single lantern gutters at the far end. <span style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>The Lantern Company</span> arrived at low tide.</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <CM.Chip tone="info">Places</CM.Chip>
              <CM.Chip tone="neutral">Session 7</CM.Chip>
            </div>
          </div>
        </div>
        <CM.Button variant="primary" size="sm" icon="upload">Publish wiki</CM.Button>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Mobile-responsive · search-indexed · no account to read.</div>
      </window.Panel>
    </div>
  );
}

/* ════ SHELL ════ */
function CommunityHub() {
  const d = window.DNDCommunity;
  const [view, setView] = React.useState('discover');
  return (
    <window.PageShell icon="Globe" eyebrow="Community" title="Community & content"
      actions={<window.Seg value={view} onChange={setView} options={[
        { value: 'discover', label: 'Discover' },
        { value: 'export', label: 'Export module' },
        { value: 'publish', label: 'Publish' },
        { value: 'wiki', label: 'Campaign wiki' },
      ]} />}>
      {view === 'discover' && <Discover d={d} />}
      {view === 'export' && <ExportModule d={d.export} />}
      {view === 'publish' && <Publish d={d.publish} />}
      {view === 'wiki' && <Wiki d={d.wiki} />}
    </window.PageShell>
  );
}

Object.assign(window, { CommunityHub });
