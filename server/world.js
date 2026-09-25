// The authoritative simulation of ONE zone. Clients only send intentions (inputs, "I use this ability");
// every position, hit, and reward is decided here. server/index.js runs one World per zone and moves players between them.
const MAP = require('../shared/map.js'), DEFS = require('../shared/defs.js');
const { T } = MAP, { ABILITIES, AB_ORDER, STUN_BONUS, MOBS, QUESTS, TOWNSFOLK, RELICS, ZONE_XP, HOUSE_RULES, xpToLevel, validLook, DEFAULT_LOOK,
  DROPS, creditsFor, MATERIALS, NODE_MATERIAL, GATHER, GEAR, gearCost, TALENTS, talentPoints, respecCost, derive } = DEFS;
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const normAng = (a) => Math.atan2(Math.sin(a), Math.cos(a)), r2 = (v) => +v.toFixed(2);
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
const VIEW = 420;         // interest radius in pixels: you only receive entities this close
const CD_GRACE = 0.1;     // accept an ability this early to absorb network jitter; the leftover carries into the next cooldown
const WEAPON_AB = { razor: 1, whip: 1, fist: 1 }; // sheathed inside safe areas
let nextId = 1;           // ids are unique across all zones, since players move between them
const RELIC_RANGE = 24;  // walk this close to a relic to discover it
const GIVERS = Object.fromEntries(TOWNSFOLK.filter(f => f.giver).map(f => [f.id, { zone: f.zone, x: f.path[0][0] * T, y: f.path[0][1] * T }]));
const NPC_RANGE = 60;     // how close you must stand to a smith, trader or trainer (they all stand still)
const FOLK = Object.fromEntries(TOWNSFOLK.map(f => [f.id, { ...f, x: f.path[0][0] * T, y: f.path[0][1] * T }]));
const MAX_MAT = 9999, MAX_CREDITS = 9999999, BUY_MARKUP = 3; // traders sell at 3x a material's value and buy at 1x
const intIn = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const savedInt = (o, k, max) => o && typeof o === 'object' && own(o, k) && intIn(o[k], 0, max) ? o[k] : 0; // own properties only

class World {
  // hooks.announce(msg): a system message for every player online, in every zone.
  constructor(zone, hooks) {
    this.zone = zone; this.map = MAP.load(zone); this.hooks = hooks || {};
    this.players = new Map(); this.mobs = []; this.shots = []; this.tick = 0; this.events = [];
    this.relics = this.map.props.filter(p => p.type === 'relic');
    for (const c of this.map.camps) for (let i = 0; i < c.n; i++) this.spawnMob(c);
    this.nodes = this.map.nodes.map(n => ({ ...n, left: 0 })); // left: seconds until a gathered node grows back
  }
  id() { return nextId++; }
  spawnMob(c, m) {
    const D = MOBS[c.type]; let x, y, tries = 0;
    do { x = (c.x + rand(-c.r, c.r)) * T + 8; y = (c.y + rand(-c.r, c.r)) * T + 8; } while (MAP.blocked(this.map, x, y, D.r) && tries++ < 40);
    if (MAP.blocked(this.map, x, y, D.r)) { x = c.x * T + 8; y = c.y * T + 8; }
    const mob = m || { id: this.id(), type: c.type, spawn: c };
    Object.assign(mob, { x, y, hx: x, hy: y, r: D.r, hp: D.hp, max: D.hp, face: rand(0, TAU), state: 'idle', st: 0, stMax: 1, cd: rand(0.5, 1.5), tg: null, stun: 0, dead: false, respawn: 0,
      wander: rand(0, 3), dmgBy: new Map(), kvx: 0, kvy: 0, kbBy: null, aim: 0, combo: 0 });
    if (!m) this.mobs.push(mob); return mob;
  }
  // ---------- players ----------
  addPlayer(account, send) {
    const c = account.char;
    const p = { id: this.id(), username: account.username, name: c.name, look: validLook(c.look) || { ...DEFAULT_LOOK }, level: c.level, xp: c.xp, quests: c.quests || {},
      x: c.x, y: c.y, r: 5, hp: 1, maxHp: 1, dmg: 0, spd: 0, mods: null, face: 0, aim: 0,
      input: { u: 0, d: 0, l: 0, r: 0 }, cds: Object.fromEntries(AB_ORDER.map(k => [k, 0])), parryT: 0, inv: 0, dashT: 0, dvx: 0, dvy: 0, kvx: 0, kvy: 0,
      calm: 0, dead: false, respawnT: 0, send, msgBudget: 60, transfer: null, hkey: null, hname: '', hcolor: '', hsigil: '',
      // journal and statistics, sanitized because they come from the save file
      relics: Array.isArray(c.relics) ? c.relics.filter(id => own(RELICS, id)) : [], seen: Array.isArray(c.seen) ? c.seen.filter(z => own(MAP.ZONES, z)) : [],
      kills: Object.fromEntries(Object.entries(c.kills && typeof c.kills === 'object' ? c.kills : {}).filter(([k, v]) => own(MOBS, k) && Number.isInteger(v) && v > 0)),
      deaths: Number.isInteger(c.deaths) ? c.deaths : 0, played: Number.isFinite(c.played) ? c.played : 0,
      // upgrades: credits, materials, gear ranks and talents, all sanitized against the defs
      credits: intIn(c.credits, 0, MAX_CREDITS) ? c.credits : 0,
      mats: Object.fromEntries(Object.keys(MATERIALS).map(k => [k, savedInt(c.mats, k, MAX_MAT)])),
      gear: Object.fromEntries(Object.keys(GEAR).map(k => [k, savedInt(c.gear, k, GEAR[k].max)])),
      talents: Object.fromEntries(Object.keys(TALENTS).map(k => [k, savedInt(c.talents, k, TALENTS[k].max)])) };
    if (this.spent(p) > talentPoints(p.level)) for (const k of Object.keys(p.talents)) p.talents[k] = 0; // more points than levels: refund them all
    this.refresh(p); p.hp = c.hp == null || !Number.isFinite(c.hp) ? p.maxHp : clamp(c.hp, 1, p.maxHp);
    for (const q of Object.keys(p.quests)) if (!own(QUESTS, q)) delete p.quests[q]; // drop quests removed since the last save
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || MAP.blocked(this.map, p.x, p.y, p.r)) { p.x = this.map.spawn.x; p.y = this.map.spawn.y; }
    this.players.set(p.id, p); return p;
  }
  // First visit to this zone: remember it and grant discovery XP. index.js calls this after welcoming or transferring a player.
  discover(p) { if (p.seen.includes(this.zone)) return; p.seen.push(this.zone); const xp = ZONE_XP[this.zone] || 0; p.send({ t: 'discover', zone: this.zone, xp }); if (xp) this.giveXp(p, xp); }
  // Recompute everything gear and talents change. Call after a level-up, an upgrade or a talent change.
  refresh(p) { const d = derive(p.level, p.gear, p.talents); p.mods = d; p.maxHp = d.maxHp; p.dmg = d.dmg; p.spd = d.spd; p.hp = Math.min(p.hp, p.maxHp); }
  spent(p) { return Object.values(p.talents).reduce((a, b) => a + b, 0); }
  profile(p) { p.send({ t: 'profile', credits: p.credits, mats: p.mats, gear: p.gear, talents: p.talents }); }
  stats(p) { return { kills: p.kills, deaths: p.deaths, played: Math.round(p.played), relics: p.relics, seen: p.seen }; }
  // A player arriving by ship keeps all their state.
  adopt(p, x, y) { Object.assign(p, { x, y, kvx: 0, kvy: 0, dashT: 0, transfer: null }); this.players.set(p.id, p); }
  removePlayer(p) { this.players.delete(p.id); for (const m of this.mobs) if (m.tg === p) m.tg = null; }
  charOf(p) { return { name: p.name, look: p.look, level: p.level, xp: p.xp, zone: this.zone, x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp), quests: p.quests,
    house: p.hkey || null, relics: p.relics, seen: p.seen, kills: p.kills, deaths: p.deaths, played: Math.round(p.played), credits: p.credits, mats: p.mats, gear: p.gear, talents: p.talents }; }
  safe(x, y) { return MAP.inSafe(this.map, x, y); }
  // ---------- client messages ----------
  handle(p, m) {
    if (p.dead) return;
    switch (m.t) {
      case 'in': p.input = { u: m.u ? 1 : 0, d: m.d ? 1 : 0, l: m.l ? 1 : 0, r: m.r ? 1 : 0 }; if (Number.isFinite(m.a)) p.aim = normAng(m.a); break;
      case 'use': if (own(ABILITIES, m.ab)) this.use(p, m.ab, m.a, m.d); break;
      case 'quest': if (own(QUESTS, m.id)) this.quest(p, m); break;
      case 'gather': if (Number.isInteger(m.id)) this.gather(p, m.id); break;
      case 'fly': if (own(MAP.ZONES, m.to)) this.fly(p, m.to); break;
      case 'upgrade': if (own(GEAR, m.slot)) this.upgrade(p, m.slot); break;
      case 'talent': if (own(TALENTS, m.id)) this.talent(p, m.id); break;
      case 'respec': this.respec(p); break;
      case 'trade': if (own(FOLK, m.npc) && own(MATERIALS, m.mat) && intIn(m.qty, 1, 100) && (m.action === 'buy' || m.action === 'sell')) this.trade(p, FOLK[m.npc], m.mat, m.qty, m.action); break;
    }
  }
  near(p, f) { return f.zone === this.zone && dist(p, f) <= NPC_RANGE; }
  // ---------- ships, gathering, upgrades, talents, trade ----------
  fly(p, to) { // board your ship: stand by its ramp and pick another zone. index.js performs the move after the tick.
    if (to === this.zone || p.transfer || dist(p, this.map.pad.ramp) > MAP.BOARD_RANGE) return;
    p.transfer = { zone: to, flight: true }; this.ev({ k: 'launch', id: p.id, x: Math.round(this.map.pad.x), y: Math.round(this.map.pad.y) });
  }
  gather(p, id) {
    const n = this.nodes[id]; if (!n || n.left > 0 || dist(p, n) > GATHER.range) return;
    const mat = NODE_MATERIAL[n.kind], qty = 1 + (Math.random() < 0.5 + p.mods.fortune ? 1 : 0) + (Math.random() < p.mods.fortune ? 1 : 0);
    n.left = GATHER.respawn; this.addMat(p, mat, qty);
    this.ev({ k: 'gather', id: p.id, n: n.id, x: Math.round(n.x), y: Math.round(n.y) });
    p.send({ t: 'loot', x: Math.round(n.x), y: Math.round(n.y), credits: 0, mats: { [mat]: qty } }); this.profile(p);
    this.giveXp(p, MATERIALS[mat].value * 2);
  }
  addMat(p, mat, n) { p.mats[mat] = Math.min(MAX_MAT, p.mats[mat] + n); }
  upgrade(p, slot) {
    const smith = Object.values(FOLK).find(f => f.smith && this.near(p, f)); if (!smith) return this.notice(p, 'Find a smith to upgrade your gear.');
    const rank = p.gear[slot]; if (rank >= GEAR[slot].max) return this.notice(p, `Your ${GEAR[slot].name} is already at its best.`);
    const cost = gearCost(slot, rank), short = Object.entries(cost.mats).filter(([k, v]) => p.mats[k] < v);
    if (p.credits < cost.credits || short.length) return this.notice(p, 'You don\'t have enough ' + (short.length ? short.map(([k]) => MATERIALS[k].name).join(', ') : 'credits') + '.');
    p.credits -= cost.credits; for (const [k, v] of Object.entries(cost.mats)) p.mats[k] -= v;
    p.gear[slot]++; this.refresh(p); this.tell(p, `${smith.name} upgrades your ${GEAR[slot].name} to rank ${p.gear[slot]}.`);
    this.ev({ k: 'upgrade', id: p.id, x: Math.round(p.x), y: Math.round(p.y) }); this.profile(p);
  }
  talent(p, id) {
    if (this.spent(p) >= talentPoints(p.level) || p.talents[id] >= TALENTS[id].max) return;
    const was = p.maxHp; p.talents[id]++; this.refresh(p); if (p.maxHp > was) p.hp += p.maxHp - was; this.profile(p);
  }
  respec(p) {
    if (!Object.values(FOLK).some(f => f.trainer && this.near(p, f)) || !this.spent(p)) return;
    const cost = respecCost(p.level); if (p.credits < cost) return this.notice(p, `Resetting your talents costs ${cost} credits.`);
    p.credits -= cost; for (const k of Object.keys(p.talents)) p.talents[k] = 0; this.refresh(p); this.tell(p, 'Your talents are reset. Spend your points again from the menu.'); this.profile(p);
  }
  trade(p, npc, mat, qty, action) { // traders sell only what they stock; they buy any material
    if (!npc.trader || !this.near(p, npc)) return; const V = MATERIALS[mat].value;
    if (action === 'buy') { if (!npc.trader.includes(mat)) return; const cost = V * BUY_MARKUP * qty; if (p.credits < cost) return this.notice(p, 'Not enough credits.'); if (p.mats[mat] + qty > MAX_MAT) return; p.credits -= cost; this.addMat(p, mat, qty); }
    else { if (p.mats[mat] < qty) return; p.mats[mat] -= qty; p.credits = Math.min(MAX_CREDITS, p.credits + V * qty); }
    this.profile(p);
  }
  notice(p, msg) { p.send({ t: 'notice', msg }); }
  use(p, ab, a, d) {
    const A = ABILITIES[ab];
    if (p.cds[ab] > CD_GRACE || (WEAPON_AB[ab] && this.safe(p.x, p.y))) return;
    if (Number.isFinite(a)) p.aim = normAng(a);
    const M = p.mods; p.cds[ab] = M.cd[ab] + Math.max(0, p.cds[ab]); const ang = p.aim; p.face = ang;
    const ex = (e) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), ...e });
    if (ab === 'razor') {
      this.arcHit(p, ang, M.razorRange, A.arc, p.dmg * A.mult, A.knock);
      this.ev(ex({ k: 'razor', a: r2(ang) }));
    } else if (ab === 'whip') {
      const tx = p.x + Math.cos(ang) * M.whipRange, ty = p.y + Math.sin(ang) * M.whipRange;
      for (const mob of this.mobs) if (!mob.dead && segDist(mob.x, mob.y, p.x, p.y, tx, ty) < A.width + mob.r) {
        const d = dist(mob, p); this.damageMob(mob, p, p.dmg * A.mult, Math.atan2(p.y - mob.y, p.x - mob.x), d > 26 ? A.pull : 0, 'whip');
        if (!mob.dead) mob.stun = Math.max(mob.stun, A.stun); }
      this.ev(ex({ k: 'whip', a: r2(ang) }));
    } else if (ab === 'fist') {
      const cx = p.x + Math.cos(ang) * A.offset, cy = p.y + Math.sin(ang) * A.offset;
      for (const mob of this.mobs) if (!mob.dead && Math.hypot(mob.x - cx, mob.y - cy) < M.fistRadius + mob.r) {
        this.damageMob(mob, p, M.fistDmg, Math.atan2(mob.y - p.y, mob.x - p.x), A.knock, 'fist');
        if (!mob.dead) { mob.stun = Math.max(mob.stun, A.stun); mob.combo = 0; } }
      for (const s of this.shots) if (s.hostile && Math.hypot(s.x - cx, s.y - cy) < M.fistRadius) s.life = 0; // the blast swats bolts out of the air
      this.ev(ex({ k: 'fist', a: r2(ang), fx: Math.round(cx), fy: Math.round(cy), r: Math.round(M.fistRadius) }));
    } else if (ab === 'dash') {
      const mv = this.moveDir(p), dir = Number.isFinite(d) ? normAng(d) : mv ? Math.atan2(mv[1], mv[0]) : ang;
      p.dvx = Math.cos(dir) * A.speed; p.dvy = Math.sin(dir) * A.speed; p.dashT = A.time; p.inv = A.inv;
      this.ev(ex({ k: 'dash', a: r2(dir) }));
    } else if (ab === 'parry') {
      p.parryT = M.parry; this.ev(ex({ k: 'guard', a: r2(ang) }));
    }
  }
  quest(p, m) {
    const Q = QUESTS[m.id], G = GIVERS[Q.giver]; if (!G || G.zone !== this.zone || dist(p, G) > 60) return;
    const st = p.quests[m.id];
    if (m.action === 'accept' && !st && p.level >= Q.minLevel) { p.quests[m.id] = { n: 0 }; this.tell(p, `Quest accepted: ${Q.name}`); }
    else if (m.action === 'turnin' && st && st.n >= Q.count) { const cr = Math.round(Q.xp * 0.4); delete p.quests[m.id]; p.credits = Math.min(MAX_CREDITS, p.credits + cr); this.tell(p, `Quest complete: ${Q.name} (+${Q.xp} xp, +${cr} credits)`); this.ev({ k: 'qdone', id: p.id, x: Math.round(p.x), y: Math.round(p.y) }); this.giveXp(p, Q.xp); this.profile(p); }
    else if (m.action === 'abandon' && st) { delete p.quests[m.id]; }
    p.send({ t: 'quests', q: p.quests });
  }
  tell(p, msg) { p.send({ t: 'chat', from: '', msg }); }
  ev(e) { this.events.push(e); }
  // ---------- combat ----------
  arcHit(p, ang, range, width, dmg, knock) {
    for (const mob of this.mobs) { if (mob.dead) continue; const d = dist(mob, p); if (d > range + mob.r) continue; const a = Math.atan2(mob.y - p.y, mob.x - p.x);
      if (Math.abs(angDiff(ang, a)) > width / 2 && d > mob.r + 4) continue; this.damageMob(mob, p, dmg, a, knock, 'razor'); }
  }
  damageMob(mob, p, dmg, dir, knock, ab) {
    const D = MOBS[mob.type], stunned = mob.stun > 0;
    // shields stop hits from the front unless the bearer is stunned; the pulse fist ignores them
    const blocked = D.guard && !stunned && ab !== 'fist' && ab !== 'wall' && Math.abs(angDiff(mob.face, Math.atan2(p.y - mob.y, p.x - mob.x))) < 1.15;
    const mult = (stunned ? STUN_BONUS : 1) * (blocked ? D.guard : 1), dealt = Math.max(1, Math.round(dmg * mult * rand(0.9, 1.1)));
    const kb = knock * D.kb * (blocked ? 0.3 : 1);
    mob.hp -= dealt; mob.kvx += Math.cos(dir) * kb; mob.kvy += Math.sin(dir) * kb; mob.hitT = 0;
    if (p.mods && p.mods.leech && !D.dummy && !p.dead && this.players.has(p.id)) p.hp = Math.min(p.maxHp, p.hp + dealt * p.mods.leech);
    if (kb > 200) mob.kbBy = p.id;
    mob.dmgBy.set(p.id, (mob.dmgBy.get(p.id) || 0) + dealt); if (!mob.tg && this.players.has(p.id)) mob.tg = p;
    this.ev({ k: 'hit', id: mob.id, by: p.id, x: Math.round(mob.x), y: Math.round(mob.y), n: dealt, crit: stunned ? 1 : 0, block: blocked ? 1 : 0, ab });
    if (mob.hp <= 0) { if (D.dummy) mob.hp = mob.max; else this.killMob(mob); } // training dummies never fall
  }
  killMob(mob) {
    const D = MOBS[mob.type]; mob.dead = true; mob.respawn = D.elite ? 90 : 20; mob.kvx = mob.kvy = 0;
    this.ev({ k: 'die', id: mob.id, x: Math.round(mob.x), y: Math.round(mob.y), type: mob.type });
    if (D.elite) { const names = [...mob.dmgBy.keys()].map(id => this.players.get(id)).filter(Boolean).map(p => p.name); if (names.length && this.hooks.announce) this.hooks.announce(`${D.name} has fallen to ${names.join(', ')}.`); }
    for (const [pid] of mob.dmgBy) { const p = this.players.get(pid); if (!p || p.dead || dist(p, mob) > 300) continue; // everyone who helped gets full credit
      let kin = 0; if (p.hkey) for (const o of this.players.values()) if (o !== p && !o.dead && o.hkey === p.hkey && dist(o, p) < HOUSE_RULES.kinshipRange) kin++;
      this.giveXp(p, Math.round(D.xp * (1 + Math.min(HOUSE_RULES.kinshipMax, kin * HOUSE_RULES.kinship))));
      p.kills[mob.type] = (p.kills[mob.type] || 0) + 1; this.loot(p, mob);
      for (const [qid, st] of Object.entries(p.quests)) { const Q = QUESTS[qid]; if (Q.kill === mob.type && st.n < Q.count) { st.n++; p.send({ t: 'quests', q: p.quests }); if (st.n === Q.count) this.tell(p, `${Q.name}: done. Return to ${TOWNSFOLK.find(f => f.id === Q.giver).name}.`); } } }
    mob.dmgBy.clear();
  }
  // Credits and material drops for one player who helped kill `mob`. Fortune raises both.
  loot(p, mob) {
    const f = 1 + p.mods.fortune, credits = Math.round(creditsFor(mob.type) * f * rand(0.8, 1.2)), mats = {}, table = own(DROPS, mob.type) ? DROPS[mob.type] : {};
    for (const [mat, chance] of Object.entries(table)) { const c = chance * f, n = Math.floor(c) + (Math.random() < c % 1 ? 1 : 0); if (n) { mats[mat] = n; this.addMat(p, mat, n); } }
    p.credits = Math.min(MAX_CREDITS, p.credits + credits);
    p.send({ t: 'loot', x: Math.round(mob.x), y: Math.round(mob.y), credits, mats }); this.profile(p);
  }
  giveXp(p, xp) {
    p.xp += xp; let up = false;
    while (p.xp >= xpToLevel(p.level)) { p.xp -= xpToLevel(p.level); p.level++; up = true; }
    if (up) { this.refresh(p); p.hp = p.maxHp; this.ev({ k: 'lvl', id: p.id, x: Math.round(p.x), y: Math.round(p.y), lvl: p.level }); if (this.hooks.announce) this.hooks.announce(`${p.name} reached level ${p.level}.`); }
  }
  // Returns 'miss' (dashing/dead), 'parry', or 'hit'. `shot` is set when a projectile is the source.
  hurtPlayer(p, dmg, src, shot) {
    if (p.dead || p.inv > 0) return 'miss';
    if (p.parryT > 0) {
      p.parryT = 0; p.cds.parry = 0; // a clean parry refunds the cooldown
      if (shot) { // deflect it back at whoever threw it
        const tg = src && !src.dead ? src : null, a = tg ? Math.atan2(tg.y - shot.y, tg.x - shot.x) : Math.atan2(-shot.vy, -shot.vx), sp = Math.hypot(shot.vx, shot.vy) * 1.4;
        Object.assign(shot, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, hostile: false, owner: p, dmg: p.dmg * 1.5 + shot.dmg, life: 1.2 });
      } else { src.stun = 1.4; src.state = 'stunned'; src.combo = 0; }
      this.ev({ k: 'parry', id: p.id, x: Math.round((shot || src).x), y: Math.round((shot || src).y) });
      return 'parry';
    }
    p.hp -= dmg; p.calm = 0;
    const a = shot ? Math.atan2(shot.vy, shot.vx) : Math.atan2(p.y - src.y, p.x - src.x), kb = src && MOBS[src.type] && MOBS[src.type].aoe ? 170 : 60;
    p.kvx += Math.cos(a) * kb; p.kvy += Math.sin(a) * kb;
    this.ev({ k: 'hurt', id: p.id, x: Math.round(p.x), y: Math.round(p.y), n: dmg });
    if (p.hp <= 0) { p.hp = 0; p.dead = true; p.deaths++; p.respawnT = 5; p.dashT = 0; this.ev({ k: 'pdie', id: p.id, x: Math.round(p.x), y: Math.round(p.y) }); for (const m of this.mobs) if (m.tg === p) m.tg = null; }
    return 'hit';
  }
  moveDir(p) { const i = p.input; let x = i.r - i.l, y = i.d - i.u; const l = Math.hypot(x, y); return l ? [x / l, y / l] : null; }
  los(a, b) { const n = Math.ceil(dist(a, b) / 8); for (let i = 1; i < n; i++) if (MAP.blocksShot(this.map, a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false; return true; }
  // ---------- simulation step ----------
  step(dt) {
    this.tick++;
    for (const p of this.players.values()) {
      for (const k of AB_ORDER) p.cds[k] = Math.max(0, p.cds[k] - dt);
      p.parryT = Math.max(0, p.parryT - dt); p.inv = Math.max(0, p.inv - dt); p.msgBudget = Math.min(60, p.msgBudget + 60 * dt); p.played += dt;
      for (const r of this.relics) if (!p.dead && Math.abs(r.x - p.x) < RELIC_RANGE && Math.abs(r.y - p.y) < RELIC_RANGE && !p.relics.includes(r.id)) {
        const R = RELICS[r.id]; p.relics.push(r.id); p.send({ t: 'relic', id: r.id }); this.ev({ k: 'relic', id: p.id, x: r.x, y: r.y }); this.tell(p, `Relic found: ${R.name} (+${R.xp} xp). Read it in your Journal.`); this.giveXp(p, R.xp); }
      if (p.dead) { p.respawnT -= dt; if (p.respawnT <= 0) { p.dead = false; p.hp = p.maxHp; p.x = this.map.spawn.x; p.y = this.map.spawn.y; p.kvx = p.kvy = 0; this.ev({ k: 'respawn', id: p.id, x: p.x, y: p.y }); } continue; }
      let vx = 0, vy = 0;
      if (p.dashT > 0) { p.dashT -= dt; vx = p.dvx; vy = p.dvy; }
      else { const mv = this.moveDir(p); if (mv) { vx = mv[0] * p.spd; vy = mv[1] * p.spd; } }
      MAP.moveBy(this.map, p, (vx + p.kvx) * dt, (vy + p.kvy) * dt); p.kvx *= Math.exp(-9 * dt); p.kvy *= Math.exp(-9 * dt);
      p.face = p.aim;
      p.calm += dt; // out of combat for a while: regenerate; inside a safe area: regenerate fast
      if (p.hp < p.maxHp) { const safe = this.safe(p.x, p.y); if (safe || p.calm > 6) p.hp = Math.min(p.maxHp, p.hp + (safe ? 0.08 : 0.025) * p.maxHp * dt); }
    }
    for (const n of this.nodes) if (n.left > 0) n.left -= dt;
    for (const mob of this.mobs) this.mobStep(mob, dt);
    this.separate();
    for (const s of this.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (MAP.blocksShot(this.map, s.x, s.y)) { s.life = 0; continue; }
      if (s.hostile) { for (const p of this.players.values()) if (!p.dead && dist(s, p) < p.r + 3) { if (this.hurtPlayer(p, s.dmg, s.owner, s) === 'hit') s.life = 0; break; } }
      else for (const mob of this.mobs) if (!mob.dead && dist(s, mob) < mob.r + 3) { this.damageMob(mob, s.owner, s.dmg, Math.atan2(s.vy, s.vx), 80, 'bolt'); s.life = 0; break; }
    }
    this.shots = this.shots.filter(s => s.life > 0);
  }
  separate() { // keep mobs from stacking on one spot
    const ms = this.mobs.filter(m => !m.dead);
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j], dx = b.x - a.x, dy = b.y - a.y; if (Math.abs(dx) > 20 || Math.abs(dy) > 20 || !MOBS[a.type].spd || !MOBS[b.type].spd) continue;
      const d = Math.hypot(dx, dy), min = a.r + b.r + 1;
      if (d < min && d > 0.01) { const push = (min - d) / 2, nx = dx / d, ny = dy / d; MAP.moveBy(this.map, a, -nx * push, -ny * push); MAP.moveBy(this.map, b, nx * push, ny * push); } }
  }
  mobStep(mob, dt) {
    const D = MOBS[mob.type];
    if (mob.dead) { mob.respawn -= dt; if (mob.respawn <= 0) this.spawnMob(mob.spawn, mob); return; }
    if (D.dummy) { // stays planted; heals up once people stop hitting it
      mob.kvx = mob.kvy = 0; mob.stun = Math.max(0, mob.stun - dt); mob.state = mob.stun > 0 ? 'stunned' : 'idle'; mob.hitT = (mob.hitT || 0) + dt; if (mob.hitT > 4) { mob.hp = mob.max; mob.dmgBy.clear(); } return; }
    if (mob.kvx || mob.kvy) {
      const sp = Math.hypot(mob.kvx, mob.kvy), ox = mob.x, oy = mob.y, ex = mob.kvx * dt, ey = mob.kvy * dt;
      MAP.moveBy(this.map, mob, ex, ey);
      if (sp > 220 && mob.kbBy && Math.hypot(mob.x - ox, mob.y - oy) < Math.hypot(ex, ey) * 0.4) { // thrown into a wall
        const p = this.players.get(mob.kbBy); mob.kvx = mob.kvy = 0; mob.kbBy = null; mob.stun = Math.max(mob.stun, 1.0); mob.state = 'stunned';
        this.ev({ k: 'wall', x: Math.round(mob.x), y: Math.round(mob.y) });
        if (p) { this.damageMob(mob, p, p.dmg * 0.6, 0, 0, 'wall'); if (mob.dead) return; }
      }
      mob.kvx *= Math.exp(-8 * dt); mob.kvy *= Math.exp(-8 * dt);
      if (Math.hypot(mob.kvx, mob.kvy) < 4) { mob.kvx = mob.kvy = 0; mob.kbBy = null; }
    }
    if (mob.stun > 0) { mob.stun -= dt; mob.state = 'stunned'; mob.combo = 0; return; } if (mob.state === 'stunned') { mob.state = 'move'; mob.cd = 0.5; }
    mob.cd -= dt;
    const home = { x: mob.hx, y: mob.hy };
    // lose target if dead, gone, in a safe area, or dragged too far from home
    if (mob.tg && (mob.tg.dead || !this.players.has(mob.tg.id) || this.safe(mob.tg.x, mob.tg.y) || dist(mob, home) > D.leash * 1.5)) { mob.tg = null; mob.state = 'return'; }
    if (!mob.tg && mob.state !== 'return') { let best = null, bd = D.aggro; for (const p of this.players.values()) { if (p.dead || this.safe(p.x, p.y)) continue; const d = dist(p, mob); if (d < bd && dist(p, home) < D.leash) { bd = d; best = p; } } mob.tg = best; }
    const step = (tx, ty, mul) => { const a = Math.atan2(ty - mob.y, tx - mob.x); MAP.moveBy(this.map, mob, Math.cos(a) * D.spd * (mul || 1) * dt, Math.sin(a) * D.spd * (mul || 1) * dt); mob.face = a; };
    if (mob.state === 'return') { if (dist(mob, home) > 8) step(home.x, home.y, 1.4); else { mob.state = 'idle'; mob.hp = mob.max; mob.dmgBy.clear(); } return; }
    const tg = mob.tg;
    if (mob.state === 'wind') {
      mob.st -= dt;
      if ((D.ranged || D.lunge) && tg && mob.st > mob.stMax * 0.35) mob.aim = Math.atan2(tg.y - mob.y, tg.x - mob.x); // track the target, then lock aim so it can be dodged
      mob.face = mob.aim;
      if (mob.st <= 0) this.mobStrike(mob, D);
      return;
    }
    if (mob.state === 'rec') { mob.st -= dt; if (mob.st <= 0) { mob.state = 'move'; mob.cd = D.cd; } return; }
    const windUp = (t) => { mob.state = 'wind'; mob.st = mob.stMax = t; mob.aim = Math.atan2(tg.y - mob.y, tg.x - mob.x); };
    if (tg) {
      const d = dist(tg, mob), a = Math.atan2(tg.y - mob.y, tg.x - mob.x), reach = D.reach + (D.lunge || 0);
      if (D.ranged) {
        if (d > D.reach * 0.85) step(tg.x, tg.y);
        else if (d < D.keep) { step(mob.x - Math.cos(a) * 10, mob.y - Math.sin(a) * 10, 0.8); mob.face = a; }
        else mob.face = a;
        if (d < D.reach && mob.cd <= 0 && this.los(mob, tg)) windUp(D.wind);
      } else if (D.lunge) { // predators prowl at leaping distance, circling while the next leap recharges
        const want = D.reach + D.lunge * 0.7, side = mob.id % 2 ? 1 : -1;
        if (d > want + 6) step(tg.x, tg.y);
        else if (d < want - 10 && mob.cd > 0.2) { step(mob.x - Math.cos(a) * 10, mob.y - Math.sin(a) * 10, 0.7); mob.face = a; }
        else { step(mob.x + Math.cos(a + side * Math.PI / 2) * 10, mob.y + Math.sin(a + side * Math.PI / 2) * 10, 0.45); mob.face = a; }
        if (d < reach + 6 && mob.cd <= 0 && this.los(mob, tg)) windUp(D.wind);
      } else {
        if (d > D.reach) step(tg.x, tg.y); else mob.face = a;
        if (d < reach + 6 && mob.cd <= 0) windUp(D.wind);
      }
    }
    else { mob.wander += dt; if (dist(mob, home) > 30) step(home.x, home.y, 0.5); else if (Math.sin(mob.wander * 0.7) > 0.6) step(mob.x + Math.cos(mob.wander) * 10, mob.y + Math.sin(mob.wander) * 10, 0.35); }
  }
  mobStrike(mob, D) {
    if (D.lunge) { // leap along the locked aim, only as far as needed to reach the target (so a side-step still dodges it), then strike
      const tg = mob.tg, ahead = tg ? (tg.x - mob.x) * Math.cos(mob.aim) + (tg.y - mob.y) * Math.sin(mob.aim) : D.lunge, go = clamp(ahead - D.reach * 0.6, 0, D.lunge);
      MAP.moveBy(this.map, mob, Math.cos(mob.aim) * go, Math.sin(mob.aim) * go); }
    const at = { id: mob.id, x: Math.round(mob.x), y: Math.round(mob.y), a: r2(mob.aim) };
    if (D.ranged) {
      this.shots.push({ id: this.id(), x: mob.x + Math.cos(mob.aim) * 6, y: mob.y + Math.sin(mob.aim) * 6, vx: Math.cos(mob.aim) * D.bolt, vy: Math.sin(mob.aim) * D.bolt, owner: mob, hostile: true, dmg: D.dmg, life: D.reach / D.bolt + 0.35, kind: D.shot || 0 });
      this.ev({ k: 'mshot', ...at });
    } else if (D.aoe) {
      const cx = mob.x + Math.cos(mob.aim) * D.slamOff, cy = mob.y + Math.sin(mob.aim) * D.slamOff;
      for (const p of this.players.values()) if (!p.dead && Math.hypot(p.x - cx, p.y - cy) < D.slam + p.r) this.hurtPlayer(p, D.dmg, mob);
      this.ev({ k: 'mslam', ...at, x: Math.round(cx), y: Math.round(cy), r: D.slam });
    } else {
      for (const p of this.players.values()) { if (p.dead) continue; const d = dist(p, mob), a = Math.atan2(p.y - mob.y, p.x - mob.x);
        if (d < D.reach + 10 + p.r && Math.abs(angDiff(mob.aim, a)) < 1.0) this.hurtPlayer(p, D.dmg, mob); }
      this.ev({ k: 'mslash', ...at, l: D.lunge ? 1 : 0 });
    }
    if (mob.stun > 0) return; // parried mid-swing
    if (D.combo && mob.combo < D.combo - 1 && mob.tg) { mob.combo++; mob.state = 'wind'; mob.st = mob.stMax = D.wind * 0.8; mob.aim = Math.atan2(mob.tg.y - mob.y, mob.tg.x - mob.x); return; }
    mob.combo = 0; mob.state = 'rec'; mob.st = 0.45;
  }
  // ---------- network snapshot ----------
  snapshotFor(p, events) {
    const near = e => Math.abs(e.x - p.x) < VIEW && Math.abs(e.y - p.y) < VIEW;
    const ps = [], ms = [], ss = [];
    for (const o of this.players.values()) if (near(o)) ps.push([o.id, Math.round(o.x), Math.round(o.y), r2(o.face), Math.round(o.hp), o.maxHp, o.look.house, o.name, o.level, o.dead ? 1 : 0, o.dashT > 0 ? 1 : 0, o.look.hair, o.look.tone, o.hname, o.hcolor, o.hsigil]);
    for (const m of this.mobs) if (!m.dead && near(m)) ms.push([m.id, m.type, Math.round(m.x), Math.round(m.y), r2(m.face), Math.round(m.hp), m.max, m.state, m.state === 'wind' ? r2(1 - m.st / m.stMax) : 0, r2(m.aim || 0), m.stun > 0 ? 1 : 0]);
    for (const s of this.shots) if (near(s)) ss.push([Math.round(s.x), Math.round(s.y), r2(Math.atan2(s.vy, s.vx)), s.hostile ? 1 : 0, s.kind || 0]);
    const nd = []; for (const n of this.nodes) if (n.left > 0 && near(n)) nd.push(n.id);
    return { t: 's', k: this.tick, nd, me: { hp: Math.round(p.hp), maxHp: p.maxHp, xp: p.xp, next: xpToLevel(p.level), level: p.level, cd: AB_ORDER.map(k => r2(p.cds[k])), dead: p.dead, respawnT: +p.respawnT.toFixed(1), x: +p.x.toFixed(1), y: +p.y.toFixed(1) },
      p: ps, m: ms, sh: ss, ev: events.filter(e => near(e) || e.id === p.id) };
  }
  broadcastChat(from, msg) { for (const o of this.players.values()) o.send({ t: 'chat', from, msg }); }
}
function segDist(px, py, ax, ay, bx, by) { const vx = bx - ax, vy = by - ay, t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1); return Math.hypot(px - (ax + vx * t), py - (ay + vy * t)); }
module.exports = { World, GIVERS };
