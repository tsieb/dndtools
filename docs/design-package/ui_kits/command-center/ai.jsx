// AI & MCP tools (UX-MCP). Three focused views behind a segmented switch:
//   • Tools & agents — the config panel: global enable, baseline read tools, connected agents +
//     per-agent policy mode, audit-log access.  (UX-MCP-001/002/004/009)
//   • Staged review — the strict_review queue: each AI write staged with a diff; approve/edit/reject. (UX-MCP-007)
//   • In the editor — the inline writing suggestion (diff card) + the provenance badge/popover. (UX-MCP-002/006)
// Human authorship is always preserved: AI generates candidates, the DM decides.
const AI = window.DNDToolsDesignSystem_8ae046;

function DiffBlock({ diff }) {
  const map = {
    '+': { bg: 'var(--color-status-success-subtle)', bar: 'var(--color-status-success)', c: 'var(--color-status-success-text)', m: '+' },
    '-': { bg: 'var(--color-status-error-subtle)', bar: 'var(--color-status-error)', c: 'var(--color-status-error-text)', m: '–' },
    ctx: { bg: 'transparent', bar: 'transparent', c: 'var(--color-text-secondary)', m: ' ' },
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
      {diff.map(([op, text], i) => {
        const s = map[op] || map.ctx;
        return (
          <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', padding: '3px 6px', borderLeft: `2px solid ${s.bar}`, background: s.bg, borderRadius: 2 }}>
            <span style={{ font: 'var(--text-xs) var(--font-mono)', color: s.c, width: 10, flex: '0 0 auto' }}>{s.m}</span>
            <span style={{ font: 'var(--text-sm) var(--font-sans)', color: op === 'ctx' ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', lineHeight: 1.5 }}>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

const CAP = { read: { s: 'neutral', t: 'read-only' }, staged: { s: 'warning', t: 'staged-write' }, direct: { s: 'error', t: 'direct-write' } };

function ToolsAndAgents({ d }) {
  const [enabled, setEnabled] = React.useState(d.enabled);
  const [policies, setPolicies] = React.useState(Object.fromEntries(d.agents.map((a) => [a.id, a.policy])));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 'var(--space-5)', maxWidth: 1060, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* scope + global toggle */}
        <window.Panel pad="md" style={{ borderColor: 'var(--color-accent-border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', flex: '0 0 auto' }}><AI.Icon name="sparkle" size="md" /></span>
            <div style={{ flex: 1 }}>
              <div style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>AI supplements your workflow</div>
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: 2 }}>{d.scope}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <AI.Switch checked={enabled} onChange={() => setEnabled((v) => !v)} label="Enable AI & MCP tools" />
              <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: enabled ? 'var(--color-status-success-text)' : 'var(--color-text-tertiary)' }}>{enabled ? 'ON' : 'OFF'}</span>
            </div>
          </div>
        </window.Panel>

        {!enabled ? (
          <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-5)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px dashed var(--color-border-strong)', alignItems: 'center' }}>
            <AI.Icon name="check" size="md" color="var(--color-status-success-text)" />
            <div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>AI & MCP tools are disabled. Every core feature — notes, maps, sessions, characters, sync, graph, search — works identically. No AI affordances appear anywhere; absence is the correct state, not a disabled ghost.</div>
          </div>
        ) : (
          <React.Fragment>
            <window.Panel title="Baseline tools" action={<span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Ship by default</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {d.baselineTools.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
                    <AI.Checkbox checked={t.on} onChange={() => {}} />
                    <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{t.name}</span>
                    <AI.Badge status={CAP[t.cap].s}>{CAP[t.cap].t}</AI.Badge>
                    <AI.IconButton icon="Info" label="Details" variant="ghost" size="sm" />
                  </div>
                ))}
              </div>
            </window.Panel>

            <window.Panel title="AI agents" action={<AI.Button variant="secondary" size="sm" icon="add">Attach agent</AI.Button>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {d.agents.map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                    <AI.StatusDot status={a.status === 'connected' ? 'live' : 'idle'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{a.name}</div>
                      <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>actor: {a.actor}</div>
                    </div>
                    <div style={{ width: 168 }}>
                      <AI.Select value={policies[a.id]} onChange={(e) => setPolicies((p) => ({ ...p, [a.id]: e.target.value }))}
                        options={d.policies.map((p) => ({ value: p.value, label: p.label }))} />
                    </div>
                    <AI.IconButton icon="more" label="Agent actions" variant="ghost" size="sm" />
                  </div>
                ))}
              </div>
              <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                {d.policies.find((p) => p.value === policies.ag1)?.desc} New agents default to <b style={{ color: 'var(--color-text-secondary)' }}>strict review</b>.
              </div>
            </window.Panel>
          </React.Fragment>
        )}
      </div>

      {/* side rail */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel pad="md" style={{ background: 'var(--color-status-warning-subtle)', borderColor: 'var(--color-status-warning)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AI.Icon name="warning" size="md" color="var(--color-status-warning-text)" />
            <span style={{ flex: 1, font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{d.staged.length} staged changes pending</span>
          </div>
          <AI.Button variant="secondary" size="sm" icon="chevron-right">Review now</AI.Button>
        </window.Panel>
        <window.Panel title="Policy modes" pad="md">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {d.policies.map((p) => (
              <div key={p.value} style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)' }}>
                <div style={{ font: '600 var(--text-sm) var(--font-mono)', color: p.value === 'trusted_direct' ? 'var(--color-status-error-text)' : 'var(--color-text-primary)' }}>{p.value}</div>
                <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </window.Panel>
        <AI.Button variant="ghost" size="sm" icon="scroll">View audit log</AI.Button>
      </div>
    </div>
  );
}

function StagedReview({ d }) {
  const [items, setItems] = React.useState(d.staged);
  const resolve = (id) => setItems((xs) => xs.filter((x) => x.id !== id));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 760, margin: '0 auto', padding: 'var(--space-6) var(--space-5)' }}>
      {items.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-8)', color: 'var(--color-text-tertiary)' }}>
          <AI.Icon name="check" size="lg" color="var(--color-status-success-text)" />
          <div style={{ font: 'var(--text-md) var(--font-sans)' }}>No pending changes — your vault is up to date.</div>
        </div>
      ) : items.map((s) => (
        <window.Panel key={s.id} pad="md">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AI.Badge status="warning">staged-write</AI.Badge>
            <span style={{ font: '700 var(--text-md) var(--font-sans)', color: 'var(--color-text-primary)' }}>{s.kind}: {s.title}</span>
          </div>
          <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>Agent: {s.agent} · Policy: {s.policy} · {s.when}</div>
          <DiffBlock diff={s.diff} />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <AI.Button variant="primary" size="sm" icon="check" onClick={() => resolve(s.id)}>Approve</AI.Button>
            <AI.Button variant="ghost" size="sm" icon="edit">Edit then approve</AI.Button>
            <AI.Button variant="ghost" size="sm" style={{ color: 'var(--color-status-error-text)', marginLeft: 'auto' }} onClick={() => resolve(s.id)}>Reject</AI.Button>
          </div>
        </window.Panel>
      ))}
    </div>
  );
}

function InEditor({ d }) {
  const sug = d.suggestion;
  const [prov, setProv] = React.useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'var(--space-5)', maxWidth: 1000, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
      {/* a mock editor block with an inline AI suggestion diff card */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <window.Panel title="The Pier — read-aloud" action={<AI.IconButton icon="sparkle" label="AI writing help" variant="ghost" size="sm" />}>
          <div style={{ position: 'relative', font: 'var(--text-md)/1.7 var(--font-sans)', color: 'var(--color-text-primary)', padding: 'var(--space-2) 0' }}>
            Brackish water laps at the rotting pier.
            {/* provenance badge on AI-assisted content */}
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <button type="button" onClick={() => setProv((v) => !v)} aria-label="AI-assisted content — details"
                style={{ display: 'inline-flex', verticalAlign: 'super', marginLeft: 4, width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--color-accent-border)', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                <AI.Icon name="sparkle" size={11} />
              </button>
              {prov && (
                <span style={{ position: 'absolute', top: 24, left: 0, zIndex: 20, width: 240, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-strong)', boxShadow: 'var(--shadow-lg)', display: 'block', font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: '700 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', marginBottom: 6 }}><AI.Icon name="sparkle" size={13} color="var(--color-accent)" /> AI-assisted content</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', lineHeight: 1.4 }}>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>Tool</span><span>Inline writing assistant</span>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>Agent</span><span>Claude (web)</span>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>Context</span><span>The Pier, Session 7 notes</span>
                    <span style={{ color: 'var(--color-text-tertiary)' }}>Date</span><span style={{ fontFamily: 'var(--font-mono)' }}>2026-06-07 14:32</span>
                  </div>
                </span>
              )}
            </span>
            {' '}A single lantern gutters at the far end, and the water between you and it is too still — as if something beneath is holding its breath.
          </div>
        </window.Panel>

        {/* inline suggestion card */}
        <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent-border)', background: 'var(--color-surface-raised)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-accent-subtle)', borderBottom: '1px solid var(--color-accent-border)' }}>
            <AI.Icon name="sparkle" size="sm" color="var(--color-accent)" />
            <span style={{ flex: 1, font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>AI draft — review and edit before accepting</span>
            <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>“{sug.prompt}”</span>
          </div>
          <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <DiffBlock diff={sug.diff} />
            <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Based on: {sug.sources.join(', ')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <AI.Button variant="primary" size="sm" icon="check">Accept</AI.Button>
              <AI.Button variant="ghost" size="sm" icon="shuffle">Cycle alt</AI.Button>
              <AI.Button variant="ghost" size="sm" icon="edit">Edit</AI.Button>
              <kbd style={{ marginLeft: 'auto', font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)', borderRadius: 3, padding: '2px 6px' }}>TAB to accept · ESC to reject</kbd>
            </div>
          </div>
        </div>
      </div>

      {/* entity-extraction chips */}
      <window.Panel title="Entities detected" pad="md">
        <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>AI suggests; it never auto-creates links or records.</div>
        {[['Vorlag', 'characters-person'], ['The far dock', 'atlas-map'], ['Tidecaller’s Bell', 'tag']].map(([name, icon], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
            <AI.Icon name={icon} size="sm" color="var(--color-accent)" />
            <span style={{ flex: 1, font: '500 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{name}</span>
            <AI.IconButton icon="link" label="Link to existing" variant="ghost" size="sm" />
            <AI.IconButton icon="add" label="Create new" variant="ghost" size="sm" />
            <AI.IconButton icon="close" label="Dismiss" variant="ghost" size="sm" />
          </div>
        ))}
      </window.Panel>
    </div>
  );
}

function AITools() {
  const d = window.DNDGaps2.ai;
  const [view, setView] = React.useState('config');
  return (
    <window.PageShell icon="sparkle" eyebrow="Settings" title="AI & Tools"
      actions={<window.Seg value={view} onChange={setView} options={[
        { value: 'config', label: 'Tools & agents' },
        { value: 'staged', label: `Staged review · ${d.staged.length}` },
        { value: 'editor', label: 'In the editor' },
      ]} />}>
      {view === 'config' && <ToolsAndAgents d={d} />}
      {view === 'staged' && <StagedReview d={d} />}
      {view === 'editor' && <InEditor d={d} />}
    </window.PageShell>
  );
}

Object.assign(window, { AITools });
