// scene-inspector.jsx — the tiered widget inspector, the Add-widget palette, and the AI
// "generate a widget" dialog. Exposes window.SceneInspector, window.AddPalette, window.AiDialog.
const IN = window.DNDToolsDesignSystem_8ae046;

const TIERBADGE = {
  system:   { label: 'System',   status: 'neutral' },
  template: { label: 'Template', status: 'info' },
  custom:   { label: 'Custom',   status: 'success' },
  ai:       { label: 'AI',       status: 'accent' },
};
const SIZES = [{ id: 'S', w: 240, h: 180 }, { id: 'M', w: 300, h: 240 }, { id: 'L', w: 420, h: 300 }];

function InsSeg({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 8px', border: 'none', borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)', font: `${on ? 600 : 500} var(--text-xs) var(--font-sans)`, cursor: 'pointer' }}>
            {o.icon && <IN.Icon name={o.icon} size={13} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}
function Section({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-4) 0', borderTop: '1px solid var(--color-border)' }}>
      <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{label}</span>
      {children}
    </div>
  );
}

/* type-specific settings (template / custom / ai) */
function ChipEditor({ items, onChange, placeholder }) {
  const [draft, setDraft] = React.useState('');
  const add = () => { const v = draft.trim(); if (v) onChange([...items, v]); setDraft(''); };
  return (
    <React.Fragment>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {items.map((p, i) => <IN.Chip key={i} tone="neutral" onRemove={() => onChange(items.filter((_, j) => j !== i))}>{p}</IN.Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <IN.Input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} style={{ flex: 1 }} />
        <IN.Button variant="secondary" size="sm" icon="add" onClick={add}>Add</IN.Button>
      </div>
    </React.Fragment>
  );
}

function Settings({ w, onProp }) {
  const t = w.type, p = w.props;
  if (t === 'note' || t === 'library') return (
    <React.Fragment>
      <IN.Field label="Text"><IN.Textarea value={p.text} rows={4} onChange={(e) => onProp('text', e.target.value)} /></IN.Field>
      <IN.Field label="Text size"><InsSeg value={p.size || 'md'} onChange={(v) => onProp('size', v)} options={[{ value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }]} /></IN.Field>
    </React.Fragment>
  );
  if (t === 'clock') return (
    <React.Fragment>
      <IN.Field label="Label"><IN.Input value={p.label} onChange={(e) => onProp('label', e.target.value)} /></IN.Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
        <IN.Field label="Filled"><IN.Select value={String(p.filled)} onChange={(e) => onProp('filled', Number(e.target.value))} options={['0', '1', '2', '3', '4', '5', '6', '7', '8'].map((v) => ({ value: v, label: v }))} /></IN.Field>
        <IN.Field label="Segments"><IN.Select value={String(p.segments)} onChange={(e) => onProp('segments', Number(e.target.value))} options={['4', '5', '6', '7', '8'].map((v) => ({ value: v, label: v }))} /></IN.Field>
      </div>
    </React.Fragment>
  );
  if (t === 'dice') return <IN.Field label="Presets"><ChipEditor items={p.presets || []} onChange={(v) => onProp('presets', v)} placeholder="e.g. 1d12+4" /></IN.Field>;
  if (t === 'randomtable') return (
    <React.Fragment>
      <IN.Field label="Title"><IN.Input value={p.title} onChange={(e) => onProp('title', e.target.value)} /></IN.Field>
      <IN.Field label="Entries"><ChipEditor items={p.rows || []} onChange={(v) => onProp('rows', v)} placeholder="Add an entry" /></IN.Field>
    </React.Fragment>
  );
  if (t === 'loot') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
      <IN.Field label="Gold"><IN.Input value={String(p.gold)} onChange={(e) => onProp('gold', Number(e.target.value) || 0)} /></IN.Field>
      <IN.Field label="Shares"><IN.Select value={String(p.party)} onChange={(e) => onProp('party', Number(e.target.value))} options={['2', '3', '4', '5', '6'].map((v) => ({ value: v, label: v }))} /></IN.Field>
    </div>
  );
  if (t === 'image') return <IN.Field label="Caption"><IN.Input value={p.caption} onChange={(e) => onProp('caption', e.target.value)} /></IN.Field>;
  if (t === 'ai') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', gap: 8, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', border: '1px solid var(--color-accent-border)' }}>
        <IN.Icon name="sparkle" size="sm" color="var(--color-accent)" />
        <span style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{(p.spec && p.spec.note) || 'Generated by AI.'}</span>
      </div>
    </div>
  );
  return <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>No extra settings.</div>;
}

function SceneInspector({ w, onChange, onProp, onRemove, onDuplicate, onFront, onBack, onCode, onClose }) {
  const meta = window.SCN.types[w.type] || {};
  const tier = w.tier;
  const tb = TIERBADGE[tier];
  const isSystem = tier === 'system';
  const activeSize = SIZES.find((s) => s.w === w.w && s.h === w.h);

  return (
    <aside style={{ width: 320, flex: '0 0 auto', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', flex: '0 0 auto' }}><IN.Icon name={meta.icon || 'widget'} size="md" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</div>
          <IN.Badge status={tb.status}>{tb.label}</IN.Badge>
        </div>
        <IN.IconButton icon="close" label="Close inspector" variant="ghost" onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4)' }}>
        <Section label="Name">
          <IN.Input value={w.title} disabled={isSystem} onChange={(e) => onChange({ title: e.target.value })} />
          {isSystem && <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>System widgets keep their name.</span>}
        </Section>

        <Section label="Visibility">
          <InsSeg value={w.vis} onChange={(v) => onChange({ vis: v })}
            options={[{ value: 'dm', label: 'DM only', icon: 'dm-only' }, { value: 'players', label: 'Players', icon: 'visibility-players' }]} />
        </Section>

        {!isSystem && (
          <Section label="Size">
            <div style={{ display: 'flex', gap: 6 }}>
              {SIZES.map((s) => {
                const on = activeSize && activeSize.id === s.id;
                return <IN.Chip key={s.id} tone={on ? 'accent' : 'neutral'} onClick={() => onChange({ w: s.w, h: s.h })} style={{ cursor: 'pointer', flex: 1, justifyContent: 'center' }}>{s.id}</IN.Chip>;
              })}
            </div>
            <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{w.w} × {w.h} px · drag the corner to resize</span>
          </Section>
        )}

        <Section label="Appearance">
          <IN.Switch checked={!!w.props.accent} onChange={(v) => onProp('accent', v)} label="Emphasize (accent panel)" />
        </Section>

        <Section label="Layer">
          <div style={{ display: 'flex', gap: 6 }}>
            <IN.Button variant="secondary" size="sm" icon="chevron-up" onClick={onFront} style={{ flex: 1 }}>Bring to front</IN.Button>
            <IN.Button variant="secondary" size="sm" icon="chevron-down" onClick={onBack} style={{ flex: 1 }}>Send to back</IN.Button>
          </div>
        </Section>

        {(tier === 'custom' || tier === 'ai') && (
          <Section label="Code">
            <IN.Button variant="secondary" size="sm" icon="Code2" onClick={onCode}>Open code editor</IN.Button>
            <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Full HTML / CSS / JS with the host API — override anything.</span>
          </Section>
        )}

        {isSystem ? (
          <Section label="Content">
            <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
              <IN.Icon name="lock" size="sm" color="var(--color-text-tertiary)" />
              <span style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>A system widget. Its content stays in sync automatically — you can move it, restyle it and set who sees it. Its size and content are managed for you.</span>
            </div>
          </Section>
        ) : (
          <Section label="Settings"><Settings w={w} onProp={onProp} /></Section>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
        <IN.Button variant="secondary" size="sm" icon="duplicate" disabled={isSystem} onClick={onDuplicate}>Duplicate</IN.Button>
        <IN.Button variant="ghost" size="sm" icon="delete" disabled={isSystem} onClick={onRemove} style={{ marginLeft: 'auto', color: isSystem ? undefined : 'var(--color-status-error-text)' }}>Remove</IN.Button>
      </div>
    </aside>
  );
}

/* ── Add-widget palette ── */
function AddPalette({ onAdd, onAi, onBuild, onClose }) {
  const types = window.SCN.types;
  const cats = ['Provided', 'Your widgets'];
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div style={{ position: 'relative', margin: 'auto', width: 600, maxHeight: '82%', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ flex: 1, font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>Add a widget</span>
          <IN.IconButton icon="close" label="Close" variant="ghost" onClick={onClose} />
        </div>
        <div style={{ overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* headline paths: generate or build a custom widget */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <button type="button" onClick={onAi}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', border: '1px solid var(--color-accent-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: 'var(--color-accent-foreground)', flex: '0 0 auto' }}><IN.Icon name="sparkle" size="md" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>Generate with AI</div>
                <div style={{ font: 'var(--text-xs)/1.4 var(--font-sans)', color: 'var(--color-text-secondary)' }}>Describe it — AI builds it.</div>
              </div>
            </button>
            <button type="button" onClick={onBuild}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-border)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-strong)'; }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', flex: '0 0 auto' }}><IN.Icon name="Code2" size="md" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>Build custom</div>
                <div style={{ font: 'var(--text-xs)/1.4 var(--font-sans)', color: 'var(--color-text-secondary)' }}>Compose, code, bind data.</div>
              </div>
            </button>
          </div>

          {cats.map((cat) => {
            const items = Object.entries(types).filter(([, m]) => m.cat === cat);
            return (
              <div key={cat}>
                <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>{cat === 'Provided' ? 'Provided widgets' : 'Your widgets'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                  {items.map(([id, m]) => (
                    <button key={id} type="button" onClick={() => onAdd(id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-border)'; e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-surface-alt)'; }}>
                      <IN.Icon name={m.icon} size="md" color="var(--color-accent)" />
                      <span style={{ flex: 1, font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── AI generate dialog: prompt → preview → place ── */
function AiDialog({ onPlace, onClose }) {
  const [prompt, setPrompt] = React.useState('');
  const [state, setState] = React.useState('input'); // input | loading | result
  const [result, setResult] = React.useState(null);

  const run = (text) => {
    const q = (text != null ? text : prompt).trim();
    if (!q) return;
    setPrompt(q); setState('loading');
    setTimeout(() => { setResult(window.SCN.aiGenerate(q)); setState('result'); }, 850);
  };

  const previewWidget = result && { id: 'preview', type: 'ai', title: result.title, tier: 'ai', vis: 'dm', x: 0, y: 0, w: result.w, h: result.h, props: { accent: true, spec: result.spec } };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
      <div style={{ position: 'relative', margin: 'auto', width: 560, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: 'var(--color-accent-foreground)' }}><IN.Icon name="sparkle" size="sm" /></span>
          <span style={{ flex: 1, font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>Generate a widget</span>
          <IN.IconButton icon="close" label="Close" variant="ghost" onClick={onClose} />
        </div>

        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <IN.Field label="Describe the widget you want">
            <IN.Textarea value={prompt} rows={2} placeholder="e.g. a clock counting down to low tide" onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }} />
          </IN.Field>
          {state === 'input' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {window.SCN.aiExamples.map((ex) => <IN.Chip key={ex} tone="neutral" onClick={() => run(ex)} style={{ cursor: 'pointer' }}>{ex}</IN.Chip>)}
            </div>
          )}

          {state === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-5)', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
              <IN.Icon name="loading" size="md" color="var(--color-accent)" style={{ animation: 'scn-spin 1s linear infinite' }} />
              <span style={{ font: 'var(--text-sm) var(--font-sans)' }}>Generating "{prompt}"…</span>
            </div>
          )}

          {state === 'result' && previewWidget && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Preview</span>
              <div style={{ height: previewWidget.h, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)', display: 'flex' }}>
                <div style={{ width: previewWidget.w, maxWidth: '100%' }}><window.SceneWidget w={previewWidget} /></div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
          {state === 'result' ? (
            <React.Fragment>
              <IN.Button variant="ghost" size="sm" icon="retry" onClick={() => run()}>Regenerate</IN.Button>
              <IN.Button variant="primary" size="sm" icon="check" style={{ marginLeft: 'auto' }} onClick={() => onPlace(result)}>Place on scene</IN.Button>
            </React.Fragment>
          ) : (
            <IN.Button variant="primary" size="sm" icon="sparkle" style={{ marginLeft: 'auto' }} disabled={state === 'loading' || !prompt.trim()} onClick={() => run()}>Generate</IN.Button>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SceneInspector, AddPalette, AiDialog });
