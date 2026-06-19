// Shared chrome for the authoring & management pages. PageShell = a focused full-screen page (back
// + icon + eyebrow/title + actions, scrolling body). Panel = a titled card. Seg = a small segmented
// control. These keep all eight surfaces visually consistent with the rest of the app.
const PC = window.DNDToolsDesignSystem_8ae046;

function PageShell({ icon, eyebrow, title, sub, actions, children, bg }) {
  // Build a clickable breadcrumb trail from the shared nav map (falls back to the eyebrow).
  const m = (window.DNDPageMeta && window.DNDPageMeta()) || null;
  const trail = m ? m.trail : (eyebrow ? [['Command Center', 'home'], [eyebrow]] : []);
  const goBack = () => { if (window.DNDBack) window.DNDBack(); };
  const goTo = (id) => { if (id && window.DNDNavigate) window.DNDNavigate(id); };
  return (
    <div data-theme="tavern" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', backgroundImage: 'radial-gradient(1200px 620px at 50% -280px, var(--color-accent-subtle), transparent 70%)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)', position: 'sticky', top: 0, zIndex: 10, flex: '0 0 auto' }}>
        <PC.IconButton icon="ChevronLeft" label="Back" variant="ghost" onClick={goBack} />
        {/* brand mark — anchors the focused tool back to the app */}
        <button type="button" onClick={() => goTo('home')} aria-label="Command Center"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: 'var(--space-1) var(--space-2)', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--color-accent)', color: 'var(--color-accent-foreground)', boxShadow: 'var(--shadow-sm)' }}><PC.Icon name="dice" size="sm" /></span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '.03em', color: 'var(--color-text-primary)' }}>DND<span style={{ color: 'var(--color-accent)' }}>Tools</span></span>
        </button>
        <span style={{ width: 1, height: 24, background: 'var(--color-border)', flex: '0 0 auto' }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', flex: '0 0 auto' }}><PC.Icon name={icon} size="md" /></span>
        <div style={{ minWidth: 0 }}>
          {trail.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {trail.map((c, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <PC.Icon name="chevron-right" size={12} color="var(--color-text-tertiary)" />}
                  {c[1] ? (
                    <button type="button" onClick={() => goTo(c[1])}
                      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}>{c[0]}</button>
                  ) : (
                    <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>{c[0]}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
          <div style={{ font: '700 var(--text-xl) var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1.1 }}>{title}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>{actions}</div>
      </header>
      <main style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: bg || 'transparent' }}>{children}</main>
    </div>
  );
}

function Panel({ title, action, children, style, pad = 'lg', flat }) {
  const p = { sm: 'var(--space-3)', md: 'var(--space-4)', lg: 'var(--space-5)' }[pad];
  return (
    <section style={{ display: 'flex', flexDirection: 'column', background: flat ? 'transparent' : 'var(--color-surface-raised)', border: flat ? 'none' : '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: p, gap: 'var(--space-3)', ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <span style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>{title}</span>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Eyebrow({ children, style }) {
  return <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', ...style }}>{children}</div>;
}

function Seg({ options, value, onChange, size }) {
  const py = size === 'sm' ? 'var(--space-1)' : 'var(--space-1-5)';
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange && onChange(o.value)}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: `${py} var(--space-3)`, border: 'none', borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)', font: `${on ? 600 : 500} var(--text-xs) var(--font-sans)`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {o.icon && <PC.Icon name={o.icon} size={13} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

// Visibility pill used across surfaces (DM only / Player visible / Shared).
function Vis({ level }) {
  const map = { 'dm-only': { s: 'neutral', i: 'dm-only', t: 'DM only' }, 'player-visible': { s: 'success', i: 'visibility-players', t: 'Player visible' }, shared: { s: 'info', i: 'visibility-shared', t: 'Shared' } };
  const v = map[level] || map['dm-only'];
  return <PC.Badge status={v.s} icon={v.i}>{v.t}</PC.Badge>;
}

Object.assign(window, { PageShell, Panel, Eyebrow, Seg, Vis });
