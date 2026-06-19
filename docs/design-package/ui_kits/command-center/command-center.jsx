// CommandCenter — the navigational hub. A locked-down "home" scene that launches into game
// scenes and authoring tools. Combat/initiative/dice/HP trackers live INSIDE a game scene
// (see SessionCombat), never here. Exports to window.
const CC = window.DNDToolsDesignSystem_8ae046;

function SectionLabel({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
      <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{children}</span>
      {action}
    </div>
  );
}

/* The single primary: resume the live scene. This is a launcher into the game scene where the
   combat/initiative/roll trackers live — the hub itself never embeds them. */
function ResumeHero({ onEnter, onEdit }) {
  const d = window.DNDData;
  const live = window.DNDHub.scenes.find((s) => s.status === 'live');
  return (
    <CC.Card accent elevation="raised" padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
          <CC.StatusDot status="live" pulse />
          <div style={{ minWidth: 0 }}>
            <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-accent)' }}>{d.campaign} · session live</div>
            <div style={{ font: '700 var(--text-2xl) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.1, marginTop: 2 }}>{live.name}</div>
            <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', marginTop: 4 }}>Combat, initiative & rolls run inside the scene · {live.players} players connected</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex' }}>
            {d.party.map((p, i) => (
              <span key={p.id} style={{ marginLeft: i ? -8 : 0, borderRadius: 'var(--radius-full)', boxShadow: '0 0 0 2px var(--color-surface-raised)' }}>
                <CC.Avatar name={p.name} size="sm" ring={p.conn === 'offline' ? 'danger' : 'active'} />
              </span>
            ))}
          </div>
          <CC.Button variant="ghost" size="lg" icon="LayoutDashboard" onClick={onEdit}>Edit layout</CC.Button>
          <CC.Button variant="primary" size="lg" iconRight="LogIn" onClick={onEnter}>Enter scene</CC.Button>
        </div>
      </div>
    </CC.Card>
  );
}

function SceneTile({ scene, onOpen }) {
  const isLive = scene.status === 'live';
  const badge = isLive
    ? <CC.Badge status="success" icon="visibility-players">Live</CC.Badge>
    : scene.status === 'ready'
      ? <CC.Badge status="info">Ready</CC.Badge>
      : <CC.Badge status="neutral">Draft</CC.Badge>;
  return (
    <CC.Card elevation="flat" interactive padding="none" onClick={onOpen}
      style={{ overflow: 'hidden', outline: isLive ? '1px solid var(--color-accent-border)' : 'none' }}>
      <div style={{ position: 'relative', height: 118, background: `linear-gradient(${scene.grad}deg, #2a2117, #14100b)` }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(224,176,111,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(224,176,111,.07) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div style={{ position: 'absolute', top: 10, right: 10 }}>{badge}</div>
        {scene.status === 'draft' && <div style={{ position: 'absolute', top: 10, left: 10, color: 'var(--color-text-tertiary)' }}><CC.Icon name="Lock" size="sm" label="Not yet published" /></div>}
      </div>
      <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
        <div style={{ font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{scene.name}</div>
        <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{scene.region}</div>
      </div>
    </CC.Card>
  );
}

function Scenes({ onOpen }) {
  return (
    <div>
      <SectionLabel action={<CC.Button variant="ghost" size="sm" icon="add" onClick={() => onOpen('session')}>New scene</CC.Button>}>Scenes</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 'var(--space-3)' }}>
        {window.DNDHub.scenes.map((s) => <SceneTile key={s.id} scene={s} onOpen={() => onOpen('session')} />)}
      </div>
    </div>
  );
}

function LauncherTile({ icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-2)', padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', cursor: 'pointer', textAlign: 'left', transition: 'border-color var(--duration-fast) var(--easing-standard), background var(--duration-fast) var(--easing-standard)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-border)'; e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-surface-alt)'; }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)' }}>
        <CC.Icon name={icon} size="md" />
      </span>
      <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{label}</span>
    </button>
  );
}

function Create({ onNav }) {
  const items = [
    { icon: 'LayoutDashboard', label: 'New scene', to: 'scene' },
    { icon: 'UserPlus', label: 'New character', to: 'character' },
    { icon: 'MapPlus', label: 'New map', to: 'map' },
    { icon: 'LayoutGrid', label: 'New widget', to: 'widget' },
    { icon: 'NotebookPen', label: 'New note', to: 'note' },
  ];
  return (
    <div>
      <SectionLabel>Create</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 'var(--space-3)' }}>
        {items.map((it) => <LauncherTile key={it.label} icon={it.icon} label={it.label} onClick={() => onNav(it.to)} />)}
      </div>
    </div>
  );
}

function Library({ onNav }) {
  return (
    <div>
      <SectionLabel>Library</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
        {window.DNDHub.library.map((l) => (
          <CC.Card key={l.id} elevation="flat" interactive padding="md" onClick={() => onNav(l.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}>
              <CC.Icon name={l.icon} size="md" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{l.label}</div>
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{l.count}</div>
            </div>
            <CC.Icon name="chevron-right" size="sm" color="var(--color-text-tertiary)" />
          </CC.Card>
        ))}
      </div>
    </div>
  );
}

function Manage({ onNav }) {
  return (
    <div>
      <SectionLabel>Manage</SectionLabel>
      <CC.Card elevation="flat" padding="sm" style={{ display: 'flex', flexDirection: 'column' }}>
        {window.DNDHub.manage.map((m, i) => (
          <button key={m.id} type="button" onClick={() => onNav(m.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', border: 'none', borderTop: i ? '1px solid var(--color-border)' : 'none', borderRadius: 'var(--radius-sm)', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background var(--duration-fast) var(--easing-standard)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-interactive-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            <CC.Icon name={m.icon} size="sm" color="var(--color-text-secondary)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{m.label}</div>
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{m.meta}</div>
            </div>
            {m.tone === 'success'
              ? <CC.StatusDot status="live" />
              : <CC.Icon name="chevron-right" size="sm" color="var(--color-text-tertiary)" />}
          </button>
        ))}
      </CC.Card>
    </div>
  );
}

function CommandCenter({ onNav }) {
  const nav = onNav || (() => {});
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 1180, margin: '0 auto' }}>
      <ResumeHero onEnter={() => nav('session')} onEdit={() => nav('edit')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 'var(--space-6)', alignItems: 'start' }}>
        <Scenes onOpen={nav} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Create onNav={nav} />
          <Manage onNav={nav} />
        </div>
      </div>
      <Library onNav={nav} />
    </div>
  );
}

Object.assign(window, { CommandCenter });
