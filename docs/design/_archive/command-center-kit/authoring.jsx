// NoteEditor + MapBuilder. Authoring surfaces — richer and slower than the live hot paths. Compose
// the design-system primitives over the shared PageShell/Panel chrome.
const AU = window.DNDToolsDesignSystem_8ae046;

/* markdown-ish renderer (uniquely named to avoid global clashes with other script files) */
function mdBold(t) {
  return t.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g).map((p, i) => {
    if (p.startsWith('**')) return <strong key={i} style={{ color: 'var(--color-text-primary)' }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('[[')) return <a key={i} style={{ color: 'var(--color-accent)', textDecoration: 'none', borderBottom: '1px dashed var(--color-accent-border)', cursor: 'pointer' }}>{p.slice(2, -2)}</a>;
    return p;
  });
}
function mdRender(src) {
  return src.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <div key={i} style={{ font: '700 var(--text-2xl) var(--font-display)', color: 'var(--color-text-primary)', margin: '6px 0' }}>{line.slice(3)}</div>;
    if (line.startsWith('### ')) return <div key={i} style={{ font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-accent)', margin: '14px 0 2px' }}>{line.slice(4)}</div>;
    if (line.startsWith('> ')) return <div key={i} style={{ borderLeft: '3px solid var(--color-accent-border)', paddingLeft: 'var(--space-3)', color: 'var(--color-text-secondary)', fontStyle: 'italic', margin: '10px 0' }}>{mdBold(line.slice(2))}</div>;
    if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 'var(--space-4)', margin: '3px 0' }}>• {mdBold(line.slice(2))}</div>;
    if (line.trim() === '') return <div key={i} style={{ height: 10 }} />;
    return <div key={i} style={{ margin: '4px 0' }}>{mdBold(line)}</div>;
  });
}

function RelRow({ r }) {
  return (
    <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', padding: 'var(--space-2)', border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-interactive-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      <AU.Icon name="link" size="sm" color="var(--color-text-tertiary)" />
      <span style={{ flex: 1, minWidth: 0, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
      <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{r.kind}</span>
    </button>
  );
}

function NoteEditor() {
  const d = window.DNDPages;
  const [vis, setVis] = React.useState('dm-only');
  const [preview, setPreview] = React.useState(false);
  const fmt = ['Bold', 'Italic', 'Link2', 'Code', 'Heading', 'List', 'Quote'];
  return (
    <window.PageShell icon="knowledge-book" eyebrow="Knowledge" title="Note editor"
      actions={<React.Fragment>
        <AU.Badge status="success" icon="check">Saved</AU.Badge>
        <AU.Button variant="secondary" size="sm" icon="send">Push to players</AU.Button>
        <AU.IconButton icon="more" label="More" variant="ghost" />
      </React.Fragment>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 'var(--space-5)', maxWidth: 1100, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <input defaultValue="The Sunken Outpost" style={{ width: '100%', border: 'none', background: 'transparent', font: '700 var(--text-3xl) var(--font-display)', color: 'var(--color-text-primary)', outline: 'none', padding: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
            <AU.Icon name="campaign-scroll" size="sm" />Campaign · updated 2m ago
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 'var(--space-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', flexWrap: 'wrap' }}>
            {fmt.map((f) => <AU.IconButton key={f} icon={f} label={f} variant="ghost" size="sm" />)}
            <span style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 4px' }} />
            <AU.IconButton icon="Columns2" label="Split preview" variant={preview ? 'accent' : 'ghost'} size="sm" onClick={() => setPreview((v) => !v)} />
            <AU.IconButton icon="Maximize2" label="Focus mode" variant="ghost" size="sm" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr', gap: 'var(--space-4)' }}>
            <div style={{ font: 'var(--text-md)/1.7 var(--font-sans)', color: 'var(--color-text-primary)', padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', minHeight: 320 }}>
              {mdRender(d.noteBody)}
            </div>
            {preview && (
              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)' }}>
                <window.Eyebrow style={{ marginBottom: 'var(--space-2)' }}>Preview</window.Eyebrow>
                <div style={{ font: 'var(--text-sm)/1.7 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{mdRender(d.noteBody)}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <window.Panel title="Properties" pad="md">
            <window.Eyebrow>Visibility</window.Eyebrow>
            <window.Seg value={vis} onChange={setVis} options={[{ value: 'dm-only', label: 'DM only', icon: 'dm-only' }, { value: 'player-visible', label: 'Players', icon: 'visibility-players' }]} />
            <AU.Field label="Source" style={{ marginTop: 'var(--space-2)' }}>
              <AU.Select options={[{ value: 'campaign', label: 'Campaign' }, { value: 'scene', label: 'Scene: The Pier' }, { value: 'npc', label: 'NPC' }]} />
            </AU.Field>
            <window.Eyebrow style={{ marginTop: 'var(--space-2)' }}>Tags</window.Eyebrow>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <AU.Chip tone="neutral" onRemove={() => {}}>cult</AU.Chip>
              <AU.Chip tone="neutral" onRemove={() => {}}>location</AU.Chip>
              <AU.Chip tone="accent" onClick={() => {}}>+ Add</AU.Chip>
            </div>
          </window.Panel>

          <window.Panel title="Backlinks" pad="md" action={<span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{d.backlinks.length}</span>}>
            {d.backlinks.map((b) => <RelRow key={b.id} r={b} />)}
          </window.Panel>
          <window.Panel title="Related notes" pad="md">
            {d.related.map((r) => <RelRow key={r.id} r={r} />)}
          </window.Panel>
        </div>
      </div>
    </window.PageShell>
  );
}

/* ---------------- Map builder ---------------- */
const LAYER_TONE = { base: 'var(--color-accent)', grid: 'var(--color-text-tertiary)', walls: 'var(--color-text-secondary)', fog: 'var(--color-status-info)', lights: 'var(--color-status-warning)', tokens: 'var(--color-status-success)', dm: 'var(--color-visibility-dm, #b48ad8)' };

function LayerRow({ l }) {
  const [vis, setVis] = React.useState(l.vis);
  const [on, setOn] = React.useState(l.enabled);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-2-5, 10px)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', opacity: l.locked ? 0.85 : 1 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: LAYER_TONE[l.tone], flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
          {l.locked && <AU.Icon name="lock" size={12} color="var(--color-text-tertiary)" />}
        </div>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{l.cat} · {l.marks} mark{l.marks === 1 ? '' : 's'} · {l.opacity}%</div>
      </div>
      <AU.IconButton icon={vis === 'player-visible' ? 'visibility-players' : 'dm-only'} label="Toggle player visibility" variant="ghost" size="sm"
        onClick={() => setVis((v) => (v === 'player-visible' ? 'dm-only' : 'player-visible'))} />
      <AU.IconButton icon={on ? 'Eye' : 'EyeOff'} label="DM display" variant="ghost" size="sm" onClick={() => setOn((v) => !v)} />
    </div>
  );
}

function MapBuilder() {
  const d = window.DNDPages;
  const [tool, setTool] = React.useState('select');
  const [filter, setFilter] = React.useState('all');
  const cats = ['all', 'Walls', 'Fog', 'Lights', 'Tokens'];
  const layers = d.mapLayers.filter((l) => filter === 'all' || l.cat === filter);
  return (
    <window.PageShell icon="atlas-map" eyebrow="Atlas" title="Map builder — The Pier"
      actions={<React.Fragment>
        <AU.IconButton icon="Undo2" label="Undo" variant="ghost" />
        <AU.IconButton icon="Redo2" label="Redo" variant="ghost" />
        <span style={{ width: 1, height: 22, background: 'var(--color-border)' }} />
        <AU.Badge status="success" icon="visibility-players">Projecting · 3</AU.Badge>
        <AU.Button variant="primary" size="sm" icon="send">Project to players</AU.Button>
      </React.Fragment>}>
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        {/* tool rail */}
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--space-3) var(--space-2)', borderRight: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}>
          {d.mapTools.map((t) => (
            <AU.IconButton key={t.id} icon={t.icon} label={t.label} variant={tool === t.id ? 'accent' : 'ghost'} onClick={() => setTool(t.id)} />
          ))}
        </div>

        {/* canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: 'var(--space-5)' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 420, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'linear-gradient(135deg, #2a2117, #14100b)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(224,176,111,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(224,176,111,.08) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
            {/* fog region */}
            <div style={{ position: 'absolute', right: 0, top: 0, width: '34%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(8,6,4,.86))', borderLeft: '1px dashed rgba(224,176,111,.35)' }} />
            <div style={{ position: 'absolute', right: 16, top: 14, font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Fog — hidden from players</div>
            {/* tokens */}
            {d.tokens.map((t) => (
              <div key={t.id} style={{ position: 'absolute', left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%,-50%)' }}>
                <AU.Avatar name={t.label} size="sm" ring={t.tone === 'pc' ? 'active' : 'danger'} />
              </div>
            ))}
            {/* selected wall hint */}
            <div style={{ position: 'absolute', left: '16%', top: '24%', width: '40%', height: '46%', border: '2px solid var(--color-accent)', borderRadius: 4, boxShadow: '0 0 0 9999px rgba(0,0,0,0)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: 16, bottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-secondary)', background: 'var(--color-surface-overlay)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>1 sq = 5 ft</span>
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>Tool: {d.mapTools.find((t) => t.id === tool).label}</span>
            </div>
          </div>
        </div>

        {/* layers + properties */}
        <aside style={{ flex: '0 0 auto', width: 320, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-4)', borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', overflowY: 'auto' }}>
          <window.Panel title="Layers" flat style={{ padding: 0, gap: 'var(--space-2)' }}
            action={<AU.Button variant="ghost" size="sm" icon="add">Add</AU.Button>}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {cats.map((c) => <AU.Chip key={c} tone={filter === c ? 'accent' : 'neutral'} onClick={() => setFilter(c)} style={{ cursor: 'pointer' }}>{c === 'all' ? 'All' : c}</AU.Chip>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {layers.map((l) => <LayerRow key={l.id} l={l} />)}
            </div>
          </window.Panel>

          <window.Panel title="Map" flat style={{ padding: 0 }}>
            <AU.Field label="Grid size"><AU.Select options={['16 px', '24 px', '32 px', '48 px'].map((v) => ({ value: v, label: v }))} defaultValue="32 px" /></AU.Field>
            <AU.Field label="Scale"><AU.Input defaultValue="5 ft / square" /></AU.Field>
            <AU.Switch checked={true} onChange={() => {}} label="Snap to grid" />
          </window.Panel>
        </aside>
      </div>
    </window.PageShell>
  );
}

Object.assign(window, { NoteEditor, MapBuilder });
