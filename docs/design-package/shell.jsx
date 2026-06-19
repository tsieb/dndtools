// AppShell — sidebar nav + calm top bar + content area. Exports to window for the other scripts.
const { Icon, IconButton, Avatar, StatusDot, Badge } = window.DNDToolsDesignSystem_8ae046;

function Sidebar({ active, onNav }) {
  return (
    <nav style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', background: 'var(--color-surface-raised)', borderRight: '1px solid var(--color-border)', padding: 'var(--space-3) 0', width: "180px" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 var(--space-4) var(--space-4)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: 'var(--color-accent-foreground)', boxShadow: 'var(--shadow-sm)' }}>
          <Icon name="dice" size="sm" />
        </span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '.03em', color: 'var(--color-text-primary)' }}>DND<span style={{ color: 'var(--color-accent)' }}>Tools</span></span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: '0 var(--space-2)', display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {window.DNDNav.map((item) => {
          const on = item.id === active;
          return (
            <li key={item.id}>
              <button type="button" onClick={() => onNav(item.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', padding: 'var(--space-2) var(--space-3)', border: 'none', borderLeft: `3px solid ${on ? 'var(--color-accent)' : 'transparent'}`, borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', font: `${on ? 600 : 500} var(--text-base) var(--font-sans)`, cursor: 'pointer', textAlign: 'left', transition: 'background var(--duration-fast) var(--easing-standard)' }}
              onMouseEnter={(e) => {if (!on) e.currentTarget.style.background = 'var(--color-interactive-hover)';}}
              onMouseLeave={(e) => {if (!on) e.currentTarget.style.background = 'transparent';}}>
                <Icon name={item.icon} size="sm" />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.id === 'session' && <StatusDot status="live" pulse />}
              </button>
            </li>);

        })}
      </ul>
      <div style={{ padding: '0 var(--space-2)', marginTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
        <button type="button" onClick={() => onNav('settings')}
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', padding: 'var(--space-2) var(--space-3)', border: 'none', borderLeft: '3px solid transparent', borderRadius: 'var(--radius-sm)', background: active === 'settings' ? 'var(--color-accent-subtle)' : 'transparent', color: 'var(--color-text-secondary)', font: '500 var(--text-base) var(--font-sans)', cursor: 'pointer', textAlign: 'left' }}>
          <Icon name="settings-gear" size="sm" /><span>Settings</span>
        </button>
      </div>
    </nav>);

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
    </header>);

}

function AppShell({ active, onNav, title, queued, children }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)', backgroundImage: 'radial-gradient(1200px 620px at 50% -240px, var(--color-accent-subtle), transparent 70%)' }}>
      <Sidebar active={active} onNav={onNav} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar title={title} queued={queued} onCommand={() => {}} />
        <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }}>{children}</main>
      </div>
    </div>);

}

Object.assign(window, { AppShell });