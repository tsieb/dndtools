// System packages (Settings · Extensions & systems) — the system-agnostic front door in-app.
// The platform runs ANY tabletop game; the rules — stats, resources, conditions, dice — come from
// a swappable System Package. D&D 5e is the built-in reference package, not a hardwired assumption.
// Reuses the real swappable-system data (window.DNDExt.campaignSystem: modules + migration dry-run).
const SP = window.DNDToolsDesignSystem_8ae046;

// Per-package vocabulary (what each declares) + sigil. Kept local to this surface.
const SP_META = {
  dnd5e:   { sigil: 'Swords',  tier: 'Built-in · reference', chips: ['STR–CHA', 'HP · slots', '15 conditions', 'd20'],
             declares: [['Hexagon', 'Attributes', 'STR · DEX · CON · INT · WIS · CHA'], ['HeartPulse', 'Resources', 'HP · Hit Dice · Spell slots'], ['TriangleAlert', 'Conditions', '15 conditions'], ['Dices', 'Dice & rolls', 'd20 + mods · advantage'], ['ListOrdered', 'Turn order', 'Initiative · action · bonus · reaction'], ['Users', 'Roles', 'Dungeon Master · Players']] },
  generic: { sigil: 'Feather',  tier: 'Built-in', chips: ['Freeform', 'Custom tags', 'Any dice'],
             declares: [['Hexagon', 'Attributes', 'None — freeform sheet'], ['HeartPulse', 'Resources', 'Harm track · custom pools'], ['TriangleAlert', 'Conditions', 'Custom tags you define'], ['Dices', 'Dice & rolls', 'GM-defined — any die or pool'], ['ListOrdered', 'Turn order', 'No fixed order — spotlight'], ['Users', 'Roles', 'Game Master · Players']] },
  pf2e:    { sigil: 'Shield',   tier: 'Community package', chips: ['STR–CHA', 'Focus pts', '3 actions'],
             declares: [['Hexagon', 'Attributes', 'STR · DEX · CON · INT · WIS · CHA'], ['HeartPulse', 'Resources', 'HP · Focus · Hero points'], ['TriangleAlert', 'Conditions', 'PF2e conditions (with values)'], ['Dices', 'Dice & rolls', 'd20 + level · degrees of success'], ['ListOrdered', 'Turn order', 'Three-action economy · reaction'], ['Users', 'Roles', 'Game Master · Players']] },
};

const FX = {
  keep:    { tone: 'success', icon: 'success',  label: 'kept' },
  flatten: { tone: 'warning', icon: 'warning',  label: 'flattened' },
  drop:    { tone: 'error',   icon: 'error',     label: 'dropped' },
};

function SystemPackages() {
  const { Button, Badge, Icon } = SP;
  const data = window.DNDExt.campaignSystem;
  const [sel, setSel] = React.useState(data.active);
  const activeId = data.active;
  const selMod = data.modules.find((m) => m.id === sel) || data.modules[0];
  const selMeta = SP_META[sel] || SP_META.dnd5e;
  const switching = sel !== activeId;

  const card = (m) => {
    const meta = SP_META[m.id] || {};
    const on = m.id === sel;
    const isActive = m.id === activeId;
    return (
      <button key={m.id} type="button" onClick={() => setSel(m.id)}
        style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'var(--color-text-primary)',
          background: on ? 'var(--color-surface-raised)' : 'var(--color-surface-sunken)',
          border: '1px solid ' + (on ? 'var(--color-accent)' : 'var(--color-border)'),
          boxShadow: on ? 'inset 0 0 0 1px var(--color-accent), var(--shadow-md)' : 'none',
          borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column',
          gap: 'var(--space-3)', transition: 'border-color .2s, box-shadow .2s, background .2s' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-base)', border: '1px solid var(--color-border)', color: 'var(--color-accent)', flex: 'none' }}>
            <Icon name={meta.sigil || 'Boxes'} size="sm" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ font: '700 var(--text-lg) var(--font-display)', lineHeight: 1.15 }}>{m.name}</span>
              {isActive && <span title="Active system" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-status-success)' }} />}
            </div>
            <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginTop: 3 }}>{meta.tier || m.from}</div>
          </div>
          {on && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'var(--color-accent)', color: 'var(--color-accent-ink)', flex: 'none' }}><Icon name="Check" size={14} /></span>}
        </div>
        <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{m.desc}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(meta.chips || []).map((c) => <span key={c} style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', background: 'var(--color-surface-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '3px 9px' }}>{c}</span>)}
        </div>
      </button>
    );
  };

  return (
    <window.PageShell icon="Boxes" eyebrow="Extensions & systems" title="System packages"
      sub="The platform is system-agnostic — the rules of your game come from a swappable package.">
      <div style={{ maxWidth: 880, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

        <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.55, marginTop: '-8px' }}>
          Stats, resources, conditions and dice come from a <b style={{ color: 'var(--color-text-primary)' }}>System Package</b>. D&amp;D 5e is the built-in reference; pick another, or build your own. The same widgets render against whichever you choose.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 'var(--space-3)' }}>
          {data.modules.map(card)}
          <button type="button" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'var(--color-text-primary)', background: 'transparent', border: '1px dashed var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 'var(--radius-sm)', border: '1px dashed var(--color-border-strong)', color: 'var(--color-accent)', flex: 'none' }}><Icon name="Plus" size="sm" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '700 var(--text-lg) var(--font-display)', lineHeight: 1.15 }}>Build your own</div>
                <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginTop: 3 }}>Custom · from scratch</div>
              </div>
            </div>
            <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>Define stats, resources, conditions and dice yourself — or fork any package above and tweak it.</div>
          </button>
        </div>

        {/* What the selected package declares */}
        <window.Panel title={'What ' + selMod.name + ' declares'} pad="md">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 'var(--space-3) var(--space-5)' }}>
            {selMeta.declares.map(([icon, k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <span style={{ color: 'var(--color-accent)', flex: 'none', marginTop: 1 }}><Icon name={icon} size="sm" /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{k}</div>
                  <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', marginTop: 2, lineHeight: 1.4 }}>{v}</div>
                </div>
              </div>
            ))}
          </div>
        </window.Panel>

        {/* Active vs switch */}
        {!switching && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Badge status="success" icon="success">Active system</Badge>
            <span style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>This is the system your campaign is currently running.</span>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" icon="edit">Fork &amp; customize</Button>
          </div>
        )}

        {switching && (
          <window.Panel title="Migration dry-run" action={<Badge status="warning" icon="warning">preview — nothing changed yet</Badge>} pad="md" style={{ borderColor: 'var(--color-status-warning)' }}>
            <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: -4, marginBottom: 'var(--space-2)' }}>
              Switching from <b style={{ color: 'var(--color-text-primary)' }}>D&amp;D 5e</b> to <b style={{ color: 'var(--color-text-primary)' }}>{selMod.name}</b> is non-destructive — preview what maps before anything changes.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--color-border)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              {data.migration.rows.map((r) => {
                const e = FX[r.effect];
                return (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'var(--color-surface-raised)', padding: 'var(--space-2) var(--space-3)' }}>
                    <span style={{ font: '600 var(--text-sm) var(--font-sans)', minWidth: 120 }}>{r.label}</span>
                    <span style={{ font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-tertiary)', minWidth: 36 }}>{r.count}</span>
                    <span style={{ flex: 1, font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{r.note}</span>
                    <Badge status={e.tone} icon={e.icon}>{e.label}</Badge>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <Button variant="primary" icon="retry">Switch system &amp; preview</Button>
              <Button variant="ghost" onClick={() => setSel(activeId)}>Cancel</Button>
            </div>
          </window.Panel>
        )}

      </div>
    </window.PageShell>
  );
}

window.SystemPackages = SystemPackages;
