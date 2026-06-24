// Extensibility & Ecosystem (Initiative 8). Five focused views behind a segmented switch — the
// platform surfaces the kit never covered:
//   • Plugins        — the registry: capability-scoped, sandboxed; enable/disable/remove + config.   (S8.1)
//   • Compendium     — Open5e search → import-to-object workflow with an editable field map.          (S8.4)
//   • Object types   — define campaign-specific entity types from fields, no code.                    (S8.3)
//   • Campaign system — the swappable rules module + a non-destructive migration dry-run.             (S8.2)
//   • Theme studio   — override any token with a live preview; export/import a theme.                 (S8.5)
// Guiding rule, everywhere: capabilities are enumerated and named; every write still routes through
// the staged-review model; color always pairs with a label or icon.
const EX = window.DNDToolsDesignSystem_8ae046;

function metaPill(tone, label, icon) {
  return <EX.Badge status={tone} icon={icon}>{label}</EX.Badge>;
}

/* ════════════════ 1 · PLUGINS ════════════════ */
function Plugins({ d }) {
  const [sel, setSel] = React.useState('pl-tables');
  const [on, setOn] = React.useState(Object.fromEntries(d.plugins.map((p) => [p.id, p.on])));
  const selected = d.plugins.find((p) => p.id === sel);
  const config = d.pluginConfig[sel];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 'var(--space-5)', maxWidth: 1100, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {d.plugins.map((p) => {
          const active = p.id === sel;
          return (
            <button key={p.id} type="button" onClick={() => setSel(p.id)} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
              background: active ? 'var(--color-surface-raised)' : 'var(--color-surface-alt)',
              border: `1px solid ${p.needsReview ? 'var(--color-status-warning)' : active ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
              borderLeft: active ? '3px solid var(--color-accent)' : `1px solid ${p.needsReview ? 'var(--color-status-warning)' : 'var(--color-border)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <EX.StatusDot status={on[p.id] ? 'live' : 'idle'} />
                <span style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{p.name}</span>
                {p.builtin && <EX.Chip tone="neutral">built-in</EX.Chip>}
                {p.needsReview && metaPill('warning', 'review requested', 'warning')}
                <span style={{ marginLeft: 'auto', font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>v{p.version} · {p.author}</span>
              </div>
              <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{p.desc}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {p.caps.map((c) => metaPill(d.capabilityMeta[c].tone, d.capabilityMeta[c].label, c === 'write_access' ? 'permissions' : undefined))}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                  {!p.builtin && <EX.IconButton icon="delete" label="Remove plugin" variant="ghost" size="sm" />}
                  <EX.Switch checked={!!on[p.id]} onChange={() => setOn((s) => ({ ...s, [p.id]: !s[p.id] }))} label={`Enable ${p.name}`} />
                </span>
              </div>
            </button>
          );
        })}
        <button type="button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border-strong)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', font: '600 var(--text-sm) var(--font-sans)' }}>
          <EX.Icon name="add" size="sm" /> Install plugin — folder path or registry URL
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel pad="md" style={{ borderColor: 'var(--color-accent-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <EX.Icon name="Boxes" size="md" color="var(--color-accent)" />
            <span style={{ font: '700 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Sandboxed by capability</span>
          </div>
          <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
            Plugins run in a Web Worker and can touch only what their manifest declares. Vault writes need the <b style={{ color: 'var(--color-status-error-text)' }}>write access</b> capability and route through staged review — never silent.
          </div>
        </window.Panel>
        {selected && (
          <window.Panel title={`${selected.name} · settings`} pad="md">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ font: 'var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--color-text-tertiary)' }}>Granted</span>
              {selected.grants.map((g, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  <EX.Icon name="check" size={13} color="var(--color-status-success-text)" />{g}
                </div>
              ))}
            </div>
            {config ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
                {config.map((f) => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{f.label}</span>
                    {f.type === 'switch' && <EX.Switch checked={f.value} onChange={() => {}} label={f.label} />}
                    {f.type === 'text' && <EX.Input defaultValue={f.value} style={{ width: 120 }} />}
                    {f.type === 'select' && <EX.Select value={f.value} onChange={() => {}} options={f.options} style={{ width: 140 }} />}
                  </div>
                ))}
                <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Rendered from the plugin's declared config schema.</div>
              </div>
            ) : (
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-1)' }}>This plugin exposes no settings.</div>
            )}
          </window.Panel>
        )}
      </div>
    </div>
  );
}

/* ════════════════ 2 · COMPENDIUM ════════════════ */
function Compendium({ d }) {
  const [type, setType] = React.useState('monster');
  const [sel, setSel] = React.useState(d.selected);
  const results = d.results.filter((r) => r.type === type);
  const selected = d.results.find((r) => r.id === sel) || results[0];
  const ti = (id) => d.types.find((t) => t.id === id) || {};
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr) 360px', gap: 'var(--space-5)', maxWidth: 1280, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      {/* sources + types */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel title="Sources" pad="md">
          {d.sources.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0' }}>
              <EX.Checkbox checked={s.on} onChange={() => {}} />
              <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{s.label}</span>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{s.count}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
            <EX.Icon name="check" size={12} color="var(--color-status-success-text)" /> Imports stored locally — offline-safe.
          </div>
        </window.Panel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {d.types.map((t) => {
            const on = t.id === type;
            return (
              <button key={t.id} type="button" onClick={() => setType(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                <EX.Icon name={t.icon} size="sm" />
                <span style={{ flex: 1, textAlign: 'left', font: `${on ? 600 : 500} var(--text-sm) var(--font-sans)` }}>{t.label}</span>
                <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* search + results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
          <EX.Icon name="search" size="sm" color="var(--color-text-tertiary)" />
          <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>Search {ti(type).label?.toLowerCase()}…</span>
          <kbd style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)', borderRadius: 3, padding: '1px 5px' }}>&gt; compendium</kbd>
        </div>
        {results.map((r) => {
          const on = selected && r.id === selected.id;
          return (
            <button key={r.id} type="button" onClick={() => setSel(r.id)} style={{ textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: on ? 'var(--color-surface-raised)' : 'var(--color-surface-alt)', border: `1px solid ${on ? 'var(--color-accent-border)' : 'var(--color-border)'}`, borderLeft: on ? '3px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)', color: 'var(--color-accent)', flex: '0 0 auto' }}><EX.Icon name={ti(r.type).icon} size="sm" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{r.name}</span>
                  {r.imported && metaPill('success', 'in vault', 'success')}
                </div>
                <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', margin: '2px 0' }}>{r.meta} · {r.sub}</div>
                <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{r.line}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* import-to-object mapping */}
      <window.Panel pad="md" style={{ borderColor: 'var(--color-accent-border)', position: 'sticky', top: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <EX.Icon name="import" size="md" color="var(--color-accent)" />
          <div style={{ flex: 1 }}>
            <div style={{ font: 'var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--color-text-tertiary)' }}>Import as stat block</div>
            <div style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{selected?.name}</div>
          </div>
        </div>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>Map each API field to a vault field. Edit anything before saving.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {d.mapping.map((m, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '76px 14px 1fr', gap: 6, alignItems: 'center', padding: '5px 8px', borderRadius: 'var(--radius-sm)', background: m.kind === 'new' ? 'var(--color-accent-subtle)' : 'var(--color-surface-sunken)' }}>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.api}</span>
              <EX.Icon name="chevron-right" size={11} color="var(--color-text-tertiary)" />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', font: '600 var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: m.kind === 'new' ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{m.field}</span>
                <span style={{ font: `var(--text-xs) ${m.kind === 'num' ? 'var(--font-mono)' : 'var(--font-sans)'}`, color: 'var(--color-text-primary)' }}>{m.value}</span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
          {selected?.imported
            ? <EX.Button variant="secondary" size="sm" icon="retry" style={{ flex: 1 }}>Re-sync</EX.Button>
            : <EX.Button variant="primary" size="sm" icon="check" style={{ flex: 1 }}>Import object</EX.Button>}
          <EX.Button variant="ghost" size="sm" icon="edit">Fields</EX.Button>
        </div>
      </window.Panel>
    </div>
  );
}

/* ════════════════ 3 · OBJECT TYPES ════════════════ */
function ObjectTypes({ d }) {
  const [ft, setFt] = React.useState(d.fieldTypes[0].id);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', gap: 'var(--space-5)', maxWidth: 1120, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      <window.Panel title="Object types" action={<span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{d.types.length}</span>} pad="md">
        {d.types.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
            <EX.Icon name={t.icon} size="sm" color="var(--color-accent)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{t.name}</div>
              <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{t.from} · {t.fields} fields · {t.count} objects</div>
            </div>
            {t.builtin ? <EX.Icon name="lock" size={14} color="var(--color-text-tertiary)" /> : <EX.IconButton icon="edit" label={`Edit ${t.name}`} variant="ghost" size="sm" />}
          </div>
        ))}
      </window.Panel>

      <window.Panel pad="md" style={{ borderColor: 'var(--color-accent-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}><EX.Icon name={d.draft.icon} size="md" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ font: 'var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--color-text-tertiary)' }}>New object type</div>
            <EX.Input defaultValue={d.draft.name} style={{ width: 240, marginTop: 2 }} />
          </div>
          <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', textAlign: 'right', maxWidth: 150, lineHeight: 1.4 }}>Compiles to JSON Schema for runtime validation.</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{ font: 'var(--text-2xs) var(--font-sans)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', color: 'var(--color-text-tertiary)' }}>Fields</span>
          {d.draft.fields.map((f) => {
            const fm = d.fieldTypes.find((x) => x.id === f.type) || {};
            return (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                <EX.Icon name="drag-handle" size="sm" color="var(--color-text-tertiary)" />
                <EX.Icon name={fm.icon} size="sm" color="var(--color-text-secondary)" />
                <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{f.label}</span>
                <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{fm.label}</span>
                {f.required && <EX.Chip tone="info">required</EX.Chip>}
                <EX.IconButton icon="delete" label={`Remove ${f.label}`} variant="ghost" size="sm" />
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 'var(--space-2)' }}>
          <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Add field</span>
          {d.fieldTypes.map((t) => {
            const on = t.id === ft;
            return (
              <button key={t.id} type="button" onClick={() => setFt(t.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 'var(--radius-full)', cursor: 'pointer', font: '500 var(--text-xs) var(--font-sans)', background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-sunken)', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)', border: `1px solid ${on ? 'var(--color-accent-border)' : 'var(--color-border)'}` }}>
                <EX.Icon name={t.icon} size={13} />{t.label}
              </button>
            );
          })}
          <EX.Button variant="primary" size="sm" icon="add" style={{ marginLeft: 'auto' }}>Add</EX.Button>
        </div>
      </window.Panel>
    </div>
  );
}

/* ════════════════ 4 · CAMPAIGN SYSTEM ════════════════ */
function CampaignSystem({ d }) {
  const [sel, setSel] = React.useState(d.active);
  const switching = sel !== d.active;
  const fx = { keep: { tone: 'success', icon: 'success', t: 'kept' }, flatten: { tone: 'warning', icon: 'warning', t: 'flattened' }, drop: { tone: 'error', icon: 'error', t: 'dropped' } };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 760, margin: '0 auto', padding: 'var(--space-6) var(--space-5)' }}>
      <window.Panel title="Campaign system" sub pad="md">
        <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: -4 }}>The rules module behind your vault — stat-block fields, conditions, the CR table. Swapping is a vault setting, not a code change. Stored in <span style={{ fontFamily: 'var(--font-mono)' }}>.vault/settings.json</span>.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {d.modules.map((m) => {
            const on = m.id === sel;
            return (
              <button key={m.id} type="button" onClick={() => setSel(m.id)} style={{ textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: on ? 'var(--color-surface-raised)' : 'var(--color-surface-alt)', border: `1px solid ${on ? 'var(--color-accent-border)' : 'var(--color-border)'}` }}>
                <span style={{ marginTop: 2, width: 16, height: 16, borderRadius: '50%', flex: '0 0 auto', border: `2px solid ${on ? 'var(--color-accent)' : 'var(--color-border-strong)'}`, background: on ? 'radial-gradient(circle, var(--color-accent) 0 4px, transparent 5px)' : 'transparent' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{m.name}</span>
                    {m.id === d.active && metaPill('success', 'active', 'success')}
                    <span style={{ marginLeft: 'auto', font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{m.from}</span>
                  </div>
                  <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: 2 }}>{m.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </window.Panel>

      {switching && (
        <window.Panel title="Migration dry-run" action={metaPill('warning', 'preview — nothing changed yet', 'warning')} pad="md" style={{ borderColor: 'var(--color-status-warning)' }}>
          <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: -4 }}>Switching to <b style={{ color: 'var(--color-text-primary)' }}>{d.modules.find((m) => m.id === sel).name}</b> would remap your objects. Your edits are preserved; conflicts are highlighted, not overwritten.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {d.migration.rows.map((r) => {
              const e = fx[r.effect];
              return (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)' }}>
                  <EX.Icon name={e.icon} size="sm" color={`var(--color-status-${e.tone}-text)`} />
                  <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', width: 110 }}>{r.label}</span>
                  <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', width: 28 }}>{r.count}</span>
                  <span style={{ flex: 1, font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{r.note}</span>
                  <EX.Badge status={e.tone}>{e.t}</EX.Badge>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
            <EX.Button variant="primary" size="sm" icon="retry">Switch system & migrate</EX.Button>
            <EX.Button variant="ghost" size="sm" onClick={() => setSel(d.active)}>Cancel</EX.Button>
          </div>
        </window.Panel>
      )}
    </div>
  );
}

/* ════════════════ 5 · THEME STUDIO ════════════════ */
function ThemeStudio({ d }) {
  const [preset, setPreset] = React.useState(d.presets.find((p) => p.active).id);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 'var(--space-5)', maxWidth: 1080, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel title="Theme" action={<span style={{ display: 'flex', gap: 'var(--space-2)' }}><EX.Button variant="ghost" size="sm" icon="upload">Import</EX.Button><EX.Button variant="secondary" size="sm" icon="send">Export</EX.Button></span>} pad="md">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {d.presets.map((p) => {
              const on = p.id === preset;
              return (
                <button key={p.id} type="button" onClick={() => setPreset(p.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 'var(--radius-full)', cursor: 'pointer', font: '600 var(--text-sm) var(--font-sans)', background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-sunken)', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)', border: `1px solid ${on ? 'var(--color-accent-border)' : 'var(--color-border)'}` }}>
                  {p.custom && <EX.Icon name="Palette" size={13} />}{p.label}
                </button>
              );
            })}
          </div>
          <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>Override any token; live preview updates as you go. Custom themes save to <span style={{ fontFamily: 'var(--font-mono)' }}>settings.json</span>.</div>
        </window.Panel>

        {d.groups.map((g) => (
          <window.Panel key={g.label} title={g.label} pad="md">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {g.tokens.map((t) => (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)', background: t.edited ? 'var(--color-accent-subtle)' : 'transparent' }}>
                  <span style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', background: t.swatch, border: '1px solid var(--color-border-strong)', flex: '0 0 auto' }} />
                  <span style={{ flex: 1, font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}>{t.name}</span>
                  <span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-primary)' }}>{t.value}</span>
                  {t.edited && <EX.Chip tone="info">edited</EX.Chip>}
                </div>
              ))}
            </div>
          </window.Panel>
        ))}
      </div>

      {/* live preview */}
      <window.Panel title="Live preview" pad="md" style={{ position: 'sticky', top: 'var(--space-5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', backgroundImage: 'radial-gradient(600px 300px at 50% -160px, var(--color-accent-subtle), transparent 70%)' }}>
          <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>Command Center</div>
          <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>Run the live session: build encounters, run combat, and roll dice.</div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <EX.Button variant="primary" size="sm" icon="play">Resume</EX.Button>
            <EX.Button variant="secondary" size="sm" icon="add">New scene</EX.Button>
            <EX.Button variant="ghost" size="sm">Library</EX.Button>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <EX.Badge status="success" icon="success">Session live</EX.Badge>
            <EX.Badge status="warning" icon="warning">3 staged</EX.Badge>
            <EX.Badge status="error" icon="error">Sync error</EX.Badge>
          </div>
          <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>HP 18/24 · AC 15 · Round 2</div>
        </div>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Same markup, your tokens. Contrast is checked on save.</div>
      </window.Panel>
    </div>
  );
}

/* ════════════════ SHELL ════════════════ */
function Extensibility() {
  const d = window.DNDExt;
  const [view, setView] = React.useState('plugins');
  return (
    <window.PageShell icon="Blocks" eyebrow="Settings" title="Extensions & systems"
      actions={<window.Seg value={view} onChange={setView} options={[
        { value: 'plugins', label: 'Plugins' },
        { value: 'compendium', label: 'Compendium' },
        { value: 'types', label: 'Object types' },
        { value: 'system', label: 'Campaign system' },
        { value: 'theme', label: 'Theme studio' },
      ]} />}>
      {view === 'plugins' && <Plugins d={d} />}
      {view === 'compendium' && <Compendium d={d.compendium} />}
      {view === 'types' && <ObjectTypes d={d.objectTypes} />}
      {view === 'system' && <CampaignSystem d={d.campaignSystem} />}
      {view === 'theme' && <ThemeStudio d={d.theme} />}
    </window.PageShell>
  );
}

Object.assign(window, { Extensibility });
