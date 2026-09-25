// Headless end-to-end test. Starts its own server on a spare port with a throwaway data file, then a bot:
// registers (probing bad input on the way), founds a House with a friend, walks to the Hangar and flies to the
// Rust Marches, gathers a resource node, takes the Marshal's hound quest, fights at the hound camp with every
// ability (parrying wind-ups), flies home, and checks XP, credits, quest progress and persistence across a relog.
// Pathfinding is a BFS over the shared map, so it keeps working when the maps change. Run: npm test
const { spawn } = require('child_process'), path = require('path'), os = require('os'), fs = require('fs'), WebSocket = require('ws');
const MAP = require('../shared/map.js'), DEFS = require('../shared/defs.js');
const PORT = 3999, DATA = path.join(os.tmpdir(), `reaper-test-${process.pid}.json`), T = MAP.T;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const MAPS = {}; const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k); const mapOf = (z) => MAPS[z] || (MAPS[z] = MAP.load(z));

function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}`), c = { ws, snap: null, welcome: null, zone: null, quests: {}, errs: [], events: [], msgs: [], prof: null };
  ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t !== 's') c.msgs.push(m);
    if (m.t === 's') { c.snap = m; c.events.push(...m.ev); } else if (m.t === 'welcome') { c.welcome = m; c.zone = m.zone; c.quests = m.quests; }
    else if (m.t === 'zone') { c.zone = m.zone; c.snap = null; } else if (m.t === 'quests') c.quests = m.q; else if (m.t === 'profile') c.prof = m; else if (m.t === 'err') c.errs.push(m.msg); });
  c.send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  c.open = new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  return c;
}
async function until(fn, ms, what) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); } console.log(`  (timed out waiting for ${what})`); return false; }
// Breadth-first search over walkable tiles; returns tile-centre waypoints with straight runs merged.
function route(map, fx, fy, tx, ty) {
  const W = map.w, start = Math.floor(fy / T) * W + Math.floor(fx / T), goal = Math.floor(ty / T) * W + Math.floor(tx / T), prev = new Int32Array(W * map.h).fill(-1), q = [start]; prev[start] = start;
  const open = (i) => !MAP.solid(map, i % W, Math.floor(i / W));
  for (let h = 0; h < q.length; h++) { const i = q[h]; if (i === goal) break; const x = i % W, y = Math.floor(i / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * W + nx; if (nx < 0 || ny < 0 || nx >= W || ny >= map.h || prev[j] !== -1 || !open(j)) continue; prev[j] = i; q.push(j); } }
  if (prev[goal] === -1) return null;
  const tiles = []; for (let i = goal; i !== start; i = prev[i]) tiles.push(i); tiles.reverse();
  const pts = tiles.map(i => [(i % W) * T + 8, Math.floor(i / W) * T + 8]);
  return pts.filter((p, k) => k === pts.length - 1 || !(pts[k + 1] && pts[k - 1] && ((pts[k - 1][0] === p[0] && pts[k + 1][0] === p[0]) || (pts[k - 1][1] === p[1] && pts[k + 1][1] === p[1]))));
}
// Steer toward a point with 8-way keys. Returns true within `tol` px, or 'zone' if we changed zones.
async function walkTo(c, x, y, tol = 4, ms = 15000) {
  const t0 = Date.now(), zone = c.zone; let last = null, stuck = 0;
  while (Date.now() - t0 < ms) {
    if (c.zone !== zone) return 'zone';
    const me = c.snap && c.snap.me; if (!me) { await sleep(50); continue; }
    const dx = x - me.x, dy = y - me.y; if (Math.hypot(dx, dy) < tol) { c.send({ t: 'in', u: 0, d: 0, l: 0, r: 0, a: 0 }); return true; }
    const nx = Math.abs(dx) > 2 ? Math.sign(dx) : 0, ny = Math.abs(dy) > 2 ? Math.sign(dy) : 0;
    c.send({ t: 'in', u: ny < 0 ? 1 : 0, d: ny > 0 ? 1 : 0, l: nx < 0 ? 1 : 0, r: nx > 0 ? 1 : 0, a: Math.atan2(dy, dx) });
    if (last && Math.hypot(me.x - last[0], me.y - last[1]) < 0.3) { if (++stuck > 30) { console.log(`  stuck at ${me.x},${me.y} heading to ${x},${y}`); return false; } } else stuck = 0;
    last = [me.x, me.y]; await sleep(80);
  }
  return false;
}
async function travel(c, x, y) { // path-find and walk; true when there, 'zone' if we changed zones on the way
  for (let tries = 0; tries < 3; tries++) {
    await until(() => c.snap, 3000, 'snapshot'); const me = c.snap.me, r = route(mapOf(c.zone), me.x, me.y, x, y); if (!r) { console.log(`  no route in ${c.zone} to ${x},${y}`); return false; }
    let ok = true; for (const [px, py] of r) { const res = await walkTo(c, px, py); if (res === 'zone') return 'zone'; if (!res) { ok = false; break; } }
    if (ok) return true;
  }
  return false;
}
const npc = (id) => { const f = DEFS.TOWNSFOLK.find(n => n.id === id); return { x: f.path[0][0] * T, y: f.path[0][1] * T, zone: f.zone }; };

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT), DATA_FILE: DATA }, stdio: ['ignore', 'pipe', 'inherit'] });
  let serverDied = false; server.on('exit', (code) => { serverDied = true; if (code) console.log(`server exited with code ${code}`); });
  await new Promise(r => server.stdout.on('data', d => { if (String(d).includes('running')) r(); }));
  try {
    // ---- registration and hostile input
    const c = client(); await c.open;
    c.send({ t: 'register', user: 'botgold', pass: 'hunter22', look: { house: 'nope', hair: 0, tone: 0 } });
    await until(() => c.errs.length, 2000, 'bad look error'); check(c.errs.length === 1, 'register rejects an invalid House');
    c.send({ t: 'login', user: '__proto__', pass: 'whatever1' }); await sleep(150); check(!serverDied, 'login as __proto__ does not crash the server');
    c.send({ t: 'register', user: 'botgold', pass: 'hunter22', look: { house: 'minerva', hair: 2, tone: 3 } });
    check(await until(() => c.welcome, 3000, 'welcome'), 'register with a valid look logs in');
    check(c.zone === 'citadel', 'new characters start in the Citadel');
    await until(() => c.snap, 2000, 'first snapshot');
    for (const m of [{ t: 'use', ab: '__proto__' }, { t: 'use', ab: 'constructor', a: 1e308 }, { t: 'quest', id: '__proto__', action: 'accept' }, { t: 'quest', id: 'toString', action: 'accept' },
      { t: 'in', u: 'x', a: 'NaN' }, { t: 'use', ab: 'razor', a: Infinity }, { t: 'nonsense' }, { t: 'use', ab: 'dash', d: 'left' }]) c.send(m);
    await sleep(200); check(!serverDied && c.ws.readyState === 1, 'malformed messages are ignored');
    c.send({ t: 'use', ab: 'razor', a: 0 }); await sleep(120); check(c.snap.me.cd[0] === 0, 'weapons are sheathed in the Citadel');

    // ---- found a House and bring a friend into it
    const f = client(); await f.open; f.send({ t: 'register', user: 'botfriend', pass: 'hunter22', look: { house: 'diana', hair: 1, tone: 1 } }); await until(() => f.snap, 3000, 'friend snapshot');
    c.send({ t: 'house', action: 'create', name: 'Botwright', color: DEFS.HERALD_COLORS[1], sigil: 'eagle' });
    check(await until(() => c.msgs.some(m => m.t === 'house' && m.h && m.h.name === 'Botwright'), 2000, 'house'), 'founds a House');
    c.send({ t: 'house', action: 'invite', target: 'BotFriend' });
    check(await until(() => f.msgs.some(m => m.t === 'hinvite' && m.name === 'Botwright'), 2000, 'invite'), 'the friend receives an invitation');
    f.send({ t: 'house', action: 'accept', key: 'botwright' });
    check(await until(() => f.msgs.some(m => m.t === 'house' && m.h && m.h.members.length === 2), 2000, 'join'), 'the friend joins the House');
    check(await until(() => f.snap && f.snap.p.some(r => r[7] === 'botgold' && r[13] === 'Botwright' && r[15] === 'eagle'), 2000, 'house tag'), 'House name and sigil show on nearby players');
    c.send({ t: 'chat', ch: 'h', msg: 'to the House' }); c.send({ t: 'chat', ch: 'w', to: 'botfriend', msg: 'psst' });
    check(await until(() => f.msgs.some(m => m.t === 'chat' && m.ch === 'h' && m.msg === 'to the House') && f.msgs.some(m => m.t === 'chat' && m.ch === 'w' && m.msg === 'psst'), 2000, 'chat'), 'House chat and whispers arrive');
    c.send({ t: 'roster' }); check(await until(() => c.msgs.some(m => m.t === 'roster' && m.list.some(r => r.name === 'botfriend' && r.house === 'Botwright')), 2000, 'roster'), 'the roster lists online players and their Houses');
    f.ws.close();

    // ---- through the south gate to the Hangar, and fly to the Marches
    check(c.prof && c.prof.credits === 0 && own(c.prof.gear, 'razor'), 'a new character gets an empty profile');
    c.send({ t: 'fly', to: 'marches' }); await sleep(300); check(c.zone === 'citadel', 'you cannot fly from the plaza');
    const pad = mapOf('citadel').pad; check(await travel(c, pad.ramp.x, pad.ramp.y + 8) === true, 'walks to the ship in the Hangar');
    c.send({ t: 'fly', to: 'marches' });
    check(await until(() => c.zone === 'marches', 3000, 'flight'), 'flies to the Rust Marches');
    await until(() => c.snap, 3000, 'marches snapshot'); const land = mapOf('marches').pad.exit;
    check(Math.hypot(c.snap.me.x - land.x, c.snap.me.y - land.y) < 20, 'lands on the Marches landing pad');
    // ---- gather the nearest resource node
    const nodes = mapOf('marches').nodes.slice().sort((a, b) => Math.hypot(a.x - land.x, a.y - land.y) - Math.hypot(b.x - land.x, b.y - land.y)), nd = nodes[0];
    check(await travel(c, nd.x, nd.y) === true, 'walks to a resource node');
    const mat = DEFS.NODE_MATERIAL[nd.kind]; c.send({ t: 'gather', id: nd.id });
    check(await until(() => c.prof && c.prof.mats[mat] > 0 && c.msgs.some(m => m.t === 'loot' && m.mats[mat]), 2000, 'gather'), 'gathers ' + DEFS.MATERIALS[mat].name);
    check(await until(() => c.snap && c.snap.nd.includes(nd.id), 1000, 'spent node'), 'the gathered node shows as spent');
    check(await until(() => c.msgs.some(m => m.t === 'discover' && m.zone === 'marches' && m.xp > 0), 2000, 'discovery'), 'arriving in a new zone is a discovery');
    const ms = npc('marshal'); check(await travel(c, ms.x + 18, ms.y) === true, 'reaches the Marshal at the waystation');
    c.send({ t: 'quest', id: 'hounds', action: 'accept' }); await until(() => c.quests.hounds, 2000, 'quest accept'); check(!!c.quests.hounds, 'accepts the hound quest');
    c.send({ t: 'quest', id: 'obsidian', action: 'accept' }); await sleep(150); check(!c.quests.obsidian, 'level-gated quest is refused');
    const camp = mapOf('marches').camps.find(k => k.type === 'hound');
    check(await travel(c, camp.x * T + 8, (camp.y - 2) * T + 8) === true, 'reaches the hound camp');

    // ---- fight
    const before = c.snap.me; c.send({ t: 'use', ab: 'dash', a: 0, d: 0 }); await sleep(300);
    check(Math.hypot(c.snap.me.x - before.x, c.snap.me.y - before.y) > 20, 'dash moves the player');
    const xp0 = c.snap.me.xp + c.snap.me.level * 1e6, used = { razor: 0, whip: 0, fist: 0, parry: 0 }; let parries = 0, hits = 0;
    const count = () => { for (const e of c.events.splice(0)) { if (e.k === 'parry' && e.id === c.welcome.id) parries++; if (e.k === 'hit' && e.by === c.welcome.id) hits++; } };
    c.events.length = 0; const t0 = Date.now();
    while (Date.now() - t0 < 90000 && !(c.quests.hounds && c.quests.hounds.n >= 3)) {
      const s = c.snap; if (!s) { await sleep(50); continue; } const me = s.me;
      count();
      if (me.dead) { await sleep(600); if (c.snap && !c.snap.me.dead) await travel(c, camp.x * T + 8, (camp.y - 2) * T + 8); continue; }
      const mobs = s.m.map(r => ({ id: r[0], x: r[2], y: r[3], state: r[7], pr: r[8] })).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
      const tg = mobs[0]; if (!tg) { await travel(c, camp.x * T + 8, camp.y * T + 8); continue; }
      const d = Math.hypot(tg.x - me.x, tg.y - me.y), a = Math.atan2(tg.y - me.y, tg.x - me.x), cd = Object.fromEntries(DEFS.AB_ORDER.map((k, i) => [k, me.cd[i]]));
      const threat = mobs.find(m => m.state === 'wind' && m.pr > 0.55 && Math.hypot(m.x - me.x, m.y - me.y) < 40);
      const near = mobs.filter(m => Math.hypot(m.x - me.x, m.y - me.y) < 60).length;
      if (threat && cd.parry === 0) { c.send({ t: 'use', ab: 'parry', a }); used.parry++; }
      else if (near >= 2 && cd.fist === 0 && d < 50) { c.send({ t: 'use', ab: 'fist', a }); used.fist++; }
      else if (d > 32 && d < 85 && cd.whip === 0) { c.send({ t: 'use', ab: 'whip', a }); used.whip++; }
      else if (d < 30 && cd.razor === 0) { c.send({ t: 'use', ab: 'razor', a }); used.razor++; }
      if (d > 22) c.send({ t: 'in', u: Math.sin(a) < -0.38 ? 1 : 0, d: Math.sin(a) > 0.38 ? 1 : 0, l: Math.cos(a) < -0.38 ? 1 : 0, r: Math.cos(a) > 0.38 ? 1 : 0, a });
      else c.send({ t: 'in', u: 0, d: 0, l: 0, r: 0, a });
      await sleep(60);
    }
    await sleep(250); count(); // quest updates arrive before the snapshot of the same tick; let the XP and events catch up
    console.log(`  used ${JSON.stringify(used)}; ${hits} hits landed, ${parries} parries`);
    check(hits > 0, 'attacks land on monsters');
    check(c.snap.me.xp + c.snap.me.level * 1e6 > xp0, 'killing monsters grants XP');
    check(c.quests.hounds && c.quests.hounds.n >= 3, `quest progress counts kills (${c.quests.hounds ? c.quests.hounds.n : 0})`);
    check(c.prof.credits > 0 && c.msgs.some(m => m.t === 'loot' && m.credits > 0), `kills pay credits (${c.prof.credits})`);

    // ---- fly home, then persistence
    const mpad = mapOf('marches').pad; check(await travel(c, mpad.ramp.x, mpad.ramp.y + 8) === true, 'walks back to the ship');
    c.send({ t: 'fly', to: 'citadel' }); check(await until(() => c.zone === 'citadel', 3000, 'flight home'), 'flies home to the Citadel');
    await until(() => c.snap, 3000, 'citadel snapshot'); const back = c.snap.me, credits = c.prof.credits;
    check(Math.hypot(back.x - pad.exit.x, back.y - pad.exit.y) < 30, 'lands in the Hangar');
    const lvl = back.level, xp = back.xp, n = c.quests.hounds ? c.quests.hounds.n : 0;
    c.ws.close(); await sleep(400);
    const c2 = client(); await c2.open; c2.send({ t: 'login', user: 'BotGold', pass: 'hunter22' });
    check(await until(() => c2.welcome, 3000, 'relog'), 'logs back in (name is case-insensitive)');
    check(c2.welcome.char.level === lvl && c2.welcome.char.xp === xp, 'level and XP persist');
    check(c2.welcome.quests.hounds && c2.welcome.quests.hounds.n === n, 'quest progress persists');
    check(c2.welcome.zone === 'citadel' && Math.hypot(c2.welcome.char.x - back.x, c2.welcome.char.y - back.y) < 20, 'zone and position persist');
    check(c2.welcome.char.look.house === 'minerva' && c2.welcome.char.look.hair === 2, 'look persists');
    check(c2.welcome.char.credits === credits && c2.welcome.char.mats[mat] > 0, 'credits and materials persist');
    check(c2.welcome.char.house === 'botwright' && c2.welcome.char.seen.includes('marches') && c2.welcome.char.kills.hound >= 3, 'House, discoveries and kills persist');
    check(await until(() => c2.msgs.some(m => m.t === 'house' && m.h && m.h.name === 'Botwright'), 2000, 'house on login'), 'House membership is restored at login');
    const c3 = client(); await c3.open; c3.send({ t: 'login', user: 'botgold', pass: 'wrongpass' }); await until(() => c3.errs.length, 2000, 'wrong-password error');
    check(c3.errs.length === 1 && !c3.welcome, 'wrong password is refused');
    c2.ws.close(); c3.ws.close();
  } catch (e) { console.error(e); failures++; }
  server.kill(); try { fs.unlinkSync(DATA); } catch (e) { /* never written */ }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed'); process.exit(failures ? 1 : 0);
})();
