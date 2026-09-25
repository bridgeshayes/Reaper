// Direct simulation tests (no network): map integrity per zone, enemy AI per type, parry, deflection, shields,
// pulse fist, ships, quest givers, gathering, loot, gear, talents and trade. Run: node test/world.js (also part of npm test)
const { World } = require('../server/world.js'), MAP = require('../shared/map.js'), DEFS = require('../shared/defs.js');
const T = MAP.T, DT = 0.05;
let failures = 0; const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const acct = (x, y, level) => ({ username: 'tester', char: { name: 'tester', look: DEFS.DEFAULT_LOOK, level: level || 12, xp: 0, x, y, hp: null, quests: {} } });
const zoneOf = (type) => Object.keys(MAP.ZONES).find(z => MAP.load(z).camps.some(c => c.type === type));
// A world with only one monster type and a lone player next to the nearest one.
function arena(type, d, level) {
  const w = new World(zoneOf(type)); w.mobs = w.mobs.filter(m => m.type === type);
  const mob = w.mobs[0], p = w.addPlayer(acct(mob.x, mob.y, level), () => {}); placeNear(w, p, mob, d || 14); return { w, p, mob };
}
// Put the player at the first open spot about `d` px from the monster, with a clear line between them.
function placeNear(w, p, mob, d) { for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2, x = mob.x + Math.cos(a) * d, y = mob.y + Math.sin(a) * d; if (!MAP.blocked(w.map, x, y, p.r) && w.los(mob, { x, y })) { p.x = x; p.y = y; return; } } throw new Error('no open spot'); }
const own0 = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function run(w, secs, each) { const evs = []; for (let i = 0; i < secs / DT; i++) { if (each) each(i); w.step(DT); evs.push(...w.events); w.events = []; } return evs; }

// ---------------- maps ----------------
for (const id of Object.keys(MAP.ZONES)) {
  const m = MAP.load(id), seen = new Uint8Array(m.w * m.h), sx = Math.floor(m.spawn.x / T), sy = Math.floor(m.spawn.y / T), q = [[sx, sy]]; seen[sy * m.w + sx] = 1;
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (MAP.solid(m, nx, ny) || seen[ny * m.w + nx]) continue; seen[ny * m.w + nx] = 1; q.push([nx, ny]); } }
  const reach = (tx, ty) => !!seen[Math.floor(ty) * m.w + Math.floor(tx)], bad = [];
  if (MAP.blocked(m, m.spawn.x, m.spawn.y, 5) || !MAP.inSafe(m, m.spawn.x, m.spawn.y)) bad.push('spawn');
  for (const c of m.camps) if (!reach(c.x, c.y)) bad.push(`camp ${c.type}@${c.x},${c.y}`);
  for (const p of m.props) if (p.type === 'relic' && !reach(p.x / T, p.y / T)) bad.push(`relic ${p.id}`);
  if (!m.pad || !reach(m.pad.ramp.x / T, m.pad.ramp.y / T) || !reach(m.pad.exit.x / T, m.pad.exit.y / T) || MAP.blocked(m, m.pad.exit.x, m.pad.exit.y, 5)) bad.push('landing pad');
  else if (Math.hypot(m.pad.exit.x - m.pad.ramp.x, m.pad.exit.y - m.pad.ramp.y) > MAP.BOARD_RANGE) bad.push('you land out of reach of your ship');
  const lost = m.nodes.filter(n => !reach(n.tx, n.ty) || MAP.inSafe(m, n.x, n.y)); if (lost.length) bad.push(`${lost.length} resource nodes unreachable or in town`);
  for (const f of DEFS.TOWNSFOLK.filter(f => f.zone === id && (f.smith || f.trader || f.trainer))) if (!MAP.inSafe(m, f.path[0][0] * T, f.path[0][1] * T) || f.path.length > 1) bad.push(`merchant ${f.id} must stand still in a safe area`);
  const lanes = DEFS.TOWNSFOLK.filter(f => f.zone === id).map(f => f.path).concat(id === 'citadel' ? DEFS.CITIZEN_LANES.map(l => [[l[0], l[1]], [l[2], l[3]]]) : []);
  for (const pts of lanes) for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length];
    for (let k = 0; k <= 30; k++) { const x = (a[0] + (b[0] - a[0]) * k / 30) * T, y = (a[1] + (b[1] - a[1]) * k / 30) * T; if (MAP.blocked(m, x, y, 4)) { bad.push(`walker blocked at ${(x / T).toFixed(1)},${(y / T).toFixed(1)}`); break; } } }
  check(!bad.length, `${m.name}: spawn, camps, relics, landing pad, resource nodes, NPCs and citizen lanes are all clear and reachable${bad.length ? ' — ' + bad.slice(0, 4).join('; ') : ''}`);
  check(MAP.load(id).M.every((v, i) => v === m.M[i]), `${m.name}: the map builds identically every time`);
}
for (const f of DEFS.TOWNSFOLK.filter(f => f.giver)) check(Object.values(DEFS.QUESTS).some(Q => Q.giver === f.id), `quest giver ${f.name} has quests`);
for (const Q of Object.values(DEFS.QUESTS)) if (!DEFS.TOWNSFOLK.some(f => f.id === Q.giver && f.giver) || !zoneOf(Q.kill)) check(false, `quest ${Q.name} has a giver and a place to hunt`);
for (const type of Object.keys(DEFS.MOBS)) if (!zoneOf(type)) check(false, `${type} spawns somewhere`);
for (const id of Object.keys(DEFS.RELICS)) if (!MAP.load(DEFS.RELICS[id].zone).props.some(p => p.type === 'relic' && p.id === id)) check(false, `relic ${id} is placed in its zone`);
for (const z of Object.keys(MAP.ZONES)) { const n = MAP.load(z).nodes; if (z !== 'citadel') check(n.length >= 50 && n.every(x => DEFS.NODE_MATERIAL[x.kind]), `${MAP.ZONES[z].name} has resource nodes to gather (${n.length})`); }
for (const t of Object.keys(DEFS.MOBS)) if (!DEFS.MOBS[t].dummy && !own0(DEFS.DROPS, t)) check(false, `${t} has a drop table`);
{ let ok = true; for (const slot of Object.keys(DEFS.GEAR)) for (let r = 0; r < DEFS.GEAR[slot].max; r++) { const c = DEFS.gearCost(slot, r); if (!(c.credits > 0) || !Object.entries(c.mats).every(([k, v]) => own0(DEFS.MATERIALS, k) && v > 0)) ok = false; }
  check(ok, 'every gear rank has a valid cost'); }

// ---------------- enemy behaviour ----------------
{ const { w, p, mob } = arena('sharp', 110); const evs = run(w, 8, () => { p.hp = Math.max(p.hp, 50); });
  check(evs.some(e => e.k === 'mshot') && evs.some(e => e.k === 'hurt' && e.id === p.id), 'sharpshooters fire bolts that hurt');
  check(Math.hypot(mob.x - p.x, mob.y - p.y) > 40, 'sharpshooters keep their distance'); }
{ const { w, p } = arena('sharp', 110);
  const evs = run(w, 10, () => { p.hp = p.maxHp; if (w.shots.some(s => s.hostile && Math.hypot(s.x - p.x, s.y - p.y) < 20)) p.parryT = 0.2; });
  check(evs.some(e => e.k === 'parry' && e.id === p.id) && evs.some(e => e.k === 'hit' && e.ab === 'bolt' && e.by === p.id), 'a parry deflects a bolt back into a monster'); }
{ const { w, p } = arena('javelin', 120);
  const evs = run(w, 10, () => { p.hp = p.maxHp; if (w.shots.some(s => s.hostile && Math.hypot(s.x - p.x, s.y - p.y) < 22)) p.parryT = 0.2; });
  check(w.shots.every(s => s.kind === 2) && evs.some(e => e.k === 'mshot'), 'javelineers throw javelins');
  check(evs.some(e => e.k === 'hit' && e.ab === 'bolt' && e.by === p.id), 'a parried javelin flies back at the thrower'); }
{ const { w, p } = arena('drone', 100); const evs = run(w, 8, () => { p.hp = p.maxHp; });
  check(evs.some(e => e.k === 'mshot') && evs.some(e => e.k === 'hurt' && e.id === p.id), 'drill drones fire sparks'); }
{ const { w, p, mob } = arena('obsidian', 14); const evs = run(w, 5, () => { p.hp = p.maxHp; });
  check(evs.some(e => e.k === 'mslam') && evs.some(e => e.k === 'hurt' && e.id === p.id), 'obsidian brutes slam an area'); void mob; }
{ const { w, p, mob } = arena('warden', 16); const evs = run(w, 6, () => { p.hp = p.maxHp; p.x = mob.x + 16; p.y = mob.y; });
  check(evs.filter(e => e.k === 'mslam').length >= 2, 'the Mine Warden chains slams'); }
for (const type of ['gold', 'primus']) { const { w, p, mob } = arena(type, 12); const evs = run(w, 3, () => { p.hp = p.maxHp; p.x = mob.x + 12; p.y = mob.y; });
  check(evs.filter(e => e.k === 'mslash').length >= 2, `${DEFS.MOBS[type].name} strikes in combos`); }
for (const type of ['pitviper', 'wolf', 'crawler']) { const { w, p, mob } = arena(type, 45); let far = 0;
  const evs = run(w, 6, () => { p.hp = p.maxHp; if (mob.state === 'wind' && mob.st > mob.stMax - DT * 1.5) far = Math.max(far, Math.hypot(mob.x - p.x, mob.y - p.y)); });
  check(evs.some(e => e.k === 'mslash' && e.id === mob.id && e.l) && evs.some(e => e.k === 'hurt' && e.id === p.id), `${DEFS.MOBS[type].name} lunges and connects`);
  check(far > DEFS.MOBS[type].reach + 8, `${DEFS.MOBS[type].name} starts its lunge from out of melee range (${far.toFixed(0)} px)`); }
{ const { w, p, mob } = arena('legion', 14); let stunned = false; w.mobs = [mob]; // alone, so no other legionnaire can use up the parry
  run(w, 6, () => { p.hp = p.maxHp; if (mob.state === 'wind' && mob.st < 0.1) p.parryT = 0.2; if (mob.stun > 0.5) stunned = true; });
  check(stunned, 'a timed parry stuns a legionnaire mid-swing'); }
{ // shields: front hits are blocked, stuns and the pulse fist get through
  const { w, p, mob } = arena('enforcer', 20, 12); mob.hp = mob.max = 9999; mob.stun = 0;
  const hit = (ab) => { w.events = []; p.cds[ab] = 0; mob.face = Math.atan2(p.y - mob.y, p.x - mob.x); mob.stun = 0; mob.kvx = mob.kvy = 0; w.use(p, ab, Math.atan2(mob.y - p.y, mob.x - p.x)); return w.events.find(e => e.k === 'hit' && e.id === mob.id); };
  const front = hit('razor'); check(front && front.block === 1, 'an enforcer blocks a razor from the front');
  mob.face += Math.PI; w.events = []; p.cds.razor = 0; w.use(p, 'razor', Math.atan2(mob.y - p.y, mob.x - p.x)); const back = w.events.find(e => e.k === 'hit' && e.id === mob.id);
  check(back && !back.block, 'a razor from behind gets past the shield');
  const fist = hit('fist'); check(fist && !fist.block, 'the pulse fist ignores shields');
  mob.stun = 1; mob.face = Math.atan2(p.y - mob.y, p.x - mob.x); w.events = []; p.cds.razor = 0; w.use(p, 'razor', Math.atan2(mob.y - p.y, mob.x - p.x)); const st = w.events.find(e => e.k === 'hit' && e.id === mob.id);
  check(st && !st.block && st.crit, 'a stunned enforcer cannot block'); }
{ // pulse fist blasts a group away
  const w = new World('marches'); w.mobs = w.mobs.filter(m => m.type === 'hound').slice(0, 4); const p = w.addPlayer(acct(0, 0), () => {}); placeNear(w, p, w.mobs[0], 0.1);
  const ptx = Math.floor(p.x / T), pty = Math.floor(p.y / T); for (let y = pty - 7; y <= pty + 7; y++) for (let x = ptx - 7; x <= ptx + 7; x++) w.map.M[y * w.map.w + x] = MAP.TL.GROUND; // open ground, so nothing stops the blast
  w.mobs.forEach((m, i) => { m.x = p.x + 18 + (i % 2) * 6; m.y = p.y - 8 + i * 5; m.state = 'idle'; m.hp = m.max = 999; });
  const start = w.mobs.map(m => Math.hypot(m.x - p.x, m.y - p.y)); w.use(p, 'fist', 0); const hits = w.events.filter(e => e.k === 'hit' && e.ab === 'fist').length; run(w, 0.6);
  check(hits === 4 && w.mobs.every((m, i) => Math.hypot(m.x - p.x, m.y - p.y) - start[i] > 20), `pulse fist hits and throws every enemy in range (${hits}/4)`);
  w.events = []; w.use(p, 'fist', 0); check(!w.events.some(e => e.k === 'fist'), 'pulse fist cannot be spammed'); }
{ // whip pulls, razor has short reach, dash grants i-frames
  const w = new World('marches'); const m = w.mobs.find(x => x.type === 'hound'); w.mobs = [m]; const p = w.addPlayer(acct(0, 0), () => {}); placeNear(w, p, m, 0.1);
  m.hp = m.max = 999; const a = [1, 0]; for (let d = 70; d > 30; d -= 5) { if (!MAP.blocked(w.map, p.x + d, p.y, m.r) && w.los(p, { x: p.x + d, y: p.y })) { m.x = p.x + d; m.y = p.y; break; } } void a;
  const d0 = m.x - p.x; w.use(p, 'whip', 0); run(w, 0.4); check(m.x - p.x < d0 - 8, `whip pulls the target in (${d0.toFixed(0)} → ${(m.x - p.x).toFixed(0)} px)`);
  w.use(p, 'dash', 0, 0); check(p.inv > 0 && w.hurtPlayer(p, 10, m) === 'miss', 'dash makes you untouchable'); }

// ---------------- ships and quest givers ----------------
{ const w = new World('citadel'), p = w.addPlayer(acct(null, null, 1), () => {}), pad = w.map.pad;
  check(Math.hypot(p.x - w.map.spawn.x, p.y - w.map.spawn.y) < 1, 'new characters appear at the zone spawn');
  w.handle(p, { t: 'fly', to: 'marches' }); check(!p.transfer, 'you cannot fly from across the city');
  p.x = pad.exit.x; p.y = pad.exit.y; w.handle(p, { t: 'fly', to: 'citadel' }); w.handle(p, { t: 'fly', to: '__proto__' }); w.handle(p, { t: 'fly', to: 'toString' });
  check(!p.transfer, 'you cannot fly to where you are, or to places that do not exist');
  w.handle(p, { t: 'fly', to: 'marches' }); check(p.transfer && p.transfer.zone === 'marches' && p.transfer.flight, 'standing at your ship, you can fly to another zone');
  const sent = []; p.send = (m) => sent.push(m);
  const QM = DEFS.TOWNSFOLK.find(f => f.id === 'qm'), MS = DEFS.TOWNSFOLK.find(f => f.id === 'marshal');
  p.transfer = null; p.x = QM.path[0][0] * T - 20; p.y = QM.path[0][1] * T; p.level = 20;
  w.quest(p, { id: 'hounds', action: 'accept' }); check(!p.quests.hounds, "the Quartermaster won't hand out the Marshal's quests");
  w.quest(p, { id: 'gold', action: 'accept' }); check(!!p.quests.gold, 'the Quartermaster hands out bounties in the Citadel');
  const m = new World('marches'); m.adopt(p, MS.path[0][0] * T - 20, MS.path[0][1] * T);
  m.quest(p, { id: 'hounds', action: 'accept' }); check(!!p.quests.hounds, 'the Marshal hands out quests at the waystation');
  m.adopt(p, MS.path[0][0] * T + 200, MS.path[0][1] * T); m.quest(p, { id: 'crawlers', action: 'accept' }); check(!p.quests.crawlers, 'quest givers must be nearby');
  check(new World('lykos').mobs.every(x => !MAP.blocked(new World('lykos').map, x.x, x.y, x.r)) , 'every Lykos monster spawns on open ground'); }

// ---------------- gathering, loot, gear, talents, trade ----------------
{ const w = new World('lykos'), sent = [], p = w.addPlayer(acct(null, null, 8), (m) => sent.push(m)), n = w.nodes[0]; w.mobs = [];
  w.handle(p, { t: 'gather', id: n.id }); check(p.mats.ore + p.mats.crystal === 0, 'you must stand next to a node to gather it');
  p.x = n.x + 12; p.y = n.y; const mat = DEFS.NODE_MATERIAL[n.kind]; w.handle(p, { t: 'gather', id: n.id }); const got = p.mats[mat];
  check(got >= 1 && sent.some(m => m.t === 'loot' && m.mats[mat] === got) && sent.some(m => m.t === 'profile'), `gathering a node gives ${DEFS.MATERIALS[mat].name}`);
  w.handle(p, { t: 'gather', id: n.id }); w.handle(p, { t: 'gather', id: -1 }); w.handle(p, { t: 'gather', id: 1e9 }); w.handle(p, { t: 'gather', id: '0' });
  check(p.mats[mat] === got && w.snapshotFor(p, []).nd.includes(n.id), 'a gathered node is spent and shows as spent');
  run(w, DEFS.GATHER.respawn + 1); w.handle(p, { t: 'gather', id: n.id }); check(p.mats[mat] > got, 'nodes grow back'); }
{ const w = new World('marches'), sent = [], m = w.mobs.find(x => x.type === 'hound'); w.mobs = [m]; const p = w.addPlayer(acct(0, 0, 5), (x) => sent.push(x)); placeNear(w, p, m, 20);
  let hides = 0; for (let i = 0; i < 40; i++) { m.dead = false; m.dmgBy.set(p.id, 1); w.killMob(m); hides = p.mats.hide; }
  check(p.credits >= 40 * DEFS.creditsFor('hound') * 0.8 && hides > 5 && hides < 35 && sent.filter(x => x.t === 'loot').length === 40, `kills pay credits and drop materials (${p.credits} credits, ${hides} hides from 40 hounds)`); }
{ const w = new World('citadel'), sent = [], p = w.addPlayer(acct(null, null, 10), (m) => sent.push(m)), smith = DEFS.TOWNSFOLK.find(f => f.id === 'brakk'), notices = () => sent.filter(m => m.t === 'notice').length;
  const cost = DEFS.gearCost('razor', 0), hp0 = p.maxHp, dmg0 = p.dmg;
  p.credits = cost.credits; for (const [k, v] of Object.entries(cost.mats)) p.mats[k] = v;
  w.handle(p, { t: 'upgrade', slot: 'razor' }); check(p.gear.razor === 0 && notices() === 1, 'you need a smith nearby to upgrade gear');
  p.x = smith.path[0][0] * T + 20; p.y = smith.path[0][1] * T; w.handle(p, { t: 'upgrade', slot: 'razor' });
  check(p.gear.razor === 1 && p.credits === 0 && Object.keys(cost.mats).every(k => p.mats[k] === 0) && p.dmg > dmg0, 'a smith upgrades your razor for credits and materials');
  w.handle(p, { t: 'upgrade', slot: 'razor' }); w.handle(p, { t: 'upgrade', slot: '__proto__' }); w.handle(p, { t: 'upgrade', slot: 'constructor' }); check(p.gear.razor === 1, 'upgrades must be paid for in full');
  p.credits = 1e6; for (const k of Object.keys(p.mats)) p.mats[k] = 5000; for (let i = 0; i < 12; i++) w.handle(p, { t: 'upgrade', slot: 'armor' });
  check(p.gear.armor === DEFS.GEAR.armor.max && p.maxHp > hp0 * 1.9, `armor ranks raise health (${hp0} → ${p.maxHp}) and stop at rank ${DEFS.GEAR.armor.max}`);
  // talents: one point per level after the first
  for (let i = 0; i < 20; i++) w.handle(p, { t: 'talent', id: i < 7 ? 'might' : 'fortune' }); w.handle(p, { t: 'talent', id: 'hasOwnProperty' });
  check(p.talents.might === 5 && p.talents.fortune === 4 && w.spent(p) === DEFS.talentPoints(10), 'talents cap per talent and at one point per level');
  const archon = DEFS.TOWNSFOLK.find(f => f.trainer); p.credits = 0; w.handle(p, { t: 'respec' }); check(w.spent(p) === 9, 'resetting talents needs the trainer');
  p.x = archon.path[0][0] * T + 20; p.y = archon.path[0][1] * T; w.handle(p, { t: 'respec' }); check(w.spent(p) === 9, 'resetting talents costs credits');
  p.credits = DEFS.respecCost(10); w.handle(p, { t: 'respec' }); check(w.spent(p) === 0 && p.credits === 0, 'the trainer resets your talents for a fee');
  const saved = w.charOf(p), q = new World('citadel').addPlayer({ username: 'x', char: { ...saved, gear: { razor: 99, armor: 2, __proto__: { boots: 3 } }, talents: { might: 5, vitality: 5, reach: 5 }, mats: { ore: -4, hide: 1.5, scrap: 7 }, credits: 'lots' } }, () => {});
  check(q.gear.razor === 0 && q.gear.armor === 2 && q.gear.boots === 0 && q.mats.ore === 0 && q.mats.hide === 0 && q.mats.scrap === 7 && q.credits === 0, 'saved gear and materials are sanitized on load');
  check(new World('citadel').addPlayer({ username: 'y', char: { ...saved, level: 3, talents: { might: 5 } } }, () => {}).talents.might === 0, 'talents beyond your level are refunded on load'); }
{ const w = new World('citadel'), p = w.addPlayer(acct(null, null, 5), () => {}), corvin = DEFS.TOWNSFOLK.find(f => f.id === 'corvin'), V = DEFS.MATERIALS.hide.value;
  p.x = corvin.path[0][0] * T + 20; p.y = corvin.path[0][1] * T; p.credits = 100;
  w.handle(p, { t: 'trade', npc: 'corvin', mat: 'hide', qty: 2, action: 'buy' }); check(p.mats.hide === 2 && p.credits === 100 - 6 * V, 'traders sell what they stock');
  w.handle(p, { t: 'trade', npc: 'corvin', mat: 'frostite', qty: 1, action: 'buy' }); w.handle(p, { t: 'trade', npc: 'corvin', mat: 'hide', qty: 1e6, action: 'buy' }); w.handle(p, { t: 'trade', npc: 'corvin', mat: 'hide', qty: -3, action: 'sell' }); w.handle(p, { t: 'trade', npc: 'corvin', mat: 'hide', qty: 1.5, action: 'buy' });
  check(p.mats.hide === 2 && !p.mats.frostite && p.credits === 100 - 6 * V, 'traders refuse goods they lack and bad quantities');
  w.handle(p, { t: 'trade', npc: 'corvin', mat: 'hide', qty: 3, action: 'sell' }); w.handle(p, { t: 'trade', npc: 'corvin', mat: 'hide', qty: 2, action: 'sell' }); check(p.mats.hide === 0 && p.credits === 100 - 4 * V, 'you can sell only what you carry');
  w.handle(p, { t: 'trade', npc: 'brakk', mat: 'hide', qty: 1, action: 'buy' }); p.x += 400; w.handle(p, { t: 'trade', npc: 'corvin', mat: 'hide', qty: 1, action: 'buy' }); check(p.mats.hide === 0, 'only traders trade, and only up close'); }
{ const w = new World('citadel'), d = w.mobs.find(m => m.type === 'dummy'), p = w.addPlayer(acct(0, 0, 20), () => {}); w.mobs = [d]; placeNear(w, p, d, 16);
  const x0 = d.x; for (let i = 0; i < 400; i++) { p.cds.razor = 0; w.use(p, 'razor', Math.atan2(d.y - p.y, d.x - p.x)); } run(w, 1);
  check(!d.dead && d.x === x0 && d.hp > 0 && !p.xp && !p.credits, 'training dummies take hits but never fall or pay out'); run(w, 5); check(d.hp === d.max, 'a dummy heals once you stop'); }
{ const w = new World('marches'), m = w.mobs.find(x => x.type === 'hound'); w.mobs = [m]; const p = w.addPlayer(acct(0, 0, 10), () => {}); placeNear(w, p, m, 16);
  p.talents.renewal = 5; w.refresh(p); m.hp = m.max = 1e6; p.hp = 10; p.cds.razor = 0; w.use(p, 'razor', Math.atan2(m.y - p.y, m.x - p.x)); check(p.hp > 10, 'Renewal heals you as you deal damage');
  const base = DEFS.derive(10, {}, {}), rich = DEFS.derive(10, { boots: 5, gauntlet: 5 }, { reach: 5, shockwave: 5, reflexes: 5 });
  check(rich.spd > base.spd && rich.cd.dash < base.cd.dash && rich.cd.fist < base.cd.fist && rich.whipRange > base.whipRange && rich.fistRadius > base.fistRadius && rich.parry > base.parry, 'gear and talents change speed, cooldowns, reach and the parry window'); }

// ---------------- relics, discovery, kinship ----------------
{ const w = new World('marches'), p = w.addPlayer(acct(null, null, 3), () => {}), r = w.relics[0], sent = []; p.send = (m) => sent.push(m); w.mobs = [];
  const xp0 = p.level * 1e6 + p.xp; w.discover(p);
  check(sent.some(m => m.t === 'discover' && m.zone === 'marches' && m.xp > 0) && p.seen.includes('marches'), 'the first visit to a zone is a discovery worth XP');
  w.discover(p); check(sent.filter(m => m.t === 'discover').length === 1, 'a zone is only discovered once');
  p.x = r.x + 10; p.y = r.y; w.step(DT);
  check(p.relics.includes(r.id) && sent.some(m => m.t === 'relic' && m.id === r.id), 'walking up to a relic discovers it');
  check(p.level * 1e6 + p.xp > xp0 + DEFS.ZONE_XP.marches, 'relics grant XP'); w.step(DT);
  check(sent.filter(m => m.t === 'relic').length === 1, 'a relic is only discovered once');
  const c = w.charOf(p); check(c.relics.includes(r.id) && c.seen.includes('marches'), 'relics and discoveries are saved with the character');
  const q = new World('marches').addPlayer({ username: 'x', char: { ...c, relics: ['__proto__', r.id, 'nope'], kills: { hound: 3, __proto__: 5, legion: -1 } } }, () => {});
  check(q.relics.length === 1 && q.kills.hound === 3 && !Object.prototype.hasOwnProperty.call(q.kills, 'legion'), 'saved journal data is sanitized on load'); }
{ const w = new World('marches'), m = w.mobs.find(x => x.type === 'hound'); w.mobs = [m];
  const a = w.addPlayer(acct(0, 0, 12), () => {}), b = w.addPlayer(acct(0, 0, 12), () => {}), c = w.addPlayer(acct(0, 0, 12), () => {}); placeNear(w, a, m, 20); b.x = a.x; b.y = a.y; c.x = a.x; c.y = a.y;
  a.hkey = b.hkey = 'kin'; const x0 = a.xp, y0 = c.xp; m.dmgBy.set(a.id, 1); m.dmgBy.set(c.id, 1); w.killMob(m);
  check(a.xp - x0 === Math.round(DEFS.MOBS.hound.xp * 1.1) && c.xp - y0 === DEFS.MOBS.hound.xp, 'kinship: a housemate nearby adds 10% XP (and strangers get none)');
  check(a.kills.hound === 1, 'kills are counted for the bestiary'); }

// ---------------- player Houses ----------------
{ const { Houses } = require('../server/houses.js'), hs = {}, own = (k) => Object.prototype.hasOwnProperty.call(hs, k);
  const store = { getHouse: (k) => own(k) ? hs[k] : null, putHouse: (k, h) => { hs[k] = h; }, removeHouse: (k) => { delete hs[k]; }, getChar: () => null };
  const online = new Map(), mk = (name) => { const p = { username: name, name, level: 5, zone: 'citadel', inbox: [], send(m) { this.inbox.push(m); } }; online.set(name.toLowerCase(), p); return p; };
  const H = new Houses(store, online, () => {}), A = mk('Alpha'), B = mk('Beta'), C = mk('Gamma'), col = DEFS.HERALD_COLORS[0];
  for (const bad of ['__proto__', 'x', '<b>hi</b>', 'a'.repeat(30), 7]) H.handle(A, { action: 'create', name: bad, color: col, sigil: 'wolf' });
  check(!A.hkey && !own('__proto__') && Object.keys(hs).length === 0, 'invalid House names are refused');
  H.handle(A, { action: 'create', name: 'Aurelian', color: '#123456', sigil: 'wolf' }); check(!A.hkey, 'House colors must come from the heraldry list');
  H.handle(A, { action: 'create', name: 'Aurelian', color: col, sigil: 'wolf' }); check(A.hkey === 'aurelian' && A.hname === 'Aurelian' && A.hsigil === 'wolf', 'a player can found a House');
  H.handle(B, { action: 'create', name: 'AURELIAN', color: col, sigil: 'sun' }); check(!B.hkey, 'House names are unique, ignoring case');
  H.handle(C, { action: 'accept', key: 'aurelian' }); check(!C.hkey, 'you cannot join a House without an invitation');
  H.handle(A, { action: 'invite', target: 'beta' }); check(B.inbox.some(m => m.t === 'hinvite' && m.key === 'aurelian' && m.from === 'Alpha'), 'members can invite online players');
  H.handle(B, { action: 'accept', key: 'aurelian' }); check(B.hkey === 'aurelian' && hs.aurelian.members.length === 2, 'an invited player can join');
  H.handle(B, { action: 'kick', target: 'Alpha' }); H.handle(B, { action: 'disband' }); check(A.hkey === 'aurelian' && own('aurelian'), 'only the head of the House can remove members or disband');
  H.handle(A, { action: 'motto', text: 'Hail\u0007 the <i>sun</i>' + 'x'.repeat(80) }); check(hs.aurelian.motto.length <= DEFS.HOUSE_RULES.mottoMax && !/\u0007/.test(hs.aurelian.motto), 'mottos are trimmed and stripped of control characters');
  H.handle(A, { action: 'lead', target: 'Beta' }); check(hs.aurelian.leader === 'beta', 'the head can pass leadership on');
  H.handle(B, { action: 'kick', target: 'Alpha' }); check(!A.hkey && hs.aurelian.members.join() === 'beta' && A.inbox.some(m => m.t === 'house' && m.h === null), 'the head can remove a member');
  H.handle(B, { action: 'leave' }); check(!own('aurelian') && !B.hkey, 'a House with no members is dissolved');
  H.handle(A, { action: 'create', name: 'Two Words', color: col, sigil: 'crown' }); H.handle(C, { action: 'invite', target: 'Alpha' }); check(A.hkey === 'two words' && !C.inbox.some(m => m.t === 'hinvite'), 'players outside a House cannot invite');
  H.handle(A, { action: 'bogus' }); H.handle(A, { action: { toString: 1 } }); check(A.hkey === 'two words', 'unknown House actions are ignored'); }

console.log(failures ? `\n${failures} check(s) failed` : '\nAll world checks passed'); process.exit(failures ? 1 : 0);
