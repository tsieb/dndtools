// Consolidated report generation. Emits a machine-readable JSON, a Markdown
// summary (nice in PRs / terminals), and a self-contained HTML dashboard
// (theme-aware, no external assets) under test-results/validation/.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CheckResult, RunReport } from './types.ts';
import { fmtDuration } from './util.ts';
import type { FeatureAuditResult } from './feature-audit.ts';

const STATUS_EMOJI: Record<string, string> = { pass: '✅', fail: '❌', warn: '⚠️', skip: '⤸' };

export function buildMarkdown(report: RunReport): string {
	const L: string[] = [];
	L.push('# Application validation report', '');
	L.push(
		`**${report.ok ? 'PASS' : 'FAIL'}** · ${report.counts.pass} passed · ${report.counts.fail} failed · ` +
			`${report.counts.warn} warn · ${report.counts.skip} skipped · ${fmtDuration(report.durationMs)}`,
		'',
	);
	L.push(
		`Selection: \`${report.selection}\` · Capabilities: ${report.capabilities.join(', ') || 'none'}`,
		'',
	);

	const layers = [...new Set(report.results.map((r) => r.layer))];
	for (const layer of layers) {
		L.push(`## ${layer}`, '', '| Check | Status | Time | Detail |', '|---|---|---|---|');
		for (const r of report.results.filter((x) => x.layer === layer)) {
			const detail = r.status === 'skip' ? `_${r.skipReason ?? 'skipped'}_` : r.summary || '';
			L.push(
				`| ${r.title} | ${STATUS_EMOJI[r.status]} ${r.status} | ${fmtDuration(r.durationMs)} | ${detail.replace(/\|/g, '\\|')} |`,
			);
		}
		L.push('');
	}

	const fa = report.results.find((r) => r.id === 'feature-audit')?.detail as
		| FeatureAuditResult
		| undefined;
	if (fa) {
		L.push('## Feature-gap ledger', '');
		L.push('**Known remaining stubs (declared):**', '');
		if (fa.knownStubs.length) fa.knownStubs.forEach((s) => L.push(`- ${s}`));
		else L.push('_none declared_');
		L.push('', `**Stub markers in code:** ${fa.stubMarkerTotal}`, '');
		if (fa.unwiredScreens.length) {
			L.push('**Screens with no core-dispatch reference (verify):**', '');
			fa.unwiredScreens.forEach((s) => L.push(`- \`${s}\``));
		} else {
			L.push('_Every scanned screen references a core-dispatch wiring path._');
		}
		L.push('');
	}
	return L.join('\n');
}

function esc(s: string): string {
	return s.replace(
		/[&<>"]/g,
		(ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!,
	);
}

function rowsHtml(results: CheckResult[]): string {
	return results
		.map((r) => {
			const detail = r.status === 'skip' ? (r.skipReason ?? 'skipped') : r.summary || '';
			const logLink = r.logPath
				? `<a href="${esc(path.relative('test-results/validation', r.logPath))}">log</a>`
				: '';
			return `<tr class="s-${r.status}"><td>${esc(r.title)}</td><td class="badge">${r.status}</td><td>${esc(
				r.layer,
			)}</td><td class="dur">${fmtDuration(r.durationMs)}</td><td>${esc(detail)}</td><td>${logLink}</td></tr>`;
		})
		.join('\n');
}

export function buildHtml(report: RunReport): string {
	const fa = report.results.find((r) => r.id === 'feature-audit')?.detail as
		| FeatureAuditResult
		| undefined;
	const faHtml = fa
		? `<section><h2>Feature-gap ledger</h2>
        <div class="grid">
          <div class="card"><h3>Declared stubs (${fa.knownStubs.length})</h3><ul>${
						fa.knownStubs.map((s) => `<li>${esc(s)}</li>`).join('') || '<li class="muted">none</li>'
					}</ul></div>
          <div class="card"><h3>Screens needing wiring review (${fa.unwiredScreens.length}/${fa.screens.length})</h3><ul>${
						fa.unwiredScreens.map((s) => `<li><code>${esc(s)}</code></li>`).join('') ||
						'<li class="muted">every screen wired</li>'
					}</ul></div>
          <div class="card"><h3>Stub markers in code</h3><p class="big">${fa.stubMarkerTotal}</p><p class="muted">see feature-audit.md / .json</p></div>
        </div></section>`
		: '';

	return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lamplight — Validation Report</title>
<style>
  :root { color-scheme: light dark; --bg:#faf7f2; --fg:#241d15; --muted:#7a6f60; --card:#fff; --line:#e6ddd0;
    --pass:#2e7d32; --fail:#c62828; --warn:#b26a00; --skip:#607d8b; }
  @media (prefers-color-scheme: dark){ :root{ --bg:#171310; --fg:#ece3d6; --muted:#9d8d75; --card:#211a14; --line:#332a20; } }
  *{box-sizing:border-box} body{margin:0;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
  .wrap{max-width:1100px;margin:0 auto;padding:32px 20px 80px}
  h1{margin:0 0 4px;font-size:26px} h2{margin:36px 0 12px;font-size:19px} h3{margin:0 0 8px;font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  .verdict{display:inline-block;padding:6px 14px;border-radius:999px;font-weight:700;color:#fff}
  .verdict.ok{background:var(--pass)} .verdict.bad{background:var(--fail)}
  .meta{color:var(--muted);margin-top:10px}
  .tiles{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}
  .tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px;min-width:110px}
  .tile .n{font-size:26px;font-weight:800} .tile .l{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
  .tableWrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
  table{border-collapse:collapse;width:100%;min-width:640px} th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)} td.dur{color:var(--muted);white-space:nowrap} td.badge{font-weight:700;text-transform:uppercase;font-size:12px}
  tr.s-pass td.badge{color:var(--pass)} tr.s-fail td.badge{color:var(--fail)} tr.s-warn td.badge{color:var(--warn)} tr.s-skip td.badge{color:var(--skip)}
  tr.s-fail{background:color-mix(in srgb,var(--fail) 8%,transparent)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px} .card ul{margin:0;padding-left:18px} .card li{margin:3px 0}
  .muted{color:var(--muted)} .big{font-size:32px;font-weight:800;margin:4px 0} code{font-family:ui-monospace,Menlo,monospace;font-size:.9em}
  a{color:inherit}
</style></head><body><div class="wrap">
  <h1>Lamplight — Application Validation</h1>
  <div><span class="verdict ${report.ok ? 'ok' : 'bad'}">${report.ok ? 'PASS' : 'FAIL'}</span></div>
  <div class="meta">${esc(report.finishedAt)} · ${fmtDuration(report.durationMs)} · selection <code>${esc(
		report.selection,
	)}</code> · capabilities: ${esc(report.capabilities.join(', ') || 'none')}</div>
  <div class="tiles">
    <div class="tile"><div class="n" style="color:var(--pass)">${report.counts.pass}</div><div class="l">passed</div></div>
    <div class="tile"><div class="n" style="color:var(--fail)">${report.counts.fail}</div><div class="l">failed</div></div>
    <div class="tile"><div class="n" style="color:var(--warn)">${report.counts.warn}</div><div class="l">warn</div></div>
    <div class="tile"><div class="n" style="color:var(--skip)">${report.counts.skip}</div><div class="l">skipped</div></div>
    <div class="tile"><div class="n">${report.results.length}</div><div class="l">checks</div></div>
  </div>
  <section><h2>Checks</h2><div class="tableWrap"><table>
    <thead><tr><th>Check</th><th>Status</th><th>Layer</th><th>Time</th><th>Detail</th><th></th></tr></thead>
    <tbody>${rowsHtml(report.results)}</tbody>
  </table></div></section>
  ${faHtml}
</div></body></html>`;
}

export function writeReports(
	report: RunReport,
	outDir: string,
): { html: string; md: string; json: string } {
	mkdirSync(outDir, { recursive: true });
	const html = path.join(outDir, 'index.html');
	const md = path.join(outDir, 'report.md');
	const json = path.join(outDir, 'report.json');
	writeFileSync(html, buildHtml(report));
	writeFileSync(md, buildMarkdown(report));
	writeFileSync(json, JSON.stringify(report, null, 2));
	return { html, md, json };
}
