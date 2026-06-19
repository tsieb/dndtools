// Inspector — the right-docked editor for the selected widget, plus the Add-widget palette.
// The inspector is deliberately TIERED: a 'core' widget exposes only layout + visibility (its
// content is system-managed and shown locked); 'tool'/'custom' widgets expose full type settings,
// appearance and lifecycle (duplicate/remove).
const IX = window.DNDToolsDesignSystem_8ae046;

const TIER = {
  core:   { label: 'Core', status: 'neutral', note: 'A system widget. Its content updates automatically — you can place it and set who sees it, but not edit what it shows.' },
  tool:   { label: 'Template', status: 'accent', note: '' },
  custom: { label: 'Custom', status: 'info', note: '' },
};
const SIZES = [
  { id: 'S', w: 240, h: 160 },
  { id: 'M', w: 320, h: 240 },
  { id: 'L', w: 560, h: 320 },
];

function Section({ label, children, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-4) 0', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 'var(--space-1-5) var(--space-2)', border: 'none', borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)', font: `${on ? 600 : 500} var(--text-xs) var(--font-sans)`, cursor: 'pointer' }}>
            {o.icon && <IX.Icon name={o.icon} size={13} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---- type-specific settings (customizable widgets only) ---- */
function DiceSettings({ w, onProp }) {
  const [draft, setDraft] = React.useState('');
  const presets = w.props.presets || [];
  const add = () => { const v = draft.trim(); if (v && !presets.includes(v)) onProp('presets', [...presets, v]); setDraft(''); };
  return (
    <React.Fragment>
      <IX.Field label="Dice presets">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {presets.map((p) => <IX.Chip key={p} tone="accent" onRemove={() => onProp('presets', presets.filter((x) => x !== p))}>{p}</IX.Chip>)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <IX.Input value={draft} placeholder="e.g. 1d12+4" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} style={{ flex: 1 }} />
          <IX.Button variant="secondary" size="sm" icon="add" onClick={add}>Add</IX.Button>
        </div>
      </IX.Field>
      <IX.Switch checked={!!w.props.advantage} onChange={(v) => onProp('advantage', v)} label="Roll with advantage" />
      <IX.Switch checked={!!w.props.history} onChange={(v) => onProp('history', v)} label="Show roll history" />
    </React.Fragment>
  );
}

function InitiativeSettings({ w, onProp }) {
  return (
    <React.Fragment>
      <IX.Switch checked={!!w.props.autoAdvance} onChange={(v) => onProp('autoAdvance', v)} label="Auto-advance turns" />
      <IX.Switch checked={!!w.props.showHpToPlayers} onChange={(v) => onProp('showHpToPlayers', v)} label="Show enemy HP to players" />
    </React.Fragment>
  );
}

function TimerSettings({ w, onProp }) {
  return (
    <IX.Field label="Minutes">
      <IX.Select value={String(w.props.minutes)} onChange={(e) => onProp('minutes', Number(e.target.value))} options={['1', '3', '5', '10', '15', '30'].map((v) => ({ value: v, label: v + ' min' }))} />
    </IX.Field>
  );
}

function AudioSettings({ w, onProp }) {
  return (
    <React.Fragment>
      <IX.Field label="Track"><IX.Input value={w.props.track} onChange={(e) => onProp('track', e.target.value)} /></IX.Field>
      <IX.Switch checked={!!w.props.loop} onChange={(v) => onProp('loop', v)} label="Loop" />
    </React.Fragment>
  );
}

function NoteSettings({ w, onProp }) {
  return (
    <React.Fragment>
      <IX.Field label="Text"><IX.Textarea value={w.props.text} rows={4} onChange={(e) => onProp('text', e.target.value)} /></IX.Field>
      <IX.Field label="Text size">
        <Seg value={w.props.size || 'md'} onChange={(v) => onProp('size', v)} options={[{ value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }]} />
      </IX.Field>
    </React.Fragment>
  );
}

function ConditionsSettings({ w, onProp }) {
  const [draft, setDraft] = React.useState('');
  const items = w.props.items || [];
  const add = () => { const v = draft.trim(); if (v && !items.includes(v)) onProp('items', [...items, v]); setDraft(''); };
  return (
    <IX.Field label="Reference chips">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {items.map((p) => <IX.Chip key={p} tone="neutral" onRemove={() => onProp('items', items.filter((x) => x !== p))}>{p}</IX.Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <IX.Input value={draft} placeholder="Add a topic" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} style={{ flex: 1 }} />
        <IX.Button variant="secondary" size="sm" icon="add" onClick={add}>Add</IX.Button>
      </div>
    </IX.Field>
  );
}

function ImageSettings({ w, onProp }) {
  return <IX.Field label="Caption"><IX.Input value={w.props.caption} onChange={(e) => onProp('caption', e.target.value)} /></IX.Field>;
}

const SETTINGS = { dice: DiceSettings, initiative: InitiativeSettings, timer: TimerSettings, audio: AudioSettings, note: NoteSettings, conditions: ConditionsSettings, image: ImageSettings };

function Inspector({ w, onChange, onProp, onRemove, onDuplicate, onClose }) {
  const meta = window.DNDEdit.types[w.type];
  const tier = TIER[meta.tier];
  const customizable = meta.tier !== 'core';
  const Settings = SETTINGS[w.type];
  const activeSize = SIZES.find((s) => s.w === w.w && s.h === w.h);

  return (
    <aside style={{ width: 320, flex: '0 0 auto', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', flex: '0 0 auto' }}><IX.Icon name={meta.icon} size="md" /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>{meta.label}</div>
          <IX.Badge status={tier.status}>{tier.label}</IX.Badge>
        </div>
        <IX.IconButton icon="close" label="Close inspector" variant="ghost" onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-4)' }}>
        <Section label="Name">
          <IX.Input value={w.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Section>

        <Section label="Visibility">
          <Seg value={w.vis} onChange={(v) => onChange({ vis: v })}
            options={[{ value: 'dm', label: 'DM only', icon: 'dm-only' }, { value: 'shared', label: 'Players', icon: 'visibility-players' }]} />
        </Section>

        <Section label="Size">
          <div style={{ display: 'flex', gap: 6 }}>
            {SIZES.map((s) => {
              const on = activeSize && activeSize.id === s.id;
              return <IX.Chip key={s.id} tone={on ? 'accent' : 'neutral'} onClick={() => onChange({ w: s.w, h: s.h })} style={{ cursor: 'pointer', flex: 1, justifyContent: 'center' }}>{s.id}</IX.Chip>;
            })}
          </div>
          <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{w.w} × {w.h} px</div>
        </Section>

        {customizable && (
          <Section label="Appearance">
            <IX.Switch checked={!!w.props.accent} onChange={(v) => onProp('accent', v)} label="Emphasize (accent panel)" />
          </Section>
        )}

        {customizable && Settings ? (
          <Section label="Settings"><Settings w={w} onProp={onProp} /></Section>
        ) : (
          <Section label="Content">
            <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
              <IX.Icon name="lock" size="sm" color="var(--color-text-tertiary)" />
              <span style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{tier.note}</span>
            </div>
          </Section>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
        <IX.Button variant="secondary" size="sm" icon="Copy" disabled={!customizable} onClick={onDuplicate}>Duplicate</IX.Button>
        <IX.Button variant="ghost" size="sm" icon="close" disabled={!customizable} onClick={onRemove} style={{ marginLeft: 'auto', color: customizable ? 'var(--color-status-error-text)' : undefined }}>Remove</IX.Button>
      </div>
    </aside>
  );
}

/* ---- Add-widget palette ---- */
function AddWidgetPalette({ onAdd, onClose }) {
  const types = window.DNDEdit.types;
  const cats = ['Tools', 'Reference', 'Custom', 'Core'];
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} />
      <div style={{ position: 'relative', margin: 'auto', width: 560, maxHeight: '80%', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ flex: 1, font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>Add a widget</div>
          <IX.IconButton icon="close" label="Close" variant="ghost" onClick={onClose} />
        </div>
        <div style={{ overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {cats.map((cat) => {
            const items = Object.entries(types).filter(([, m]) => m.cat === cat);
            if (!items.length) return null;
            return (
              <div key={cat}>
                <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>{cat}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                  {items.map(([id, m]) => (
                    <button key={id} type="button" onClick={() => onAdd(id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-border)'; e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-surface-alt)'; }}>
                      <span style={{ display: 'inline-flex', color: 'var(--color-accent)', flex: '0 0 auto' }}><IX.Icon name={m.icon} size="md" /></span>
                      <span style={{ flex: 1, font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{m.label}</span>
                      {m.tier === 'core' && <IX.Icon name="lock" size="sm" color="var(--color-text-tertiary)" />}
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

Object.assign(window, { Inspector, AddWidgetPalette });
