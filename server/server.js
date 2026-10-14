/* ============================================================
 * server.js —— 无依赖的 WebSocket 房间服务器（Node）
 * 运行： node server/server.js   （默认端口 8787）
 * 职责：房间码管理、玩家进出、玩家列表广播、消息中继、房主标识、踢人、人数上限(8)。
 * 游戏逻辑不在这里，由「房主客户端」权威运行，服务器只转发消息。
 * ============================================================ */
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8787;
const MAX_PLAYERS = 8;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const rooms = new Map();   // code -> { members:Set<conn>, order:[] }
let nextId = 1;

function nowId() { return (nextId++).toString(); }

/* ---------------- WebSocket 帧编码/解码 ---------------- */
function encodeFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.from([0x81, len]); }
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
  return Buffer.concat([header, payload]);
}
function decodeFrames(buf) {
  // 返回 { frames:[str], rest:Buffer }
  const out = [];
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const b1 = buf[offset], b2 = buf[offset + 1];
    const opcode = b1 & 0x0f;
    const masked = (b2 & 0x80) !== 0;
    let len = b2 & 0x7f;
    let p = offset + 2;
    if (len === 126) { if (p + 2 > buf.length) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (p + 8 > buf.length) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let mask;
    if (masked) { if (p + 4 > buf.length) break; mask = buf.slice(p, p + 4); p += 4; }
    if (p + len > buf.length) break;
    let payload = buf.slice(p, p + len);
    if (masked) { payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]; }
    offset = p + len;
    if (opcode === 0x1) out.push(payload.toString('utf8'));
    else if (opcode === 0x8) out.push('__CLOSE__');
    else if (opcode === 0x9) out.push('__PING__');
  }
  return { frames: out, rest: buf.slice(offset) };
}
function send(conn, obj) { try { conn.socket.write(encodeFrame(JSON.stringify(obj))); } catch (e) {} }

/* ---------------- 房间 ---------------- */
function broadcast(code, obj, exceptId) {
  const room = rooms.get(code); if (!room) return;
  room.members.forEach(conn => { if (conn.id !== exceptId) send(conn, obj); });
}
function playerList(room) {
  return room.order.map(id => {
    const conn = [...room.members].find(c => c.id === id);
    return { id, name: conn ? conn.name : '?', host: id === room.host };
  });
}
function pushPlayers(code) {
  const room = rooms.get(code); if (!room) return;
  broadcast(code, { t: 'players', players: playerList(room), max: MAX_PLAYERS, host: room.host });
}
function nameUsed(room, name, exceptId) {
  for (const c of room.members) { if (c.id !== exceptId && c.name === name) return true; }
  return false;
}
function leave(conn) {
  const code = conn.room; if (!code) return;
  const room = rooms.get(code); if (!room) return;
  room.members.delete(conn);
  room.order = room.order.filter(id => id !== conn.id);
  if (room.members.size === 0) { rooms.delete(code); return; }
  if (room.host === conn.id) room.host = room.order[0];   // 房主离开 → 递补
  broadcast(code, { t: 'system', text: conn.name + ' 离开了房间' });
  pushPlayers(code);
}

/* ---------------- HTTP + Upgrade ---------------- */
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('百合命运观察者 · 房间服务器运行中。房间数：' + rooms.size);
});
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);

  const conn = { socket, id: nowId(), name: '玩家', room: null, buffer: Buffer.alloc(0) };
  send(conn, { t: 'hello', id: conn.id });

  socket.on('data', chunk => {
    conn.buffer = Buffer.concat([conn.buffer, chunk]);
    const { frames, rest } = decodeFrames(conn.buffer);
    conn.buffer = rest;
    frames.forEach(f => handle(conn, f));
  });
  socket.on('close', () => leave(conn));
  socket.on('error', () => leave(conn));
});

function handle(conn, text) {
  if (text === '__CLOSE__') { try { conn.socket.end(); } catch (e) {} return; }
  if (text === '__PING__') { try { conn.socket.write(Buffer.from([0x8a, 0x00])); } catch (e) {} return; }
  let m; try { m = JSON.parse(text); } catch (e) { return; }
  switch (m.t) {
    case 'create': {
      const code = String(m.code || '').toUpperCase();
      if (code.length < 4) { send(conn, { t: 'error', msg: '房间码至少 4 位' }); return; }
      if (rooms.has(code)) { send(conn, { t: 'error', msg: '房间码已存在，请换一个' }); return; }
      conn.name = (m.name || '玩家').slice(0, 12);
      const room = { members: new Set(), order: [], host: conn.id };
      room.members.add(conn); room.order.push(conn.id);
      conn.room = code; rooms.set(code, room);
      send(conn, { t: 'joined', code, id: conn.id, host: room.host });
      pushPlayers(code);
      break;
    }
    case 'join': {
      const code = String(m.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) { send(conn, { t: 'error', msg: '房间不存在' }); return; }
      if (room.members.size >= MAX_PLAYERS) { send(conn, { t: 'error', msg: '房间已满（最多 ' + MAX_PLAYERS + ' 人）' }); return; }
      const jname = (m.name || '玩家').slice(0, 12);
      if (nameUsed(room, jname)) { send(conn, { t: 'error', msg: '名字「' + jname + '」已被占用，请换一个' }); return; }
      conn.name = jname;
      room.members.add(conn); room.order.push(conn.id);
      conn.room = code;
      send(conn, { t: 'joined', code, id: conn.id, host: room.host });
      broadcast(code, { t: 'system', text: conn.name + ' 加入了房间' }, conn.id);
      pushPlayers(code);
      break;
    }
    case 'name': {
      const nn = (m.name || conn.name).slice(0, 12);
      if (conn.room) {
        const room = rooms.get(conn.room);
        if (room && nameUsed(room, nn, conn.id)) { send(conn, { t: 'error', msg: '名字「' + nn + '」已被占用，请换一个' }); return; }
      }
      conn.name = nn;
      if (conn.room) pushPlayers(conn.room);
      break;
    }
    case 'relay': {
      if (!conn.room) return;
      broadcast(conn.room, { t: 'relay', from: conn.id, to: m.to || 'all', data: m.data });
      break;
    }
    case 'kick': {
      const room = rooms.get(conn.room);
      if (!room || room.host !== conn.id) { send(conn, { t: 'error', msg: '只有房主可以踢人' }); return; }
      const target = [...room.members].find(c => c.id === m.target);
      if (target) { send(target, { t: 'kicked' }); try { target.socket.end(); } catch (e) {} }
      break;
    }
    case 'leave': leave(conn); break;
  }
}

server.listen(PORT, () => {
  console.log('房间服务器已启动： ws://localhost:' + PORT + '  （最多 ' + MAX_PLAYERS + ' 人/房）');
});
