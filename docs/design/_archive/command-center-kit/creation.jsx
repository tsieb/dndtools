// CharacterCreator (wizard), SceneCreator (template + widgets), WidgetBuilder (custom-widget
// authoring: code + style tokens + host permissions + live preview). Authoring surfaces.
const CR = window.DNDToolsDesignSystem_8ae046;

/* ---------------- Character creator ---------------- */
function StepRail({ steps, active, onPick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {steps.map((s, i) => {
        const on = s.id === active;
        const done = steps.findIndex((x) => x.id === active) > i;
        return (
          <button key={s.id} type="button" onClick={() => onPick(s.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2-5, 10px) var(--space-3)', border: 'none', borderLeft: `3px solid ${on ? 'var(--color-accent)' : 'transparent'}`, borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', flex: '0 0 auto', background: done ? 'var(--color-status-success)' : on ? 'var(--color-accent)' : 'var(--color-surface-overlay)', color: done || on ? 'var(--color-accent-foreground)' : 'var(--color-text-tertiary)', font: '700 var(--text-2xs) var(--font-mono)' }}>
              {done ? <CR.Icon name="check" size={12} /> : i + 1}
            </span>
            <span style={{ font: `${on ? 600 : 500} var(--text-sm) var(--font-sans)`, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{s.title}</span>
          </button>
        );
      })}
    </div>
  );
}

function CharStep({ step }) {
  const d = window.DNDPages;
  if (step === 'identity') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <CR.Field label="Name"><CR.Input defaultValue="Mara Quill" /></CR.Field>
      <CR.Field label="Type"><window.Seg value="PC" onChange={() => {}} options={d.charKinds.map((k) => ({ value: k, label: k }))} /></CR.Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <CR.Field label="Ancestry"><CR.Select options={['Human', 'Elf', 'Dwarf', 'Halfling', 'Tiefling']} /></CR.Field>
        <CR.Field label="Background"><CR.Select options={['Acolyte', 'Soldier', 'Criminal', 'Sage']} /></CR.Field>
      </div>
      <CR.Field label="Visibility"><window.Seg value="dm-only" onChange={() => {}} options={[{ value: 'dm-only', label: 'DM only', icon: 'dm-only' }, { value: 'player-visible', label: 'Player visible', icon: 'visibility-players' }]} /></CR.Field>
    </div>
  );
  if (step === 'class') return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)' }}>
      <CR.Field label="Class"><CR.Select options={['Cleric', 'Fighter', 'Rogue', 'Wizard', 'Bard']} /></CR.Field>
      <CR.Field label="Level"><CR.Select options={['1', '2', '3', '4', '5', '6'].map((v) => ({ value: v, label: v }))} defaultValue="5" /></CR.Field>
      <CR.Field label="Subclass" style={{ gridColumn: '1 / -1' }}><CR.Select options={['Life Domain', 'Light Domain', 'War Domain']} /></CR.Field>
    </div>
  );
  if (step === 'stats') return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
      {d.abilities.map((a) => (
        <div key={a.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
          <span style={{ font: '600 var(--text-2xs) var(--font-sans)', letterSpacing: 'var(--tracking-wider)', color: 'var(--color-text-tertiary)' }}>{a.key}</span>
          <span style={{ font: '700 var(--text-2xl) var(--font-display)', color: 'var(--color-text-primary)' }}>{a.val}</span>
          <span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-accent)' }}>{a.mod}</span>
        </div>
      ))}
    </div>
  );
  if (step === 'kit') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {[['Mace', '+5 · 1d6+2 bludgeoning'], ['Sacred Flame', 'DC 14 · 1d8 radiant']].map(([n, det]) => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
          <CR.Icon name="sword" size="sm" color="var(--color-accent)" />
          <div style={{ flex: 1 }}>
            <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{n}</div>
            <div style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{det}</div>
          </div>
          <CR.IconButton icon="close" label="Remove" variant="ghost" size="sm" />
        </div>
      ))}
      <CR.Button variant="secondary" size="sm" icon="add" style={{ alignSelf: 'flex-start' }}>Add attack</CR.Button>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <CR.Field label="Bio"><CR.Textarea rows={4} defaultValue="A widowed cleric of the Dawnfather, hunting the cult that drowned her village." /></CR.Field>
      <CR.Field label="DM notes" help="Visible only to you — never shown to players.">
        <CR.Textarea rows={3} defaultValue="Secretly carries the missing ledger page." />
      </CR.Field>
    </div>
  );
}

function CharacterCreator() {
  const d = window.DNDPages;
  const [step, setStep] = React.useState('identity');
  const def = d.charSteps.find((s) => s.id === step);
  return (
    <window.PageShell icon="characters-person" eyebrow="Characters" title="Create character"
      actions={<React.Fragment>
        <CR.Button variant="ghost" size="sm">Save draft</CR.Button>
        <CR.Button variant="primary" size="sm" icon="check">Add to roster</CR.Button>
      </React.Fragment>}>
      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) 280px', gap: 'var(--space-5)', maxWidth: 1120, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
        <window.Panel title="Steps" pad="md"><StepRail steps={d.charSteps} active={step} onPick={setStep} /></window.Panel>

        <window.Panel title={def.title} pad="lg" style={{ minHeight: 360 }}
          action={<CR.Icon name={def.icon} size="sm" color="var(--color-text-tertiary)" />}>
          <div style={{ paddingTop: 'var(--space-2)' }}><CharStep step={step} /></div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'auto', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
            <CR.Button variant="ghost" size="sm" icon="chevron-left">Back</CR.Button>
            <CR.Button variant="secondary" size="sm" iconRight="chevron-right" style={{ marginLeft: 'auto' }}>Next step</CR.Button>
          </div>
        </window.Panel>

        <window.Panel title="What you get" pad="md">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <CR.Avatar name="Mara Quill" size="lg" ring="active" />
            <div>
              <div style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>Mara Quill</div>
              <div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>Cleric 5 · Human</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
            <CR.StatPill label="AC" value="16" /><CR.StatPill label="HP" value="30" tone="accent" /><CR.StatPill label="Speed" value="30" />
          </div>
          <div style={{ marginTop: 'var(--space-2)' }}><window.Vis level="dm-only" /></div>
        </window.Panel>
      </div>
    </window.PageShell>
  );
}

/* ---------------- Scene creator ---------------- */
function SceneCreator() {
  const d = window.DNDPages;
  const D = window.DNDData;
  const [tpl, setTpl] = React.useState('combat');
  const [widgets, setWidgets] = React.useState(() => Object.fromEntries(d.widgetCatalogue.map((w) => [w.type, w.on])));
  const chosen = d.sceneTemplates.find((t) => t.id === tpl);
  const onCount = Object.values(widgets).filter(Boolean).length;
  return (
    <window.PageShell icon="LayoutDashboard" eyebrow="Scenes" title="Create scene"
      actions={<React.Fragment>
        <CR.Button variant="ghost" size="sm">Cancel</CR.Button>
        <CR.Button variant="primary" size="sm" icon="check">Create scene</CR.Button>
      </React.Fragment>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 'var(--space-5)', maxWidth: 1120, margin: '0 auto', padding: 'var(--space-6) var(--space-5)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <window.Panel title="Basics" pad="lg">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
              <CR.Field label="Scene name"><CR.Input defaultValue="The Drowned Hall" /></CR.Field>
              <CR.Field label="Region"><CR.Select options={['Outpost Yard', 'Lower Vaults', 'Saltmarsh town']} /></CR.Field>
            </div>
            <CR.Field label="Player visibility default"><window.Seg value="dm-only" onChange={() => {}} options={[{ value: 'dm-only', label: 'DM only', icon: 'dm-only' }, { value: 'player-visible', label: 'Player visible', icon: 'visibility-players' }]} /></CR.Field>
          </window.Panel>

          <window.Panel title="Start from a template" pad="lg">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              {d.sceneTemplates.map((t) => {
                const on = t.id === tpl;
                return (
                  <button key={t.id} type="button" onClick={() => setTpl(t.id)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 0, border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-alt)', cursor: 'pointer', overflow: 'hidden', textAlign: 'left' }}>
                    <div style={{ height: 64, background: `linear-gradient(${t.grad}deg, #2a2117, #14100b)`, backgroundImage: 'linear-gradient(rgba(224,176,111,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(224,176,111,.08) 1px, transparent 1px)', backgroundSize: '16px 16px', position: 'relative' }}>
                      {t.builtin && <span style={{ position: 'absolute', top: 6, right: 6 }}><CR.Badge status="neutral">Built-in</CR.Badge></span>}
                    </div>
                    <div style={{ padding: '0 var(--space-3) var(--space-3)' }}>
                      <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{t.name}</div>
                      <div style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{t.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </window.Panel>

          <window.Panel title="Starting widgets" pad="lg" action={<span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{onCount} on</span>}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              {d.widgetCatalogue.map((w) => (
                <label key={w.type} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                  <CR.Switch checked={!!widgets[w.type]} onChange={(v) => setWidgets((s) => ({ ...s, [w.type]: v }))} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{w.label}</div>
                    <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{w.cat}</div>
                  </div>
                </label>
              ))}
            </div>
          </window.Panel>
        </div>

        <window.Panel title="Preview" pad="md" style={{ position: 'sticky', top: 'var(--space-5)' }}>
          <div style={{ position: 'relative', height: 200, borderRadius: 'var(--radius-md)', background: `linear-gradient(${chosen.grad}deg, #2a2117, #14100b)`, backgroundImage: 'linear-gradient(rgba(224,176,111,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(224,176,111,.07) 1px, transparent 1px)', backgroundSize: '20px 20px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
            {Array.from({ length: Math.max(chosen.widgets, onCount ? 2 : 0) }).slice(0, 4).map((_, i) => (
              <div key={i} style={{ position: 'absolute', left: `${10 + (i % 2) * 46}%`, top: `${12 + Math.floor(i / 2) * 44}%`, width: '38%', height: '34%', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', opacity: 0.92 }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'var(--space-2)' }}>
            <Row k="Template" v={chosen.name} />
            <Row k="Widgets" v={`${chosen.widgets || onCount}`} />
            <Row k="Region" v="Lower Vaults" />
          </div>
        </window.Panel>
      </div>
    </window.PageShell>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-sm) var(--font-sans)' }}>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{k}</span>
      <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{v}</span>
    </div>
  );
}

/* ---------------- Widget builder (progressive complexity: Basic / Advanced / Code) ---------------- */
const W_HTML = '<main class="widget-root" data-widget-root>\n  <h1 data-title>{{ name }}</h1>\n  <section class="widget-panel" data-bind="gold">\n    Party gold: <b>{{ gold }} gp</b>\n  </section>\n  <button class="widget-button" type="button" data-action="split">\n    Split evenly\n  </button>\n</main>';
const W_CSS = ':root {\n  --widget-accent: #e0b06f;\n  --widget-surface: #1f1810;\n  --widget-text: #f2e8d8;\n}\n.widget-root { padding: 12px; display: grid; gap: 10px; color: var(--widget-text); }\n.widget-panel { border: 1px solid rgba(255,255,255,.18); border-radius: 8px; padding: 10px; }\n.widget-button { background: var(--widget-accent); border: 0; border-radius: 6px; padding: 8px 10px; }';
const W_JS = 'import { campaign, onData } from "host";\n\nexport function render(ctx) {\n  // ctx.bindings.gold is kept live by the host\n  ctx.el.querySelector("[data-action=split]")\n    .addEventListener("click", () => {\n      const each = ctx.bindings.gold / campaign.party.size;\n      campaign.party.each(p => p.gold += each);\n    });\n}\n\nonData("gold", (v) => console.log("gold ->", v));';

function ModePicker({ mode, onMode }) {
  const opts = window.DNDPages.widgetBuilder.modes;
  return (
    <div style={{ display: 'inline-flex', padding: 3, gap: 2, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)' }}>
      {opts.map((m) => {
        const on = m.value === mode;
        return (
          <button key={m.value} type="button" onClick={() => onMode(m.value)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: 'none', borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent)' : 'transparent', color: on ? 'var(--color-accent-foreground)' : 'var(--color-text-secondary)', font: `${on ? 600 : 500} var(--text-sm) var(--font-sans)`, cursor: 'pointer' }}>
            <CR.Icon name={m.icon} size={14} />{m.label}
          </button>
        );
      })}
    </div>
  );
}

function PresetGrid({ value, onPick }) {
  const presets = window.DNDPages.widgetBuilder.presets;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--space-2-5, 10px)' }}>
      {presets.map((p) => {
        const on = p.id === value;
        return (
          <button key={p.id} type="button" onClick={() => onPick(p.id)}
            style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 'var(--space-3)', border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-alt)', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: `linear-gradient(${p.grad}deg, var(--color-accent-subtle), var(--color-surface-sunken))`, color: 'var(--color-accent)' }}>
                <CR.Icon name={p.icon} size={16} />
              </span>
              {p.bound && <CR.Badge status="info">Data</CR.Badge>}
            </div>
            <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{p.name}</div>
            <div style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{p.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

function ThemeSwatches({ value, onPick }) {
  const themes = window.DNDPages.widgetBuilder.themes;
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      {themes.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} type="button" onClick={() => onPick(t)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 'var(--space-2)', border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: on ? 'var(--color-accent-subtle)' : 'var(--color-surface-alt)', cursor: 'pointer', width: 76 }}>
            <span style={{ display: 'flex', width: '100%', height: 22, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              <span style={{ flex: 2, background: t.surface }} />
              <span style={{ flex: 1, background: t.accent }} />
              <span style={{ flex: 1, background: t.text }} />
            </span>
            <span style={{ font: 'var(--text-2xs) var(--font-sans)', color: on ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function WidgetPreview({ tokens, name, mode, bound }) {
  return (
    <window.Panel title="Live preview" pad="md" style={{ position: 'sticky', top: 'var(--space-5)' }}
      action={<CR.Badge status="neutral">Sandboxed</CR.Badge>}>
      <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden', padding: 'var(--space-4)', display: 'grid', gap: 10, background: tokens.surface, color: tokens.text, minHeight: 170 }}>
        <div style={{ font: '700 16px var(--font-display)' }}>{name || 'Untitled widget'}</div>
        <div style={{ border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: 10, font: '13px var(--font-sans)', opacity: 0.95 }}>
          Party gold: <b>1,240 gp</b>
          {bound && <span style={{ marginLeft: 8, font: '600 10px var(--font-mono)', color: tokens.accent }}>● live</span>}
        </div>
        <button type="button" style={{ border: 0, borderRadius: 6, padding: '8px 10px', color: '#1a1206', background: tokens.accent, font: '600 13px var(--font-sans)', cursor: 'pointer', justifySelf: 'start' }}>Split evenly</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
        <span>Renders in an isolated frame</span>
        <span style={{ font: 'var(--text-2xs) var(--font-mono)', textTransform: 'capitalize' }}>{mode} mode</span>
      </div>
    </window.Panel>
  );
}

function StyleTokensPanel({ tokens, onToken }) {
  return (
    <window.Panel title="Style tokens" pad="md" action={<CR.Badge status="neutral">Override</CR.Badge>}>
      {Object.entries(tokens).map(([k, v]) => (
        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <input type="color" value={v} onChange={(e) => onToken(k, e.target.value)} style={{ width: 30, height: 30, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer', padding: 0 }} />
          <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>{k}</span>
          <span style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{v}</span>
        </label>
      ))}
    </window.Panel>
  );
}

function PermsPanel({ detailed }) {
  const perms = window.DNDPages.widgetBuilder.perms;
  return (
    <window.Panel title="Host permissions" pad="md">
      {perms.map((p) => <PermSwitch key={p.label} label={p.label} desc={detailed ? p.desc : null} on={p.on} />)}
    </window.Panel>
  );
}

function WidgetBuilder() {
  const d = window.DNDPages.widgetBuilder;
  const [mode, setMode] = React.useState('basic');
  const [preset, setPreset] = React.useState('loot');
  const [name, setName] = React.useState('Loot Tracker');
  const [theme, setTheme] = React.useState('tavern');
  const [tokens, setTokens] = React.useState({ accent: '#e0b06f', surface: '#1f1810', text: '#f2e8d8' });
  const [tab, setTab] = React.useState('html');
  const [bindings, setBindings] = React.useState(() => Object.fromEntries(d.bindings.map((b) => [b.id, b.on])));

  const setToken = (k, v) => { setTokens((s) => ({ ...s, [k]: v })); setTheme('custom'); };
  const pickTheme = (t) => { setTheme(t.id); if (t.id !== 'custom') setTokens({ accent: t.accent, surface: t.surface, text: t.text }); };
  const boundCount = Object.values(bindings).filter(Boolean).length;
  const presetMeta = d.presets.find((p) => p.id === preset) || {};
  const modeMeta = d.modes.find((m) => m.value === mode);
  const code = { html: W_HTML.replace('{{ name }}', name).replace('{{ gold }}', '1,240'), css: W_CSS, js: W_JS }[tab];

  const cols = mode === 'basic' ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr) 320px 300px';

  return (
    <window.PageShell icon="LayoutGrid" eyebrow="Widgets" title="Widget builder"
      actions={<React.Fragment>
        <ModePicker mode={mode} onMode={setMode} />
        <CR.Button variant="ghost" size="sm" icon="play">Test</CR.Button>
        <CR.Button variant="primary" size="sm" icon="check">Save widget</CR.Button>
      </React.Fragment>}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 'var(--space-5)' }}>
        {/* mode explainer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', border: '1px solid var(--color-border)' }}>
          <CR.Icon name={modeMeta.icon} size="sm" color="var(--color-accent)" />
          <span style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{modeMeta.label} mode</span>
          <span style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>{modeMeta.blurb}</span>
          {mode !== 'code' && <button type="button" onClick={() => setMode(mode === 'basic' ? 'advanced' : 'code')} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', cursor: 'pointer', font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-accent)' }}>More control <CR.Icon name="chevron-right" size={14} /></button>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 'var(--space-4)', alignItems: 'start' }}>
          {/* ----- left column: build ----- */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <window.Panel title="Basics" pad="lg">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <CR.Field label="Display name"><CR.Input value={name} onChange={(e) => setName(e.target.value)} /></CR.Field>
                <CR.Field label="Default size"><CR.Select options={d.sizes} /></CR.Field>
              </div>
              <CR.Field label="Description"><CR.Input defaultValue="Tracks party gold and splits loot." /></CR.Field>
            </window.Panel>

            {/* BASIC: preset + theme */}
            {mode === 'basic' && (
              <React.Fragment>
                <window.Panel title="Start from a preset" pad="lg">
                  <PresetGrid value={preset} onPick={setPreset} />
                </window.Panel>
                <window.Panel title="Configure" pad="lg" action={presetMeta.bound ? <CR.Badge status="info">Data-bound</CR.Badge> : null}>
                  {preset === 'counter' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
                      <CR.Field label="Label"><CR.Input defaultValue="Torches" /></CR.Field>
                      <CR.Field label="Start"><CR.Input defaultValue="5" /></CR.Field>
                      <CR.Field label="Step"><CR.Input defaultValue="1" /></CR.Field>
                    </div>
                  )}
                  {preset === 'loot' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      <CR.Field label="Starting gold"><CR.Input defaultValue="1240" /></CR.Field>
                      <CR.Field label="Split across" help="Reads party size from the campaign."><CR.Select options={['The party (4)', 'Front line (2)', 'Custom…']} /></CR.Field>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <CR.Switch checked={true} onChange={() => {}} /><span style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>Round to nearest gp</span>
                      </label>
                    </div>
                  )}
                  {preset === 'tracker' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {['Hit points', 'Spell slots', 'Doom clock'].map((b) => (
                        <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                          <CR.Icon name="Activity" size={14} color="var(--color-accent)" />
                          <span style={{ flex: 1, font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{b}</span>
                          <CR.IconButton icon="close" label="Remove" variant="ghost" size="sm" />
                        </div>
                      ))}
                      <CR.Button variant="secondary" size="sm" icon="add" style={{ alignSelf: 'flex-start' }}>Add bar</CR.Button>
                    </div>
                  )}
                  {preset === 'reference' && <CR.Field label="Body"><CR.Textarea rows={4} defaultValue="**Grappling** — contested STR (Athletics) check…" /></CR.Field>}
                  {preset === 'blank' && <div style={{ font: 'var(--text-sm)/1.6 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>An empty widget. Switch to <b style={{ color: 'var(--color-text-secondary)' }}>Advanced</b> to bind data, or <b style={{ color: 'var(--color-text-secondary)' }}>Code</b> to write it from scratch.</div>}
                </window.Panel>
                <window.Panel title="Theme" pad="lg"><ThemeSwatches value={theme} onPick={pickTheme} /></window.Panel>
              </React.Fragment>
            )}

            {/* ADVANCED: data bindings + behavior */}
            {mode === 'advanced' && (
              <React.Fragment>
                <window.Panel title="Live data bindings" pad="lg" action={<span style={{ font: 'var(--text-xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{boundCount} bound</span>}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {d.bindings.map((b) => (
                      <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
                        <CR.Switch checked={!!bindings[b.id]} onChange={(v) => setBindings((s) => ({ ...s, [b.id]: v }))} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{b.label}</div>
                          <div style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{b.source}</div>
                        </div>
                        {bindings[b.id] && <code style={{ font: 'var(--text-2xs) var(--font-mono)', color: 'var(--color-accent)' }}>{`{{ ${b.id} }}`}</code>}
                      </label>
                    ))}
                  </div>
                </window.Panel>
                <window.Panel title="Behavior" pad="lg">
                  <CR.Field label="Refresh"><window.Seg value="live" onChange={() => {}} options={d.refreshOpts.slice(0, 3).map((o, i) => ({ value: ['live', '5s', '30s'][i], label: o }))} /></CR.Field>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    {d.events.map((ev) => (
                      <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                        <CR.Switch checked={ev.id !== 'onClick'} onChange={() => {}} />
                        <div style={{ flex: 1 }}>
                          <div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{ev.label}</div>
                          <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{ev.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </window.Panel>
              </React.Fragment>
            )}

            {/* CODE: full editors */}
            {mode === 'code' && (
              <window.Panel title="Source" pad="md"
                action={<CR.Tabs value={tab} onChange={setTab} tabs={[{ id: 'html', label: 'HTML' }, { id: 'css', label: 'CSS' }, { id: 'js', label: 'JS' }]} />}>
                <textarea spellCheck={false} value={code} onChange={() => {}}
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: 300, resize: 'vertical', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', font: 'var(--text-xs)/1.7 var(--font-mono)', whiteSpace: 'pre' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
                  <CR.Icon name="info" size={12} />
                  <span><code style={{ font: 'var(--text-2xs) var(--font-mono)' }}>{`{{ binding }}`}</code> holes and the <code style={{ font: 'var(--text-2xs) var(--font-mono)' }}>host</code> API resolve at runtime. Edits here override the preset.</span>
                </div>
              </window.Panel>
            )}
          </div>

          {/* ----- middle column: live preview ----- */}
          <WidgetPreview tokens={tokens} name={name} mode={mode} bound={presetMeta.bound || boundCount > 0} />

          {/* ----- right column (advanced + code): style & access ----- */}
          {mode !== 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <StyleTokensPanel tokens={tokens} onToken={setToken} />
              <PermsPanel detailed={mode === 'code'} />
              <window.Panel title="Default visibility" pad="md">
                <window.Seg value="shared" onChange={() => {}} options={[{ value: 'dm-only', label: 'DM only', icon: 'dm-only' }, { value: 'shared', label: 'Shared', icon: 'visibility-shared' }]} />
              </window.Panel>
            </div>
          )}
        </div>
      </div>
    </window.PageShell>
  );
}

function PermSwitch({ label, desc, on }) {
  const [v, setV] = React.useState(on);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
      <CR.Switch checked={v} onChange={setV} />
      <div style={{ flex: 1 }}>
        <span style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{label}</span>
        {desc && <div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{desc}</div>}
      </div>
    </div>
  );
}

Object.assign(window, { CharacterCreator, SceneCreator, WidgetBuilder });
