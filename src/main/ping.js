// Minecraft Server List Ping (modern protocol) — used for the live status dot
// and player count on group pack cards. No dependencies.
import net from 'node:net';

function varInt(n) {
  const bytes = [];
  let v = n >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function packet(id, payload) {
  const body = Buffer.concat([varInt(id), payload]);
  return Buffer.concat([varInt(body.length), body]);
}

/** Read a VarInt from buf at offset; returns [value, bytesRead] or null if incomplete. */
function readVarInt(buf, offset) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (true) {
    if (pos >= buf.length) return null;
    const b = buf[pos++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [result, pos - offset];
    shift += 7;
    if (shift > 35) throw new Error('VarInt too big');
  }
}

/**
 * Ping a Minecraft server. Resolves { online, latencyMs, playersOnline, playersMax,
 * version } — or { online: false } on any failure (never rejects).
 */
export function pingServer(address, port = 25565, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    const fail = () => finish({ online: false });

    socket.setTimeout(timeoutMs, fail);
    socket.on('error', fail);
    socket.connect(Number(port) || 25565, address, () => {
      const host = Buffer.from(address, 'utf8');
      const handshake = packet(0x00, Buffer.concat([
        varInt(0xffffffff), // protocol version -1 (status ping)
        varInt(host.length), host,
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        varInt(1), // next state: status
      ]));
      socket.write(Buffer.concat([handshake, packet(0x00, Buffer.alloc(0))]));
    });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        const len = readVarInt(buf, 0);
        if (!len) return;
        if (buf.length < len[1] + len[0]) return; // wait for full packet
        const id = readVarInt(buf, len[1]);
        if (!id || id[0] !== 0x00) return fail();
        const strLen = readVarInt(buf, len[1] + id[1]);
        if (!strLen) return;
        const start = len[1] + id[1] + strLen[1];
        const json = JSON.parse(buf.slice(start, start + strLen[0]).toString('utf8'));
        finish({
          online: true,
          latencyMs: Date.now() - started,
          playersOnline: json.players?.online ?? 0,
          playersMax: json.players?.max ?? 0,
          version: json.version?.name || '',
        });
      } catch {
        fail();
      }
    });
  });
}
