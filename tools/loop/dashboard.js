const $ = (s) => document.querySelector(s);
const esc = (s) =>
	String(s ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
const ASTRA = 'gpt-6-astra',
	SPARK = 'gpt-5.3-codex-spark';
let ST = null,
	policyDirty = false,
	refreshing = false,
	pending = false,
	toastTimer;
const when = (t) =>
	t
		? new Date(t * 1000).toLocaleString([], {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
			})
		: 'unknown';
const ago = (t) =>
	!t
		? '—'
		: Math.max(0, Math.round((Date.now() / 1000 - t) / 60)) < 1
			? 'just now'
			: Math.round((Date.now() / 1000 - t) / 60) + 'm ago';
const num = (n) =>
	n == null
		? '—'
		: Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const label = (m) => ST?.model_catalog?.[m]?.label || m;
const empty = (text) => `<div class="empty">${esc(text)}</div>`;
const badge = (text, cls = '') => `<span class="badge ${cls}">${esc(text)}</span>`;
const options = (values, value, names = {}) =>
	values
		.map(
			(v) =>
				`<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(names[v] || v)}</option>`,
		)
		.join('');
const table = (headers, rows) =>
	`<table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
const action = (verb, arg, text, cls = '') =>
	`<button class="${cls}" data-cmd="${esc(verb)}" data-arg="${esc(arg)}">${esc(text)}</button>`;
function toast(message, error = false) {
	clearTimeout(toastTimer);
	$('#toast').textContent = message;
	$('#toast').hidden = false;
	toastTimer = setTimeout(() => ($('#toast').hidden = true), error ? 10000 : 4000);
}
async function command(verb, arg = '') {
	if (pending) {
		toast('A change is still being saved. Try again in a moment.', true);
		return false;
	}
	pending = true;
	try {
		const res = await fetch('/api/cmd', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ verb, arg }),
		});
		const data = await res.json();
		if (!res.ok || data.result !== 'ok') throw Error(data.result || 'Command failed');
		toast('Change saved.');
		return true;
	} catch (e) {
		toast(e.message, true);
		return false;
	} finally {
		pending = false;
	}
}
const pages = {
	overview: ['Keep the release moving.', 'Work, capacity, and the next handoff in one place.'],
	workers: ['The worker floor.', 'See what is running and choose what each worker can pick up.'],
	workboard: [
		'The release workboard.',
		'Follow dependencies, clear blockers, and direct the next pickup.',
	],
	activity: [
		'Every run leaves a record.',
		'Compare outcomes, inspect logs, and see where capacity goes.',
	],
	policy: ['Set the pace.', 'Routing, capacity, verification, and promotion rules for the loop.'],
};
function showView(view) {
	if (!pages[view]) return;
	document.querySelectorAll('.view').forEach((e) => (e.hidden = e.id !== 'view-' + view));
	document
		.querySelectorAll('nav [data-view]')
		.forEach((e) =>
			e.dataset.view === view
				? e.setAttribute('aria-current', 'page')
				: e.removeAttribute('aria-current'),
		);
	[$('#page-title').textContent, $('#page-subtitle').textContent] = pages[view];
	history.replaceState(null, '', '#' + view);
	window.scrollTo(0, 0);
}
function renderRelease(s) {
	$('#phase-gate').textContent =
		s.phase_limit == null ? 'No phase data' : 'Pickup through P' + s.phase_limit;
	$('#phases').innerHTML = ['P0', 'P1', 'P2', 'P3', 'P4']
		.map((phase, i) => {
			const rows = s.stories.filter((x) => x.phase === phase),
				done = rows.filter((x) => x.status === 'done').length;
			return `<div class="phase ${i <= s.phase_limit ? 'active' : ''}"><strong>${phase}</strong><small>${done} / ${rows.length} done</small></div>`;
		})
		.join('');
	$('#release-stats').innerHTML = [
		['Done', s.counts.done || 0],
		['In progress', s.counts.claimed || 0],
		['Open', s.counts.open || 0],
		['Blocked', s.counts.blocked || 0],
		['Skipped', s.counts.skipped || 0],
	]
		.map(([t, v]) => `<span><b>${v}</b>${t}</span>`)
		.join('');
	$('#branches').textContent = Object.entries(s.branches)
		.map(([b, sha]) => `${b} @ ${sha}`)
		.join(' → ');
	$('#integration-body').innerHTML =
		`<div class="row between"><p>${esc(s.ahead || 0)} commits ahead of ${esc(s.config.promote_to)}. Last promotion: ${esc(s.last_promote.result || 'none yet')}.</p><span class="small dim">${when(s.last_promote.at)}</span></div>${s.salvage.length ? `<details><summary>${s.salvage.length} preserved work branches</summary><pre>${esc(s.salvage.join('\n'))}</pre></details>` : ''}`;
}
function renderModels(s) {
	if ($('#models-body').contains(document.activeElement)) return;
	$('#models-body').className = '';
	const notes = {
		sonnet: 'General implementation and small stories.',
		opus: 'Complex implementation and broad changes.',
		fable: 'Optional Claude routing target.',
		haiku: 'Optional lightweight Claude target.',
		[ASTRA]: `Reasoning by task: ${Object.entries(s.config.codex.reasoning)
			.map(([k, v]) => k + ' ' + v)
			.join(', ')}.`,
		[SPARK]:
			'Small docs, tests, and text-verifiable code. Full weekly allowance; no visual or complex work.',
	};
	$('#models-body').innerHTML = Object.entries(s.model_catalog)
		.map(
			([m, meta]) =>
				`<div class="model-row"><div><strong>${esc(meta.label)}</strong><div class="small dim">${s.model_eligible[m] || 0} eligible now</div></div><p class="model-note">${esc(notes[m] || '')}</p><label class="switch"><input type="checkbox" data-model="${m}" ${s.config.models[m] ? 'checked' : ''} aria-label="Allow ${esc(meta.label)} pickup">${s.config.models[m] ? 'Enabled' : 'Disabled'}</label></div>`,
		)
		.join('');
}
function windowBar(title, w, ceiling) {
	const p = Math.max(0, Math.min(100, w.pct || 0));
	return `<div class="quota-window"><div class="row between"><span class="small">${esc(title)}</span><strong class="small">${p.toFixed(0)}% used</strong></div><div class="bar" role="progressbar" aria-label="${esc(title)} usage" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div><div class="small dim">Resets ${when(w.resets_at)} · pickup ceiling ${ceiling}%</div></div>`;
}
function renderUsage(s) {
	const cfg = s.config.usage,
		c = s.usage.claude || {},
		codex = s.usage.codex || {};
	let html = '';
	for (const pool of ['claude', 'codex', 'spark']) {
		const v = s.verdicts[pool],
			title = { claude: 'Claude', codex: 'Codex / Astra', spark: 'Spark' }[pool];
		const ws =
			pool === 'claude'
				? [
						['5-hour window', c.session],
						['Weekly', c.weekly],
						...Object.entries(c.scoped || {}),
					].filter(([, w]) => w)
				: Object.entries(codex.limits || {})
						.filter(([n]) =>
							pool === 'spark' ? /spark/i.test(n) : /codex/i.test(n) && !/spark/i.test(n),
						)
						.flatMap(([, ws]) =>
							ws.map((w) => [
								(w.window_min || 0) >= 10000
									? 'Weekly'
									: `${Math.round((w.window_min || 0) / 60)}-hour window`,
								w,
							]),
						);
		html += `<div class="quota"><div class="row between"><h3>${title}</h3>${badge(v.allowed_slots === 0 ? 'Pickup paused' : v.allowed_slots === 1 ? 'One worker' : 'Pickup available', v.allowed_slots === 0 ? 'warning' : 'good')}</div>`;
		html += ws.length
			? ws
					.map(([t, w]) =>
						windowBar(
							`${title} ${t}`,
							w,
							pool === 'spark'
								? (w.window_min || 0) >= 10000
									? s.config.spark.weekly_target_pct
									: s.config.spark.session_max_pct
								: pool === 'codex'
									? cfg.codex_max_pct
									: t === '5-hour window'
										? cfg.session_max_pct
										: cfg.weekly_max_pct,
						),
					)
					.join('')
			: `<p class="description">${esc(pool === 'claude' ? c.error || 'Allowance unavailable' : codex.error || 'No scoped allowance snapshot')}</p>`;
		if (v.reason) html += `<p class="description">${esc(v.reason)}</p>`;
		if (pool === 'spark') {
			const b = s.spark_budget;
			html += `<div class="budget-note">${b.known ? `${b.remaining_pct.toFixed(0)}% left to the ${b.target_pct}% weekly target. ${b.required_daily_pct}% per day needed before reset.${b.catch_up ? ' Catch-up capacity active.' : ''}` : 'Waiting for a verified weekly Spark allowance.'}<br>${b.suitable_ready} suitable stories ready.${!b.suitable_ready ? ' No suitable work to consume the remaining allowance.' : ''}</div>`;
		}
		html += '</div>';
	}
	$('#usage-body').className = '';
	$('#usage-body').innerHTML =
		html +
		`<p class="description">Polled ${ago(s.usage.at)}. Interactive sessions and other loops share these allowances.</p>`;
}
function renderWorkers(s) {
	if ($('#workers-body').contains(document.activeElement)) return;
	$('#workers-body').innerHTML = s.slots.length
		? s.slots
				.map((sl) => {
					const c = sl.cfg,
						hb = sl.hb || {},
						busy = ['working', 'verifying', 'preparing'].includes(hb.state),
						state = sl.alive ? hb.state || 'Starting' : 'Not running';
					const models = Object.keys(s.model_catalog).filter(
						(m) => ['auto', 'fake'].includes(c.backend) || s.model_catalog[m].backend === c.backend,
					);
					const effort =
						c.model === 'auto'
							? ['auto', 'low', 'medium', 'high', 'xhigh', 'max']
							: ['auto', ...(s.model_catalog[c.model]?.efforts || [])];
					return `<section class="panel worker ${busy ? 'busy' : ''}" aria-labelledby="worker-${sl.slot}"><div class="row between"><h2 id="worker-${sl.slot}">Worker ${sl.slot}</h2>${badge(state, busy ? 'good' : '')}</div><p class="description">${esc(hb.item || 'Waiting for a story')} ${hb.since ? ' / ' + ago(hb.since) : ''}</p><div class="worker-controls">
      <label class="field">Model family<select data-slot="${sl.slot}" data-key="backend">${options(['auto', 'claude', 'codex', 'fake'], c.backend, { auto: 'All enabled models', claude: 'Claude only', codex: 'Codex only', fake: 'Fake / dry run' })}</select></label>
      <label class="field">Model pin<select data-slot="${sl.slot}" data-key="model">${options(['auto', ...models], c.model, Object.fromEntries([['auto', 'Automatic'], ...models.map((m) => [m, label(m)])]))}</select></label>
      <label class="field">Reasoning<select data-slot="${sl.slot}" data-key="effort">${options(effort, c.effort)}</select></label>
      <label class="field">Story sizes<input data-slot="${sl.slot}" data-key="sizes" value="${esc((c.sizes || []).join(','))}" placeholder="S,M,L"></label>
      <label class="field">Lanes (blank = all)<input data-slot="${sl.slot}" data-key="lanes" value="${esc((c.lanes || []).join(','))}" placeholder="All lanes"></label>
    </div>${sl.stop_requested ? badge('Stopping after run', 'warning') : ''}${sl.idle?.reason ? `<p class="description">${esc(sl.idle.reason)}</p>` : ''}${hb.extra ? `<p class="description">${esc(hb.extra)}</p>` : ''}
    ${sl.live?.last_tool || sl.live?.last_text ? `<div class="live">${esc(sl.live.last_tool || '')}\n${esc(sl.live.last_text || '')}</div>` : ''}
    <div class="row">${action(c.enabled ? 'slot-disable' : 'slot-start', sl.slot, c.enabled ? 'Disable pickup' : 'Enable pickup')}${action('slot-stop', sl.slot, 'Stop after run')}${action('slot-kill', sl.slot, 'Kill run', 'danger')}${hb.log ? `<button data-log="${esc(hb.log)}" data-title="Worker ${sl.slot} log">View log</button>` : ''}</div></section>`;
				})
				.join('')
		: empty('No workers configured. Set an enabled worker count to add capacity.');
}
function renderQueue(s) {
	$('#queue-body').innerHTML = s.queue.length
		? table(
				['Story', 'Size', 'Phase', 'Work', 'Eligible models', 'Unblocks', 'Actions'],
				s.queue.map(
					(q) =>
						`<tr><td>${esc(q.id)}</td><td>${esc(q.size)}</td><td>${esc(q.phase)}</td><td class="wrap">${esc(q.title)}</td><td>${q.models?.length ? q.models.map((m) => esc(label(m))).join(', ') : 'No model available'}</td><td>${q.unlocks}</td><td>${action('pin', q.id, 'Pin next')}</td></tr>`,
				),
			)
		: empty('No stories are claimable. Check dependencies, phase gating, and lane controls.');
}
function renderStories(s) {
	const q = $('#f-q').value.toLowerCase(),
		status = $('#f-status').value,
		phase = $('#f-phase').value,
		lane = $('#f-lane').value.trim().toUpperCase(),
		ready = $('#f-ready').checked;
	const rows = s.stories.filter(
		(x) =>
			(!q || (x.id + ' ' + x.title).toLowerCase().includes(q)) &&
			(!status || x.status === status) &&
			(!phase || x.phase === phase) &&
			(!lane || x.lane === lane) &&
			(!ready || (x.status === 'open' && !x.unmet.length)),
	);
	$('#story-count').textContent = `${rows.length} of ${s.total} stories`;
	$('#stories-body').innerHTML = rows.length
		? table(
				['Story', 'Phase / size', 'Status', 'Work', 'Unmet dependencies', 'Attempts', 'Actions'],
				rows.map(
					(x) =>
						`<tr><td>${esc(x.id)}${x.pinned ? ' / pinned' : ''}${x.operator ? ' / operator' : ''}</td><td>${esc(x.phase)} / ${esc(x.size)}</td><td>${badge(x.status, x.status === 'done' ? 'good' : ['blocked', 'skipped'].includes(x.status) ? 'warning' : '')}${x.claim ? `<div class="small dim">Worker ${x.claim.slot}${x.claim.model ? ' / ' + esc(label(x.claim.model)) : ''}</div>` : ''}</td><td class="wrap">${esc(x.title)}${[
							x.partial,
							x.skip_reason,
							x.note,
						]
							.filter(Boolean)
							.map((t) => `<p class="description">${esc(t)}</p>`)
							.join(
								'',
							)}</td><td class="wrap small">${esc(x.unmet.join(', ') || 'None')}</td><td>${x.attempts} / ${x.failures || 0} failed</td><td><div class="row">${action(x.pinned ? 'unpin' : 'pin', x.id, x.pinned ? 'Unpin' : 'Pin')}${['skipped', 'blocked'].includes(x.status) ? action('unskip', x.id, 'Reopen') : x.status === 'open' ? action('skip', x.id + ' dashboard', 'Skip') + action('set-status', x.id + ' done operator', 'Mark done') + action('set-status', x.id + ' blocked operator', 'Block') : x.status === 'claimed' ? action('release', x.id, 'Release claim') : action('set-status', x.id + ' open reopened', 'Reopen')}</div></td></tr>`,
				),
			)
		: empty('No stories match these filters. Clear a filter to see more work.');
}
function renderActivity(s) {
	$('#metrics-body').innerHTML = Object.keys(s.metrics).length
		? table(
				[
					'Group',
					'Runs',
					'Landed',
					'Points',
					'Tokens / point',
					'Output / point',
					'Cost / point',
					'Land rate',
					'Min / run',
				],
				Object.entries(s.metrics)
					.sort()
					.map(
						([name, m]) =>
							`<tr><td>${esc(name)}</td><td>${m.runs}</td><td>${m.landed}</td><td>${m.fp}</td><td>${num(m.tokens_per_fp)}</td><td>${num(m.out_tokens_per_fp)}</td><td>${m.cost_per_fp ?? '—'}</td><td>${m.land_rate ?? '—'}</td><td>${m.runs ? Math.round(m.seconds / m.runs / 60) : '—'}</td></tr>`,
					),
			)
		: empty('Efficiency appears after the first completed run.');
	$('#runs-body').innerHTML = s.runs.length
		? table(
				[
					'When',
					'Worker / story',
					'Model / reasoning',
					'Outcome',
					'Minutes',
					'Tokens / output',
					'Cost',
					'Attempts / fixes',
					'Commit / note',
				],
				[...s.runs]
					.reverse()
					.map(
						(x) =>
							`<tr><td>${when(x.at)}</td><td>${x.slot} / ${esc(x.id)}</td><td>${esc(label(x.model))}<div class="small dim">${esc(x.effort || '')}</div></td><td>${badge(x.outcome, x.outcome === 'landed' ? 'good' : 'warning')}</td><td>${Math.round((x.seconds || 0) / 60)}</td><td>${num(x.tokens_total)} / ${num(x.tokens_out)}</td><td>${x.cost_usd ? '$' + x.cost_usd.toFixed(2) : '—'}</td><td>${x.attempts || 0} / ${x.fix_rounds || 0}${x.limit_waits ? ' / ' + x.limit_waits + ' limit waits' : ''}</td><td class="wrap">${esc(x.commit || '')}<div class="small dim">${esc(x.note || '')}</div></td></tr>`,
					),
			)
		: empty('No runs recorded yet. Enable workers to start picking up stories.');
	$('#events-body').textContent = s.events.length
		? [...s.events].reverse().join('\n')
		: 'No events recorded yet.';
}
function inputField(text, path, value, type = 'number', extra = '') {
	return `<label class="field">${esc(text)}<input type="${type}" data-path="${path}" ${type === 'checkbox' ? (value ? 'checked' : '') : `value="${esc(value)}"`} ${extra}></label>`;
}
function selectField(text, path, value, values, names = {}) {
	return `<label class="field">${esc(text)}<select data-path="${path}">${options(values, value, names)}</select></label>`;
}
function fieldset(title, content) {
	return `<fieldset><legend>${title}</legend><div class="settings-grid">${content}</div></fieldset>`;
}
function renderPolicy(s) {
	if (policyDirty || $('#policy-form').contains(document.activeElement)) return;
	const c = s.config,
		efforts = s.model_catalog[ASTRA].efforts;
	let h = fieldset(
		'Astra reasoning',
		Object.entries(c.codex.reasoning)
			.map(([key, v]) =>
				selectField(
					key === 'retry'
						? 'Retries / difficult recovery'
						: key === 'docs'
							? 'Documentation'
							: `${key} stories`,
					`codex.reasoning.${key}`,
					v,
					efforts,
				),
			)
			.join('') +
			selectField('Override all Astra reasoning', 'codex.effort', c.codex.effort, [
				'auto',
				...efforts,
			]),
	);
	h += fieldset(
		'Spark weekly consumption',
		`<p class="description full">Target the full weekly allowance with small, testable work. Extra workers can pick up suitable tasks when usage is behind pace or reset is less than a day away.</p>` +
			inputField(
				'Weekly target (%)',
				'spark.weekly_target_pct',
				c.spark.weekly_target_pct,
				'number',
				'min="1" max="100"',
			) +
			inputField(
				'Short window ceiling (%)',
				'spark.session_max_pct',
				c.spark.session_max_pct,
				'number',
				'min="1" max="100"',
			) +
			inputField(
				'Catch-up worker cap',
				'spark.max_slots',
				c.spark.max_slots,
				'number',
				'min="1" max="12"',
			) +
			selectField('Reasoning', 'spark.effort', c.spark.effort, s.model_catalog[SPARK].efforts) +
			inputField(
				'Maximum owned paths',
				'spark.max_owns',
				c.spark.max_owns,
				'number',
				'min="1" max="8"',
			) +
			inputField(
				'Maximum brief characters',
				'spark.max_prompt_chars',
				c.spark.max_prompt_chars,
				'number',
				'min="1000" max="32000"',
			) +
			`<div class="row full">${['docs', 'tests', 'code'].map((k) => `<label><input type="checkbox" data-specialty="${k}" ${c.spark.specialties.includes(k) ? 'checked' : ''}>${{ docs: 'Documentation', tests: 'Tests & fixtures', code: 'Localized code' }[k]}</label>`).join('')}</div>`,
	);
	h += fieldset(
		'Claude routing',
		Object.entries(c.routing)
			.map(
				([sz, r]) =>
					selectField(`${sz} model`, `routing.${sz}.model`, r.model, [
						'sonnet',
						'opus',
						'fable',
						'haiku',
					]) +
					selectField(`${sz} reasoning`, `routing.${sz}.effort`, r.effort, [
						'low',
						'medium',
						'high',
						'max',
					]),
			)
			.join(''),
	);
	h += fieldset(
		'Queue & phases',
		selectField('Phase mode', 'phase.mode', c.phase.mode, ['gated', 'soft']) +
			selectField('Highest phase', 'phase.max', c.phase.max, ['P0', 'P1', 'P2', 'P3', 'P4']) +
			inputField(
				'Unlock threshold (%)',
				'phase.unlock_pct',
				c.phase.unlock_pct,
				'number',
				'min="0" max="100"',
			) +
			inputField('Workers per lane', 'max_per_lane', c.max_per_lane, 'number', 'min="1" max="12"') +
			inputField(
				'Small stories per batch (general models)',
				'batch_small',
				c.batch_small,
				'number',
				'min="1" max="8"',
			) +
			inputField(
				'Give up after failures',
				'give_up_after',
				c.give_up_after,
				'number',
				'min="1" max="20"',
			) +
			inputField(
				'Lane priority (comma separated)',
				'lane_priority',
				c.lane_priority.join(','),
				'text',
			) +
			`<div class="row full">${c.lane_priority.map((l) => `<label><input type="checkbox" data-lane="${l}" ${c.lanes_disabled.includes(l) ? '' : 'checked'}>${l}</label>`).join('')}</div>`,
	);
	h += fieldset(
		'General plan headroom',
		Object.entries({
			session_soft_pct: 'Claude 5h soft (%)',
			session_max_pct: 'Claude 5h ceiling (%)',
			weekly_soft_pct: 'Claude weekly soft (%)',
			weekly_max_pct: 'Claude weekly ceiling (%)',
			codex_max_pct: 'Codex / Astra ceiling (%)',
			pace_slack_pct: 'Claude pacing slack (%)',
			poll_s: 'Allowance polling (seconds)',
		})
			.map(([k, t]) =>
				inputField(
					t,
					'usage.' + k,
					c.usage[k],
					'number',
					k === 'poll_s' ? 'min="30"' : 'min="0" max="100"',
				),
			)
			.join('') + inputField('Pace Claude weekly usage', 'usage.pace', c.usage.pace, 'checkbox'),
	);
	h += fieldset(
		'Verification & promotion',
		inputField(
			'Promotion interval (seconds)',
			'promote_interval_s',
			c.promote_interval_s,
			'number',
			'min="60"',
		) +
			selectField('Promotion gate', 'promote_gate', c.promote_gate, ['e2e', 'build', 'none']) +
			inputField('Build for sizes', 'gates.build_for', c.gates.build_for.join(','), 'text') +
			inputField('Run feature audit', 'gates.feature_audit', c.gates.feature_audit, 'checkbox') +
			inputField(
				'Run named end-to-end specs',
				'gates.e2e_named_specs',
				c.gates.e2e_named_specs,
				'checkbox',
			) +
			selectField('MCP definitions', 'mcp', c.mcp, ['none', 'inherit']),
	);
	h += fieldset(
		'Machine capacity',
		Object.entries({
			heavy_jobs: 'Concurrent verification jobs',
			test_workers: 'Test workers per run',
			pw_workers: 'Browser workers per run',
			promote_pw_workers: 'Promotion browser workers',
			nice: 'Runner priority (nice)',
		})
			.map(([k, t]) =>
				inputField(
					t,
					'resources.' + k,
					c.resources[k],
					'number',
					k === 'nice' ? 'min="0" max="19"' : 'min="1" max="32"',
				),
			)
			.join(''),
	);
	$('#policy-body').innerHTML = h;
	$('#policy-status').textContent = 'Saved policy. Changes apply at the next pickup.';
}
function render(s) {
	ST = s;
	$('#state-pill').textContent = s.stopping
		? 'Stopping'
		: s.paused
			? 'Paused'
			: s.supervisor.pid
				? 'Running'
				: 'No supervisor';
	$('#state-pill').className =
		'badge ' + (s.stopping || s.paused ? 'warning' : s.supervisor.pid ? 'good' : '');
	$('#connection').textContent = 'Updated ' + new Date().toLocaleTimeString();
	$('#pause').textContent = s.paused ? 'Resume pickup' : 'Pause pickup';
	$('#stop').textContent = s.stopping ? 'Clear stop' : 'Stop after runs';
	$('#nav-workers').textContent = s.slots.filter((x) => x.alive).length;
	$('#nav-stories').textContent = s.counts.open || 0;
	if (document.activeElement !== $('#scale'))
		$('#scale').value = s.config.slots.filter((x) => x.enabled).length;
	$('#banner').hidden = !s.roadmap_error;
	$('#banner').textContent = s.roadmap_error || '';
	renderRelease(s);
	renderModels(s);
	renderUsage(s);
	renderWorkers(s);
	renderQueue(s);
	renderStories(s);
	renderActivity(s);
	renderPolicy(s);
}
async function refresh(fresh = false) {
	if (refreshing || pending) return;
	refreshing = true;
	try {
		const res = await fetch('/api/state' + (fresh ? '?fresh=1' : ''));
		if (!res.ok) throw Error('HTTP ' + res.status);
		render(await res.json());
	} catch {
		$('#connection').textContent = 'Disconnected';
		$('#banner').hidden = false;
		$('#banner').textContent =
			'Cannot reach the loop. Showing the last snapshot; controls will report any failed changes. Use Refresh to retry.';
	} finally {
		refreshing = false;
	}
}
async function showLog(path, title) {
	$('#log-title').textContent = title;
	$('#log-body').textContent = 'Loading log…';
	$('#log-dialog').showModal();
	try {
		const res = await fetch('/api/log?path=' + encodeURIComponent(path) + '&bytes=80000');
		if (!res.ok) throw Error('Log unavailable (HTTP ' + res.status + ')');
		$('#log-body').textContent = await res.text();
		$('#log-body').scrollTop = 1e9;
	} catch (e) {
		$('#log-body').textContent = e.message;
	}
}
document.addEventListener('click', async (e) => {
	const view = e.target.closest('[data-view]');
	if (view) {
		showView(view.dataset.view);
		return;
	}
	const log = e.target.closest('[data-log]');
	if (log) {
		await showLog(log.dataset.log, log.dataset.title || 'Worker log');
		return;
	}
	const b = e.target.closest('[data-cmd]');
	if (!b) return;
	if (
		b.dataset.cmd === 'slot-kill' &&
		!confirm('Kill this run now? The worker will preserve unfinished work on its next start.')
	)
		return;
	b.disabled = true;
	await command(b.dataset.cmd, b.dataset.arg || '');
	b.disabled = false;
	await refresh();
});
document.addEventListener('change', async (e) => {
	const el = e.target;
	if (el.dataset.model) {
		el.disabled = true;
		await command(el.checked ? 'model-enable' : 'model-disable', el.dataset.model);
		el.disabled = false;
		el.blur();
		await refresh();
	}
	if (el.dataset.slot) {
		const v = ['sizes', 'lanes'].includes(el.dataset.key)
			? el.value
					.split(',')
					.map((x) => x.trim())
					.filter(Boolean)
			: el.value;
		const patch = { slot: Number(el.dataset.slot), [el.dataset.key]: v };
		if (el.dataset.key === 'backend') {
			patch.model = 'auto';
			patch.effort = 'auto';
		}
		if (el.dataset.key === 'model') patch.effort = 'auto';
		el.disabled = true;
		await command('slot-set', JSON.stringify(patch));
		el.disabled = false;
		el.blur();
		await refresh();
	}
});
$('#policy-form').addEventListener('input', () => {
	policyDirty = true;
	$('#policy-status').textContent = 'Unsaved changes. Save policy to apply.';
});
$('#policy-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	const patch = {};
	$('#policy-form')
		.querySelectorAll('[data-path]')
		.forEach((el) => {
			const path = el.dataset.path.split('.');
			let obj = patch;
			path.slice(0, -1).forEach((k) => (obj = obj[k] ??= {}));
			obj[path.at(-1)] =
				el.type === 'checkbox'
					? el.checked
					: el.type === 'number'
						? Number(el.value)
						: ['lane_priority', 'gates.build_for'].includes(el.dataset.path)
							? el.value
									.split(',')
									.map((x) => x.trim())
									.filter(Boolean)
							: el.value;
		});
	patch.spark.specialties = [...document.querySelectorAll('[data-specialty]:checked')].map(
		(e) => e.dataset.specialty,
	);
	patch.lanes_disabled = [...document.querySelectorAll('[data-lane]:not(:checked)')].map(
		(e) => e.dataset.lane,
	);
	const b = e.submitter;
	b.disabled = true;
	if (await command('config', JSON.stringify(patch))) {
		policyDirty = false;
		$('#policy-status').textContent = 'Policy saved.';
	}
	b.disabled = false;
	await refresh();
});
$('#policy-discard').onclick = () => {
	policyDirty = false;
	document.activeElement.blur();
	if (ST) renderPolicy(ST);
};
$('#pause').onclick = async () => {
	if (ST) {
		await command(ST.paused ? 'unpause' : 'pause');
		await refresh();
	}
};
$('#stop').onclick = async () => {
	if (ST) {
		await command(ST.stopping ? 'unstop' : 'stop');
		await refresh();
	}
};
$('#scale-save').onclick = async () => {
	if ($('#scale').reportValidity()) {
		await command('scale', $('#scale').value);
		await refresh();
	}
};
$('#refresh').onclick = () => refresh();
$('#usage-refresh').onclick = () => refresh(true);
$('#log-close').onclick = () => $('#log-dialog').close();
['#f-q', '#f-status', '#f-phase', '#f-lane', '#f-ready'].forEach((id) =>
	$(id).addEventListener('input', () => ST && renderStories(ST)),
);
let theme;
try {
	theme = localStorage.getItem('loop-theme');
} catch {}
function setTheme(t) {
	document.documentElement.dataset.theme = t;
	$('#theme').textContent = t === 'dark' ? 'Light theme' : 'Dark theme';
}
setTheme(theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#theme').onclick = () => {
	const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
	setTheme(t);
	try {
		localStorage.setItem('loop-theme', t);
	} catch {}
};
showView(location.hash.slice(1) || 'overview');
refresh();
setInterval(() => {
	if (!document.hidden) refresh();
}, 5000);
