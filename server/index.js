// Entry point: HTTP static file server + WebSocket game server. Runs one World per zone in this process
// and flies players between them when they board their ship.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const store = require('./store'), { World } = require('./world'), { Houses } = require('./houses'), MAP = require('../shared/map.js'), { HOUSES, validLook } = require('../shared/defs.js');
const PORT = process.env.PORT || 3000, TICK = 20; // simulation + snapshot rate (Hz)
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

// ---------- static files ----------
const ROOT = path.join(__dirname, '..'), TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const ROUTES = { '/': 'client/index.html', '/game.js': 'client/game.js', '/art.js': 'client/art.js', '/audio.js': 'client/audio.js', '/shared/map.js': 'shared/map.js', '/shared/defs.js': 'shared/defs.js' };
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0], file = ROUTES[url];
  if (url === '/health') { res.writeHead(200); return res.end('ok'); }
  if (!file) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(path.join(ROOT, file), (err, data) => { if (err) { res.writeHead(500); return res.end('error'); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-cache' }); res.end(data); });
});

// ---------- game ----------
store.load();
const online = new Map(); // username(lower) -> player
const announce = (msg) => { for (const p of online.values()) p.send({ t: 'chat', from: '', msg }); };
const worlds = {}; for (const id of Object.keys(MAP.ZONES)) worlds[id] = new World(id, { announce });
const worldOf = (p) => worlds[p.zone];
const houses = new Houses(store, online, announce);
const save = (p) => store.saveChar(p.username, worldOf(p).charOf(p));
const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on('connection', (ws) => {
  let player = null, budget = 30;
  const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!player) {                     // ---- not logged in: only register/login allowed
      if (--budget < 0) return ws.close();
      const user = String(m.user || '').trim(), pass = String(m.pass || '');
      if (!/^[A-Za-z0-9_]{3,16}$/.test(user)) return send({ t: 'err', msg: 'Name must be 3-16 letters, numbers or _.' });
      if (pass.length < 6 || pass.length > 64) return send({ t: 'err', msg: 'Password must be 6-64 characters.' });
      let acc;
      if (m.t === 'register') { const look = validLook(m.look); if (!look) return send({ t: 'err', msg: 'Choose a House and a look.' }); const r = store.createAccount(user, pass, look, MAP.START_ZONE); if (r.error) return send({ t: 'err', msg: r.error }); acc = r.account; store.flush(); }
      else if (m.t === 'login') { acc = store.verify(user, pass); if (!acc) return send({ t: 'err', msg: 'Wrong name or password.' }); }
      else return;
      const key = acc.username.toLowerCase();
      const prev = online.get(key); if (prev) { save(prev); worldOf(prev).removePlayer(prev); online.delete(key); prev.send({ t: 'kicked' }); prev.ws.close(); }
      // characters saved before zones existed start in the Citadel
      if (!own(worlds, acc.char.zone)) { acc.char.zone = MAP.START_ZONE; acc.char.x = null; acc.char.y = null; }
      player = worlds[acc.char.zone].addPlayer(acc, send); player.zone = acc.char.zone; player.ws = ws; online.set(key, player);
      houses.attach(player, acc.char.house);
      send({ t: 'welcome', id: player.id, zone: player.zone, char: worldOf(player).charOf(player), quests: player.quests, online: online.size });
      worldOf(player).profile(player); worldOf(player).discover(player);
      if (player.hkey) houses.sync(player.hkey);
      announce(`${player.name} of House ${HOUSES.find(h => h.id === player.look.house).name} has arrived.`);
      return;
    }
    // ---- logged in
    if ((player.msgBudget -= 1) < 0) return; // flood protection
    if (m.t === 'chat') { // ch: undefined = everyone, 'h' = your House, 'w' = a whisper to one player (`to`)
      const msg = String(m.msg || '').slice(0, 200).trim(); if (!msg) return;
      if (m.ch === 'h') return houses.chat(player, msg);
      if (m.ch === 'w') { const t = online.get(String(m.to || '').slice(0, 16).toLowerCase()); if (!t) return send({ t: 'notice', msg: 'That player is not online.' });
        const w = { t: 'chat', from: player.name, to: t.name, msg, ch: 'w' }; t.send(w); if (t !== player) send(w); return; }
      for (const p of online.values()) p.send({ t: 'chat', from: player.name, msg }); return; }
    if (m.t === 'house') { const had = player.hkey; houses.handle(player, m); if (had && had !== player.hkey) houses.sync(had); return; }
    if (m.t === 'stats') return send({ t: 'stats', ...worldOf(player).stats(player) });
    if (m.t === 'roster') { player.msgBudget -= 4; return send({ t: 'roster', list: [...online.values()].slice(0, 100).map(p => ({ name: p.name, level: p.level, house: p.hname, zone: MAP.ZONES[p.zone].name })) }); }
    worldOf(player).handle(player, m);
  });
  ws.on('close', () => {
    if (!player) return; const key = player.username.toLowerCase();
    if (online.get(key) === player) { save(player); worldOf(player).removePlayer(player); online.delete(key); if (player.hkey) houses.sync(player.hkey); announce(`${player.name} has left.`); }
  });
});

// Fly a player who boarded their ship to the landing pad of the destination zone. They step off at the foot of the ramp.
function transfer(p) {
  const t = p.transfer, dest = worlds[t.zone]; if (!dest) { p.transfer = null; return; }
  worldOf(p).removePlayer(p);
  const at = dest.map.pad.exit;
  dest.adopt(p, at.x, at.y); p.zone = t.zone;
  p.send({ t: 'zone', zone: p.zone, x: at.x, y: at.y, flight: true });
  dest.discover(p);
}

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const w of Object.values(worlds)) {
    w.step(dt);
    const events = w.events; w.events = [];
    for (const p of w.players.values()) p.send(w.snapshotFor(p, events));
  }
  for (const p of online.values()) if (p.transfer) transfer(p);
}, 1000 / TICK);
setInterval(() => { for (const p of online.values()) save(p); store.flush(); }, 15000);
const shutdown = () => { for (const p of online.values()) save(p); store.flush(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
server.listen(PORT, () => console.log(`Reaper Online running at http://localhost:${PORT} (${Object.keys(worlds).length} zones)`));
