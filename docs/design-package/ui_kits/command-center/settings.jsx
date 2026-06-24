// Settings — the /settings global section. A category rail folds the former manage-vault and
// manage-permissions pages in as categories (Players & roles, Vault & storage, Sync, Sources, AI).
// Two layout variations toggle at top: "Rail" (categories + one detail panel) and "Single page"
// (one scroll with a sticky section nav). Exports Settings to window.
const SE = window.DNDToolsDesignSystem_8ae046;
const GS = () => window.DNDGaps;

const SECTIONS = [
  { id: 'preferences', label: 'Preferences', icon: 'SlidersHorizontal', group: 'You' },
  { id: 'account', label: 'Account', icon: 'characters-person', group: 'You' },
  { id: 'accessibility', label: 'Accessibility', icon: 'accessibility', group: 'You' },
  { id: 'players', label: 'Players & roles', icon: 'permissions', group: 'Table' },
  { id: 'vault', label: 'Vault & storage', icon: 'vault', group: 'Table' },
  { id: 'sync', label: 'Sync', icon: 'RefreshCw', group: 'Table' },
  { id: 'sources', label: 'Sources', icon: 'connection', group: 'Table' },
  { id: 'ai', label: 'AI / MCP', icon: 'Bot', group: 'Table' },
  { id: 'audio', label: 'Audio & atmosphere', icon: 'audio', group: 'Table' },
  { id: 'extensions', label: 'Extensions & systems', icon: 'Blocks', group: 'System' },
  { id: 'diagnostics', label: 'Diagnostics', icon: 'Activity', group: 'System' },
];

function Row({ title, sub, control, danger }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-3) 0', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: danger ? 'var(--color-status-error-text)' : 'var(--color-text-primary)' }}>{title}</div>
        {sub && <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flex: '0 0 auto' }}>{control}</div>
    </div>
  );
}

function Panel({ title, sub, children, id }) {
  return (
    <section id={id} style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', scrollMarginTop: 'var(--space-4)' }}>
      <div style={{ marginBottom: 'var(--space-2)' }}>
        <div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>{title}</div>
        {sub && <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </section>
  );
}

function ThemeSwatch({ name, on, bg, surf, accent, ink, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: `2px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', cursor: 'pointer' }}>
      <div style={{ height: 46, borderRadius: 'var(--radius-sm)', background: bg, border: `1px solid ${surf}`, position: 'relative', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', left: 8, top: 8, width: 34, height: 8, borderRadius: 4, background: surf }} />
        <span style={{ position: 'absolute', left: 8, bottom: 8, width: 22, height: 8, borderRadius: 4, background: accent }} />
        <span style={{ position: 'absolute', right: 8, top: 8, width: 14, height: 14, borderRadius: '50%', background: ink, opacity: .5 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{name}</span>
        {on && <CC2Check />}
      </div>
    </button>
  );
}
function CC2Check() { return <span style={{ marginLeft: 'auto', display: 'inline-flex', color: 'var(--color-accent)' }}><SE.Icon name="check" size="sm" /></span>; }

function PrefsPanel() {
  const [theme, setTheme] = React.useState('tavern');
  const [density, setDensity] = React.useState('standard');
  return (
    <Panel id="preferences" title="Preferences" sub="How the workspace looks and feels at your table.">
      <div style={{ padding: 'var(--space-3) 0' }}>
        <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)' }}>Theme</div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <ThemeSwatch name="Tavern" on={theme === 'tavern'} onClick={() => setTheme('tavern')} bg="#14100b" surf="#3a2e20" accent="#e0b06f" ink="#f2e8d8" />
          <ThemeSwatch name="Parchment" on={theme === 'parchment'} onClick={() => setTheme('parchment')} bg="#efe6d4" surf="#d8c9ad" accent="#9a6b2f" ink="#2c2418" />
          <ThemeSwatch name="High contrast" on={theme === 'high-contrast'} onClick={() => setTheme('high-contrast')} bg="#000000" surf="#444444" accent="#ffd479" ink="#ffffff" />
        </div>
      </div>
      <Row title="Density" sub="Comfortable is locked on touch devices for 44px targets." control={<SE.SegmentedControl value={density} onChange={setDensity} size="sm" options={[{ value: 'standard', label: 'Standard' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />} />
      <Row title="Reduce motion" sub="Collapse every transition to 0ms." control={<SE.Switch checked={false} onChange={() => {}} />} />
      <Row title="Language" control={<SE.Select options={['English', 'Español', 'Deutsch', 'Français']} style={{ width: 160 }} />} />
    </Panel>
  );
}

function AccountPanel() {
  return (
    <Panel id="account" title="Account" sub="Your DM identity across campaigns.">
      <Row title="Display name" control={<SE.Input defaultValue="The Dungeon Master" style={{ width: 220 }} />} />
      <Row title="Email" control={<span style={{ font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-secondary)' }}>dm@saltmarsh.table</span>} />
      <Row title="Sign out everywhere" sub="Ends every other active session." control={<SE.Button variant="secondary" icon="enter">Sign out</SE.Button>} />
    </Panel>
  );
}

function AccessibilityPanel() {
  const [scale, setScale] = React.useState(100);
  return (
    <Panel id="accessibility" title="Accessibility" sub="Meaning never rides on color alone — every status pairs an icon shape.">
      <Row title="High-contrast theme" sub="Switch the whole workspace to the a11y floor." control={<SE.Switch checked={false} onChange={() => {}} />} />
      <Row title="Reduce motion" control={<SE.Switch checked onChange={() => {}} />} />
      <Row title="Always show status labels" sub="Never imply visibility by color." control={<SE.Switch checked onChange={() => {}} />} />
      <div style={{ padding: 'var(--space-3) 0', borderTop: '1px solid var(--color-border)' }}>
        <SE.Slider label="Text size" min={85} max={130} step={5} value={scale} onChange={setScale} valueLabel={`${scale}%`} steppers />
      </div>
    </Panel>
  );
}

function PlayersPanel() {
  const toneMap = { accent: 'accent', info: 'info', neutral: 'neutral' };
  return (
    <Panel id="players" title="Players & roles" sub="Folded in from Permissions. Capability sets, not raw toggles.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
        {GS().roles.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)' }}>
            <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: 'var(--radius-md)', background: r.tone === 'accent' ? 'var(--color-accent-subtle)' : 'var(--color-surface-raised)', color: r.tone === 'accent' ? 'var(--color-accent)' : 'var(--color-text-secondary)', alignItems: 'center', justifyContent: 'center' }}><SE.Icon name={r.id === 'observer' ? 'dm-only' : 'permissions'} size="sm" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{r.name}</span><SE.Badge status={toneMap[r.tone]}>{r.count}</SE.Badge></div>
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{r.desc}</div>
            </div>
            <SE.IconButton icon="chevron-right" label="Edit role" variant="ghost" />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}><SE.Button variant="secondary" icon="add">Invite player</SE.Button></div>
    </Panel>
  );
}

const SYNC = {
  synced: { label: 'Synced', status: 'success', icon: 'success' }, syncing: { label: 'Syncing', status: 'info', icon: 'loading' },
  'needs-auth': { label: 'Needs auth', status: 'warning', icon: 'warning' }, error: { label: 'Error', status: 'error', icon: 'error' },
};
function SourceRow({ s }) {
  const st = SYNC[s.state];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
      <SE.Icon name="connection" size="sm" color="var(--color-text-tertiary)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{s.name}</div>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{s.kind} · {s.last}</div>
      </div>
      {s.pending > 0 && <SE.Chip tone="info">{s.pending} queued</SE.Chip>}
      <SE.Badge status={st.status} icon={st.icon}>{st.label}</SE.Badge>
    </div>
  );
}

function VaultPanel() {
  return (
    <Panel id="vault" title="Vault & storage" sub="Folded in from Manage vault. Where your campaign lives.">
      <div style={{ padding: 'var(--space-3) 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Local storage</span><span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-secondary)' }}>1.8 GB / 5 GB</span></div>
        <div style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-sunken)', overflow: 'hidden' }}><div style={{ width: '36%', height: '100%', background: 'var(--color-accent)' }} /></div>
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: 6 }}>Maps 1.1 GB · Audio 480 MB · Notes 12 MB</div>
      </div>
      <div style={{ marginTop: 'var(--space-1)' }}>
        <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', padding: 'var(--space-2) 0' }}>Connected sources</div>
        {GS().sources.map((s) => <SourceRow key={s.id} s={s} />)}
      </div>
    </Panel>
  );
}

function SyncPanel() {
  return (
    <Panel id="sync" title="Sync" sub="Queued changes, conflicts, and offline state.">
      <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) 0' }}>
        <SE.StatPill label="Queued" value="4" tone="accent" />
        <SE.StatPill label="Conflicts" value="1" tone="warning" />
        <SE.StatPill label="Last sync" value="2m" mono />
      </div>
      <Row title="Offline mode" sub="Keep working; queue writes until a source reconnects." control={<SE.Switch checked={false} onChange={() => {}} />} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', marginTop: 'var(--space-2)', borderRadius: 'var(--radius-md)', background: 'var(--color-status-warning-subtle)', border: '1px solid var(--color-status-warning)' }}>
        <SE.Icon name="warning" size="sm" color="var(--color-status-warning)" />
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-status-warning-text)' }}>1 conflict on "Brine Hand Notes"</div>
          <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Local and Obsidian both edited the Vorlag note.</div>
        </div>
        <SE.Button variant="secondary" size="sm">Resolve</SE.Button>
      </div>
    </Panel>
  );
}

function SourcesPanel() {
  return (
    <Panel id="sources" title="Sources" sub="Content integrations the vault reads from.">
      {GS().sources.map((s) => <SourceRow key={s.id} s={s} />)}
      <div style={{ marginTop: 'var(--space-3)' }}><SE.Button variant="secondary" icon="connection">Connect a source</SE.Button></div>
    </Panel>
  );
}

function AiPanel() {
  return (
    <Panel id="ai" title="AI / MCP" sub="Assistance proposes; you approve. Staged review is the default — never auto-apply.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-dm-only-subtle)', border: '1px solid var(--color-dm-only-badge)', marginBottom: 'var(--space-2)' }}>
        <SE.Icon name="Bot" size="md" color="var(--color-dm-only-badge)" />
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Staged-write review</div>
          <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Every AI/MCP change waits in a review queue with provenance before it touches the vault.</div>
        </div>
        <SE.Switch checked onChange={() => {}} />
      </div>
      <Row title="Provenance badges" sub="Mark AI-touched content with a source popover." control={<SE.Switch checked onChange={() => {}} />} />
      <Row title="Inline suggestions in the editor" control={<SE.Switch checked onChange={() => {}} />} />
      <Row title="Model" control={<SE.Select options={['Claude (recommended)', 'Local model', 'Off']} style={{ width: 200 }} />} />
      <Row title="MCP servers" sub="2 connected · open5e, campaign-vault" control={<SE.Button variant="ghost" icon="chevron-right">Manage</SE.Button>} />
    </Panel>
  );
}

function AudioPanel() {
  return (
    <Panel id="audio" title="Audio & atmosphere" sub="The ambience asset library. Mixing lives in the Session widget, not here.">
      <Row title="Master volume" control={<div style={{ width: 200 }}><SE.Slider min={0} max={100} value={70} onChange={() => {}} valueLabel="70%" /></div>} />
      <Row title="Duck ambience during dice rolls" control={<SE.Switch checked onChange={() => {}} />} />
      <Row title="Track library" sub="18 tracks · Tavern, Combat, Sea, Tension" control={<SE.Button variant="ghost" icon="chevron-right">Open library</SE.Button>} />
    </Panel>
  );
}

function ExtensionsPanel() {
  const go = () => window.DNDNavigate && window.DNDNavigate('extensions');
  return (
    <Panel id="extensions" title="Extensions & systems" sub="Plugins, the compendium, custom object types, the campaign-system module, and the theme studio.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-accent-border)', marginBottom: 'var(--space-2)' }}>
        <SE.Icon name="Blocks" size="md" color="var(--color-accent)" />
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>DND Tools is a platform</div>
          <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Capability-sandboxed plugins, an Open5e compendium, no-code object types, and swappable rules — every write still staged.</div>
        </div>
        <SE.Button variant="primary" icon="chevron-right" onClick={go}>Open</SE.Button>
      </div>
      <Row title="Plugins" sub="3 enabled · 1 review requested" control={<SE.Button variant="ghost" icon="chevron-right" onClick={go}>Manage</SE.Button>} />
      <Row title="Campaign system" sub="D&D 5e" control={<SE.Button variant="ghost" icon="chevron-right" onClick={go}>Change</SE.Button>} />
      <Row title="Custom object types" sub="3 defined · Ship, Deity, Faction Treaty" control={<SE.Button variant="ghost" icon="chevron-right" onClick={go}>Edit</SE.Button>} />
      <Row title="Compendium import" sub="Open5e SRD — monsters, spells, items" control={<SE.Button variant="ghost" icon="import" onClick={go}>Browse</SE.Button>} />
      <Row title="Theme studio" sub="Override any token; export & import themes" control={<SE.Button variant="ghost" icon="theme" onClick={go}>Open</SE.Button>} />
    </Panel>
  );
}

function DiagnosticsPanel() {
  return (
    <Panel id="diagnostics" title="Diagnostics" sub="Build info and performance budgets.">
      <Row title="Version" control={<span style={{ font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-secondary)' }}>2.4.0 · tavern</span>} />
      <Row title="Frame budget" sub="Canvas renders within 16ms target." control={<SE.Badge status="success" icon="success">Healthy</SE.Badge>} />
      <Row title="Export diagnostics" control={<SE.Button variant="secondary" icon="upload">Export logs</SE.Button>} />
      <Row title="Reset workspace layout" sub="Restores default widget positions. Content untouched." danger control={<SE.Button variant="danger" icon="retry">Reset</SE.Button>} />
    </Panel>
  );
}

const PANELS = {
  preferences: PrefsPanel, account: AccountPanel, accessibility: AccessibilityPanel, players: PlayersPanel,
  vault: VaultPanel, sync: SyncPanel, sources: SourcesPanel, ai: AiPanel, audio: AudioPanel, extensions: ExtensionsPanel, diagnostics: DiagnosticsPanel,
};

function Rail({ active, setActive, layout, setLayout }) {
  const groups = ['You', 'Table', 'System'];
  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', position: 'sticky', top: 0 }}>
      {groups.map((g) => (
        <div key={g}>
          <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', padding: 'var(--space-3) var(--space-3) var(--space-1)' }}>{g}</div>
          {SECTIONS.filter((s) => s.group === g).map((s) => {
            const on = s.id === active;
            return (
              <button key={s.id} type="button" onClick={() => setActive(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', padding: 'var(--space-2) var(--space-3)', border: 'none', borderLeft: `3px solid ${on ? 'var(--color-accent)' : 'transparent'}`, borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', font: `${on ? 600 : 500} var(--text-sm) var(--font-sans)`, cursor: 'pointer', textAlign: 'left' }}>
                <SE.Icon name={s.icon} size="sm" /><span>{s.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Settings() {
  const [layout, setLayout] = React.useState('rail');
  const [active, setActive] = React.useState('preferences');
  const Active = PANELS[active];
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <CC0 layout={layout} setLayout={setLayout} />
      {layout === 'rail' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '226px minmax(0, 1fr)', gap: 'var(--space-5)', alignItems: 'start' }}>
          <Rail active={active} setActive={setActive} />
          <Active />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 200px', gap: 'var(--space-5)', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {SECTIONS.map((s) => { const P = PANELS[s.id]; return <P key={s.id} />; })}
          </div>
          <nav style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', padding: 'var(--space-2) var(--space-3)' }}>On this page</div>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1-5) var(--space-3)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)', font: '500 var(--text-sm) var(--font-sans)', textDecoration: 'none' }}>
                <SE.Icon name={s.icon} size="micro" color="var(--color-text-tertiary)" />{s.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

function CC0({ layout, setLayout }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      <SE.Breadcrumb items={[{ label: 'Command Center' }, { label: 'Settings' }]} />
      <div style={{ marginLeft: 'auto' }}>
        <SE.SegmentedControl value={layout} onChange={setLayout} size="sm" options={[{ value: 'rail', label: 'Rail' }, { value: 'single', label: 'Single page' }]} />
      </div>
    </div>
  );
}

Object.assign(window, { Settings });
