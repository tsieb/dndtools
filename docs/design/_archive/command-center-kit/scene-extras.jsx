// scene-extras.jsx — the interactions that make the editor implementation-complete: right-click
// context menu, scene settings menu, custom-widget code drawer, player-view banner, and the
// multi-select alignment bar. Exposes them on window.
const EX = window.DNDToolsDesignSystem_8ae046;

/* ── right-click context menu on a widget ── */
function ContextMenu({ menu, isSystem, onAct, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, []);
  const Item = ({ icon, label, act, danger, disabled, kbd }) => (
    <button type="button" disabled={disabled} onClick={() => { onAct(act); onClose(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', padding: '7px 10px', border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: disabled ? 0.4 : 1, color: danger ? 'var(--color-status-error-text)' : 'var(--color-text-primary)', font: '500 var(--text-sm) var(--font-sans)' }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--color-interactive-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      <EX.Icon name={icon} size="sm" color={danger ? 'var(--color-status-error-text)' : 'var(--color-text-secondary)'} />
      <span style={{ flex: 1 }}>{label}</span>
      {kbd && <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{kbd}</span>}
    </button>
  );
  const x = Math.min(menu.x, window.innerWidth - 210), y = Math.min(menu.y, window.innerHeight - 320);
  return (
    <div ref={ref} style={{ position: 'fixed', left: x, top: y, zIndex: 90, width: 196, padding: 6, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-strong)', boxShadow: 'var(--shadow-lg)' }}>
      <Item icon="edit" label="Edit widget" act="edit" />
      <Item icon="chevron-up" label="Bring to front" act="front" />
      <Item icon="chevron-down" label="Send to back" act="back" />
      <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 6px' }} />
      <Item icon="visibility-mixed" label="Toggle visibility" act="vis" />
      <Item icon="Code2" label="Open code" act="code" disabled={isSystem} />
      <Item icon="duplicate" label="Duplicate" act="duplicate" disabled={isSystem} />
      <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 6px' }} />
      <Item icon="delete" label="Remove" act="remove" danger disabled={isSystem} />
    </div>
  );
}

/* ── scene settings popover ── */
function SceneMenu({ scene, onPatch, onDuplicate, onDelete, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, []);
  const Seg = ({ value, onChange, options }) => (
    <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
      {options.map((o) => {
        const on = o.value === value;
        return <button key={o.value} type="button" onClick={() => onChange(o.value)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 8px', border: 'none', borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)', font: (on ? 600 : 500) + ' var(--text-xs) var(--font-sans)', cursor: 'pointer' }}>{o.icon && <EX.Icon name={o.icon} size={13} />}{o.label}</button>;
      })}
    </div>
  );
  return (
    <div ref={ref} style={{ position: 'absolute', top: 52, left: 56, zIndex: 70, width: 340, padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-strong)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1, font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>Scene settings</span>
        <EX.IconButton icon="close" label="Close" variant="ghost" size="sm" onClick={onClose} />
      </div>
      <EX.Field label="Name"><EX.Input value={scene.name} disabled={scene.pinned} onChange={(e) => onPatch({ name: e.target.value })} /></EX.Field>
      {scene.pinned && <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: -6 }}>The Command Center is pinned — it can\u2019t be renamed or deleted.</span>}
      <EX.Field label="Default widget visibility"><Seg value={scene.defaultVis || 'dm'} onChange={(v) => onPatch({ defaultVis: v })} options={[{ value: 'dm', label: 'DM only', icon: 'dm-only' }, { value: 'players', label: 'Players', icon: 'visibility-players' }]} /></EX.Field>
      <EX.Field label="Overflow"><Seg value={scene.policy} onChange={(v) => !scene.pinned && onPatch({ policy: v, sub: v === 'bounded' ? 'Fits to screen' : 'Canvas · pan & zoom' })} options={[{ value: 'bounded', label: 'Fits to screen', icon: 'zoom-fit' }, { value: 'canvas', label: 'Pan & zoom', icon: 'globe' }]} /></EX.Field>
      {scene.pinned && <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: -6 }}>Home stays bounded for glanceability; switch on pan & zoom from the toolbar when you need it.</span>}
      <div style={{ display: 'flex', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
        <EX.Button variant="secondary" size="sm" icon="duplicate" onClick={onDuplicate}>Duplicate scene</EX.Button>
        <EX.Button variant="ghost" size="sm" icon="delete" disabled={scene.pinned} onClick={onDelete} style={{ marginLeft: 'auto', color: scene.pinned ? undefined : 'var(--color-status-error-text)' }}>Delete</EX.Button>
      </div>
    </div>
  );
}

/* ── custom / AI widget code drawer ── */
const CODE_SAMPLE = (w) => ({
  html: '<main class="widget" data-root>\n  <h1>{{ title }}</h1>\n  <div data-bind="campaign.party">\n    <!-- rendered per party member -->\n  </div>\n  <button data-action="roll">Roll</button>\n</main>',
  css: '.widget { padding: 12px; display: grid; gap: 8px;\n  color: var(--color-text-primary);\n  font: 14px var(--font-sans); }\n.widget h1 { font: 700 16px var(--font-display); }\n.widget button { background: var(--color-accent); border: 0;\n  border-radius: 6px; padding: 8px 10px; }',
  js: 'import { campaign, dice, onData } from "host";\n\nexport function render(ctx) {\n  ctx.el.querySelector("[data-action=roll]")\n    .addEventListener("click", () => dice.roll("1d20"));\n  onData("campaign.party", (party) => ctx.update({ party }));\n}',
});
function CodeDrawer({ w, onClose }) {
  const [tab, setTab] = React.useState('html');
  const code = CODE_SAMPLE(w);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 55, height: 320, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border-strong)', boxShadow: '0 -12px 32px rgba(0,0,0,.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
        <EX.Icon name="Code2" size="sm" color="var(--color-accent)" />
        <span style={{ font: '700 var(--text-sm) var(--font-display)', color: 'var(--color-text-primary)' }}>{w.title} — code</span>
        <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>HTML · CSS · JS, sandboxed · <code style={{ font: 'var(--text-2xs) var(--font-mono)' }}>host</code> API + <code style={{ font: 'var(--text-2xs) var(--font-mono)' }}>{'{{ binding }}'}</code> resolve at runtime</span>
        <EX.Tabs value={tab} onChange={setTab} tabs={[{ id: 'html', label: 'HTML' }, { id: 'css', label: 'CSS' }, { id: 'js', label: 'JS' }]} style={{ marginLeft: 'auto' }} />
        <EX.IconButton icon="close" label="Close code" variant="ghost" size="sm" onClick={onClose} />
      </div>
      <textarea spellCheck={false} value={code[tab]} onChange={() => {}}
        style={{ flex: 1, width: '100%', boxSizing: 'border-box', resize: 'none', padding: 'var(--space-4)', border: 'none', background: 'var(--color-surface-sunken)', color: 'var(--color-text-secondary)', font: 'var(--text-xs)/1.7 var(--font-mono)', whiteSpace: 'pre', outline: 'none' }} />
    </div>
  );
}

/* ── player-view (projection) banner ── */
function PlayerBanner({ hidden, onExit }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4)', background: 'var(--color-accent-subtle)', borderBottom: '1px solid var(--color-accent-border)' }}>
      <EX.Icon name="visibility-players" size="sm" color="var(--color-accent)" />
      <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Player view</span>
      <span style={{ flex: 1, font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>Exactly what players see when this scene is projected. {hidden} DM-only widget{hidden === 1 ? '' : 's'} hidden.</span>
      <EX.Button variant="secondary" size="sm" icon="dm-only" onClick={onExit}>Back to DM view</EX.Button>
    </div>
  );
}

/* ── alignment bar (2+ selected) ── */
function AlignBar({ count, onAlign }) {
  const Btn = ({ glyph, act, title }) => (
    <button type="button" title={title} onClick={() => onAlign(act)}
      style={{ width: 30, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', cursor: 'pointer', color: 'var(--color-text-secondary)', font: '700 var(--text-2xs) var(--font-mono)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-border)'; e.currentTarget.style.color = 'var(--color-accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}>{glyph}</button>
  );
  return (
    <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 42, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-strong)', boxShadow: 'var(--shadow-lg)' }}>
      <span style={{ font: '600 var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}>{count} selected</span>
      <span style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
      <Btn glyph="L" act="left" title="Align left" /><Btn glyph="C" act="cx" title="Center horizontally" /><Btn glyph="R" act="right" title="Align right" />
      <span style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
      <Btn glyph="T" act="top" title="Align top" /><Btn glyph="M" act="cy" title="Center vertically" /><Btn glyph="B" act="bottom" title="Align bottom" />
      <span style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
      <Btn glyph="↔" act="distx" title="Distribute horizontally" /><Btn glyph="↕" act="disty" title="Distribute vertically" />
    </div>
  );
}

Object.assign(window, { ContextMenu, SceneMenu, CodeDrawer, PlayerBanner, AlignBar });
