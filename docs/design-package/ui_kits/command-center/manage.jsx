// VaultConnections, Players, Permissions. Management surfaces — composing the design system over
// the shared PageShell/Panel chrome, using the product's real vocabulary (source adapters & sync
// states, roles dm/player/observer, capability-set grants with an effective-permission preview).
const MG = window.DNDToolsDesignSystem_8ae046;

/* ---------------- Vault connections ---------------- */
const SRC_ICON = { 'Local vault': 'Database', Obsidian: 'BookText', 'Google Docs': 'FileText', 'Open5e / SRD': 'book', 'Roll20 import': 'Dices' };
const SRC_STATE = {
  synced: { s: 'success', t: 'Synced', icon: 'check' },
  syncing: { s: 'info', t: 'Syncing', icon: 'RefreshCw' },
  'needs-auth': { s: 'warning', t: 'Needs sign-in', icon: 'warning' },
  error: { s: 'error', t: 'Sync error', icon: 'error' },
};

function SourceRow({ s }) {
  const st = SRC_STATE[s.state];
  const action = s.state === 'needs-auth' ? 'Re-authorize' : s.state === 'error' ? 'Reconnect' : 'Sync now';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', flex: '0 0 auto' }}><MG.Icon name={SRC_ICON[s.kind] || 'Database'} size="md" /></span>
    <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{s.name}</div>
        <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{s.kind} · {s.auth} · {s.last}{s.pending ? ` · ${s.pending} pending` : ''}</div>
      </div>
      <MG.Badge status={st.s} icon={st.icon}>{st.t}</MG.Badge>
      <MG.Button variant={s.state === 'error' || s.state === 'needs-auth' ? 'secondary' : 'ghost'} size="sm">{action}</MG.Button>
      <MG.IconButton icon="more" label="More" variant="ghost" size="sm" />
    </div>
  );
}

function VaultConnections() {
  const d = window.DNDPages;
  const pending = d.sources.reduce((n, s) => n + s.pending, 0);
  return (
    <window.PageShell icon="vault" eyebrow="Settings" title="Vault connections"
      actions={<MG.Button variant="primary" size="sm" icon="add">Connect a source</MG.Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 920, margin: '0 auto', padding: 'var(--space-6) var(--space-5)' }}>
        <window.Panel pad="md" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)' }}>
          <MG.StatusDot status="syncing" pulse />
          <div style={{ flex: 1 }}>
            <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Sync healthy · online</div>
            <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{pending} change{pending === 1 ? '' : 's'} queued on this device</div>
          </div>
          <MG.Button variant="ghost" size="sm" icon="RefreshCw">Sync all</MG.Button>
        </window.Panel>

        <window.Panel title="Connected sources">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {d.sources.map((s) => <SourceRow key={s.id} s={s} />)}
          </div>
        </window.Panel>

        <window.Panel title="Add a source">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
            {d.integrations.map((i) => (
              <button key={i.id} type="button" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-border)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}>
                <span style={{ display: 'inline-flex', color: 'var(--color-accent)' }}><MG.Icon name={SRC_ICON[i.kind === 'Markdown vault' ? 'Obsidian' : i.kind === 'Cloud docs' ? 'Google Docs' : i.kind === 'Rules reference' ? 'Open5e / SRD' : 'Local vault'] || 'Plug'} size="md" /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{i.name}</div>
                  <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{i.kind}</div>
                </div>
                <MG.Icon name="add" size="sm" color="var(--color-text-tertiary)" />
              </button>
            ))}
          </div>
        </window.Panel>
      </div>
    </window.PageShell>
  );
}

/* ---------------- Players ---------------- */
function PlayerRow({ p }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
      <MG.Avatar name={p.name} size="md" ring={p.status === 'online' ? 'active' : p.status === 'offline' ? 'danger' : undefined} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{p.name}</span>
          <MG.Badge status={p.role === 'observer' ? 'neutral' : 'accent'}>{p.role === 'observer' ? 'Observer' : 'Player'}</MG.Badge>
        </div>
        <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{p.char} · Seeing: {p.view}</div>
      </div>
      <MG.StatusDot status={p.status === 'online' ? 'live' : 'idle'} label={p.status === 'online' ? 'Online' : 'Offline'} />
      <MG.Button variant="ghost" size="sm" icon="characters-person">Assign</MG.Button>
      <MG.IconButton icon="more" label="More" variant="ghost" size="sm" />
    </div>
  );
}

function Players() {
  const d = window.DNDPages;
  return (
    <window.PageShell icon="players" eyebrow="Settings" title="Players"
      actions={<React.Fragment>
        <MG.Button variant="ghost" size="sm" icon="link">Copy invite link</MG.Button>
        <MG.Button variant="primary" size="sm" icon="add">Invite player</MG.Button>
      </React.Fragment>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 'var(--space-5)', maxWidth: 1080, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <window.Panel title="At the table" action={<span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{d.roster.filter((p) => p.status === 'online').length} online</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {d.roster.map((p) => <PlayerRow key={p.id} p={p} />)}
            </div>
          </window.Panel>

          <window.Panel title="Pending invites">
            {d.invites.map((v) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px dashed var(--color-border-strong)' }}>
                <MG.Icon name="Mail" size="sm" color="var(--color-text-tertiary)" />
                <div style={{ flex: 1 }}>
                  <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{v.email}</div>
                  <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Invited as {v.role} · {v.sent}</div>
                </div>
                <MG.Button variant="ghost" size="sm">Resend</MG.Button>
                <MG.Button variant="ghost" size="sm" style={{ color: 'var(--color-status-error-text)' }}>Revoke</MG.Button>
              </div>
            ))}
          </window.Panel>
        </div>

        <window.Panel title="Player groups" action={<MG.Button variant="ghost" size="sm" icon="add">New</MG.Button>}>
          <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>Delivery targets only — membership grants no visibility or permission.</div>
          {d.playerGroups.map((g) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
              <MG.Icon name="visibility-shared" size="sm" color="var(--color-text-secondary)" />
              <span style={{ flex: 1, font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{g.name}</span>
              <span style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{g.members} members</span>
            </div>
          ))}
        </window.Panel>
      </div>
    </window.PageShell>
  );
}

/* ---------------- Permissions ---------------- */
function Permissions() {
  const d = window.DNDPages;
  const [set, setSet] = React.useState('co-editor');
  const [type, setType] = React.useState('scene');
  const cap = d.capabilitySets.find((c) => c.value === set);
  return (
    <window.PageShell icon="permissions" eyebrow="Settings" title="Permissions"
      actions={<MG.Button variant="ghost" size="sm" icon="ShieldCheck">Audit</MG.Button>}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 'var(--space-5)', maxWidth: 1120, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
        <window.Panel title="Roles">
          <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Base role is the ceiling; grants are additive within it. Observers are always read-only.</div>
          {d.roles.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)', flex: '0 0 auto' }}><MG.Icon name={r.id === 'dm' ? 'permissions' : r.id === 'observer' ? 'dm-only' : 'characters-person'} size="sm" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{r.name}</span>
                  <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>· {r.count}</span>
                </div>
                <div style={{ font: 'var(--text-xs)/1.4 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </window.Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <window.Panel title="Grant a capability set">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <MG.Field label="Player"><MG.Select options={d.roster.filter((p) => p.role === 'player').map((p) => ({ value: p.id, label: p.name }))} /></MG.Field>
              <MG.Field label="Entity type"><MG.Select value={type} onChange={(e) => setType(e.target.value)} options={d.entityTypes.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} /></MG.Field>
              <MG.Field label="Entity"><MG.Input defaultValue="The Pier" /></MG.Field>
              <MG.Field label="Capability set"><MG.Select value={set} onChange={(e) => setSet(e.target.value)} options={d.capabilitySets.map((c) => ({ value: c.value, label: c.label }))} /></MG.Field>
            </div>
            {/* effective-permission preview */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', border: '1px solid var(--color-accent-border)' }}>
              <MG.Icon name="ShieldCheck" size="md" color="var(--color-accent)" />
              <div style={{ flex: 1 }}>
                <div style={{ font: '700 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{cap.label} on {type}</div>
                <div style={{ font: 'var(--text-xs)/1.5 var(--font-sans)', color: 'var(--color-text-secondary)' }}>{cap.explain}</div>
                <div style={{ marginTop: 6 }}><MG.Badge status={cap.write ? 'success' : 'neutral'} icon={cap.write ? 'check' : 'dm-only'}>{cap.write ? 'Includes write / operate' : 'Read-only'}</MG.Badge></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <MG.Button variant="primary" size="sm" icon="check">Grant</MG.Button>
              <MG.Button variant="ghost" size="sm">Transfer ownership</MG.Button>
            </div>
          </window.Panel>

          <window.Panel title="Active grants" action={<span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{d.grants.length}</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {d.grants.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
                  <MG.Badge status={g.set === 'owner' ? 'accent' : g.set === 'co-editor' ? 'info' : 'neutral'}>{g.set}</MG.Badge>
                  <span style={{ flex: 1, minWidth: 0, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>{g.type}:</span> {g.entity} <span style={{ color: 'var(--color-text-tertiary)' }}>→ {g.to}</span>
                  </span>
                  {g.expires && <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>expires {g.expires}</span>}
                  <MG.Button variant="ghost" size="sm" style={{ color: 'var(--color-status-error-text)' }}>Revoke</MG.Button>
                </div>
              ))}
            </div>
          </window.Panel>
        </div>
      </div>
    </window.PageShell>
  );
}

Object.assign(window, { VaultConnections, Players, Permissions });
