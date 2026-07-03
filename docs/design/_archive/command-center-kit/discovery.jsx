// Discovery surfaces (UX-GRAPH / UX-SRCH): the relationship graph canvas + entity detail, and the
// ⌘K command palette with a full-page faceted search. Both honor the actor-filtered query model —
// flip to "Player view" and every DM-only / hidden entity drops out of the graph and the results.
const DV = window.DNDToolsDesignSystem_8ae046;

const TYPE_TONE = { character: 'accent', place: 'info', faction: 'warning', item: 'success', note: 'neutral', quest: 'accent' };
const TYPE_ICON = { character: 'characters-person', place: 'atlas-map', faction: 'campaign-scroll', item: 'tag', note: 'knowledge-book', quest: 'flag' };
const TONE_COLOR = {
  accent: 'var(--color-accent)', info: 'var(--color-status-info)', warning: 'var(--color-status-warning)',
  success: 'var(--color-status-success)', neutral: 'var(--color-text-tertiary)', error: 'var(--color-status-error)',
};

function ActorToggle({ actor, setActor }) {
  return (
    <window.Seg value={actor} onChange={setActor} options={[
      { value: 'dm', label: 'DM view', icon: 'dm-only' },
      { value: 'players', label: 'Player view', icon: 'visibility-players' },
    ]} />
  );
}

/* ════════════════ Relationship graph ════════════════ */
function GraphSearch() {
  const g = window.DNDGaps2.graph;
  const types = window.DNDGaps2.nodeTypes;
  const [actor, setActor] = React.useState('dm');
  const [sel, setSel] = React.useState('vorlag');
  const [off, setOff] = React.useState({}); // type filters

  const visible = (n) => actor === 'dm' || n.vis !== 'dm-only';
  const typeOn = (t) => !off[t];
  const shown = g.nodes.filter((n) => visible(n) && typeOn(n.type));
  const shownIds = new Set(shown.map((n) => n.id));
  const edges = g.edges.filter((e) => shownIds.has(e.from) && shownIds.has(e.to));
  const pos = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const hiddenCount = g.nodes.length - g.nodes.filter(visible).length;

  const selNode = pos[sel] && shownIds.has(sel) ? pos[sel] : null;
  const selEdges = selNode ? g.edges.filter((e) => (e.from === sel || e.to === sel) && shownIds.has(e.from) && shownIds.has(e.to)) : [];

  return (
    <window.PageShell icon="link" eyebrow="Knowledge" title="Relationship graph"
      actions={<React.Fragment>
        <ActorToggle actor={actor} setActor={setActor} />
        <DV.Button variant="ghost" size="sm" icon="search" onClick={() => window.DNDNavigate('search')}>Search</DV.Button>
      </React.Fragment>}>
      <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr) 300px', gap: 'var(--space-4)', height: '100%', padding: 'var(--space-4) var(--space-5)', boxSizing: 'border-box' }}>

        {/* legend / type filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <window.Panel title="Entity types" pad="md">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {types.map((t) => {
                const on = typeOn(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => setOff((o) => ({ ...o, [t.id]: !o[t.id] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent', cursor: 'pointer', opacity: on ? 1 : 0.4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: TONE_COLOR[t.tone], flex: '0 0 auto' }} />
                    <DV.Icon name={t.icon} size={15} color="var(--color-text-secondary)" />
                    <span style={{ flex: 1, textAlign: 'left', font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{t.label}</span>
                    {!on && <DV.Icon name="hidden" size={13} color="var(--color-text-tertiary)" />}
                  </button>
                );
              })}
            </div>
          </window.Panel>
          {actor === 'players' && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', border: '1px solid var(--color-accent-border)' }}>
              <DV.Icon name="dm-only" size="sm" color="var(--color-accent)" />
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                <b style={{ color: 'var(--color-text-primary)' }}>{hiddenCount} entities hidden.</b> DM-only nodes never enter the player query model.
              </div>
            </div>
          )}
        </div>

        {/* graph canvas */}
        <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', background: 'radial-gradient(900px 460px at 50% 30%, var(--color-accent-subtle), transparent 65%), var(--color-surface-sunken)', overflow: 'hidden' }}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {edges.map((e, i) => {
              const a = pos[e.from], b = pos[e.to];
              const onSel = e.from === sel || e.to === sel;
              return (
                <line key={i} x1={`${a.x}%`} y1={`${a.y}%`} x2={`${b.x}%`} y2={`${b.y}%`}
                  stroke={onSel ? (TONE_COLOR[e.tone] || 'var(--color-accent)') : 'var(--color-border-strong)'}
                  strokeWidth={onSel ? 2 : 1.25} strokeDasharray={e.tone === 'warning' || e.tone === 'error' ? '5 4' : undefined} opacity={onSel ? 0.95 : 0.5} />
              );
            })}
          </svg>
          {shown.map((n) => {
            const isSel = n.id === sel;
            const size = Math.max(40, n.r * 1.7);
            return (
              <button key={n.id} type="button" onClick={() => setSel(n.id)} title={n.label}
                style={{ position: 'absolute', left: `${n.x}%`, top: `${n.y}%`, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer', width: size + 70, zIndex: isSel ? 5 : 2 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: '50%', background: 'var(--color-surface-raised)', color: TONE_COLOR[TYPE_TONE[n.type]], border: `2px solid ${isSel ? 'var(--color-accent)' : TONE_COLOR[TYPE_TONE[n.type]]}`, boxShadow: isSel ? 'var(--shadow-md)' : 'var(--shadow-sm)', outline: n.vis === 'dm-only' ? '2px solid color-mix(in oklch, var(--color-accent) 55%, transparent)' : 'none', outlineOffset: 2 }}>
                  <DV.Icon name={TYPE_ICON[n.type]} size={Math.round(size * 0.42)} />
                </span>
                <span style={{ font: `${isSel ? 700 : 500} var(--text-2xs) var(--font-sans)`, color: isSel ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', textAlign: 'center', maxWidth: 110, lineHeight: 1.2, padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: isSel ? 'var(--color-surface-overlay)' : 'transparent' }}>{n.label}</span>
              </button>
            );
          })}
          <div style={{ position: 'absolute', left: 'var(--space-3)', bottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6, font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
            <DV.Icon name="link" size={12} /> {shown.length} entities · {edges.length} relationships
          </div>
        </div>

        {/* entity detail */}
        <window.Panel title="Entity" pad="md" style={{ alignSelf: 'start' }}>
          {selNode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: TONE_COLOR[TYPE_TONE[selNode.type]], border: `1px solid ${TONE_COLOR[TYPE_TONE[selNode.type]]}` }}><DV.Icon name={TYPE_ICON[selNode.type]} size="md" /></span>
                <div>
                  <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>{selNode.label}</div>
                  <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>{selNode.type}</div>
                </div>
              </div>
              <window.Vis level={selNode.vis === 'dm-only' ? 'dm-only' : 'player-visible'} />
              <div style={{ height: 1, background: 'var(--color-border)' }} />
              <window.Eyebrow>Connections · {selEdges.length}</window.Eyebrow>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selEdges.map((e, i) => {
                  const other = e.from === sel ? pos[e.to] : pos[e.from];
                  const dir = e.from === sel ? e.kind : `${e.kind} ←`;
                  return (
                    <button key={i} type="button" onClick={() => setSel(other.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: TONE_COLOR[e.tone || TYPE_TONE[other.type]], flex: '0 0 auto' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{other.label}</div>
                        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{dir}</div>
                      </div>
                      <DV.Icon name="chevron-right" size={14} color="var(--color-text-tertiary)" />
                    </button>
                  );
                })}
              </div>
              <DV.Button variant="secondary" size="sm" icon="enter">Open entity</DV.Button>
            </div>
          ) : (
            <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-tertiary)', padding: 'var(--space-4) 0' }}>Select a node to inspect its relationships.</div>
          )}
        </window.Panel>
      </div>
    </window.PageShell>
  );
}

/* ════════════════ Command palette + faceted search ════════════════ */
function PaletteRow({ item, active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: active ? 'var(--color-accent-subtle)' : 'transparent', cursor: 'pointer' }}>
      <DV.Icon name={item.icon} size="sm" color={active ? 'var(--color-accent)' : 'var(--color-text-tertiary)'} />
      <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{item.label}</span>
      <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{item.kind}</span>
      {item.keys && <kbd style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)', borderRadius: 3, padding: '1px 5px', background: 'var(--color-surface-sunken)' }}>{item.keys}</kbd>}
    </div>
  );
}

function CommandPalette() {
  const d = window.DNDGaps2;
  const [mode, setMode] = React.useState('palette');
  const [facet, setFacet] = React.useState('all');
  const [actor, setActor] = React.useState('dm');
  const visible = (r) => actor === 'dm' || (r.vis !== 'dm-only' && r.vis !== 'hidden');
  const results = d.searchResults.filter((r) => (facet === 'all' || r.type === facet) && visible(r));

  return (
    <window.PageShell icon="search" eyebrow="Find anything" title="Search"
      actions={<React.Fragment>
        <ActorToggle actor={actor} setActor={setActor} />
        <window.Seg value={mode} onChange={setMode} options={[{ value: 'palette', label: '⌘K palette' }, { value: 'results', label: 'Full results' }]} />
      </React.Fragment>}>

      {mode === 'palette' ? (
        // ⌘K overlay over a dimmed backdrop
        <div style={{ position: 'relative', minHeight: '100%', padding: 'var(--space-8) var(--space-5)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'var(--color-overlay-scrim, rgba(0,0,0,.45))', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', maxWidth: 600, margin: '0 auto', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
              <DV.Icon name="search" size="md" color="var(--color-text-tertiary)" />
              <input autoFocus placeholder="Search entities or type a command…" defaultValue="vorlag"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: 'var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }} />
              <kbd style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)', borderRadius: 3, padding: '2px 6px' }}>ESC</kbd>
            </div>
            <div style={{ maxHeight: 380, overflowY: 'auto', padding: 'var(--space-2)' }}>
              <window.Eyebrow style={{ padding: 'var(--space-2) var(--space-3) 2px' }}>Top match</window.Eyebrow>
              <PaletteRow item={{ label: 'Vorlag', kind: 'NPC · DM only', icon: 'characters-person' }} active />
              <window.Eyebrow style={{ padding: 'var(--space-3) var(--space-3) 2px' }}>Recent</window.Eyebrow>
              {d.paletteRecent.map((r) => <PaletteRow key={r.id} item={r} />)}
              <window.Eyebrow style={{ padding: 'var(--space-3) var(--space-3) 2px' }}>Commands</window.Eyebrow>
              {d.paletteCommands.map((c) => <PaletteRow key={c.id} item={c} />)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-2) var(--space-4)', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-sunken)', font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
              <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>↑↓</kbd> navigate</span>
              <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>↵</kbd> open</span>
              <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>⌘↵</kbd> open in new pane</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}><DV.Icon name="dm-only" size={12} /> player-scoped on touch via the header search</span>
            </div>
          </div>
        </div>
      ) : (
        // Full-page faceted results
        <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr)', gap: 'var(--space-5)', maxWidth: 1080, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
          <window.Panel title="Filter" pad="md">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {d.searchFacets.map((f) => {
                const on = f.id === facet;
                return (
                  <button key={f.id} type="button" onClick={() => setFacet(f.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', border: 'none', borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', cursor: 'pointer' }}>
                    <span style={{ flex: 1, textAlign: 'left', font: `${on ? 600 : 500} var(--text-sm) var(--font-sans)`, color: on ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>{f.label}</span>
                    <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{f.count}</span>
                  </button>
                );
              })}
            </div>
          </window.Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
              <DV.Icon name="search" size="md" color="var(--color-text-tertiary)" />
              <input defaultValue="brine hand" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: 'var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }} />
              <span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{results.length} results</span>
            </div>
            {results.map((r) => (
              <button key={r.id} type="button" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-border)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', color: TONE_COLOR[TYPE_TONE[r.type]], flex: '0 0 auto' }}><DV.Icon name={TYPE_ICON[r.type]} size="md" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{r.title}</span>
                    <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{r.source}</span>
                    {(r.vis === 'dm-only' || r.vis === 'hidden') && <window.Vis level="dm-only" />}
                  </div>
                  <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.5 }}>{r.snippet}</div>
                </div>
              </button>
            ))}
            {actor === 'players' && (
              <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px dashed var(--color-border-strong)', font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
                <DV.Icon name="dm-only" size="sm" /> DM-only and hidden entities are filtered out of player results — no name, snippet, or count leaks.
              </div>
            )}
          </div>
        </div>
      )}
    </window.PageShell>
  );
}

Object.assign(window, { GraphSearch, CommandPalette });
