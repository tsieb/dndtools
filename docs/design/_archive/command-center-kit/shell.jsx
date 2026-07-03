// AppShell — sidebar nav + calm top bar + content area. Exports to window for the other scripts.
const { Icon, IconButton, Avatar, StatusDot, Badge } = window.DNDToolsDesignSystem_8ae046;

function SideGroup({ label, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--space-3)', margin: 'var(--space-3) 0 var(--space-1)' }}>
      <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>{label}</span>
      {action}
    </div>
  );
}

// Generic nav row. `on` draws the active gold rail; `dim` mutes recents.
function NavRow({ icon, label, sub, on, dim, trailing, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', padding: 'var(--space-2) var(--space-3)', border: 'none', borderLeft: `3px solid ${on ? 'var(--color-accent)' : 'transparent'}`, borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-text-primary)' : dim ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)', font: `${on ? 600 : 500} var(--text-sm) var(--font-sans)`, cursor: 'pointer', textAlign: 'left', transition: 'background var(--duration-fast) var(--easing-standard)' }}
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--color-interactive-hover)'; }}
      onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
      <Icon name={icon} size="sm" />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {sub && <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', flex: '0 0 auto' }}>{sub}</span>}
      {trailing}
    </button>
  );
}

/* The Command Center is the primary navigation, so the rail doesn't mirror the sections. It is the
   DM's quick-switch surface: jump between scenes, reach pinned things, and back-track via recents. */
function Sidebar({ active, onNav }) {
  const hub = window.DNDHub;
  return (
    <nav style={{ width: 232, flex: '0 0 auto', display: 'flex', flexDirection: 'column', background: 'var(--color-surface-raised)', borderRight: '1px solid var(--color-border)', padding: 'var(--space-3) 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 var(--space-4) var(--space-3)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: 'var(--color-accent-foreground)', boxShadow: 'var(--shadow-sm)' }}>
          <Icon name="dice" size="sm" />
        </span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '.03em', color: 'var(--color-text-primary)' }}>DND<span style={{ color: 'var(--color-accent)' }}>Tools</span></span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-2)' }}>
        {/* The seven-section IA — always visible so every destination is one click away and the
           current section is highlighted on every page. */}
        <SideGroup label="Library" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {(window.DNDSections || []).map((s) => (
            <NavRow key={s.id} icon={s.icon} label={s.label} on={active === s.id} onClick={() => onNav(s.id)} />
          ))}
        </div>

        <SideGroup label="Scenes" action={
          <button type="button" onClick={() => onNav('session')} aria-label="New scene"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}>
            <Icon name="add" size="sm" />
          </button>} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {hub.scenes.map((s) => (
            <NavRow key={s.id} icon={s.status === 'draft' ? 'Lock' : 'atlas-map'} label={s.name}
              on={active === 'session' && s.status === 'live'} onClick={() => onNav('session')}
              trailing={s.status === 'live' ? <StatusDot status="live" pulse /> : null} />
          ))}
        </div>

        <SideGroup label="Pinned" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {hub.pinned.map((p) => (
            <NavRow key={p.id} icon={p.icon} label={p.label} sub={p.sub} onClick={() => onNav(p.to)} />
          ))}
        </div>

        <SideGroup label="Recent" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {hub.recent.map((r) => (
            <NavRow key={r.id} icon={r.icon} label={r.label} dim onClick={() => onNav(r.to)} />
          ))}
        </div>
      </div>

      <div style={{ padding: '0 var(--space-2)', marginTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
        <NavRow icon="settings-gear" label="Settings" on={active === 'settings'} onClick={() => onNav('settings')} />
      </div>
    </nav>
  );
}

function TopBar({ title, onCommand, queued }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-3) var(--space-6)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, letterSpacing: 'var(--tracking-tight)', color: 'var(--color-text-primary)' }}>{title}</h1>
      <button type="button" onClick={onCommand}
        style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 280, padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', color: 'var(--color-text-tertiary)', font: 'var(--text-sm) var(--font-sans)', cursor: 'pointer', textAlign: 'left' }}>
        <Icon name="search" size="sm" />
        <span style={{ flex: 1 }}>Search, go to, or run a command…</span>
        <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>⌘K</kbd>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <button type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 'var(--space-1-5) var(--space-3)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)', font: '500 var(--text-sm) var(--font-sans)', cursor: 'pointer' }}>
          <Icon name="dm-only" size="sm" />View as…
        </button>
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <IconButton icon="recent" label="Notifications" variant="ghost" />
          {queued > 0 && <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 'var(--radius-full)', background: 'var(--color-status-info)', color: '#001018', font: '700 10px/16px var(--font-mono)', textAlign: 'center' }}>{queued}</span>}
        </span>
        <IconButton icon="accessibility" label="Help & accessibility" variant="ghost" />
      </div>
    </header>
  );
}

function AppShell({ active, onNav, title, queued, children }) {
  // Pages may omit onNav; fall back to the shared cross-page navigator so the rail always works.
  const navigate = onNav || ((id) => window.DNDNavigate && window.DNDNavigate(id));
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)', backgroundImage: 'radial-gradient(1200px 620px at 50% -240px, var(--color-accent-subtle), transparent 70%)' }}>
      <Sidebar active={active} onNav={navigate} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar title={title} queued={queued} onCommand={() => {}} onNav={navigate} />
        <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }}>{children}</main>
      </div>
    </div>
  );
}

Object.assign(window, { AppShell });
