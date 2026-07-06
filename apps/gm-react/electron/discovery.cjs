// @ts-check
'use strict';

/**
 * LAN session discovery + serverless SDP rendezvous for the P2P remote-player feature (Epic 7.3
 * S7.3.2). Electron main-process only. It advertises/browses `_dndtools._tcp.local` via mDNS and runs a
 * tiny LAN TCP rendezvous that SHUTTLES the existing WebRTC offer/answer codes between the DM host and a
 * joiner — so same-network players can join WITHOUT copy/pasting a code. The DM's own device is the only
 * "server"; nothing external is contacted (zero cloud).
 *
 * Everything here is DEFENSIVE: if `multicast-dns` is unavailable (e.g. the packaged app was built
 * without the bundled discovery module), every export no-ops and the renderer degrades to the manual
 * code flow — so the desktop app stays fully functional either way.
 *
 * The renderer NEVER touches sockets: it exchanges only opaque offer/answer strings (produced by the
 * SessionHost/SessionClient) across the preload bridge. All wire bytes are still AES-GCM sealed by the
 * renderer's session key — the rendezvous only carries the already-encrypted handshake codes.
 */

const net = require('node:net');
const os = require('node:os');

const SERVICE_TYPE = '_dndtools._tcp.local';

let mdnsLib = null;
try {
	// Optional: present in dev (node_modules) and in a bundled discovery build; absent → feature off.
	mdnsLib = require('multicast-dns');
} catch {
	mdnsLib = null;
}

/** Whether LAN discovery is available in this runtime. */
function available() {
	return mdnsLib !== null;
}

function firstLanAddress() {
	const ifaces = os.networkInterfaces();
	for (const name of Object.keys(ifaces)) {
		for (const info of ifaces[name] || []) {
			if (info.family === 'IPv4' && !info.internal) return info.address;
		}
	}
	return '127.0.0.1';
}

/**
 * A live discovery session. `onOfferRequest` is called (host side) when a joiner connects and needs an
 * offer code; it must return a Promise<string> offer code. `onAnswer` (host side) is called with the
 * joiner's answer code. `onOffer` (joiner side) is called with an offer code and must return a
 * Promise<string> answer code. These map 1:1 to SessionHost.invite()/SessionClient.join().
 */
class Discovery {
	constructor() {
		this.mdns = mdnsLib ? mdnsLib() : null;
		this.server = null;
		this.advertised = null; // { sessionId, name, port }
		this.browsing = false;
		this.services = new Map(); // sessionId -> { sessionId, name, host, port }
		this.handlers = {
			onOfferRequest: null,
			onAnswer: null,
			onServices: null,
		};
	}

	setHandlers(handlers) {
		this.handlers = { ...this.handlers, ...handlers };
	}

	/** Host: start a TCP rendezvous server and advertise the session over mDNS. */
	async advertise(sessionId, name) {
		if (!this.mdns) return { ok: false };
		await this.stopAdvertise();
		const server = net.createServer((socket) => this.handleHostSocket(socket));
		await new Promise((resolve) => server.listen(0, resolve));
		const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
		this.server = server;
		this.advertised = { sessionId, name, port };

		this.mdns.on('query', (query) => {
			const asksUs = (query.questions || []).some(
				(q) => q.name === SERVICE_TYPE && (q.type === 'PTR' || q.type === 'ANY'),
			);
			if (asksUs) this.announce();
		});
		this.announce();
		return { ok: true, port };
	}

	announce() {
		if (!this.mdns || !this.advertised) return;
		const { sessionId, name, port } = this.advertised;
		const host = firstLanAddress();
		this.mdns.respond({
			answers: [
				{ name: SERVICE_TYPE, type: 'PTR', ttl: 120, data: `${sessionId}.${SERVICE_TYPE}` },
				{
					name: `${sessionId}.${SERVICE_TYPE}`,
					type: 'SRV',
					ttl: 120,
					data: { port, target: host },
				},
				{
					name: `${sessionId}.${SERVICE_TYPE}`,
					type: 'TXT',
					ttl: 120,
					data: [Buffer.from(`name=${name}`), Buffer.from(`session=${sessionId}`)],
				},
			],
		});
	}

	async stopAdvertise() {
		if (this.server) {
			await new Promise((resolve) => this.server.close(resolve));
			this.server = null;
		}
		this.advertised = null;
	}

	/** Host side: a joiner connected. Ask the renderer for an offer, send it, await the answer. */
	handleHostSocket(socket) {
		let buffer = '';
		socket.setEncoding('utf8');
		socket.on('data', (chunk) => {
			buffer += chunk;
			let idx;
			while ((idx = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 1);
				void this.handleHostLine(socket, line);
			}
		});
		socket.on('error', () => socket.destroy());
	}

	async handleHostLine(socket, line) {
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			return;
		}
		if (msg.kind === 'join' && this.handlers.onOfferRequest) {
			const offerCode = await this.handlers.onOfferRequest();
			socket.write(`${JSON.stringify({ kind: 'offer', offerCode })}\n`);
		} else if (msg.kind === 'answer' && this.handlers.onAnswer) {
			await this.handlers.onAnswer(msg.answerCode);
		}
	}

	/** Joiner: browse for advertised sessions; report the roster via onServices. */
	startBrowse() {
		if (!this.mdns) return;
		this.browsing = true;
		this.mdns.on('response', (response) => this.ingestResponse(response));
		this.mdns.query({ questions: [{ name: SERVICE_TYPE, type: 'PTR' }] });
	}

	ingestResponse(response) {
		if (!this.browsing) return;
		const answers = [...(response.answers || []), ...(response.additionals || [])];
		let sessionId = null;
		let name = null;
		let host = null;
		let port = null;
		for (const a of answers) {
			if (a.type === 'SRV' && String(a.name).endsWith(SERVICE_TYPE)) {
				sessionId = String(a.name).split('.')[0];
				host = a.data.target;
				port = a.data.port;
			}
			if (a.type === 'TXT') {
				for (const entry of a.data || []) {
					const text = Buffer.isBuffer(entry) ? entry.toString() : String(entry);
					if (text.startsWith('name=')) name = text.slice(5);
					if (text.startsWith('session=')) sessionId = text.slice(8);
				}
			}
		}
		if (sessionId && host && port) {
			this.services.set(sessionId, { sessionId, name: name || 'Table', host, port });
			this.handlers.onServices?.([...this.services.values()]);
		}
	}

	stopBrowse() {
		this.browsing = false;
		this.services.clear();
	}

	/** Joiner: connect to a discovered host, get an offer, produce an answer via onOffer, send it back. */
	connect(service, onOffer) {
		return new Promise((resolve, reject) => {
			const socket = net.createConnection({ host: service.host, port: service.port }, () => {
				socket.write(`${JSON.stringify({ kind: 'join' })}\n`);
			});
			let buffer = '';
			socket.setEncoding('utf8');
			socket.on('data', async (chunk) => {
				buffer += chunk;
				let idx;
				while ((idx = buffer.indexOf('\n')) >= 0) {
					const line = buffer.slice(0, idx);
					buffer = buffer.slice(idx + 1);
					let msg;
					try {
						msg = JSON.parse(line);
					} catch {
						continue;
					}
					if (msg.kind === 'offer') {
						try {
							const answerCode = await onOffer(msg.offerCode);
							socket.write(`${JSON.stringify({ kind: 'answer', answerCode })}\n`);
							resolve();
						} catch (err) {
							reject(err);
							socket.destroy();
						}
					}
				}
			});
			socket.on('error', reject);
		});
	}

	dispose() {
		void this.stopAdvertise();
		this.stopBrowse();
		try {
			this.mdns?.destroy();
		} catch {
			/* ignore */
		}
	}
}

module.exports = { available, Discovery, SERVICE_TYPE };
