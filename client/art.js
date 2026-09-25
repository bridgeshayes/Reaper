// Reaper Online art: procedural low-poly ("polyblock") drawing of characters, creatures and terrain.
// Everything is built from faceted solids: a 2D outline raised to a ridge or apex, with every flat facet lit by one
// fixed sun, so shading shifts as characters turn. Coordinates are world pixels (1 tile = 16 px) on a context the
// caller has already scaled by the camera zoom. Characters are seen from above: +x in their local frame is the way
// they face and +y is their right hand.
(() => {
const MAP = window.SHARED_MAP, DEFS = window.SHARED_DEFS, { T, TL } = MAP;
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
function hsh(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const hex2 = (v) => (v < 16 ? '0' : '') + (v | 0).toString(16);
function shade(hex, amt) { // lighten (amt > 0) toward white or darken (amt < 0) toward black; always returns #rrggbb
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (amt > 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; } else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return '#' + hex2(clamp(r, 0, 255)) + hex2(clamp(g, 0, 255)) + hex2(clamp(b, 0, 255));
}
const ell = (g, x, y, rx, ry, rot) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); g.fill(); };
const line = (g, x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
const path = (g, pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ---------------- flat-shaded low-poly primitives ----------------
const LX = -0.46, LY = -0.62, LZ = 0.64;   // the sun: from the upper left, fairly high
let RC = 1, RS = 0;                        // rotation of the model being drawn, so facets are lit in world space
const setRot = (a) => { RC = Math.cos(a); RS = Math.sin(a); };
const TONES = new Map();
function tone(base, q) { q = Math.round(q * 24) / 24; const k = base + q; let v = TONES.get(k); if (v === undefined) { v = q === 0 ? base : shade(base, q); TONES.set(k, v); } return v; }
// Fill a 3D polygon ([x,y,z] points) projected straight down, lit by its facet normal.
function facet(g, pts, base) {
  let nx = 0, ny = 0, nz = 0; const n = pts.length;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  const l = Math.hypot(nx, ny, nz) || 1; if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  nx /= l; ny /= l; nz /= l;
  const d = (nx * RC - ny * RS) * LX + (nx * RS + ny * RC) * LY + nz * LZ;
  g.fillStyle = tone(base, clamp((d - 0.6) * 1.15, -0.62, 0.44));
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < n; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill();
}
const EDGE = 'rgba(12,6,3,0.75)';
// A solid: the outline (2D points at z=0) raised to the ridge segment r0→r1 ([x,y,z]); r0 equal to r1 makes a pyramid.
function solid(g, out, r0, r1, base, edge) {
  const dx = r1[0] - r0[0], dy = r1[1] - r0[1], L2 = dx * dx + dy * dy, n = out.length;
  g.fillStyle = tone(base, -0.4); path(g, out); g.fill();          // underlay: seams between facets read as creases
  const R = out.map(p => { const t = L2 ? clamp(((p[0] - r0[0]) * dx + (p[1] - r0[1]) * dy) / L2, 0, 1) : 0; return [r0[0] + dx * t, r0[1] + dy * t, r0[2] + (r1[2] - r0[2]) * t]; });
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, P = [out[i][0], out[i][1], 0], Q = [out[j][0], out[j][1], 0], a = R[i], b = R[j];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 0.02) facet(g, [P, Q, a], base); else facet(g, [P, Q, b, a], base); }
  if (edge !== false) { g.strokeStyle = edge || EDGE; g.lineWidth = 0.3; g.lineJoin = 'round'; path(g, out); g.stroke(); }
}
// A regular (optionally jittered) polygon outline.
function ring(cx, cy, rx, ry, n, rot, jit, seed) { const out = []; for (let i = 0; i < n; i++) { const a = (rot || 0) + i / n * TAU, k = jit ? 1 - jit / 2 + hsh((seed || 0) + i * 7, i * 3 + 1) * jit : 1; out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); } return out; }
const gem = (g, cx, cy, rx, ry, n, z, base, rot, ax, ay, edge) => solid(g, ring(cx, cy, rx, ry, n, rot), [cx + (ax || 0), cy + (ay || 0), z], [cx + (ax || 0), cy + (ay || 0), z], base, edge);
// A bevelled box: sloped sides up to an inset flat top.
function block(g, x0, y0, x1, y1, h, base, ins, edge) {
  ins = ins == null ? Math.min(x1 - x0, y1 - y0) * 0.22 : ins;
  const o = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], t = [[x0 + ins, y0 + ins, h], [x1 - ins, y0 + ins, h], [x1 - ins, y1 - ins, h], [x0 + ins, y1 - ins, h]];
  g.fillStyle = tone(base, -0.4); g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let i = 0; i < 4; i++) facet(g, [o[i], o[(i + 1) % 4], t[(i + 1) % 4], t[i]], base);
  facet(g, t, base);
  if (edge !== false) { g.strokeStyle = edge || EDGE; g.lineWidth = 0.3; g.strokeRect(x0, y0, x1 - x0, y1 - y0); }
}
// A limb: an elongated hexagonal prism from a to b.
function limb(g, a, b, w, base, z) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy * w / 2, ny = ux * w / 2, e = w * 0.45, zz = z || w * 0.8;
  solid(g, [[a[0] - ux * e, a[1] - uy * e], [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] + ux * e, b[1] + uy * e], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], [a[0], a[1], zz], [b[0], b[1], zz], base);
}
function shadow(g, x, y, rx, ry, a) { g.fillStyle = `rgba(16,6,3,${a || 0.3})`; path(g, ring(x, y, rx, ry, 8, Math.PI / 8)); g.fill(); }

// ---------------- palettes ----------------
// How each Color dresses. Hair is their natural hair; skin varies per person, not per Color.
const COLOR_STYLE = {
  gold:     { label: 'Gold',     cloth: '#4a3010', armor: '#c4922f', trim: '#fff0b8', hair: '#ecc251' },
  gray:     { label: 'Gray',     cloth: '#3f464e', armor: '#77818c', trim: '#c3ccd6', hair: '#4a4038' },
  red:      { label: 'Red',      cloth: '#8e2a1c', armor: '#6b2a1e', trim: '#d49a6a', hair: '#b8361e' },
  obsidian: { label: 'Obsidian', cloth: '#1c1a20', armor: '#34303a', trim: '#8a7f92', hair: '#161316' },
  pink:     { label: 'Pink',     cloth: '#d98aa6', armor: '#e8a8bf', trim: '#fff0f4', hair: '#7a3e3a' },
  brown:    { label: 'Brown',    cloth: '#6e4a2e', armor: '#8a6040', trim: '#c8a47a', hair: '#3a2618' },
  blue:     { label: 'Blue',     cloth: '#2f5aa0', armor: '#4a78c0', trim: '#b8d4ff', hair: '#2a3450' },
  green:    { label: 'Green',    cloth: '#2f7a44', armor: '#3f9a58', trim: '#b8f0c8', hair: '#1f3a24' },
  violet:   { label: 'Violet',   cloth: '#6a3fa0', armor: '#8a5fc0', trim: '#e0c8ff', hair: '#2a1a3a' },
  orange:   { label: 'Orange',   cloth: '#c86a22', armor: '#a85a24', trim: '#f0c080', hair: '#5a2a10' },
  yellow:   { label: 'Yellow',   cloth: '#c8aa30', armor: '#e8d070', trim: '#fff8c8', hair: '#4a3a18' },
  silver:   { label: 'Silver',   cloth: '#8e959e', armor: '#c4cad2', trim: '#ffffff', hair: '#c8ccd0' },
  copper:   { label: 'Copper',   cloth: '#8a4a2a', armor: '#b06a3a', trim: '#f0c8a0', hair: '#3a2014' },
  white:    { label: 'White',    cloth: '#e6e2da', armor: '#f4f0e8', trim: '#d8b860', hair: '#e8e4dc' },
};
const SKINS = ['#f3d4b4', '#e9bb92', '#d09a6c', '#a86f47', '#7a4e34', '#5e3b28'];
function makePal(o) {
  const skin = o.skin || SKINS[1], hair = o.hair || '#333333';
  return { armored: !!o.armored, armor: o.armor, armorHi: shade(o.armor, 0.12), armorD: shade(o.armor, -0.45), cloth: o.cloth, clothD: shade(o.cloth, -0.35),
    trim: o.trim, hair, hairD: shade(hair, -0.35), skin, skinD: shade(skin, -0.28), cloak: o.cloak || null, boot: o.boot || '#2a1a12', gauntlet: o.gauntlet || null };
}
const PALS = {};
function palFor(key, build) { return PALS[key] || (PALS[key] = makePal(build())); }
const houseOf = (id) => DEFS.HOUSES.find(h => h.id === id) || DEFS.HOUSES[0];
function playerPal(look) {
  const house = houseOf(look.house), S = COLOR_STYLE.gold;
  return palFor(`p:${house.id}:${look.tone}`, () => ({ armored: true, armor: S.armor, cloth: S.cloth, trim: S.trim, hair: DEFS.HAIR_TONES[look.tone] || S.hair, skin: SKINS[1], cloak: house.color, gauntlet: '#4a3a6a' }));
}
function colorPal(color, skinIdx, extra) {
  const S = COLOR_STYLE[color] || COLOR_STYLE.gray;
  return palFor(`c:${color}:${skinIdx}:${extra ? JSON.stringify(extra) : ''}`, () => Object.assign({ armor: S.armor, cloth: S.cloth, trim: S.trim, hair: S.hair, skin: SKINS[skinIdx % SKINS.length] }, extra || {}));
}
const FLASH = makePal({ armored: true, armor: '#ffffff', cloth: '#ffffff', trim: '#ffffff', hair: '#ffffff', skin: '#ffffff', cloak: '#ffe6dc', boot: '#ffffff', gauntlet: '#ffffff' });
const STATUE = makePal({ armored: true, armor: '#d8a83c', cloth: '#b88a2a', trim: '#fff0b0', hair: '#e8bc4a', skin: '#d8a83c', cloak: '#c49430', boot: '#a87a24', gauntlet: '#d8a83c' });
const pickHouse = (seed) => DEFS.HOUSES[Math.floor(hsh(seed * 13 + 5, 3) * DEFS.HOUSES.length)];

// How every monster looks. kind picks the model; humanoids get a palette, weapon and gear.
const MOB_LOOK = {
  hound:    { kind: 'beast', s: 1.15, P: { body: '#5e544c', dark: '#2a2420', head: '#6a5e54', eye: '#ffb040', ember: '#ff7a2a' } },
  wolf:     { kind: 'beast', s: 1.3, P: { body: '#8a9096', dark: '#3e4248', head: '#a4aab0', eye: '#9fe0ff', ember: null } },
  crawler:  { kind: 'crawler', s: 1.05 },
  pitviper: { kind: 'viper', s: 1.1 },
  drone:    { kind: 'drone', s: 1 },
  legion:   { kind: 'humanoid', pal: () => colorPal('gray', 2, { armored: true, cloak: '#6a1a18' }), weapon: 'sword', helmet: true, crest: '#c8321e', s: 1.0 },
  sharp:    { kind: 'humanoid', pal: () => colorPal('gray', 3, { armored: true, armor: '#5d6670' }), weapon: 'rifle', helmet: true, s: 0.97 },
  obsidian: { kind: 'humanoid', pal: () => colorPal('obsidian', 0, { armored: true, cloak: '#4a3a2c' }), weapon: 'axe', hair: 2, s: 1.45 },
  gold:     { kind: 'humanoid', pal: () => colorPal('gold', 0, { armored: true, cloak: '#16121a', hair: '#f4d270', gauntlet: '#3a1a1a' }), weapon: 'razor', hair: 1, s: 1.12 },
  enforcer: { kind: 'humanoid', pal: () => colorPal('gray', 4, { armored: true, armor: '#5a626c', trim: '#8fb8d8' }), weapon: 'baton', shield: true, helmet: true, s: 1.12 },
  warden:   { kind: 'humanoid', pal: () => colorPal('obsidian', 1, { armored: true, armor: '#2e2a34', cloak: '#3a2418', trim: '#ff9a4a' }), weapon: 'maul', helmet: true, crest: '#ff7a2a', s: 1.75 },
  raider:   { kind: 'humanoid', pal: (id) => { const H = pickHouse(id); return colorPal('gold', id % 3, { armored: true, cloak: H.color, hair: DEFS.HAIR_TONES[id % 4] }); }, weapon: 'razor', hairOf: (id) => id % 4, s: 1.08 },
  javelin:  { kind: 'humanoid', pal: (id) => { const H = pickHouse(id + 7); return colorPal('gold', (id + 1) % 3, { armored: true, armor: '#b89a5a', cloak: H.color, hair: DEFS.HAIR_TONES[(id + 2) % 4] }); }, weapon: 'javelin', hairOf: (id) => (id + 1) % 4, s: 1.04 },
  primus:   { kind: 'humanoid', pal: () => colorPal('gold', 0, { armored: true, armor: '#dcae40', cloak: '#7a0f16', gauntlet: '#5a1010' }), weapon: 'razor', helmet: true, crest: '#ffd24a', s: 1.28 },
  scorpion: { kind: 'crawler', s: 1.6, C: '#8fcfd6', D: '#2f5a62' },
  dune:     { kind: 'humanoid', pal: (id) => colorPal(id % 2 ? 'brown' : 'red', 2 + id % 3, { cloak: '#b8945a', hair: '#3a2618' }), weapon: 'sword', hairOf: (id) => id % 4, s: 1.02 },
  skimmer:  { kind: 'drone', s: 1.2, body: '#c8a878', pod: '#8a6a44', drill: '#6a8a9a' },
  iron:     { kind: 'humanoid', pal: () => colorPal('gray', 3, { armored: true, armor: '#4a5058', trim: '#d8a040', cloak: '#5a1a14' }), weapon: 'sword', shield: true, helmet: true, crest: '#d8a040', s: 1.2 },
  legate:   { kind: 'humanoid', pal: () => colorPal('gray', 1, { armored: true, armor: '#3a4048', trim: '#ffd24a', cloak: '#8a1a18' }), weapon: 'maul', helmet: true, crest: '#ffd24a', s: 1.85 },
  frostwolf:{ kind: 'beast', s: 1.4, P: { body: '#dfe8f0', dark: '#6a7888', head: '#f4f8fc', eye: '#6fd0ff', ember: null } },
  clansman: { kind: 'humanoid', pal: (id) => colorPal('obsidian', id % 2, { armored: true, armor: '#3a3a44', cloak: '#9a8a78', trim: '#a8c8e0' }), weapon: 'axe', hairOf: (id) => id % 2 ? 2 : 1, s: 1.45 },
  thrower:  { kind: 'humanoid', pal: (id) => colorPal('obsidian', id % 2, { armored: true, armor: '#44444e', cloak: '#b8b0a4', trim: '#a8c8e0' }), weapon: 'javelin', hair: 2, s: 1.35 },
  wyrm:     { kind: 'viper', s: 2.1, C1: '#bcd8ea', C2: '#7aa0c0', H: '#d8ecf8' },
  bandit:   { kind: 'humanoid', pal: (id) => colorPal('red', id % 3, { cloak: '#7a3a1e', hair: '#3a2618' }), weapon: 'sword', hairOf: (id) => id % 4, s: 1.0 },
  scavenger:{ kind: 'drone', s: 0.95, body: '#8a6a4a', pod: '#5a4636', drill: '#c89040' },
  burrower: { kind: 'beast', s: 1.05, P: { body: '#6e5646', dark: '#3a2a20', head: '#7e6452', eye: '#ff5a40', ember: null } },
  sentry:   { kind: 'turret', s: 1.1 },
  hunter:   { kind: 'humanoid', pal: (id) => { const H = pickHouse(id + 3); return colorPal('gold', id % 3, { armored: true, armor: '#6a5a3a', cloak: H.color, hair: DEFS.HAIR_TONES[(id + 1) % 4] }); }, weapon: 'javelin', hairOf: (id) => (id + 2) % 4, s: 1.04 },
  duneworm: { kind: 'viper', s: 3.0, C1: '#c8a070', C2: '#9a7448', H: '#d8b888' },
  berserker:{ kind: 'humanoid', pal: (id) => colorPal('obsidian', id % 2, { cloak: '#5a4a3c', trim: '#c84a2a' }), weapon: 'axe', hairOf: () => 2, s: 1.5 },
  dummy:    { kind: 'dummy', s: 1 },
  jarl:     { kind: 'humanoid', pal: () => colorPal('obsidian', 0, { armored: true, armor: '#2a3038', cloak: '#eef2f6', trim: '#8fd8ff' }), weapon: 'maul', helmet: true, crest: '#8fd8ff', s: 2.05 },
};

// ---------------- poses ----------------
// act = { k, p } where p is progress 0..1. Returns hand positions, weapon angle and body offsets in local units.
function pose(o) {
  const sw = o.moving ? Math.sin(o.walk) : 0, W = o.weapon;
  const r = { rh: [2.4 - sw * 1.8, 6.1], lh: [2.4 + sw * 1.8, -6.1], wa: 0.55, wh: 'r', lunge: 0, glow: 0, whip: -1, charge: 0, flashM: 0, parry: 0 };
  if (W === 'rifle') { r.rh = [3.4, 3.0]; r.lh = [8.2, 0.7]; r.wa = 0; }
  if (W === 'axe' || W === 'maul') { r.rh = [3.4, 4.6]; r.lh = [5.4, 2.4]; r.wa = -0.35; }
  if (W === 'javelin') { r.rh = [1.5, 5.2]; r.wa = -0.1; }
  if (o.shield) r.lh = [5.2, -3.4];
  const A = o.act; if (!A) return r;
  const p = clamp(A.p, 0, 1);
  switch (A.k) {
    case 'razor': case 'mslash': {
      if (W === 'axe' || W === 'maul') { const e = ease(p / 0.35); r.rh = [lerp(-0.6, 5.5, e), lerp(2.2, 1.8, e)]; r.lh = [lerp(0.2, 6.5, e), lerp(-0.8, -0.2, e)]; r.wa = lerp(3.0, 0, e); r.lunge = Math.sin(clamp(p / 0.5, 0, 1) * Math.PI) * 2.5; break; }
      const d = A.dir || 1, e = ease(p / 0.55), th = lerp(1.95, -1.6, e) * d, piv = [0.6, 4.2 * d], reach = 5.4;
      const hand = [piv[0] + Math.cos(th) * reach, piv[1] + Math.sin(th) * reach];
      if (d > 0 || o.shield) r.rh = hand; else { r.lh = hand; r.wh = 'l'; }
      r.wa = th; r.lunge = Math.sin(clamp(p / 0.6, 0, 1) * Math.PI) * 1.8; break; }
    case 'whip': r.rh = [lerp(3, 7.8, ease(p / 0.3)), 3.2]; r.wa = 0; r.whip = p; r.lunge = Math.sin(p * Math.PI) * 1.2; break;
    case 'fist': { const k = p < 0.2 ? ease(p / 0.2) : p < 0.55 ? 1 : 1 - ease((p - 0.55) / 0.45);
      r.lh = [lerp(2.4, 11.5, k), lerp(-6.1, -1.0, k)]; r.rh = [0.4, 6.4]; r.wa = 2.3; r.glow = Math.max(0, 1 - p * 1.4); r.lunge = k * 2.4; break; }
    case 'parry': r.rh = [6.4, 1.6]; r.wa = -1.5; r.parry = 1 - p; break;
    case 'wind': {
      const k = ease(p / 0.6), tr = Math.sin((o.t || 0) * 55) * 0.07 * p;
      if (W === 'rifle') { r.charge = p; r.rh = [3.0, 3.0]; r.lh = [7.8, 0.7]; }
      else if (W === 'axe' || W === 'maul') { r.rh = [lerp(3.4, -0.6, k), lerp(4.6, 2.2, k)]; r.lh = [lerp(5.4, 0.2, k), lerp(2.4, -0.8, k)]; r.wa = lerp(-0.35, 3.0, k) + tr; r.lunge = -k * 1.4; }
      else if (W === 'javelin') { r.rh = [lerp(1.5, -4.5, k), 5.2]; r.wa = tr; r.lh = [4, -4.5]; r.lunge = -k; }
      else { const th = lerp(0.6, 2.35, k) + tr; r.rh = [0.6 + Math.cos(th) * 5.4, 4.2 + Math.sin(th) * 5.4]; r.wa = th; r.lunge = -k * 1.2; }
      break; }
    case 'mslam': { const e = ease(p / 0.3); r.rh = [lerp(-0.6, 5.5, e), lerp(2.2, 1.8, e)]; r.lh = [lerp(0.2, 6.5, e), lerp(-0.8, -0.2, e)]; r.wa = lerp(3.0, 0, e); r.lunge = Math.sin(clamp(p / 0.5, 0, 1) * Math.PI) * 2.5; break; }
    case 'mshot': if (W === 'javelin') { r.rh = [lerp(-4.5, 7, ease(p / 0.3)), 5]; r.wa = 0; r.thrown = p > 0.15; } else { r.rh = [3.4 - (1 - p) * 1.6, 3.0]; r.lh = [8.2 - (1 - p) * 1.6, 0.7]; r.flashM = Math.max(0, 1 - p * 3); } break;
  }
  return r;
}

// ---------------- body parts ----------------
const TORSO = [[4.1, 0], [3.2, -3.4], [1.4, -5.6], [-1.4, -6.0], [-3.5, -4.1], [-4.3, -1.5], [-4.3, 1.5], [-3.5, 4.1], [-1.4, 6.0], [1.4, 5.6], [3.2, 3.4]];
function boot(g, x, y, col) { solid(g, [[x + 2.4, y], [x + 1.5, y - 1.3], [x - 1.5, y - 1.3], [x - 2.2, y], [x - 1.5, y + 1.3], [x + 1.5, y + 1.3]], [x + 1.4, y, 1.3], [x - 1.2, y, 1.3], col); }
function cloak(g, P, o) {
  const t = o.t || 0, sw = Math.sin(t * 1.8 + (o.seed || 0)) * 0.7 + (o.moving ? Math.sin(o.walk * 0.5) * 0.9 : 0);
  const hx = -8.8 - (o.moving ? 1.6 : 0) - (o.dashing ? 3.5 : 0);
  const out = [[0.8, -6.6], [-2.4, -7.7], [hx + 1.2, -6.4 + sw], [hx - 0.2, -3.2 + sw * 0.9], [hx - 1.3, sw], [hx - 0.2, 3.2 + sw * 0.9], [hx + 1.2, 6.4 + sw], [-2.4, 7.7], [0.8, 6.6]];
  solid(g, out, [-0.6, 0, 3.6], [hx + 0.6, sw, 0.8], P.cloak);
  g.strokeStyle = tone(P.cloak, -0.5); g.lineWidth = 0.55; g.beginPath(); g.moveTo(out[2][0], out[2][1]); for (let i = 3; i <= 6; i++) g.lineTo(out[i][0], out[i][1]); g.stroke();
}
function torso(g, P) {
  solid(g, TORSO, [3.0, 0, P.armored ? 3.4 : 2.6], [-3.6, 0, P.armored ? 3.2 : 2.4], P.armored ? P.armor : P.cloth);
  if (P.armored) {
    g.strokeStyle = P.trim; g.lineWidth = 0.35; g.beginPath(); g.moveTo(1.4, -5.6); g.lineTo(3.2, -3.4); g.lineTo(4.1, 0); g.lineTo(3.2, 3.4); g.lineTo(1.4, 5.6); g.stroke();
    if (P.cloak) { const sash = [[3.6, -2.2], [2.6, -3.7], [-3.8, 3.3], [-2.8, 4.8]]; g.fillStyle = tone(P.cloak, 0.08); path(g, sash); g.fill(); g.strokeStyle = EDGE; g.lineWidth = 0.25; g.stroke(); }
  } else { g.fillStyle = P.clothD; path(g, [[0.5, -5.9], [-0.7, -6.0], [-0.7, 6.0], [0.5, 5.9]]); g.fill(); }
}
function pauldron(g, P, s) {
  const cx = -0.3, cy = 5.3 * s;
  solid(g, ring(cx, cy, 3.3, 2.75, 8, Math.PI / 8), [cx + 2.2, cy + 0.25 * s, 2.8], [cx - 2.4, cy + 0.25 * s, 2.8], P.armor);
  const up = ring(cx + 0.2, cy - 0.35 * s, 2.1, 1.7, 6, 0); solid(g, up, [cx + 1.3, cy - 0.3 * s, 4.0], [cx - 1.2, cy - 0.3 * s, 4.0], P.armorHi);
  g.strokeStyle = P.trim; g.globalAlpha *= 0.6; g.lineWidth = 0.25; g.beginPath(); g.moveTo(up[5][0], up[5][1]); g.lineTo(up[0][0], up[0][1]); g.lineTo(up[1][0], up[1][1]); g.stroke(); g.globalAlpha /= 0.6;
}
function shoulder(g, P, s) { solid(g, ring(-0.2, 4.7 * s, 2.3, 2.0, 6, 0), [0.2, 4.7 * s, 1.8], [-0.6, 4.7 * s, 1.8], P.cloth); }
function arm(g, P, sx, sy, h, gauntlet, glow) {
  limb(g, [sx, sy], h, 2.1, P.armored ? P.armorD : P.cloth, 1.6);
  if (gauntlet) {
    if (glow > 0) { const gr = g.createRadialGradient(h[0], h[1], 0, h[0], h[1], 3 + glow * 6); gr.addColorStop(0, `rgba(255,236,170,${0.9 * glow})`); gr.addColorStop(0.4, `rgba(190,140,255,${0.5 * glow})`); gr.addColorStop(1, 'rgba(120,80,255,0)'); g.fillStyle = gr; ell(g, h[0], h[1], 3 + glow * 6, 3 + glow * 6); }
    gem(g, h[0], h[1], 1.9, 1.9, 6, 1.7, gauntlet, 0.5, 0.3);
    g.fillStyle = glow > 0 ? '#fff6d0' : 'rgba(200,170,255,0.85)'; path(g, ring(h[0] + 0.3, h[1], 0.55 + glow * 0.6, 0.55 + glow * 0.6, 4, 0)); g.fill();
  } else gem(g, h[0], h[1], 1.3, 1.3, 6, 1.1, P.armored ? P.armorD : P.skin, 0, 0.2);
}
function head(g, P, o) {
  const hx = 0.6, style = o.hair == null ? 0 : o.hair;
  if (P.armored && !o.helmet) gem(g, hx - 1.1, 0, 3.3, 3.9, 8, 2.2, P.armorD, Math.PI / 8);
  if (o.helmet) {
    solid(g, ring(hx, 0, 3.5, 3.35, 8, Math.PI / 8), [hx + 2.2, 0, 3.6], [hx - 2.6, 0, 3.6], P.armor);
    g.fillStyle = '#0e0b0a'; path(g, [[hx + 3.3, 0], [hx + 2.7, -2.0], [hx + 1.9, -2.3], [hx + 2.25, 0], [hx + 1.9, 2.3], [hx + 2.7, 2.0]]); g.fill();
    if (o.crest) solid(g, [[hx + 2.2, 0], [hx + 1.3, -0.85], [hx - 4.4, -0.75], [hx - 5.0, 0], [hx - 4.4, 0.75], [hx + 1.3, 0.85]], [hx + 1.8, 0, 5], [hx - 4.4, 0, 4.6], o.crest);
    return;
  }
  if (style === 1) solid(g, [[hx - 0.6, -3.3], [hx - 5, -4.5], [hx - 7.5, -2.3], [hx - 8, 0], [hx - 7.5, 2.3], [hx - 5, 4.5], [hx - 0.6, 3.3]], [hx - 1, 0, 2.6], [hx - 7.4, 0, 0.8], P.hair);
  if (style === 2) { for (const [dx, dy, r] of [[4.2, 0.3, 1.35], [5.7, 0.6, 1.15], [7.1, 0.9, 0.95]]) gem(g, hx - dx, dy, r, r, 6, r, P.hairD, 0.3); g.fillStyle = P.trim; path(g, ring(hx - 8, 1.0, 0.6, 0.6, 4, 0)); g.fill(); }
  gem(g, hx, 0, 3.15, 3.05, 8, 3.0, P.skin, Math.PI / 8, 0.9);
  if (style === 3) solid(g, [[hx + 2.5, 0], [hx + 1.3, -1.15], [hx - 3.3, -1.05], [hx - 3.8, 0], [hx - 3.3, 1.05], [hx + 1.3, 1.15]], [hx + 1.8, 0, 3.9], [hx - 3.2, 0, 3.6], P.hair);
  else if (style !== 4) {
    const pts = []; for (let d = 55; d <= 305; d += 25) { const a = d * Math.PI / 180; pts.push([hx - 0.25 + Math.cos(a) * 3.35, Math.sin(a) * 3.25]); }
    pts.push([hx + 1.5, -1.5], [hx + 2.1, 0], [hx + 1.5, 1.5]);
    solid(g, pts, [hx + 1.4, 0, 3.7], [hx - 2.6, 0, 3.5], P.hair);
  }
  g.fillStyle = P.skinD; path(g, [[hx + 3.45, 0], [hx + 2.7, -0.5], [hx + 2.7, 0.5]]); g.fill();
}

// ---------------- weapons (drawn in the hand's frame; lighting follows the blade) ----------------
let CUR_FACE = 0;
function inHand(g, h, a, fn) { g.save(); g.translate(h[0], h[1]); g.rotate(a); setRot(CUR_FACE + a); fn(); setRot(CUR_FACE); g.restore(); }
function razor(g, h, a, P, glint) {
  inHand(g, h, a, () => {
    block(g, -2.4, -0.6, 0.9, 0.6, 0.8, '#2a1a10', 0.2); block(g, 0.8, -1.7, 1.6, 1.7, 1.0, P.trim, 0.2);
    const L = 13.5; solid(g, [[1.5, -0.8], [L * 0.55, -1.45], [L, 0.35], [L * 0.55, 0.45], [1.5, 0.8]], [1.7, -0.1, 0.9], [L * 0.85, 0, 0.5], '#cfd8e2', 'rgba(20,24,30,0.6)');
    if (glint) { g.strokeStyle = `rgba(255,248,220,${glint})`; g.lineWidth = 2; line(g, 2, -0.9, L, 0.35); }
  });
}
function sword(g, h, a) { inHand(g, h, a, () => { block(g, -2.2, -0.6, 0.9, 0.6, 0.8, '#2a2018', 0.2); block(g, 0.8, -1.8, 1.5, 1.8, 1.0, '#8a8f96', 0.2);
  solid(g, [[1.4, -0.95], [10.4, -0.8], [12.2, 0], [10.4, 0.8], [1.4, 0.95]], [1.6, 0, 0.9], [11, 0, 0.8], '#a9b1ba'); }); }
function axe(g, h, a, big) { inHand(g, h, a, () => {
  limb(g, [-4, 0], [13.5, 0], 1.7, '#3a2616', 1.1);
  if (big) block(g, 11, -4.2, 17.5, 4.2, 3.5, '#4a4650', 1.4);
  else solid(g, [[11, -0.9], [12, -6.3], [16.6, -6.6], [15, 0], [16.6, 6.6], [12, 6.3], [11, 0.9]], [11.6, 0, 1.6], [15.4, 0, 1.0], '#9aa2aa'); }); }
function baton(g, h, a) { inHand(g, h, a, () => { limb(g, [-1.5, 0], [8, 0], 1.4, '#2e3238', 1); gem(g, 8.4, 0, 1.3, 1.3, 6, 1.2, '#5fc8ff', 0); }); }
function javelin(g, h, a) { inHand(g, h, a, () => { limb(g, [-9, 0], [11, 0], 1.0, '#6a4a2a', 0.8); solid(g, [[11, -0.9], [15.5, 0], [11, 0.9], [10.2, 0]], [11.5, 0, 0.8], [14.8, 0, 0.5], '#c8d0d8'); }); }
function shieldAt(g, h) { const c = [h[0] + 1.2, h[1] - 0.6];
  solid(g, [[c[0] + 1.6, c[1] - 4.2], [c[0] + 2.4, c[1]], [c[0] + 1.6, c[1] + 4.2], [c[0] - 0.4, c[1] + 4.4], [c[0] - 0.9, c[1]], [c[0] - 0.4, c[1] - 4.4]], [c[0] + 0.8, c[1] - 3.6, 2.2], [c[0] + 0.8, c[1] + 3.6, 2.2], '#6a7684');
  gem(g, c[0] + 0.9, c[1], 1.1, 1.1, 6, 2.8, '#c8a050', 0); }
function rifle(g, ps) {
  block(g, 0.5, 1.6, 5.5, 4.0, 1.4, '#2a2622', 0.3); block(g, 3.5, 0.4, 16, 2.6, 1.6, '#6d757e', 0.4); block(g, 6, 0, 9, 3, 2.4, '#1c1e20', 0.5);
  const c = Math.max(ps.charge, ps.flashM);
  if (c > 0) { const gr = g.createRadialGradient(16.6, 1.5, 0, 16.6, 1.5, 2 + c * 5); gr.addColorStop(0, `rgba(255,240,200,${c})`); gr.addColorStop(0.4, `rgba(255,110,50,${0.7 * c})`); gr.addColorStop(1, 'rgba(255,60,20,0)'); g.fillStyle = gr; ell(g, 16.6, 1.5, 2 + c * 5, 2 + c * 5); }
}
function whip(g, h, p, L) {
  const ext = p < 0.38 ? ease(p / 0.38) : p < 0.62 ? 1 : 1 - ease((p - 0.62) / 0.38), len = 6 + (L - 6) * ext, N = 22, pts = [];
  for (let i = 0; i <= N; i++) { const u = i / N; pts.push([h[0] + u * len, h[1] + (1 - ext) * 9 * u * u + Math.sin(u * 9 - p * 26) * 2.3 * u * (1 - ext * 0.75)]); }
  const stroke = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i <= N; i++) g.lineTo(pts[i][0], pts[i][1]); };
  g.lineCap = 'butt'; g.lineJoin = 'miter';
  stroke(); g.strokeStyle = 'rgba(30,20,12,0.6)'; g.lineWidth = 2.0; g.stroke();
  for (let i = 0; i < N; i++) { g.strokeStyle = i % 2 ? '#eef3f8' : '#8e9aa6'; g.lineWidth = 1.2 - i / N * 0.5; line(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); }
  const tp = pts[N], tq = pts[N - 1], ta = Math.atan2(tp[1] - tq[1], tp[0] - tq[0]);
  g.save(); g.translate(tp[0], tp[1]); g.rotate(ta); g.fillStyle = '#f4f8ff'; g.beginPath(); g.moveTo(-2.5, -1); g.lineTo(2.4, 0); g.lineTo(-2.5, 1); g.fill(); g.restore();
  const crack = 1 - Math.abs(p - 0.42) / 0.1;
  if (crack > 0) { g.strokeStyle = `rgba(255,244,200,${crack})`; g.lineWidth = 0.8; for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.3, r0 = 2, r1 = 4 + crack * 6; line(g, tp[0] + Math.cos(a) * r0, tp[1] + Math.sin(a) * r0, tp[0] + Math.cos(a) * r1, tp[1] + Math.sin(a) * r1); }
    const gr = g.createRadialGradient(tp[0], tp[1], 0, tp[0], tp[1], 7); gr.addColorStop(0, `rgba(255,236,170,${0.8 * crack})`); gr.addColorStop(1, 'rgba(255,200,90,0)'); g.fillStyle = gr; ell(g, tp[0], tp[1], 7, 7); }
}

// ---------------- characters ----------------
// o = { x, y, face, s, pal, hair, helmet, crest, weapon, shield, act:{k,p,dir}, walk, moving, dashing, flash, alpha, t, seed, noShadow, whipLen }
function humanoid(g, o) {
  const P = o.flash > 0 ? FLASH : o.pal, s = o.s || 1, ps = pose(o);
  g.save(); g.translate(o.x, o.y); if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (!o.noShadow) shadow(g, 0.8 * s, 2.4 * s, 7.4 * s, 5 * s);
  g.rotate(o.face); g.scale(s, s); CUR_FACE = o.face; setRot(o.face); g.translate(ps.lunge, 0);
  const st = o.moving ? Math.sin(o.walk) * 3 : 0;
  boot(g, 0.6 + st, 2.7, P.boot); boot(g, 0.6 - st, -2.7, P.boot);
  if (P.cloak) { cloak(g, P, o); if (o.emblem) emblem(g, o.emblem); }
  torso(g, P);
  const inLeft = ps.wh === 'l';
  if (!P.armored && !o.weapon && !o.act) { const k = o.moving ? Math.sin(o.walk) * 1.4 : 0; ps.rh = [2.2 - k, 5.0]; ps.lh = [2.2 + k, -5.0]; }
  arm(g, P, 0.2, -5.1, ps.lh, !inLeft && !o.shield && P.gauntlet, ps.glow); arm(g, P, 0.2, 5.1, ps.rh, null, 0);
  if (o.shield) shieldAt(g, ps.lh);
  if (P.armored) { pauldron(g, P, -1); pauldron(g, P, 1); } else { shoulder(g, P, -1); shoulder(g, P, 1); }
  const wh = inLeft ? ps.lh : ps.rh;
  if (ps.whip >= 0) whip(g, wh, ps.whip, (o.whipLen || 92) / s);
  else if (o.weapon === 'razor') razor(g, wh, ps.wa, P, ps.parry ? ps.parry : o.act && (o.act.k === 'razor' || o.act.k === 'mslash') ? 0.5 * (1 - o.act.p) : 0);
  else if (o.weapon === 'sword') sword(g, wh, ps.wa);
  else if (o.weapon === 'axe') axe(g, wh, ps.wa, false);
  else if (o.weapon === 'maul') axe(g, wh, ps.wa, true);
  else if (o.weapon === 'baton') baton(g, wh, ps.wa);
  else if (o.weapon === 'javelin' && !ps.thrown) javelin(g, wh, ps.wa);
  else if (o.weapon === 'rifle') rifle(g, ps);
  if (ps.parry > 0) { g.strokeStyle = `rgba(255,240,190,${0.7 * ps.parry})`; g.lineWidth = 1.2; g.beginPath(); g.arc(1, 0, 10, -1.2, 1.2); g.stroke(); }
  head(g, P, o);
  g.restore();
}
// Four-legged hunters: ash hounds and highland wolves.
function beast(g, o, L) {
  const P = o.flash > 0 ? { body: '#ffffff', dark: '#ffe8e0', head: '#ffffff', eye: '#ffffff', ember: null } : L.P, s = o.s || L.s, t = o.t || 0, A = o.act;
  let crouch = 0, lunge = 0, jaw = 0;
  if (A && A.k === 'wind') { crouch = ease(A.p); jaw = A.p * 0.6; }
  if (A && A.k === 'mslash') { lunge = Math.sin(clamp(A.p / 0.5, 0, 1) * Math.PI) * 5; jaw = 1 - A.p; }
  g.save(); g.translate(o.x, o.y); if (o.alpha != null) g.globalAlpha *= o.alpha;
  shadow(g, 0.5 * s, 2 * s, 9 * s, 5 * s);
  g.rotate(o.face); g.scale(s, s); setRot(o.face); g.translate(lunge - crouch * 1.6, 0);
  const tr = o.walk * 1.4;
  for (const [lx, ly, ph] of [[3.9, -3.0, 0], [3.9, 3.0, Math.PI], [-3.7, -3.0, Math.PI], [-3.7, 3.0, 0]]) { const off = o.moving ? Math.sin(tr + ph) * 2.3 : 0, yy = ly * (1 + crouch * 0.2); block(g, lx + off - 1.6, yy - 1.0, lx + off + 1.6, yy + 1.0, 1.1, P.dark, 0.35); }
  const tw = Math.sin(t * 9) * 1.5; limb(g, [-5.8, 0], [-9, tw], 1.9, P.body); limb(g, [-9, tw], [-12, Math.sin(t * 9 + 1) * 2.8], 1.4, P.dark);
  solid(g, [[6.4, 0], [4.6, -3.5], [0, -4.0], [-4.7, -3.3], [-6.8, 0], [-4.7, 3.3], [0, 4.0], [4.6, 3.5]], [5, 0, 3.2], [-5.8, 0, 2.8], P.body);
  if (P.ember) { g.strokeStyle = P.ember; g.globalAlpha *= 0.8; g.lineWidth = 0.55; g.beginPath(); g.moveTo(-5, 0); for (let i = 1; i <= 6; i++) g.lineTo(-5 + i * 1.6, Math.sin(i * 2.3) * 0.8); g.stroke(); g.globalAlpha /= 0.8; }
  for (const sy of [-1, 1]) solid(g, [[6.4, sy * 1.6], [3.6, sy * 3.9], [5.4, sy * 3.0]], [5.1, sy * 2.8, 4.2], [5.1, sy * 2.8, 4.2], P.dark);
  solid(g, [[10.2, 0], [9.0, -1.3], [6.8, -2.9], [4.7, -2.3], [4.4, 0], [4.7, 2.3], [6.8, 2.9], [9.0, 1.3]], [9.6, 0, 2.4], [5.3, 0, 3.4], P.head);
  if (jaw > 0) { g.fillStyle = '#7a1a10'; path(g, [[10.6, 0], [9.2, -1 * jaw - 0.2], [8.4, 0], [9.2, jaw + 0.2]]); g.fill(); }
  const ig = g.createRadialGradient(7.6, 0, 0, 7.6, 0, 2.8); ig.addColorStop(0, P.eye + '70'); ig.addColorStop(1, P.eye + '00'); g.fillStyle = ig; ell(g, 7.6, 0, 2.8, 2.8);
  g.fillStyle = P.eye; for (const sy of [-1, 1]) { path(g, ring(7.7, sy * 1.35, 0.6, 0.45, 4, 0)); g.fill(); }
  g.restore();
}
// Dust Crawler: a low-slung desert arthropod with pincers and a stinger arched over its back.
function crawler(g, o, L) {
  const F = o.flash > 0, C = F ? '#ffffff' : L.C || '#a8744a', D = F ? '#ffe8e0' : L.D || '#5a3a22', s = o.s || L.s || 1.05, t = o.t || 0, A = o.act;
  let strike = 0, pinch = Math.sin(t * 6) * 0.3; if (A && A.k === 'wind') { strike = -ease(A.p) * 0.5; pinch = A.p; } if (A && A.k === 'mslash') { strike = Math.sin(clamp(A.p / 0.4, 0, 1) * Math.PI); pinch = 1 - A.p; }
  g.save(); g.translate(o.x, o.y); if (o.alpha != null) g.globalAlpha *= o.alpha;
  shadow(g, 0.5 * s, 2 * s, 10 * s, 6 * s); g.rotate(o.face); g.scale(s, s); setRot(o.face);
  for (let i = 0; i < 3; i++) for (const sy of [-1, 1]) { const bx = 1.8 - i * 2.4, w = o.moving ? Math.sin(o.walk * 1.6 + i * 2 + (sy > 0 ? Math.PI : 0)) * 1.4 : 0;
    limb(g, [bx, sy * 2.6], [bx + w + 0.6, sy * 5.6], 0.9, D, 0.9); limb(g, [bx + w + 0.6, sy * 5.6], [bx + w - 0.6, sy * 7.2], 0.8, D, 0.6); }
  for (const sy of [-1, 1]) { limb(g, [3.6, sy * 2.2], [7.4, sy * 4.2], 1.5, C, 1.3); const op = 0.4 + pinch * 0.5;
    solid(g, [[8.4, sy * 4.2], [11.4, sy * (4.2 - op)], [8.8, sy * 3.2]], [9.2, sy * 3.9, 1.8], [9.2, sy * 3.9, 1.8], C); solid(g, [[8.4, sy * 4.6], [11, sy * (5.2 + op)], [7.8, sy * 5.4]], [8.8, sy * 5, 1.6], [8.8, sy * 5, 1.6], D); }
  solid(g, [[-4, -2.4], [-8.6, -1.8], [-9.6, 0], [-8.6, 1.8], [-4, 2.4]], [-4.2, 0, 2.2], [-9, 0, 1.6], D);
  solid(g, ring(0, 0, 4.8, 3.6, 8, Math.PI / 8), [3.2, 0, 3.2], [-3.6, 0, 3.0], C);
  const tail = [[-9.6, 0], [-11.2, 0.3], [-11.2, 0.6], [-9.6 + strike * 4, 0.8], [-7.2 + strike * 8, 0.8], [-5 + strike * 11, 0.6]];
  tail.forEach(([x, y], i) => gem(g, x, y, 1.6 - i * 0.12, 1.4 - i * 0.1, 6, 1.4, i % 2 ? C : D, 0.4));
  const [sx, sy2] = tail[tail.length - 1]; solid(g, [[sx + 2.6, sy2], [sx, sy2 - 0.9], [sx - 0.4, sy2 + 0.9]], [sx + 0.8, sy2, 1.2], [sx + 0.8, sy2, 1.2], '#3a1a10');
  g.fillStyle = F ? '#ffffff' : '#1a0c06'; for (const s2 of [-1, 1]) { path(g, ring(3.6, s2 * 1.1, 0.5, 0.5, 4, 0)); g.fill(); }
  g.restore();
}
// Pitviper: a segmented tunnel serpent. It coils during its wind-up and lunges with its fangs.
function viper(g, o, L) {
  const F = o.flash > 0, C1 = F ? '#ffffff' : L.C1 || '#3e5a34', C2 = F ? '#ffe8e0' : L.C2 || '#6a7a3a', s = o.s || L.s || 1.1, t = o.t || 0, A = o.act, N = 10;
  let coil = 0, strike = 0; if (A && A.k === 'wind') coil = ease(A.p); if (A && A.k === 'mslash') strike = Math.sin(clamp(A.p / 0.4, 0, 1) * Math.PI);
  g.save(); g.translate(o.x, o.y); if (o.alpha != null) g.globalAlpha *= o.alpha;
  shadow(g, -3 * s, 2 * s, 12 * s, 5 * s, 0.25); g.rotate(o.face); g.scale(s, s); setRot(o.face);
  const sp = 2.2 - coil * 0.8 + strike * 0.6, ph = t * 7 + (o.walk || 0) * 0.8, pts = [];
  for (let i = 0; i < N; i++) { const u = i / N; pts.push([6 - i * sp + strike * 4, Math.sin(ph - i * 0.9) * (2.4 + coil * 2) * u]); }
  for (let i = N - 1; i >= 1; i--) { const r = lerp(2.9, 1.0, i / N); gem(g, pts[i][0], pts[i][1], r * 1.15, r, 6, r, i % 2 ? C1 : C2, 0.3); }
  const [hx, hy] = pts[0];
  solid(g, [[hx + 4.4, hy], [hx + 2.6, hy - 2.3], [hx - 0.6, hy - 2.1], [hx - 1.1, hy], [hx - 0.6, hy + 2.1], [hx + 2.6, hy + 2.3]], [hx + 3.2, hy, 2.2], [hx, hy, 2.8], F ? '#ffffff' : L.H || '#4d6b3c');
  if (strike > 0.2 || coil > 0.6) { g.fillStyle = '#f4f0e0'; for (const sy of [-1, 1]) { path(g, [[hx + 4.2, hy + sy * 0.9], [hx + 5.8, hy + sy * 0.6], [hx + 4.4, hy + sy * 0.3]]); g.fill(); } }
  g.fillStyle = '#ffa030'; for (const sy of [-1, 1]) { path(g, ring(hx + 2.4, hy + sy * 1.3, 0.55, 0.4, 4, 0)); g.fill(); }
  g.restore();
}
// Drill Drone: a hovering mining machine gone feral. Spins up its drill before firing sparks.
function drone(g, o, L) {
  const F = o.flash > 0, t = o.t || 0, A = o.act, s = o.s || L.s || 1, charge = A && A.k === 'wind' ? A.p : A && A.k === 'mshot' ? 1 - A.p : 0;
  g.save(); g.translate(o.x, o.y); if (o.alpha != null) g.globalAlpha *= o.alpha;
  shadow(g, 0, 4 * s, 6 * s, 3.5 * s, 0.22); g.translate(0, -4 + Math.sin(t * 3 + (o.seed || 0)) * 0.8); g.rotate(o.face); g.scale(s, s); setRot(o.face);
  g.fillStyle = 'rgba(200,210,220,0.3)'; for (let k = 0; k < 3; k++) { const a = t * 30 + k * TAU / 3; path(g, [[0, 0], [Math.cos(a - 0.12) * 9, Math.sin(a - 0.12) * 9], [Math.cos(a + 0.12) * 9, Math.sin(a + 0.12) * 9]]); g.fill(); }
  for (const sy of [-1, 1]) block(g, -3, sy * 4.2 - 1.2, 1.5, sy * 4.2 + 1.2, 1.4, F ? '#ffffff' : L.pod || '#50565e', 0.4);
  solid(g, ring(0, 0, 5, 4.4, 6, 0), [2, 0, 3.2], [-2.5, 0, 3.2], F ? '#ffffff' : L.body || '#7c838c');
  solid(g, [[11, 0], [5, -2.3], [4.2, 0], [5, 2.3]], [6.2, 0, 2.2], [6.2, 0, 2.2], F ? '#ffffff' : L.drill || '#b89a5a');
  g.strokeStyle = 'rgba(40,30,10,0.6)'; g.lineWidth = 0.35; for (let k = 0; k < 3; k++) { const x = 5.4 + ((t * 18 + k * 2) % 5.5); line(g, x, -2.2 * (11 - x) / 6, x + 0.8, 2.2 * (11 - x) / 6); }
  if (charge > 0) { const gr = g.createRadialGradient(11, 0, 0, 11, 0, 3 + charge * 5); gr.addColorStop(0, `rgba(255,230,160,${charge})`); gr.addColorStop(0.5, `rgba(255,120,30,${0.6 * charge})`); gr.addColorStop(1, 'rgba(255,80,10,0)'); g.fillStyle = gr; ell(g, 11, 0, 3 + charge * 5, 3 + charge * 5); }
  const eg = g.createRadialGradient(2.6, 0, 0, 2.6, 0, 2.4); eg.addColorStop(0, 'rgba(255,60,40,0.9)'); eg.addColorStop(1, 'rgba(255,40,20,0)'); g.fillStyle = eg; ell(g, 2.6, 0, 2.4, 2.4);
  g.restore();
}
// Company Sentry: a gun emplacement bolted to the rock. The base stays put; the twin-barrelled head tracks you.
function turret(g, o, L) {
  const F = o.flash > 0, s = o.s || L.s || 1, A = o.act, charge = A && A.k === 'wind' ? A.p : A && A.k === 'mshot' ? 1 - A.p : 0, recoil = A && A.k === 'mshot' ? (1 - A.p) * 2 : 0;
  g.save(); g.translate(o.x, o.y); if (o.alpha != null) g.globalAlpha *= o.alpha; g.scale(s, s); setRot(0);
  shadow(g, 1, 2, 9, 6, 0.3);
  solid(g, ring(0, 0, 8, 7, 8, Math.PI / 8), [0, 0, 2.5], [0, 0, 2.5], F ? '#ffffff' : '#4a4e56');
  g.fillStyle = '#e0b040'; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8; if (i % 2) g.fillRect(Math.cos(a) * 6.4 - 0.6, Math.sin(a) * 5.6 - 0.6, 1.2, 1.2); }
  g.rotate(o.face); setRot(o.face); g.translate(-recoil, 0);
  for (const sy of [-1.8, 1.8]) block(g, 2, sy - 0.9, 12, sy + 0.9, 1.4, F ? '#ffffff' : '#30343a', 0.3);
  solid(g, [[5, 0], [3, -4.5], [-3.5, -4.8], [-5.5, 0], [-3.5, 4.8], [3, 4.5]], [2, 0, 5], [-3, 0, 4.4], F ? '#ffffff' : '#6a707a');
  const eg = g.createRadialGradient(2.2, 0, 0, 2.2, 0, 2.6); eg.addColorStop(0, 'rgba(255,60,40,0.95)'); eg.addColorStop(1, 'rgba(255,40,20,0)'); g.fillStyle = eg; ell(g, 2.2, 0, 2.6, 2.6);
  if (charge > 0) for (const sy of [-1.8, 1.8]) { const gr = g.createRadialGradient(12.5, sy, 0, 12.5, sy, 2 + charge * 4); gr.addColorStop(0, `rgba(255,240,180,${charge})`); gr.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = gr; ell(g, 12.5, sy, 2 + charge * 4, 2 + charge * 4); }
  g.restore();
}
// Training dummy: a straw-stuffed post with a painted target. It wobbles when hit.
function dummy(g, o) {
  const F = o.flash > 0, wob = F ? Math.sin((o.t || 0) * 50) * 0.12 : 0;
  g.save(); g.translate(o.x, o.y); if (o.alpha != null) g.globalAlpha *= o.alpha; setRot(0);
  shadow(g, 1.5, 2.5, 6.5, 4, 0.3); block(g, -1.4, -1, 1.4, 3, 1.2, '#5a3e24', 0.4);
  g.rotate(wob); block(g, -8, -5, 8, -3.2, 1.8, F ? '#ffffff' : '#6a4a2a', 0.5);
  solid(g, ring(0, -1, 5, 4.2, 8, Math.PI / 8, 0.2, 5), [-0.8, -1.8, 6], [-0.8, -1.8, 6], F ? '#ffffff' : '#c8a860');
  g.strokeStyle = 'rgba(80,50,20,0.5)'; g.lineWidth = 0.35; for (let i = 0; i < 5; i++) line(g, -3.5 + i * 1.7, -4.4, -3 + i * 1.5, 2.2);
  g.fillStyle = '#b8321e'; ell(g, -0.8, -1.4, 2.6, 2.2); g.fillStyle = '#efe4cc'; ell(g, -0.8, -1.4, 1.6, 1.3); g.fillStyle = '#b8321e'; ell(g, -0.8, -1.4, 0.7, 0.6);
  gem(g, 0, -6.4, 2.6, 2.4, 6, 7, F ? '#ffffff' : '#a88a5a', 0.3);
  g.restore();
}
// Draws any monster type. o = { x, y, face, act, walk, moving, flash, t, seed(id), alpha, s? }
function mob(g, type, o) {
  const L = MOB_LOOK[type];
  if (L.kind === 'beast') return beast(g, o, L);
  if (L.kind === 'crawler') return crawler(g, o, L);
  if (L.kind === 'viper') return viper(g, o, L);
  if (L.kind === 'drone') return drone(g, o, L);
  if (L.kind === 'turret') return turret(g, o, L);
  if (L.kind === 'dummy') return dummy(g, o);
  const id = Math.floor(o.seed || 0);
  humanoid(g, Object.assign({}, o, { s: (o.s || 1) * L.s, pal: L.pal(id), hair: L.hairOf ? L.hairOf(id) : L.hair, helmet: L.helmet, crest: L.crest, weapon: L.weapon, shield: L.shield }));
}

// A House emblem: a small shield on the back of the cloak with the House sigil on it.
function emblem(g, e) {
  solid(g, [[-3.6, 0], [-4.6, -2.3], [-7.4, -2.1], [-8.4, 0], [-7.4, 2.1], [-4.6, 2.3]], [-4.4, 0, 1.2], [-7.6, 0, 1.2], e.color);
  g.save(); g.translate(-6, 0); g.rotate(Math.PI / 2); sigil(g, e.sigil, 0, 0, 1.5, shade(e.color, e.color === '#e8e4dc' ? -0.6 : 0.75)); g.restore();
}
// House sigils, drawn in a box of radius r around (cx, cy).
function sigil(g, id, cx, cy, r, col) {
  g.save(); g.translate(cx, cy); g.scale(r, r); g.fillStyle = col; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round';
  const P = (pts) => { path(g, pts); g.fill(); };
  switch (id) {
    case 'wolf': P([[-0.9, 0.9], [-0.6, -0.2], [-0.8, -0.95], [-0.25, -0.5], [0.25, -0.5], [0.8, -0.95], [0.6, -0.2], [0.9, 0.9], [0, 0.55]]); break;
    case 'eagle': P([[0, -0.9], [0.25, -0.4], [1, -0.6], [0.7, 0.1], [0.3, 0.2], [0.35, 0.9], [0, 0.6], [-0.35, 0.9], [-0.3, 0.2], [-0.7, 0.1], [-1, -0.6], [-0.25, -0.4]]); break;
    case 'sun': { const o = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, rr = i % 2 ? 0.55 : 1; o.push([Math.cos(a) * rr, Math.sin(a) * rr]); } P(o); break; }
    case 'moon': g.beginPath(); g.arc(0, 0, 0.9, 0.5, TAU - 0.5); g.arc(0.35, 0, 0.65, TAU - 0.9, 0.9, true); g.closePath(); g.fill(); break;
    case 'star': { const o = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * TAU, rr = i % 2 ? 0.42 : 1; o.push([Math.cos(a) * rr, Math.sin(a) * rr]); } P(o); break; }
    case 'crown': P([[-0.9, 0.7], [-0.9, -0.5], [-0.45, 0.05], [0, -0.8], [0.45, 0.05], [0.9, -0.5], [0.9, 0.7]]); break;
    case 'spear': P([[0, -1], [0.35, -0.4], [0.1, -0.35], [0.1, 1], [-0.1, 1], [-0.1, -0.35], [-0.35, -0.4]]); break;
    case 'flame': g.beginPath(); g.moveTo(0, -1); g.quadraticCurveTo(0.9, -0.1, 0.55, 0.55); g.quadraticCurveTo(0.2, 1, 0, 0.9); g.quadraticCurveTo(-0.2, 1, -0.55, 0.55); g.quadraticCurveTo(-0.9, -0.1, 0, -1); g.fill(); break;
    case 'tower': P([[-0.6, 1], [-0.5, -0.4], [-0.75, -0.4], [-0.75, -0.95], [-0.4, -0.95], [-0.4, -0.7], [-0.15, -0.7], [-0.15, -0.95], [0.15, -0.95], [0.15, -0.7], [0.4, -0.7], [0.4, -0.95], [0.75, -0.95], [0.75, -0.4], [0.5, -0.4], [0.6, 1]]); break;
    case 'serpent': g.lineWidth = 0.28; g.beginPath(); g.moveTo(-0.6, 0.9); g.bezierCurveTo(0.9, 0.6, -0.9, -0.1, 0.4, -0.5); g.stroke(); P([[0.25, -0.75], [0.85, -0.55], [0.3, -0.25]]); break;
  }
  g.restore();
}
// A hanging House banner (for menus): cloth in the House color with its sigil.
function banner(g, x, y, w, h, color, id) {
  setRot(0);
  solid(g, [[x, y], [x + w, y], [x + w, y + h], [x + w / 2, y + h * 0.82], [x, y + h]], [x + w / 2, y, w * 0.3], [x + w / 2, y + h * 0.8, w * 0.3], color);
  g.fillStyle = '#e9c35a'; g.fillRect(x - w * 0.08, y - h * 0.04, w * 1.16, h * 0.05);
  sigil(g, id, x + w / 2, y + h * 0.4, w * 0.3, shade(color, color === '#e8e4dc' ? -0.6 : 0.75));
}
// A relic: a carved low-poly stele. Undiscovered relics glow and send up a thin beam of light.
function relic(g, x, y, t, found) {
  setRot(0);
  g.fillStyle = 'rgba(16,8,4,0.3)'; path(g, ring(x + 2, y + 3, 9, 5, 8, 0)); g.fill();
  if (!found) { const p = 0.5 + 0.5 * Math.sin(t * 2.2 + x), gr = g.createLinearGradient(0, y - 90, 0, y); gr.addColorStop(0, 'rgba(150,220,255,0)'); gr.addColorStop(1, `rgba(150,220,255,${0.25 + 0.2 * p})`); g.fillStyle = gr; g.fillRect(x - 3, y - 90, 6, 90);
    const gl = g.createRadialGradient(x, y - 6, 0, x, y - 6, 16); gl.addColorStop(0, `rgba(150,220,255,${0.35 + 0.25 * p})`); gl.addColorStop(1, 'rgba(150,220,255,0)'); g.fillStyle = gl; g.fillRect(x - 16, y - 22, 32, 32); }
  block(g, x - 6, y - 3, x + 6, y + 3, 2, '#6a6258', 1.2);
  solid(g, [[x - 3.4, y + 1], [x - 2.6, y - 16], [x, y - 19], [x + 2.6, y - 16], [x + 3.4, y + 1]], [x, y - 3, 2.6], [x, y - 16, 2.4], found ? '#7a7268' : '#8a8680');
  g.strokeStyle = found ? 'rgba(160,150,130,0.6)' : `rgba(170,235,255,${0.7 + 0.3 * Math.sin(t * 3)})`; g.lineWidth = 0.6;
  for (let i = 0; i < 4; i++) { const yy = y - 4 - i * 3.2; line(g, x - 1.2, yy, x + 1.2, yy - 1); }
  if (!found) for (let i = 0; i < 3; i++) { const a = t * 1.5 + i * 2.1, yy = y - 10 - ((t * 12 + i * 9) % 26); g.fillStyle = 'rgba(200,240,255,0.8)'; g.fillRect(x + Math.cos(a) * 6, yy, 1, 1); }
}

// ---------------- ships ----------------
const SHIP_HULL = '#e4dac4', SHIP_TRIM = '#b8923a';
const SHIP_SIL = [[0, -54], [8, -36], [9, -8], [52, 16], [57, 30], [44, 32], [18, 30], [15, 46], [-15, 46], [-18, 30], [-44, 32], [-57, 30], [-52, 16], [-9, -8], [-8, -36]];
// Your ship, nose north. o = { color (House color), sigil, lift 0..1 (take-off), ramp 0..1 (lowered), glow 0..1 (engines) }
function ship(g, x, y, t, o) {
  const lift = o.lift || 0, ramp = o.ramp == null ? 1 : o.ramp, glow = Math.max(o.glow || 0, lift), col = o.color || '#d8a63a', sc = 1 + lift * 0.45, hy = -lift * 80;
  setRot(0);
  const sk = 1 - lift * 0.25; g.fillStyle = `rgba(10,6,4,${0.32 * (1 - lift * 0.7)})`; path(g, SHIP_SIL.map(([px, py]) => [x + px * sk + 6 + lift * 34, y + py * sk + 8 + lift * 46])); g.fill();
  g.save(); g.translate(x, y + hy); g.scale(sc, sc); if (lift > 0.55) g.globalAlpha *= clamp((1 - lift) / 0.45, 0, 1);
  if (ramp > 0.02) { block(g, -5.5, 34, 5.5, 34 + 18 * ramp, 1.2, '#9aa0a8', 0.6); g.fillStyle = 'rgba(40,40,48,0.5)'; for (let i = 1; i < 5; i++) g.fillRect(-4.5, 34 + i * 3.6 * ramp, 9, 0.5); }
  for (const sx of [-13, 13]) { const r = 7 + glow * 16 + Math.sin(t * 30 + sx) * 0.8 * glow, gy = 47 + glow * 6, gr = g.createRadialGradient(sx, gy, 0, sx, gy, r);
    gr.addColorStop(0, `rgba(255,250,230,${0.25 + 0.7 * glow})`); gr.addColorStop(0.4, `rgba(120,200,255,${0.15 + 0.55 * glow})`); gr.addColorStop(1, 'rgba(80,140,255,0)'); g.fillStyle = gr; ell(g, sx, gy, r, r * (1 + glow)); }
  for (const sd of [-1, 1]) {
    solid(g, [[sd * 8, -8], [sd * 52, 16], [sd * 57, 30], [sd * 44, 32], [sd * 9, 26]], [sd * 10, 2, 7], [sd * 50, 26, 2.5], SHIP_HULL);
    solid(g, [[sd * 9, -7.5], [sd * 52, 16], [sd * 51, 20], [sd * 9, -1.5]], [sd * 10, -3, 7.5], [sd * 50, 18, 3], col);
    block(g, sd * 55 - 1.6, 4, sd * 55 + 1.6, 31, 1.8, '#4a4e56', 0.5);
    solid(g, [[sd * 6, -34], [sd * 21, -23], [sd * 20, -19], [sd * 7, -23]], [sd * 7, -28, 6], [sd * 19, -21, 3], SHIP_HULL);
    block(g, sd * 13 - 5.5, 12, sd * 13 + 5.5, 46, 5, '#8a8e96', 1.8);
    g.fillStyle = '#2a2e36'; ell(g, sd * 13, 45, 3.4, 1.6);
  }
  solid(g, [[0, -54], [8, -36], [10, -10], [9, 22], [7, 40], [-7, 40], [-9, 22], [-10, -10], [-8, -36]], [0, -46, 10], [0, 32, 12], SHIP_HULL);
  solid(g, [[0, -46], [2.6, -24], [2.6, 30], [-2.6, 30], [-2.6, -24]], [0, -44, 12.5], [0, 30, 13.5], col);
  g.strokeStyle = SHIP_TRIM; g.lineWidth = 0.6; for (const sd of [-1, 1]) line(g, sd * 8.6, -12, sd * 8, 22);
  gem(g, 0, -30, 4.6, 8.5, 8, 13, '#20364a', Math.PI / 2, -0.8, -1.5);
  g.fillStyle = 'rgba(200,235,255,0.55)'; path(g, [[-1.6, -36], [-0.2, -37.5], [0.6, -30], [-1, -28]]); g.fill();
  if (o.sigil) { sigil(g, o.sigil, 30, 20, 5.2, shade(col, col === '#e8e4dc' ? -0.6 : 0.7)); sigil(g, o.sigil, -30, 20, 5.2, shade(col, col === '#e8e4dc' ? -0.6 : 0.7)); }
  if (glow > 0 || Math.sin(t * 2) > 0.7) for (const [lx, ly, c] of [[-56, 30, '255,70,60'], [56, 30, '90,255,140']]) { const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 4); gr.addColorStop(0, `rgba(${c},0.95)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; ell(g, lx, ly, 4, 4); }
  g.restore();
}
// Blinking landing lights around the pad (drawn every frame).
function padLights(g, pad, t) {
  if (!pad) return; const X0 = pad.x0 * T + 3, Y0 = pad.y0 * T + 3, X1 = (pad.x1 + 1) * T - 3, Y1 = (pad.y1 + 1) * T - 3;
  const pts = []; for (let x = X0; x <= X1 + 0.1; x += (X1 - X0) / 6) pts.push([x, Y0], [x, Y1]); for (let y = Y0 + (Y1 - Y0) / 5; y < Y1 - 1; y += (Y1 - Y0) / 5) pts.push([X0, y], [X1, y]);
  pts.forEach(([x, y], i) => { const on = 0.35 + 0.65 * Math.max(0, Math.sin(t * 3 - i * 0.7)); const gr = g.createRadialGradient(x, y, 0, x, y, 4); gr.addColorStop(0, `rgba(255,215,120,${on})`); gr.addColorStop(1, 'rgba(255,200,90,0)'); g.fillStyle = gr; ell(g, x, y, 4, 4); g.fillStyle = '#fff4c8'; g.fillRect(x - 0.5, y - 0.5, 1, 1); });
}

// ---------------- resource nodes ----------------
const NODE_LOOK = {
  ember:    { a: '#e0603a', b: '#ffb070', base: '#d8c0b0', glow: '255,110,50' },
  scrap:    { a: '#8a929c', b: '#5a6068', base: '#6a5a4a', glow: null },
  ore:      { a: '#6a7078', b: '#7fc8f0', base: '#5a5e66', glow: '120,200,255' },
  crystal:  { a: '#9a6aff', b: '#d8c0ff', base: '#4a4050', glow: '176,138,255' },
  sage:     { a: '#6a9a4a', b: '#b8d8a0', base: '#4a3a24', glow: null },
  sunglass: { a: '#6ab8c4', b: '#c8f4f8', base: '#b89a6a', glow: '160,230,240' },
  frostite: { a: '#7ab0e0', b: '#e8f6ff', base: '#8aa0b8', glow: '170,220,255' },
};
// A gatherable node. spent: gathered recently and growing back (drawn as a stub).
function node(g, kind, x, y, t, spent) {
  const L = NODE_LOOK[kind] || NODE_LOOK.scrap; setRot(0);
  g.fillStyle = 'rgba(16,8,4,0.3)'; path(g, ring(x + 1.5, y + 2.5, 8, 4.6, 8, 0)); g.fill();
  if (spent) { gem(g, x, y + 1, 4.2, 3, 6, 1.2, shade(L.base, -0.1), 0.4); g.fillStyle = 'rgba(0,0,0,0.2)'; ell(g, x, y + 1, 2, 1.3); return; }
  if (L.glow) { const p = 0.5 + 0.5 * Math.sin(t * 2 + x * 0.1), gr = g.createRadialGradient(x, y - 3, 0, x, y - 3, 14); gr.addColorStop(0, `rgba(${L.glow},${0.18 + 0.14 * p})`); gr.addColorStop(1, `rgba(${L.glow},0)`); g.fillStyle = gr; ell(g, x, y - 3, 14, 14); }
  switch (kind) {
    case 'ember': gem(g, x, y + 1, 7, 4.6, 8, 1.6, L.base, 0.2, 0, 0, 'rgba(90,40,30,0.5)');
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + x, cx = x + Math.cos(a) * 3.6, cy = y + Math.sin(a) * 2.2, h = 3 + (i % 3) * 1.6; solid(g, [[cx, cy - h], [cx + 1.2, cy], [cx, cy + 0.8], [cx - 1.2, cy]], [cx, cy - 0.5, h * 0.7], [cx, cy - 0.5, h * 0.7], i % 2 ? L.a : L.b); } break;
    case 'scrap': block(g, x - 7, y - 2, x + 1, y + 3, 1.6, L.b, 0.6); solid(g, [[x - 2, y - 5], [x + 6, y - 3], [x + 5, y + 2], [x - 3, y]], [x + 1, y - 3, 3], [x + 3, y, 2], L.a);
      g.strokeStyle = '#4a4e56'; g.lineWidth = 1.2; g.beginPath(); g.arc(x + 3, y + 2.5, 2.4, 0, TAU); g.stroke(); limb(g, [x - 6, y - 4], [x + 1, y - 7], 0.8, '#7a5a3a', 1); break;
    case 'ore': solid(g, ring(x, y - 1, 7, 5.6, 7, 0.5, 0.35, x * 3 + y), [x - 1.4, y - 2.6, 6], [x - 1.4, y - 2.6, 6], L.a);
      g.strokeStyle = L.b; g.lineWidth = 0.9; line(g, x - 4, y - 2, x - 0.5, y - 3.5); line(g, x - 0.5, y - 3.5, x + 3, y - 1); line(g, x - 2, y + 1.5, x + 1.5, y + 0.8);
      for (const [dx, dy] of [[-3, -3.5], [2, -1.5], [0, 1]]) gem(g, x + dx, y + dy, 1.1, 1, 5, 3, L.b, dx); break;
    case 'crystal': for (const [dx, dy, h, w] of [[-3, 1, 9, 1.8], [2.5, 0, 12, 2.2], [0, 2, 7, 1.6], [4.5, 2.5, 6, 1.4], [-5, 2.5, 5, 1.3]]) { const cx = x + dx, cy = y + dy;
        solid(g, [[cx, cy - h], [cx + w, cy - h * 0.3], [cx + w * 0.7, cy + 0.8], [cx - w * 0.7, cy + 0.8], [cx - w, cy - h * 0.3]], [cx, cy - 0.5, h * 0.6], [cx, cy - h * 0.7, h * 0.8], dx > 1 ? L.b : L.a, 'rgba(255,255,255,0.35)'); } break;
    case 'sage': for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + x, r = i % 2 ? 4.4 : 3; gem(g, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7 - 1, 2.6, 1.6, 6, 3 + (i % 3), i % 3 ? L.a : L.b, a); }
      g.fillStyle = '#b080e0'; for (let i = 0; i < 4; i++) { const a = i * 1.7 + y; ell(g, x + Math.cos(a) * 3.4, y - 2 + Math.sin(a) * 2, 0.8, 0.8); } break;
    case 'sunglass': for (const [dx, dy, h, w] of [[-3.5, 1, 6, 2.4], [1.5, -0.5, 9, 2.8], [4.5, 2, 5, 2]]) { const cx = x + dx, cy = y + dy;
        solid(g, [[cx - w * 0.3, cy - h], [cx + w, cy - h * 0.2], [cx + w * 0.5, cy + 1], [cx - w, cy + 0.6]], [cx, cy - 0.4, h * 0.6], [cx, cy - h * 0.6, h * 0.7], dx > 0 ? L.a : L.b, 'rgba(255,255,255,0.5)'); }
      if (Math.sin(t * 1.3 + x) > 0.93) { g.fillStyle = '#ffffff'; path(g, ring(x + 2, y - 8, 1.6, 0.4, 4, 0)); g.fill(); path(g, ring(x + 2, y - 8, 0.4, 1.6, 4, 0)); g.fill(); } break;
    case 'frostite': solid(g, [[x - 6, y + 1], [x - 4, y - 5], [x + 1, y - 7], [x + 6, y - 3], [x + 5.5, y + 2], [x, y + 3.5]], [x - 1, y - 3, 7], [x + 1, y - 2, 6], L.a, 'rgba(255,255,255,0.4)');
      g.fillStyle = 'rgba(240,250,255,0.8)'; path(g, [[x - 3.5, y - 4.6], [x + 1, y - 6.4], [x + 4, y - 4], [x - 1, y - 3]]); g.fill(); break;
  }
  const tw = Math.max(0, Math.sin(t * 1.7 + x * 0.37 + y * 0.11) - 0.85) / 0.15; // an occasional glint so nodes catch the eye
  if (tw > 0) { g.fillStyle = `rgba(255,250,220,${tw})`; const gx = x + 3, gy = y - 9; path(g, ring(gx, gy, 2.4 * tw, 0.5, 4, 0)); g.fill(); path(g, ring(gx, gy, 0.5, 2.4 * tw, 4, 0)); g.fill(); }
}

// ---------------- the map ----------------
// A canvas with one pixel per tile, colored by what the tile is. The client masks it with fog of war.
function mapImage(map) {
  const B = BIOMES[map.biome], c = document.createElement('canvas'); c.width = map.w; c.height = map.h; const g = c.getContext('2d'), img = g.createImageData(map.w, map.h);
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const pal = {}; const P = (t, hex) => { pal[t] = rgb(hex); };
  P(TL.GROUND, B.mini || B.ground); P(TL.PATH, B.road[1]); P(TL.WALL, shade(B.wallTop, -0.1)); P(TL.WATER, B.water[2]); P(TL.TREE, shade(B.canopy.length ? B.canopy[0][0] : B.ground, -0.1)); P(TL.ROCK, shade(B.rock, -0.15));
  P(TL.FLOOR, B.floor[0]); P(TL.CRATE, B.crate); P(TL.BUILDING, '#7a5236'); P(TL.CLIFF, shade(B.cliffTop, -0.35)); P(TL.CHASM, '#1a0a06'); P(TL.PILLAR, B.wallTop); P(TL.GATE, '#3a2a4a');
  P(TL.BRIDGE, '#7a5a34'); P(TL.ICE, '#b8d2e6'); P(TL.PAD, '#5a606a'); P(TL.HULL, '#e0c070');
  for (let i = 0; i < map.w * map.h; i++) { const c3 = pal[map.M[i]] || pal[TL.GROUND], x = i % map.w, y = (i / map.w) | 0, n = (hsh(x, y) - 0.5) * 10;
    img.data[i * 4] = clamp(c3[0] + n, 0, 255); img.data[i * 4 + 1] = clamp(c3[1] + n, 0, 255); img.data[i * 4 + 2] = clamp(c3[2] + n, 0, 255); img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}

// ---------------- UI icons ----------------
function icon(g, ab, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 32, s / 32); g.lineCap = 'round'; g.lineJoin = 'round'; setRot(0);
  if (ab === 'razor') { solid(g, [[-7, 7], [-2, -5], [11, -11], [0, -1], [-4, 10]], [-4, 4, 3], [9, -9, 2], '#dfe6ee'); g.strokeStyle = '#e8c060'; g.lineWidth = 2.5; line(g, -10, 4, -3, 11); g.strokeStyle = '#3a2412'; g.lineWidth = 3; line(g, -8, 9, -12, 13); }
  if (ab === 'whip') { g.strokeStyle = '#dfe6ee'; g.lineWidth = 2.2; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(-12, 10); for (let i = 0; i <= 10; i++) { const u = i / 10; g.lineTo(-12 + u * 24, 10 - u * 20 + Math.sin(u * 12) * 4 * (1 - u)); } g.stroke(); g.fillStyle = '#fff4c8'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; path(g, ring(12 + Math.cos(a) * 3.5, -10 + Math.sin(a) * 3.5, 1, 1, 4, 0)); g.fill(); } }
  if (ab === 'fist') { const gr = g.createRadialGradient(0, 0, 1, 0, 0, 15); gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.35, '#c79bff'); gr.addColorStop(1, 'rgba(120,70,255,0)'); g.fillStyle = gr; ell(g, 0, 0, 15, 15); gem(g, 0, 0, 7, 7, 6, 6, '#4a3a6a', 0.5, -1, -1); g.fillStyle = '#fff2c0'; path(g, ring(0, 0, 2.6, 2.6, 6, 0.5)); g.fill(); g.strokeStyle = 'rgba(255,240,200,0.8)'; g.lineWidth = 1.6; for (const r of [9.5, 13]) { g.beginPath(); g.arc(0, 0, r, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(0, 0, r, Math.PI - 0.9, Math.PI + 0.9); g.stroke(); } }
  if (ab === 'dash') { g.lineJoin = 'miter'; g.strokeStyle = '#ffe7a8'; g.lineWidth = 3.2; for (const o of [-6, 3]) { g.beginPath(); g.moveTo(o - 3, -9); g.lineTo(o + 6, 0); g.lineTo(o - 3, 9); g.stroke(); } g.strokeStyle = 'rgba(255,231,168,0.45)'; g.lineWidth = 1.5; for (const yy of [-5, 0, 5]) line(g, -14, yy, -9, yy); }
  if (ab === 'parry') { solid(g, [[0, -12], [10, -7], [9, 5], [0, 13], [-9, 5], [-10, -7]], [0, -9, 5], [0, 9, 5], '#8a96a6'); gem(g, 0, 0, 3, 3, 6, 7, '#e8c060', 0); }
  g.restore();
}

// ---------------- terrain ----------------
// Per-biome palettes. canopy entries are [base, top] colors for low-poly trees; water is [bank, shallow .. deep].
const BIOMES = {
  mars: { edge: TL.TREE, ground: '#8a4a2d', blotch: ['rgba(170,94,58,', 'rgba(112,54,32,', 'rgba(150,80,48,', 'rgba(100,48,30,', 'rgba(184,110,64,'], detail: 'scrub',
    road: ['rgba(140,86,56,0.8)', '#b27b52', 'rgba(220,170,125,0.45)'], floor: ['#76685b', '#6c5f53', '#807164', '#655a4f', '#7b6d60'], grout: '#3e352e', wallTop: '#8c8076', wallFace: '#5a5048',
    cliffTop: '#7a6456', cliffFace: '#4a362a', rock: '#7e6c62', trees: 'round', canopy: [['#2f4e26', '#4d7a36'], ['#4a5424', '#7a8634'], ['#7a3a1a', '#b0602a']], water: ['#3a2014', '#2d6180', '#23526f', '#1c4560', '#173a52'], crate: '#8a5e34', mini: '#8a4a2d' },
  citadel: { edge: TL.WALL, ground: '#4f7034', blotch: ['rgba(90,130,60,', 'rgba(60,96,40,', 'rgba(100,140,70,', 'rgba(70,110,50,', 'rgba(110,150,80,'], detail: 'lawn',
    road: ['rgba(150,140,120,0.8)', '#c8bca4', 'rgba(255,250,230,0.4)'], floor: ['#d6ccba', '#cdc2ae', '#dfd6c6', '#c6baa4', '#d2c7b3'], grout: '#9a8e7a', wallTop: '#e2d8c6', wallFace: '#b0a28a',
    cliffTop: '#b0a490', cliffFace: '#8a7e6a', rock: '#a09888', trees: 'cypress', canopy: [['#2f5a2e', '#4f8a44'], ['#2a5036', '#4a7a50'], ['#3a6a2e', '#6a9a4a']], water: ['#8a7e6c', '#3fa4c4', '#2f8cb0', '#2a7aa0', '#246a90'], crate: '#8a5e34', mini: '#4f7034' },
  mine: { edge: TL.CLIFF, ground: '#3a302a', blotch: ['rgba(80,64,52,', 'rgba(30,24,20,', 'rgba(70,56,46,', 'rgba(40,32,26,', 'rgba(90,70,56,'], detail: 'gravel',
    road: ['rgba(40,30,24,0.9)', '#4a3a2e', 'rgba(140,110,90,0.3)'], floor: ['#5a4028', '#4e3822', '#664a2e', '#523c24', '#5e442a'], grout: '#2a1c12', wallTop: '#6a5e54', wallFace: '#3a322c',
    cliffTop: '#4a403a', cliffFace: '#231b16', rock: '#5e524a', trees: 'none', canopy: [], water: ['#1a1410', '#1e3a4a', '#1a3240', '#162a36', '#12222c'], crate: '#6a4a2a', mini: '#3a302a', dark: true },
  green: { edge: TL.CLIFF, ground: '#5d7c38', blotch: ['rgba(110,150,60,', 'rgba(70,100,40,', 'rgba(140,160,70,', 'rgba(80,110,50,', 'rgba(150,140,70,'], detail: 'grass',
    road: ['rgba(100,80,52,0.85)', '#9a7c54', 'rgba(220,200,160,0.4)'], floor: ['#8e8a80', '#848078', '#98948a', '#7c7870', '#908c82'], grout: '#4a4640', wallTop: '#a09c92', wallFace: '#62625c',
    cliffTop: '#8e8c84', cliffFace: '#56544e', rock: '#8a8880', trees: 'pine', canopy: [['#1e4a2a', '#3a7040'], ['#2a4a1e', '#4a7430'], ['#244a34', '#3e7050']], water: ['#4a4a32', '#3a7aa0', '#2f6a90', '#285a80', '#224e70'], crate: '#8a5e34', mini: '#5d7c38' },
  glass: { edge: TL.CLIFF, ground: '#c9a26a', blotch: ['rgba(220,180,120,', 'rgba(170,120,70,', 'rgba(230,200,150,', 'rgba(180,140,90,', 'rgba(200,160,110,'], detail: 'dunes',
    road: ['rgba(150,110,70,0.75)', '#a8845a', 'rgba(240,210,160,0.4)'], floor: ['#c8a878', '#bc9c6c', '#d0b084', '#b49464', '#c4a472'], grout: '#7a5a3a', wallTop: '#c8a878', wallFace: '#8a6a48',
    cliffTop: '#c4884e', cliffFace: '#7a4a2a', rock: '#8fd0d8', trees: 'cactus', canopy: [['#4a7a4a', '#6a9a5a'], ['#3e6a44', '#5e8a52']], water: ['#8a7050', '#3a9ab8', '#2f88a8', '#2a7898', '#246a88'], crate: '#8a5e34' },
  ice: { edge: TL.CLIFF, ground: '#dde6ee', blotch: ['rgba(255,255,255,', 'rgba(180,200,220,', 'rgba(230,240,250,', 'rgba(170,190,210,', 'rgba(245,250,255,'], detail: 'snow',
    road: ['rgba(150,165,185,0.7)', '#b8c6d4', 'rgba(255,255,255,0.5)'], floor: ['#6a4a30', '#5e4228', '#72523a', '#664630', '#6e4e34'], grout: '#3a2818', wallTop: '#7a5a3a', wallFace: '#4a3420',
    cliffTop: '#a4b8cc', cliffFace: '#5a6e84', rock: '#8a9aac', trees: 'snowpine', canopy: [['#1e3a2e', '#eef4fa'], ['#24402e', '#e4eef6'], ['#1a342a', '#f4f8fc']], water: ['#b8c8d4', '#2a4a64', '#223e56', '#1c3448', '#162a3a'], crate: '#6a4a2a' },
};
const ROOFS = ['#b0552e', '#4d5f78', '#4f8a78', '#b8863a'], WALLFACE = ['#e2d4b4', '#d8c8a8', '#eadcc0', '#d0c0a0'];
function tuft(g, sx, sy, col, n, h) { g.fillStyle = col; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32, x1 = sx + Math.cos(a) * h, y1 = sy + Math.sin(a) * h; g.beginPath(); g.moveTo(sx - 0.5, sy); g.lineTo(x1, y1); g.lineTo(sx + 0.5, sy); g.fill(); } }
class Terrain {
  constructor(map) { this.map = map; this.B = BIOMES[map.biome]; this.cache = new Map(); this.zc = 0; this.CH = 128;
    this.crystals = []; if (map.biome === 'mine') for (let ty = 1; ty < map.h - 1; ty++) for (let tx = 1; tx < map.w - 1; tx++) if (this.t(tx, ty) === TL.GROUND && hsh(tx * 11, ty * 17) < 0.09 &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.t(tx + dx, ty + dy) === TL.CLIFF)) this.crystals.push({ x: tx * T + 4 + hsh(tx, ty) * 8, y: ty * T + 4 + hsh(ty, tx) * 8, c: hsh(tx + 3, ty) < 0.6 ? '#5fd8e8' : '#b08aff' }); }
  t(x, y) { const m = this.map; return x < 0 || y < 0 || x >= m.w || y >= m.h ? this.B.edge : m.M[y * m.w + x]; }
  draw(g, layer, camX, camY, Zp, W, H) {
    const CH = this.CH, zc = Math.min(Zp, 5), k = Zp / zc; if (zc !== this.zc) { this.cache.clear(); this.zc = zc; }
    const left = camX - W / 2 / Zp, top = camY - H / 2 / Zp;
    const cx0 = Math.max(0, Math.floor(left / CH)), cy0 = Math.max(0, Math.floor(top / CH));
    const cx1 = Math.min(Math.ceil(this.map.w * T / CH) - 1, Math.floor((camX + W / 2 / Zp) / CH)), cy1 = Math.min(Math.ceil(this.map.h * T / CH) - 1, Math.floor((camY + H / 2 / Zp) / CH));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = cx + ',' + cy; let c = this.cache.get(key);
      if (c) { this.cache.delete(key); this.cache.set(key, c); } else { c = this.render(cx, cy, zc); this.cache.set(key, c); }
      const img = c[layer]; if (!img) continue;
      g.drawImage(img, Math.round((cx * CH - left) * Zp), Math.round((cy * CH - top) * Zp), img.width * k, img.height * k);
    }
    while (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value);
  }
  render(cx, cy, zc) {
    const CH = this.CH, size = Math.ceil((CH + 1) * zc), mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
    const lo = mk(), hi = mk(), gl = lo.getContext('2d'), gh = hi.getContext('2d');
    for (const g of [gl, gh]) g.setTransform(zc, 0, 0, zc, -cx * CH * zc, -cy * CH * zc);
    const n = CH / T, tx0 = cx * n - 3, ty0 = cy * n - 3, tx1 = tx0 + n + 6, ty1 = ty0 + n + 6;
    setRot(0); this.paintLo(gl, tx0, ty0, tx1, ty1, cx * CH, cy * CH);
    setRot(0); return { lo, hi: this.paintHi(gh, tx0, ty0, tx1, ty1) ? hi : null };
  }
  each(tx0, ty0, tx1, ty1, want, fn) { for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const t = this.t(tx, ty); if (want === null || want === t) fn(tx, ty, tx * T, ty * T, t); } }
  buildingsIn(tx0, ty0, tx1, ty1) { return this.map.buildings.filter(b => b.x1 >= tx0 - 1 && b.x0 <= tx1 + 1 && b.y1 >= ty0 - 1 && b.y0 <= ty1 + 2); }
  propsIn(tx0, ty0, tx1, ty1) { return this.map.props.filter(p => p.x >= (tx0 - 2) * T && p.x <= (tx1 + 3) * T && p.y >= (ty0 - 2) * T && p.y <= (ty1 + 3) * T); }
  paintLo(g, tx0, ty0, tx1, ty1, x0, y0) {
    const CH = this.CH, B = this.B, bio = this.map.biome, isWild = bio !== 'citadel';
    g.fillStyle = B.ground; g.fillRect(x0 - 2, y0 - 2, CH + 4, CH + 4);
    for (let gy = Math.floor(ty0 / 4) - 1; gy <= Math.ceil(ty1 / 4) + 1; gy++) for (let gx = Math.floor(tx0 / 4) - 1; gx <= Math.ceil(tx1 / 4) + 1; gx++) {
      const h = hsh(gx * 13 + 7, gy * 29 - 3), bx = (gx + hsh(gx, gy * 3)) * 64, by = (gy + hsh(gx * 5, gy)) * 64, r = 50 + h * 50, c = B.blotch[Math.floor(hsh(gx - 9, gy + 4) * 5)];
      const gr = g.createRadialGradient(bx, by, 0, bx, by, r); gr.addColorStop(0, c + '0.4)'); gr.addColorStop(1, c + '0)'); g.fillStyle = gr; g.fillRect(bx - r, by - r, r * 2, r * 2);
    }
    this.each(tx0, ty0, tx1, ty1, null, (tx, ty, X, Y) => {
      const h1 = hsh(tx, ty), h2 = hsh(tx + 71, ty - 13), h3 = hsh(tx * 3 - 5, ty * 7 + 2), bx = X + h1 * T, by = Y + h2 * T, r = 8 + h3 * 14, c = B.blotch[Math.floor(h1 * 5)];
      const gr = g.createRadialGradient(bx, by, 0, bx, by, r); gr.addColorStop(0, c + '0.28)'); gr.addColorStop(1, c + '0)'); g.fillStyle = gr; g.fillRect(bx - r, by - r, r * 2, r * 2);
    });
    if (B.detail === 'dunes') { g.lineWidth = 0.8; for (let k = Math.floor(y0 / 7) - 2; k < (y0 + CH) / 7 + 2; k++) { g.strokeStyle = k % 2 ? 'rgba(255,235,190,0.28)' : 'rgba(120,80,40,0.16)'; g.beginPath();
      for (let x = x0 - 4; x <= x0 + CH + 4; x += 4) { const y = k * 7 + Math.sin(x * 0.045 + k * 1.7) * 3 + Math.sin(x * 0.013 + k) * 5; x === x0 - 4 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); } }
    if (B.detail === 'lawn') for (let x = Math.floor(x0 / 16) * 16 - 16; x < x0 + CH + 16; x += 16) { g.fillStyle = (x / 16) % 2 ? 'rgba(255,255,220,0.035)' : 'rgba(0,0,0,0.03)'; g.fillRect(x, y0 - 2, 16, CH + 4); }
    this.each(tx0, ty0, tx1, ty1, null, (tx, ty, X, Y, t) => {
      if (t !== TL.GROUND && t !== TL.TREE && t !== TL.ROCK) return;
      for (let i = 0; i < 6; i++) { const a = hsh(tx * 17 + i, ty * 31 - i), b = hsh(ty * 13 + i * 3, tx - i * 7); g.fillStyle = a < 0.5 ? 'rgba(20,10,5,0.28)' : 'rgba(255,230,190,0.16)'; g.fillRect(X + a * T, Y + b * T, 0.6 + b * 0.6, 0.6 + a * 0.5); }
      if (t !== TL.GROUND) return;
      const hd = hsh(tx * 7, ty * 3), sx = X + 3 + hsh(tx, ty * 9) * 10, sy = Y + 5 + hsh(tx * 9, ty) * 9;
      if (B.detail === 'scrub' && hd < 0.2) { tuft(g, sx, sy, ['#7a6a2a', '#5e5a26', '#8e7a36', '#6e4a22'][Math.floor(hsh(tx + 3, ty + 3) * 4)], 6, 4); if (hsh(tx * 3, ty * 5) < 0.3) { g.fillStyle = '#d0603a'; path(g, ring(sx + 1, sy - 3.5, 0.7, 0.7, 4, 0)); g.fill(); } }
      if (B.detail === 'grass' && hd < 0.45) { tuft(g, sx, sy, ['#4a6a2a', '#6a8a36', '#3e5c24'][Math.floor(hsh(tx + 3, ty + 3) * 3)], 7, 3.5); if (hsh(tx * 3, ty * 5) < 0.25) { g.fillStyle = ['#f4f0e0', '#f0d040', '#b080e0', '#e06a6a'][Math.floor(hsh(tx, ty * 7) * 4)]; for (let i = 0; i < 3; i++) { path(g, ring(sx - 3 + i * 3, sy - 4 + (i % 2), 0.8, 0.8, 5, 0)); g.fill(); } } }
      if (B.detail === 'lawn' && hd < 0.08) { g.fillStyle = ['#f4f0e0', '#f0c850', '#e07a9a'][Math.floor(hsh(tx, ty * 7) * 3)]; for (let i = 0; i < 4; i++) { path(g, ring(sx - 3 + i * 2, sy - 2 + (i % 2) * 2, 0.7, 0.7, 5, 0)); g.fill(); } }
      if (B.detail === 'gravel' && hd < 0.3) for (let i = 0; i < 4; i++) { const px = X + hsh(tx * 3 + i, ty) * 14 + 1, py = Y + hsh(ty * 3 + i, tx) * 14 + 1; gem(g, px, py, 0.9, 0.7, 5, 0.8, '#6a5a4e', i, -0.2, -0.2, false); }
      if (B.detail === 'snow') { if (hd < 0.35) { g.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 3; i++) g.fillRect(X + hsh(tx * 3 + i, ty) * 15, Y + hsh(ty * 3 + i, tx) * 15, 0.7, 0.7); }
        if (hd > 0.92) gem(g, sx, sy - 2, 3.6, 2.2, 7, 1.2, '#f2f6fa', hsh(tx, ty) * 3, -0.4, -0.6, false); }
      if ((B.detail === 'scrub' || B.detail === 'grass') && hsh(tx * 5 + 1, ty * 11) < 0.1) { const px = X + 3 + hsh(tx, ty + 5) * 10, py = Y + 3 + hsh(tx + 5, ty) * 10; gem(g, px, py, 1.5, 1.2, 5, 1.2, B.rock, hsh(tx, ty) * 3, -0.4, -0.4, false); }
    });
    // roads, or rails in the mines
    if (bio === 'mine') this.each(tx0, ty0, tx1, ty1, TL.PATH, (tx, ty, X, Y) => {
      const hz = this.t(tx - 1, ty) === TL.PATH && this.t(tx + 1, ty) === TL.PATH && !(this.t(tx, ty - 1) === TL.PATH && this.t(tx, ty + 1) === TL.PATH);
      g.fillStyle = '#2e241e'; g.fillRect(X, Y, T, T);
      for (let i = 0; i < 2; i++) { if (hz) block(g, X + 2 + i * 8, Y + 1, X + 5 + i * 8, Y + 15, 0.8, '#5a4028', 0.5, false); else block(g, X + 1, Y + 2 + i * 8, X + 15, Y + 5 + i * 8, 0.8, '#5a4028', 0.5, false); }
      g.fillStyle = '#9aa0a8'; const odd = hz ? (ty % 2) : (tx % 2); if (hz) g.fillRect(X, Y + (odd ? 4 : 11), T, 1.2); else g.fillRect(X + (odd ? 4 : 11), Y, 1.2, T);
    });
    else { const road = (r, col) => this.each(tx0, ty0, tx1, ty1, TL.PATH, (tx, ty, X, Y) => { g.fillStyle = col; path(g, ring(X + 8, Y + 8, r, r, 8, Math.PI / 8)); g.fill();
        if (this.t(tx + 1, ty) === TL.PATH) g.fillRect(X + 8, Y + 8 - r * 0.92, T, r * 1.84); if (this.t(tx, ty + 1) === TL.PATH) g.fillRect(X + 8 - r * 0.92, Y + 8, r * 1.84, T); });
      road(13, B.road[0]); road(11.6, B.road[1]);
      this.each(tx0, ty0, tx1, ty1, TL.PATH, (tx, ty, X, Y) => { for (let i = 0; i < 4; i++) { const a = hsh(tx * 3 + i, ty * 5), b = hsh(ty * 7 - i, tx * 2 + i); g.fillStyle = a < 0.5 ? 'rgba(60,40,24,0.3)' : B.road[2]; path(g, ring(X + a * T, Y + b * T, 0.9, 0.7, 5, a * 3)); g.fill(); } }); }
    // water, then chasms
    const WET = (x, y) => this.t(x, y) === TL.WATER || (bio !== 'mine' && this.t(x, y) === TL.BRIDGE);
    if (isWild) {
      const depth = (x, y) => { let d = 0; while (d < 3 && WET(x - d - 1, y) && WET(x + d + 1, y) && WET(x, y - d - 1) && WET(x, y + d + 1)) d++; return d; };
      const pool = (minDepth, r, col) => this.each(tx0, ty0, tx1, ty1, null, (tx, ty, X, Y) => { if (!WET(tx, ty) || depth(tx, ty) < minDepth) return; g.fillStyle = col; path(g, ring(X + 8, Y + 8, r, r, 8, Math.PI / 8)); g.fill();
        if (WET(tx + 1, ty) && depth(tx + 1, ty) >= minDepth) g.fillRect(X + 8, Y + 8 - r * 0.92, T, r * 1.84); if (WET(tx, ty + 1) && depth(tx, ty + 1) >= minDepth) g.fillRect(X + 8 - r * 0.92, Y + 8, r * 1.84, T); });
      pool(0, 13, B.water[0]); pool(0, 11, B.water[1]); pool(1, 11.4, B.water[2]); pool(2, 11.4, B.water[3]); pool(3, 11.4, B.water[4]);
    }
    // frozen lakes: rounded like water, with a sheen and cracks
    const ICE = (x, y) => this.t(x, y) === TL.ICE;
    for (const [r, col] of [[12.6, '#9fbcd2'], [11.2, '#bcd6e8']]) this.each(tx0, ty0, tx1, ty1, TL.ICE, (tx, ty, X, Y) => { g.fillStyle = col; path(g, ring(X + 8, Y + 8, r, r, 8, Math.PI / 8)); g.fill();
      if (ICE(tx + 1, ty)) g.fillRect(X + 8, Y + 8 - r * 0.92, T, r * 1.84); if (ICE(tx, ty + 1)) g.fillRect(X + 8 - r * 0.92, Y + 8, r * 1.84, T); });
    this.each(tx0, ty0, tx1, ty1, TL.ICE, (tx, ty, X, Y) => { g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.7; if (hsh(tx, ty * 3) < 0.4) line(g, X + 2, Y + 12, X + 10, Y + 4);
      if (hsh(tx * 7, ty) < 0.25) { g.strokeStyle = 'rgba(60,90,120,0.4)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(X + 3, Y + 3); g.lineTo(X + 8, Y + 9); g.lineTo(X + 14, Y + 7); g.moveTo(X + 8, Y + 9); g.lineTo(X + 7, Y + 15); g.stroke(); } });
    const PIT = (x, y) => this.t(x, y) === TL.CHASM || (bio === 'mine' && this.t(x, y) === TL.BRIDGE);
    this.each(tx0, ty0, tx1, ty1, null, (tx, ty, X, Y) => { if (!PIT(tx, ty)) return;
      g.fillStyle = '#050302'; g.fillRect(X, Y, T, T);
      const gr = g.createRadialGradient(X + 8, Y + 8, 0, X + 8, Y + 8, 14); gr.addColorStop(0, 'rgba(200,60,10,0.35)'); gr.addColorStop(1, 'rgba(120,30,5,0)'); g.fillStyle = gr; g.fillRect(X - 6, Y - 6, T + 12, T + 12);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (!PIT(tx + dx, ty + dy)) { g.fillStyle = '#5a4a3e'; const e = []; for (let i = 0; i <= 4; i++) { const u = i / 4, j = 1.5 + hsh(tx * 7 + i, ty * 3 + dx + dy * 2) * 2.5;
          e.push(dx ? [dx > 0 ? X + T - j : X + j, Y + u * T] : [X + u * T, dy > 0 ? Y + T - j : Y + j]); }
        e.push(dx ? [dx > 0 ? X + T : X, Y + T] : [X + T, dy > 0 ? Y + T : Y]); e.push(dx ? [dx > 0 ? X + T : X, Y] : [X, dy > 0 ? Y + T : Y]); path(g, e); g.fill(); g.strokeStyle = 'rgba(255,120,40,0.35)'; g.lineWidth = 0.4; g.stroke(); } });
    // bridges: planks across the gap
    const CROSS = (x, y) => { const t = this.t(x, y); return t === TL.BRIDGE || t === TL.PATH; };
    this.each(tx0, ty0, tx1, ty1, TL.BRIDGE, (tx, ty, X, Y) => {
      const hz = CROSS(tx - 1, ty) || CROSS(tx + 1, ty) ? !(CROSS(tx, ty - 1) && CROSS(tx, ty + 1) && !(CROSS(tx - 1, ty) && CROSS(tx + 1, ty))) : false;
      const hz2 = (this.t(tx - 1, ty) === TL.PATH || this.t(tx + 1, ty) === TL.PATH) ? true : (this.t(tx, ty - 1) === TL.PATH || this.t(tx, ty + 1) === TL.PATH) ? false : hz;
      for (let i = 0; i < 4; i++) { const c = shade('#8a6238', (hsh(tx * 3 + i, ty) - 0.5) * 0.3); if (hz2) block(g, X + i * 4, Y - 1, X + i * 4 + 3.6, Y + T + 1, 0.6, c, 0.4, false); else block(g, X - 1, Y + i * 4, X + T + 1, Y + i * 4 + 3.6, 0.6, c, 0.4, false); }
      g.fillStyle = '#4a3018'; if (hz2) { if (this.t(tx, ty - 1) !== TL.BRIDGE) g.fillRect(X, Y - 1.5, T, 1.2); if (this.t(tx, ty + 1) !== TL.BRIDGE) g.fillRect(X, Y + T + 0.3, T, 1.2); }
      else { if (this.t(tx - 1, ty) !== TL.BRIDGE) g.fillRect(X - 1.5, Y, 1.2, T); if (this.t(tx + 1, ty) !== TL.BRIDGE) g.fillRect(X + T + 0.3, Y, 1.2, T); }
    });
    // paved floors: stones on a global grid so they stay consistent across tiles; planks in the mines
    const paved = (t) => t === TL.FLOOR || t === TL.CRATE || t === TL.PILLAR || t === TL.GATE || (t === TL.WATER && !isWild);
    this.each(tx0, ty0, tx1, ty1, null, (tx, ty, X, Y, t) => {
      if (!paved(t)) return;
      g.fillStyle = B.grout; g.fillRect(X, Y, T, T);
      if (bio === 'mine') { for (let r = 0; r < 4; r++) { g.fillStyle = B.floor[Math.floor(hsh(tx + r * 7, ty * 3) * B.floor.length)]; g.fillRect(X, Y + r * 4 + 0.4, T, 3.3); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X + ((tx * 5 + r * 3) % 4) * 4, Y + r * 4, 0.5, 4); } return; }
      const big = bio === 'citadel' ? 16 : 8;
      for (let sr = Math.floor(Y / big); sr < (Y + T) / big; sr++) { const off = sr % 2 ? big / 2 : 0;
        for (let c = Math.floor((X + off) / big) - 1; c * big - off < X + T; c++) { const sx = c * big - off, a = Math.max(X, sx + 0.5), b = Math.min(X + T, sx + big - 0.5); if (b <= a) continue;
          const h = hsh(c, sr); g.fillStyle = B.floor[Math.floor(h * B.floor.length)]; const y0s = Math.max(Y, sr * big + 0.5), y1s = Math.min(Y + T, sr * big + big - 0.5); g.fillRect(a, y0s, b - a, y1s - y0s);
          g.fillStyle = 'rgba(255,250,235,0.14)'; if (sr * big + 0.5 >= Y) g.fillRect(a, sr * big + 0.5, b - a, 0.8); } }
    });
    if (bio === 'citadel') this.each(tx0, ty0, tx1, ty1, TL.FLOOR, (tx, ty, X, Y) => { // gold inlay along the grand avenues
      if ((tx === 41 || tx === 42) && ty % 3 === 0) { g.fillStyle = 'rgba(214,170,70,0.55)'; path(g, ring(X + (tx === 41 ? 16 : 0), Y + 8, 2.2, 2.2, 4, 0)); g.fill(); }
      if ((ty === 33 || ty === 34) && tx % 3 === 0) { g.fillStyle = 'rgba(214,170,70,0.55)'; path(g, ring(X + 8, Y + (ty === 33 ? 16 : 0), 2.2, 2.2, 4, 0)); g.fill(); } });
    // formal pools (the Citadel)
    if (!isWild) this.each(tx0, ty0, tx1, ty1, TL.WATER, (tx, ty, X, Y) => {
      const W = (x, y) => this.t(x, y) === TL.WATER;
      const gr = g.createLinearGradient(0, Y, 0, Y + T); gr.addColorStop(0, B.water[3]); gr.addColorStop(1, B.water[1]); g.fillStyle = gr; g.fillRect(X, Y, T, T);
      if (!W(tx, ty - 1)) block(g, X - 1, Y - 1, X + T + 1, Y + 2.5, 1.2, '#e8dcc6', 0.6, false); if (!W(tx, ty + 1)) block(g, X - 1, Y + T - 2.5, X + T + 1, Y + T + 1, 1.2, '#e8dcc6', 0.6, false);
      if (!W(tx - 1, ty)) block(g, X - 1, Y - 1, X + 2.5, Y + T + 1, 1.2, '#e8dcc6', 0.6, false); if (!W(tx + 1, ty)) block(g, X + T - 2.5, Y - 1, X + T + 1, Y + T + 1, 1.2, '#e8dcc6', 0.6, false);
    });
    // landing pads: riveted plates with hazard striping along the edges and a painted landing ring
    const PADT = (x, y) => { const u = this.t(x, y); return u === TL.PAD || u === TL.HULL; };
    this.each(tx0, ty0, tx1, ty1, null, (tx, ty, X, Y, t) => { if (t !== TL.PAD && t !== TL.HULL) return;
      g.fillStyle = '#34383f'; g.fillRect(X, Y, T, T); g.fillStyle = ['#4a4f58', '#464b54', '#4e535c'][Math.floor(hsh(tx, ty) * 3)]; g.fillRect(X + 0.4, Y + 0.4, T - 0.8, T - 0.8);
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(X + 0.4, Y + 0.4, T - 0.8, 0.8); g.fillStyle = 'rgba(20,20,24,0.6)'; for (const [a, b] of [[2, 2], [14, 2], [2, 14], [14, 14]]) g.fillRect(X + a - 0.4, Y + b - 0.4, 0.8, 0.8);
      if (hsh(tx * 5, ty * 3) < 0.12) { g.fillStyle = 'rgba(20,16,12,0.25)'; path(g, ring(X + 8, Y + 8, 5, 3, 7, hsh(tx, ty) * 3)); g.fill(); }
      const stripe = (x0, y0, w, h, vert) => { g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip(); g.fillStyle = '#1e1a14'; g.fillRect(x0, y0, w, h); g.fillStyle = '#e8b830';
        for (let k = -2; k < 8; k++) { const o = k * 4; g.beginPath(); if (vert) { g.moveTo(x0, y0 + o); g.lineTo(x0 + w, y0 + o - 2); g.lineTo(x0 + w, y0 + o); g.lineTo(x0, y0 + o + 2); } else { g.moveTo(x0 + o, y0 + h); g.lineTo(x0 + o + 2, y0); g.lineTo(x0 + o + 4, y0); g.lineTo(x0 + o + 2, y0 + h); } g.fill(); } g.restore(); };
      if (!PADT(tx, ty - 1)) stripe(X, Y, T, 2.2, false); if (!PADT(tx, ty + 1)) stripe(X, Y + T - 2.2, T, 2.2, false);
      if (!PADT(tx - 1, ty)) stripe(X, Y, 2.2, T, true); if (!PADT(tx + 1, ty)) stripe(X + T - 2.2, Y, 2.2, T, true); });
    const pad = this.map.pad; if (pad && pad.x > x0 - 140 && pad.x < x0 + CH + 140 && pad.y > y0 - 140 && pad.y < y0 + CH + 140) {
      const R = Math.min((pad.x1 - pad.x0) * T, (pad.y1 - pad.y0) * T) * 0.42; g.strokeStyle = 'rgba(232,184,48,0.75)'; g.lineWidth = 2.2; g.beginPath(); g.arc(pad.x, pad.y, R, 0, TAU); g.stroke();
      g.lineWidth = 0.9; g.setLineDash([6, 5]); g.beginPath(); g.arc(pad.x, pad.y, R - 6, 0, TAU); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(232,184,48,0.65)'; for (let i = 0; i < 3; i++) { const yy = pad.ramp.y + 16 + i * 7; path(g, [[pad.x - 7, yy + 4], [pad.x, yy], [pad.x + 7, yy + 4], [pad.x + 7, yy + 6], [pad.x, yy + 2], [pad.x - 7, yy + 6]]); g.fill(); } }
    // shadows cast by tall things
    this.each(tx0, ty0, tx1, ty1, null, (tx, ty, X, Y, t) => {
      if ((t === TL.WALL || t === TL.CLIFF) && this.t(tx, ty + 1) !== t) { const gr = g.createLinearGradient(0, Y + T, 0, Y + T + 7); gr.addColorStop(0, 'rgba(20,8,4,0.42)'); gr.addColorStop(1, 'rgba(20,8,4,0)'); g.fillStyle = gr; g.fillRect(X, Y + T, T + 2, 7); }
      if (t === TL.TREE && B.trees !== 'none') { g.fillStyle = 'rgba(16,10,4,0.3)'; path(g, ring(X + 11, Y + 11, 11, 7, 7, 0.3)); g.fill(); }
      if (t === TL.CRATE || t === TL.PILLAR) { g.fillStyle = 'rgba(20,10,5,0.3)'; path(g, ring(X + 10, Y + 14, 8, 3.5, 6, 0)); g.fill(); }
    });
    for (const b of this.buildingsIn(tx0, ty0, tx1, ty1)) { const X1 = (b.x1 + 1) * T, Y1 = (b.y1 + 1) * T, X0 = b.x0 * T; g.fillStyle = 'rgba(20,10,5,0.35)'; g.beginPath(); g.moveTo(X0 + 4, Y1); g.lineTo(X1 + 7, Y1); g.lineTo(X1 + 7, Y1 + 7); g.lineTo(X0 + 8, Y1 + 7); g.fill(); }
    // vertical faces seen from the south: walls, cliffs, buildings, crates
    this.each(tx0, ty0, tx1, ty1, null, (tx, ty, X, Y, t) => {
      if ((t !== TL.WALL && t !== TL.CLIFF) || this.t(tx, ty + 1) === t) return;
      const face = t === TL.WALL ? B.wallFace : B.cliffFace, top = Y + T - 7;
      if (t === TL.WALL) { const gr = g.createLinearGradient(0, top, 0, Y + T); gr.addColorStop(0, face); gr.addColorStop(1, shade(face, -0.35)); g.fillStyle = gr; g.fillRect(X, top, T, 7);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X, Y + T - 3.6, T, 0.5); const o = ty % 2 ? 3 : 9; g.fillRect(X + o, top, 0.5, 3.4); g.fillRect(X + (o + 8) % 16, Y + T - 3.5, 0.5, 3.5); }
      else { const e = []; for (let i = 0; i <= 4; i++) e.push([X + i * 4, top]); for (let i = 4; i >= 0; i--) e.push([X + i * 4, Y + T - hsh(tx * 4 + i, ty) * 2.5]);
        g.fillStyle = face; path(g, e); g.fill(); g.strokeStyle = shade(face, -0.35); g.lineWidth = 0.5; for (let i = 0; i < 3; i++) { const sx = X + 2 + hsh(tx * 3 + i, ty * 5) * 12; line(g, sx, top + 1, sx + 1.5, Y + T - 2); } }
      if (bio === 'citadel' && t === TL.WALL && ty <= 2 && tx % 6 === 3) { const H = DEFS.HOUSES[Math.floor(tx / 6) % DEFS.HOUSES.length], bx = X + 4, by = top; // House banners on the north wall
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx + 1, by + 1, 8, 13); solid(g, [[bx, by], [bx + 8, by], [bx + 8, by + 12], [bx + 4, by + 9.5], [bx, by + 12]], [bx + 4, by, 1], [bx + 4, by + 10, 1], H.color); g.fillStyle = '#e9c35a'; g.fillRect(bx - 0.5, by - 0.5, 9, 1); }
    });
    for (const b of this.buildingsIn(tx0, ty0, tx1, ty1)) this.buildingFace(g, b);
    this.each(tx0, ty0, tx1, ty1, TL.CRATE, (tx, ty, X, Y) => { if (bio === 'citadel') { g.fillStyle = '#6a4a2a'; g.fillRect(X + 1.5, Y + T - 6, 13, 6); g.fillStyle = '#3a2614'; g.fillRect(X + 2, Y + T - 1.5, 1.2, 1.5); g.fillRect(X + 13, Y + T - 1.5, 1.2, 1.5); }
      else { g.fillStyle = shade(B.crate, -0.4); g.fillRect(X + 1.5, Y + T - 5, 13, 5); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X + 5.5, Y + T - 5, 0.5, 5); g.fillRect(X + 10, Y + T - 5, 0.5, 5); } });
    this.each(tx0, ty0, tx1, ty1, TL.PILLAR, (tx, ty, X, Y) => block(g, X + 1, Y + 3, X + T - 1, Y + T, 1.5, B.wallFace, 1));
    this.each(tx0, ty0, tx1, ty1, TL.ROCK, (tx, ty, X, Y) => {
      const cx = X + 8 + (hsh(tx, ty) - 0.5) * 3, cy = Y + 9;
      g.fillStyle = 'rgba(20,10,5,0.32)'; path(g, ring(cx + 2, cy + 2.5, 6.6, 4.4, 7, 0)); g.fill();
      if (bio === 'glass') { for (let i = 0; i < 3; i++) { const a = hsh(tx + i, ty * 5) * TAU, x = cx + Math.cos(a) * 3, y = cy + Math.sin(a) * 2.4, hgt = 5 + hsh(tx * 3 + i, ty) * 5; solid(g, [[x, y - hgt], [x + 2, y], [x, y + 1.4], [x - 2, y]], [x, y - 1, hgt * 0.6], [x, y - 1, hgt * 0.6], i % 2 ? '#a8e0e6' : '#6ab8c4', 'rgba(255,255,255,0.5)'); } return; }
      solid(g, ring(cx, cy, 6.4, 5.6, 7, hsh(tx, ty * 3) * 3, 0.35, tx * 31 + ty), [cx - 1.4, cy - 1.8, 5.2], [cx - 1.4, cy - 1.8, 5.2], B.rock);
      if (hsh(tx * 3, ty * 7) < 0.45) gem(g, X + 3 + hsh(ty, tx) * 10, Y + 13, 2.8, 2.3, 6, 2.4, shade(B.rock, -0.1), hsh(tx, ty) * 3, -0.6, -0.6);
    });
    this.each(tx0, ty0, tx1, ty1, TL.TREE, (tx, ty, X, Y) => { if (B.trees !== 'none') gem(g, X + 8, Y + 11, 2.4, 2.2, 6, 2, '#4a2e18', 0.2); });
    for (const c of this.crystals) if (c.x >= (tx0 - 1) * T && c.x <= (tx1 + 1) * T && c.y >= (ty0 - 1) * T && c.y <= (ty1 + 1) * T) {
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + c.x, x = c.x + Math.cos(a) * 1.8, y = c.y + Math.sin(a) * 1.4; solid(g, [[x, y - 3.2 - i], [x + 1.3, y], [x, y + 1], [x - 1.3, y]], [x, y - 1, 3], [x, y - 1, 3], c.c, 'rgba(255,255,255,0.4)'); } }
    for (const p of this.propsIn(tx0, ty0, tx1, ty1)) if (p.type === 'lantern') { block(g, p.x - 1, p.y - 1, p.x + 1, p.y + 3, 1.2, '#3a2a1a', 0.3); block(g, p.x - 1.8, p.y - 4, p.x + 1.8, p.y - 0.5, 1.4, '#c89a4a', 0.5); }
  }
  buildingFace(g, b) {
    const X0 = b.x0 * T, X1 = (b.x1 + 1) * T, Y1 = (b.y1 + 1) * T, fy = Y1 - 9, w = X1 - X0;
    const col = b.style === 'palace' ? '#efe4cc' : b.style === 'hall' ? '#8a8a82' : b.style === 'longhouse' ? '#5a3e26' : b.style === 'hangar' ? '#9aa0a8' : WALLFACE[b.style % 4];
    const gr = g.createLinearGradient(0, fy, 0, Y1); gr.addColorStop(0, col); gr.addColorStop(1, shade(col, -0.25)); g.fillStyle = gr; g.fillRect(X0, fy, w, 9);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X0, Y1 - 1, w, 1);
    if (b.style === 'palace') { for (let x = X0 + 6; x < X1 - 4; x += 10) block(g, x - 1.4, fy, x + 1.4, Y1, 1, '#d8b060', 0.4); }
    if (b.style === 'longhouse') { g.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = X0 + 3; x < X1; x += 3) g.fillRect(x, fy, 0.5, 9); }
    if (b.style === 'hangar') { const d0 = X0 + w * 0.12, d1 = X1 - w * 0.12; g.fillStyle = '#2a2e34'; g.fillRect(d0, fy + 1, d1 - d0, 8); g.fillStyle = '#4a5058'; for (let x = d0; x < d1; x += 4) g.fillRect(x, fy + 1, 0.6, 8);
      g.fillStyle = '#e8b830'; for (let x = d0; x < d1; x += 3) if ((x / 3 | 0) % 2) g.fillRect(x, fy + 0.2, 1.5, 0.8); return; }
    const nWin = Math.max(1, Math.floor(w / 11));
    for (let i = 0; i < nWin; i++) { const wx = X0 + (i + 0.5) * w / nWin; if (Math.abs(wx - (X0 + w / 2)) < 4 && b.style !== 'hall') continue;
      g.fillStyle = '#2a1c14'; g.fillRect(wx - 1.6, fy + 2, 3.2, 3.6); g.fillStyle = hsh(b.x0 + i, b.y0) < 0.55 ? 'rgba(255,200,110,0.8)' : 'rgba(140,170,200,0.5)'; g.fillRect(wx - 1.1, fy + 2.5, 2.2, 2.6); }
    const dx = X0 + w / 2; g.fillStyle = '#3a2416'; g.beginPath(); g.moveTo(dx - 2.4, Y1); g.lineTo(dx - 2.4, fy + 3.5); g.lineTo(dx, fy + 2); g.lineTo(dx + 2.4, fy + 3.5); g.lineTo(dx + 2.4, Y1); g.fill();
  }
  roof(g, b) {
    const X0 = b.x0 * T - 1.5, X1 = (b.x1 + 1) * T + 1.5, Y0 = b.y0 * T - 13, Y1 = (b.y1 + 1) * T - 9, w = X1 - X0, h = Y1 - Y0;
    const col = b.style === 'palace' ? '#d8a63a' : b.style === 'hall' ? '#4a4f5a' : b.style === 'longhouse' ? '#4a3a2c' : b.style === 'hangar' ? '#6a7079' : ROOFS[b.style % 4], H = Math.min(w, h) * 0.5;
    g.fillStyle = 'rgba(20,10,5,0.35)'; g.fillRect(X0 + 2, Y0 + 2, w, h);
    const c = [[X0, Y0, 0], [X1, Y0, 0], [X1, Y1, 0], [X0, Y1, 0]];
    if (w >= h) { const m = h / 2, r0 = [X0 + m, Y0 + m, H], r1 = [X1 - m, Y0 + m, H]; facet(g, [c[0], c[1], r1, r0], col); facet(g, [c[2], c[3], r0, r1], col); facet(g, [c[3], c[0], r0], col); facet(g, [c[1], c[2], r1], col); g.strokeStyle = tone(col, 0.35); g.lineWidth = 0.6; line(g, r0[0], r0[1], r1[0], r1[1]); }
    else { const m = w / 2, r0 = [X0 + m, Y0 + m, H], r1 = [X0 + m, Y1 - m, H]; facet(g, [c[3], c[0], r0, r1], col); facet(g, [c[1], c[2], r1, r0], col); facet(g, [c[0], c[1], r0], col); facet(g, [c[2], c[3], r1], col); g.strokeStyle = tone(col, 0.35); g.lineWidth = 0.6; line(g, r0[0], r0[1], r1[0], r1[1]); }
    g.save(); g.beginPath(); g.rect(X0, Y0, w, h); g.clip(); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 0.4; for (let y = Y0 + 3; y < Y1; y += 3) line(g, X0, y, X1, y); g.restore();
    g.strokeStyle = EDGE; g.lineWidth = 0.5; g.strokeRect(X0, Y0, w, h);
    if (b.style === 'palace') { for (const [x, y] of [[X0 + 6, Y0 + 6], [X1 - 6, Y0 + 6], [X0 + 6, Y1 - 6], [X1 - 6, Y1 - 6]]) { block(g, x - 7, y - 7, x + 7, y + 7, 4, '#efe4cc', 2); gem(g, x, y, 5, 5, 8, 12, '#e0b040', Math.PI / 8); }
      const mx = (X0 + X1) / 2, my = (Y0 + Y1) / 2; block(g, mx - 12, my - 12, mx + 12, my + 12, 6, '#efe4cc', 3); gem(g, mx, my, 9, 9, 8, 26, '#f0c450', Math.PI / 8); }
    if (this.map.biome === 'ice') { g.fillStyle = 'rgba(244,248,252,0.75)'; if (w >= h) g.fillRect(X0 + h / 2 - 2, Y0 + h / 2 - 3, w - h + 4, 6); else g.fillRect(X0 + w / 2 - 3, Y0 + w / 2 - 2, 6, h - w + 4); }
    if (b.style === 'hangar') { g.strokeStyle = 'rgba(20,24,30,0.45)'; g.lineWidth = 0.6; for (let x = X0 + 6; x < X1 - 2; x += 6) line(g, x, Y0 + 1, x, Y1 - 1); return; }
    if (b.style === 'longhouse') return;
    else if (hsh(b.x0, b.y0 * 3) < 0.6) { const cx = X0 + 6 + hsh(b.x0 * 7, b.y0) * (w - 12), cy = Y0 + 4; block(g, cx - 2.2, cy - 2.2, cx + 2.2, cy + 2.2, 3, '#6a5a50', 0.6); }
  }
  paintHi(g, tx0, ty0, tx1, ty1) {
    let any = false; const B = this.B, bio = this.map.biome;
    this.each(tx0, ty0, tx1, ty1, TL.WALL, (tx, ty, X, Y) => { any = true;
      const top = Y - 7, ruin = bio !== 'citadel' && hsh(tx * 5, ty * 3) < 0.3;
      if (bio === 'ice') { for (let i = 0; i < 3; i++) gem(g, X + 2.7 + i * 5.3, top + 8, 2.7, 6.5, 6, 4, shade(B.wallTop, (hsh(tx * 3 + i, ty) - 0.5) * 0.2), Math.PI / 2); g.fillStyle = 'rgba(240,248,255,0.6)'; g.fillRect(X, top + 1.5, T, 2); return; }
      block(g, X, top + (ruin ? 2 : 0), X + T, top + T, 2.5, shade(B.wallTop, (hsh(tx, ty) - 0.5) * 0.12), 1.6);
      if (bio === 'citadel' && this.t(tx, ty + 1) !== TL.WALL) { g.fillStyle = 'rgba(214,170,70,0.7)'; g.fillRect(X, top + T - 1.2, T, 1.2); }
      if (ruin && hsh(tx * 11, ty * 13) < 0.5) { g.fillStyle = 'rgba(90,110,50,0.4)'; path(g, ring(X + 4 + hsh(tx, ty * 2) * 8, top + 5 + hsh(ty, tx * 2) * 6, 3, 2, 5, 0)); g.fill(); } });
    this.each(tx0, ty0, tx1, ty1, TL.CLIFF, (tx, ty, X, Y) => { any = true;
      const top = Y - 7, inner = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => this.t(tx + dx, ty + dy) === TL.CLIFF);
      if (inner && bio === 'mine') { g.fillStyle = shade(B.cliffTop, -0.55 + hsh(tx, ty) * 0.08); g.fillRect(X - 0.2, top - 0.2, T + 0.4, T + 0.4); return; }
      g.fillStyle = shade(B.cliffTop, -0.25); g.fillRect(X - 0.2, top - 0.2, T + 0.4, T + 0.4);
      const ax = X + 6 + hsh(tx * 3, ty) * 4, ay = top + 6 + hsh(tx, ty * 3) * 4;
      solid(g, ring(X + 8, top + 8, 9.5, 9.5, 6, hsh(tx, ty) * 2, 0.35, tx * 13 + ty), [ax, ay, inner ? 4 : 6], [ax, ay, inner ? 4 : 6], B.cliffTop, false); });
    for (const b of this.buildingsIn(tx0, ty0, tx1, ty1)) { any = true; this.roof(g, b); }
    this.each(tx0, ty0, tx1, ty1, TL.CRATE, (tx, ty, X, Y) => { any = true;
      if (bio === 'citadel') { const H = DEFS.HOUSES[Math.floor(hsh(tx * 7, ty * 3) * DEFS.HOUSES.length)], c = H.color === '#34343f' ? '#c8a050' : H.color, x0 = X, x1 = X + T, y0 = Y - 5, y1 = Y + T - 5;
        facet(g, [[x0, y0, 0], [x1, y0, 0], [x1, (y0 + y1) / 2, 5], [x0, (y0 + y1) / 2, 5]], c); facet(g, [[x0, y1, 0], [x1, y1, 0], [x1, (y0 + y1) / 2, 5], [x0, (y0 + y1) / 2, 5]], '#efe6d4');
        g.strokeStyle = EDGE; g.lineWidth = 0.35; g.strokeRect(x0, y0, T, y1 - y0); return; }
      if (hsh(tx * 7, ty * 13) < 0.45) gem(g, X + 8, Y + 5, 6.2, 6.2, 8, 3, '#8a5a30', Math.PI / 8);
      else block(g, X + 1.5, Y - 2, X + 14.5, Y + 11, 3, B.crate, 2); });
    const special = new Set(this.map.props.filter(p => p.type === 'statue' || p.type === 'brazier').map(p => Math.floor(p.x / T) + ',' + Math.floor(p.y / T)));
    special.add('41,33'); special.add('41,34'); special.add('42,33'); special.add('42,34');
    this.each(tx0, ty0, tx1, ty1, TL.PILLAR, (tx, ty, X, Y) => { any = true;
      if (bio === 'citadel' && special.has(tx + ',' + ty)) return;
      gem(g, X + 8, Y + 1, 5.2, 5.2, 8, 5, bio === 'citadel' ? '#ece2cf' : B.wallTop, Math.PI / 8); g.strokeStyle = bio === 'citadel' ? '#d6aa46' : 'rgba(0,0,0,0.3)'; g.lineWidth = 0.8; path(g, ring(X + 8, Y + 1, 5.2, 5.2, 8, Math.PI / 8)); g.stroke(); });
    for (const p of this.propsIn(tx0, ty0, tx1, ty1)) {
      if (p.type === 'brazier') { any = true; block(g, p.x - 5.5, p.y - 9, p.x + 5.5, p.y + 1, 2.5, '#ece2cf', 1.5); gem(g, p.x, p.y - 5, 4.6, 4.6, 8, 2, '#3a3036', Math.PI / 8); g.fillStyle = '#ff9a3a'; path(g, ring(p.x, p.y - 5, 2.6, 2.6, 6, 0)); g.fill(); }
      if (p.type === 'statue') { any = true; block(g, p.x - 17, p.y - 25, p.x + 17, p.y + 1, 5, '#ece2cf', 4); block(g, p.x - 12, p.y - 21, p.x + 12, p.y - 3, 3, '#d6ccb8', 2);
        humanoid(g, { x: p.x, y: p.y - 13, face: Math.PI / 2, s: 2.1, pal: STATUE, hair: 1, weapon: 'razor', t: 0, walk: 0, noShadow: true, act: { k: 'parry', p: 0.4 } }); setRot(0); }
    }
    // tree canopies: low-poly gems, cones and topiary depending on the biome
    const trees = []; this.each(tx0, ty0, tx1, ty1, TL.TREE, (tx, ty, X, Y) => trees.push([tx, ty, X, Y]));
    if (trees.length && B.trees !== 'none') any = true;
    if (B.trees !== 'none') for (const [tx, ty, X, Y] of trees) {
      const C = B.canopy[Math.floor(Math.pow(hsh(tx * 3 + 1, ty * 5 + 2), 1.4) * B.canopy.length)], jx = (hsh(tx, ty * 3) - 0.5) * 2.4, jy = (hsh(tx * 5, ty) - 0.5) * 2.4, cx = X + 8 + jx, cy = Y + 2 + jy, sd = tx * 31 + ty * 17;
      if (B.trees === 'cactus') {
        g.fillStyle = 'rgba(60,40,10,0.28)'; path(g, ring(cx + 3, cy + 5, 5, 3, 6, 0)); g.fill();
        const arm = hsh(sd, 7) < 0.5 ? 1 : -1; limb(g, [cx, cy + 3], [cx + arm * 5, cy + 1], 2.2, C[0], 2.2); gem(g, cx + arm * 5, cy + 1, 1.6, 1.6, 6, 3.4, C[1], 0.3);
        gem(g, cx, cy + 3, 3.2, 3.2, 8, 6, C[0], Math.PI / 8, -0.4, -0.5); gem(g, cx - 0.3, cy + 2.6, 1.6, 1.6, 6, 7, C[1], 0.2);
        if (hsh(sd, 9) < 0.3) { g.fillStyle = '#f0a0c0'; path(g, ring(cx, cy + 2.6, 0.9, 0.9, 5, 0)); g.fill(); }
        continue;
      }
      if (B.trees === 'pine' || B.trees === 'snowpine') {
        const r = 9 + hsh(tx + 1, ty + 7) * 2.5, star = (rr, k) => { const o = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + hsh(sd, 2) * 2; o.push([cx - k + Math.cos(a) * rr * (i % 2 ? 0.66 : 1), cy - k * 1.2 + Math.sin(a) * rr * (i % 2 ? 0.66 : 1)]); } return o; };
        g.fillStyle = 'rgba(10,20,6,0.3)'; path(g, star(r, -2)); g.fill();
        solid(g, star(r, 0), [cx - 1, cy - 1.2, r * 1.4], [cx - 1, cy - 1.2, r * 1.4], C[0]);
        if (B.trees === 'snowpine') { solid(g, star(r * 0.72, 1), [cx - 1.8, cy - 2.4, r * 1.6], [cx - 1.8, cy - 2.4, r * 1.6], C[1]); solid(g, star(r * 0.4, 2.2), [cx - 2.8, cy - 3.8, r * 2.0], [cx - 2.8, cy - 3.8, r * 2.0], C[0]); }
        else solid(g, star(r * 0.6, 1.8), [cx - 2.6, cy - 3.4, r * 1.9], [cx - 2.6, cy - 3.4, r * 1.9], C[1]);
      } else if (B.trees === 'cypress') {
        g.fillStyle = 'rgba(10,20,6,0.3)'; path(g, ring(cx + 2.5, cy + 3.5, 6.5, 5.5, 8, 0)); g.fill();
        solid(g, ring(cx, cy, 6.4, 6, 8, hsh(sd, 1), 0.2, sd), [cx - 1, cy - 1.2, 7], [cx - 1, cy - 1.2, 7], C[0]); gem(g, cx - 1.4, cy - 2, 3.4, 3.2, 7, 7, C[1], hsh(sd, 3) * 2, -0.6, -0.6);
      } else {
        const r = 8.4 + hsh(tx + 1, ty + 7) * 2.2;
        g.fillStyle = 'rgba(10,12,4,0.32)'; path(g, ring(cx + 1.5, cy + 2, r, r * 0.9, 7, 0.4)); g.fill();
        solid(g, ring(cx, cy, r, r * 0.92, 7, hsh(sd, 5) * 2, 0.3, sd), [cx - 1.2, cy - 1.4, r * 0.95], [cx - 1.2, cy - 1.4, r * 0.95], C[0]);
        solid(g, ring(cx - 1.8, cy - 2.4, r * 0.56, r * 0.52, 6, hsh(sd, 9) * 2, 0.3, sd + 3), [cx - 2.4, cy - 3, r * 1.3], [cx - 2.4, cy - 3, r * 1.3], C[1]);
      }
    }
    return any;
  }
}

// ---------------- per-frame world effects (not cached) ----------------
// layer 'ground': moving glints on water and landing lights; layer 'air': fire in braziers and lanterns.
function worldFx(g, map, x0, y0, x1, y1, t, layer) {
  g.lineWidth = 0.6; g.lineCap = 'round';
  if (layer === 'air') return flames(g, map, x0, y0, x1, y1, t);
  for (let ty = Math.max(0, Math.floor(y0 / T)); ty <= Math.min(map.h - 1, Math.floor(y1 / T)); ty++) for (let tx = Math.max(0, Math.floor(x0 / T)); tx <= Math.min(map.w - 1, Math.floor(x1 / T)); tx++) {
    if (map.M[ty * map.w + tx] !== TL.WATER) continue;
    for (let i = 0; i < 2; i++) { const h = hsh(tx * 5 + i, ty * 9 - i), ph = t * (0.6 + h * 0.5) + h * 10, a = Math.max(0, Math.sin(ph)); if (a < 0.05) continue;
      const x = tx * T + 2 + hsh(tx + i, ty) * 12 + Math.sin(ph * 0.5) * 1.5, y = ty * T + 3 + h * 10;
      g.strokeStyle = `rgba(190,225,245,${0.4 * a})`; g.beginPath(); g.moveTo(x - 2.5, y); g.lineTo(x, y - 0.8); g.lineTo(x + 2.5, y); g.stroke(); }
  }
  for (const p of map.props) if (p.type === 'firepit' && p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) { setRot(0); g.fillStyle = 'rgba(20,10,5,0.4)'; path(g, ring(p.x, p.y, 7, 5, 8, 0)); g.fill();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; gem(g, p.x + Math.cos(a) * 5.5, p.y + Math.sin(a) * 4, 1.6, 1.3, 5, 1.4, '#5a5652', a); } g.fillStyle = '#ff7a2a'; path(g, ring(p.x, p.y, 3, 2.2, 6, 0)); g.fill(); }
  if (map.pad && map.pad.x > x0 - 200 && map.pad.x < x1 + 200 && map.pad.y > y0 - 200 && map.pad.y < y1 + 200) padLights(g, map.pad, t);
}
function flames(g, map, x0, y0, x1, y1, t) {
  for (const p of map.props) { if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    if (p.type === 'brazier' || p.type === 'lantern' || p.type === 'firepit') { const fy = p.type === 'brazier' ? p.y - 6 : p.type === 'firepit' ? p.y : p.y - 2.5, s = p.type === 'brazier' ? 1 : p.type === 'firepit' ? 1.3 : 0.45;
      for (let i = 0; i < 3; i++) { const f = Math.sin(t * 9 + i * 2.1 + p.x) * 0.8, hgt = (5 + i * 1.6 + f) * s; g.fillStyle = ['rgba(255,90,20,0.9)', 'rgba(255,170,50,0.9)', 'rgba(255,240,170,0.95)'][i];
        path(g, [[p.x - (3 - i) * s * 0.9, fy], [p.x + f * 0.4 * s, fy - hgt], [p.x + (3 - i) * s * 0.9, fy]]); g.fill(); } } }
}
// Light sources for dark zones: [x, y, radius, r, g, b]
function lightsIn(terrain, x0, y0, x1, y1) {
  const out = [], map = terrain.map;
  for (const p of map.props) if ((p.type === 'lantern' || p.type === 'brazier' || p.type === 'firepit') && p.x > x0 - 90 && p.x < x1 + 90 && p.y > y0 - 90 && p.y < y1 + 90) out.push([p.x, p.y - 3, p.type === 'lantern' ? 78 : 90, 255, 190, 110]);
  for (const c of terrain.crystals) if (c.x > x0 - 30 && c.x < x1 + 30 && c.y > y0 - 30 && c.y < y1 + 30) out.push(c.c === '#5fd8e8' ? [c.x, c.y, 26, 95, 216, 232] : [c.x, c.y, 26, 176, 138, 255]);
  if (map.pad) out.push([map.pad.x, map.pad.y, 150, 255, 220, 160]);
  for (const n of map.nodes) if (NODE_LOOK[n.kind].glow && n.x > x0 - 30 && n.x < x1 + 30 && n.y > y0 - 30 && n.y < y1 + 30) { const c = NODE_LOOK[n.kind].glow.split(',').map(Number); out.push([n.x, n.y - 3, 30, c[0], c[1], c[2]]); }
  for (let ty = Math.max(0, Math.floor(y0 / T)); ty <= Math.min(map.h - 1, Math.floor(y1 / T)); ty += 2) for (let tx = Math.max(0, Math.floor(x0 / T)); tx <= Math.min(map.w - 1, Math.floor(x1 / T)); tx += 2)
    if (map.M[ty * map.w + tx] === TL.CHASM) out.push([tx * T + 8, ty * T + 8, 34, 255, 110, 40]);
  return out;
}
window.ART = { COLOR_STYLE, SKINS, MOB_LOOK, BIOMES, shade, hsh, ease, palFor, playerPal, colorPal, pickHouse, humanoid, mob, icon, sigil, banner, relic, solid, gem, block, ring, setRot, Terrain, worldFx, lightsIn, rrect, ship, node, NODE_LOOK, mapImage };
})();
