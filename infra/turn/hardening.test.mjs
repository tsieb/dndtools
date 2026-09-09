import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import tls from 'node:tls';
import { promisify } from 'node:util';
import YAML from 'yaml';
import {
	assertTlsCandidate,
	checkCertificate,
	credentialSource,
	tlsServers,
} from './verify-tls.mjs';

const document = YAML.parseDocument(
	fs.readFileSync(new URL('./template.yaml', import.meta.url), 'utf8'),
);
const template = document.toJS();
const substitutions = {
	...Object.fromEntries(
		Object.entries(template.Parameters).map(([key, value]) => [key, value.Default]),
	),
	TurnSharedSecret: 'arn:aws:secretsmanager:ca-central-1:123456789012:secret:test',
	TurnEip: '198.51.100.10',
	'AWS::Region': 'ca-central-1',
};
const userData = (overrides = {}) =>
	template.Resources.TurnInstance.Properties.UserData['Fn::Base64'].replace(
		/\$\{([^}]+)\}/g,
		(_, key) => {
			const value = { ...substitutions, ...overrides }[key];
			assert.notEqual(value, undefined, `unresolved CloudFormation substitution: ${key}`);
			return String(value);
		},
	);

function embeddedScript(name, delimiter, overrides = {}) {
	const data = userData(overrides);
	const start = `cat > /usr/local/bin/${name} <<'${delimiter}'\n`;
	assert.ok(data.includes(start), `missing ${name}`);
	return data.split(start)[1].split(`\n${delimiter}\n`)[0] + '\n';
}

function fixture(t) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dndtools-turn-test-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const config = path.join(root, 'coturn');
	const bin = path.join(root, 'bin');
	fs.mkdirSync(config);
	fs.mkdirSync(bin);
	const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TURN_TEST_ROOT: root };
	return { root, config, bin, env };
}

function secretFixture(t) {
	const f = fixture(t);
	fs.writeFileSync(
		path.join(f.config, 'turnserver.base.conf'),
		'realm=test\nuse-auth-secret\nno-cli\n',
	);
	const script = path.join(f.root, 'refresh.py');
	fs.writeFileSync(
		script,
		embeddedScript('dndtools-turn-refresh-secret', 'PYTHON').replaceAll('/etc/coturn', f.config),
	);
	fs.writeFileSync(
		path.join(f.bin, 'aws'),
		`#!/usr/bin/python3
import json, os, sys
data = json.load(open(os.environ['TURN_TEST_ROOT'] + '/versions.json'))
stage = sys.argv[sys.argv.index('--version-stage') + 1]
if stage not in data:
    print('sensitive diagnostic must be suppressed', file=sys.stderr)
    sys.exit(1)
print(json.dumps({'secret': data[stage]}))
`,
		{ mode: 0o755 },
	);
	return {
		...f,
		versions: (values) =>
			fs.writeFileSync(path.join(f.root, 'versions.json'), JSON.stringify(values)),
		run: (...args) =>
			spawnSync('python3', [script, ...args], { env: f.env, encoding: 'utf8', timeout: 10000 }),
		read: () => fs.readFileSync(path.join(f.config, 'turnserver.conf'), 'utf8'),
	};
}

const oldSecret = 'A'.repeat(48);
const nextSecret = 'B'.repeat(48);

test('CloudFormation rules require a complete TLS identity and reserve HTTP-01 port 80', () => {
	function evaluate(node, parameters) {
		if (YAML.isScalar(node)) return node.tag === '!Ref' ? parameters[node.value] : node.value;
		const values = node.items.map((item) => evaluate(item, parameters));
		switch (node.tag) {
			case '!Equals':
				return String(values[0]) === String(values[1]);
			case '!And':
				return values.every(Boolean);
			case '!Or':
				return values.some(Boolean);
			case '!Not':
				return !values[0];
			default:
				throw new Error(`Unknown rule intrinsic ${node.tag}`);
		}
	}
	const assertions = document.getIn(['Rules', 'TlsIdentity', 'Assertions'], true).items;
	const allowed = (parameters) =>
		assertions.every((assertion) =>
			evaluate(assertion.get('Assert', true), { ...substitutions, ...parameters }),
		);
	const identity = { TurnDomainName: 'turn.example.com', AcmeEmail: 'ops@example.com' };
	assert.ok(allowed({}));
	assert.ok(allowed(identity));
	assert.ok(allowed({ ...identity, PublishTlsUri: 'true', TlsListeningPort: 443 }));
	for (const parameters of [
		{ TurnDomainName: 'turn.example.com' },
		{ AcmeEmail: 'ops@example.com' },
		{ PublishTlsUri: 'true' },
		{ ...identity, ListeningPort: 80 },
		{ ...identity, TlsListeningPort: 80 },
		{ ...identity, TlsListeningPort: 3478 },
	])
		assert.equal(allowed(parameters), false);
});

test('rendered bootstrap and host scripts are valid shell and fit EC2 user data', () => {
	assert.deepEqual(document.errors, []);
	for (const overrides of [
		{},
		{ TurnDomainName: 'turn.example.com', AcmeEmail: 'ops@example.com', PublishTlsUri: 'true' },
	]) {
		const data = userData(overrides);
		assert.ok(Buffer.byteLength(data) < 16384);
		const shell = spawnSync('bash', ['-n'], { input: data, encoding: 'utf8', timeout: 10000 });
		assert.equal(shell.status, 0, shell.stderr);
		for (const name of ['dndtools-turn-certificate', 'dndtools-turn-health']) {
			const result = spawnSync('bash', ['-n'], {
				input: embeddedScript(name, 'SCRIPT', overrides),
				encoding: 'utf8',
				timeout: 10000,
			});
			assert.equal(result.status, 0, result.stderr);
		}
	}
});

test('secret rotation preloads, promotes with overlap, and retires the old key atomically', (t) => {
	const f = secretFixture(t);
	f.versions({ AWSCURRENT: oldSecret, AWSPENDING: nextSecret });
	assert.equal(f.run().status, 0);
	assert.ok(f.read().includes(`static-auth-secret=${oldSecret}\n`));
	assert.ok(!f.read().includes(nextSecret));
	const overlap = f.run('AWSPENDING');
	assert.equal(overlap.status, 0);
	assert.ok(f.read().includes(oldSecret) && f.read().includes(nextSecret));
	assert.equal(fs.statSync(path.join(f.config, 'turnserver.conf')).mode & 0o777, 0o600);
	const inode = fs.statSync(path.join(f.config, 'turnserver.conf')).ino;
	f.versions({ AWSCURRENT: nextSecret, AWSPREVIOUS: oldSecret });
	assert.equal(f.run('AWSPREVIOUS').status, 0);
	assert.equal(
		fs.statSync(path.join(f.config, 'turnserver.conf')).ino,
		inode,
		'promotion keeps byte-identical overlap',
	);
	assert.equal(f.run().status, 0);
	assert.ok(!f.read().includes(oldSecret));
	assert.ok(f.read().includes(nextSecret));
	assert.ok(f.read().includes('use-auth-secret\nno-cli\n'));
	assert.ok(!overlap.stdout.includes(oldSecret) && !overlap.stdout.includes(nextSecret));
});

test('unavailable, malformed, weak and injectable secrets preserve the last working config', (t) => {
	const f = secretFixture(t);
	f.versions({ AWSCURRENT: oldSecret });
	assert.equal(f.run().status, 0);
	const previous = f.read();
	const missing = f.run('AWSPENDING');
	assert.notEqual(missing.status, 0);
	assert.ok(!missing.stderr.includes('sensitive diagnostic'));
	assert.equal(f.read(), previous);
	for (const secret of [null, 123, '', 'short', `${nextSecret}\nno-auth`, nextSecret + '\n']) {
		f.versions({ AWSCURRENT: oldSecret, AWSPENDING: secret });
		const result = f.run('AWSPENDING');
		assert.notEqual(result.status, 0);
		assert.equal(f.read(), previous);
		assert.ok(!result.stderr.includes(nextSecret));
	}
	assert.notEqual(f.run('AWSCURRENT', 'AWSPREVIOUS').status, 0);
	assert.equal(f.read(), previous);
	assert.ok(!fs.readdirSync(f.config).some((name) => name.startsWith('.secret-')));
});

test('failed initial secret retrieval never creates an unauthenticated server config', (t) => {
	const f = secretFixture(t);
	f.versions({});
	assert.notEqual(f.run().status, 0);
	assert.ok(!fs.existsSync(path.join(f.config, 'turnserver.conf')));
});

function certificateFixture(t) {
	const f = fixture(t);
	const certificate = path.join(f.root, 'letsencrypt/live/turn.example.com/fullchain.pem');
	fs.mkdirSync(path.dirname(certificate), { recursive: true });
	fs.writeFileSync(certificate, 'old certificate');
	f.env.TURN_TEST_CERT = certificate;
	const script = path.join(f.root, 'certificate.sh');
	fs.writeFileSync(
		script,
		embeddedScript('dndtools-turn-certificate', 'SCRIPT', {
			TurnDomainName: 'turn.example.com',
			AcmeEmail: 'ops@example.com',
		})
			.replaceAll('/etc/coturn', f.config)
			.replaceAll('/etc/letsencrypt', path.join(f.root, 'letsencrypt'))
			.replaceAll('/run/dndtools-turn-certificate.lock', path.join(f.root, 'certificate.lock')),
	);
	fs.writeFileSync(
		path.join(f.bin, 'docker'),
		`#!/bin/bash
set -eu
echo "$1" >> "$TURN_TEST_ROOT/docker.calls"
if [ "$1" = run ]; then
  [ "\${TURN_TEST_ACME_FAIL:-0}" = 0 ] || exit 1
  [ "\${TURN_TEST_RENEW:-0}" = 0 ] || printf 'new certificate' > "$TURN_TEST_CERT"
fi
if [ "$1" = inspect ] && [ "\${2:-}" = -f ]; then echo true; fi
`,
		{ mode: 0o755 },
	);
	fs.writeFileSync(
		path.join(f.bin, 'openssl'),
		`#!/bin/bash
set -eu
if [ "$1" = x509 ] && [ "\${TURN_TEST_CERT_EXPIRING:-0}" = 1 ]; then exit 1; fi
if [ "$1" = s_client ]; then
  echo attempt >> "$TURN_TEST_ROOT/tls.calls"
  [ "\${TURN_TEST_TLS_FAIL:-0}" = 0 ] || exit 1
  if [ "\${TURN_TEST_TLS_RETRY:-0}" = 1 ] && [ "$(wc -l < "$TURN_TEST_ROOT/tls.calls")" -eq 1 ]; then exit 1; fi
fi
`,
		{ mode: 0o755 },
	);
	fs.writeFileSync(path.join(f.bin, 'sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
	const fingerprint = createHash('sha256').update('old certificate').digest('hex');
	const marker = path.join(f.config, 'certificate.applied');
	fs.writeFileSync(marker, `${fingerprint}\n`);
	return {
		...f,
		marker,
		fingerprint,
		run: (env = {}, mode = 'renew') =>
			spawnSync('bash', [script, mode], {
				env: { ...f.env, ...env },
				encoding: 'utf8',
				timeout: 10000,
			}),
		calls: () => fs.readFileSync(path.join(f.root, 'docker.calls'), 'utf8').trim().split('\n'),
	};
}

test('certificate renewal restarts only for changed material and records successful TLS application', (t) => {
	const f = certificateFixture(t);
	assert.equal(f.run().status, 0);
	assert.deepEqual(f.calls(), ['run']);
	assert.equal(f.run({ TURN_TEST_RENEW: '1' }).status, 0);
	assert.deepEqual(f.calls(), ['run', 'run', 'inspect', 'restart']);
	assert.equal(
		fs.readFileSync(f.marker, 'utf8').trim(),
		createHash('sha256').update('new certificate').digest('hex'),
	);
});

test('legacy-host bootstrap issues without restarting old mounts, then records the new TLS container', (t) => {
	const f = certificateFixture(t);
	assert.equal(f.run({ TURN_TEST_RENEW: '1' }, 'issue').status, 0);
	assert.deepEqual(f.calls(), ['run'], 'the old container must not be inspected or restarted');
	assert.equal(fs.readFileSync(f.marker, 'utf8').trim(), f.fingerprint);
	assert.equal(f.run({}, 'record').status, 0);
	assert.deepEqual(f.calls(), ['run', 'inspect']);
	assert.notEqual(fs.readFileSync(f.marker, 'utf8').trim(), f.fingerprint);
	const bootstrap = userData({ TurnDomainName: 'turn.example.com', AcmeEmail: 'ops@example.com' });
	const issue = bootstrap.indexOf('timeout 300 /usr/local/bin/dndtools-turn-certificate issue');
	const create = bootstrap.indexOf('docker run -d --name coturn');
	const record = bootstrap.indexOf('/usr/local/bin/dndtools-turn-certificate record');
	const timer = bootstrap.indexOf('systemctl enable --now dndtools-turn-certificate.timer');
	assert.ok(issue < create && create < record && record < timer);
});

test('failed ACME renewal or TLS application never records success', (t) => {
	const f = certificateFixture(t);
	assert.notEqual(f.run({ TURN_TEST_ACME_FAIL: '1' }).status, 0);
	assert.deepEqual(f.calls(), ['run']);
	assert.equal(fs.readFileSync(f.marker, 'utf8').trim(), f.fingerprint);
	assert.notEqual(f.run({ TURN_TEST_RENEW: '1', TURN_TEST_TLS_FAIL: '1' }).status, 0);
	assert.ok(f.calls().includes('restart'));
	assert.equal(
		fs.readFileSync(path.join(f.root, 'tls.calls'), 'utf8').trim().split('\n').length,
		10,
	);
	assert.equal(fs.readFileSync(f.marker, 'utf8').trim(), f.fingerprint);
});

test('certificate application waits for a starting TLS listener before recording success', (t) => {
	const f = certificateFixture(t);
	assert.equal(f.run({ TURN_TEST_RENEW: '1', TURN_TEST_TLS_RETRY: '1' }).status, 0);
	assert.equal(
		fs.readFileSync(path.join(f.root, 'tls.calls'), 'utf8').trim().split('\n').length,
		2,
	);
	assert.notEqual(fs.readFileSync(f.marker, 'utf8').trim(), f.fingerprint);
});

test('health fails for expiring or unapplied certificates even when both legacy sockets listen', (t) => {
	const f = certificateFixture(t);
	fs.writeFileSync(
		path.join(f.bin, 'ss'),
		'#!/bin/bash\necho "STATE 0 0 0.0.0.0:3478 0.0.0.0:*"\n',
		{ mode: 0o755 },
	);
	fs.writeFileSync(
		path.join(f.bin, 'aws'),
		'#!/bin/bash\nprintf "%s\\n" "$@" > "$TURN_TEST_ROOT/metric"\n',
		{ mode: 0o755 },
	);
	const script = path.join(f.root, 'health.sh');
	fs.writeFileSync(
		script,
		embeddedScript('dndtools-turn-health', 'SCRIPT', {
			TurnDomainName: 'turn.example.com',
			AcmeEmail: 'ops@example.com',
		})
			.replaceAll('/etc/coturn', f.config)
			.replaceAll('/etc/letsencrypt', path.join(f.root, 'letsencrypt')),
	);
	const healthy = (env = {}) => {
		const result = spawnSync('bash', [script], { env: { ...f.env, ...env }, timeout: 10000 });
		assert.equal(result.status, 0);
		return fs.readFileSync(path.join(f.root, 'metric'), 'utf8').includes('Value=1,Unit=Count');
	};
	assert.equal(healthy(), true);
	assert.equal(healthy({ TURN_TEST_CERT_EXPIRING: '1' }), false);
	fs.writeFileSync(f.marker, 'old unapplied fingerprint\n');
	assert.equal(healthy(), false);
});

const relay = { username: 'test-expiry:probe', credential: 'test-derived-credential' };
test('credential sources are explicit so a stale file cannot bypass the signaling minter', () => {
	assert.equal(credentialSource({ TURN_CREDENTIALS_FILE: '/private/probe.json' }), 'file');
	assert.equal(credentialSource({ WS_URL: 'wss://example.com', TOKEN: 'fixture' }), 'signaling');
	assert.equal(credentialSource({}), 'signaling');
	assert.throws(() =>
		credentialSource({ TURN_CREDENTIALS_FILE: '/private/probe.json', TOKEN: 'fixture' }),
	);
	assert.throws(() =>
		credentialSource({ TURN_CREDENTIALS_FILE: '/private/probe.json', WS_URL: 'wss://example.com' }),
	);
});

test('TLS probe removes plaintext fallback and rejects invalid TLS URLs or missing credentials', () => {
	const url = 'turns:turn.example.com:5349';
	assert.deepEqual(
		tlsServers([
			{ urls: 'stun:stun.example.com' },
			{ ...relay, urls: ['turn:turn.example.com:3478?transport=udp', url] },
		]),
		[{ ...relay, urls: `${url}?transport=tcp` }],
	);
	for (const invalid of [
		'turn:turn.example.com:3478',
		`${url}?transport=udp`,
		'turns:127.0.0.1:5349',
		'turns:localhost:5349',
		'turns:turn.example.com:0',
		'turns:turn.example.com:65536',
		`${url}?transport=tcp&fallback=udp`,
		'turns:turn..example.com:5349',
		'turns:-turn.example.com:5349',
	]) {
		assert.throws(() => tlsServers([{ ...relay, urls: invalid }]));
	}
	assert.throws(() => tlsServers([{ urls: url }]));
	assert.throws(() => tlsServers(null));
});

test('relay assertions reject direct, TCP-only, missing or different selected paths', () => {
	const url = 'turns:turn.example.com:5349?transport=tcp';
	const candidate = { candidateType: 'relay', relayProtocol: 'tls', url };
	assert.doesNotThrow(() => assertTlsCandidate(candidate, url));
	for (const invalid of [
		null,
		{ ...candidate, candidateType: 'host' },
		{ ...candidate, relayProtocol: 'tcp' },
		{ ...candidate, url: 'turn:turn.example.com:3478?transport=tcp' },
	]) {
		assert.throws(() => assertTlsCandidate(invalid, url));
	}
});

test(
	'TLS identity check rejects untrusted certificates and verifies trusted hostname matches',
	{ timeout: 15000 },
	async (t) => {
		const f = fixture(t);
		const key = path.join(f.root, 'key.pem');
		const cert = path.join(f.root, 'cert.pem');
		const generated = spawnSync(
			'openssl',
			[
				'req',
				'-x509',
				'-newkey',
				'ec',
				'-pkeyopt',
				'ec_paramgen_curve:prime256v1',
				'-nodes',
				'-keyout',
				key,
				'-out',
				cert,
				'-days',
				'1',
				'-subj',
				'/CN=localhost',
				'-addext',
				'subjectAltName=DNS:localhost',
			],
			{ encoding: 'utf8', timeout: 10000 },
		);
		assert.equal(generated.status, 0, generated.stderr);
		const server = tls.createServer(
			{ key: fs.readFileSync(key), cert: fs.readFileSync(cert) },
			(socket) => socket.end(),
		);
		server.on('tlsClientError', () => {});
		await new Promise((resolve) => server.listen(0, resolve));
		t.after(() => new Promise((resolve) => server.close(resolve)));
		const url = `turns:localhost:${server.address().port}?transport=tcp`;
		await assert.rejects(checkCertificate(url), /TLS identity check failed/);
		const code = `import { checkCertificate } from ${JSON.stringify(new URL('./verify-tls.mjs', import.meta.url).href)}; await checkCertificate(process.argv[1]);`;
		const run = promisify(execFile);
		await run(process.execPath, ['--input-type=module', '-e', code, url], {
			env: { ...process.env, NODE_EXTRA_CA_CERTS: cert },
			timeout: 5000,
		});
		await assert.rejects(
			run(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					code,
					`turns:127.0.0.1:${server.address().port}?transport=tcp`,
				],
				{ env: { ...process.env, NODE_EXTRA_CA_CERTS: cert }, timeout: 5000 },
			),
		);
	},
);
