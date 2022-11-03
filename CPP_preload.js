// electron logic
const electron = require("electron");
const _preload = electron.ipcRenderer.sendSync("_original_preload");
if(typeof _preload == "string")
	require(_preload);

// CrossPlatformPlaying logic
const net = require("net");
const tls = require("tls");
const https = require("https");
const crypto = require("crypto");

// custom websocket client adding support for HTTP headers and cookies
class SimpleSocket extends EventTarget {
	constructor(url, options={}) {
		super();
		this.on = this.addEventListener;
		this.emit = (e, d) => this.dispatchEvent(new CustomEvent(e, d));

		this.url = new URL(url);
		if(this.url.protocol !== "wss:") return console.error("Only wss WebSockets are supported!");

		this.key = options.key || crypto.randomBytes(16).toString('base64');

		this.status = SimpleSocket.states.CONNECTING;

		const reqOptions = {
			hostname: this.url.hostname,
			host: this.url.host,
			port: this.url.port || 443,
			path: this.url.pathname + this.url.search,
			rejectUnauthorized: false,
			headers: {
				"Connection": "Upgrade",
				"Upgrade": "websocket",
				"Sec-WebSocket-Key": this.key,
				"Sec-WebSocket-Version": options.version || 13,
				...options.headers
			},
			...options.requestOptions
		}
		if(options.protocol) reqOptions.headers["Sec-WebSocket-Protocol"] = options.protocol;
		if(options.extensions) reqOptions.headers["Sec-WebSocket-Extensions"] = options.extensions;

		this.req = https.request(reqOptions);

		this.req.on('upgrade', (res, socket, head) => {
			try { // check accept header
				const expected = crypto.createHash('sha1').update(this.key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest('base64');
				if(res.headers["sec-websocket-accept"] !== expected) return console.error("Something fishy is going on... sec-websocket-accept expected vs recieved:", expected, res.headers["sec-websocket-accept"]);

				this.socket = socket;

				socket.on('data', data => this.receive(data));
				socket.on('close', () => this.closed());
				socket.on('error', console.error);

				this.status = SimpleSocket.states.READY;

				if(this.onconnect) this.onconnect(socket, res);

				if(head && head.length) this.receive(head);
			} catch(e) {
				err(e);
			}
		});

		this.req.on("error", console.error);

		this.req.end();
	}

	send(data, opcode) {
		try {
			if(!this.socket) return;
			if(this.status !== SimpleSocket.states.READY) return console.error("Tried to send data on a closed WebSocket!");

			let header;
			if(Buffer.isBuffer(data)) header = 0x82;
			else {
				header = 0x81;
				data = Buffer.from(new TextEncoder().encode(data.toString()));
			}
			if(opcode) header = 0x80 + opcode;

			let lengthByte = 0x80; // mask set to 1
			let extendedLength;
			if(data.length > 65535) {
				lengthByte += 127;
				(extendedLength = Buffer.alloc(8)).writeBigUInt64BE(BigInt(data.length));
			} else if(data.length > 125) {
				lengthByte += 126;
				(extendedLength = Buffer.alloc(2)).writeUInt16BE(data.length);
			} else {
				lengthByte += data.length;
				extendedLength = Buffer.alloc(0);
			}

			const maskKey = crypto.randomBytes(4);
			const maskedData = this.maskData(data, maskKey);

			const buf = Buffer.concat([
				Buffer.from([header, lengthByte]),
				extendedLength, maskKey, maskedData
			]);

			this.socket.write(buf);
		} catch(e) {
			err(e);
		}
	}

	receive(buf) {
		try {
			if(!this.onmessage) return;

			const fin = buf[0] >> 7; // bit 0 is FIN
			const opcode = buf[0] & 0x0F; // bits 4-7 is opcode
			const mask = buf[1] >> 7; // bit 8 is mask

			if(opcode === SimpleSocket.opcode.PING) {
				return this.pong();
			}

			let length = buf[1] & 0x7F;
			let lengthEnd = 2;

			if(length === 126) {
				length = buf.readUInt16BE(2);
				lengthEnd = 4;
			} else if(length === 127) {
				length = buf.readBigUInt64BE(2);
				lengthEnd = 10;
			}

			let data;
			if(mask) {
				const key = buf.readUInt32BE(lengthEnd);
				lengthEnd += 4;
				const masked = buf.subarray(lengthEnd, lengthEnd + length);

				data = this.maskData(masked, key);
			} else {
				data = buf.subarray(lengthEnd, lengthEnd + length);
			}

			if(opcode === SimpleSocket.opcode.CLOSE) {
				return this.closed(data);
			} else if(this.status !== SimpleSocket.states.READY) {
				return console.error("Data received on closed WebSocket!");
			}

			if(opcode === SimpleSocket.opcode.TEXT) data = data.toString('utf8');

			this.onmessage(data, buf);
		} catch(e) {
			err(e);
		}
	}

	close(statusCode, reason) {
		if(!this.socket) return;

		let data = [];
		if(statusCode) {
			data = new Buffer(2);
			data.writeUInt16BE(statusCode);

			if(reason) data = Buffer.concat([data, new TextEncoder().encode(reason.toString())]);
		}

		this.send(data, SimpleSocket.opcode.CLOSE);
		this.status = SimpleSocket.states.CLOSING;
		this.socket.end();
	}

	closed(data) {
		try {
			if(this.status === SimpleSocket.states.CLOSED) return;

			this.status = SimpleSocket.states.CLOSED;
			this.socket.destroy();

			if(!this.onclose) return;
			if(data) {
				const statusCode = data.readUInt16BE();
				const reason = data.toString('utf-8', 2);
				this.onclose(statusCode, reason);
			} else this.onclose();
		} catch(e) {
			err(e);
		}
	}

	maskData(data, key) {
		const masked = [];
		for(let i = 0; i < data.length; i++)
			masked.push(data[i] ^ key[i % 4]);
		return Buffer.from(masked);
	}

	ping() {
		this.send([], SimpleSocket.opcode.PING);
	}

	pong() {
		this.send([], SimpleSocket.opcode.PONG);
	}

	static opcode = {
		CONT: 0,
		TEXT: 1, BIN: 2,
		CLOSE: 8,
		PING: 9, PONG: 10
	}

	static states = {
		CONNECTING: 0,
		READY: 1,
		CLOSING: 2,
		CLOSED: 3
	}
}

// SimpleSocket todo:
// list of websockets to destroy
// support continuation frames
// support close codes
// support http status codes other than 101

const sockets = {}; let socket_index = 0;

// const closeSocket = (index, {destroy, destroyTimeout});

const CPP_preload = {

	https: {
		fetch: (url, options={}) => {
			return new Promise((resolve) => {
				const req = https.request(url, {
					method: options.method || "GET",
					headers: options.headers || {}
				}, resp => {
					const res = {
						statusCode: resp.statusCode,
						headers: resp.headers
					};
					let chunks = [];
					resp.on('data', (chunk) => chunks.push(chunk));
					resp.on('end', () => {
						res.body = Buffer.concat(chunks).toString(options.encoding || "utf8");
						resolve(res);
					});
				})
				req.write(options.body || "");
				req.end();
			});
		},
		simpleSocket: (url, options, onconnect, onmessage, onclose) => {
			const socket = new SimpleSocket(url, options);
			socket.onconnect = onconnect;
			socket.onmessage = onmessage;
			socket.onclose = onclose;

			const index = socket_index++;
			sockets[index] = socket;
			return index;
		},
		sendToSocket: (index, data) => {
			if(!sockets[index]) throw Error("SimpleSocket not found");
			sockets[index].send(data);
		},
		closeSocket: (index, statusCode, reason) => {
			if(!sockets[index]) throw Error("SimpleSocket not found");
			sockets[index].close(statusCode, reason);
			delete sockets[index];
		}
	},

	net: {
		createSocket: (host, port, onconnect, ondata, onerror, onclose) => {
			const socket = net.createConnection(port, host, onconnect);

			if(ondata) socket.on("data", ondata);
			if(onerror) socket.on("error", onerror);
			if(onclose) socket.on("close", onclose);

			const index = socket_index++;
			sockets[index] = socket;
			return index;
		},
		sendToSocket: (index, data) => {
			if(!sockets[index]) throw Error("Net Socket not found");
			sockets[index].write(data);
		},
		closeSocket: (index, destroy=false) => {
			if(!sockets[index]) throw Error("Net Socket not found");
			if(destroy) sockets[index].destroy();
			else sockets[index].end();
			delete sockets[index];
		}
	},

	tls: {
		createSocket: (host, port, options, onconnect, ondata, onerror, onclose) => {
			const socket = tls.connect(port, host, options, onconnect);

			if(ondata) socket.on("data", ondata);
			if(onerror) socket.on("error", onerror);
			if(onclose) socket.on("close", onclose);

			const index = socket_index++;
			sockets[index] = socket;
			return index;
		},
		sendToSocket: (index, data, encoding, callback) => {
			if(!sockets[index]) throw Error("TLS Socket not found");
			sockets[index].write(data, encoding, callback);
		},
		closeSocket: (index, destroy=false) => {
			if(!sockets[index]) throw Error("TLS Socket not found");
			if(destroy) sockets[index].destroy();
			else sockets[index].end();
			delete sockets[index];
		}
	}
}

electron.contextBridge.exposeInMainWorld("CPP_preload", CPP_preload);



