// Read-only TURN probe. Supply WS_URL + TOKEN for signaling credentials, or a
// mode-0600 TURN_CREDENTIALS_FILE containing { iceServers } for a rotation drill.
// No users or cloud resources are created. Only TLS relay URLs reach Chromium.
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

export function tlsServers(iceServers) {
	if (!Array.isArray(iceServers)) throw new Error('Missing ICE servers');
	const selected = [];
	for (const server of iceServers) {
		const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
		for (const url of urls) {
			if (typeof url !== 'string' || !url.startsWith('turns:')) continue;
			const match = /^turns:([a-z0-9.-]+):(\d+)(?:\?transport=tcp)?$/.exec(url);
			if (
				!match ||
				match[1].length > 253 ||
				!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(match[1]) ||
				Number(match[2]) < 1 ||
				Number(match[2]) > 65535 ||
				typeof server.username !== 'string' ||
				!server.username ||
				typeof server.credential !== 'string' ||
				!server.credential
			) {
				throw new Error('Expected authenticated turns: DNS URLs over TCP');
			}
			selected.push({
				urls: `turns:${match[1]}:${Number(match[2])}?transport=tcp`,
				username: server.username,
				credential: server.credential,
			});
		}
	}
	if (!selected.length) throw new Error('No TLS relay credentials; plaintext TURN cannot pass');
	return selected;
}

export function checkCertificate(url) {
	const match = /^turns:([^:]+):(\d+)\?transport=tcp$/.exec(url);
	if (!match) return Promise.reject(new Error('Invalid TLS probe URL'));
	return new Promise((resolve, reject) => {
		const socket = tls.connect({
			host: match[1],
			port: Number(match[2]),
			servername: match[1],
			minVersion: 'TLSv1.2',
			rejectUnauthorized: true,
		});
		const timer = setTimeout(
			() => socket.destroy(new Error('TLS identity check timed out')),
			10000,
		);
		socket.once('error', () => reject(new Error('TLS identity check failed')));
		socket.once('close', () => {
			clearTimeout(timer);
			reject(new Error('TLS identity connection closed before verification'));
		});
		socket.once('secureConnect', () => {
			if (!socket.authorized) {
				socket.destroy(new Error('TLS certificate was not trusted'));
				return;
			}
			socket.destroy();
			resolve();
		});
	});
}

async function credentialsFromSignaling(wsUrl, token) {
	if (!wsUrl || !token || !wsUrl.startsWith('wss://')) {
		throw new Error('WS_URL (wss:) and TOKEN, or TURN_CREDENTIALS_FILE, are required');
	}
	return new Promise((resolve, reject) => {
		const url = new URL(wsUrl);
		url.searchParams.set('token', token);
		const ws = new WebSocket(url);
		let settled = false;
		const finish = (message, servers) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			ws.close();
			if (message) reject(new Error(message));
			else resolve(servers);
		};
		const timer = setTimeout(() => finish('TURN credential request timed out'), 12000);
		ws.addEventListener('open', () => ws.send(JSON.stringify({ action: 'turnCredentials' })));
		ws.addEventListener('message', (event) => {
			try {
				const response = JSON.parse(event.data);
				if (response.type === 'turn-credentials') finish(null, response.iceServers);
				else if (response.type === 'error') finish('Signaling rejected TURN credentials');
			} catch {
				finish('Invalid signaling response');
			}
		});
		ws.addEventListener('error', () => finish('TURN credential connection failed'));
		ws.addEventListener('close', () => finish('TURN credential connection closed'));
	});
}

const setupPeer = ({ server, offerer }) => {
	const pc = new RTCPeerConnection({ iceServers: [server], iceTransportPolicy: 'relay' });
	window.turnProbe = { pc, received: null };
	const wire = (channel) => {
		window.turnProbe.channel = channel;
		channel.onmessage = ({ data }) => {
			window.turnProbe.received = data;
			if (!offerer) channel.send(data);
		};
	};
	if (offerer) wire(pc.createDataChannel('tls-relay-probe'));
	else pc.ondatachannel = ({ channel }) => wire(channel);
};

const selectedCandidate = async () => {
	const stats = await window.turnProbe.pc.getStats();
	const transport = [...stats.values()].find(
		(entry) => entry.type === 'transport' && entry.selectedCandidatePairId,
	);
	const pair = transport && stats.get(transport.selectedCandidatePairId);
	const candidate = pair && stats.get(pair.localCandidateId);
	return (
		candidate && {
			candidateType: candidate.candidateType,
			relayProtocol: candidate.relayProtocol,
			url: candidate.url,
		}
	);
};

export function assertTlsCandidate(candidate, expectedUrl) {
	if (
		candidate?.candidateType !== 'relay' ||
		candidate.relayProtocol !== 'tls' ||
		candidate.url !== expectedUrl
	) {
		throw new Error('Selected ICE path was not the requested TLS relay');
	}
}

async function probeRelay(browser, server) {
	const context = await browser.newContext();
	try {
		const a = await context.newPage();
		const b = await context.newPage();
		await a.evaluate(setupPeer, { server, offerer: true });
		await b.evaluate(setupPeer, { server, offerer: false });
		await a.evaluate(async () => {
			const pc = window.turnProbe.pc;
			await pc.setLocalDescription(await pc.createOffer());
		});
		await a.waitForFunction(() => window.turnProbe.pc.iceGatheringState === 'complete', null, {
			timeout: 20000,
		});
		const offer = await a.evaluate(() => window.turnProbe.pc.localDescription.toJSON());
		await b.evaluate(async (offer) => {
			const pc = window.turnProbe.pc;
			await pc.setRemoteDescription(offer);
			await pc.setLocalDescription(await pc.createAnswer());
		}, offer);
		await b.waitForFunction(() => window.turnProbe.pc.iceGatheringState === 'complete', null, {
			timeout: 20000,
		});
		const answer = await b.evaluate(() => window.turnProbe.pc.localDescription.toJSON());
		await a.evaluate((answer) => window.turnProbe.pc.setRemoteDescription(answer), answer);
		await a.waitForFunction(() => window.turnProbe.channel?.readyState === 'open', null, {
			timeout: 20000,
		});
		await a.evaluate(() => window.turnProbe.channel.send('turn-tls-roundtrip'));
		await a.waitForFunction(() => window.turnProbe.received === 'turn-tls-roundtrip', null, {
			timeout: 10000,
		});
		assertTlsCandidate(await a.evaluate(selectedCandidate), server.urls);
		assertTlsCandidate(await b.evaluate(selectedCandidate), server.urls);
	} finally {
		await context.close();
	}
}

export function credentialSource(env) {
	if (env.TURN_CREDENTIALS_FILE && (env.WS_URL || env.TOKEN)) {
		throw new Error('Choose either a credential file or signaling credentials, not both');
	}
	return env.TURN_CREDENTIALS_FILE ? 'file' : 'signaling';
}

async function main() {
	const source = credentialSource(process.env);
	const file = process.env.TURN_CREDENTIALS_FILE;
	let credentials;
	if (source === 'file') {
		if (((await stat(file)).mode & 0o077) !== 0)
			throw new Error('TURN_CREDENTIALS_FILE must be private (mode 0600)');
		credentials = JSON.parse(await readFile(file, 'utf8')).iceServers;
	} else {
		credentials = await credentialsFromSignaling(process.env.WS_URL, process.env.TOKEN);
	}
	const servers = tlsServers(credentials);
	for (const server of servers) await checkCertificate(server.urls);
	const require = createRequire(new URL('../../apps/gm-react/package.json', import.meta.url));
	const { chromium } = require('playwright');
	const browser = await chromium.launch();
	try {
		for (const server of servers) await probeRelay(browser, server);
		console.log(
			`PASS: ${servers.length} TLS relay endpoint(s), trusted DNS certificates, both peers relayed, bidirectional data delivered`,
		);
	} finally {
		await browser.close();
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch(() => {
		// Browser/socket errors may contain URLs, tokens or SDP. Keep failures generic.
		console.error(
			'FAIL: TLS TURN verification did not complete; check credentials, certificate, allocation and relay reachability',
		);
		process.exitCode = 1;
	});
}
