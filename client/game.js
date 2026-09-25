// Reaper Online client. Renders what the server says is true, predicts your own movement so it feels instant,
// and sends only inputs/intentions. See CLAUDE.md for the protocol. Drawing primitives live in art.js.
(() => {
const MAP = window.SHARED_MAP, DEFS = window.SHARED_DEFS, ART = window.ART, SFX = window.SFX;
const { T } = MAP, { ABILITIES, AB_ORDER, MOBS, LORE, QUESTS, HOUSES, HAIR_STYLES, HAIR_TONES, TOWNSFOLK, PLAYER, RELICS, HOUSE_RULES, HERALD_COLORS, SIGILS, GEAR, TALENTS, MATERIALS, GATHER, NODE_MATERIAL } = DEFS;
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, ease = ART.ease;
const houseOf = (id) => HOUSES.find(h => h.id === id) || HOUSES[0];
const ACT_DUR = { razor: 0.26, whip: 0.42, fist: 0.5, parry: 0.3, mslash: 0.3, mshot: 0.3, mslam: 0.5 };
const WEAPON_AB = { razor: 1, whip: 1, fist: 1 };
const FONT_T = 'Cinzel, Georgia, serif', FONT_B = 'Inter, system-ui, sans-serif';
const ZNAME = (id) => MAP.ZONES[id].name;
const fmt = (n) => Math.floor(n || 0).toLocaleString('en-US');

// ---------------- connection ----------------
let ws, myId = null, me = null, connected = false, kicked = false;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => { connected = true; $('err').textContent = ''; };
  ws.onclose = () => { connected = false; if (myId) addChat('', kicked ? 'You logged in somewhere else.' : 'Disconnected from the server. Reload to reconnect.'); else $('err').textContent = 'Cannot reach the server.'; };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } if (handlers[m.t]) handlers[m.t](m); };
}
// Login and register wait for the socket if it is still connecting; everything else is dropped until connected.
const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); else if (ws && ws.readyState === 0 && (m.t === 'login' || m.t === 'register')) ws.addEventListener('open', () => ws.send(JSON.stringify(m)), { once: true }); };
connect();

// ---------------- login + character creator ----------------
const look = { ...DEFS.DEFAULT_LOOK };
try { const saved = DEFS.validLook(JSON.parse(localStorage.getItem('ro_look'))); if (saved) Object.assign(look, saved); $('user').value = localStorage.getItem('ro_user') || ''; } catch (e) { /* first visit */ }
function buildCreator() {
  $('houses').innerHTML = HOUSES.map(h => `<button class="house ${h.id === look.house ? 'on' : ''}" data-h="${h.id}" style="--c:${h.color}" title="House ${h.name}: ${h.trait}"><i></i>${h.name}</button>`).join('');
  $('hairs').innerHTML = HAIR_STYLES.map((n, i) => `<button class="chip ${i === look.hair ? 'on' : ''}" data-i="${i}">${n}</button>`).join('');
  $('tones').innerHTML = HAIR_TONES.map((c, i) => `<button class="tone ${i === look.tone ? 'on' : ''}" data-i="${i}" style="--c:${c}" aria-label="Hair tone ${i + 1}"></button>`).join('');
  const H = houseOf(look.house); $('who').innerHTML = `House ${H.name}<small>${H.trait}</small>`;
}
buildCreator();
$('houses').onclick = (e) => { const b = e.target.closest('.house'); if (!b) return; look.house = b.dataset.h; buildCreator(); SFX.play('click'); preview.swing = 0; };
$('hairs').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; look.hair = +b.dataset.i; buildCreator(); SFX.play('click'); };
$('tones').onclick = (e) => { const b = e.target.closest('.tone'); if (!b) return; look.tone = +b.dataset.i; buildCreator(); SFX.play('click'); };
const remember = () => { try { localStorage.setItem('ro_user', $('user').value); localStorage.setItem('ro_look', JSON.stringify(look)); } catch (e) { /* not persisted */ } };
$('loginBtn').onclick = () => { SFX.unlock(); remember(); send({ t: 'login', user: $('user').value, pass: $('pass').value }); };
$('regBtn').onclick = () => { SFX.unlock(); remember(); send({ t: 'register', user: $('user').value, pass: $('pass').value, look }); };
$('pass').onkeydown = (e) => { if (e.key === 'Enter') $('loginBtn').click(); };
const pcv = $('preview'), pctx = pcv.getContext('2d'), preview = { t: 0, swing: 0, act: null, n: 0, mx: 0, my: 0 };
pcv.addEventListener('mousemove', (e) => { const r = pcv.getBoundingClientRect(); preview.mx = e.clientX - r.left - r.width / 2; preview.my = e.clientY - r.top - r.height / 2; });
pcv.addEventListener('click', () => { preview.swing = 0; });
function drawPreview(dt) {
  const r = pcv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  if (pcv.width !== Math.round(r.width * d)) { pcv.width = Math.round(r.width * d); pcv.height = Math.round(r.height * d); }
  const g = pctx, w = pcv.width, h = pcv.height, s = h / 34;
  preview.t += dt; preview.swing -= dt;
  if (preview.swing <= 0) { const k = ['razor', 'whip', 'fist', 'razor', 'parry'][preview.n++ % 5]; preview.act = { k, t: 0, dur: ACT_DUR[k] * 1.6, dir: preview.n % 2 ? 1 : -1, p: 0 }; preview.swing = 1.9; }
  if (preview.act) { preview.act.t += dt; preview.act.p = preview.act.t / preview.act.dur; if (preview.act.p >= 1) preview.act = null; }
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
  g.setTransform(s, 0, 0, s, w / 2, h / 2 - 1.5 * s);
  g.fillStyle = 'rgba(255,200,120,0.08)'; g.beginPath(); g.ellipse(0, 3, 16, 8, 0, 0, TAU); g.fill();
  const face = preview.mx || preview.my ? Math.atan2(preview.my, preview.mx) : -Math.PI / 2 + Math.sin(preview.t * 0.6) * 0.5;
  ART.humanoid(g, { x: 0, y: 0, face, s: 1.1, pal: ART.playerPal(look), hair: look.hair, weapon: 'razor', act: preview.act, walk: 0, moving: false, t: preview.t, seed: 1, whipLen: 24 });
}

// ---------------- townsfolk (client-side, clock-driven so every client agrees) ----------------
const CIT_COLORS = ['red', 'red', 'red', 'brown', 'brown', 'pink', 'gray', 'gray', 'blue', 'green', 'violet', 'orange', 'yellow', 'silver', 'copper', 'gold', 'gold', 'gold', 'white'];
const CIT_NAMES = ['Aro', 'Bel', 'Cai', 'Dru', 'Eda', 'Fen', 'Gal', 'Hira', 'Ivo', 'Jem', 'Kel', 'Lio', 'Mara', 'Nils', 'Oda', 'Pax', 'Quin', 'Rhea', 'Sol', 'Tam', 'Una', 'Vex', 'Wynn', 'Yara', 'Zed', 'Corra', 'Delo', 'Isa'];
const CIT_LINES = { red: ['Another day, another shift.', 'The avenue is cleaner than any mine I ever worked.'], brown: ['Out of the way, dominus, the bread is hot.'], pink: ['Lovely evening, is it not?'],
  gray: ['Keep the peace inside the walls.', 'Patrol, eat, sleep, patrol.'], blue: ['The skies were clear over the Highlands today.'], green: ['The city grid hums nicely tonight.'], violet: ['Have you seen the light on the Spire at dusk?'],
  orange: ['Something in the east gate lift is grinding again.'], yellow: ['Drink water. The dust gets in your lungs.'], silver: ['Prices are up again. Blame the mines.'], copper: ['Paperwork never sleeps.'],
  gold: ['Hail, peer.', 'The Houses compete even inside these walls.'], white: ['Peace be on your blade.'] };
const CIT_LANES = DEFS.CITIZEN_LANES;
function makeFolk(zone) {
  const list = TOWNSFOLK.filter(f => f.zone === zone).map(f => ({ ...f }));
  if (zone === 'citadel') { let s = 99; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) { const L = CIT_LANES[Math.floor(R() * CIT_LANES.length)], u0 = R(), u1 = R(); if (Math.abs(u0 - u1) < 0.2) continue;
      const color = CIT_COLORS[Math.floor(R() * CIT_COLORS.length)];
      list.push({ id: 'c' + i, zone, name: CIT_NAMES[Math.floor(R() * CIT_NAMES.length)], color, citizen: true, house: color === 'gold' ? HOUSES[Math.floor(R() * HOUSES.length)] : null,
        path: [[lerp(L[0], L[2], u0), lerp(L[1], L[3], u0)], [lerp(L[0], L[2], u1), lerp(L[1], L[3], u1)]], lines: CIT_LINES[color] }); } }
  return list.map((d, i) => {
    const pts = d.path.map(([x, y]) => [x * T, y * T]), legs = [];
    let total = 0; for (let j = 0; j < pts.length; j++) { const a = pts[j], b = pts[(j + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); legs.push({ a, b, len, t0: total }); total += 2.8 + len / 15; }
    return Object.assign(d, { pts, legs, total, x: pts[0][0], y: pts[0][1], face: d.face || 0, walk: 0, moving: false, skin: Math.floor(ART.hsh(i * 7, 3) * ART.SKINS.length), seed: i });
  });
}

// ---------------- zones ----------------
const ZC = {};
function zoneData(id) { if (!ZC[id]) { const map = MAP.load(id); ZC[id] = { map, terrain: new ART.Terrain(map), folk: makeFolk(id) }; } return ZC[id]; }
let zoneId = MAP.START_ZONE, map, terrain, folk;
function setZone(id) { const d = zoneData(id); zoneId = id; map = d.map; terrain = d.terrain; folk = d.folk; }
setZone(zoneId);

// ---------------- state from server ----------------
const ents = new Map();   // id -> interpolated entity {kind:'p'|'m', ...}
let quests = {}, fx = [], shots = [];
const found = new Set(); let seenZones = [], myHouse = null, invites = [], stats = null, roster = [], lastWhisper = null;
const settings = { shake: true }; try { Object.assign(settings, JSON.parse(localStorage.getItem('ro_settings')) || {}); } catch (e) { /* defaults */ }
const saveSettings = () => { try { localStorage.setItem('ro_settings', JSON.stringify(settings)); } catch (e) { /* not persisted */ } };
let prof = { credits: 0, mats: {}, gear: {}, talents: {} }, profVer = 0, depleted = new Set(), flight = null, mapOpen = false;
let modsKey = '', modsVal = null; // gear and talents applied to your stats (the same derive() the server uses)
const mods = () => { const lv = me ? me.level : 1, k = lv + ':' + profVer; if (k !== modsKey) { modsKey = k; modsVal = DEFS.derive(lv, prof.gear, prof.talents); } return modsVal; };
const spentPoints = () => Object.values(prof.talents).reduce((a, b) => a + b, 0), pointsLeft = () => me ? DEFS.talentPoints(me.level) - spentPoints() : 0;
const local = { x: 0, y: 0, r: PLAYER.r, dashT: 0, dvx: 0, dvy: 0, face: 0, walk: 0, moving: false, act: null, dir: 1, ghostT: 0, stepT: 0, cd: Object.fromEntries(AB_ORDER.map(k => [k, 0])) };
const cam = { x: map.spawn.x, y: map.spawn.y };
let shake = 0, kick = [0, 0], hitStop = 0, hurtV = 0, clock = 0, zoneBanner = null, toast = null, lastSafe = null, readyFlash = {}, fade = 0;
function enterZone(id, x, y) {
  setZone(id); ents.clear(); shots = []; fx = []; depleted = new Set(); mapOpen = false; local.x = x; local.y = y; local.dashT = 0; cam.x = x; cam.y = y; closeDialog(); fade = 1; lastSafe = null;
  zoneBanner = { title: map.name, sub: map.levels ? `${map.sub} · Levels ${map.levels}` : map.sub, t: 3.8 };
}
const handlers = {
  err: (m) => { $('err').textContent = m.msg; SFX.play('deny'); },
  kicked: () => { kicked = true; },
  welcome: (m) => {
    myId = m.id; me = m.char; quests = m.quests || {}; enterZone(m.zone, me.x, me.y);
    $('login').classList.add('gone'); $('chat').style.display = 'block'; $('menubtn').hidden = false; document.activeElement.blur();
    found.clear(); for (const id of me.relics || []) found.add(id); seenZones = (me.seen || []).slice();
    addChat('', m.zone === 'citadel' ? `Welcome to the Citadel, ${me.name}. Quartermaster Voss by the statue posts bounties. Your ship waits in the Hangar, through the south gate. E talks, gathers and boards; M opens your map.` : `Welcome back, ${me.name}.`);
  },
  zone: (m) => { enterZone(m.zone, m.x, m.y); if (m.flight) { flight = { phase: 'down', t: 0, to: m.zone }; SFX.play('land'); } else SFX.play('land'); },
  profile: (m) => { prof = { credits: m.credits, mats: m.mats || {}, gear: m.gear || {}, talents: m.talents || {} }; profVer++;
    if (dialogKind === 'smith') openSmith(dialogNpc); else if (dialogKind === 'trader') openTrader(dialogNpc); else if (dialogKind === 'trainer') openTrainer(dialogNpc);
    refreshMenu('talents'); refreshMenu('inventory'); refreshMenu('char'); },
  loot: (m) => { let yy = 0; if (m.credits) { floatText(m.x, m.y - 24, `+${m.credits} credits`, '#ffd24a', 12, 1.5); yy -= 13; }
    for (const [k, n] of Object.entries(m.mats || {})) if (MATERIALS[k]) { floatText(m.x, m.y - 24 + yy, `+${n} ${MATERIALS[k].name}`, MATERIALS[k].color, 12, 1.7); yy -= 13; }
    SFX.play(Object.keys(m.mats || {}).length ? 'gather' : 'coin', 0.7); },
  quests: (m) => { quests = m.q; if (dialogKind === 'giver') openQuests(dialogNpc); refreshMenu('journal'); },
  chat: (m) => { addChat(m.from, m.msg, m.ch, m.to); if (m.ch === 'w' && me && m.from !== me.name) lastWhisper = m.from; },
  notice: (m) => { showToast(m.msg); addChat('', m.msg); },
  discover: (m) => { if (!seenZones.includes(m.zone)) seenZones.push(m.zone); if (m.xp) { zoneBanner = { title: ZNAME(m.zone), sub: `New land discovered · +${m.xp} xp`, t: 3.8 }; SFX.play('quest'); } },
  relic: (m) => { const R = RELICS[m.id]; if (!R) return; found.add(m.id); zoneBanner = { title: R.name, sub: 'Relic discovered · read it in your Journal (Tab)', t: 3.8 }; SFX.play('lvl'); refreshMenu('journal'); },
  house: (m) => { myHouse = m.h; if (m.invites) invites = m.invites; refreshMenu('house'); refreshMenu('char'); },
  hinvite: (m) => { invites = invites.filter(i => i.key !== m.key).concat([m]); showInvite(m); refreshMenu('house'); SFX.play('quest'); },
  stats: (m) => { stats = m; for (const id of m.relics || []) found.add(id); seenZones = m.seen || seenZones; refreshMenu('char'); refreshMenu('bestiary'); refreshMenu('journal'); },
  roster: (m) => { roster = m.list || []; refreshMenu('society'); },
  s: (m) => {
    me = Object.assign(me || {}, m.me);
    const seen = new Set(), now = performance.now();
    for (const a of m.p) { const [id, x, y, face, hp, maxHp, house, name, level, dead, dashing, hair, tone, hname, hcolor, hsigil] = a; seen.add(id); upsert(id, { kind: 'p', x, y, face, hp, maxHp, house, name, level, dead, dashing, hair, tone, hname, hcolor, hsigil }, now); }
    for (const a of m.m) { const [id, type, x, y, face, hp, maxHp, state, pr, aim, stun] = a; seen.add(id); const e = upsert(id, { kind: 'm', type, x, y, face, hp, maxHp, state, aim, stun }, now); if (state === 'wind') e.windP = pr; }
    shots = m.sh; depleted = new Set(m.nd || []);
    // reconcile predicted position with the server's
    const ex = m.me.x - local.x, ey = m.me.y - local.y, err = Math.hypot(ex, ey);
    if (m.me.dead || err > 40) { local.x = m.me.x; local.y = m.me.y; } else { local.x += ex * 0.15; local.y += ey * 0.15; }
    m.me.cd.forEach((c, i) => { const k = AB_ORDER[i]; if (c > local.cd[k] + 0.25) local.cd[k] = c; });
    for (const e of m.ev) onEvent(e); // before pruning, so a 'die' event can still find the mob it animates
    for (const id of [...ents.keys()]) if (!seen.has(id)) ents.delete(id);
  },
};
function upsert(id, s, now) {
  let e = ents.get(id);
  if (!e) { e = Object.assign({ id, rx: s.x, ry: s.y, px: s.x, py: s.y, t0: now, walk: Math.random() * 6, flash: 0, act: null, dir: 1, ghostT: 0 }, s); ents.set(id, e); return e; }
  e.px = e.rx; e.py = e.ry; e.t0 = now; return Object.assign(e, s);
}

// ---------------- chat & dialogs ----------------
function addChat(from, msg, ch, to) { // ch: undefined (everyone), 'h' (House), 'w' (whisper)
  const d = document.createElement('div');
  d.textContent = ch === 'h' ? (from ? `[House] ${from}: ${msg}` : `[House] ${msg}`) : ch === 'w' ? (me && from === me.name ? `[To ${to}] ${msg}` : `[${from} whispers] ${msg}`) : from ? `${from}: ${msg}` : msg;
  d.className = ch === 'h' ? 'house' : ch === 'w' ? 'whisper' : from ? '' : 'sys';
  $('chatlog').appendChild(d); while ($('chatlog').children.length > 10) $('chatlog').firstChild.remove();
}
const chatin = $('chatin'), typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
function sendChat(text) { const t = text.trim(); let m; if (!t) return;
  if ((m = t.match(/^\/h\s+(.+)/i))) return send({ t: 'chat', ch: 'h', msg: m[1] });
  if ((m = t.match(/^\/w\s+(\S+)\s+(.+)/i))) return send({ t: 'chat', ch: 'w', to: m[1], msg: m[2] });
  if ((m = t.match(/^\/r\s+(.+)/i))) return lastWhisper ? send({ t: 'chat', ch: 'w', to: lastWhisper, msg: m[1] }) : addChat('', 'Nobody has whispered to you yet.');
  if (/^\/(help|\?)$/i.test(t)) return addChat('', 'Chat: /h message (your House) · /w name message (whisper) · /r message (reply). Tab opens the menu.');
  send({ t: 'chat', msg: t }); }
function closeChat() { chatin.blur(); chatin.style.display = 'none'; $('chat').classList.remove('open'); }
chatin.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { sendChat(chatin.value); chatin.value = ''; closeChat(); } if (e.key === 'Escape') closeChat(); };
let dialogKind = null, dialogNpc = null;
const dlg = $('dialog');
function closeDialog() { dlg.style.display = 'none'; dialogKind = null; dialogNpc = null; }
const questsOf = (f) => Object.entries(QUESTS).filter(([, Q]) => Q.giver === f.id);
function openQuests(f) {
  dialogKind = 'giver'; dialogNpc = f; dlg.style.display = 'block';
  const S = ART.COLOR_STYLE[f.color], list = questsOf(f);
  dlg.innerHTML = `<h2></h2><div class="tag"></div><div class="say"></div>` + list.map(([id, Q]) => {
    const st = quests[id], ready = st && st.n >= Q.count, locked = me.level < Q.minLevel;
    return `<div class="q"><b>${Q.name}</b> <span class="muted">· level ${Q.minLevel}+ · ${Q.xp} xp</span><br>${Q.text}<br>` +
      (ready ? `<span class="done">Complete.</span> <button class="btn primary" data-q="${id}" data-a="turnin">Turn in</button>` : st ? `<span class="muted">In progress: ${st.n}/${Q.count}</span> <button class="btn" data-q="${id}" data-a="abandon">Abandon</button>` :
        locked ? `<span class="muted">Come back at level ${Q.minLevel}.</span>` : `<button class="btn primary" data-q="${id}" data-a="accept">Accept</button>`) + `</div>`; }).join('') + `<div class="row"><button class="btn" id="dclose">Close</button></div>`;
  dlg.querySelector('h2').textContent = f.name; dlg.querySelector('.tag').textContent = `${S.label} · ${map.name} · ${list.length} contracts`; dlg.querySelector('.say').textContent = `"${f.lines[0]}"`;
}
function openTalk(f) {
  dialogKind = 'talk'; dialogNpc = f; dlg.style.display = 'block'; f.said = (f.said || 0) + 1;
  const line = f.lines[(f.said - 1) % f.lines.length], S = ART.COLOR_STYLE[f.color];
  dlg.innerHTML = `<h2></h2><div class="tag"></div><div class="say"></div><div class="row"><button class="btn" id="dclose">Farewell</button></div>`;
  dlg.querySelector('h2').textContent = f.name; dlg.querySelector('.tag').textContent = `${S.label} · ${map.name}`; dlg.querySelector('.say').textContent = `"${line}"`;
}
const matIcon = (k, size) => cnv(size || 22, size || 22, (g) => { const r = (size || 22) / 2; ART.setRot(0); ART.gem(g, r, r + 1, r * 0.7, r * 0.62, 6, r * 0.6, k === 'credits' ? '#ffd24a' : MATERIALS[k].color, 0.3); });
const costChip = (k, need, have) => h('span', { class: 'chip2 ' + (have >= need ? 'ok' : 'no') }, matIcon(k, 16), `${fmt(need)} ${k === 'credits' ? 'credits' : MATERIALS[k].name}`, h('small', null, ` (${fmt(have)})`));
const pips = (n, max) => h('span', { class: 'pips' }, ...Array.from({ length: max }, (_, i) => h('i', { class: i < n ? 'on' : '' })));
const closeRow = (label) => h('div', { class: 'row' }, h('button', { class: 'btn', id: 'dclose' }, label || 'Farewell'));
function dialogHead(f, role) { const S = ART.COLOR_STYLE[f.color]; return [h('h2', null, f.name), h('div', { class: 'tag' }, `${role ? role + ' · ' : ''}${S.label} · ${map.name}`), h('div', { class: 'say' }, `"${f.lines[(f.said = (f.said || 0) + 1) % f.lines.length]}"`)]; }
function openSmith(f) {
  dialogKind = 'smith'; dialogNpc = f; dlg.style.display = 'block';
  const rows = Object.entries(GEAR).map(([slot, G]) => { const r = prof.gear[slot] || 0, done = r >= G.max, cost = done ? null : DEFS.gearCost(slot, r);
    const can = !done && prof.credits >= cost.credits && Object.entries(cost.mats).every(([k, v]) => (prof.mats[k] || 0) >= v);
    return h('div', { class: 'q' }, h('b', null, G.name), ' ', pips(r, G.max), h('div', { class: 'small' }, G.desc),
      done ? h('div', { class: 'done' }, 'Mastered. There is nothing left to improve.') : [h('div', { class: 'cost' }, costChip('credits', cost.credits, prof.credits), ...Object.entries(cost.mats).map(([k, v]) => costChip(k, v, prof.mats[k] || 0))),
        h('button', { class: 'btn' + (can ? ' primary' : ''), ...(can ? {} : { disabled: '' }), onclick: () => send({ t: 'upgrade', slot }) }, `Upgrade to rank ${r + 1}`)]); });
  dlg.replaceChildren(...dialogHead(f, 'Smith'), h('div', { class: 'small' }, `You carry ${fmt(prof.credits)} credits. Higher ranks need materials from harder lands.`), ...rows, closeRow());
}
function openTrader(f) {
  dialogKind = 'trader'; dialogNpc = f; dlg.style.display = 'block';
  const V = (k) => MATERIALS[k].value, tr = (a, k, q) => () => send({ t: 'trade', npc: f.id, mat: k, qty: q, action: a });
  const buy = f.trader.map(k => h('div', { class: 'trade' }, matIcon(k), h('span', { class: 'nm' }, MATERIALS[k].name), h('span', { class: 'muted' }, `${V(k) * 3} credits each`),
    h('button', { class: 'btn sm', onclick: tr('buy', k, 1) }, 'Buy 1'), h('button', { class: 'btn sm', onclick: tr('buy', k, 5) }, 'Buy 5')));
  const have = Object.keys(MATERIALS).filter(k => prof.mats[k] > 0);
  const sell = have.length ? have.map(k => h('div', { class: 'trade' }, matIcon(k), h('span', { class: 'nm' }, `${MATERIALS[k].name} × ${fmt(prof.mats[k])}`), h('span', { class: 'muted' }, `${V(k)} credits each`),
    h('button', { class: 'btn sm', onclick: tr('sell', k, 1) }, 'Sell 1'), h('button', { class: 'btn sm', onclick: tr('sell', k, Math.min(100, prof.mats[k])) }, prof.mats[k] > 100 ? 'Sell 100' : 'Sell all'))) : [h('div', { class: 'small' }, 'You carry nothing to sell.')];
  dlg.replaceChildren(...dialogHead(f, 'Trader'), h('div', { class: 'small' }, `You carry ${fmt(prof.credits)} credits.`), h('h3', null, 'Buy'), ...buy, h('h3', null, 'Sell'), ...sell, closeRow());
}
let respecArmed = false;
function openTrainer(f) {
  dialogKind = 'trainer'; dialogNpc = f; dlg.style.display = 'block';
  const cost = DEFS.respecCost(me.level), spent = spentPoints();
  dlg.replaceChildren(...dialogHead(f, 'Trainer'), h('div', null, `You have spent ${spent} of ${DEFS.talentPoints(me.level)} talent points. You choose talents yourself, any time, from the menu (Tab → Talents).`),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { closeDialog(); toggleMenu('talents'); } }, 'Open talents'),
      spent ? h('button', { class: 'btn danger', onclick: () => { if (respecArmed) { respecArmed = false; send({ t: 'respec' }); } else { respecArmed = true; openTrainer(f); } } }, respecArmed ? 'Click again to reset' : `Reset talents (${fmt(cost)} credits)`) : null,
      h('button', { class: 'btn', id: 'dclose' }, 'Farewell')));
  respecArmed = respecArmed && dialogKind === 'trainer';
}
function openFlight() {
  dialogKind = 'flight'; dialogNpc = { x: map.pad.ramp.x, y: map.pad.ramp.y }; dlg.style.display = 'block';
  const rows = Object.keys(MAP.ZONES).map(z => { const here = z === zoneId, Z = MAP.ZONES[z], known = seenZones.includes(z);
    return h('div', { class: 'q dest' + (here ? ' here' : '') }, h('b', null, Z.name), ' ', h('span', { class: 'muted' }, Z.levels ? `· levels ${Z.levels}` : '· sanctuary'), known ? null : h('span', { class: 'muted' }, ' · unexplored'),
      h('div', null, DEFS.DESTINATIONS[z]), here ? h('div', { class: 'done' }, 'You are here.') : h('button', { class: 'btn primary', onclick: () => startFlight(z) }, `Fly to ${Z.name}`)); });
  dlg.replaceChildren(h('h2', null, 'Your Ship'), h('div', { class: 'tag' }, `Landing pad · ${map.name}`), h('div', { class: 'say' }, 'Engines warm. Where to, dominus?'), ...rows, closeRow('Stay'));
}
function startFlight(to) { if (flight || me.dead) return; closeDialog(); closeMenu(); flight = { phase: 'up', t: 0, to }; SFX.play('engine'); }
dlg.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; SFX.play('click'); if (b.id === 'dclose') return closeDialog(); if (b.dataset.q) send({ t: 'quest', id: b.dataset.q, action: b.dataset.a }); };
function updateFolk(dt) {
  const t = Date.now() / 1000;
  for (const f of folk) {
    const ox = f.x, oy = f.y;
    if (f.pts.length > 1) { const u = (t + f.seed * 13.7) % f.total; const L = f.legs.find((l, i) => u >= l.t0 && (i === f.legs.length - 1 || u < f.legs[i + 1].t0));
      const w = u - L.t0 - 2.8; if (w <= 0) { f.x = L.a[0]; f.y = L.a[1]; } else { const k = Math.min(1, w / (L.len / 15)); f.x = lerp(L.a[0], L.b[0], k); f.y = lerp(L.a[1], L.b[1], k); } }
    const d = Math.hypot(f.x - ox, f.y - oy); f.moving = d > 0.01; f.walk += d * 0.2;
    if (f.moving) f.face = Math.atan2(f.y - oy, f.x - ox);
    else if (myId && Math.hypot(local.x - f.x, local.y - f.y) < 40) f.face = lerpAng(f.face, Math.atan2(local.y - f.y, local.x - f.x), Math.min(1, dt * 5));
  }
}
function lerpAng(a, b, t) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; }
function nearestFolk(r) { let best = null, bd = r; for (const f of folk) { const d = Math.hypot(local.x - f.x, local.y - f.y); if (d < bd) { bd = d; best = f; } } return best; }
// The nearest thing E would act on: your ship's ramp, a resource node, or a person.
function target() {
  if (!me || me.dead || flight) return null; let best = null, bd = Infinity;
  if (map.pad) { const d = Math.hypot(local.x - map.pad.ramp.x, local.y - map.pad.ramp.y); if (d < MAP.BOARD_RANGE - 4) { bd = d; best = { kind: 'ship' }; } }
  for (const n of map.nodes) { if (depleted.has(n.id)) continue; const d = Math.hypot(local.x - n.x, local.y - n.y); if (d < GATHER.range - 4 && d < bd) { bd = d; best = { kind: 'node', n }; } }
  const f = nearestFolk(34); if (f && Math.hypot(local.x - f.x, local.y - f.y) < bd) best = { kind: 'folk', f };
  return best;
}
const roleOf = (f) => f.giver ? 'Contracts from' : f.smith ? 'Upgrade gear with' : f.trader ? 'Trade with' : f.trainer ? 'Speak with' : 'Talk to';
function interact() {
  if (dialogKind) return closeDialog(); const tg = target(); if (!tg) return;
  if (tg.kind === 'ship') return openFlight();
  if (tg.kind === 'node') { send({ t: 'gather', id: tg.n.id }); depleted.add(tg.n.id); sparks(tg.n.x, tg.n.y - 4, -Math.PI / 2, 8, '255,240,200', 70); dustBurst(tg.n.x, tg.n.y, 6); local.act = mkAct('fist', Math.atan2(tg.n.y - local.y, tg.n.x - local.x)); return; }
  const f = tg.f; if (f.giver) openQuests(f); else if (f.smith) openSmith(f); else if (f.trader) openTrader(f); else if (f.trainer) openTrainer(f); else openTalk(f);
}
function giverMark(f) { // '?' when a quest is ready to turn in here, '!' when one is available
  const list = questsOf(f); if (list.some(([id, Q]) => quests[id] && quests[id].n >= Q.count)) return '?';
  return list.some(([id, Q]) => !quests[id] && me && me.level >= Q.minLevel) ? '!' : null;
}

// ---------------- input ----------------
const keys = {}, mouse = { x: innerWidth / 2, y: innerHeight / 2, l: false, r: false };
const KEYMAP = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' };
addEventListener('keydown', (e) => {
  if (myId && e.key === 'Tab') { e.preventDefault(); if (document.activeElement !== chatin) toggleMenu(); return; }
  if (myId && e.key === 'Escape' && menuOpen()) { closeMenu(); return; }
  if (myId && e.key === 'Escape' && mapOpen) { mapOpen = false; return; }
  if (!myId || typing()) return;
  const k = KEYMAP[e.key.toLowerCase()] || e.key.toLowerCase();
  if (k === 'enter') { chatin.style.display = 'block'; $('chat').classList.add('open'); chatin.focus(); e.preventDefault(); return; }
  if (k === 'escape') { closeDialog(); return; }
  if (k === ' ' || k === 'tab' || e.key.startsWith('Arrow')) e.preventDefault();
  if (!e.repeat) {
    SFX.unlock();
    if (k === 'q' || k === '3') use('fist', true); if (k === ' ' || k === '4') use('dash', true); if (k === 'shift' || k === '5') use('parry', true);
    if (k === '1') use('razor', true); if (k === '2') use('whip', true);
    if (k === 'e') interact();
    if (k === 'm') { mapOpen = !mapOpen; SFX.play('click'); }
  }
  keys[k] = true;
});
addEventListener('keyup', (e) => { keys[KEYMAP[e.key.toLowerCase()] || e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; });
const cv = $('c'), ctx = cv.getContext('2d');
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', (e) => { if (!myId) return; SFX.unlock(); if (typing()) closeChat(); if (e.button === 0) { mouse.l = true; use('razor', true); } if (e.button === 2) { mouse.r = true; use('whip', true); } });
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
const aimAngle = () => Math.atan2((mouse.y - innerHeight / 2) / Z + cam.y - local.y, (mouse.x - innerWidth / 2) / Z + cam.x - local.x);
function moveVec() { if (flight) return null; let x = (keys.d ? 1 : 0) - (keys.a ? 1 : 0), y = (keys.s ? 1 : 0) - (keys.w ? 1 : 0); const l = Math.hypot(x, y); return l ? [x / l, y / l] : null; }
let lastInput = '', inputT = 0;
function sendInput(dt) { inputT -= dt; let s = `${keys.w ? 1 : 0}${keys.s ? 1 : 0}${keys.a ? 1 : 0}${keys.d ? 1 : 0}`;
  const k = flight ? {} : keys; if (flight) s = '0000';
  if (s !== lastInput || inputT <= 0) { lastInput = s; inputT = 0.1; send({ t: 'in', u: k.w ? 1 : 0, d: k.s ? 1 : 0, l: k.a ? 1 : 0, r: k.d ? 1 : 0, a: +aimAngle().toFixed(2) }); } }
const mkAct = (k, a, dir) => ({ k, a, dir: dir || 1, t: 0, p: 0, dur: ACT_DUR[k] });
function stepAct(a, dt) { if (!a) return null; a.t += dt; a.p = a.t / a.dur; return a.p >= 1 ? null : a; }
// Use an ability: predict the animation locally for instant feel; the server decides what it actually hits.
function use(ab, fresh) {
  if (!me || me.dead || typing() || flight) return false;
  const A = ABILITIES[ab], M = mods(); if (local.cd[ab] > 0) return false;
  if (WEAPON_AB[ab] && MAP.inSafe(map, local.x, local.y)) { if (fresh) { showToast('Weapons stay sheathed in a sanctuary.'); SFX.play('deny'); } return false; }
  const a = aimAngle(), msg = { t: 'use', ab, a: +a.toFixed(3) }; local.cd[ab] = M.cd[ab];
  if (ab === 'razor') { local.dir = -local.dir; local.act = mkAct('razor', a, local.dir); addFx({ k: 'trail', ent: myId, x: local.x, y: local.y, a, dir: local.dir, r: M.razorRange, life: 0.24, rgb: '255,236,180' }); SFX.play('razor'); }
  if (ab === 'whip') { local.act = mkAct('whip', a); SFX.play('whip'); }
  if (ab === 'fist') { local.act = mkAct('fist', a); const cx = local.x + Math.cos(a) * A.offset, cy = local.y + Math.sin(a) * A.offset; fistFx(cx, cy, a, 0.08, M.fistRadius); SFX.play('fist'); addShake(0.45, a, 3); }
  if (ab === 'parry') { local.act = mkAct('parry', a); SFX.play('guard'); }
  if (ab === 'dash') { const mv = moveVec(), d = mv ? Math.atan2(mv[1], mv[0]) : a; msg.d = +d.toFixed(3); local.dvx = Math.cos(d) * A.speed; local.dvy = Math.sin(d) * A.speed; local.dashT = A.time; dustBurst(local.x, local.y, 8, d + Math.PI); SFX.play('dash'); }
  send(msg); return true;
}

// ---------------- effects ----------------
function addFx(f) { f.max = f.max || f.life; fx.push(f); return f; }
function addShake(amt, dir, k) { if (!settings.shake) return; shake = Math.min(1, shake + amt); if (dir != null) { kick[0] += Math.cos(dir) * (k || 2); kick[1] += Math.sin(dir) * (k || 2); } }
function sparks(x, y, dir, n, col, spd) { for (let i = 0; i < n; i++) { const a = dir + (Math.random() - 0.5) * 1.6, v = (spd || 110) * (0.4 + Math.random()); addFx({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.18 + Math.random() * 0.16, col: col || '255,230,160', drag: 5 }); } }
const DUST = { green: '120,110,80', citadel: '200,190,170', mine: '110,96,86', mars: '160,108,74' };
function dustBurst(x, y, n, dir) { for (let i = 0; i < n; i++) { const a = dir == null ? Math.random() * TAU : dir + (Math.random() - 0.5) * 1.8, v = 20 + Math.random() * 40;
  addFx({ k: 'dust', ground: 1, x: x + (Math.random() - 0.5) * 4, y: y + 3, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, r: 1.6 + Math.random() * 2, life: 0.5 + Math.random() * 0.4, drag: 4, col: DUST[map.biome] }); } }
function fistFx(x, y, a, delay, r) { addFx({ k: 'shock', x, y, r: r || ABILITIES.fist.radius, life: 0.45, delay, seed: Math.random() * 6 }); addFx({ k: 'scorch', ground: 1, x, y, r: 18, life: 2.5, delay }); dustBurst(x, y, 14); }
const volAt = (x, y) => clamp(1 - Math.hypot(x - local.x, y - local.y) / 380, 0, 1);
function floatText(x, y, t, col, size, life) { addFx({ k: 'num', x: x + (Math.random() - 0.5) * 6, y, t, col, size: size || 14, life: life || 0.9, vy: -28 }); }
function onEvent(e) {
  const E = e.id != null ? ents.get(e.id) : null, mine = e.id === myId, v = volAt(e.x, e.y);
  switch (e.k) {
    case 'razor': if (!mine && E) { E.dir = -E.dir; E.act = mkAct('razor', e.a, E.dir); addFx({ k: 'trail', ent: e.id, x: E.rx, y: E.ry, a: e.a, dir: E.dir, r: ABILITIES.razor.range, life: 0.24, rgb: '255,236,180' }); SFX.play('razor', v * 0.7); } break;
    case 'whip': if (!mine && E) { E.act = mkAct('whip', e.a); SFX.play('whip', v * 0.7); } break;
    case 'fist': if (!mine) { if (E) E.act = mkAct('fist', e.a); fistFx(e.fx, e.fy, e.a, 0.06, e.r); SFX.play('fist', v * 0.8); } break;
    case 'dash': if (!mine) { dustBurst(e.x, e.y, 6, e.a + Math.PI); SFX.play('dash', v * 0.5); } break;
    case 'guard': if (!mine && E) E.act = mkAct('parry', e.a); break;
    case 'hit': {
      const m = ents.get(e.id), byMe = e.by === myId, src = byMe ? local : ents.get(e.by), dir = src ? Math.atan2(e.y - (src.ry != null ? src.ry : src.y), e.x - (src.rx != null ? src.rx : src.x)) : 0;
      if (m) m.flash = e.block ? 0.05 : 0.12;
      if (e.block) { sparks(e.x, e.y - 3, dir + Math.PI, 8, '200,220,255', 120); if (byMe) { floatText(e.x, e.y - 16, `${e.n} BLOCKED`, '#9fc8ff', 12); SFX.play('block', 0.8); hitStop = Math.max(hitStop, 0.03); } break; }
      sparks(e.x, e.y - 3, dir, e.crit ? 10 : 6, e.crit ? '255,200,110' : '255,236,190', e.ab === 'fist' ? 170 : 110);
      floatText(e.x, e.y - 14, String(e.n), byMe ? (e.crit ? '#ffb347' : '#fff3d6') : 'rgba(230,220,200,0.75)', byMe ? (e.crit ? 20 : 15) : 12);
      if (byMe) { hitStop = Math.max(hitStop, e.ab === 'fist' ? 0.09 : e.crit ? 0.07 : 0.045); addShake(e.ab === 'fist' ? 0.25 : 0.12, dir, 1.2); SFX.play(e.crit ? 'crit' : 'hit', 0.9); }
      else SFX.play('hit', v * 0.5);
      break; }
    case 'die': {
      const m = ents.get(e.id); if (m) { addFx({ k: 'corpse', ent: { ...m, act: null, flash: 0 }, x: m.rx, y: m.ry, life: 0.7 }); ents.delete(e.id); }
      const elite = MOBS[e.type] && MOBS[e.type].elite;
      for (let i = 0; i < (elite ? 40 : 16); i++) { const a = Math.random() * TAU, s = 10 + Math.random() * (elite ? 60 : 30); addFx({ k: 'ash', x: e.x, y: e.y - 3, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 18, life: 0.7 + Math.random() * 0.6, drag: 2, col: Math.random() < 0.4 ? '255,120,40' : '60,50,46' }); }
      if (elite) { addFx({ k: 'beam', x: e.x, y: e.y, life: 2.2 }); addShake(0.5 * v); }
      SFX.play('die', v * 0.8); break; }
    case 'mslash': if (E) { E.dir = -(E.dir || 1); E.act = mkAct('mslash', e.a, E.dir); if (ART.MOB_LOOK[E.type].kind === 'humanoid') addFx({ k: 'trail', ent: e.id, x: E.rx, y: E.ry, a: e.a, dir: E.dir, r: MOBS[E.type].reach + 10, life: 0.24, rgb: '255,120,90' }); if (e.l) dustBurst(e.x, e.y, 8, e.a + Math.PI); } SFX.play('mslash', v * 0.8); break;
    case 'mshot': if (E) E.act = mkAct('mshot', e.a); SFX.play('mshot', v * 0.8); break;
    case 'mslam': if (E) E.act = mkAct('mslam', e.a); addFx({ k: 'ring', x: e.x, y: e.y, r0: 4, r1: e.r + 6, life: 0.4, col: '255,140,80', w: 3 }); addFx({ k: 'crack', ground: 1, x: e.x, y: e.y, r: e.r, life: 2.2, seed: Math.random() * 99 }); dustBurst(e.x, e.y, 16); addShake(0.4 * v); SFX.play('mslam', v); break;
    case 'wall': dustBurst(e.x, e.y, 12); addFx({ k: 'ring', x: e.x, y: e.y, r0: 2, r1: 16, life: 0.3, col: '255,220,160', w: 2 }); addShake(0.2 * v); SFX.play('wall', v); floatText(e.x, e.y - 22, 'SLAMMED', '#ffd27a', 12, 0.8); break;
    case 'hurt': if (mine) { hurtV = Math.min(1, hurtV + 0.6); addShake(0.35); SFX.play('hurt'); floatText(local.x, local.y - 18, `-${e.n}`, '#ff6a50', 15); const s = ents.get(myId); if (s) s.flash = 0.12; } else if (E) E.flash = 0.12; break;
    case 'parry': addFx({ k: 'star', x: e.x, y: e.y - 4, life: 0.35 }); sparks(e.x, e.y - 4, Math.random() * TAU, 12, '255,244,200', 150);
      if (mine) { local.cd.parry = 0; floatText(local.x, local.y - 22, 'PARRY', '#fff0b8', 16, 1); hitStop = 0.1; addShake(0.3); SFX.play('parry'); } else SFX.play('parry', v * 0.6); break;
    case 'lvl': addFx({ k: 'beam', ent: e.id, x: e.x, y: e.y, life: 1.8 }); if (mine) { floatText(local.x, local.y - 28, 'LEVEL UP', '#ffd66b', 22, 2); SFX.play('lvl'); } break;
    case 'pdie': addFx({ k: 'ring', x: e.x, y: e.y, r0: 4, r1: 26, life: 0.6, col: '255,80,60', w: 2 }); if (mine) SFX.play('die'); break;
    case 'respawn': if (mine) { local.x = e.x; local.y = e.y; cam.x = e.x; cam.y = e.y; addFx({ k: 'beam', ent: myId, x: e.x, y: e.y, life: 1.2 }); } break;
    case 'qdone': if (mine) SFX.play('quest'); break;
    case 'launch': if (!mine) { dustBurst(e.x, e.y + 40, 14); SFX.play('engine', v * 0.6); } break;
    case 'gather': if (!mine) { sparks(e.x, e.y - 4, -Math.PI / 2, 6, '255,240,200', 60); dustBurst(e.x, e.y, 4); } break;
    case 'upgrade': addFx({ k: 'beam', ent: e.id, x: e.x, y: e.y, life: 1.4 }); if (mine) { floatText(local.x, local.y - 26, 'UPGRADED', '#ffd66b', 18, 1.6); SFX.play('anvil'); } break;
    case 'relic': addFx({ k: 'beam', x: e.x, y: e.y, life: 1.6 }); sparks(e.x, e.y - 10, -Math.PI / 2, 14, '170,235,255', 90); break;
  }
}
function showToast(msg) { toast = { msg, t: 2.2 }; }

// ---------------- sizing ----------------
let W, H, dpr, Z;
function resize() { dpr = Math.min(2, devicePixelRatio || 1); W = cv.width = Math.floor(innerWidth * dpr); H = cv.height = Math.floor(innerHeight * dpr); Z = clamp(innerHeight / 250, 2.6, 5); }
addEventListener('resize', resize); resize();

// ---------------- simulation (client side) ----------------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; clock += dt;
  hitStop = Math.max(0, hitStop - dt); const adt = hitStop > 0 ? dt * 0.08 : dt;
  updateFolk(dt);
  if (myId && me) { update(dt, adt, now); render(dt, adt); }
  else { cam.x = 42 * T + Math.sin(clock * 0.05) * 170; cam.y = 30 * T + Math.sin(clock * 0.037) * 110; stepFx(adt); render(dt, adt); }
  if (!$('login').classList.contains('gone')) drawPreview(dt);
  requestAnimationFrame(frame);
}
function update(dt, adt, now) {
  for (const k of AB_ORDER) { const was = local.cd[k]; local.cd[k] = Math.max(0, local.cd[k] - dt); if (was > 0 && local.cd[k] === 0 && ABILITIES[k].cd > 1) readyFlash[k] = 0.4; }
  if (flight) { flight.t += dt;
    if (flight.phase === 'up' && flight.t > 1.6) { flight.phase = 'wait'; flight.t = 0; send({ t: 'fly', to: flight.to }); }
    else if (flight.phase === 'wait' && flight.t > 4) { flight = null; fade = 1; showToast('Your ship could not take off.'); }
    else if (flight.phase === 'down' && flight.t > 1.8) flight = null; }
  reveal(dt);
  for (const k in readyFlash) readyFlash[k] = Math.max(0, readyFlash[k] - dt);
  if (!me.dead) {
    let vx = 0, vy = 0;
    if (local.dashT > 0) { local.dashT -= dt; vx = local.dvx; vy = local.dvy; if ((local.ghostT -= dt) <= 0) { local.ghostT = 0.035; addFx({ k: 'ghost', x: local.x, y: local.y, face: local.face, id: myId, life: 0.22 }); } }
    else { const mv = typing() ? null : moveVec(), sp = mods().spd; if (mv) { vx = mv[0] * sp; vy = mv[1] * sp; } }
    const ox = local.x, oy = local.y; MAP.moveBy(map, local, vx * dt, vy * dt);
    const moved = Math.hypot(local.x - ox, local.y - oy); local.moving = moved > 0.01 && local.dashT <= 0; local.walk += moved * 0.2;
    if (local.moving && (local.stepT -= dt) <= 0) { local.stepT = 0.3; addFx({ k: 'dust', ground: 1, x: local.x, y: local.y + 3, vx: 0, vy: 0, r: 1.2, life: 0.45, col: DUST[map.biome] }); }
    if (mouse.l) use('razor'); if (mouse.r) use('whip');
  }
  if (!typing()) sendInput(dt);
  local.act = stepAct(local.act, adt);
  local.face = local.act ? local.act.a : aimAngle();
  for (const e of ents.values()) {
    if (e.id === myId) { e.flash -= dt; continue; }
    const k = clamp((now - e.t0) / 60, 0, 1), nx = lerp(e.px, e.x, k), ny = lerp(e.py, e.y, k), d = Math.hypot(nx - e.rx, ny - e.ry);
    e.moving = d > 0.02; e.walk += d * (e.kind === 'm' && ART.MOB_LOOK[e.type].kind !== 'humanoid' ? 0.28 : 0.2); e.rx = nx; e.ry = ny; e.flash -= dt; e.act = stepAct(e.act, adt);
    if (e.kind === 'm' && e.state === 'wind') e.windP = Math.min(1, (e.windP || 0) + adt / MOBS[e.type].wind);
    if (e.kind === 'p' && e.dashing && (e.ghostT -= dt) <= 0) { e.ghostT = 0.035; addFx({ k: 'ghost', x: e.rx, y: e.ry, face: e.face, id: e.id, life: 0.22 }); }
  }
  // camera: follow with a little look-ahead toward the cursor
  const mx = (mouse.x - innerWidth / 2) / Z, my = (mouse.y - innerHeight / 2) / Z, ml = Math.hypot(mx, my) || 1, lead = Math.min(22, ml * 0.12);
  const f = 1 - Math.exp(-dt * 7);
  cam.x = lerp(cam.x, local.x + mx / ml * lead, f); cam.y = lerp(cam.y, local.y + my / ml * lead, f);
  clampCam();
  shake = Math.max(0, shake - dt * 2.2); kick[0] *= Math.exp(-dt * 14); kick[1] *= Math.exp(-dt * 14); hurtV = Math.max(0, hurtV - dt * 1.6); fade = Math.max(0, fade - dt * 1.6);
  const safe = MAP.inSafe(map, local.x, local.y);
  if (lastSafe !== null && safe !== lastSafe && zoneId !== 'citadel') zoneBanner = safe ? { title: 'Waystation', sub: 'Sanctuary · weapons sheathed', t: 3 } : { title: map.name, sub: `${map.sub} · Levels ${map.levels}`, t: 3 };
  lastSafe = safe; if (zoneBanner) zoneBanner.t -= dt; if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
  if (dialogNpc && Math.hypot(local.x - dialogNpc.x, local.y - dialogNpc.y) > 70) closeDialog();
  if (flight && flight.phase === 'wait') fade = Math.max(fade, 1);
  stepFx(adt);
}
function clampCam() { const hw = innerWidth / 2 / Z, hh = innerHeight / 2 / Z, mw = map.w * T, mh = map.h * T;
  cam.x = hw * 2 >= mw ? mw / 2 : clamp(cam.x, hw, mw - hw); cam.y = hh * 2 >= mh ? mh / 2 : clamp(cam.y, hh, mh - hh); }
function stepFx(adt) {
  for (const f of fx) {
    if (f.delay > 0) { f.delay -= adt; continue; }
    f.life -= adt;
    if (f.vx != null) { f.x += f.vx * adt; f.y += f.vy * adt; const dr = Math.exp(-(f.drag || 0) * adt); f.vx *= dr; f.vy *= dr; }
    if (f.k === 'num') f.y += f.vy * adt;
  }
  fx = fx.filter(f => f.life > 0); if (fx.length > 700) fx.splice(0, fx.length - 700);
}

// ---------------- rendering ----------------
const motes = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), z: 0.4 + Math.random() * 0.6, s: Math.random() * TAU }));
const MOTE = { mars: '255,214,170', citadel: '255,226,150', mine: '200,170,140', green: '240,250,200' };
const LC = document.createElement('canvas'), lctx = LC.getContext('2d');
function entPos(e) { return e.id === myId ? [local.x, local.y] : [e.rx, e.ry]; }
function render(dt, adt) {
  const g = ctx, Zp = Z * dpr, s2 = shake * shake;
  if (!myId) clampCam();
  const camX = cam.x + (Math.random() - 0.5) * s2 * 9 + kick[0], camY = cam.y + (Math.random() - 0.5) * s2 * 9 + kick[1];
  const world = () => g.setTransform(Zp, 0, 0, Zp, W / 2 - camX * Zp, H / 2 - camY * Zp);
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0c0806'; g.fillRect(0, 0, W, H);
  terrain.draw(g, 'lo', camX, camY, Zp, W, H);
  world();
  const vx0 = camX - W / 2 / Zp - 24, vx1 = camX + W / 2 / Zp + 24, vy0 = camY - H / 2 / Zp - 24, vy1 = camY + H / 2 / Zp + 24;
  const inView = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
  ART.worldFx(g, map, vx0, vy0, vx1, vy1, clock, 'ground');
  for (const f of fx) if (f.ground && !(f.delay > 0)) drawFx(g, f);
  drawTelegraphs(g);
  // everything that stands on the ground, sorted by depth
  const list = [];
  const aboard = !!flight;
  for (const e of ents.values()) { if (e.kind === 'p' && e.dead) continue; if (e.id === myId && aboard) continue; const [x, y] = entPos(e); if (inView(x, y)) list.push({ y, e }); }
  for (const n of map.nodes) if (inView(n.x, n.y)) list.push({ y: n.y, node: n });
  const shipOn = map.pad && inView(map.pad.x, map.pad.y) || (map.pad && Math.abs(map.pad.x - camX) < 500 && Math.abs(map.pad.y - camY) < 500);
  if (shipOn && !flight) list.push({ y: map.pad.y + 30, ship: true });

  if (myId && me && !me.dead && !ents.has(myId) && !aboard) list.push({ y: local.y, e: { id: myId, kind: 'p', house: me.look.house, hair: me.look.hair, tone: me.look.tone, flash: 0 } });
  for (const f of folk) if (inView(f.x, f.y)) list.push({ y: f.y, folk: f });
  for (const p of map.props) if (p.type === 'relic' && inView(p.x, p.y)) list.push({ y: p.y, relic: p });
  for (const f of fx) if ((f.k === 'corpse' || f.k === 'ghost') && !(f.delay > 0)) list.push({ y: f.y - 0.1, f });
  list.sort((a, b) => a.y - b.y);
  for (const it of list) { if (it.e) drawEnt(g, it.e); else if (it.node) ART.node(g, it.node.kind, it.node.x, it.node.y, clock, depleted.has(it.node.id)); else if (it.ship) drawShip(g, 0); else if (it.folk) drawFolk(g, it.folk); else if (it.relic) ART.relic(g, it.relic.x, it.relic.y, clock, !myId || found.has(it.relic.id)); else drawFx(g, it.f); }
  drawShots(g);
  g.setTransform(1, 0, 0, 1, 0, 0); terrain.draw(g, 'hi', camX, camY, Zp, W, H); world();
  if (shipOn && flight) drawShip(g, flight.phase === 'up' ? clamp((flight.t - 0.5) / 1.1, 0, 1) : flight.phase === 'down' ? 1 - clamp(flight.t / 1.4, 0, 1) : 1);
  const self = myId && ents.get(myId);
  if (self && !me.dead && !aboard) { g.globalAlpha = 0.3; drawEnt(g, self, true); g.globalAlpha = 1; } // x-ray silhouette when behind canopy, roofs or walls
  ART.worldFx(g, map, vx0, vy0, vx1, vy1, clock, 'air');
  for (const f of fx) if (!f.ground && f.k !== 'corpse' && f.k !== 'ghost' && f.k !== 'num' && !(f.delay > 0)) drawFx(g, f);
  atmosphere(g, dt, vx0, vy0, vx1, vy1);
  if (map.biome === 'mine') darkness(g, camX, camY, Zp, vx0, vy0, vx1, vy1);
  // screen space
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const toScreen = (x, y) => [(x - camX) * Z + innerWidth / 2, (y - camY) * Z + innerHeight / 2];
  vignette(g);
  if (!myId) return;
  shipLabel(g, toScreen);
  nameplates(g, toScreen);
  for (const f of fx) if (f.k === 'num') { const [sx, sy] = toScreen(f.x, f.y), k = f.life / f.max, pop = 1 + Math.max(0, (k - 0.8) * 2.5);
    g.globalAlpha = clamp(k * 2, 0, 1); text(g, f.t, sx, sy, { font: `700 ${Math.round(f.size * pop)}px ${FONT_T}`, color: f.col, align: 'center', stroke: 3 }); g.globalAlpha = 1; }
  hud(g);
  if (flight && flight.phase === 'up') fade = Math.max(fade, clamp((flight.t - 1.1) / 0.5, 0, 1));
  if (fade > 0) { g.fillStyle = `rgba(8,4,12,${fade})`; g.fillRect(0, 0, innerWidth, innerHeight); }
  if (flight && flight.phase !== 'down' && fade > 0.5) { g.globalAlpha = (fade - 0.5) * 2; text(g, `En route to ${ZNAME(flight.to)}`, innerWidth / 2, innerHeight / 2, { font: `700 28px ${FONT_T}`, color: '#f6e3b0', align: 'center', stroke: 4 });
    text(g, MAP.ZONES[flight.to].levels ? `Levels ${MAP.ZONES[flight.to].levels}` : 'Sanctuary', innerWidth / 2, innerHeight / 2 + 26, { font: `600 13px ${FONT_B}`, color: '#cdb892', align: 'center', stroke: 3 }); g.globalAlpha = 1; }
  if (mapOpen) fullMap(g);
}
// Your ship on the pad, painted in your House colors (or your Institute House's until you found or join one).
function drawShip(g, lift) {
  const H = myHouse ? { color: myHouse.color, sigil: myHouse.sigil } : { color: houseOf(me ? me.look.house : 'mars').color, sigil: null };
  const ramp = flight ? (flight.phase === 'up' ? 1 - clamp(flight.t / 0.5, 0, 1) : flight.phase === 'down' ? clamp((flight.t - 1.3) / 0.5, 0, 1) : 0) : 1, glow = flight ? 1 : 0;
  ART.ship(g, map.pad.x, map.pad.y, clock, { color: H.color, sigil: H.sigil, lift, ramp, glow });
}
function atmosphere(g, dt, vx0, vy0, vx1, vy1) {
  const vw = vx1 - vx0, vh = vy1 - vy0, col = MOTE[map.biome];
  if (map.biome === 'green') for (let i = 0; i < 4; i++) { // drifting cloud shadows
    const x = ((clock * 9 + i * 523) % (map.w * T + 400)) - 200, y = ((i * 977 + clock * 3) % (map.h * T + 300)) - 150, r = 140 + i * 30;
    if (x + r < vx0 || x - r > vx1 || y + r < vy0 || y - r > vy1) continue;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,20,30,0.16)'); gr.addColorStop(1, 'rgba(10,20,30,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  for (const m of motes) { m.x += dt * 0.012 * m.z; m.y += dt * 0.004 * Math.sin(clock * 0.3 + m.s); const x = vx0 + ((m.x % 1 + 1) % 1) * vw, y = vy0 + ((m.y % 1 + 1) % 1) * vh;
    g.fillStyle = `rgba(${col},${0.12 + 0.1 * Math.sin(clock + m.s)})`; g.fillRect(x - 0.5 * m.z, y - 0.5 * m.z, m.z, m.z); }
  if (map.biome === 'citadel') { g.fillStyle = 'rgba(255,190,110,0.05)'; g.fillRect(vx0, vy0, vw, vh); }
}
// The mines are dark: carve light out of a dark layer, then add a warm glow on top.
function darkness(g, camX, camY, Zp, vx0, vy0, vx1, vy1) {
  if (LC.width !== W || LC.height !== H) { LC.width = W; LC.height = H; }
  const lights = ART.lightsIn(terrain, vx0, vy0, vx1, vy1), fl = 1 + Math.sin(clock * 11) * 0.03 + Math.sin(clock * 7.3) * 0.02;
  if (myId && me && !me.dead) lights.push([local.x, local.y, 118 * fl, 255, 200, 140]);
  for (const e of ents.values()) { if (e.kind === 'p' && e.id !== myId && !e.dead) lights.push([e.rx, e.ry, 90, 255, 200, 140]); else if (e.kind === 'm' && e.type === 'drone') lights.push([e.rx, e.ry - 4, 30, 255, 70, 40]); }
  for (const s of shots) lights.push([s[0], s[1], 40, 255, 170, 80]);
  for (const f of fx) if (f.k === 'shock' && !(f.delay > 0)) lights.push([f.x, f.y, f.r * 1.6, 220, 180, 255]);
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.fillStyle = 'rgba(5,3,9,0.88)'; lctx.fillRect(0, 0, W, H);
  lctx.globalCompositeOperation = 'destination-out'; lctx.setTransform(Zp, 0, 0, Zp, W / 2 - camX * Zp, H / 2 - camY * Zp);
  for (const [x, y, r] of lights) { const gr = lctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); lctx.fillStyle = gr; lctx.fillRect(x - r, y - r, r * 2, r * 2); }
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(LC, 0, 0);
  g.setTransform(Zp, 0, 0, Zp, W / 2 - camX * Zp, H / 2 - camY * Zp); g.globalCompositeOperation = 'lighter';
  for (const [x, y, r, cr, cg, cb] of lights) { const gr = g.createRadialGradient(x, y, 0, x, y, r * 0.8); gr.addColorStop(0, `rgba(${cr},${cg},${cb},0.16)`); gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.globalCompositeOperation = 'source-over';
}
function drawEnt(g, e, xray) {
  const [x, y] = entPos(e), self = e.id === myId;
  if (e.kind === 'p') {
    const dashing = self ? local.dashT > 0 : e.dashing;
    ART.humanoid(g, { x, y, face: self ? local.face : e.act ? e.act.a : e.face, s: 1.1, pal: ART.playerPal({ house: e.house, tone: e.tone }), hair: e.hair, weapon: MAP.inSafe(map, x, y) ? null : 'razor', emblem: e.hname ? { color: e.hcolor, sigil: e.hsigil } : self && myHouse ? { color: myHouse.color, sigil: myHouse.sigil } : null,
      act: self ? local.act : e.act, walk: self ? local.walk : e.walk, moving: self ? local.moving : e.moving, dashing, flash: xray ? 0 : e.flash, t: clock, seed: e.id, whipLen: ABILITIES.whip.range, noShadow: xray, alpha: dashing ? 0.8 : 1 });
    return;
  }
  const D = MOBS[e.type], act = e.act || (e.state === 'wind' ? { k: 'wind', p: e.windP || 0 } : null), stunWob = e.stun ? Math.sin(clock * 9) * 0.25 : 0;
  if (D.elite) { const p = 0.5 + 0.5 * Math.sin(clock * 3), R = 16 + D.r; const gr = g.createRadialGradient(x, y + 2, 2, x, y + 2, R); gr.addColorStop(0, `rgba(255,210,100,${0.25 + p * 0.15})`); gr.addColorStop(1, 'rgba(255,190,60,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y + 2, R, R * 0.62, 0, 0, TAU); g.fill(); }
  ART.mob(g, e.type, { x, y, face: e.face + stunWob, act, walk: e.walk, moving: e.moving, flash: e.flash, t: clock, seed: e.id });
  if (e.stun) for (let i = 0; i < 3; i++) { const a = clock * 5 + i * TAU / 3, sx = x + Math.cos(a) * 6, sy = y - 12 - D.r + Math.sin(a) * 2; star(g, sx, sy, 1.6, 'rgba(255,240,160,0.9)'); }
}
function drawFolk(g, f) {
  const extra = f.house ? { armored: true, cloak: f.house.color } : (f.color === 'gray' || f.color === 'obsidian' || f.color === 'gold') ? { armored: true } : null;
  ART.humanoid(g, { x: f.x, y: f.y, face: f.face, s: f.big ? 1.4 : 1, pal: ART.colorPal(f.color, f.skin, extra), hair: f.color === 'blue' ? 4 : f.seed % 4, helmet: f.color === 'obsidian', weapon: f.color === 'obsidian' ? 'axe' : null, walk: f.walk, moving: f.moving, t: clock, seed: f.seed });
  if (myId && !f.giver && (f.smith || f.trader || f.trainer)) { const b = Math.sin(clock * 2 + f.seed) * 1; text(g, f.smith ? '⚒' : f.trader ? '◆' : '✦', f.x, f.y - 17 + b, { font: `700 10px ${FONT_B}`, color: f.smith ? '#ffb070' : f.trader ? '#9fe0a8' : '#d8b8ff', align: 'center', stroke: 1.2 }); }
  if (f.giver && myId) { const mk = giverMark(f); if (mk) { const b = Math.sin(clock * 3) * 1.5; text(g, mk, f.x, f.y - 17 + b, { font: `900 12px ${FONT_T}`, color: '#ffd24a', align: 'center', stroke: 1.2 }); } }
}
function star(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rr = i % 2 ? r * 0.35 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
function drawTelegraphs(g) {
  for (const e of ents.values()) {
    if (e.kind !== 'm' || e.state !== 'wind') continue;
    const D = MOBS[e.type], p = clamp(e.windP || 0, 0, 1), x = e.rx, y = e.ry, hot = p > 0.6, ca = Math.cos(e.aim), sa = Math.sin(e.aim);
    g.save();
    if (D.ranged) {
      const L = D.reach, w = 0.6 + p * 2.2;
      g.strokeStyle = `rgba(255,70,40,${0.18 + 0.5 * p})`; g.lineWidth = w; if (p < 0.65) g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(x + ca * 8, y + sa * 8); g.lineTo(x + ca * L, y + sa * L); g.stroke(); g.setLineDash([]);
    } else if (D.aoe) {
      const cx = x + ca * D.slamOff, cy = y + sa * D.slamOff, R = D.slam + 5;
      g.fillStyle = 'rgba(255,60,30,0.14)'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
      g.fillStyle = `rgba(255,${hot ? 40 : 90},30,${0.25 + 0.3 * p})`; g.beginPath(); g.arc(cx, cy, R * p, 0, TAU); g.fill();
      g.strokeStyle = `rgba(255,120,80,${0.5 + 0.4 * p})`; g.lineWidth = 0.8; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    } else if (D.lunge) { // a leap: a lane from the monster to where it lands
      const L = D.lunge + D.reach + 12, hw = 9; g.translate(x, y); g.rotate(e.aim);
      g.fillStyle = 'rgba(255,60,30,0.13)'; g.fillRect(0, -hw, L, hw * 2);
      g.fillStyle = `rgba(255,${hot ? 40 : 90},30,${0.22 + 0.33 * p})`; g.fillRect(0, -hw, L * p, hw * 2);
      g.strokeStyle = `rgba(255,120,80,${0.45 + 0.4 * p})`; g.lineWidth = 0.7; g.strokeRect(0, -hw, L, hw * 2);
      g.fillStyle = `rgba(255,140,90,${0.4 + 0.4 * p})`; g.beginPath(); g.moveTo(L, 0); g.lineTo(L - 6, -5); g.lineTo(L - 6, 5); g.fill();
    } else {
      const R = D.reach + 15;
      g.fillStyle = 'rgba(255,60,30,0.13)'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, R, e.aim - 1, e.aim + 1); g.closePath(); g.fill();
      g.fillStyle = `rgba(255,${hot ? 40 : 90},30,${0.22 + 0.33 * p})`; g.beginPath(); g.moveTo(x, y); g.arc(x, y, R * p, e.aim - 1, e.aim + 1); g.closePath(); g.fill();
      g.strokeStyle = `rgba(255,120,80,${0.45 + 0.4 * p})`; g.lineWidth = 0.7; g.beginPath(); g.arc(x, y, R, e.aim - 1, e.aim + 1); g.stroke();
    }
    g.restore();
  }
}
function drawShots(g) {
  for (const [x, y, a, hostile, kind] of shots) {
    if (kind === 2) { // javelin
      g.save(); g.translate(x, y - 4); g.rotate(a); ART.setRot(a);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-12, 4, 18, 1.5);
      ART.solid(g, [[-12, -0.5], [4, -0.6], [4, 0.6], [-12, 0.5]], [-12, 0, 0.5], [4, 0, 0.5], hostile ? '#6a4a2a' : '#c8a050');
      ART.solid(g, [[4, -1.2], [9, 0], [4, 1.2]], [5, 0, 0.8], [5, 0, 0.8], '#d8e0e8'); g.restore(); continue; }
    const c = !hostile ? '255,215,110' : kind === 1 ? '255,200,90' : '255,110,50', tx = x - Math.cos(a) * 12, ty = y - 3 - Math.sin(a) * 12;
    const gr = g.createRadialGradient(x, y - 3, 0, x, y - 3, 6); gr.addColorStop(0, `rgba(${c},0.8)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.beginPath(); g.arc(x, y - 3, 6, 0, TAU); g.fill();
    if (kind === 1) { g.strokeStyle = 'rgba(255,250,210,0.95)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x, y - 3); for (let i = 1; i <= 4; i++) g.lineTo(x - Math.cos(a) * i * 3 + (Math.random() - 0.5) * 2.5, y - 3 - Math.sin(a) * i * 3 + (Math.random() - 0.5) * 2.5); g.stroke(); continue; }
    const lg = g.createLinearGradient(tx, ty, x, y - 3); lg.addColorStop(0, `rgba(${c},0)`); lg.addColorStop(1, 'rgba(255,250,230,1)');
    g.strokeStyle = lg; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(tx, ty); g.lineTo(x, y - 3); g.stroke();
  }
}
function drawFx(g, f) {
  const k = 1 - f.life / f.max, al = f.life / f.max;
  switch (f.k) {
    case 'trail': {
      if (f.ent != null) { if (f.ent === myId) { f.x = local.x; f.y = local.y; } else { const e = ents.get(f.ent); if (e) { f.x = e.rx; f.y = e.ry; } } }
      const head = ease(k / 0.45), fade2 = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55, a0 = f.a + 1.3 * f.dir, a1 = a0 - 2.6 * f.dir * head;
      g.lineCap = 'butt';
      for (let i = 0; i < 5; i++) { g.strokeStyle = `rgba(${f.rgb},${fade2 * (0.08 + i * 0.12)})`; g.lineWidth = 2.6 - i * 0.3; g.beginPath(); g.arc(f.x, f.y, f.r * (0.55 + i * 0.1), a0, a1, f.dir > 0); g.stroke(); }
      g.strokeStyle = `rgba(255,255,255,${fade2 * 0.9})`; g.lineWidth = 0.8; g.beginPath(); g.arc(f.x, f.y, f.r * 0.98, a0 - (a0 - a1) * 0.35, a1, f.dir > 0); g.stroke();
      break; }
    case 'shock': {
      const r = f.r * ease(k * 1.15);
      const gr = g.createRadialGradient(f.x, f.y, r * 0.2, f.x, f.y, r); gr.addColorStop(0, 'rgba(190,150,255,0)'); gr.addColorStop(0.75, `rgba(190,150,255,${0.28 * al})`); gr.addColorStop(1, `rgba(255,240,200,${0.5 * al})`);
      g.fillStyle = gr; g.beginPath(); g.arc(f.x, f.y, r, 0, TAU); g.fill();
      g.strokeStyle = `rgba(255,240,200,${al})`; g.lineWidth = 0.5 + 3.5 * al; g.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU; g.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r); } g.stroke();
      g.strokeStyle = `rgba(200,160,255,${0.7 * al})`; g.lineWidth = 1.5 * al + 0.3; g.beginPath(); for (let i = 0; i <= 8; i++) { const a = i / 8 * TAU + f.seed; g.lineTo(f.x + Math.cos(a) * r * 0.72, f.y + Math.sin(a) * r * 0.72); } g.stroke();
      g.strokeStyle = `rgba(255,250,230,${0.8 * al})`; g.lineWidth = 0.7;
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + f.seed; g.beginPath(); g.moveTo(f.x + Math.cos(a) * r * 0.7, f.y + Math.sin(a) * r * 0.7); g.lineTo(f.x + Math.cos(a) * r * 1.08, f.y + Math.sin(a) * r * 1.08); g.stroke(); }
      if (k < 0.2) { const fl = 1 - k / 0.2, fg = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 18); fg.addColorStop(0, `rgba(255,255,240,${fl})`); fg.addColorStop(1, 'rgba(255,230,180,0)'); g.fillStyle = fg; g.beginPath(); g.arc(f.x, f.y, 18, 0, TAU); g.fill(); }
      break; }
    case 'scorch': { const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r); gr.addColorStop(0, `rgba(30,12,8,${0.4 * al})`); gr.addColorStop(1, 'rgba(30,12,8,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(f.x, f.y, f.r, f.r * 0.8, 0, 0, TAU); g.fill(); break; }
    case 'crack': { g.strokeStyle = `rgba(30,12,6,${0.6 * al})`; g.lineWidth = 0.8; for (let i = 0; i < 9; i++) { let a = ART.hsh(f.seed * 7 + i, 3) * TAU, x = f.x, y = f.y; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { a += (ART.hsh(f.seed + i, j) - 0.5) * 0.8; x += Math.cos(a) * f.r / 4; y += Math.sin(a) * f.r / 4; g.lineTo(x, y); } g.stroke(); } break; }
    case 'dust': { const r = f.r * (1 + k * 1.6); g.fillStyle = `rgba(${f.col || '160,108,74'},${0.35 * al})`; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r); } g.fill(); break; }
    case 'spark': { g.strokeStyle = `rgba(${f.col},${al})`; g.lineWidth = 0.8; g.lineCap = 'round'; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x - f.vx * 0.035, f.y - f.vy * 0.035); g.stroke(); break; }
    case 'ash': { g.fillStyle = `rgba(${f.col},${al})`; g.fillRect(f.x - 0.6, f.y - 0.6, 1.2, 1.2); break; }
    case 'ring': { const r = lerp(f.r0, f.r1, ease(k)); g.strokeStyle = `rgba(${f.col},${al})`; g.lineWidth = (f.w || 2) * al + 0.3; g.beginPath(); g.arc(f.x, f.y, r, 0, TAU); g.stroke(); break; }
    case 'star': { const r = 4 + ease(k) * 10; star(g, f.x, f.y, r, `rgba(255,250,220,${al})`); g.strokeStyle = `rgba(255,240,190,${al})`; g.lineWidth = 1; g.beginPath(); g.arc(f.x, f.y, r * 1.2, 0, TAU); g.stroke(); break; }
    case 'beam': {
      if (f.ent != null) { if (f.ent === myId) { f.x = local.x; f.y = local.y; } else { const e = ents.get(f.ent); if (e) { f.x = e.rx; f.y = e.ry; } } }
      const w = 9 * (0.6 + 0.4 * Math.sin(k * Math.PI)), gr = g.createLinearGradient(0, f.y - 70, 0, f.y);
      gr.addColorStop(0, 'rgba(255,220,120,0)'); gr.addColorStop(1, `rgba(255,220,120,${0.55 * al})`); g.fillStyle = gr; g.fillRect(f.x - w, f.y - 70, w * 2, 72);
      g.strokeStyle = `rgba(255,220,120,${al})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(f.x, f.y + 2, 6 + k * 12, (6 + k * 12) * 0.5, 0, 0, TAU); g.stroke();
      for (let i = 0; i < 6; i++) { const yy = f.y - ((k * 90 + i * 13) % 70); g.fillStyle = `rgba(255,240,190,${al})`; g.fillRect(f.x - 6 + ART.hsh(i, 5) * 12, yy, 1, 1.6); }
      break; }
    case 'ghost': { const e = ents.get(f.id); if (!e && f.id !== myId) break; const src = e || { house: me.look.house, tone: me.look.tone, hair: me.look.hair };
      ART.humanoid(g, { x: f.x, y: f.y, face: f.face, s: 1.1, pal: ART.playerPal({ house: src.house, tone: src.tone }), hair: src.hair, weapon: 'razor', t: clock, alpha: 0.35 * al, noShadow: true, dashing: true }); break; }
    case 'corpse': { const e = f.ent; ART.mob(g, e.type, { x: f.x, y: f.y + k * 2, face: e.face, walk: 0, moving: false, t: clock, alpha: al, seed: e.id, s: 1 - k * 0.15 }); break; }
  }
}

// ---------------- HUD ----------------
function text(g, s, x, y, o) {
  g.font = o.font || `600 13px ${FONT_B}`; g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic';
  if (o.stroke) { g.lineJoin = 'round'; g.strokeStyle = o.strokeCol || 'rgba(10,4,2,0.9)'; g.lineWidth = o.stroke; g.strokeText(s, x, y); }
  else if (o.shadow !== false) { g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillText(s, x + 1, y + 1); }
  g.fillStyle = o.color || '#f3e6cc'; g.fillText(s, x, y);
}
function panel(g, x, y, w, h, r) {
  ART.rrect(g, x, y, w, h, r || 10); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(28,16,10,0.86)'); gr.addColorStop(1, 'rgba(12,6,4,0.86)'); g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(233,195,90,0.38)'; g.lineWidth = 1; g.stroke();
}
function bar(g, x, y, w, h, v, max, c0, c1, label) {
  ART.rrect(g, x, y, w, h, h / 2); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill();
  const fw = w * clamp(v / max, 0, 1);
  if (fw > 0.5) { ART.rrect(g, x, y, Math.max(h, fw), h, h / 2); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + h / 2, y + 1, Math.max(0, fw - h), h * 0.3); }
  ART.rrect(g, x, y, w, h, h / 2); g.strokeStyle = 'rgba(233,195,90,0.3)'; g.lineWidth = 1; g.stroke();
  if (label) text(g, label, x + w / 2, y + h / 2 + 0.5, { font: `700 ${Math.max(9, h - 3)}px ${FONT_B}`, align: 'center', base: 'middle', stroke: 2.5 });
}
function vignette(g) {
  const w = innerWidth, h = innerHeight, low = me && myId && !me.dead && me.hp / me.maxHp < 0.3 ? (0.5 + 0.5 * Math.sin(clock * 5)) * (1 - me.hp / me.maxHp / 0.3) : 0;
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(12,4,2,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const hv = Math.max(hurtV * 0.55, low * 0.45);
  if (hv > 0.01) { const rg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7); rg.addColorStop(0, 'rgba(160,0,0,0)'); rg.addColorStop(1, `rgba(170,10,0,${hv})`); g.fillStyle = rg; g.fillRect(0, 0, w, h); }
}
function diffColor(lvl) { const d = lvl - (me ? me.level : 1); return d >= 5 ? '#ff4a3a' : d >= 3 ? '#ff9a3a' : d >= -2 ? '#ffd24a' : d >= -6 ? '#7ad07a' : '#a8a8a8'; }
function shipLabel(g, toScreen) {
  if (!map.pad || flight) return; const d = Math.hypot(local.x - map.pad.ramp.x, local.y - map.pad.ramp.y); if (d > 220) return;
  const [sx, sy] = toScreen(map.pad.x, map.pad.y - 60); g.globalAlpha = clamp((220 - d) / 60, 0, 1);
  text(g, 'Your Ship', sx, sy, { font: `700 14px ${FONT_T}`, color: '#f6e3b0', align: 'center', stroke: 3 });
  text(g, 'Board at the ramp to fly anywhere', sx, sy + 14, { font: `600 11px ${FONT_B}`, color: '#bfa98a', align: 'center', stroke: 2.5 }); g.globalAlpha = 1;
}
function nameplates(g, toScreen) {
  const hover = hoverMob();
  for (const e of ents.values()) {
    const [x, y] = entPos(e), [sx, sy] = toScreen(x, y);
    if (sx < -60 || sy < -60 || sx > innerWidth + 60 || sy > innerHeight + 60) continue;
    if (e.kind === 'p') { if (e.dead) continue; const self = e.id === myId, H = houseOf(e.house), top = sy - 15 * Z * 1.1;
      if (e.hname) text(g, `‹ ${e.hname} ›`, sx, top - 22, { font: `600 10.5px ${FONT_T}`, color: ART.shade(e.hcolor || '#e8e4dc', e.hcolor === '#34343f' ? 0.55 : 0.4), align: 'center', stroke: 2.5 });
      text(g, e.name, sx, top - 8, { font: `700 13px ${FONT_T}`, color: self ? '#fff4d6' : '#ffe39a', align: 'center', stroke: 3 });
      text(g, `${e.level} · ${H.name}`, sx, top + 4, { font: `600 10px ${FONT_B}`, color: H.color === '#34343f' ? '#b8b8c8' : ART.shade(H.color, 0.45), align: 'center', stroke: 2.5 });
      if (!self && e.hp < e.maxHp) bar(g, sx - 22, top + 8, 44, 5, e.hp, e.maxHp, '#7fd07f', '#3a8a3a'); }
    else { const D = MOBS[e.type], show = D.elite || e.hp < e.maxHp || e === hover || e.state === 'wind'; if (!show) continue;
      const L = ART.MOB_LOOK[e.type], top = sy - (D.r * 2 + 10) * Z * (L.s || 1);
      if (D.elite || e === hover) text(g, D.name, sx, top - 10, { font: `700 ${D.elite ? 14 : 12}px ${FONT_T}`, color: D.elite ? '#ffd66b' : '#ffb09a', align: 'center', stroke: 3 });
      const bw = D.elite ? 80 : 44; bar(g, sx - bw / 2, top - 4, bw, D.elite ? 7 : 5, e.hp, e.maxHp, '#ff7a55', '#b02a18');
      text(g, String(D.lvl), sx - bw / 2 - 4, top + 1, { font: `700 10px ${FONT_B}`, color: diffColor(D.lvl), align: 'right', stroke: 2.5 }); }
  }
  for (const f of folk) { const R = f.citizen ? 45 : 90, d = Math.hypot(local.x - f.x, local.y - f.y); if (d > R) continue; const [sx, sy] = toScreen(f.x, f.y), a = clamp((R - d) / 25, 0, 1), top = sy - 15 * Z * (f.big ? 1.4 : 1);
    g.globalAlpha = a; text(g, f.name, sx, top - 6, { font: `600 12px ${FONT_T}`, color: f.giver ? '#ffe39a' : '#e8dcc4', align: 'center', stroke: 3 }); text(g, ART.COLOR_STYLE[f.color].label + (f.smith ? ' · Smith' : f.trader ? ' · Trader' : f.trainer ? ' · Trainer' : ''), sx, top + 6, { font: `600 10px ${FONT_B}`, color: ART.shade(ART.COLOR_STYLE[f.color].armor, 0.3), align: 'center', stroke: 2.5 }); g.globalAlpha = 1; }
}
function hoverMob() { const wx = (mouse.x - innerWidth / 2) / Z + cam.x, wy = (mouse.y - innerHeight / 2) / Z + cam.y; let best = null, bd = 14; for (const e of ents.values()) if (e.kind === 'm') { const d = Math.hypot(e.rx - wx, e.ry - 4 - wy); if (d < bd) { bd = d; best = e; } } return best; }
function hud(g) {
  const w = innerWidth, h = innerHeight, H = houseOf(me.look.house);
  // unit frame
  panel(g, 14, 14, 312, 86, 12);
  g.save(); g.beginPath(); g.arc(56, 57, 32, 0, TAU); g.clip();
  const pg = g.createRadialGradient(56, 50, 4, 56, 57, 34); pg.addColorStop(0, ART.shade(H.color, 0.25)); pg.addColorStop(1, ART.shade(H.color, -0.6)); g.fillStyle = pg; g.fillRect(20, 20, 72, 72);
  g.translate(56, 62); g.scale(3.3, 3.3); ART.humanoid(g, { x: 0, y: 0, face: -Math.PI / 2, s: 1.1, pal: ART.playerPal(me.look), hair: me.look.hair, weapon: null, t: clock, walk: 0, noShadow: true, seed: 3 }); g.restore();
  g.beginPath(); g.arc(56, 57, 32, 0, TAU); g.strokeStyle = '#e9c35a'; g.lineWidth = 2; g.stroke();
  ART.rrect(g, 40, 82, 32, 16, 8); g.fillStyle = '#1a0d06'; g.fill(); g.strokeStyle = '#e9c35a'; g.lineWidth = 1; g.stroke();
  text(g, String(me.level), 56, 90.5, { font: `700 11px ${FONT_B}`, color: '#ffe6a0', align: 'center', base: 'middle', shadow: false });
  text(g, me.name, 100, 38, { font: `700 17px ${FONT_T}`, color: '#f6e3b0' });
  text(g, `Gold · House ${H.name}`, 100, 54, { font: `500 11.5px ${FONT_B}`, color: '#bfa98a' });
  bar(g, 100, 62, 212, 16, me.hp, me.maxHp, '#e0503a', '#8a1a10', `${Math.ceil(me.hp)} / ${me.maxHp}`);
  bar(g, 100, 83, 212, 6, me.xp, me.next, '#f0cf6e', '#a8751e');
  panel(g, 14, 106, 132, 26, 9); ART.setRot(0); ART.gem(g, 30, 120, 6, 5.4, 6, 5, '#ffd24a', 0.3); text(g, fmt(prof.credits), 44, 124, { font: `700 13px ${FONT_B}`, color: '#ffe6a0' }); text(g, 'cr', 138, 124, { font: `600 10px ${FONT_B}`, color: '#a8927a', align: 'right' });
  const left = pointsLeft(); if (left > 0) { const p = 0.5 + 0.5 * Math.sin(clock * 3); panel(g, 152, 106, 174, 26, 9); ART.rrect(g, 152, 106, 174, 26, 9); g.strokeStyle = `rgba(255,220,120,${0.3 + 0.5 * p})`; g.lineWidth = 1.5; g.stroke();
    text(g, `${left} talent point${left > 1 ? 's' : ''} · press Tab`, 239, 123.5, { font: `700 11.5px ${FONT_B}`, color: '#ffe6a0', align: 'center' }); }
  // action bar
  const S = 54, gap = 8, bw = AB_ORDER.length * S + (AB_ORDER.length - 1) * gap, bx = (w - bw) / 2, by = h - S - 20;
  const xw = Math.max(bw + 120, 440); bar(g, (w - xw) / 2, by - 16, xw, 6, me.xp, me.next, '#f0cf6e', '#a8751e');
  text(g, `Level ${me.level}  ·  ${me.xp} / ${me.next} xp`, w / 2, by - 22, { font: `600 10.5px ${FONT_B}`, color: '#cdb892', align: 'center', stroke: 2.5 });
  let tip = null; const safe = MAP.inSafe(map, local.x, local.y);
  AB_ORDER.forEach((ab, i) => {
    const x = bx + i * (S + gap), A = ABILITIES[ab], cd = local.cd[ab], locked = WEAPON_AB[ab] && safe;
    ART.rrect(g, x, by, S, S, 10); const gr = g.createLinearGradient(0, by, 0, by + S); gr.addColorStop(0, '#2e1c12'); gr.addColorStop(1, '#120905'); g.fillStyle = gr; g.fill();
    g.save(); ART.rrect(g, x, by, S, S, 10); g.clip();
    g.globalAlpha = locked ? 0.3 : 1; ART.icon(g, ab, x + S / 2, by + S / 2, S * 0.7); g.globalAlpha = 1;
    const full = mods().cd[ab];
    if (cd > 0) { g.fillStyle = 'rgba(0,0,0,0.62)'; g.beginPath(); g.moveTo(x + S / 2, by + S / 2); g.arc(x + S / 2, by + S / 2, S, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, cd / full), false); g.closePath(); g.fill();
      if (full >= 1) text(g, cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1), x + S / 2, by + S / 2 + 1, { font: `700 17px ${FONT_B}`, color: '#fff', align: 'center', base: 'middle', stroke: 3 }); }
    g.restore();
    const rf = readyFlash[ab] || 0;
    ART.rrect(g, x, by, S, S, 10); g.strokeStyle = rf > 0 ? `rgba(255,240,190,${0.5 + rf})` : cd > 0 || locked ? 'rgba(150,120,70,0.5)' : '#e9c35a'; g.lineWidth = rf > 0 ? 3 : 1.5; g.stroke();
    text(g, A.key, x + 5, by + 12, { font: `700 9.5px ${FONT_B}`, color: '#f0d9a0', stroke: 2.5 });
    if (mouse.x > x && mouse.x < x + S && mouse.y > by && mouse.y < by + S) tip = { A, x: x + S / 2, cd: full };
  });
  if (tip) { const tw = 260; g.font = `500 12px ${FONT_B}`; const lines = wrap(g, tip.A.desc, tw - 20), th = 44 + lines.length * 16, tx = clamp(tip.x - tw / 2, 8, w - tw - 8), ty = by - 36 - th;
    panel(g, tx, ty, tw, th, 8); text(g, tip.A.name, tx + 10, ty + 20, { font: `700 14px ${FONT_T}`, color: '#f6e3b0' }); text(g, `${tip.cd}s cooldown`, tx + tw - 10, ty + 20, { font: `500 11px ${FONT_B}`, color: '#a8927a', align: 'right' });
    lines.forEach((l, i) => text(g, l, tx + 10, ty + 40 + i * 16, { font: `500 12px ${FONT_B}`, color: '#e0d2b8' })); }
  // zone plaque and minimap (fog of war: only places you have been; enemies are never shown)
  const pw = 230, mx = w - pw - 14, my = 14, ms = pw - 20;
  panel(g, mx, my, pw, 58 + ms, 10);
  text(g, map.name, mx + pw / 2, my + 22, { font: `700 14px ${FONT_T}`, color: safe ? '#9ee09e' : '#f0cf6e', align: 'center' });
  text(g, safe ? 'Sanctuary' : map.levels ? `Levels ${map.levels}` : '', mx + pw / 2, my + 38, { font: `500 11px ${FONT_B}`, color: '#bfa98a', align: 'center' });
  minimap(g, mx + 10, my + 48, ms, 3);
  text(g, 'M · map', mx + pw - 14, my + 48 + ms - 6, { font: `600 10px ${FONT_B}`, color: 'rgba(230,210,170,0.8)', align: 'right', stroke: 2.5 });
  // quest tracker
  let qy = my + 58 + ms + 26; const qs = Object.entries(quests);
  if (qs.length) { text(g, 'QUESTS', w - 18, qy, { font: `700 12px ${FONT_T}`, color: '#e9c35a', align: 'right', stroke: 3 }); qy += 20;
    for (const [id, st] of qs) { const Q = QUESTS[id], done = st.n >= Q.count, giver = TOWNSFOLK.find(f => f.id === Q.giver);
      text(g, Q.name, w - 18, qy, { font: `600 12.5px ${FONT_B}`, color: done ? '#9ee09e' : '#f3e6cc', align: 'right', stroke: 3 });
      text(g, done ? `Return to ${giver.name} (${ZNAME(giver.zone)})` : `${MOBS[Q.kill].name}: ${Math.min(st.n, Q.count)} / ${Q.count}`, w - 18, qy + 15, { font: `500 11px ${FONT_B}`, color: done ? '#b8e8b0' : '#bfa98a', align: 'right', stroke: 2.5 }); qy += 36; } }
  // prompts, banners, toasts
  const tg = dialogKind ? null : target();
  if (tg) text(g, `[E]  ${tg.kind === 'ship' ? 'Board your ship' : tg.kind === 'node' ? 'Gather ' + MATERIALS[NODE_MATERIAL[tg.n.kind]].name : roleOf(tg.f) + ' ' + tg.f.name}`, w / 2, by - 48, { font: `600 14px ${FONT_B}`, color: '#ffe6a0', align: 'center', stroke: 3 });
  if (zoneBanner && zoneBanner.t > 0) { const a = clamp(zoneBanner.t, 0, 1) * clamp((3.8 - zoneBanner.t) * 3, 0, 1); g.globalAlpha = a;
    text(g, zoneBanner.title, w / 2, h * 0.22, { font: `900 38px ${FONT_T}`, color: '#f6e3b0', align: 'center', stroke: 5 }); text(g, zoneBanner.sub, w / 2, h * 0.22 + 26, { font: `600 13px ${FONT_B}`, color: '#cdb892', align: 'center', stroke: 3 }); g.globalAlpha = 1; }
  if (toast) { g.globalAlpha = clamp(toast.t * 2, 0, 1); text(g, toast.msg, w / 2, h * 0.3 + 30, { font: `600 14px ${FONT_B}`, color: '#ffd6a0', align: 'center', stroke: 3 }); g.globalAlpha = 1; }
  if (me.dead) { g.fillStyle = 'rgba(40,0,0,0.5)'; g.fillRect(0, 0, w, h);
    text(g, 'YOU HAVE FALLEN', w / 2, h / 2 - 10, { font: `900 44px ${FONT_T}`, color: '#ff6a50', align: 'center', stroke: 6 });
    text(g, `Returning to ${zoneId === 'citadel' ? 'the plaza' : 'the waystation'} in ${Math.max(0, Math.ceil(me.respawnT))}`, w / 2, h / 2 + 22, { font: `600 15px ${FONT_B}`, color: '#f3e6cc', align: 'center', stroke: 3 }); }
  if (!connected) text(g, 'DISCONNECTED · reload to rejoin', w / 2, 30, { font: `700 15px ${FONT_B}`, color: '#ff6a50', align: 'center', stroke: 3 });
  text(g, 'Tab menu · M map · E interact', w - 14, h - 12, { font: `500 10.5px ${FONT_B}`, color: 'rgba(205,184,146,0.7)', align: 'right', stroke: 2 });
}
// ---------------- the map: fog of war, remembered per character and zone in this browser ----------------
const FOG = {}, FOG_R = { mine: 7 }; // reveal radius in tiles (smaller in the dark mines)
const fogKey = (id) => `ro_fog_${(me && me.name || '').toLowerCase()}_${id}`;
function fogFor(id) {
  if (FOG[id] && FOG[id].who === (me && me.name)) return FOG[id];
  const m = zoneData(id).map, base = ART.mapImage(m), cw = Math.ceil(m.w / 2), ch = Math.ceil(m.h / 2), bits = new Uint8Array(cw * ch);
  try { const saved = localStorage.getItem(fogKey(id)); if (saved) { const bin = atob(saved); for (let i = 0; i < bits.length; i++) if (bin.charCodeAt(i >> 3) & (1 << (i & 7))) bits[i] = 1; } } catch (e) { /* no saved map */ }
  if (id === 'citadel') bits.fill(1); // home is always known
  const img = document.createElement('canvas'); img.width = m.w; img.height = m.h; const g = img.getContext('2d');
  const src = base.getContext('2d').getImageData(0, 0, m.w, m.h), out = g.createImageData(m.w, m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (bits[(y >> 1) * cw + (x >> 1)]) { const i = (y * m.w + x) * 4; out.data[i] = src.data[i]; out.data[i + 1] = src.data[i + 1]; out.data[i + 2] = src.data[i + 2]; out.data[i + 3] = 255; }
  g.putImageData(out, 0, 0);
  return (FOG[id] = { who: me && me.name, m, base, img, g, cw, ch, bits, dirty: false, saveT: 0 });
}
const known = (f, tx, ty) => !!f.bits[(Math.floor(ty) >> 1) * f.cw + (Math.floor(tx) >> 1)];
function reveal(dt) {
  if (!me || me.dead) return; const f = fogFor(zoneId), R = (FOG_R[map.biome] || 10) / 2, px = local.x / T / 2, py = local.y / T / 2;
  for (let cy = Math.max(0, Math.floor(py - R)); cy <= Math.min(f.ch - 1, Math.ceil(py + R)); cy++) for (let cx = Math.max(0, Math.floor(px - R)); cx <= Math.min(f.cw - 1, Math.ceil(px + R)); cx++) {
    const i = cy * f.cw + cx; if (f.bits[i] || Math.hypot(cx + 0.5 - px, cy + 0.5 - py) > R) continue; f.bits[i] = 1; f.dirty = true; f.g.drawImage(f.base, cx * 2, cy * 2, 2, 2, cx * 2, cy * 2, 2, 2); }
  if (f.dirty && (f.saveT -= dt) <= 0) saveFog(f);
}
function saveFog(f) { f.dirty = false; f.saveT = 4; let bin = ''; for (let i = 0; i < f.bits.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) if (f.bits[i + k]) b |= 1 << k; bin += String.fromCharCode(b); }
  try { localStorage.setItem(fogKey(f.m.id), btoa(bin)); } catch (e) { /* not persisted */ } }
addEventListener('beforeunload', () => { for (const f of Object.values(FOG)) if (f.dirty) saveFog(f); });
// Map markers, in tile coordinates. Only things you know about: no enemies, no strangers.
function mapMarkers(g, f, k) {
  const dot = (x, y, r, col, ring) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r / k, 0, TAU); g.fill(); if (ring) { g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1 / k; g.stroke(); } };
  const m = f.m;
  for (const p of m.props) if (p.type === 'relic' && found.has(p.id)) { const x = p.x / T, y = p.y / T; g.fillStyle = '#9fe8ff'; g.beginPath(); g.moveTo(x, y - 3 / k); g.lineTo(x + 2.2 / k, y); g.lineTo(x, y + 3 / k); g.lineTo(x - 2.2 / k, y); g.fill(); }
  for (const fo of folk) { if (fo.citizen || !(fo.giver || fo.smith || fo.trader || fo.trainer) || !known(f, fo.x / T, fo.y / T)) continue; dot(fo.x / T, fo.y / T, 2.6, fo.giver ? '#ffd24a' : fo.smith ? '#ffb070' : fo.trader ? '#9fe0a8' : '#d8b8ff', true); }
  if (m.pad && known(f, m.pad.x / T, m.pad.y / T)) { const x = m.pad.x / T, y = m.pad.y / T; g.fillStyle = '#f6e3b0'; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 1 / k; g.beginPath(); g.moveTo(x, y - 5 / k); g.lineTo(x + 4.5 / k, y + 3.5 / k); g.lineTo(x, y + 1.8 / k); g.lineTo(x - 4.5 / k, y + 3.5 / k); g.closePath(); g.fill(); g.stroke(); }
  if (myHouse) for (const e of ents.values()) if (e.kind === 'p' && e.id !== myId && !e.dead && e.hname === myHouse.name) dot(e.rx / T, e.ry / T, 2.4, '#7fb8ff', true);
  const a = aimAngle(), x = local.x / T, y = local.y / T; g.save(); g.translate(x, y); g.rotate(a); g.scale(1 / k, 1 / k); g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(5, 0); g.lineTo(-3.5, 3.5); g.lineTo(-1.5, 0); g.lineTo(-3.5, -3.5); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function minimap(g, x, y, size, k) {
  const f = fogFor(zoneId); g.save(); ART.rrect(g, x, y, size, size, 8); g.clip(); g.fillStyle = '#0a0604'; g.fillRect(x, y, size, size);
  g.translate(x + size / 2, y + size / 2); g.scale(k, k); g.translate(-local.x / T, -local.y / T); g.imageSmoothingEnabled = false; g.drawImage(f.img, 0, 0); g.imageSmoothingEnabled = true;
  mapMarkers(g, f, k); g.restore();
  ART.rrect(g, x, y, size, size, 8); g.strokeStyle = 'rgba(233,195,90,0.35)'; g.lineWidth = 1; g.stroke();
}
function fullMap(g) {
  const w = innerWidth, hh = innerHeight, f = fogFor(zoneId), m = f.m, k = Math.min((w * 0.84) / m.w, (hh * 0.74) / m.h), mw = m.w * k, mh = m.h * k, x0 = (w - mw) / 2, y0 = (hh - mh) / 2 + 10;
  g.fillStyle = 'rgba(6,3,2,0.82)'; g.fillRect(0, 0, w, hh); panel(g, x0 - 14, y0 - 50, mw + 28, mh + 90, 14);
  text(g, map.name, w / 2, y0 - 22, { font: `700 20px ${FONT_T}`, color: '#f6e3b0', align: 'center' });
  let n = 0; for (const b of f.bits) n += b; text(g, `${Math.round(n / f.bits.length * 100)}% explored`, x0 + mw, y0 - 22, { font: `600 11px ${FONT_B}`, color: '#bfa98a', align: 'right' });
  g.save(); g.beginPath(); g.rect(x0, y0, mw, mh); g.clip(); g.fillStyle = '#0a0604'; g.fillRect(x0, y0, mw, mh); g.translate(x0, y0); g.scale(k, k); g.imageSmoothingEnabled = false; g.drawImage(f.img, 0, 0); g.imageSmoothingEnabled = true; mapMarkers(g, f, k); g.restore();
  const legend = [['#f6e3b0', 'Your ship'], ['#ffd24a', 'Contracts'], ['#ffb070', 'Smith'], ['#9fe0a8', 'Trader'], ['#d8b8ff', 'Trainer'], ['#9fe8ff', 'Relic found'], ['#7fb8ff', 'Housemate']];
  let lx = x0; for (const [c, l] of legend) { g.fillStyle = c; g.beginPath(); g.arc(lx + 5, y0 + mh + 20, 4, 0, TAU); g.fill(); text(g, l, lx + 13, y0 + mh + 24, { font: `600 11px ${FONT_B}`, color: '#d8c8ac' }); g.font = `600 11px ${FONT_B}`; lx += 26 + g.measureText(l).width; }
  text(g, 'M or Esc to close', x0 + mw, y0 + mh + 24, { font: `600 11px ${FONT_B}`, color: '#8a7a64', align: 'right' });
}
function wrap(g, s, maxW) { const out = []; let cur = ''; for (const word of s.split(' ')) { const t = cur ? cur + ' ' + word : word; if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = word; } else cur = t; } if (cur) out.push(cur); return out; }

// ---------------- the menu (Tab): character, journal, bestiary, House, society, settings ----------------
const TABS = [['char', 'Character'], ['talents', 'Talents'], ['inventory', 'Inventory'], ['journal', 'Journal'], ['bestiary', 'Bestiary'], ['house', 'House'], ['society', 'Society'], ['settings', 'Settings']];
const menuEl = $('menu'), mbody = $('mbody'); let menuTab = 'char';
const menuOpen = () => !menuEl.hidden;
$('menubtn').onclick = () => toggleMenu();
// Build DOM safely: strings always become text nodes, never HTML (House names, mottos and player names are user input).
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v); }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}
function cnv(w, hh, draw) { const c = document.createElement('canvas'), d = Math.min(2, devicePixelRatio || 1); c.width = w * d; c.height = hh * d; c.style.width = w + 'px'; c.style.height = hh + 'px'; const g = c.getContext('2d'); g.scale(d, d); draw(g); return c; }
function toggleMenu(tab) { if (menuOpen() && (!tab || tab === menuTab)) return closeMenu(); closeDialog(); menuEl.hidden = false; if (tab) menuTab = tab; request(menuTab); renderMenu(); SFX.play('click'); }
function closeMenu() { menuEl.hidden = true; if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }
function refreshMenu(tab) { if (menuOpen() && menuTab === tab && !(document.activeElement && mbody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) renderMenu(); }
function request(tab) { if (tab === 'char' || tab === 'bestiary' || tab === 'journal') send({ t: 'stats' }); if (tab === 'house') send({ t: 'house', action: 'info' }); if (tab === 'society') send({ t: 'roster' }); }
function renderMenu() {
  if (!menuOpen() || !me) return;
  $('mtabs').replaceChildren(...TABS.map(([id, label]) => h('button', { class: 'mtab' + (id === menuTab ? ' on' : ''), onclick: () => { menuTab = id; request(id); renderMenu(); } }, label)),
    h('button', { class: 'mclose', onclick: closeMenu, 'aria-label': 'Close menu' }, '×'));
  const top = mbody.scrollTop; mbody.replaceChildren(...PAGES[menuTab]().filter(x => x != null)); mbody.scrollTop = top;
}
const fmtTime = (sec) => { const hh = Math.floor(sec / 3600), mm = Math.floor(sec / 60) % 60; return hh ? `${hh}h ${mm}m` : `${mm}m`; };
let MOB_ZONE = null; // which zone each monster lives in, built the first time the bestiary opens
const mobZone = (type) => { if (!MOB_ZONE) { MOB_ZONE = {}; for (const z of Object.keys(MAP.ZONES)) for (const c of zoneData(z).map.camps) if (!MOB_ZONE[c.type]) MOB_ZONE[c.type] = z; } return MOB_ZONE[type]; };
const stat = (label, value) => h('div', { class: 'stat' }, h('small', null, label), h('b', null, value));
const createForm = { name: '', color: HERALD_COLORS[0], sigil: SIGILS[0] };
let confirmAction = null;
function armed(action, label, confirmLabel, fn, cls) { // two-click confirmation for destructive actions
  return h('button', { class: 'btn sm ' + (cls || ''), onclick: () => { if (confirmAction === action) { confirmAction = null; fn(); } else { confirmAction = action; renderMenu(); } } }, confirmAction === action ? confirmLabel : label);
}
const PAGES = {
  char() {
    const H = houseOf(me.look.house), M = mods(), kills = stats ? Object.values(stats.kills).reduce((a, b) => a + b, 0) : '…';
    const portrait = cnv(150, 180, (g) => { const gr = g.createRadialGradient(75, 90, 10, 75, 90, 90); gr.addColorStop(0, ART.shade(H.color, -0.2)); gr.addColorStop(1, '#120905'); g.fillStyle = gr; g.fillRect(0, 0, 150, 180);
      g.translate(75, 96); g.scale(5, 5); ART.humanoid(g, { x: 0, y: 0, face: -Math.PI / 2, s: 1.1, pal: ART.playerPal(me.look), hair: me.look.hair, weapon: 'razor', t: clock, walk: 0, noShadow: true, emblem: myHouse ? { color: myHouse.color, sigil: myHouse.sigil } : null }); });
    const abil = AB_ORDER.map(ab => { const A = ABILITIES[ab]; return h('div', { class: 'abil' }, cnv(40, 40, (g) => ART.icon(g, ab, 20, 20, 30)), h('div', null, h('b', null, `${A.name} `), h('span', { class: 'small' }, `${A.key} · ${M.cd[ab]}s`), h('div', null, A.desc))); });
    return [h('div', { class: 'grid2' }, portrait, h('div', null,
      h('h3', null, me.name), h('div', { class: 'small' }, `Level ${me.level} Gold · Institute House ${H.name}${myHouse ? ' · House ' + myHouse.name : ''}`),
      h('div', { class: 'stats', style: 'margin-top:12px' }, stat('Health', `${Math.ceil(me.hp)} / ${me.maxHp}`), stat('Blade damage', Math.round(M.dmg)), stat('Pulse fist', Math.round(M.fistDmg)), stat('Move speed', `${Math.round(M.spd / PLAYER.spd * 100)}%`), stat('Parry window', `${M.parry.toFixed(2)}s`), stat('Experience', `${me.xp} / ${me.next}`), stat('Credits', fmt(prof.credits)),
        stat('Creatures slain', kills), stat('Deaths', stats ? stats.deaths : '…'), stat('Time in the world', stats ? fmtTime(stats.played) : '…'),
        stat('Relics found', `${found.size} / ${Object.keys(RELICS).length}`), stat('Lands discovered', `${seenZones.length} / ${Object.keys(MAP.ZONES).length}`), stat('Contracts', Object.keys(quests).length)))),
      h('h3', null, 'Gear'), h('div', { class: 'stats' }, ...Object.entries(GEAR).map(([k, G]) => stat(G.name, h('span', null, `Rank ${prof.gear[k] || 0} `, pips(prof.gear[k] || 0, G.max))))),
      h('h3', null, 'Abilities'), ...abil];
  },
  talents() {
    const left = pointsLeft(), total = DEFS.talentPoints(me.level), ICON = { might: 'spear', vitality: 'sun', swiftness: 'eagle', reflexes: 'serpent', reach: 'star', shockwave: 'moon', renewal: 'flame', fortune: 'crown' };
    return [h('h3', null, `Talents · ${left} of ${total} point${total === 1 ? '' : 's'} to spend`), h('div', { class: 'small' }, 'You earn a talent point every level after the first. Spend them here, any time. Archon Serapha in the Citadel can reset them for a fee.'),
      h('div', { class: 'cards', style: 'margin-top:12px' }, Object.entries(TALENTS).map(([id, Tl]) => { const r = prof.talents[id] || 0, can = left > 0 && r < Tl.max;
        return h('div', { class: 'card2 talent' + (r ? ' has' : '') }, cnv(44, 44, (g) => { g.fillStyle = r ? '#2a1a0e' : '#160d08'; g.beginPath(); g.arc(22, 22, 20, 0, TAU); g.fill(); ART.sigil(g, ICON[id], 22, 22, 13, r ? '#f0cf6e' : '#7a6a54'); }),
          h('b', null, Tl.name), h('div', null, pips(r, Tl.max)), h('p', null, Tl.desc),
          h('button', { class: 'btn sm' + (can ? ' primary' : ''), ...(can ? {} : { disabled: '' }), onclick: () => send({ t: 'talent', id }) }, r >= Tl.max ? 'Mastered' : 'Learn')); }))];
  },
  inventory() {
    return [h('h3', null, 'Purse'), h('div', { class: 'stats' }, stat('Credits', fmt(prof.credits)), stat('Talent points', `${pointsLeft()} to spend`)),
      h('h3', null, 'Gear'), h('div', { class: 'small' }, 'Smiths in the Citadel and at every waystation upgrade your gear for credits and materials.'),
      h('div', { class: 'cards', style: 'margin-top:8px' }, Object.entries(GEAR).map(([k, G]) => h('div', { class: 'card2' }, h('b', null, G.name), h('div', null, pips(prof.gear[k] || 0, G.max)), h('div', { class: 'small' }, `Rank ${prof.gear[k] || 0} of ${G.max}`), h('p', null, G.desc)))),
      h('h3', null, 'Materials'), h('div', { class: 'small' }, 'Gather them from glowing nodes out in the world (E), take them from monsters, or buy them from traders.'),
      h('div', { class: 'mats' }, Object.entries(MATERIALS).map(([k, Mt]) => h('div', { class: 'mat' + (prof.mats[k] ? '' : ' none') }, matIcon(k, 26), h('div', null, h('b', null, Mt.name), h('span', { class: 'n' }, ` × ${fmt(prof.mats[k] || 0)}`), h('div', { class: 'small' }, Mt.where)))))];
  },
  journal() {
    const out = [h('h3', null, 'Contracts')], qs = Object.entries(quests);
    if (!qs.length) out.push(h('div', { class: 'small' }, 'No active contracts. Quest givers show a "!" above their heads.'));
    for (const [id, st] of qs) { const Q = QUESTS[id], G = TOWNSFOLK.find(f => f.id === Q.giver), n = Math.min(st.n, Q.count);
      out.push(h('div', { class: 'lore' }, h('b', null, Q.name), h('div', { class: 'small' }, n >= Q.count ? `Complete · return to ${G.name}, ${ZNAME(G.zone)}` : `${MOBS[Q.kill].name}: ${n} / ${Q.count} · for ${G.name}`),
        h('div', { class: 'bar2' }, h('i', { style: `width:${n / Q.count * 100}%` })), h('div', null, Q.text))); }
    out.push(h('h3', null, `Relics · ${found.size} of ${Object.keys(RELICS).length}`), h('div', { class: 'small' }, 'Relics are carved stones that glow with a thin beam of pale light. Walk up to one to read it.'));
    for (const z of Object.keys(MAP.ZONES)) { const list = Object.entries(RELICS).filter(([, r]) => r.zone === z), known = seenZones.includes(z);
      out.push(h('div', { class: 'small', style: 'margin-top:12px;letter-spacing:.1em;text-transform:uppercase' }, `${known ? ZNAME(z) : 'Unexplored lands'} · ${list.filter(([id]) => found.has(id)).length} / ${list.length}`));
      for (const [id, r] of list) if (found.has(id)) out.push(h('div', { class: 'lore' }, h('b', null, r.name), h('div', null, r.text))); }
    return out;
  },
  bestiary() {
    const kills = (stats && stats.kills) || {}, types = Object.keys(MOBS).filter(k => !MOBS[k].dummy), known = types.filter(k => kills[k]).length;
    return [h('h3', null, `Bestiary · ${known} of ${types.length} creatures`), h('div', { class: 'cards' }, types.map(type => {
      const D = MOBS[type], n = kills[type] || 0, L = ART.MOB_LOOK[type], z = mobZone(type);
      const pic = cnv(160, 110, (g) => { const sc = 3.4 / (L.s || 1); g.translate(80, 58); g.scale(sc, sc); ART.mob(g, type, { x: 0, y: 0, face: -Math.PI / 2 + 0.5, t: 1, walk: 1, moving: true, seed: 7 });
        if (!n) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#1c120c'; g.fillRect(0, 0, 400, 400); } });
      return n ? h('div', { class: 'card2' }, pic, h('b', null, D.name), h('div', { class: 'small' }, `Level ${D.lvl}${D.elite ? ' · Champion' : ''} · ${ZNAME(z)}`), h('div', { class: 'small' }, `Slain: ${n}`), h('p', null, LORE[type]))
        : h('div', { class: 'card2 unknown' }, pic, h('b', null, 'Unknown creature'), h('div', { class: 'small' }, `Level ${D.lvl} · ${seenZones.includes(z) ? ZNAME(z) : 'somewhere unexplored'}`), h('p', null, 'Defeat one to learn more.'));
    }))];
  },
  house() {
    const pend = invites.length ? [h('h3', null, 'Invitations'), ...invites.map(i => h('div', { class: 'row2' }, cnv(28, 40, (g) => ART.banner(g, 4, 3, 20, 34, i.color, i.sigil)), h('span', null, `House ${i.name}, from ${i.from}`),
      h('button', { class: 'btn sm primary', onclick: () => send({ t: 'house', action: 'accept', key: i.key }) }, 'Join'), h('button', { class: 'btn sm', onclick: () => { invites = invites.filter(x => x !== i); send({ t: 'house', action: 'decline', key: i.key }); } }, 'Decline')))] : [];
    if (!myHouse) {
      const F2 = createForm, name = h('input', { maxlength: HOUSE_RULES.nameMax, placeholder: 'e.g. Aurelian', value: F2.name, style: 'width:240px', oninput: (e) => { F2.name = e.target.value; } });
      const preview = cnv(90, 130, (g) => ART.banner(g, 15, 10, 60, 105, F2.color, F2.sigil));
      return [...pend, h('h3', null, 'Found a House'), h('div', { class: 'small' }, `Gather your friends under one banner. Housemates share a House chat (/h), wear your sigil on their cloaks, and earn +${Math.round(HOUSE_RULES.kinship * 100)}% XP for each housemate fighting nearby (up to +${Math.round(HOUSE_RULES.kinshipMax * 100)}%).`),
        h('div', { class: 'grid2', style: 'margin-top:14px' }, preview, h('div', null,
          h('div', { class: 'small' }, 'House name'), h('div', { class: 'row2' }, h('span', null, 'House'), name),
          h('div', { class: 'small' }, 'Color'), h('div', { class: 'row2' }, ...HERALD_COLORS.map(c => h('button', { class: 'swatch' + (c === F2.color ? ' on' : ''), style: `background:${c}`, 'aria-label': 'Color', onclick: () => { F2.color = c; renderMenu(); } }))),
          h('div', { class: 'small' }, 'Sigil'), h('div', { class: 'row2' }, ...SIGILS.map(sg => h('button', { class: 'sig' + (sg === F2.sigil ? ' on' : ''), title: sg, onclick: () => { F2.sigil = sg; renderMenu(); } }, cnv(30, 30, (g) => ART.sigil(g, sg, 15, 15, 11, '#f0cf6e'))))),
          h('div', { class: 'row2' }, h('button', { class: 'btn primary', onclick: () => send({ t: 'house', action: 'create', name: F2.name.trim(), color: F2.color, sigil: F2.sigil }) }, 'Found the House'))))];
    }
    const H = myHouse, lead = H.members.some(m => m.leader && m.name === me.name), online = H.members.filter(m => m.online).length;
    const inv = h('input', { maxlength: 16, placeholder: 'Player name', style: 'width:180px' });
    const motto = h('input', { maxlength: HOUSE_RULES.mottoMax, placeholder: 'A motto for your House', value: H.motto || '', style: 'width:300px' });
    const rows = H.members.map(m => h('tr', null, h('td', null, h('span', { class: 'dot' + (m.online ? ' on' : '') }), m.leader ? '♛ ' : '', m.name), h('td', null, `Level ${m.level}`), h('td', { class: 'small' }, m.online ? m.zone : 'Offline'),
      h('td', { style: 'text-align:right' }, lead && !m.leader ? [h('button', { class: 'btn sm', onclick: () => send({ t: 'house', action: 'lead', target: m.name }) }, 'Make head'), ' ',
        armed('kick:' + m.name, 'Remove', 'Confirm remove', () => send({ t: 'house', action: 'kick', target: m.name }), 'danger')] : null)));
    return [...pend, h('div', { class: 'grid2' }, cnv(90, 130, (g) => ART.banner(g, 15, 10, 60, 105, H.color, H.sigil)), h('div', null,
      h('h3', null, `House ${H.name}`), H.motto ? h('div', { class: 'say' }, `"${H.motto}"`) : null,
      h('div', { class: 'small' }, `${H.members.length} of ${HOUSE_RULES.maxMembers} members · ${online} online · founded ${new Date(H.created).toLocaleDateString()}`),
      h('div', { class: 'small', style: 'margin-top:6px' }, `Kinship: +${Math.round(HOUSE_RULES.kinship * 100)}% XP for each housemate fighting near you, up to +${Math.round(HOUSE_RULES.kinshipMax * 100)}%. Speak to your House with /h in chat.`),
      h('div', { class: 'row2' }, inv, h('button', { class: 'btn sm primary', onclick: () => { if (inv.value.trim()) send({ t: 'house', action: 'invite', target: inv.value.trim() }); inv.value = ''; } }, 'Invite')))),
      h('h3', null, 'Members'), h('table', { class: 'members' }, ...rows),
      lead ? h('div', null, h('h3', null, 'Head of House'), h('div', { class: 'row2' }, motto, h('button', { class: 'btn sm', onclick: () => send({ t: 'house', action: 'motto', text: motto.value }) }, 'Set motto')),
        h('div', { class: 'row2' }, armed('disband', 'Disband House', 'Click again to disband forever', () => send({ t: 'house', action: 'disband' }), 'danger'))) : null,
      h('div', { class: 'row2', style: 'margin-top:14px' }, armed('leave', 'Leave House', 'Click again to leave', () => send({ t: 'house', action: 'leave' }), 'danger'))];
  },
  society() {
    return [h('h3', null, `Online · ${roster.length}`), h('table', { class: 'members' }, ...roster.map(r => h('tr', null, h('td', null, h('span', { class: 'dot on' }), r.name), h('td', null, `Level ${r.level}`),
      h('td', { class: 'small' }, r.house ? `House ${r.house}` : 'No House'), h('td', { class: 'small' }, r.zone),
      h('td', { style: 'text-align:right' }, r.name !== me.name ? [h('button', { class: 'btn sm', onclick: () => { closeMenu(); chatin.style.display = 'block'; $('chat').classList.add('open'); chatin.value = `/w ${r.name} `; chatin.focus(); } }, 'Whisper'),
        myHouse && !r.house ? [' ', h('button', { class: 'btn sm primary', onclick: () => send({ t: 'house', action: 'invite', target: r.name }) }, 'Invite')] : null] : null)))),
      h('div', { class: 'row2' }, h('button', { class: 'btn sm', onclick: () => send({ t: 'roster' }) }, 'Refresh'))];
  },
  settings() {
    const tog = (label, on, fn) => h('label', { class: 'toggle' }, h('input', { type: 'checkbox', ...(on ? { checked: '' } : {}), onchange: fn }), label);
    return [h('h3', null, 'Settings'), tog('Sound effects', !SFX.muted, () => SFX.toggle()), tog('Screen shake', settings.shake, (e) => { settings.shake = e.target.checked; saveSettings(); }),
      h('h3', null, 'Controls'), h('div', { class: 'keys', style: 'margin-top:0;border:none;padding:0' }, ...[['WASD', 'Move'], ['Left click', 'Razor'], ['Right click', 'Razor whip'], ['Q', 'Pulse fist'], ['Space', 'Dash'], ['Shift', 'Parry'], ['E', 'Talk, gather, board your ship'], ['Tab', 'Menu'], ['M', 'Map'], ['Enter', 'Chat'], ['/h  /w  /r', 'House chat, whisper, reply']].flatMap(([k, v]) => [h('b', null, k), h('span', null, v)]))];
  },
};
// A House invitation pops up over the game until answered or expired.
let inviteTimer = null;
function showInvite(i) {
  const box = $('invite'); clearTimeout(inviteTimer);
  box.replaceChildren(cnv(28, 40, (g) => ART.banner(g, 4, 3, 20, 34, i.color, i.sigil)), h('div', null, h('b', null, `House ${i.name}`), h('div', { class: 'small' }, `${i.from} invites you to join.`)),
    h('button', { class: 'btn sm primary', onclick: () => { box.hidden = true; send({ t: 'house', action: 'accept', key: i.key }); } }, 'Join'),
    h('button', { class: 'btn sm', onclick: () => { box.hidden = true; invites = invites.filter(x => x.key !== i.key); send({ t: 'house', action: 'decline', key: i.key }); } }, 'Decline'));
  box.hidden = false; inviteTimer = setTimeout(() => { box.hidden = true; }, HOUSE_RULES.inviteTtl * 1000);
}

requestAnimationFrame(frame);
})();
