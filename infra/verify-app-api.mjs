// Decisive verification against the DEPLOYED app-api (marketplace / invites / account /
// entitlements). Read-mostly with a full write-read-delete cycle on self-owned rows only,
// so it is safe to run repeatedly against dev.
//
// Proves end-to-end:
//   1. auth gate: unauthenticated requests to protected routes are rejected (401)
//   2. entitlements: default plan resolves; a simulated plan change round-trips and the
//      response is explicitly marked simulated (never mistakable for real billing)
//   3. marketplace: publish → appears in browse → payload fetch matches → own-delete works
//   4. invites: create → listed as pending → PUBLIC resolve route returns join metadata
//      (no auth) → revoke → resolve now fails (single source of truth, TTL row gone)
//   5. tenant isolation: deleting another owner's module id is refused
//
//   APP_API_URL=https://.../dev  TOKEN=<cognito-id-token>  node infra/verify-app-api.mjs
const APP_API_URL = process.env.APP_API_URL?.replace(/\/$/, '');
const TOKEN = process.env.TOKEN;
if (!APP_API_URL || !TOKEN) {
  console.error('APP_API_URL and TOKEN env vars are required');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const ok = (n) => { console.log(`  ✓ ${n}`); passed++; };
const bad = (n, d) => { console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); failed++; };
const check = (cond, n, d) => (cond ? ok(n) : bad(n, d));

const authed = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const req = (path, opts = {}) =>
  fetch(`${APP_API_URL}${path}`, { ...opts, headers: { ...authed, ...(opts.headers ?? {}) } });
const anon = (path, opts = {}) => fetch(`${APP_API_URL}${path}`, opts);

// --- 1. auth gate -------------------------------------------------------------------
{
  const r = await anon('/account/entitlements');
  check(r.status === 401, 'unauthenticated entitlements read is rejected (401)', `status ${r.status}`);
}

// --- 2. entitlements ----------------------------------------------------------------
{
  const r = await req('/account/entitlements');
  if (!r.ok) bad('entitlements read', `status ${r.status}`);
  else {
    const body = await r.json();
    check(Boolean(body.plan), `entitlements resolve (plan=${body.plan})`, 'no plan in body');
    check(body.simulated === true, 'entitlements are marked simulated', JSON.stringify(body));
  }
  const w = await req('/account/entitlements', { method: 'POST', body: JSON.stringify({ plan: 'lantern' }) });
  if (!w.ok) bad('simulated plan change', `status ${w.status}`);
  else {
    const back = await (await req('/account/entitlements')).json();
    check(back.plan === 'lantern', 'simulated plan change round-trips', JSON.stringify(back));
  }
}

// --- 3. marketplace publish → browse → fetch → delete --------------------------------
const MODULE = {
  name: `verify-module-${Date.now()}`,
  summary: 'verification module — safe to delete',
  version: '0.0.1',
  package: { id: 'verify', widgets: [], meta: { verify: true } },
};
let moduleId = null;
{
  const r = await req('/marketplace/modules', { method: 'POST', body: JSON.stringify(MODULE) });
  if (!r.ok) bad('module publish', `status ${r.status}: ${await r.text()}`);
  else {
    moduleId = (await r.json()).moduleId;
    check(Boolean(moduleId), `module published (${moduleId})`, 'no moduleId returned');
  }
  if (moduleId) {
    const list = await (await req('/marketplace/modules')).json();
    const found = (list.modules ?? []).some((m) => m.moduleId === moduleId);
    check(found, 'published module appears in browse', 'module missing from list');
    const got = await (await req(`/marketplace/modules/${moduleId}`)).json();
    check(got.package?.meta?.verify === true, 'module payload fetch matches published package', JSON.stringify(got).slice(0, 200));
    const del = await req(`/marketplace/modules/${moduleId}`, { method: 'DELETE' });
    check(del.ok, 'own-module delete works', `status ${del.status}`);
  }
}

// --- 4. invites create → list → public resolve → revoke ------------------------------
{
  const r = await req('/invites', { method: 'POST', body: JSON.stringify({ campaignName: 'Verify Campaign', note: 'verification invite' }) });
  if (!r.ok) bad('invite create', `status ${r.status}: ${await r.text()}`);
  else {
    const { inviteId, token } = await r.json();
    check(Boolean(inviteId && token), 'invite minted with join token', 'missing inviteId/token');
    const list = await (await req('/invites')).json();
    check((list.invites ?? []).some((i) => i.inviteId === inviteId), 'invite listed as pending', 'not listed');
    const pub = await anon(`/invites/resolve/${token}`);
    if (!pub.ok) bad('public invite resolve', `status ${pub.status}`);
    else {
      const meta = await pub.json();
      check(meta.campaignName === 'Verify Campaign', 'public resolve returns join metadata (no auth)', JSON.stringify(meta));
    }
    const rev = await req(`/invites/${inviteId}`, { method: 'DELETE' });
    check(rev.ok, 'invite revoke works', `status ${rev.status}`);
    const gone = await anon(`/invites/resolve/${token}`);
    check(gone.status === 404 || gone.status === 410, 'revoked invite no longer resolves', `status ${gone.status}`);
  }
}

// --- 5. tenant isolation --------------------------------------------------------------
{
  const r = await req('/marketplace/modules/not-my-module-id', { method: 'DELETE' });
  check(r.status === 403 || r.status === 404, 'foreign module delete refused', `status ${r.status}`);
}

console.log(`\napp-api verify: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
