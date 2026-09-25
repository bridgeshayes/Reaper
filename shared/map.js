// Shared world maps. Loaded by the server (require) AND the browser (<script>), so both build the exact same zones.
// Every zone is generated deterministically from its seed; nothing about the map is ever sent over the network.
(function (root, factory) { const m = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = m; else root.SHARED_MAP = m; })(this, function () {
  const T = 16;
  // GATE is unused (ships replaced gate portals) but keeps its number so tile ids stay stable.
  const TL = { GROUND: 0, PATH: 1, WALL: 2, WATER: 3, TREE: 4, ROCK: 5, FLOOR: 6, CRATE: 7, BUILDING: 8, CLIFF: 9, CHASM: 10, PILLAR: 11, GATE: 12, BRIDGE: 13, ICE: 14, PAD: 15, HULL: 16 };
  const SOLID = [], SHOT_BLOCK = [];
  for (const t of [TL.WALL, TL.WATER, TL.TREE, TL.ROCK, TL.CRATE, TL.BUILDING, TL.CLIFF, TL.CHASM, TL.PILLAR, TL.HULL]) SOLID[t] = 1;
  for (const t of [TL.WALL, TL.TREE, TL.ROCK, TL.CRATE, TL.BUILDING, TL.CLIFF, TL.PILLAR, TL.HULL]) SHOT_BLOCK[t] = 1; // bolts fly over water and chasms
  const CLEARABLE = [TL.TREE, TL.ROCK, TL.WALL, TL.CLIFF, TL.CRATE];
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Map-building toolkit. All coordinates are tiles.
  function kit(map, R) {
    const { w, h, M } = map;
    const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
    const get = (x, y) => inb(x, y) ? M[y * w + x] : -1;
    const set = (x, y, v) => { if (inb(x, y)) M[y * w + x] = v; };
    const rect = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v); };
    const frame = (x0, y0, x1, y1, v) => { for (let x = x0; x <= x1; x++) { set(x, y0, v); set(x, y1, v); } for (let y = y0; y <= y1; y++) { set(x0, y, v); set(x1, y, v); } };
    const disc = (cx, cy, r, v, only) => { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x - cx, y - cy) <= r && (!only || only.includes(get(x, y)))) set(x, y, v); };
    const blob = (cx, cy, rx, ry, v, seed) => { for (let y = Math.floor(cy - ry * 1.4); y <= Math.ceil(cy + ry * 1.4); y++) for (let x = Math.floor(cx - rx * 1.4); x <= Math.ceil(cx + rx * 1.4); x++) {
      const a = Math.atan2(y - cy, x - cx), wob = 1 + 0.16 * Math.sin(a * 3 + seed) + 0.09 * Math.sin(a * 5 + seed * 2.3); if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= wob * wob) set(x, y, v); } };
    const scatter = (n, pick, on) => { for (let i = 0; i < n; i++) { const cx = Math.floor(R() * w), cy = Math.floor(R() * h), k = 2 + Math.floor(R() * 7), t = pick();
      for (let j = 0; j < k; j++) { const x = cx + Math.floor(R() * 5) - 2, y = cy + Math.floor(R() * 5) - 2; if (get(x, y) === (on == null ? TL.GROUND : on)) set(x, y, t); } } };
    // A 2-wide road with an L-bend. Water and chasms get bridges; trees, rocks and walls are cut through.
    const road = (ax, ay, bx, by) => { let x = ax, y = ay; const st = () => { for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const t = get(x + a, y + b);
        if (t === TL.WATER || t === TL.CHASM) set(x + a, y + b, TL.BRIDGE); else if (t === TL.GROUND || CLEARABLE.includes(t)) set(x + a, y + b, TL.PATH); } };
      while (x !== bx) { st(); x += Math.sign(bx - x); } while (y !== by) { st(); y += Math.sign(by - y); } st(); };
    const clear = (cx, cy, r) => disc(cx, cy, r, TL.GROUND, CLEARABLE);
    // A wandering cave tunnel of radius r between two points.
    const tunnel = (ax, ay, bx, by, r, seed) => { const len = Math.hypot(bx - ax, by - ay), n = Math.ceil(len), px = -(by - ay) / len, py = (bx - ax) / len;
      for (let i = 0; i <= n; i++) { const t = i / n, wob = Math.sin(t * Math.PI * 2 + seed) * 3 * Math.sin(t * Math.PI); disc(ax + (bx - ax) * t + px * wob, ay + (by - ay) * t + py * wob, r, TL.GROUND, [TL.CLIFF, TL.ROCK]); } };
    const building = (x0, y0, x1, y1, style) => { if (x1 - x0 < 1 || y1 - y0 < 1) return; rect(x0, y0, x1, y1, TL.BUILDING); map.buildings.push({ x0, y0, x1, y1, style: style == null ? Math.floor(R() * 4) : style }); };
    const camp = (type, x, y, r, n) => { map.camps.push({ type, x, y, r, n }); };
    // A landing pad with your ship parked on it, nose north. You board at the ramp, behind the ship.
    const pad = (x0, y0, x1, y1, cx, cy) => { rect(x0, y0, x1, y1, TL.PAD); rect(cx - 3, cy - 2, cx + 3, cy + 2, TL.HULL);
      map.props.push({ type: 'ship', x: (cx + 0.5) * T, y: (cy + 0.5) * T });
      map.pad = { x0, y0, x1, y1, x: (cx + 0.5) * T, y: (cy + 0.5) * T, ramp: { x: (cx + 0.5) * T, y: (cy + 3.6) * T }, exit: { x: (cx + 0.5) * T, y: (cy + 4.6) * T } }; };
    // Drop buildings whose footprint was later overwritten, and turn their leftovers into pavement.
    const pruneBuildings = () => { map.buildings = map.buildings.filter(b => { let ok = true; for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (get(x, y) !== TL.BUILDING) ok = false;
      if (!ok) for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (get(x, y) === TL.BUILDING) set(x, y, TL.FLOOR); return ok; }); };
    // A relic: a lore stone to discover (see RELICS in defs.js). The ground around it is cleared so it can be reached.
    const relic = (id, x, y) => { clear(x, y, 1.6); map.props.push({ type: 'relic', id, x: x * T + 8, y: y * T + 8 }); };
    // Resource nodes to gather (see MATERIALS in defs.js), on open ground with open ground around them.
    const open = (x, y) => { const t = get(x, y); return t === TL.GROUND || t === TL.PATH; };
    const nodes = (kind, n) => { let tries = 0; const taken = new Set(map.nodes.map(d => d.tx + ',' + d.ty));
      while (n > 0 && tries++ < 4000) { const x = 3 + Math.floor(R() * (w - 6)), y = 3 + Math.floor(R() * (h - 6));
        if (get(x, y) !== TL.GROUND || !open(x + 1, y) || !open(x - 1, y) || !open(x, y + 1) || !open(x, y - 1) || taken.has(x + ',' + y) || map.safe.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d)) continue;
        taken.add(x + ',' + y); map.nodes.push({ id: map.nodes.length, kind, tx: x, ty: y, x: x * T + 8, y: y * T + 8 }); n--; } };
    return { get, set, rect, frame, disc, blob, scatter, road, clear, tunnel, building, camp, pad, pruneBuildings, relic, nodes };
  }

  // ---------------------------------------------------------------- zones
  // Travel between zones is by ship: every zone has a landing pad (map.pad). There are no portals.
  const ZONES = {
    citadel: { name: 'The Citadel', sub: 'Sanctuary of the Society · weapons sheathed', biome: 'citadel', levels: null, w: 84, h: 96, seed: 1111, build(map, K, R) {
      const { w, h } = map, C = 68;   // the walled city fills the top 68 rows; the Hangar district lies beyond the south gate
      K.rect(0, 0, w - 1, h - 1, TL.GROUND);
      K.frame(0, 0, w - 1, C - 1, TL.WALL); K.frame(1, 1, w - 2, C - 2, TL.WALL);
      K.frame(2, 2, w - 3, C - 3, TL.FLOOR); K.frame(3, 3, w - 4, C - 4, TL.FLOOR);   // ring street inside the walls
      const district = (x0, y0, x1, y1) => {
        K.rect(x0, y0, x1, y1, TL.FLOOR);
        for (let by = y0; by + 3 <= y1; by += 9) for (let bx = x0; bx + 3 <= x1; bx += 11) {
          const ex = Math.min(bx + 8, x1), ey = Math.min(by + 6, y1), r = R(); if (ex - bx < 4 || ey - by < 3) continue;
          if (r < 0.68) { if (ex - bx >= 7 && R() < 0.45) { const mid = bx + Math.floor((ex - bx) / 2); K.building(bx + 1, by + 1, mid - 1, ey - 1); K.building(mid + 1, by + 1, ex - 1, ey - 1); } else K.building(bx + 1, by + 1, ex - 1, ey - 1); }
          else if (r < 0.84) { K.rect(bx, by, ex, ey, TL.GROUND); for (let y = by + 1; y < ey; y++) for (let x = bx + 1; x < ex; x++) if (R() < 0.32) K.set(x, y, TL.TREE); }
          else if (r < 0.95) { for (let y = by + 1; y < ey; y += 2) for (let x = bx + 1; x < ex; x += 2) if (R() < 0.75) K.set(x, y, TL.CRATE); }
          else { const cx = Math.floor((bx + ex) / 2), cy = Math.floor((by + ey) / 2); if (R() < 0.5) K.rect(cx, cy, cx + 1, cy, TL.WATER); else K.set(cx, cy, TL.PILLAR); }
        }
      };
      district(4, 4, 38, 30); district(45, 4, 79, 30); district(4, 37, 38, 63); district(45, 37, 79, 63);
      K.rect(39, 4, 44, C - 5, TL.FLOOR); K.rect(4, 31, w - 5, 36, TL.FLOOR);           // the two grand avenues
      // the Spire: palace grounds at the head of the north avenue
      K.rect(27, 4, 56, 19, TL.GROUND); K.pruneBuildings(); K.building(31, 5, 52, 12, 'palace'); K.rect(36, 13, 47, 19, TL.FLOOR);
      for (let y = 4; y <= 19; y++) for (let x = 27; x <= 56; x++) if (K.get(x, y) === TL.GROUND && (x < 35 || x > 48) && R() < 0.22) K.set(x, y, TL.TREE);
      K.disc(41.5, 33.5, 10, TL.FLOOR);                                                 // central plaza
      K.rect(41, 33, 42, 34, TL.PILLAR); map.props.push({ type: 'statue', x: 42 * T, y: 34 * T });
      for (const [px, py] of [[35, 27], [48, 27], [35, 40], [48, 40]]) K.rect(px - 1, py, px + 1, py + 1, TL.WATER);
      for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2, x = Math.floor(41.5 + Math.cos(a) * 9.4), y = Math.floor(33.5 + Math.sin(a) * 9.4); K.set(x, y, TL.PILLAR); map.props.push({ type: 'brazier', x: x * T + 8, y: y * T + 8 }); }
      for (let y = 21; y < C - 5; y += 4) if (Math.abs(y - 33.5) > 11) { K.set(39, y, TL.PILLAR); K.set(44, y, TL.PILLAR); }
      for (let x = 6; x < w - 5; x += 4) if (Math.abs(x - 41.5) > 11) { K.set(x, 31, TL.PILLAR); K.set(x, 36, TL.PILLAR); }
      K.pruneBuildings();
      // the Hangar district: the apron where your ship waits, hangars and workshops, and a training yard
      K.frame(0, C - 1, w - 1, h - 1, TL.WALL); K.frame(1, C, w - 2, h - 2, TL.WALL);
      K.rect(2, C + 1, w - 3, h - 3, TL.FLOOR);
      K.rect(40, C - 2, 43, C, TL.FLOOR);                                               // the south gate stands open
      K.frame(2, C + 2, 23, h - 3, TL.WALL); K.rect(3, C + 3, 22, h - 4, TL.GROUND); K.rect(23, C + 10, 23, C + 13, TL.FLOOR);
      K.camp('dummy', 12, C + 13, 5, 6);
      K.pad(28, C + 4, 55, h - 4, 41, C + 13);
      K.building(58, C + 3, 78, C + 9, 'hangar'); K.building(58, C + 13, 66, C + 18, 2); K.building(70, C + 13, 78, C + 18, 3);
      for (const [x, y] of [[58, C + 21], [59, C + 21], [58, C + 22], [77, C + 21], [78, C + 21], [78, C + 22]]) K.set(x, y, TL.CRATE);
      K.relic('spire', 29, 7); K.relic('ringwall', 80, 4); K.relic('c-hangar', 80, h - 5);
      map.safe.push([0, 0, w - 1, C - 1], [24, C - 1, w - 1, h - 1]);                  // the training yard is not a sanctuary
      map.spawn = { x: 42 * T, y: 46 * T };
    } },

    marches: { name: 'The Rust Marches', sub: 'Hostile territory', biome: 'mars', levels: '1–8', w: 170, h: 130, seed: 2026, build(map, K, R) {
      const { w, h } = map;
      K.rect(0, 0, w - 1, h - 1, TL.GROUND);
      K.blob(22, 20, 9, 6, TL.WATER, 1); K.blob(98, 82, 5, 3.5, TL.WATER, 2); K.blob(70, 36, 4, 3, TL.WATER, 3); K.blob(150, 112, 7, 5, TL.WATER, 7); K.blob(104, 120, 5, 3, TL.WATER, 8);
      K.scatter(900, () => R() < 0.76 ? TL.TREE : TL.ROCK);
      for (let i = 0; i < 30; i++) { const x0 = 76 + Math.floor(R() * 36), y0 = 12 + Math.floor(R() * 44), len = 3 + Math.floor(R() * 6), hz = R() < 0.5;
        for (let k = 0; k < len; k++) if (R() < 0.85) K.set(hz ? x0 + k : x0, hz ? y0 : y0 + k, TL.WALL); }
      // the waystation, with the landing pad just south of it
      K.rect(52, 75, 67, 87, TL.FLOOR); K.frame(52, 75, 67, 87, TL.WALL);
      K.rect(59, 75, 60, 75, TL.FLOOR); K.rect(52, 81, 52, 82, TL.FLOOR); K.rect(67, 81, 67, 82, TL.FLOOR); K.rect(58, 87, 61, 87, TL.FLOOR);
      for (const [x, y] of [[53, 76], [54, 76], [53, 77], [66, 76], [65, 76], [53, 86], [66, 86], [66, 85]]) K.set(x, y, TL.CRATE);
      // Rustwell: a Red mining town in the east, with the mine mouth to its north
      K.rect(134, 28, 158, 50, TL.GROUND); K.frame(134, 28, 158, 50, TL.WALL); K.rect(134, 37, 134, 39, TL.FLOOR); K.rect(145, 50, 147, 50, TL.FLOOR);
      K.rect(135, 36, 157, 39, TL.FLOOR); K.rect(143, 29, 144, 49, TL.FLOOR);
      K.building(136, 30, 141, 34, 0); K.building(146, 30, 151, 34, 1); K.building(136, 41, 141, 46, 2); K.building(148, 41, 155, 46, 3);
      for (const [x, y] of [[156, 30], [156, 31], [155, 30], [136, 48], [137, 48]]) K.set(x, y, TL.CRATE);
      K.blob(154, 19, 5, 4, TL.CLIFF, 4); map.props.push({ type: 'lantern', x: 144 * T, y: 36 * T }, { type: 'lantern', x: 144 * T, y: 40 * T + 8 }, { type: 'lantern', x: 150 * T, y: 26 * T });
      // Dustfields: a Brown farmstead in the south-west
      K.rect(10, 100, 40, 122, TL.GROUND); for (let y = 103; y <= 119; y += 2) K.rect(12, y, 29, y, TL.PATH);
      K.building(33, 101, 38, 105, 0); K.building(33, 111, 38, 114, 3);
      K.road(59, 74, 59, 48); K.road(59, 48, 20, 48); K.road(20, 48, 20, 70); K.road(20, 70, 15, 70); K.road(59, 48, 100, 48); K.road(100, 48, 100, 14);
      K.road(59, 48, 59, 2); K.road(59, 62, 40, 62); K.road(100, 48, 100, 66); K.road(100, 66, 104, 66); K.road(20, 48, 20, 32); K.road(20, 32, 33, 32);
      K.road(80, 48, 80, 57); K.road(100, 28, 90, 28); K.road(52, 81, 44, 81); K.road(67, 81, 76, 81);
      K.road(76, 81, 145, 81); K.road(145, 81, 145, 51); K.road(145, 81, 145, 114); K.road(44, 81, 31, 81); K.road(31, 81, 31, 99); K.road(60, 101, 60, 115); K.road(60, 115, 88, 115);
      K.camp('hound', 38, 64, 4, 7); K.camp('hound', 34, 27, 3, 5); K.camp('crawler', 22, 35, 4, 6); K.camp('crawler', 59, 15, 4, 6);
      K.camp('legion', 80, 59, 4, 6); K.camp('legion', 88, 27, 3, 5); K.camp('sharp', 105, 67, 3, 6); K.camp('obsidian', 15, 73, 4, 5);
      K.camp('gold', 96, 11, 1, 1); K.camp('legion', 92, 15, 3, 3);
      K.camp('bandit', 150, 66, 5, 7); K.camp('scavenger', 160, 12, 4, 6); K.camp('crawler', 126, 60, 4, 6); K.camp('hound', 160, 98, 4, 6);
      K.camp('bandit', 88, 118, 5, 6); K.camp('hound', 136, 122, 4, 6); K.camp('scavenger', 118, 100, 4, 5); K.camp('crawler', 50, 120, 4, 5);
      for (const c of map.camps) K.clear(c.x, c.y, c.r + 2);
      K.relic('m-lake', 9, 8); K.relic('m-dunes', 112, 86); K.relic('m-hollow', 40, 44); K.relic('m-ruin', 106, 22);
      K.relic('m-mine', 157, 25); K.relic('m-farm', 8, 124); K.relic('m-east', 165, 125);
      K.frame(0, 0, w - 1, h - 1, TL.TREE);
      K.pad(53, 88, 67, 100, 60, 93);
      map.safe.push([52, 75, 67, 87], [53, 88, 67, 100], [134, 28, 158, 50], [10, 100, 40, 122]);
      K.nodes('ember', 70); K.nodes('scrap', 25);
      map.spawn = { x: 60 * T, y: 80 * T };
    } },

    lykos: { name: 'The Mines of Lykos', sub: 'Deep tunnels · stay near the light', biome: 'mine', levels: '6–11', w: 140, h: 116, seed: 777, build(map, K, R) {
      const { w, h } = map;
      K.rect(0, 0, w - 1, h - 1, TL.CLIFF);
      const rooms = { camp: [50, 75, 6], A: [26, 62, 7], B: [74, 62, 7], C: [16, 40, 8], D: [50, 42, 10], E: [84, 38, 8], F: [28, 14, 8], G: [72, 13, 9],
        H: [114, 20, 9], I: [122, 56, 10], J: [108, 90, 8], Kd: [72, 104, 9], L: [22, 100, 8], N: [128, 100, 7], P: [50, 90, 8] };
      Object.values(rooms).forEach(([x, y, r], i) => K.blob(x, y, r, r * 0.8, TL.GROUND, i * 1.7));
      [['camp', 'A'], ['camp', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'D'], ['B', 'E'], ['C', 'F'], ['D', 'F'], ['D', 'G'], ['E', 'G'],
        ['G', 'H'], ['E', 'H'], ['E', 'I'], ['B', 'I'], ['I', 'J'], ['J', 'N'], ['I', 'N'], ['A', 'L'], ['P', 'Kd'], ['Kd', 'J'], ['L', 'Kd']].forEach(([a, b], i) =>
        K.tunnel(rooms[a][0], rooms[a][1], rooms[b][0], rooms[b][1], 1.8, i * 2.1));
      K.blob(50, 42, 4, 3, TL.CHASM, 9); K.blob(20, 44, 2.2, 1.8, TL.CHASM, 3); K.blob(86, 42, 2, 1.6, TL.CHASM, 5); K.blob(60, 60, 1.6, 1.4, TL.CHASM, 7);
      K.blob(126, 60, 4, 3, TL.WATER, 11); K.blob(118, 51, 2, 1.5, TL.WATER, 12); K.blob(74, 108, 2.5, 2, TL.CHASM, 13);
      for (let i = 0; i < 260; i++) { const x = Math.floor(R() * w), y = Math.floor(R() * h);
        if (K.get(x, y) === TL.GROUND && K.get(x + 1, y) === TL.GROUND && K.get(x - 1, y) === TL.GROUND && K.get(x, y + 1) === TL.GROUND && K.get(x, y - 1) === TL.GROUND) K.set(x, y, TL.ROCK); }
      K.road(50, 70, 50, 24); K.road(50, 24, 66, 24);   // the old rail line, bridged over the great chasm
      for (let y = 26; y <= 68; y += 7) map.props.push({ type: 'lantern', x: 49 * T, y: y * T + 8 });
      for (const k of ['H', 'I', 'J', 'Kd', 'L', 'N', 'P']) map.props.push({ type: 'lantern', x: rooms[k][0] * T - 24, y: rooms[k][1] * T });
      K.rect(45, 71, 55, 79, TL.FLOOR); K.rect(48, 80, 52, 83, TL.FLOOR);
      for (const [x, y] of [[45, 71], [46, 71], [55, 71], [55, 72], [45, 79], [55, 79]]) K.set(x, y, TL.CRATE);
      map.props.push({ type: 'lantern', x: 46 * T + 8, y: 74 * T }, { type: 'lantern', x: 54 * T + 8, y: 74 * T }, { type: 'lantern', x: 46 * T + 8, y: 78 * T }, { type: 'lantern', x: 54 * T + 8, y: 78 * T });
      // Deepwell: a refuge where cut-off miners hold out
      K.rect(103, 87, 113, 93, TL.FLOOR); for (const [x, y] of [[103, 87], [104, 87], [113, 93]]) K.set(x, y, TL.CRATE);
      map.props.push({ type: 'lantern', x: 104 * T, y: 90 * T }, { type: 'lantern', x: 112 * T, y: 90 * T });
      K.camp('pitviper', 26, 62, 4, 7); K.camp('drone', 74, 62, 4, 6); K.camp('enforcer', 16, 38, 4, 6); K.camp('pitviper', 43, 46, 3, 4); K.camp('drone', 56, 44, 3, 4);
      K.camp('enforcer', 84, 36, 3, 5); K.camp('drone', 82, 32, 2, 2); K.camp('pitviper', 28, 14, 4, 8); K.camp('warden', 72, 11, 1, 1); K.camp('enforcer', 70, 17, 2, 3);
      K.camp('burrower', 22, 100, 4, 7); K.camp('drone', 114, 20, 4, 5); K.camp('sentry', 124, 52, 3, 3); K.camp('pitviper', 128, 100, 4, 6); K.camp('enforcer', 70, 102, 4, 6); K.camp('burrower', 118, 62, 3, 5);
      K.relic('l-nest', 24, 11); K.relic('l-gallery', 78, 10); K.relic('l-sump', 88, 41); K.relic('l-shaft', 21, 65);
      K.relic('l-grotto', 118, 15); K.relic('l-flood', 130, 54); K.relic('l-drill', 78, 106);
      K.frame(0, 0, w - 1, h - 1, TL.CLIFF);
      K.pad(43, 84, 57, 97, 50, 89);
      map.safe.push([45, 71, 55, 79], [43, 80, 57, 97], [103, 87, 113, 93]);
      K.nodes('ore', 50); K.nodes('crystal', 35);
      map.spawn = { x: 50 * T + 8, y: 75 * T };
    } },

    highlands: { name: 'The Institute Highlands', sub: 'Rival Houses hold the valley', biome: 'green', levels: '9–15', w: 170, h: 130, seed: 4242, build(map, K, R) {
      const { w, h } = map;
      K.rect(0, 0, w - 1, h - 1, TL.GROUND);
      for (let y = 0; y < h; y++) { const cx = 82 + Math.sin(y * 0.11) * 7 + Math.sin(y * 0.041 + 1) * 5; for (let x = Math.floor(cx - 1.8); x <= Math.ceil(cx + 1.8); x++) K.set(x, y, TL.WATER); }
      K.blob(30, 84, 5, 3, TL.WATER, 4); K.blob(12, 24, 4, 3, TL.WATER, 6); K.blob(146, 40, 13, 8, TL.WATER, 11);
      for (let y = 0; y < h; y++) { const d = 3 + Math.floor(2.5 + 2.5 * Math.sin(y * 0.2) + 1.5 * Math.sin(y * 0.07)); for (let x = 0; x < d; x++) K.set(x, y, TL.CLIFF); }
      for (let x = 0; x < w; x++) { const d = 3 + Math.floor(2 + 2 * Math.sin(x * 0.17) + 1.5 * Math.sin(x * 0.05)); for (let y = 0; y < d; y++) K.set(x, y, TL.CLIFF); }
      for (let i = 0; i < 14; i++) { let x = 10 + Math.floor(R() * (w - 20)), y = 10 + Math.floor(R() * (h - 22)); for (let k = 0; k < 14; k++) { K.rect(x, y, x + 1, y + 1, TL.CLIFF); x += Math.floor(R() * 3) - 1; y += Math.floor(R() * 3) - 1; } }
      K.scatter(1250, () => R() < 0.9 ? TL.TREE : TL.ROCK);
      // the rival Primus's keep
      K.rect(44, 6, 68, 22, TL.FLOOR); K.frame(44, 6, 68, 22, TL.WALL); K.rect(55, 22, 57, 22, TL.FLOOR); K.building(50, 8, 62, 12, 'hall');
      for (const [x, y] of [[44, 6], [68, 6], [44, 22], [68, 22]]) K.rect(x - 1, y - 1, x + 1, y + 1, TL.WALL);
      for (const [cx, cy] of [[106, 49], [106, 73], [34, 36]]) for (let i = 0; i < 4; i++) { const x0 = cx - 5 + Math.floor(R() * 10), y0 = cy - 5 + Math.floor(R() * 10), hz = R() < 0.5; for (let k = 0; k < 4; k++) K.set(hz ? x0 + k : x0, hz ? y0 : y0 + k, TL.WALL); }
      // old Institute watchtowers in the south
      for (const [cx, cy] of [[38, 114], [60, 121], [100, 117]]) { K.clear(cx, cy, 5); K.frame(cx - 3, cy - 3, cx + 3, cy + 3, TL.WALL); K.rect(cx, cy + 3, cx, cy + 3, TL.GROUND); K.rect(cx - 3, cy, cx - 3, cy, TL.GROUND); }
      // Brushwood: a retreat of painters and poets on the east shore
      K.rect(122, 82, 140, 96, TL.GROUND); K.building(124, 83, 129, 86, 1); K.building(133, 83, 138, 86, 2); K.building(125, 91, 130, 94, 0); K.building(134, 91, 139, 94, 3); K.rect(122, 88, 140, 89, TL.FLOOR);
      // a Blue's skiff, crashed in the south-east
      K.clear(154, 107, 5); for (let k = 0; k < 9; k++) K.set(150 + k, 110 + (k % 3 === 0 ? 1 : 0), TL.WALL); K.set(156, 108, TL.WALL); K.set(152, 107, TL.CRATE);
      K.rect(49, 78, 63, 88, TL.FLOOR); K.frame(49, 78, 63, 88, TL.WALL); K.rect(55, 78, 57, 78, TL.FLOOR); K.rect(55, 88, 57, 88, TL.FLOOR);
      for (const [x, y] of [[50, 79], [51, 79], [62, 79], [62, 80], [50, 87], [62, 87]]) K.set(x, y, TL.CRATE);
      K.road(56, 77, 56, 58); K.road(56, 58, 22, 58); K.road(22, 58, 22, 44); K.road(22, 58, 22, 74); K.road(56, 58, 104, 58); K.road(104, 58, 104, 49); K.road(104, 58, 104, 72);
      K.road(56, 58, 56, 23); K.road(56, 38, 33, 38); K.road(56, 33, 100, 33); K.road(100, 33, 100, 2);
      K.road(104, 58, 140, 58); K.road(140, 58, 140, 81); K.road(140, 58, 162, 58); K.road(56, 102, 56, 118); K.road(56, 118, 38, 118); K.road(56, 118, 100, 118); K.road(140, 97, 140, 106); K.road(140, 106, 152, 106);
      K.camp('wolf', 20, 44, 4, 6); K.camp('wolf', 22, 74, 4, 6); K.camp('raider', 32, 36, 4, 6); K.camp('raider', 100, 31, 4, 6);
      K.camp('javelin', 106, 49, 4, 6); K.camp('javelin', 106, 73, 3, 5); K.camp('primus', 56, 15, 1, 1); K.camp('raider', 56, 19, 2, 3);
      K.camp('hunter', 140, 70, 5, 6); K.camp('wolf', 150, 14, 5, 7); K.camp('raider', 160, 64, 4, 6); K.camp('javelin', 44, 108, 4, 6); K.camp('wolf', 100, 108, 5, 7); K.camp('hunter', 162, 120, 4, 5);
      for (const c of map.camps) if (c.type !== 'primus' && !(c.type === 'raider' && c.y === 19)) K.clear(c.x, c.y, c.r + 2);
      K.relic('h-pond', 17, 31); K.relic('h-summit', 112, 12); K.relic('h-ford', 108, 86); K.relic('h-keep', 46, 20);
      K.relic('h-lake', 128, 28); K.relic('h-tower', 38, 114); K.relic('h-skiff', 157, 104);
      K.frame(0, 0, w - 1, h - 1, TL.CLIFF);
      K.pad(49, 89, 63, 101, 56, 94);
      map.safe.push([49, 78, 63, 88], [49, 89, 63, 101], [122, 82, 140, 96]);
      K.nodes('sage', 70);
      map.spawn = { x: 56 * T, y: 83 * T };
    } },

    barrens: { name: 'The Glass Barrens', sub: 'Dunes of fused glass · water is life', biome: 'glass', levels: '12–17', w: 190, h: 150, seed: 5150, build(map, K, R) {
      const { w, h } = map;
      K.rect(0, 0, w - 1, h - 1, TL.GROUND);
      const keepOut = [[75, 60, 14], [75, 108, 22], [166, 81, 16], [126, 20, 16]];
      for (let i = 0; i < 30; i++) { const x = 8 + Math.floor(R() * (w - 16)), y = 8 + Math.floor(R() * (h - 16)); if (keepOut.some(([a, b, r]) => Math.hypot(x - a, y - b) < r)) continue; K.blob(x, y, 3 + R() * 6, 2.5 + R() * 4, TL.CLIFF, i * 1.3); }
      K.blob(40, 30, 5, 4, TL.WATER, 1); K.blob(108, 84, 6, 4, TL.WATER, 2); K.blob(20, 72, 4, 3, TL.WATER, 3);
      K.scatter(820, () => R() < 0.5 ? TL.ROCK : TL.TREE);
      // the Iron Legate's fort
      K.rect(112, 8, 140, 30, TL.FLOOR); K.frame(112, 8, 140, 30, TL.WALL); K.rect(125, 30, 127, 30, TL.FLOOR); K.building(118, 11, 134, 16, 'hall');
      for (const [x, y] of [[112, 8], [140, 8], [112, 30], [140, 30]]) K.rect(x - 1, y - 1, x + 1, y + 1, TL.WALL);
      // a wrecked warship half-buried in the dunes
      for (let k = 0; k < 18; k++) { const x = 56 + k, y = 40 + Math.floor(k * 0.5); if (k % 5 !== 2) { K.set(x, y, TL.WALL); K.set(x, y + 4, TL.WALL); } }
      // the Caravanserai: a walled trading post in the east
      K.rect(155, 72, 177, 90, TL.FLOOR); K.frame(155, 72, 177, 90, TL.WALL); K.rect(155, 80, 155, 82, TL.FLOOR); K.rect(165, 90, 167, 90, TL.FLOOR);
      K.building(158, 74, 163, 77, 0); K.building(169, 74, 175, 77, 1); K.building(158, 85, 163, 88, 2); K.building(169, 85, 175, 88, 3); K.blob(166, 81, 2, 1.5, TL.WATER, 5);
      K.rect(68, 102, 82, 113, TL.FLOOR); K.frame(68, 102, 82, 113, TL.WALL); K.rect(74, 102, 76, 102, TL.FLOOR); K.rect(74, 113, 76, 113, TL.FLOOR);
      for (const [x, y] of [[69, 103], [70, 103], [69, 104], [81, 103], [81, 104], [69, 112], [81, 112]]) K.set(x, y, TL.CRATE);
      K.road(75, 101, 75, 60); K.road(75, 60, 25, 60); K.road(25, 60, 25, 88); K.road(25, 60, 25, 44); K.road(75, 60, 126, 60); K.road(126, 60, 126, 31);
      K.road(75, 60, 75, 26); K.road(75, 40, 34, 40); K.road(34, 40, 34, 22); K.road(100, 60, 100, 72); K.road(100, 72, 112, 72); K.road(112, 72, 112, 92);
      K.road(126, 60, 150, 60); K.road(150, 60, 150, 81); K.road(150, 81, 154, 81); K.road(166, 91, 166, 126); K.road(75, 128, 75, 138); K.road(75, 138, 120, 138); K.road(75, 138, 36, 138);
      K.camp('scorpion', 40, 86, 5, 7); K.camp('scorpion', 112, 96, 5, 6); K.camp('dune', 25, 44, 5, 7); K.camp('dune', 75, 24, 4, 6);
      K.camp('skimmer', 100, 76, 4, 6); K.camp('skimmer', 32, 20, 4, 5); K.camp('iron', 126, 38, 4, 6); K.camp('iron', 120, 24, 3, 4); K.camp('legate', 130, 21, 1, 1);
      K.camp('scorpion', 176, 40, 5, 6); K.camp('dune', 120, 134, 5, 7); K.camp('skimmer', 182, 112, 4, 5); K.camp('iron', 36, 134, 4, 6); K.camp('duneworm', 160, 134, 6, 5); K.camp('duneworm', 134, 104, 5, 4);
      for (const c of map.camps) if (c.y > 31 || c.x < 110) K.clear(c.x, c.y, c.r + 2);
      K.relic('b-oasis', 6, 6); K.relic('b-wreck', 64, 44); K.relic('b-edge', 144, 50); K.relic('b-south', 12, 112); K.relic('b-far', 143, 112);
      K.relic('b-caravan', 184, 75); K.relic('b-worm', 172, 145); K.relic('b-canyon', 100, 146);
      K.frame(0, 0, w - 1, h - 1, TL.CLIFF);
      K.pad(68, 114, 82, 127, 75, 120);
      map.safe.push([68, 102, 82, 113], [68, 114, 82, 127], [155, 72, 177, 90]);
      K.nodes('sunglass', 80); K.nodes('scrap', 20);
      map.spawn = { x: 75.5 * T, y: 107 * T };
    } },

    frost: { name: 'The Frost Reaches', sub: 'The pole remembers every footstep', biome: 'ice', levels: '16–21', w: 190, h: 150, seed: 9001, build(map, K, R) {
      const { w, h } = map;
      K.rect(0, 0, w - 1, h - 1, TL.GROUND);
      for (let y = 0; y < h; y++) { const x0 = 172 + Math.floor(4 * Math.sin(y * 0.09) + 3 * Math.sin(y * 0.031 + 2)); for (let x = x0; x < w; x++) K.set(x, y, TL.WATER); }
      K.blob(40, 46, 11, 7, TL.ICE, 1); K.blob(100, 74, 13, 8, TL.ICE, 2); K.blob(44, 47, 2.5, 2, TL.WATER, 3); K.blob(94, 72, 3, 2, TL.WATER, 4); K.blob(120, 132, 12, 7, TL.ICE, 5); K.blob(126, 131, 2, 1.6, TL.WATER, 6);
      for (let i = 0; i < 20; i++) { let x = 10 + Math.floor(R() * (w - 40)), y = 10 + Math.floor(R() * (h - 20)); if (Math.hypot(x - 75, y - 112) < 20 || Math.hypot(x - 150, y - 102) < 16) continue; for (let k = 0; k < 18; k++) { K.rect(x, y, x + 1, y + 1, TL.CLIFF); x += Math.floor(R() * 3) - 1; y += Math.floor(R() * 3) - 1; } }
      K.scatter(1000, () => R() < 0.82 ? TL.TREE : TL.ROCK);
      // an Obsidian clan village: longhouses around fire pits
      for (const [x0, y0] of [[14, 12], [28, 10], [18, 24], [36, 20]]) { K.rect(x0 - 1, y0 - 1, x0 + 9, y0 + 4, TL.GROUND); K.building(x0, y0, x0 + 8, y0 + 3, 'longhouse'); }
      for (const [x, y] of [[26, 18], [34, 28], [12, 30]]) { K.clear(x, y, 2); map.props.push({ type: 'firepit', x: x * T + 8, y: y * T + 8 }); }
      // the Frost Jarl's hall behind a palisade
      K.rect(92, 6, 120, 30, TL.FLOOR); K.frame(92, 6, 120, 30, TL.WALL); K.rect(105, 30, 107, 30, TL.FLOOR); K.building(96, 9, 116, 14, 'longhouse');
      map.props.push({ type: 'firepit', x: 100 * T + 8, y: 20 * T + 8 }, { type: 'firepit', x: 112 * T + 8, y: 20 * T + 8 });
      // the Pale Clan's hold: Obsidians who chose the south, and welcome travelers
      K.rect(138, 92, 162, 112, TL.GROUND); K.frame(138, 92, 162, 112, TL.WALL); K.rect(138, 101, 138, 103, TL.GROUND); K.rect(149, 92, 151, 92, TL.GROUND);
      K.building(141, 94, 148, 97, 'longhouse'); K.building(152, 94, 159, 97, 'longhouse'); K.building(141, 107, 148, 110, 'longhouse');
      map.props.push({ type: 'firepit', x: 155 * T + 8, y: 107 * T + 8 });
      K.rect(68, 102, 82, 113, TL.FLOOR); K.frame(68, 102, 82, 113, TL.WALL); K.rect(74, 102, 76, 102, TL.FLOOR); K.rect(74, 113, 76, 113, TL.FLOOR);
      for (const [x, y] of [[69, 103], [70, 103], [81, 103], [81, 104], [69, 112], [81, 112]]) K.set(x, y, TL.CRATE);
      map.props.push({ type: 'firepit', x: 72 * T + 8, y: 108 * T + 8 });
      K.road(75, 101, 75, 60); K.road(75, 60, 28, 60); K.road(28, 60, 28, 32); K.road(28, 60, 28, 90); K.road(75, 60, 118, 60); K.road(106, 60, 106, 31);
      K.road(75, 60, 75, 34); K.road(75, 34, 55, 34); K.road(118, 60, 118, 96); K.road(118, 102, 137, 102); K.road(118, 96, 118, 102);
      K.road(106, 60, 150, 60); K.road(150, 60, 150, 40); K.road(150, 60, 150, 91); K.road(75, 128, 75, 138); K.road(75, 138, 40, 138); K.road(75, 138, 110, 138);
      K.camp('frostwolf', 30, 74, 5, 7); K.camp('frostwolf', 118, 96, 5, 6); K.camp('clansman', 28, 34, 5, 7); K.camp('clansman', 80, 40, 4, 6);
      K.camp('thrower', 55, 30, 4, 6); K.camp('thrower', 120, 46, 4, 5); K.camp('wyrm', 102, 76, 5, 5); K.camp('wyrm', 38, 50, 4, 4);
      K.camp('jarl', 106, 22, 1, 1); K.camp('clansman', 100, 25, 3, 4);
      K.camp('berserker', 150, 28, 4, 5); K.camp('frostwolf', 162, 64, 5, 6); K.camp('wyrm', 116, 132, 5, 5); K.camp('clansman', 40, 136, 5, 6); K.camp('thrower', 100, 142, 4, 5); K.camp('berserker', 160, 130, 4, 4);
      for (const c of map.camps) if (!(c.x >= 92 && c.x <= 120 && c.y <= 30)) K.clear(c.x, c.y, c.r + 2); // not inside the Jarl's palisade
      K.relic('f-north', 8, 8); K.relic('f-shore', 122, 8); K.relic('f-lake', 70, 62); K.relic('f-drift', 8, 112); K.relic('f-cairn', 118, 112);
      K.relic('f-glacier', 160, 12); K.relic('f-hold', 158, 104); K.relic('f-south', 60, 145);
      K.frame(0, 0, w - 1, h - 1, TL.CLIFF);
      K.pad(68, 114, 82, 127, 75, 120);
      map.safe.push([68, 102, 82, 113], [68, 114, 82, 127], [138, 92, 162, 112]);
      K.nodes('frostite', 80);
      map.spawn = { x: 75.5 * T, y: 107 * T };
    } },
  };

  function load(id) {
    const Z = ZONES[id], map = { id, name: Z.name, sub: Z.sub, biome: Z.biome, levels: Z.levels, w: Z.w, h: Z.h, M: new Uint8Array(Z.w * Z.h), safe: [], buildings: [], props: [], camps: [], nodes: [], spawn: null, pad: null };
    const R = rng(Z.seed); Z.build(map, kit(map, R), R); return map;
  }
  function tile(map, tx, ty) { return tx < 0 || ty < 0 || tx >= map.w || ty >= map.h ? -1 : map.M[ty * map.w + tx]; }
  function solid(map, tx, ty) { const t = tile(map, tx, ty); return t < 0 || !!SOLID[t]; }
  function blocksShot(map, x, y) { const t = tile(map, Math.floor(x / T), Math.floor(y / T)); return t < 0 || !!SHOT_BLOCK[t]; }
  function blocked(map, x, y, r) { return solid(map, Math.floor((x - r) / T), Math.floor((y - r) / T)) || solid(map, Math.floor((x + r) / T), Math.floor((y - r) / T)) || solid(map, Math.floor((x - r) / T), Math.floor((y + r) / T)) || solid(map, Math.floor((x + r) / T), Math.floor((y + r) / T)); }
  // Moves in small substeps so fast dashes and knockbacks can't tunnel through one-tile walls.
  function moveBy(map, e, dx, dy) { const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6)), sx = dx / n, sy = dy / n;
    for (let i = 0; i < n; i++) { if (sx && !blocked(map, e.x + sx, e.y, e.r)) e.x += sx; if (sy && !blocked(map, e.x, e.y + sy, e.r)) e.y += sy; } }
  function inSafe(map, x, y) { const tx = x / T, ty = y / T; return map.safe.some(([x0, y0, x1, y1]) => tx > x0 && tx < x1 + 1 && ty > y0 && ty < y1 + 1); }
  const BOARD_RANGE = 56; // how close to your ship's ramp you must stand to fly
  return { T, TL, ZONES, START_ZONE: 'citadel', BOARD_RANGE, load, tile, solid, blocksShot, blocked, moveBy, inSafe };
});
