// Shared game definitions: the player (always a Gold), abilities, Houses, monsters, quests, townsfolk, leveling.
// Used by the server (require) and the client (<script>), so both sides agree on every number.
// Map layout (zones, camps, landing pads, resource nodes) lives in shared/map.js.
(function (root, factory) { const m = factory(); if (typeof module !== 'undefined' && module.exports) module.exports = m; else root.SHARED_DEFS = m; })(this, function () {
  // Every player is a Gold. Other Colors live in the world as townsfolk and enemies.
  const PLAYER = { hp: 120, hpPerLevel: 14, dmg: 20, dmgPerLevel: 0.08, spd: 88, r: 5 };

  // Ability bar, in display order. `cd` is seconds. Ranges are pixels.
  const ABILITIES = {
    razor: { name: 'Razor',      key: 'LMB',   cd: 0.45, range: 30, arc: 2.4, mult: 1.0, knock: 90, desc: 'A fast slash across everything in front of you.' },
    whip:  { name: 'Razor Whip', key: 'RMB',   cd: 1.0,  range: 92, width: 7, mult: 0.8, pull: 190, stun: 0.4, desc: 'Your razor uncoils into a whip. Hits a long line, stuns, and yanks enemies toward you. Stuns break shields.' },
    fist:  { name: 'Pulse Fist', key: 'Q',     cd: 6.0,  radius: 64, offset: 16, mult: 1.6, knock: 440, stun: 0.7, desc: 'A gravity blast that throws every nearby enemy away. Enemies slammed into walls take extra damage. Ignores shields.' },
    dash:  { name: 'Dash',       key: 'SPACE', cd: 1.6,  speed: 380, time: 0.2, inv: 0.3, desc: 'Burst in your moving direction. Nothing can touch you mid-dash.' },
    parry: { name: 'Parry',      key: 'SHIFT', cd: 0.6,  window: 0.25, desc: 'Time it as a red wind-up fills to stun the attacker. Deflects bolts and javelins back at the thrower.' },
  };
  const AB_ORDER = ['razor', 'whip', 'fist', 'dash', 'parry'];
  const STUN_BONUS = 1.75; // damage multiplier against stunned enemies

  // Institute Houses: cosmetic for now (cloak color). Names are the Roman gods.
  const HOUSES = [
    { id: 'mars', name: 'Mars', color: '#b3261e', trait: 'War' },       { id: 'minerva', name: 'Minerva', color: '#3f6fb0', trait: 'Wisdom' },
    { id: 'apollo', name: 'Apollo', color: '#e39a2d', trait: 'Radiance' }, { id: 'diana', name: 'Diana', color: '#3d8a58', trait: 'The Hunt' },
    { id: 'jupiter', name: 'Jupiter', color: '#6a45a8', trait: 'Command' }, { id: 'juno', name: 'Juno', color: '#b8577f', trait: 'Loyalty' },
    { id: 'ceres', name: 'Ceres', color: '#8c9c34', trait: 'Harvest' },    { id: 'mercury', name: 'Mercury', color: '#2f9fb3', trait: 'Cunning' },
    { id: 'vulcan', name: 'Vulcan', color: '#a4502a', trait: 'The Forge' }, { id: 'venus', name: 'Venus', color: '#df7fa3', trait: 'Beauty' },
    { id: 'bacchus', name: 'Bacchus', color: '#7c2a5c', trait: 'Revelry' }, { id: 'pluto', name: 'Pluto', color: '#34343f', trait: 'The Deep' },
  ];
  const HAIR_STYLES = ['Cropped', 'Mane', 'Braid', 'Crest'];
  const HAIR_TONES = ['#f7e09a', '#ecc251', '#d49c2c', '#b07424'];
  const DEFAULT_LOOK = { house: 'mars', hair: 0, tone: 1 };
  // Returns a clean look object, or null if anything is invalid.
  function validLook(l) {
    if (!l || typeof l !== 'object' || !HOUSES.some(h => h.id === l.house)) return null;
    if (!Number.isInteger(l.hair) || l.hair < 0 || l.hair >= HAIR_STYLES.length) return null;
    if (!Number.isInteger(l.tone) || l.tone < 0 || l.tone >= HAIR_TONES.length) return null;
    return { house: l.house, hair: l.hair, tone: l.tone };
  }

  // Monsters. lvl is for display and difficulty color. kb = knockback taken.
  // Behaviors: ranged (keeps distance, fires `shot` kind: 0 bolt, 1 spark, 2 javelin) · aoe (telegraphed circle slam)
  //            combo (chains strikes) · lunge (leaps forward px while striking) · guard (damage multiplier from the front unless stunned).
  const MOBS = {
    // The Rust Marches
    hound:    { name: 'Ash Hound',           lvl: 2,  hp: 40,   dmg: 8,  spd: 74, xp: 12,   reach: 12, wind: 0.40, cd: 1.2, aggro: 90,  leash: 170, r: 5, kb: 1.2 },
    crawler:  { name: 'Dust Crawler',        lvl: 3,  hp: 70,   dmg: 12, spd: 58, xp: 22,   reach: 14, wind: 0.55, cd: 1.5, aggro: 90,  leash: 170, r: 6, kb: 0.9, lunge: 26 },
    legion:   { name: 'Bellona Legionnaire', lvl: 4,  hp: 95,   dmg: 14, spd: 56, xp: 30,   reach: 16, wind: 0.50, cd: 1.4, aggro: 100, leash: 180, r: 5, kb: 1 },
    sharp:    { name: 'Gray Sharpshooter',   lvl: 5,  hp: 70,   dmg: 12, spd: 52, xp: 34,   reach: 150, keep: 80, wind: 0.75, cd: 1.9, aggro: 150, leash: 210, r: 5, kb: 1, ranged: true, bolt: 230, shot: 0 },
    obsidian: { name: 'Obsidian Brute',      lvl: 6,  hp: 260,  dmg: 28, spd: 46, xp: 70,   reach: 20, slam: 30, slamOff: 12, wind: 0.85, cd: 2.0, aggro: 110, leash: 180, r: 7, kb: 0.45, aoe: true },
    gold:     { name: 'The Rogue Gold',      lvl: 8,  hp: 520,  dmg: 22, spd: 70, xp: 200,  reach: 20, wind: 0.36, cd: 1.1, aggro: 120, leash: 200, r: 6, kb: 0.3, elite: true, combo: 2 },
    // The Mines of Lykos
    pitviper: { name: 'Pitviper',            lvl: 7,  hp: 95,   dmg: 16, spd: 84, xp: 50,   reach: 14, wind: 0.45, cd: 1.3, aggro: 110, leash: 190, r: 5, kb: 1.1, lunge: 34 },
    drone:    { name: 'Drill Drone',         lvl: 8,  hp: 120,  dmg: 17, spd: 62, xp: 75,   reach: 140, keep: 80, wind: 0.6, cd: 1.5, aggro: 140, leash: 200, r: 5, kb: 1.3, ranged: true, bolt: 260, shot: 1 },
    enforcer: { name: 'Gray Enforcer',       lvl: 9,  hp: 250,  dmg: 22, spd: 54, xp: 90,   reach: 18, wind: 0.6, cd: 1.5, aggro: 100, leash: 180, r: 6, kb: 0.6, guard: 0.2 },
    warden:   { name: 'The Mine Warden',     lvl: 11, hp: 1600, dmg: 34, spd: 50, xp: 700,  reach: 24, slam: 38, slamOff: 14, wind: 0.75, cd: 1.4, aggro: 130, leash: 220, r: 9, kb: 0.15, elite: true, aoe: true, combo: 2 },
    // The Institute Highlands
    wolf:     { name: 'Highland Wolf',       lvl: 10, hp: 160,  dmg: 20, spd: 92, xp: 105,  reach: 14, wind: 0.42, cd: 1.2, aggro: 120, leash: 200, r: 5, kb: 1, lunge: 40 },
    raider:   { name: 'House Raider',        lvl: 11, hp: 290,  dmg: 26, spd: 72, xp: 150,  reach: 20, wind: 0.45, cd: 1.2, aggro: 110, leash: 190, r: 6, kb: 0.7, combo: 2, lunge: 20 },
    javelin:  { name: 'Javelineer',          lvl: 12, hp: 190,  dmg: 26, spd: 60, xp: 145,  reach: 170, keep: 90, wind: 0.8, cd: 2.0, aggro: 160, leash: 220, r: 5, kb: 1, ranged: true, bolt: 250, shot: 2 },
    primus:   { name: 'The Rival Primus',    lvl: 15, hp: 2800, dmg: 38, spd: 78, xp: 1500, reach: 22, wind: 0.38, cd: 1.0, aggro: 140, leash: 230, r: 7, kb: 0.15, elite: true, combo: 3, lunge: 30 },
    // The Glass Barrens
    scorpion: { name: 'Glass Scorpion',      lvl: 13, hp: 320,  dmg: 30, spd: 64, xp: 200,  reach: 18, wind: 0.55, cd: 1.4, aggro: 110, leash: 200, r: 8, kb: 0.6, lunge: 30 },
    dune:     { name: 'Dune Raider',         lvl: 14, hp: 360,  dmg: 32, spd: 74, xp: 230,  reach: 18, wind: 0.42, cd: 1.2, aggro: 120, leash: 200, r: 6, kb: 0.8, combo: 2 },
    skimmer:  { name: 'Sand Skimmer',        lvl: 14, hp: 260,  dmg: 30, spd: 70, xp: 220,  reach: 160, keep: 90, wind: 0.6, cd: 1.5, aggro: 150, leash: 220, r: 6, kb: 1.2, ranged: true, bolt: 280, shot: 1 },
    iron:     { name: 'Iron Legionnaire',    lvl: 15, hp: 560,  dmg: 36, spd: 56, xp: 280,  reach: 20, wind: 0.6, cd: 1.5, aggro: 110, leash: 190, r: 7, kb: 0.5, guard: 0.2, combo: 2 },
    legate:   { name: 'The Iron Legate',     lvl: 18, hp: 5200, dmg: 48, spd: 56, xp: 2600, reach: 26, slam: 42, slamOff: 16, wind: 0.7, cd: 1.3, aggro: 140, leash: 240, r: 10, kb: 0.1, elite: true, aoe: true, combo: 3 },
    // The Frost Reaches
    frostwolf:{ name: 'Frost Wolf',          lvl: 16, hp: 420,  dmg: 36, spd: 96, xp: 300,  reach: 16, wind: 0.40, cd: 1.1, aggro: 130, leash: 220, r: 6, kb: 0.9, lunge: 44 },
    clansman: { name: 'Obsidian Clansman',   lvl: 17, hp: 700,  dmg: 44, spd: 60, xp: 360,  reach: 22, slam: 32, slamOff: 12, wind: 0.75, cd: 1.8, aggro: 120, leash: 200, r: 8, kb: 0.45, aoe: true },
    thrower:  { name: 'Clan Spearthrower',   lvl: 17, hp: 480,  dmg: 40, spd: 60, xp: 340,  reach: 180, keep: 100, wind: 0.8, cd: 2.0, aggro: 170, leash: 230, r: 7, kb: 0.6, ranged: true, bolt: 270, shot: 2 },
    wyrm:     { name: 'Ice Wyrm',            lvl: 18, hp: 620,  dmg: 46, spd: 88, xp: 400,  reach: 20, wind: 0.5, cd: 1.4, aggro: 130, leash: 220, r: 8, kb: 0.5, lunge: 48 },
    // Added with the larger zones
    bandit:   { name: 'Rust Bandit',         lvl: 3,  hp: 75,   dmg: 11, spd: 66, xp: 20,   reach: 16, wind: 0.48, cd: 1.3, aggro: 100, leash: 180, r: 5, kb: 1, combo: 2 },
    scavenger:{ name: 'Scrap Drone',         lvl: 5,  hp: 80,   dmg: 12, spd: 60, xp: 32,   reach: 140, keep: 80, wind: 0.65, cd: 1.7, aggro: 140, leash: 200, r: 5, kb: 1.3, ranged: true, bolt: 240, shot: 1 },
    burrower: { name: 'Burrow Rat',          lvl: 7,  hp: 90,   dmg: 15, spd: 90, xp: 48,   reach: 12, wind: 0.38, cd: 1.1, aggro: 110, leash: 190, r: 5, kb: 1.2, lunge: 26 },
    sentry:   { name: 'Company Sentry',      lvl: 10, hp: 400,  dmg: 22, spd: 0,  xp: 120,  reach: 170, keep: 0, wind: 0.7, cd: 1.2, aggro: 170, leash: 400, r: 7, kb: 0, ranged: true, bolt: 300, shot: 1 },
    hunter:   { name: 'Rival Skirmisher',    lvl: 12, hp: 220,  dmg: 26, spd: 70, xp: 160,  reach: 160, keep: 90, wind: 0.7, cd: 1.7, aggro: 160, leash: 220, r: 5, kb: 1, ranged: true, bolt: 260, shot: 2 },
    duneworm: { name: 'Dune Worm',           lvl: 16, hp: 900,  dmg: 44, spd: 76, xp: 420,  reach: 22, wind: 0.55, cd: 1.5, aggro: 130, leash: 230, r: 10, kb: 0.3, lunge: 54 },
    berserker:{ name: 'Obsidian Berserker',  lvl: 19, hp: 900,  dmg: 50, spd: 74, xp: 480,  reach: 24, wind: 0.5, cd: 1.2, aggro: 130, leash: 220, r: 9, kb: 0.4, combo: 3 },
    dummy:    { name: 'Training Dummy',      lvl: 1,  hp: 2000, dmg: 0,  spd: 0,  xp: 0,    reach: 0, wind: 1, cd: 99, aggro: 0, leash: 0, r: 6, kb: 0, dummy: true },
    jarl:     { name: 'The Frost Jarl',      lvl: 21, hp: 8000, dmg: 58, spd: 70, xp: 4000, reach: 26, slam: 44, slamOff: 16, wind: 0.6, cd: 1.1, aggro: 150, leash: 250, r: 11, kb: 0.1, elite: true, aoe: true, combo: 3 },
  };
  // Bestiary entries, revealed in the menu once you have killed one.
  const LORE = {
    hound: 'Feral dogs bred for the ash storms. The ember glow along their spines never quite goes out.',
    crawler: 'Burrowing arthropods that wait under the dust and spring out when the ground trembles.',
    legion: 'Gray soldiers of a Bellona garrison that never received the order to stand down.',
    sharp: 'Gray marksmen who trust distance more than courage. A parried bolt teaches them otherwise.',
    obsidian: 'Deserters from the polar clans, twice the size of a Gold and half as patient.',
    gold: 'A Peerless who left the Society to rule a ruin. He fights like the Institute never ended.',
    pitviper: 'Blind tunnel serpents that hunt by tremor. They coil before they strike.',
    drone: 'Mining machines whose drills never learned to stop. Their sparks can be swatted from the air.',
    enforcer: 'Company muscle behind a slab of shield. Stun them, blast them, or get behind them.',
    warden: 'Something wears the old Mine Warden\'s armor and swings his maul in the dark.',
    wolf: 'Highland pack hunters that circle at the edge of reach, then leap.',
    raider: 'Students of rival Houses, still playing the Institute\'s game with real blades.',
    javelin: 'Rival students who learned to throw before they learned to lose.',
    primus: 'A Primus who took the old keep and refuses to give it back.',
    scorpion: 'Scorpions whose carapace fused with the glass of the dunes. Their leap cracks stone.',
    dune: 'Outcast raiders who live off the caravans that cross the Barrens.',
    skimmer: 'Survey drones gone feral in the heat, hunting anything that moves.',
    iron: 'Veterans of an old legion, shields up and spears forward, guarding a fort no one remembers.',
    legate: 'The commander of the lost fort. His maul has ended longer careers than yours.',
    frostwolf: 'White wolves of the pole, faster than any beast in the south.',
    clansman: 'Obsidian warriors of the ice clans. Every swing of their axes shakes the ground.',
    thrower: 'Clan hunters who can put a spear through a Gold at two hundred paces.',
    wyrm: 'Great serpents that swim beneath the frozen lakes and burst through the ice.',
    jarl: 'Lord of the ice clans. He has never lost a duel, and he has fought many.',
    bandit: 'Reds who fled the mines and found that robbing caravans pays better than digging.',
    scavenger: 'Salvage drones that decided living targets were easier to strip than wrecks.',
    burrower: 'Rats the size of hounds, grown fat on whatever falls into the lower galleries.',
    sentry: 'A Company gun emplacement that never received its shutdown order. It does not move and does not miss.',
    hunter: 'Rival students who fight from the tree line with thrown knives.',
    duneworm: 'A worm as long as a transport, swimming through sand the way a fish swims through water.',
    berserker: 'Clan warriors who fight bare-armed in the ice and do not stop until one of you falls.',
    dummy: 'A straw-stuffed post in the Hangar district. It will never hit back. It will also never thank you.',
  };
  // What each monster may drop (chance per kill, for every player who helped). Every kill also pays credits.
  const DROPS = {
    hound: { hide: 0.5 }, crawler: { hide: 0.35, ember: 0.25 }, legion: { scrap: 0.5 }, sharp: { scrap: 0.5 }, obsidian: { scrap: 0.4, hide: 0.4 }, gold: { core: 1 },
    bandit: { scrap: 0.35, ember: 0.35 }, scavenger: { scrap: 0.6 },
    pitviper: { hide: 0.5 }, drone: { crystal: 0.35, scrap: 0.35 }, enforcer: { scrap: 0.6 }, warden: { core: 1 }, burrower: { hide: 0.55 }, sentry: { crystal: 0.6, scrap: 0.6 },
    wolf: { hide: 0.6 }, raider: { scrap: 0.4, sage: 0.25 }, javelin: { scrap: 0.4 }, primus: { core: 1 }, hunter: { hide: 0.35, sage: 0.35 },
    scorpion: { sunglass: 0.4, hide: 0.3 }, dune: { scrap: 0.5 }, skimmer: { scrap: 0.4, crystal: 0.3 }, iron: { scrap: 0.6 }, legate: { core: 1 }, duneworm: { hide: 0.6, sunglass: 0.4 },
    frostwolf: { hide: 0.6 }, clansman: { frostite: 0.3, hide: 0.4 }, thrower: { hide: 0.4 }, wyrm: { frostite: 0.5 }, jarl: { core: 1 }, berserker: { frostite: 0.4, hide: 0.4 },
  };
  const creditsFor = (type) => Math.round(MOBS[type].xp * 0.5);

  // Materials: gathered from nodes out in the world, dropped by monsters, bought and sold with traders. Used for gear upgrades.
  const MATERIALS = {
    ember:    { name: 'Ember Salt',    color: '#e0603a', value: 4,   where: 'Glowing salt crusts across the Rust Marches.' },
    scrap:    { name: 'Iron Scrap',    color: '#9aa2ac', value: 5,   where: 'Salvaged from machines and soldiers, or dug out of old ruins.' },
    hide:     { name: 'Beast Hide',    color: '#a8744a', value: 5,   where: 'Taken from hounds, wolves, vipers and other beasts.' },
    ore:      { name: 'Helium Ore',    color: '#7fb8d8', value: 9,   where: 'Blue-veined rock in the tunnels of Lykos.' },
    crystal:  { name: 'Pulse Crystal', color: '#b08aff', value: 12,  where: 'Violet clusters deep in Lykos, and the cores of machines.' },
    sage:     { name: 'Valley Sage',   color: '#7ab85a', value: 14,  where: 'A hardy herb that grows wild across the Highlands.' },
    sunglass: { name: 'Sunglass',      color: '#8fd8e0', value: 20,  where: 'Fused glass shards of the Barrens, and scorpion shells.' },
    frostite: { name: 'Frostite',      color: '#bfe6ff', value: 28,  where: 'Frozen blue stone of the Frost Reaches.' },
    core:     { name: 'Champion Core', color: '#ffd24a', value: 120, where: 'Carried only by the champions of each land.' },
  };
  const NODE_MATERIAL = { ember: 'ember', scrap: 'scrap', ore: 'ore', crystal: 'crystal', sage: 'sage', sunglass: 'sunglass', frostite: 'frostite' };
  const GATHER = { range: 30, respawn: 60 };

  // Gear: four slots a smith can upgrade, ten ranks each. Higher ranks need materials from harder lands.
  const GEAR = {
    razor:    { name: 'Razor',          max: 10, desc: '+8% blade and whip damage per rank.' },
    armor:    { name: 'Armor',          max: 10, desc: '+10% maximum health per rank.' },
    gauntlet: { name: 'Pulse Gauntlet', max: 10, desc: '+10% pulse fist damage and -0.3s pulse fist cooldown per rank.' },
    boots:    { name: 'Grav Boots',     max: 10, desc: '+2% move speed and -0.08s dash cooldown per rank.' },
  };
  const GEAR_TIERS = [['ember', 'hide'], ['ore', 'crystal'], ['sage', 'hide'], ['sunglass', 'scrap'], ['frostite', 'core']];
  const GEAR_EXTRA = { razor: 'scrap', armor: 'hide', gauntlet: 'scrap', boots: 'ember' };
  // Cost to raise a slot from `rank` to rank + 1: { credits, mats: { material: count } }
  function gearCost(slot, rank) {
    const n = rank + 1, [a, b] = GEAR_TIERS[Math.floor(rank / 2)], mats = {};
    mats[a] = 4 + n * 2; mats[b] = (mats[b] || 0) + (b === 'core' ? n - 8 : 2 + n);
    if (rank < 8) { const x = GEAR_EXTRA[slot]; mats[x] = (mats[x] || 0) + 2 + rank; }
    return { credits: 40 * n * n, mats };
  }

  // Talents: one point per level after the first. Spend them anywhere; a trainer in the Citadel can reset them.
  const TALENTS = {
    might:     { name: 'Might',      max: 5, desc: '+4% damage per rank.' },
    vitality:  { name: 'Vitality',   max: 5, desc: '+6% maximum health per rank.' },
    swiftness: { name: 'Swiftness',  max: 5, desc: '+3% move speed per rank.' },
    reflexes:  { name: 'Reflexes',   max: 5, desc: '+0.04s parry window per rank.' },
    reach:     { name: 'Long Reach', max: 5, desc: '+3 px razor reach and +8 px whip reach per rank.' },
    shockwave: { name: 'Shockwave',  max: 5, desc: '+6 px pulse fist radius per rank.' },
    renewal:   { name: 'Renewal',    max: 5, desc: '2% of the damage you deal heals you, per rank.' },
    fortune:   { name: 'Fortune',    max: 5, desc: '+10% credits and material drops per rank.' },
  };
  const talentPoints = (level) => Math.max(0, level - 1);
  const respecCost = (level) => 50 * level;

  // Quests are handed out and turned in at a giver (a TOWNSFOLK id), who must be in your zone and within 60 px.
  const QUESTS = {
    // The Marshal at the Marches waystation
    hounds:    { giver: 'marshal',  name: 'Cull the Ash Hounds',     kill: 'hound',    count: 8,  xp: 120,  minLevel: 1, text: 'Hounds are dragging off our supply runners. Thin the packs north-west of the waystation.' },
    crawlers:  { giver: 'marshal',  name: 'Crawlers in the Flats',   kill: 'crawler',  count: 6,  xp: 220,  minLevel: 2, text: 'Dust crawlers burrow under the roads and wait. They lunge, so step aside and cut them as they land.' },
    legion:    { giver: 'marshal',  name: 'Break the Bellona Line',  kill: 'legion',   count: 6,  xp: 320,  minLevel: 3, text: 'Bellona legionnaires hold the eastern ruins. Push them out.' },
    sharp:     { giver: 'marshal',  name: 'Silence the Rifles',      kill: 'sharp',    count: 5,  xp: 380,  minLevel: 4, text: 'Gray marksmen nest in the far south-east. Parry their bolts back at them if you have the nerve.' },
    obsidian:  { giver: 'marshal',  name: 'The Southern Pits',       kill: 'obsidian', count: 4,  xp: 520,  minLevel: 5, text: 'Obsidian deserters camp in the pits to the south-west. Your fist will do more than your blade against that much muscle.' },
    // The Quartermaster in the Citadel: bounties on each zone\'s champion
    gold:      { giver: 'qm',       name: 'Bounty: The Rogue Gold',  kill: 'gold',     count: 1,  xp: 900,  minLevel: 6, text: 'A Peerless deserter haunts the north-east ruins of the Marches. Bring me his blade. Do not go alone.' },
    warden:    { giver: 'qm',       name: 'Bounty: The Mine Warden', kill: 'warden',   count: 1,  xp: 2200, minLevel: 9, text: 'Something wears the old warden\'s armor in the deepest gallery of Lykos. The miners will not dig until it is gone.' },
    primus:    { giver: 'qm',       name: 'Bounty: The Rival Primus', kill: 'primus',  count: 1,  xp: 4200, minLevel: 13, text: 'A rival Primus has taken the keep at the head of the Highlands valley. Take it back for the Society.' },
    // The Overseer at the Lykos camp
    vipers:    { giver: 'overseer', name: 'Nest of Vipers',          kill: 'pitviper', count: 10, xp: 900,  minLevel: 6, text: 'Pitvipers have moved into the western galleries. They strike from far away. Dash when they coil.' },
    drones:    { giver: 'overseer', name: 'Rogue Machinery',         kill: 'drone',    count: 8,  xp: 1100, minLevel: 7, text: 'Our drill drones stopped listening. Put them down before they bore through a support.' },
    enforcers: { giver: 'overseer', name: 'Shields of the Company',  kill: 'enforcer', count: 8,  xp: 1300, minLevel: 8, text: 'Company enforcers hold the side tunnels. Their shields stop a blade cold. Stun them with the whip or the fist, or get behind them.' },
    // The Herald at the Highlands camp
    wolves:    { giver: 'herald',   name: 'Wolves of the Valley',    kill: 'wolf',     count: 10, xp: 1700, minLevel: 9, text: 'The valley wolves hunt in packs and leap from far out. Keep your parry close.' },
    raiders:   { giver: 'herald',   name: 'Raid the Raiders',        kill: 'raider',   count: 8,  xp: 2100, minLevel: 10, text: 'Students of rival Houses raid our supply lines. Show them why House colors mean nothing in the field.' },
    javelins:  { giver: 'herald',   name: 'Break the Spear Line',    kill: 'javelin',  count: 8,  xp: 2300, minLevel: 11, text: 'Javelineers hold the eastern ridge past the river. A deflected javelin still counts as a kill.' },
    // Quaestor Nerva at the Barrens waystation
    scorpions: { giver: 'nerva',    name: 'Glass and Venom',         kill: 'scorpion', count: 10, xp: 3200, minLevel: 12, text: 'Glass scorpions nest in the southern dunes and the far south-east. Their leap can split a caravan in half.' },
    dunes:     { giver: 'nerva',    name: 'The Dune Raiders',        kill: 'dune',     count: 8,  xp: 3600, minLevel: 13, text: 'Raiders strike our caravans from the western flats and the north road. End their raids.' },
    skimmers:  { giver: 'nerva',    name: 'Clip the Skimmers',       kill: 'skimmer',  count: 8,  xp: 3800, minLevel: 14, text: 'Survey skimmers have turned hostile. Swat their sparks with your fist and cut them down.' },
    ironline:  { giver: 'nerva',    name: 'The Iron Line',           kill: 'iron',     count: 8,  xp: 4400, minLevel: 15, text: 'An old legion holds the fort in the north-east. Their shields will not break from the front.' },
    // Sigra at the Frost Reaches waystation
    frostwolves:{ giver: 'sigra',   name: 'White Hunters',           kill: 'frostwolf', count: 10, xp: 6000, minLevel: 16, text: 'The white wolves took two of my scouts this week. Take ten of theirs.' },
    clansmen:  { giver: 'sigra',    name: 'The Clans Stir',          kill: 'clansman', count: 8,  xp: 7000, minLevel: 17, text: 'The clans in the north-west village have chosen the Jarl over peace. Answer their axes.' },
    spears:    { giver: 'sigra',    name: 'Spears in the Snow',      kill: 'thrower',  count: 8,  xp: 7200, minLevel: 17, text: 'Spearthrowers watch every approach. Parry a spear and send it home.' },
    wyrms:     { giver: 'sigra',    name: 'Beneath the Ice',         kill: 'wyrm',     count: 6,  xp: 8000, minLevel: 18, text: 'Wyrms break through the frozen lakes. Watch the ice, and watch their lunge.' },
    bandits:   { giver: 'marshal',  name: 'Rust and Robbery',        kill: 'bandit',   count: 8,  xp: 260,  minLevel: 3, text: 'Bandits hit the Rustwell ore carts east of here, and now the farm road in the south. Teach them honest work.' },
    rats:      { giver: 'overseer', name: 'Vermin of the Deep',      kill: 'burrower', count: 10, xp: 1000, minLevel: 7, text: 'Burrow rats have overrun the south-west galleries. They are fast. You must be faster.' },
    skirmish:  { giver: 'herald',   name: 'The Tree Line',           kill: 'hunter',   count: 8,  xp: 2400, minLevel: 12, text: 'Skirmishers throw knives from the east woods and the southern towers. Close the distance.' },
    worms:     { giver: 'nerva',    name: 'What Swims in the Sand',  kill: 'duneworm', count: 5,  xp: 5200, minLevel: 16, text: 'Dune worms have swallowed two caravans near the Caravanserai. Watch the sand ripple, and step aside.' },
    berserk:   { giver: 'sigra',    name: 'The Unyielding',          kill: 'berserker', count: 6, xp: 9000, minLevel: 19, text: 'Berserkers roam the glacier and the far south. They do not retreat. Neither should you.' },
    legate:    { giver: 'qm',       name: 'Bounty: The Iron Legate', kill: 'legate',   count: 1,  xp: 9000, minLevel: 16, text: 'The Iron Legate holds a fort deep in the Glass Barrens, north of the Rust Marches. The Society wants his standard.' },
    jarl:      { giver: 'qm',       name: 'Bounty: The Frost Jarl',  kill: 'jarl',     count: 1,  xp: 14000, minLevel: 20, text: 'Beyond the Highlands lies the pole, and the Frost Jarl who rules it. Bring the Society his crown.' },
  };

  // Named townsfolk. Purely cosmetic and client-side (plus the quest-giver position check on the server).
  // Coordinates are tiles. `path` points must be connected by clear straight lines. The Citadel also gets ambient citizens.
  const TOWNSFOLK = [
    // The Citadel
    { id: 'qm', zone: 'citadel', name: 'Quartermaster Voss', color: 'gray', giver: true, path: [[46.5, 30]], face: 3.14, lines: ['Every Color in this city eats because someone like you goes out through those gates.'] },
    { id: 'archon', zone: 'citadel', name: 'Archon Serapha', color: 'gold', trainer: true, path: [[41.5, 17.5]], face: 1.57, lines: ['Talents are choices, and choices can be unmade. For a price.', 'The Spire has stood nine hundred years. Its walls are thicker than the Society\'s patience.', 'Earn your name out there, and the Spire will remember it.'] },
    { id: 'lysa', zone: 'citadel', name: 'Lysa', color: 'pink', path: [[36, 29.5], [47, 29.5]], lines: ['The statue was cast from the melted blades of a hundred defeated Houses. Or so they say.'] },
    { id: 'harn', zone: 'citadel', name: 'Harn', color: 'red', path: [[43.5, 58], [43.5, 47]], lines: ['Twelve years in the deep drills of Lykos. Now I sweep the avenue for Golds. Better air, at least.', 'If you go down into Lykos, bring light. The dark there has teeth.'] },
    { id: 'dunmore', zone: 'citadel', name: 'Old Dunmore', color: 'brown', path: [[53.5, 32]], face: 1.57, lines: ['Stew is ash-hound again. Nobody complains twice.'] },
    { id: 'ixa', zone: 'citadel', name: 'Flight Marshal Ixa', color: 'blue', path: [[30, 88], [54, 88]], lines: ['Your ship is fueled and waiting on the apron. Walk up to the ramp and tell it where to go.', 'From orbit the Citadel looks like a gold coin dropped in rust.'] },
    { id: 'kell', zone: 'citadel', name: 'Kell', color: 'orange', path: [[48, 79.5]], face: 3.14, lines: ['I tuned your engines myself. If it rattles, that is character.'] },
    { id: 'varro', zone: 'citadel', name: 'Drillmaster Varro', color: 'gray', path: [[25.5, 80]], face: 3.14, lines: ['Test your blade on the dummies before you test it on something that bleeds.', 'Whip, then razor. Stunned things take more damage. Every time.'] },
    { id: 'pell', zone: 'citadel', name: 'Pell', color: 'green', path: [[56, 35], [74, 35]], lines: ['The gate scanners love you. Personally I think they are flattering you.'] },
    { id: 'seren', zone: 'citadel', name: 'Seren', color: 'violet', path: [[37, 25.5]], face: 1.57, lines: ['I am painting the Spire at dusk. The gold is never quite right.'] },
    { id: 'brakk', zone: 'citadel', name: 'Brakk the Smith', color: 'orange', smith: true, path: [[32.5, 33.5]], face: 1.57, lines: ['Bring me materials from every land and I will make your gear sing.'] },
    { id: 'amsel', zone: 'citadel', name: 'Doc Amsel', color: 'yellow', path: [[40.5, 46], [40.5, 58]], lines: ['Rest inside the walls. You mend faster here.', 'Whatever cut you, cut it back first next time.'] },
    { id: 'corvin', zone: 'citadel', name: 'Corvin', color: 'silver', trader: ['ember', 'hide', 'scrap'], path: [[53.5, 35.5]], face: 4.71, lines: ['Credits move faster than armies. Remember that when you are rich.'] },
    { id: 'tessaly', zone: 'citadel', name: 'Tessaly', color: 'copper', path: [[46, 25.5]], face: 1.57, lines: ['Form 7-C for every kill, dominus. Nobody fills it in. I file it anyway.'] },
    { id: 'wen', zone: 'citadel', name: 'Old Wen', color: 'white', path: [[41.5, 22]], face: 1.57, lines: ['The gates lead to three roads. The Marches for the young, Lykos for the brave, the Highlands for the proud.'] },
    { id: 'gw1', zone: 'citadel', name: 'Gate Warden', color: 'obsidian', big: true, path: [[3.5, 30.5]], face: 0, lines: ['The west gate is sealed now. Every road out of the Citadel starts at the Hangar, south of the plaza.'] },
    { id: 'gw2', zone: 'citadel', name: 'Gate Warden', color: 'obsidian', big: true, path: [[80.5, 30.5]], face: 3.14, lines: ['East gate is sealed. Ships fly now, dominus. The Hangar is south.'] },
    { id: 'gw3', zone: 'citadel', name: 'Gate Warden', color: 'obsidian', big: true, path: [[38, 64.5]], face: -1.57, lines: ['Through this gate: the Hangar. Your ship, and every land worth fighting in.'] },
    // The Rust Marches waystation
    { id: 'marshal', zone: 'marches', name: 'Marshal Tullia', color: 'gray', giver: true, path: [[56.5, 79.5]], face: 0, lines: ['The Marches do not care what Color you are. They kill everyone the same.'] },
    { id: 'scout', zone: 'marches', name: 'Scout Renn', color: 'red', path: [[63, 78.5], [63, 85]], lines: ['The ruins to the north-east? Something with gold hair hunts there. Not one of ours.'] },
    { id: 'medic', zone: 'marches', name: 'Medic Oona', color: 'yellow', path: [[64.5, 83.5]], face: 3.14, lines: ['Inside these walls you heal. Outside, you bleed. Choose accordingly.'] },
    // The Lykos camp
    { id: 'overseer', zone: 'lykos', name: 'Overseer Kade', color: 'copper', giver: true, path: [[47.5, 74]], face: 0, lines: ['The Company wants the tunnels open. I want my miners alive. Help me with both.'] },
    { id: 'miner1', zone: 'lykos', name: 'Dagan', color: 'red', path: [[53, 73], [53, 78]], lines: ['Sing loud in the tunnels. The vipers hate a song.'] },
    { id: 'miner2', zone: 'lykos', name: 'Ilse', color: 'red', path: [[48.5, 77.5]], face: -1.57, lines: ['My brother went down past the great chasm. The Warden took him.'] },
    // The Highlands camp
    { id: 'herald', zone: 'highlands', name: 'Herald Cassian', color: 'gold', giver: true, path: [[52.5, 81.5]], face: 0, lines: ['This valley is the Institute\'s old proving ground. Every rival House wants it.'] },
    { id: 'cook', zone: 'highlands', name: 'Marda', color: 'brown', path: [[60, 85], [60, 81]], lines: ['Wolf again. Only fair: they eat us often enough.'] },
    { id: 'hguard', zone: 'highlands', name: 'Watch Sergeant', color: 'obsidian', big: true, path: [[53.5, 80]], face: -1.57, lines: ['The keep is north. The Primus holds it. Nobody has walked back down that road.', 'The pass past the eastern raiders climbs to the pole. Dress warm.'] },
    // The Glass Barrens waystation
    { id: 'nerva', zone: 'barrens', name: 'Quaestor Nerva', color: 'gray', giver: true, path: [[71.5, 107]], face: 0, lines: ['The Barrens drink blood faster than water. Mind both.'] },
    { id: 'bdrover', zone: 'barrens', name: 'Tobin', color: 'brown', path: [[79, 105], [79, 111]], lines: ['Caravans used to cross here weekly. Now it is a good month if one arrives.', 'The glass sings at night when the wind is right.'] },
    { id: 'bscout', zone: 'barrens', name: 'Ashe', color: 'red', path: [[74, 110], [77, 110]], lines: ['There is a ship buried in the dunes north of here. Older than the Society, some say.'] },
    // The Frost Reaches waystation
    { id: 'sigra', zone: 'frost', name: 'Sigra of the Pale Clan', color: 'obsidian', giver: true, big: true, path: [[71.5, 106]], face: 0, lines: ['My clan chose the south. The others chose the Jarl. Help me prove we chose rightly.'] },
    { id: 'fsmith', zone: 'frost', name: 'Ulla the Smith', color: 'orange', smith: true, path: [[79.5, 105.5]], face: 3.14, lines: ['Metal turns brittle in this cold. So do people.'] },
    { id: 'fhealer', zone: 'frost', name: 'Brother Kest', color: 'yellow', path: [[76.5, 111]], face: -1.57, lines: ['Stay by the fire. Frostbite takes fingers before it takes pride.'] },
    // Waystation smiths and traders
    { id: 'msmith', zone: 'marches', name: 'Forgewright Dax', color: 'orange', smith: true, path: [[55.5, 85.5]], face: -1.57, lines: ['Hides and ember salt make a fine start. Bring more and I make it finer.'] },
    { id: 'mtrader', zone: 'marches', name: 'Mila', color: 'brown', trader: ['ember', 'hide', 'scrap'], path: [[59.5, 85.5]], face: -1.57, lines: ['Buying, selling, and asking no questions about the blood.'] },
    { id: 'lsmith', zone: 'lykos', name: 'Smith Brannoc', color: 'copper', smith: true, path: [[50.5, 72.5]], face: 1.57, lines: ['Helium ore and pulse crystal. The mine gives, the mine takes.'] },
    { id: 'ltrader', zone: 'lykos', name: 'Tally', color: 'red', trader: ['ore', 'crystal', 'hide'], path: [[52.5, 76.5]], face: 3.14, lines: ['Everything down here is for sale, including my silence.'] },
    { id: 'hsmith', zone: 'highlands', name: 'Forge-Sister Aelis', color: 'orange', smith: true, path: [[56.5, 86.5]], face: -1.57, lines: ['Valley sage cures the leather. Do not ask me why. It works.'] },
    { id: 'htrader', zone: 'highlands', name: 'Wren', color: 'green', trader: ['sage', 'hide', 'scrap'], path: [[52.5, 85.5]], face: 0, lines: ['I trade with every House. Every House hates that.'] },
    { id: 'bsmith', zone: 'barrens', name: 'Glasswright Oren', color: 'orange', smith: true, path: [[72.5, 104.5]], face: 1.57, lines: ['Sunglass takes an edge like nothing else. Bring it to me.'] },
    { id: 'btrader', zone: 'barrens', name: 'Sabira', color: 'brown', trader: ['sunglass', 'scrap', 'hide'], path: [[76.5, 105.5]], face: 1.57, lines: ['Water is not for sale. Everything else is.'] },
    { id: 'ftrader', zone: 'frost', name: 'Hodd', color: 'brown', trader: ['frostite', 'hide'], path: [[73.5, 104.5]], face: 1.57, lines: ['Frostite for credits, credits for frostite. And for warm socks, if you are smart.'] },
    // The Rust Marches: Rustwell and the Dustfields
    { id: 'jax', zone: 'marches', name: 'Foreman Jax', color: 'red', path: [[143.5, 37.5]], face: 1.57, lines: ['Rustwell digs ore for the Citadel. Bandits dig into our carts. One of those is a crime.', 'The mine north of town goes deeper than anyone has mapped.'] },
    { id: 'tova', zone: 'marches', name: 'Tova', color: 'red', path: [[136, 38], [156, 38]], lines: ['My father swung a pick for forty years. I swing one for him now.'] },
    { id: 'pim', zone: 'marches', name: 'Old Pim', color: 'brown', trader: ['ember', 'scrap', 'hide'], path: [[144, 44]], face: 3.14, lines: ['Best prices in Rustwell. Only prices in Rustwell.'] },
    { id: 'hesta', zone: 'marches', name: 'Hesta', color: 'brown', path: [[31, 107], [31, 118]], lines: ['Red dust and red beans. Somehow they both grow.', 'The bandits take a tithe of every harvest. You could take it back.'] },
    { id: 'rill', zone: 'marches', name: 'Rill', color: 'red', path: [[35.5, 108]], face: 1.57, lines: ['Are you a real Gold? Can I touch the razor? Just the handle?'] },
    // The Mines of Lykos: Deepwell
    { id: 'rusk', zone: 'lykos', name: 'Mother Rusk', color: 'red', path: [[105.5, 89.5]], face: 0, lines: ['Deepwell holds. Deepwell always holds.', 'The rats come up from the south-west. The sentry in the flooded gallery shoots anything that moves.'] },
    { id: 'dwmin', zone: 'lykos', name: 'Corrin', color: 'red', path: [[104, 92.5], [112, 92.5]], lines: ['We were cut off when the lower lift flooded. Three months now.'] },
    { id: 'dwtrd', zone: 'lykos', name: 'Surveyor Lin', color: 'copper', trader: ['ore', 'crystal'], path: [[111, 89]], face: 3.14, lines: ['I map the tunnels, and I sell what I find in them.'] },
    // The Institute Highlands: Brushwood and the crash site
    { id: 'seraphine', zone: 'highlands', name: 'Seraphine', color: 'violet', path: [[125, 88.5]], face: 1.57, lines: ['I came to paint the lake. I stayed because the war is so beautifully lit.'] },
    { id: 'poet', zone: 'highlands', name: 'Idris', color: 'pink', path: [[127, 88.5], [139, 88.5]], lines: ['I am writing an epic about you. It is currently one line long.'] },
    { id: 'bwtrd', zone: 'highlands', name: 'Fennick', color: 'green', trader: ['sage', 'hide'], path: [[136, 88.5]], face: 3.14, lines: ['Sage from the valley, hides from the woods. Very artisanal.'] },
    { id: 'veya', zone: 'highlands', name: 'Veya', color: 'blue', path: [[152.5, 104.5]], face: 1.57, lines: ['My skiff came down in the storm. I would love a lift, but you seem busy killing things.'] },
    // The Glass Barrens: the Caravanserai
    { id: 'tarrin', zone: 'barrens', name: 'Caravan Master Tarrin', color: 'brown', path: [[160, 80.5]], face: 0, lines: ['Every caravan through the Barrens stops here. The worms have been eating them before they arrive.'] },
    { id: 'cvtrd', zone: 'barrens', name: 'Silvanus', color: 'silver', trader: ['sunglass', 'scrap', 'ore'], path: [[172, 81.5]], face: 3.14, lines: ['I buy everything. I sell most things. I remember all things.'] },
    { id: 'cvgrd', zone: 'barrens', name: 'Caravan Guard', color: 'gray', path: [[157, 84.5], [176, 84.5]], lines: ['Keep your razor sheathed inside the walls. Out there, do as you like.'] },
    // The Frost Reaches: the Pale Clan\'s hold
    { id: 'eskel', zone: 'frost', name: 'Chief Eskel', color: 'obsidian', big: true, path: [[150, 101.5]], face: 1.57, lines: ['The Pale Clan left the Jarl when he forgot that a clan is its people, not its lord.'] },
    { id: 'phhunt', zone: 'frost', name: 'Hunter Aska', color: 'obsidian', path: [[140, 103.5], [160, 103.5]], lines: ['The berserkers on the glacier were our cousins once.'] },
    { id: 'phheal', zone: 'frost', name: 'Healer Moss', color: 'yellow', path: [[145, 101.5]], face: 0, lines: ['Warm hands, warm heart, warm stew. In that order.'] },
    { id: 'phtrd', zone: 'frost', name: 'Brun', color: 'brown', trader: ['frostite', 'hide'], path: [[155, 101.5]], face: 3.14, lines: ['The Pale Clan trades fair. The Jarl trades in axes.'] },
  ];

  // Relics: lore stones hidden around the world. Walking up to one discovers it for good (server-side), for XP and a Journal entry.
  const RELICS = {
    spire:      { zone: 'citadel',   xp: 50,   name: 'Foundation Stone', text: 'Carved at the base of the Spire: "Raised by Red hands, owned by Gold names." Someone has tried to chisel the first half away.' },
    ringwall:   { zone: 'citadel',   xp: 50,   name: 'Watchman\'s Mark', text: 'Hash marks cover this corner of the ring wall, one for every night a Gray stood guard here. There are thousands.' },
    'm-lake':   { zone: 'marches',   xp: 120,  name: 'Drowned Marker', text: 'A survey post from the first terraforming crews. The lake it was meant to measure did not exist yet.' },
    'm-dunes':  { zone: 'marches',   xp: 120,  name: 'Caravan Shrine', text: 'Travelers leave a pinch of dust here for luck. The pile is taller than a Red.' },
    'm-hollow': { zone: 'marches',   xp: 120,  name: 'Hollow Stone', text: 'A stone worn smooth by hound claws. They sharpen themselves here, the Marshal says, before a hunt.' },
    'm-ruin':   { zone: 'marches',   xp: 120,  name: 'Legion Standard', text: 'A Bellona standard, planted when the ruins were a fort. Its eagle has rusted into something closer to a crow.' },
    'l-nest':   { zone: 'lykos',     xp: 350,  name: 'Viper Totem', text: 'Miners carved a serpent into the rock and left offerings of salt. The vipers seem unimpressed.' },
    'l-gallery':{ zone: 'lykos',     xp: 350,  name: 'Warden\'s Oath', text: 'The first Mine Warden swore here to keep the tunnels safe. The oath is scratched out and rewritten in another hand.' },
    'l-sump':   { zone: 'lykos',     xp: 350,  name: 'Flooded Clock', text: 'A shift clock, stopped at the hour the lower galleries flooded. Nobody has reset it since.' },
    'l-shaft':  { zone: 'lykos',     xp: 350,  name: 'Helldiver\'s Mark', text: 'A drill bit driven into the wall, marked with a name and a tally of cubic tonnes. A proud number.' },
    'h-pond':   { zone: 'highlands', xp: 600,  name: 'Proctor\'s Seat', text: 'A carved stone chair facing the valley, where someone once watched students bleed and took notes.' },
    'h-summit': { zone: 'highlands', xp: 600,  name: 'Beacon Cairn', text: 'A signal fire cairn. The ash in it is old but the stones are warm.' },
    'h-ford':   { zone: 'highlands', xp: 600,  name: 'The Truce Stone', text: 'Two Houses once swore a truce here. Both names are carved; one has a sword mark struck through it.' },
    'h-keep':   { zone: 'highlands', xp: 600,  name: 'Keep Cornerstone', text: 'The keep was built for the first Primus of the valley. Every Primus since has signed it with a blade.' },
    'b-oasis':  { zone: 'barrens',   xp: 900,  name: 'Oasis Idol', text: 'A glass figure of a woman holding a cup. The cup is always full of sand, no matter how often it is emptied.' },
    'b-wreck':  { zone: 'barrens',   xp: 900,  name: 'Ship\'s Bell', text: 'The bell of the buried warship. The name on it has been polished away by centuries of wind.' },
    'b-edge':   { zone: 'barrens',   xp: 900,  name: 'Edge of the Glass', text: 'Here the glass ends in a clean line, as if the fire that made it had been measured with a rule.' },
    'b-south':  { zone: 'barrens',   xp: 900,  name: 'Waterseller\'s Grave', text: 'A grave marked with a dry canteen. The epitaph reads: "He never gave it away."' },
    'b-far':    { zone: 'barrens',   xp: 900,  name: 'Fused Legionnaire', text: 'A soldier caught in whatever made the glass, still standing, still holding a spear.' },
    'f-north':  { zone: 'frost',     xp: 1400, name: 'The Pole Marker', text: 'A spike of blue ice, carved with the names of those who reached the pole and came back. The list is short.' },
    'f-shore':  { zone: 'frost',     xp: 1400, name: 'Whalebone Arch', text: 'Bones of some great sea beast, raised into an arch. The clans pass under it before every war.' },
    'f-lake':   { zone: 'frost',     xp: 1400, name: 'Frozen Offering', text: 'A razor, frozen into the ice long ago. Its hilt is gold. Its owner is not mentioned.' },
    'f-drift':  { zone: 'frost',     xp: 1400, name: 'Snowbound Sledge', text: 'A supply sledge, abandoned mid-journey. The runners point south. The tracks leading away point north.' },
    'c-hangar': { zone: 'citadel',   xp: 60,   name: 'First Flight Plaque', text: 'A brass plaque marks where the first ship of the Citadel lifted off. Somebody polishes it every morning.' },
    'm-mine':   { zone: 'marches',   xp: 160,  name: 'Mine Mouth Shrine', text: 'Candles in tin cups, and a list of names. The Reds of Rustwell light one for every shift that does not come back.' },
    'm-farm':   { zone: 'marches',   xp: 160,  name: 'Scarecrow Legionnaire', text: 'A Bellona helmet on a stick, guarding the Dustfields. The crows are not impressed; the bandits are.' },
    'm-east':   { zone: 'marches',   xp: 160,  name: 'Survey Beacon', text: 'A beacon still pulsing a terraforming code nobody reads anymore. It is, very patiently, counting down to nothing.' },
    'l-grotto': { zone: 'lykos',     xp: 420,  name: 'Singing Crystal', text: 'Strike this crystal and it hums a note that miners swear is the same pitch as a helium seam.' },
    'l-flood':  { zone: 'lykos',     xp: 420,  name: 'Drowned Lift', text: 'A lift cage, half-sunk in black water. The call button still lights up when you touch it.' },
    'l-drill':  { zone: 'lykos',     xp: 420,  name: 'The Great Drill', text: 'A drill head the size of a house, abandoned where it broke. Its teeth are worn down to stubs.' },
    'h-lake':   { zone: 'highlands', xp: 700,  name: 'Lakeside Marker', text: 'Scratched in the stone: a scoreboard of every House that swam the lake in winter. Minerva is ahead.' },
    'h-tower':  { zone: 'highlands', xp: 700,  name: 'Watchtower Log', text: 'A tower log in a Proctor\'s tidy hand. The last entry reads: "They have found the south path."' },
    'h-skiff':  { zone: 'highlands', xp: 700,  name: 'Skiff Flight Recorder', text: 'The pilot\'s last words are calm. The co-pilot\'s are not.' },
    'b-caravan':{ zone: 'barrens',   xp: 1000, name: 'Caravan Ledger', text: 'Two hundred years of trades, carved into a pillar. Water is always the most expensive line.' },
    'b-worm':   { zone: 'barrens',   xp: 1000, name: 'Worm Skull', text: 'A skull so large the dunes have piled up inside it. Something bigger ate the rest.' },
    'b-canyon': { zone: 'barrens',   xp: 1000, name: 'Glass Mirror', text: 'A sheet of glass smooth enough to see yourself in. Your reflection looks tired.' },
    'f-glacier':{ zone: 'frost',     xp: 1500, name: 'Frozen Standard', text: 'A Society banner frozen solid in the glacier, still in its folds. Nobody remembers who planted it.' },
    'f-hold':   { zone: 'frost',     xp: 1500, name: 'Hearthstone', text: 'The Pale Clan carry this stone from hall to hall. It is warm to the touch, always.' },
    'f-south':  { zone: 'frost',     xp: 1500, name: 'Last Signpost', text: 'An arrow pointing south, carved with a single word: "Warmer". It is correct.' },
    'f-cairn':  { zone: 'frost',     xp: 1400, name: 'Jarl\'s Cairn', text: 'Stones for every Jarl of the ice clans. The newest stone is blank, waiting.' },
  };
  // First-visit discovery XP for each zone.
  const ZONE_XP = { citadel: 0, marches: 40, lykos: 400, highlands: 800, barrens: 1500, frost: 2500 };
  // What the flight menu says about each destination.
  const DESTINATIONS = {
    citadel: 'Home. The Society\'s golden city: contracts, smiths, traders and your House.',
    marches: 'Red dust, Gray deserters and hound packs. Where every Gold starts.',
    lykos: 'The helium mines. Dark tunnels full of vipers, drones and Company muscle.',
    highlands: 'The Institute\'s old valley. Rival Houses fight for every ridge.',
    barrens: 'A desert of fused glass. Worms in the sand, an iron legion in the fort.',
    frost: 'The pole. Obsidian clans, white wolves and wyrms under the ice.',
  };

  // Player Houses (guilds founded by players). Heraldry is chosen from these; names are validated on the server.
  const HOUSE_RULES = { maxMembers: 30, nameMin: 3, nameMax: 24, mottoMax: 60, kinship: 0.1, kinshipMax: 0.3, kinshipRange: 320, inviteTtl: 120 };
  const HERALD_COLORS = ['#b3261e', '#d8a63a', '#3f6fb0', '#3d8a58', '#6a45a8', '#b8577f', '#2f9fb3', '#a4502a', '#e8e4dc', '#34343f', '#8c9c34', '#c86a22'];
  const SIGILS = ['wolf', 'eagle', 'sun', 'moon', 'star', 'crown', 'spear', 'flame', 'tower', 'serpent'];
  function validHouseName(n) { return typeof n === 'string' && /^[A-Za-z][A-Za-z' ]*[A-Za-z]$/.test(n) && n.length >= HOUSE_RULES.nameMin && n.length <= HOUSE_RULES.nameMax && !/ {2}/.test(n); }

  // Clear lanes (tile coordinates, x0,y0 → x1,y1) that the Citadel\'s ambient citizens stroll along. test/world.js checks them.
  const CITIZEN_LANES = [[40.5, 45, 40.5, 62], [43.5, 45, 43.5, 62], [40.5, 14, 40.5, 22], [43.5, 14, 43.5, 22], [5, 32.5, 29, 32.5], [5, 35.5, 29, 35.5], [54, 32.5, 78, 32.5], [54, 35.5, 78, 35.5],
    [3, 5, 3, 29], [3, 38, 3, 63], [81, 5, 81, 29], [81, 38, 81, 63], [5, 3, 78, 3], [5, 65, 37, 65], [46, 65, 78, 65]];

  const xpToLevel = (lvl) => Math.round(100 * Math.pow(lvl, 1.5));
  const statsFor = (level) => ({ maxHp: PLAYER.hp + (level - 1) * PLAYER.hpPerLevel, dmg: PLAYER.dmg * (1 + PLAYER.dmgPerLevel * (level - 1)), spd: PLAYER.spd });
  // Everything that gear and talents change, in one place so the server and the client (prediction, menus) agree.
  function derive(level, gear, talents) {
    const g = (k) => (gear && Number.isInteger(gear[k]) ? gear[k] : 0), t = (k) => (talents && Number.isInteger(talents[k]) ? talents[k] : 0), base = statsFor(level), A = ABILITIES;
    return {
      maxHp: Math.round(base.maxHp * (1 + 0.10 * g('armor') + 0.06 * t('vitality'))),
      dmg: base.dmg * (1 + 0.08 * g('razor') + 0.04 * t('might')),
      fistDmg: base.dmg * A.fist.mult * (1 + 0.10 * g('gauntlet') + 0.04 * t('might')),
      spd: PLAYER.spd * (1 + 0.02 * g('boots') + 0.03 * t('swiftness')),
      cd: { razor: A.razor.cd, whip: A.whip.cd, fist: +(A.fist.cd - 0.3 * g('gauntlet')).toFixed(2), dash: +(A.dash.cd - 0.08 * g('boots')).toFixed(2), parry: A.parry.cd },
      parry: A.parry.window + 0.04 * t('reflexes'),
      razorRange: A.razor.range + 3 * t('reach'), whipRange: A.whip.range + 8 * t('reach'), fistRadius: A.fist.radius + 6 * t('shockwave'),
      leech: 0.02 * t('renewal'), fortune: 0.10 * t('fortune'),
    };
  }
  return { PLAYER, ABILITIES, AB_ORDER, STUN_BONUS, HOUSES, HAIR_STYLES, HAIR_TONES, DEFAULT_LOOK, validLook, MOBS, LORE, DROPS, creditsFor, MATERIALS, NODE_MATERIAL, GATHER, GEAR, gearCost, TALENTS, talentPoints, respecCost, derive, DESTINATIONS, QUESTS, TOWNSFOLK, CITIZEN_LANES, RELICS, ZONE_XP, HOUSE_RULES, HERALD_COLORS, SIGILS, validHouseName, xpToLevel, statsFor };
});
