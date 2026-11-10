// Online 101 Okey sunucusu — eşleştirme, masalar, oyunun tamamı ve bilgisayar oyuncular burada.
// Dış paket gerektirmez:  node server.js   (PORT ortam değişkeni ile port değişir)
'use strict';
const http = require('http');
const crypto = require('crypto');
const K = require('./core101.js');

const PORT = process.env.PORT || 8080;
const TURN_MS = 45000;          // çevrimiçi oyuncunun hamle süresi
const OFFLINE_TURN_MS = 5000;   // bağlantısı kopan oyuncunun yerine bu kadar sonra otomatik oynanır
const WAIT_DROP_MS = 20000;     // beklerken bağlantısı kopan oyuncu bu süre sonra masadan çıkarılır
const NEXT_HAND_MS = 15000;
const PUBLIC_HANDS = 5;
// Salonlar: arkadaşlar aynı salonu seçince aynı masaya oturur (masalar sırayla dolar)
const ROOMS = [
  { id: 'genel', name: 'Genel' }, { id: 'cinaralti', name: 'Çınaraltı' }, { id: 'kahvehane', name: 'Kahvehane' },
  { id: 'sahil', name: 'Sahil' }, { id: 'yayla', name: 'Yayla' }, { id: 'carsi', name: 'Çarşı' }, { id: 'bahce', name: 'Bahçe' }
];
function roomOf(id) { return ROOMS.find(r => r.id === id) || ROOMS[0]; }
const BOT_NAMES = ['Zeynep', 'Murat', 'Elif', 'Kemal', 'Ayten', 'Hasan', 'Sevgi', 'Orhan'];

// ---------------- Minimal WebSocket (RFC 6455) ----------------
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const ws = { socket, open: true, onmessage: null, onclose: null };
  let buf = Buffer.alloc(0);
  ws.send = (obj) => {
    if (!ws.open) return;
    const data = Buffer.from(JSON.stringify(obj));
    let head;
    if (data.length < 126) head = Buffer.from([0x81, data.length]);
    else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(data.length, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
    try { socket.write(Buffer.concat([head, data])); } catch (e) {}
  };
  ws.close = () => { if (!ws.open) return; ws.open = false; try { socket.end(Buffer.from([0x88, 0])); } catch (e) {} socket.destroy(); if (ws.onclose) ws.onclose(); };
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > 1 << 20) return ws.close();
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let payload = buf.slice(off + (masked ? 4 : 0), need);
      if (masked) { const m = buf.slice(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      buf = buf.slice(need);
      if (op === 0x8) return ws.close();
      if (op === 0x9) { try { socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (e) {} continue; }
      if (op !== 0x1 || !ws.onmessage) continue;
      let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
      try { ws.onmessage(msg); } catch (e) { console.error(e); }
    }
  });
  socket.on('close', () => { if (ws.open) { ws.open = false; if (ws.onclose) ws.onclose(); } });
  socket.on('error', () => {});
  return ws;
}

// ---------------- Oyuncular ve masalar ----------------
const players = new Map(); // token -> {token, name, ws, tableId}
const tables = new Map();  // id -> masa
let tableSeq = 1, botSeq = 0;

function cleanName(n) { n = String(n || '').replace(/[<>]/g, '').trim().slice(0, 14); return n || 'Oyuncu'; }
function newTable(room) {
  const t = { id: 't' + (tableSeq++), room: room, isPublic: true, owner: null, code: null,
    numHands: PUBLIC_HANDS,
    seats: [null, null, null, null], status: 'waiting', M: null, timer: null, deadline: 0, busy: false, created: Date.now() };
  tables.set(t.id, t);
  return t;
}
function seatOf(t, token) { return t.seats.findIndex(s => s && s.token === token); }
function sendTo(token, msg) { const p = players.get(token); if (p && p.ws && p.ws.open) p.ws.send(msg); }
function onlineStats() {
  let searching = 0, playing = 0;
  for (const t of tables.values()) {
    const h = t.seats.filter(s => s && s.token && s.online).length;
    if (t.status === 'waiting' && t.isPublic) searching += h; else if (t.status !== 'waiting') playing += h;
  }
  return { online: [...players.values()].filter(p => p.ws && p.ws.open).length, searching, playing };
}

// Her oyuncu sadece kendi taşlarını görür
function viewFor(t, seat) {
  const M = t.M;
  const base = {
    t: 'state', mySeat: seat, tableId: t.id, room: roomOf(t.room).name, isPublic: t.isPublic, code: t.code, status: t.status,
    owner: !!(t.seats[seat] && t.seats[seat].token === t.owner), numHands: t.numHands,
    seats: t.seats.map(s => s ? { name: s.name, bot: !!s.bot, online: !!s.online } : null),
    stats: t.status === 'waiting' ? onlineStats() : undefined,
    waitedMs: Date.now() - t.created
  };
  if (!M) return base;
  const g = M.g;
  const gv = Object.assign({}, g, {
    hands: g.hands.map((h, i) => (i === seat || g.over) ? h.slice() : new Array(h.length).fill(-1)),
    deck: new Array(g.deck.length).fill(0)
  });
  base.M = { numHands: M.numHands, handNo: M.handNo, totals: M.totals, names: M.names, ended: M.ended, results: M.results, g: gv };
  base.msLeft = Math.max(0, t.deadline - Date.now());
  return base;
}
function broadcast(t) { t.seats.forEach((s, i) => { if (s && s.token) sendTo(s.token, viewFor(t, i)); }); }
let statsTimer = null;
function broadcastWaiting() {
  if (statsTimer) return;
  statsTimer = setTimeout(() => { statsTimer = null; for (const t of tables.values()) if (t.status === 'waiting') broadcast(t); }, 300);
}

// ---------------- Eşleştirme ----------------
function joinQuick(p, roomId) {
  const room = roomOf(roomId).id;
  let t = [...tables.values()].find(x => x.room === room && x.status === 'waiting' && x.seats.some(s => !s));
  if (!t) t = newTable(room);
  addToTable(t, p);
}
// Salon listesi: her salonda kaç oyuncu var
function lobby() {
  return { t: 'lobby', rooms: ROOMS.map(r => {
    let waiting = 0, playing = 0;
    for (const t of tables.values()) if (t.room === r.id) {
      const h = t.seats.filter(s => s && s.token).length;
      if (t.status === 'waiting') waiting += h; else playing += h;
    }
    return { id: r.id, name: r.name, waiting, playing };
  }) };
}
function addToTable(t, p) {
  const i = t.seats.findIndex(s => !s);
  if (i < 0) return sendTo(p.token, { t: 'err', m: 'Masa dolu.' });
  t.seats[i] = { token: p.token, name: p.name, bot: false, online: true };
  p.tableId = t.id;
  if (t.isPublic && t.seats.every(s => s)) startMatch(t); else broadcast(t);
  broadcastWaiting();
}
function removeFromWaiting(t, token) {
  const i = seatOf(t, token); if (i < 0) return;
  if (t.seats[i].dropTimer) clearTimeout(t.seats[i].dropTimer);
  t.seats[i] = null;
  const p = players.get(token); if (p) p.tableId = null;
  t.seats = t.seats.filter(s => s).concat([null, null, null, null]).slice(0, 4);
  if (!t.seats.some(s => s && !s.bot)) { tables.delete(t.id); return; }
  if (t.owner === token) t.owner = (t.seats.find(s => s && !s.bot) || {}).token || null;
  broadcast(t); broadcastWaiting();
}

// ---------------- Oyun akışı ----------------
function startMatch(t) {
  const used = t.seats.filter(Boolean).map(s => s.name);
  t.seats = t.seats.map(s => {
    if (s) return s;
    let n; do { n = BOT_NAMES[botSeq++ % BOT_NAMES.length]; } while (used.includes(n)); used.push(n);
    return { token: null, name: n, bot: true, online: true };
  });
  t.status = 'playing';
  t.M = K.newMatch(t.numHands, t.seats[0].name);
  t.M.names = t.seats.map(s => s.name);
  K.deal(t.M);
  schedule(t); broadcast(t);
}
function schedule(t) {
  if (t.timer) clearTimeout(t.timer);
  t.timer = null;
  const M = t.M; if (!M) return;
  const g = M.g;
  if (g.over) {
    if (M.ended) { t.status = 'ended'; t.deadline = 0; t.timer = setTimeout(() => closeTable(t), 120000); }
    else { t.deadline = Date.now() + NEXT_HAND_MS; t.timer = setTimeout(() => { K.nextHand(M); schedule(t); broadcast(t); }, NEXT_HAND_MS); }
    return;
  }
  const s = t.seats[g.turn];
  if (s.bot) { t.deadline = Date.now() + 3000; t.timer = setTimeout(() => botTurn(t), 700 + Math.random() * 500); return; }
  const ms = s.online ? TURN_MS : OFFLINE_TURN_MS;
  t.deadline = Date.now() + ms;
  t.timer = setTimeout(() => autoTurn(t), ms);
}
// Bilgisayar oyuncu: çek, aç/işle, at — her adım masaya ayrı yansır
function botTurn(t) {
  const M = t.M, g = M.g, s = g.turn, myHand = g.handNo;
  if (g.over || !t.seats[s].bot) return schedule(t);
  const steps = [];
  if (g.phase === 'draw') steps.push(() => K.botDraw(M, s));
  steps.push(() => K.botMeld(M, s));
  steps.push(() => K.botDiscard(M, s));
  (function next() {
    if (t.M !== M || M.g !== g || g.over || g.turn !== s) return schedule(t);
    const step = steps.shift(); if (!step) return;
    step();
    if (g.over || g.turn !== s) { schedule(t); broadcast(t); return; }
    broadcast(t);
    t.timer = setTimeout(next, 650 + Math.random() * 400);
  })();
}
// Süresi dolan ya da bağlantısı kopan oyuncu: taş çekilir ve bir taş atılır (onun yerine açılmaz)
function autoTurn(t) {
  const M = t.M, g = M.g, s = g.turn;
  if (g.over) return schedule(t);
  if (g.phase === 'draw') { K.drawCenter(M, s); if (g.over) { schedule(t); broadcast(t); return; } }
  if (g.mustUse != null && g.hands[s].indexOf(g.mustUse) >= 0) { K.returnLeft(M, s); K.drawCenter(M, s); if (g.over) { schedule(t); broadcast(t); return; } }
  K.botDiscard(M, s);
  schedule(t); broadcast(t);
}
function closeTable(t) {
  if (t.timer) clearTimeout(t.timer);
  t.seats.forEach(s => { if (s && s.token) { const p = players.get(s.token); if (p && p.tableId === t.id) { p.tableId = null; sendTo(s.token, { t: 'menu' }); } } });
  tables.delete(t.id);
}
function leaveTable(p) {
  const t = tables.get(p.tableId); p.tableId = null;
  if (!t) return;
  if (t.status === 'waiting') return removeFromWaiting(t, p.token);
  const i = seatOf(t, p.token); if (i < 0) return;
  // Oyun bozulmasın: yerine bilgisayar geçer
  t.seats[i] = { token: null, name: p.name + ' (bilg.)', bot: true, online: true };
  t.M.names[i] = t.seats[i].name;
  if (!t.seats.some(s => s && !s.bot)) return closeTable(t);
  if (!t.M.g.over && t.M.g.turn === i) schedule(t);
  broadcast(t);
}

// ---------------- Oyuncu hamleleri ----------------
function isInt(x) { return Number.isInteger(x) && x >= 0 && x < 200; }
function humanAct(t, seat, msg) {
  const M = t.M; if (!M || t.status !== 'playing') return { ok: false, err: 'Şu anda hamle yapılamaz.' };
  const g = M.g;
  if (g.over) return { ok: false, err: 'El bitti, yeni el bekleniyor.' };
  if (g.turn !== seat) return { ok: false, err: 'Sıra sende değil.' };
  switch (msg.a) {
    case 'drawCenter': return K.drawCenter(M, seat);
    case 'drawLeft': return K.drawLeft(M, seat);
    case 'returnLeft': return K.returnLeft(M, seat);
    case 'open': return K.open(M, seat, msg.x);
    case 'addTo': return isInt(msg.x) && isInt(msg.y) ? K.addTo(M, seat, msg.x, msg.y) : { ok: false, err: 'Geçersiz hamle.' };
    case 'discard': return isInt(msg.x) ? K.discard(M, seat, msg.x, msg.y === true) : { ok: false, err: 'Geçersiz hamle.' };
  }
  return { ok: false, err: 'Bilinmeyen hamle.' };
}

function onMessage(ws, msg, ctx) {
  if (msg.t === 'hello') {
    const token = String(msg.token || '').slice(0, 64);
    if (token.length < 10) return ws.send({ t: 'err', m: 'Geçersiz oturum.' });
    let p = players.get(token);
    if (!p) { p = { token, name: cleanName(msg.name), ws: null, tableId: null }; players.set(token, p); }
    p.name = cleanName(msg.name);
    if (p.ws && p.ws !== ws) { const old = p.ws; p.ws = null; old.onclose = null; old.close(); }
    p.ws = ws; ctx.p = p;
    ws.send({ t: 'welcome', stats: onlineStats() });
    const t = p.tableId && tables.get(p.tableId);
    if (t) {
      const i = seatOf(t, token);
      if (i >= 0) {
        const s = t.seats[i];
        if (s.dropTimer) { clearTimeout(s.dropTimer); s.dropTimer = null; }
        s.online = true;
        if (t.M && !t.M.g.over && t.M.g.turn === i) schedule(t); // süresi yeniden başlar
        broadcast(t); return;
      }
      p.tableId = null;
    }
    ws.send({ t: 'menu' });
    return;
  }
  const p = ctx.p; if (!p) return ws.send({ t: 'err', m: 'Önce bağlan.' });
  const t = p.tableId && tables.get(p.tableId);
  switch (msg.t) {
    case 'quick': if (t) return broadcast(t); return joinQuick(p, String(msg.room || 'genel'));
    case 'lobby': return ws.send(lobby());
    // 30 sn bekleyen oyuncu boş yerlere bilgisayar oturtup başlatabilir
    case 'fillBots':
      if (!t || t.status !== 'waiting' || Date.now() - t.created < 30000 || seatOf(t, p.token) < 0) return;
      return startMatch(t);
    case 'leave': if (t) leaveTable(p); return ws.send({ t: 'menu' });
    case 'sync': if (t) return ws.send(viewFor(t, seatOf(t, p.token))); return ws.send({ t: 'menu' });
    case 'ping': return ws.send({ t: 'pong' });
    case 'act': {
      if (!t) return ws.send({ t: 'menu' });
      const i = seatOf(t, p.token); if (i < 0) return;
      const r = humanAct(t, i, msg);
      if (r.warn) return ws.send({ t: 'warn', warn: r.warn, id: msg.x });
      if (!r.ok) return ws.send({ t: 'err', m: r.err || 'Hamle yapılamadı.' });
      schedule(t); broadcast(t);
      return;
    }
  }
}
function onClose(ctx) {
  const p = ctx.p; if (!p || p.ws !== ctx.ws) return;
  p.ws = null;
  const t = p.tableId && tables.get(p.tableId); if (!t) return;
  const i = seatOf(t, p.token); if (i < 0) return;
  t.seats[i].online = false;
  if (t.status === 'waiting') {
    t.seats[i].dropTimer = setTimeout(() => { const pp = players.get(p.token); if (pp && !pp.ws) removeFromWaiting(t, p.token); }, WAIT_DROP_MS);
  } else if (t.M && !t.M.g.over && t.M.g.turn === i) schedule(t);
  broadcast(t);
}

// ---------------- HTTP + WebSocket ----------------
const server = http.createServer((req, res) => {
  if (req.url === '/durum') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify(Object.assign({ masalar: tables.size }, onlineStats())));
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('101 Okey sunucusu çalışıyor.');
});
const sockets = new Set();
server.on('upgrade', (req, socket) => {
  const ws = wsAccept(req, socket); if (!ws) return;
  sockets.add(socket); socket.on('close', () => sockets.delete(socket));
  const ctx = { ws, p: null };
  ws.onmessage = (m) => onMessage(ws, m, ctx);
  ws.onclose = () => onClose(ctx);
});
setInterval(() => { for (const s of sockets) { try { s.write(Buffer.from([0x89, 0])); } catch (e) {} } }, 25000);
setInterval(() => { for (const [k, p] of players) if (!p.ws && !p.tableId) players.delete(k); }, 600000);
server.listen(PORT, () => console.log('101 Okey sunucusu port ' + PORT + ' üzerinde çalışıyor'));
