// Reliability surfaces.
//   ContentImport (UX-CONTENT) — the import / source-of-truth wizard: classify what comes in
//     (importable / lossy / unsupported), and reconcile an incoming change against a local edit
//     before a two-phase commit.
//   SyncConflict (UX-SYNC) — the offline banner + pending-write queue, and the conflict-resolution
//     merge surface (mine vs theirs, choose a side or keep both).
const RL = window.DNDToolsDesignSystem_8ae046;

/* ════════════ Content import ════════════ */
const CLASS_META = {
  importable: { s: 'success', icon: 'check', label: 'Importable', note: 'Brought in with full fidelity.' },
  lossy: { s: 'warning', icon: 'warning', label: 'Lossy', note: 'Imported with reductions — review each.' },
  unsupported: { s: 'error', icon: 'error', label: 'Unsupported', note: 'Skipped. Nothing is imported.' },
};

function ClassGroup({ kind, items }) {
  const m = CLASS_META[kind];
  return (
    <window.Panel pad="md">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <RL.Badge status={m.s} icon={m.icon}>{m.label}</RL.Badge>
        <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{m.note}</span>
        <span style={{ marginLeft: 'auto', font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        {items.map((it) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
            <RL.Icon name="note-edit" size="sm" color="var(--color-text-tertiary)" />
            <span style={{ flex: 1, minWidth: 0, font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
            {it.as && <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>→ {it.as}</span>}
            {it.vis && <window.Vis level={it.vis === 'dm-only' ? 'dm-only' : 'player-visible'} />}
            {it.note && <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', maxWidth: 200 }}>{it.note}</span>}
          </div>
        ))}
      </div>
    </window.Panel>
  );
}

function ContentImport() {
  const d = window.DNDGaps2.import;
  const c = d.classified;
  const total = c.importable.length + c.lossy.length;
  const [pick, setPick] = React.useState('incoming');
  return (
    <window.PageShell icon="import" eyebrow="Knowledge" title="Import from a source"
      actions={<RL.Button variant="primary" size="sm" icon="check">Commit {total} items</RL.Button>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'var(--space-5)', maxWidth: 1080, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <RL.Stepper steps={d.steps} current={1} ariaLabel="Import" />
          <ClassGroup kind="importable" items={c.importable} />
          <ClassGroup kind="lossy" items={c.lossy} />
          <ClassGroup kind="unsupported" items={c.unsupported} />

          {/* reconciliation — incoming vs local */}
          <window.Panel title="Resolve a conflict" action={<RL.Badge status="warning" icon="warning">1 needs a decision</RL.Badge>}>
            <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{d.reconcile.entity} · {d.reconcile.field} differs from what you already have.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              {[['local', 'Keep local', d.reconcile.local], ['incoming', 'Use incoming', d.reconcile.incoming]].map(([k, label, text]) => {
                const on = pick === k;
                return (
                  <button key={k} type="button" onClick={() => setPick(k)}
                    style={{ textAlign: 'left', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: `1px solid ${on ? 'var(--color-accent-border)' : 'var(--color-border)'}`, background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-alt)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${on ? 'var(--color-accent)' : 'var(--color-border-strong)'}`, background: on ? 'var(--color-accent)' : 'transparent' }} />
                      <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{label}</span>
                    </div>
                    <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{text}</div>
                  </button>
                );
              })}
            </div>
          </window.Panel>
        </div>

        <window.Panel title="Source" pad="md" style={{ alignSelf: 'start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-raised)', color: 'var(--color-accent)' }}><RL.Icon name="BookText" size="md" /></span>
            <div>
              <div style={{ font: '600 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{d.source.name}</div>
              <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{d.source.kind} · {d.source.files} files</div>
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--color-border)' }} />
          {[['Importable', c.importable.length, 'success'], ['Lossy', c.lossy.length, 'warning'], ['Skipped', c.unsupported.length, 'error']].map(([k, n, s]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <RL.StatusDot status={s === 'success' ? 'live' : s === 'warning' ? 'warning' : 'error'} label="" />
              <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{k}</span>
              <span style={{ font: 'var(--text-sm) var(--font-mono)', color: 'var(--color-text-primary)' }}>{n}</span>
            </div>
          ))}
          <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>Two-phase: nothing is written until you commit. You can roll back the whole import.</div>
        </window.Panel>
      </div>
    </window.PageShell>
  );
}

/* ════════════ Sync conflict ════════════ */
function SyncConflict() {
  const d = window.DNDGaps2.sync;
  const [resolved, setResolved] = React.useState({});
  return (
    <window.PageShell icon="RefreshCw" eyebrow="Settings" title="Sync & conflicts"
      actions={<RL.Button variant={d.online ? 'ghost' : 'secondary'} size="sm" icon="RefreshCw">{d.online ? 'Synced' : 'Retry now'}</RL.Button>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'var(--space-5)', maxWidth: 1080, margin: '0 auto', padding: 'var(--space-5)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* offline banner */}
          <window.Panel pad="md" style={{ background: 'var(--color-status-warning-subtle)', borderColor: 'var(--color-status-warning)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <RL.Icon name="audio-off" size="md" color="var(--color-status-warning-text)" />
              <div style={{ flex: 1 }}>
                <div style={{ font: '700 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Working offline</div>
                <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{d.queued} changes queued on this device · last synced {d.lastSync}. Everything still works; changes send when you reconnect.</div>
              </div>
            </div>
          </window.Panel>

          {/* conflicts */}
          <window.Panel title="Conflicts to resolve" action={<span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{d.conflicts.filter((c) => !resolved[c.id]).length} open</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {d.conflicts.map((c) => {
                const r = resolved[c.id];
                return (
                  <div key={c.id} style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                      <RL.Icon name={c.kind === 'character' ? 'characters-person' : 'note-edit'} size="sm" color="var(--color-accent)" />
                      <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{c.entity}</span>
                      <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>· {c.field}</span>
                      {r && <RL.Badge status="success" icon="check" style={{ marginLeft: 'auto' }}>Kept {r}</RL.Badge>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                      {[['mine', 'This device', c.mine, c.minWhen], ['theirs', 'Co-DM Aša', c.theirs, c.theirWhen]].map(([k, who, text, when]) => {
                        const on = r === (k === 'mine' ? 'mine' : 'theirs');
                        return (
                          <button key={k} type="button" onClick={() => setResolved((x) => ({ ...x, [c.id]: k }))}
                            style={{ textAlign: 'left', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: `1px solid ${on ? 'var(--color-accent-border)' : 'var(--color-border)'}`, background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-raised)', cursor: 'pointer' }}>
                            <window.Eyebrow>{who}</window.Eyebrow>
                            <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', lineHeight: 1.45, margin: '4px 0' }}>{text}</div>
                            <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{when}</div>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                      <RL.Button variant="ghost" size="sm" onClick={() => setResolved((x) => ({ ...x, [c.id]: 'both' }))}>Keep both</RL.Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </window.Panel>
        </div>

        {/* pending queue */}
        <window.Panel title="Pending writes" pad="md" action={<span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{d.queue.length}</span>} style={{ alignSelf: 'start' }}>
          <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>Will send in order when you reconnect.</div>
          {d.queue.map((q) => (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
              <RL.Icon name={q.icon} size="sm" color="var(--color-text-tertiary)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-accent)' }}>{q.op}</span>
                <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.entity}</div>
              </div>
              <RL.StatusDot status="syncing" label="" />
            </div>
          ))}
        </window.Panel>
      </div>
    </window.PageShell>
  );
}

Object.assign(window, { ContentImport, SyncConflict });
