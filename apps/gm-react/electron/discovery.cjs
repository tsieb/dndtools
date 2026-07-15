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
const MAX_LINE_BYTES = 384 * 1024;
const SOCKET_TIMEOUT_MS = 65_000;
const MAX_HOST_SOCKETS = 16;
const MAX_CLIENT_SOCKETS = 8;
const MAX_DISCOVERED_SERVICES = 50;
const DEFAULT_SERVICE_TTL_SECONDS = 120;
const MAX_SERVICE_TTL_SECONDS = 5 * 60;

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
			if (info.family === 'IPv4' && !info.internal && isPrivateIpv4(info.address))
				return info.address;
		}
	}
	return '127.0.0.1';
}

function isPrivateIpv4(value) {
	if (net.isIP(value) !== 4) return false;
	const [a, b] = value.split('.').map(Number);
	return (
		a === 10 ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168)
	);
}

function validSessionId(value) {
	return typeof value === 'string' && /^sess-[a-zA-Z0-9-]{1,96}$/.test(value);
}

function validCode(value) {
	return typeof value === 'string' && value.length > 0 && value.length <= 256 * 1024;
}

function serviceTtlMs(value) {
	const seconds = Number(value);
	if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_SERVICE_TTL_SECONDS * 1000;
	return Math.min(Math.floor(seconds), MAX_SERVICE_TTL_SECONDS) * 1000;
}

function sessionIdForInstance(instance) {
	if (!instance.endsWith(`.${SERVICE_TYPE}`)) return null;
	const sessionId = instance.slice(0, -`.${SERVICE_TYPE}`.length);
	return validSessionId(sessionId) ? sessionId : null;
}

/**
 * A live discovery session. `onOfferRequest` is called (host side) when a joiner connects and needs an
 * offer code; it must return a Promise<string> offer code. `onAnswer` (host side) is called with the
 * joiner's answer code. `onOffer` (joiner side) is called with an offer code and must return a
 * Promise<string> answer code. These map 1:1 to SessionHost.invite()/SessionClient.join().
 */
class Discovery {
	constructor(options = {}) {
		this.mdns = Object.prototype.hasOwnProperty.call(options, 'mdns')
			? options.mdns
			: mdnsLib
				? mdnsLib()
				: null;
		this.now = typeof options.now === 'function' ? options.now : Date.now;
		this.setTimer = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
		this.clearTimer =
			typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
		this.server = null;
		this.advertised = null; // { sessionId, name, port }
		this.browsing = false;
		this.services = new Map(); // sessionId -> { sessionId, name, host, port }
		this.serviceExpiries = new Map(); // sessionId -> expiry timestamp
		this.serviceExpiryTimer = null;
		this.hostSockets = new Set();
		this.clientSockets = new Set();
		this.queryHandler = (query) => {
			const asksUs = (query.questions || [])
				.slice(0, 50)
				.some((q) => q.name === SERVICE_TYPE && (q.type === 'PTR' || q.type === 'ANY'));
			if (asksUs) this.announce();
		};
		this.responseHandler = (response) => this.ingestResponse(response);
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
		if (
			!this.mdns ||
			!validSessionId(sessionId) ||
			typeof name !== 'string' ||
			name.length < 1 ||
			name.length > 80
		)
			return { ok: false };
		await this.stopAdvertise();
		const server = net.createServer((socket) => this.handleHostSocket(socket));
		server.maxConnections = MAX_HOST_SOCKETS;
		const host = firstLanAddress();
		await new Promise((resolve, reject) => {
			const onError = (error) => reject(error);
			server.once('error', onError);
			server.listen({ port: 0, host, exclusive: true }, () => {
				server.removeListener('error', onError);
				resolve();
			});
		});
		const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
		this.server = server;
		this.advertised = { sessionId, name, port, host };

		this.mdns.on('query', this.queryHandler);
		this.announce();
		return { ok: true, port };
	}

	announce() {
		if (!this.mdns || !this.advertised) return;
		const { sessionId, name, port, host } = this.advertised;
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
		this.mdns?.removeListener('query', this.queryHandler);
		for (const socket of this.hostSockets) socket.destroy();
		this.hostSockets.clear();
		if (this.server) {
			await new Promise((resolve) => this.server.close(() => resolve()));
			this.server = null;
		}
		this.advertised = null;
	}

	/** Host side: a joiner connected. Ask the renderer for an offer, send it, await the answer. */
	handleHostSocket(socket) {
		if (this.hostSockets.size >= MAX_HOST_SOCKETS) {
			socket.destroy();
			return;
		}
		this.hostSockets.add(socket);
		let buffer = '';
		let chain = Promise.resolve();
		const state = { joined: false, answered: false };
		socket.setEncoding('utf8');
		socket.setNoDelay(true);
		socket.setTimeout(SOCKET_TIMEOUT_MS, () => socket.destroy());
		socket.on('data', (chunk) => {
			buffer += chunk;
			if (Buffer.byteLength(buffer, 'utf8') > MAX_LINE_BYTES) {
				socket.destroy();
				return;
			}
			let idx;
			while ((idx = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 1);
				chain = chain
					.then(() => this.handleHostLine(socket, line, state))
					.catch(() => socket.destroy());
			}
		});
		socket.on('error', () => socket.destroy());
		socket.on('close', () => this.hostSockets.delete(socket));
	}

	async handleHostLine(socket, line, state) {
		if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) return socket.destroy();
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			return;
		}
		if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
		if (msg.kind === 'join' && !state.joined && this.handlers.onOfferRequest) {
			state.joined = true;
			const offerCode = await this.handlers.onOfferRequest();
			if (!validCode(offerCode)) {
				socket.end(`${JSON.stringify({ kind: 'rejected' })}\n`);
				return;
			}
			socket.write(`${JSON.stringify({ kind: 'offer', offerCode })}\n`);
		} else if (msg.kind === 'answer' && state.joined && !state.answered && this.handlers.onAnswer) {
			if (!validCode(msg.answerCode)) return socket.destroy();
			state.answered = true;
			await this.handlers.onAnswer(msg.answerCode);
			socket.end();
		}
	}

	/** Joiner: browse for advertised sessions; report the roster via onServices. */
	startBrowse() {
		if (!this.mdns) return;
		this.browsing = true;
		this.pruneExpiredServices();
		this.mdns.removeListener('response', this.responseHandler);
		this.mdns.on('response', this.responseHandler);
		this.mdns.query({ questions: [{ name: SERVICE_TYPE, type: 'PTR' }] });
	}

	ingestResponse(response) {
		if (!this.browsing) return;
		const now = this.now();
		this.pruneExpiredServices(now, false);
		const answers = [...(response.answers || []), ...(response.additionals || [])].slice(0, 100);
		const ptrTtls = new Map();
		for (const answer of answers) {
			if (answer?.type !== 'PTR' || answer.name !== SERVICE_TYPE) continue;
			const instance = String(answer.data || '');
			const sessionId = sessionIdForInstance(instance);
			if (!sessionId) continue;
			const ttlMs = serviceTtlMs(answer.ttl);
			ptrTtls.set(instance, Math.min(ptrTtls.get(instance) ?? Infinity, ttlMs));
			if (ttlMs === 0) {
				this.services.delete(sessionId);
				this.serviceExpiries.delete(sessionId);
			}
		}
		const candidates = new Map();
		for (const a of answers) {
			const instance = String(a?.name || '');
			const sessionId = sessionIdForInstance(instance);
			if (!sessionId || ptrTtls.get(instance) === 0) continue;
			const candidate = candidates.get(instance) || {
				sessionId,
				name: null,
				txtSessionId: null,
				host: null,
				port: null,
				ttlMs: ptrTtls.get(instance) ?? DEFAULT_SERVICE_TTL_SECONDS * 1000,
			};
			candidate.ttlMs = Math.min(candidate.ttlMs, serviceTtlMs(a.ttl));
			if (a.type === 'SRV' && a.data && typeof a.data === 'object') {
				candidate.host = String(a.data.target || '');
				candidate.port = Number(a.data.port);
			}
			if (a.type === 'TXT' && Array.isArray(a.data)) {
				for (const entry of a.data.slice(0, 10)) {
					const text = Buffer.isBuffer(entry) ? entry.toString() : String(entry);
					if (text.length > 256) continue;
					if (text.startsWith('name=')) candidate.name = text.slice(5);
					if (text.startsWith('session=')) candidate.txtSessionId = text.slice(8);
				}
			}
			candidates.set(instance, candidate);
		}
		for (const candidate of candidates.values()) {
			const { sessionId, name, txtSessionId, host, port, ttlMs } = candidate;
			if (ttlMs <= 0) {
				this.services.delete(sessionId);
				this.serviceExpiries.delete(sessionId);
				continue;
			}
			if (
				txtSessionId !== sessionId ||
				!isPrivateIpv4(host) ||
				!Number.isInteger(port) ||
				port < 1 ||
				port > 65535 ||
				(typeof name !== 'string' && name !== null) ||
				(typeof name === 'string' && name.length > 80)
			)
				continue;
			if (!this.services.has(sessionId) && this.services.size >= MAX_DISCOVERED_SERVICES) break;
			this.services.set(sessionId, { sessionId, name: name || 'Table', host, port });
			this.serviceExpiries.set(sessionId, now + ttlMs);
		}
		this.scheduleServiceExpiry(now);
		this.handlers.onServices?.([...this.services.values()]);
	}

	clearServiceExpiryTimer() {
		if (this.serviceExpiryTimer === null) return;
		this.clearTimer(this.serviceExpiryTimer);
		this.serviceExpiryTimer = null;
	}

	scheduleServiceExpiry(now = this.now()) {
		this.clearServiceExpiryTimer();
		if (!this.browsing || this.serviceExpiries.size === 0) return;
		const nextExpiry = Math.min(...this.serviceExpiries.values());
		this.serviceExpiryTimer = this.setTimer(
			() => {
				this.serviceExpiryTimer = null;
				this.pruneExpiredServices();
			},
			Math.max(0, nextExpiry - now),
		);
		this.serviceExpiryTimer?.unref?.();
	}

	pruneExpiredServices(now = this.now(), notify = true) {
		let changed = false;
		for (const [sessionId, expiresAt] of this.serviceExpiries) {
			if (expiresAt > now) continue;
			this.serviceExpiries.delete(sessionId);
			changed = this.services.delete(sessionId) || changed;
		}
		this.scheduleServiceExpiry(now);
		if (changed && notify) this.handlers.onServices?.([...this.services.values()]);
		return changed;
	}

	stopBrowse() {
		this.browsing = false;
		this.clearServiceExpiryTimer();
		this.mdns?.removeListener('response', this.responseHandler);
		this.services.clear();
		this.serviceExpiries.clear();
		this.handlers.onServices?.([]);
	}

	/** Joiner: connect to a discovered host, get an offer, produce an answer via onOffer, send it back. */
	connect(service, onOffer) {
		return new Promise((resolve, reject) => {
			this.pruneExpiredServices();
			if (this.clientSockets.size >= MAX_CLIENT_SOCKETS) {
				reject(new Error('Too many nearby connection attempts are already running.'));
				return;
			}
			const known = service && this.services.get(service.sessionId);
			if (
				!known ||
				known.host !== service.host ||
				known.port !== service.port ||
				!isPrivateIpv4(known.host)
			) {
				reject(new Error('That nearby table is no longer available.'));
				return;
			}
			const socket = net.createConnection({ host: known.host, port: known.port }, () => {
				socket.write(`${JSON.stringify({ kind: 'join' })}\n`);
			});
			this.clientSockets.add(socket);
			let buffer = '';
			let settled = false;
			let handledOffer = false;
			const finish = (error) => {
				if (settled) return;
				settled = true;
				this.clientSockets.delete(socket);
				socket.destroy();
				if (error) reject(error);
				else resolve();
			};
			socket.setEncoding('utf8');
			socket.setNoDelay(true);
			socket.setTimeout(SOCKET_TIMEOUT_MS, () =>
				finish(new Error('The nearby table did not respond in time.')),
			);
			socket.on('data', async (chunk) => {
				buffer += chunk;
				if (Buffer.byteLength(buffer, 'utf8') > MAX_LINE_BYTES) {
					finish(new Error('The nearby table sent too much data.'));
					return;
				}
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
					if (msg.kind === 'rejected') {
						finish(new Error('The DM declined this join request.'));
						return;
					}
					if (msg.kind === 'offer' && !handledOffer && validCode(msg.offerCode)) {
						handledOffer = true;
						try {
							const answerCode = await onOffer(msg.offerCode);
							if (!validCode(answerCode)) throw new Error('Could not create a valid reply code.');
							socket.write(`${JSON.stringify({ kind: 'answer', answerCode })}\n`, () => finish());
						} catch (err) {
							finish(err instanceof Error ? err : new Error('Could not join the nearby table.'));
						}
					}
				}
			});
			socket.on('error', (error) => finish(error));
			socket.on('close', () => {
				if (!settled) finish(new Error('The nearby table closed the connection.'));
			});
		});
	}

	dispose() {
		void this.stopAdvertise();
		this.stopBrowse();
		for (const socket of this.clientSockets) socket.destroy();
		this.clientSockets.clear();
		try {
			this.mdns?.destroy();
		} catch {
			/* ignore */
		}
	}
}

module.exports = { available, Discovery, SERVICE_TYPE };
