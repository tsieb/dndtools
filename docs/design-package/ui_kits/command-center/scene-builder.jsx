// scene-builder.jsx — the custom-widget authoring surface. Compose (no-code) ⇄ Code (host API +
// {{ bindings }}) ⇄ Data (campaign sources) ⇄ Permissions, with a live preview. Exposes WidgetBuilder.
const BD = window.DNDToolsDesignSystem_8ae046;

const OUTPUTS = [
  { id: 'counter', label: 'Counter',  icon: 'Plus' },
  { id: 'tally',   label: 'Tally',    icon: 'list-check' },
  { id: 'table',   label: 'Table',    icon: 'Dices' },
  { id: 'stat',    label: 'Stat',     icon: 'Activity' },
  { id: 'clock',   label: 'Clock',    icon: 'recent' },
  { id: 'note',    label: 'Note',     icon: 'note-edit' },
];
const SOURCES = [
  { id: 'party',  label: 'Party roster',   sub: 'names, classes, levels', binds: 'party.members' },
  { id: 'gold',   label: 'Party gold',     sub: 'shared economy',         binds: 'party.gold' },
  { id: 'timer',  label: 'Session timer',  sub: 'elapsed / countdown',    binds: 'session.timer' },
  { id: 'init',   label: 'Initiative',     sub: 'current combat order',   binds: 'combat.order' },
];
const PERMS = [
  { id: 'read',   label: 'Read campaign data',  sub: 'party, gold, combat state' },
  { id: 'write',  label: 'Write campaign data', sub: 'can change shared values' },
  { id: 'dice',   label: 'Roll dice',           sub: 'use the dice engine' },
  { id: 'net',    label: 'Network access',      sub: 'fetch from outside the app' },
];

function buildSpec(s) {
  switch (s.output) {
    case 'counter': return { kind: 'counter', label: s.title, value: 3 };
    case 'tally':   return { kind: 'tally', items: [['Mara', 1], ['Bran', 0], ['Lyra', 2]] };
    case 'table':   return { kind: 'table', rows: (s.rows || 'A bell tolls\nThe tide turns\nSalt blooms').split('\n').filter(Boolean) };
    case 'stat':    return { kind: 'stat', label: s.title, value: 42, unit: s.unit || '' };
    case 'clock':   return { kind: 'clock', label: s.title, filled: 2, segments: 6 };
    default:        return { kind: 'note', text: s.text || 'Custom widget body.' };
  }
}
function genCode(s) {
  const bound = SOURCES.filter((x) => s.sources[x.id]);
  const reads = bound.length ? bound.map((b) => `  const ${b.id} = host.read('${b.binds}');`).join('\n') : "  // no data sources bound yet";
  return `// ${s.title || 'Custom widget'} — runs sandboxed on the scene
export default function widget(host) {
${reads}

  return host.render(\`
    <h3>{{ title }}</h3>
    ${s.output === 'counter' ? '<Counter value={{ count }} onChange={host.set} />'
    : s.output === 'table' ? '<RollTable rows={{ rows }} />'
    : s.output === 'stat' ? '<Stat value={{ value }} unit="' + (s.unit || '') + '" />'
    : '<Note>{{ body }}</Note>'}
  \`);
}`;
}

function Row({ children }) { return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>{children}</div>; }
function Toggle({ on, onClick, label, sub, code }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', textAlign: 'left', border: '1px solid ' + (on ? 'var(--color-accent-border)' : 'var(--color-border)'), borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-alt)', cursor: 'pointer' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{label}{code && <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{code}</span>}</div>
        <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{sub}</div>
      </div>
      <span style={{ width: 20, height: 20, borderRadius: 6, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--color-accent)' : 'transparent', border: '1.5px solid ' + (on ? 'var(--color-accent)' : 'var(--color-border-strong)') }}>{on && <BD.Icon name="check" size={13} color="var(--color-accent-foreground)" />}</span>
    </button>
  );
}

function WidgetBuilder({ initial, onCreate, onClose }) {
  const [tab, setTab] = React.useState('compose');
  const [s, setS] = React.useState(() => ({
    title: (initial && initial.title) || 'My widget', output: 'counter',
    unit: '', rows: 'A bell tolls underwater\nThe tide runs backward\nSalt blooms on the walls', text: 'Custom widget body.',
    sources: { timer: true }, perms: { read: true }, vis: 'dm', accent: false,
    spec: (initial && initial.props && initial.props.spec) || null,
  }));
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const spec = buildSpec(s);
  const preview = { id: 'preview', type: 'custom', title: s.title, tier: 'custom', vis: s.vis, x: 0, y: 0, w: 280, h: 220, props: { accent: s.accent, spec } };

  const save = () => onCreate({
    title: s.title, w: 280, h: 220, vis: s.vis,
    props: { accent: s.accent, spec, meta: { sources: Object.keys(s.sources).filter((k) => s.sources[k]), perms: Object.keys(s.perms).filter((k) => s.perms[k]) } },
  });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
      <div style={{ position: 'relative', margin: 'auto', width: 880, height: 600, maxHeight: '92%', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)' }}><BD.Icon name="Code2" size="sm" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>Build a custom widget</div>
            <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Compose visually, drop into code, bind data, set what it can touch.</div>
          </div>
          <BD.IconButton icon="close" label="Close" variant="ghost" onClick={onClose} />
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* left: editor */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid var(--color-border)' }}>
            <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
              <BD.Tabs value={tab} onChange={setTab} tabs={[{ id: 'compose', label: 'Compose' }, { id: 'code', label: 'Code' }, { id: 'data', label: 'Data' }, { id: 'perms', label: 'Permissions' }]} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
              {tab === 'compose' && (
                <Row>
                  <BD.Field label="Widget name"><BD.Input value={s.title} onChange={(e) => set('title', e.target.value)} /></BD.Field>
                  <BD.Field label="Output">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {OUTPUTS.map((o) => {
                        const on = o.id === s.output;
                        return (
                          <button key={o.id} type="button" onClick={() => set('output', o.id)}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 'var(--space-3)', border: '1px solid ' + (on ? 'var(--color-accent)' : 'var(--color-border)'), borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-alt)', cursor: 'pointer', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                            <BD.Icon name={o.icon} size="md" /><span style={{ font: '600 var(--text-xs) var(--font-sans)' }}>{o.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </BD.Field>
                  {s.output === 'table' && <BD.Field label="Rows (one per line)"><BD.Textarea rows={4} value={s.rows} onChange={(e) => set('rows', e.target.value)} /></BD.Field>}
                  {s.output === 'note' && <BD.Field label="Body text"><BD.Textarea rows={3} value={s.text} onChange={(e) => set('text', e.target.value)} /></BD.Field>}
                  {s.output === 'stat' && <BD.Field label="Unit"><BD.Input value={s.unit} placeholder="e.g. gp, HP, days" onChange={(e) => set('unit', e.target.value)} /></BD.Field>}
                </Row>
              )}
              {tab === 'code' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
                    <BD.Icon name="info" size={13} /><span>Runs sandboxed. Reach data through <code style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-accent)' }}>host</code>; interpolate with <code style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-accent)' }}>{'{{ }}'}</code>.</span>
                  </div>
                  <textarea readOnly value={genCode(s)} spellCheck={false}
                    style={{ flex: 1, minHeight: 280, resize: 'none', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-sunken)', color: 'var(--color-text-primary)', font: 'var(--text-xs)/1.6 var(--font-mono)', tabSize: 2 }} />
                </div>
              )}
              {tab === 'data' && (
                <Row>
                  <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Bind campaign data so the widget stays in sync. Each becomes a <code style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-accent)' }}>host.read()</code> in code.</div>
                  {SOURCES.map((src) => <Toggle key={src.id} on={!!s.sources[src.id]} onClick={() => set('sources', { ...s.sources, [src.id]: !s.sources[src.id] })} label={src.label} sub={src.sub} code={src.binds} />)}
                </Row>
              )}
              {tab === 'perms' && (
                <Row>
                  <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>This widget runs in a sandbox. Grant only what it needs.</div>
                  {PERMS.map((p) => <Toggle key={p.id} on={!!s.perms[p.id]} onClick={() => set('perms', { ...s.perms, [p.id]: !s.perms[p.id] })} label={p.label} sub={p.sub} />)}
                </Row>
              )}
            </div>
          </div>

          {/* right: live preview */}
          <div style={{ width: 320, flex: '0 0 auto', display: 'flex', flexDirection: 'column', padding: 'var(--space-4)', gap: 'var(--space-3)', background: 'var(--color-bg)', overflowY: 'auto' }}>
            <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Live preview</span>
            <div style={{ height: 200, flex: '0 0 auto' }}><window.SceneWidget w={preview} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
              <BD.Field label="Default visibility">
                <BD.SegmentedControl size="sm" fullWidth value={s.vis} onChange={(v) => set('vis', v)} options={[{ value: 'dm', label: 'DM only' }, { value: 'players', label: 'Players' }]} />
              </BD.Field>
              <BD.Switch checked={s.accent} onChange={(v) => set('accent', v)} label="Emphasize (accent panel)" />
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
            <BD.Icon name="lock" size={13} />{Object.keys(s.perms).filter((k) => s.perms[k]).length} permission(s) · {Object.keys(s.sources).filter((k) => s.sources[k]).length} data source(s)
          </span>
          <BD.Button variant="ghost" onClick={onClose}>Cancel</BD.Button>
          <BD.Button variant="primary" icon="check" onClick={save}>Add to scene</BD.Button>
        </div>
      </div>
    </div>
  );
}

/* ── new scene from a template (kit of starting widgets) ── */
function NewSceneDialog({ onCreate, onClose }) {
  const [sel, setSel] = React.useState('blank');
  const [name, setName] = React.useState('New scene');
  const tpls = window.SCN.sceneTemplates;
  return (
    <BD.Dialog open onClose={onClose} title="New scene" description="Start blank, or from a kit of widgets you can rearrange." size="lg"
      footer={<React.Fragment>
        <BD.Button variant="ghost" onClick={onClose}>Cancel</BD.Button>
        <BD.Button variant="primary" icon="add" onClick={() => onCreate(tpls.find((t) => t.id === sel), name.trim() || 'New scene')}>Create scene</BD.Button>
      </React.Fragment>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <BD.Field label="Scene name"><BD.Input value={name} onChange={(e) => setName(e.target.value)} /></BD.Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
          {tpls.map((t) => {
            const on = t.id === sel;
            return (
              <button key={t.id} type="button" onClick={() => setSel(t.id)}
                style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3)', textAlign: 'left', border: '1px solid ' + (on ? 'var(--color-accent)' : 'var(--color-border)'), borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-alt)', cursor: 'pointer' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', flex: '0 0 auto' }}><BD.Icon name={t.icon} size="md" /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{t.name}</div>
                  <div style={{ font: 'var(--text-xs)/1.45 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{t.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </BD.Dialog>
  );
}

Object.assign(window, { WidgetBuilder, NewSceneDialog });
