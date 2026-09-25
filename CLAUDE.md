# CLAUDE.md — Reaper Online

Read this before changing anything. It explains how the game is built, the rules that keep it secure, and the roadmap.

## What this is
A top-down online action RPG in a Red Rising–inspired world. Private, invite-only, non-commercial fan project. Never add monetization, and keep all story text original (don't paste text from the books).

**Every player is a Gold.** Players customize their Institute House (cloak and sash color), hair style and hair tone. The other Colors are part of the world, as enemies (Grays, Obsidians, rogue Golds) and as the townsfolk of the Citadel and the waystations.

## Run
- `npm install` then `npm start` → http://localhost:3000
- `npm run dev` restarts on file changes.
- `npm test` runs the simulation tests and the headless bot (see "Testing").
- Env vars: `PORT` (default 3000) and `DATA_FILE` (default `data/accounts.json`).

## World
| Zone | Biome | Levels | Notes |
|---|---|---|---|
| The Citadel (`citadel`) | citadel | hub | 84×96. Safe everywhere except the training yard. Palace (the Spire), plaza with statue, districts. The south gate opens onto the Hangar district: your ship's landing pad, hangars, workshops, and a training yard of dummies. Quartermaster Voss gives elite bounties; Brakk is the smith, Corvin the trader, Archon Serapha the talent trainer. |
| The Rust Marches (`marches`) | mars | 1–8 | 170×130. Waystation and landing pad, the mining town of Rustwell (north-east), the Dustfields farm (south-west). Marshal Tullia gives quests. Rogue Gold elite. |
| The Mines of Lykos (`lykos`) | mine | 6–11 | 140×116. Dark caves with lantern light, a chasm bridge and rails, the cut-off Deepwell refuge. Overseer Kade gives quests. Mine Warden elite. |
| The Institute Highlands (`highlands`) | green | 9–15 | 170×130. River valley, pine forests, cliffs, a lake, watchtowers, the rival keep, the village of Brushwood, a crashed skiff. Herald Cassian gives quests. Rival Primus elite. |
| The Glass Barrens (`barrens`) | glass | 12–17 | 190×150 desert, with the Caravanserai trading post: dunes, glass shards, mesas, oases, a buried warship, the Iron Legate's fort. Quaestor Nerva gives quests. |
| The Frost Reaches (`frost`) | ice | 16–21 | 190×150 polar zone, with the Pale Clan's hold: frozen lakes, an icy sea, an Obsidian clan village, the Frost Jarl's hall. Sigra of the Pale Clan gives quests. |

- **Getting around: ships.** Every zone has one landing pad (`map.pad`, built by the `pad()` kit helper) with your ship parked on it.
  - Stand within `BOARD_RANGE` (56 px) of the ramp and press E to open the flight menu. Any zone can be reached from any other.
  - The client plays a take-off (≈1.6 s), sends `{t:'fly', to}`, and the server moves you to the destination pad's `exit`. The client then plays the landing.
  - The ship is drawn per client in your player House's colors and sigil, or your Institute House's color if you have no House. The hull tiles (`HULL`) are solid.
- **The map** (minimap in the HUD, full map on M) uses fog of war. It shows only tiles you've been near.
  - Fog is stored in `localStorage` per character and zone. The Citadel is always fully revealed.
  - It marks your ship, quest givers, smiths, traders, the trainer, relics you've found, and housemates in view. It never shows enemies.
- **Relics** (`RELICS` in defs, `relic` props in map): 40 lore stones hidden around the world. Walking within 24 px discovers one for good, for XP and a Journal entry.
- **Discovery:** the first visit to each zone grants `ZONE_XP`.
- **Resource nodes** (`map.nodes`, placed by the `nodes(kind, n)` kit helper): 70–100 per wild zone, never inside safe areas.
  - Press E within `GATHER.range` to gather 1–3 of the node's material. You also get a little XP.
  - A gathered node regrows after `GATHER.respawn` seconds. Snapshots list nearby spent node ids in `nd`.
- **Upgrades:**
  - Credits and materials (`MATERIALS`) come from kills (`DROPS`, `creditsFor`), nodes, quest turn-ins (40% of the quest's XP, as credits) and traders.
  - **Gear** (`GEAR`): razor, armor, pulse gauntlet and grav boots, 10 ranks each. A smith upgrades them for `gearCost(slot, rank)`. Higher ranks need materials from harder zones, and the last ranks need champion cores.
  - **Talents** (`TALENTS`): 8 talents, 5 ranks each, with one point per level after the first (`talentPoints`). Spend them from the menu. Archon Serapha resets them for `respecCost(level)`.
  - `derive(level, gear, talents)` turns all of it into stats (health, damage, fist damage, speed, per-ability cooldowns, parry window, reaches, fist radius, leech, fortune). The server and the client both call it, so prediction and menus match.
- **Townsfolk roles:** `giver` (contracts), `smith: true`, `trader: [materials sold]`, `trainer: true`.
  - Merchants stand still inside a safe area. The server checks that you're within `NPC_RANGE` (60 px) of one.
  - Every waystation has a smith and a trader. Every town has a trader.
- **Training dummies** (`dummy: true` in `MOBS`): they never move, never attack, never die, and never pay out. They reset 4 s after the last hit.

## Architecture
- **One Node process** serves the static client and a WebSocket game server (the `ws` package) on the same port.
- **Player Houses** (guilds) live in `server/houses.js`. They're stored in the same data file (`db.houses`, via `store.getHouse/putHouse/removeHouse`).
  - A character's `house` field holds its House key (the lower-cased name).
  - `Houses.attach` binds `p.hkey/hname/hcolor/hsigil` at login; the snapshot carries the name, color and sigil for nameplates and cloak emblems.
  - Kinship: each housemate fighting within `kinshipRange` adds `kinship` XP on kills, up to `kinshipMax`.
- **One `World` per zone** (`server/world.js`), all stepped by `server/index.js` at 20 Hz (`TICK`).
  - A player lives in exactly one world.
  - A valid `fly` message sets `p.transfer = { zone, flight: true }`. After the tick, `index.js` moves the player to the destination pad's `exit` (`adopt`) and sends `{t:'zone', flight: true}`.
  - Entity ids come from one counter shared by all worlds, so ids never collide when players change zones.
  - `World` is free of networking. It knows players, mobs, a `send` callback per player, and `hooks.announce` for global system messages.
- **Server-authoritative.**
  - Clients send only *intentions*: movement keys, "use ability X toward angle A", quest actions, chat.
  - The server decides positions, hits, damage, knockback, XP, loot and quest progress.
  - **Never trust a client value** except as a request to validate.
- **Shared code** in `shared/` is UMD: `require()` on the server, `<script>` in the browser.
  - `shared/map.js` holds every zone's layout: `ZONES[id].build(map, kit, rng)`.
    - Each zone is generated deterministically from its seed, so the client never downloads a map.
    - A built map is `{ w, h, M, safe, buildings, props, camps, nodes, spawn, pad }`. `pad` is `{ x0, y0, x1, y1, x, y, ramp, exit }`.
    - Monster camps live here with the layout. Monster *stats* live in `shared/defs.js`.
    - Collision helpers take the map: `MAP.blocked(map, x, y, r)`, `MAP.moveBy(map, e, dx, dy)` (substepped, ≤ 6 px per step, so nothing tunnels through walls), `MAP.inSafe`, `MAP.blocksShot`.
    - If you change a map or collision, both sides change together.
  - `shared/defs.js` holds abilities, Houses, monsters and their drops, materials, gear, talents, `derive`, quests, named townsfolk, and the Citadel's citizen lanes.
- **Client files:**
  - `client/art.js` holds all drawing, in a low-poly "polyblock" style.
    - `solid(g, outline, r0, r1, base)` raises a 2D outline to a ridge. Each facet is lit by one fixed sun (`LX, LY, LZ`). `setRot(face)` makes facets on a rotating model shade correctly.
    - `humanoid` draws people. `mob(g, type, o)` draws any monster; `MOB_LOOK[type]` picks the model and gear.
    - `Terrain(map)` paints 128 px chunks per zone and caches them. `lo` is ground level, drawn under characters. `hi` is anything taller than a character (wall tops, cliff tops, roofs, canopies, statue), drawn over them.
    - `BIOMES` sets the palette and details for each biome.
  - `client/audio.js`: synthesized sound effects (Web Audio, no files). `M` mutes.
  - `client/game.js`: networking, zones, input, prediction, interpolation, effects, lighting for dark zones, HUD, dialogs, townsfolk (named NPCs plus about 40 ambient citizens in the Citadel), and the menu (Tab).
    - The menu tabs are Character, Talents, Inventory (credits, gear and materials), Journal (contracts and relic lore), Bestiary (unlocked by kills), House, Society (who's online) and Settings.
    - It's built as DOM with the `h()` helper, which always inserts strings as text nodes.
- **Interest management:** each player only receives entities within `VIEW` (420 px) in `world.snapshotFor`, from their own zone only. The camera zoom (`Z` in `game.js`) must keep half the screen width under `VIEW`.
- **Client prediction:**
  - Your own movement and Dash are simulated locally. Ability animations and effects play immediately; the server decides what they hit.
  - Each snapshot nudges the local position 15% toward the server's, and snaps if they're more than 40 px apart.
  - Other entities are interpolated over ~60 ms.
- **Townsfolk** are client-only and cosmetic, except that the server checks the position of quest givers. Their positions come from `Date.now()`, so every client sees them in roughly the same place.
- **Hit-stop:** when your hit lands, animation and effect time slows for ~50–100 ms. Movement prediction keeps running at full speed.

## Combat
All numbers live in `ABILITIES` and `MOBS` in `shared/defs.js`.

| Input | Ability | Notes |
|---|---|---|
| Left mouse (hold) | Razor | Fast arc slash. |
| Right mouse | Razor Whip | Long line. Stuns, and pulls targets farther than 26 px toward you. |
| Q | Pulse Fist | AoE blast with huge knockback. Stuns, ignores shields, and deletes hostile projectiles in the blast. Enemies thrown into a wall take extra damage. |
| Space | Dash | Moves in your movement direction, or toward the cursor. You're invulnerable for `inv` seconds. |
| Shift | Parry | A melee hit during the window stuns the attacker. A bolt or javelin is deflected back at the shooter. A clean parry refunds the cooldown. |

- Stunned enemies take `STUN_BONUS` damage.
- Weapons are sheathed in safe areas (`map.safe`). Dash and parry still work there.
- The server accepts an ability up to `CD_GRACE` (0.1 s) early; the leftover carries into the next cooldown.
- Enemy behaviors (flags in `MOBS`):
  - `ranged`: keeps distance, tracks you, then locks aim and fires. `shot` picks the projectile: 0 bolt, 1 spark, 2 javelin.
  - `aoe`: telegraphs a circle and slams it.
  - `combo`: chains strikes.
  - `lunge`: prowls at leaping distance, then leaps along a locked aim. The leap only goes as far as needed, so a side-step dodges it.
  - `guard`: blocks frontal hits (damage × `guard`) unless stunned. The pulse fist ignores it.
  - `elite`: a zone champion. Longer respawn; its kill is announced to everyone.
- The client draws a different warning shape for each behavior: cone (melee), circle (aoe), lane (lunge), laser line (ranged).

## Network protocol (JSON over WebSocket)
Client → server:
- Before login: `{t:'register', user, pass, look:{house, hair, tone}}` or `{t:'login', user, pass}`. The server validates `look` with `validLook`.
- `{t:'in', u, d, l, r, a}`: movement keys (0/1) and aim angle (radians). Sent on change and every 100 ms.
- `{t:'use', ab, a, d?}`: use ability `ab` (a key of `ABILITIES`) toward angle `a`. `d` is the dash direction.
- `{t:'quest', id, action:'accept'|'turnin'|'abandon'}`: only works within 60 px of that quest's giver, in the giver's zone.
- `{t:'chat', msg, ch?, to?}`: max 200 characters. `ch` is unset for global chat, `'h'` for your House, or `'w'` for a whisper to player `to`. The client parses `/h`, `/w name` and `/r`.
- `{t:'house', action, ...}`:
  - Anyone: `info`, `create` (`name, color, sigil`), `invite` (`target`), `accept` / `decline` (`key`), `leave`.
  - Head of House only: `kick` / `lead` (`target`), `motto` (`text`), `disband`.
- `{t:'stats'}` → kills, deaths, time played, relics, zones seen. `{t:'roster'}` → online players.
- `{t:'fly', to}`: only works within `BOARD_RANGE` of your zone's ramp, and `to` must be another zone.
- `{t:'gather', id}`: an integer node id in your zone, within `GATHER.range`, and not already spent.
- `{t:'upgrade', slot}` (near a smith) · `{t:'talent', id}` (anywhere, if you have a point) · `{t:'respec'}` (near the trainer, costs credits).
- `{t:'trade', npc, mat, qty, action:'buy'|'sell'}`: `qty` is an integer from 1 to 100, near that trader. Traders sell only what they stock, at 3× the material's value, and buy anything at 1×.

Server → client:
- `{t:'welcome', id, zone, char, quests, online}` · `{t:'zone', zone, x, y, flight}` (your ship landed in another zone) · `{t:'err', msg}` · `{t:'kicked'}`
- `{t:'profile', credits, mats, gear, talents}`: sent after login and whenever any of them change. `{t:'loot', x, y, credits, mats}` is what you just earned.
- `{t:'chat', from, msg}`: an empty `from` means a system message. The client renders it with `textContent` (never innerHTML).
- `{t:'quests', q}` · `{t:'notice', msg}` (a toast) · `{t:'discover', zone, xp}` · `{t:'relic', id}`
- `{t:'house', h, invites?}` (`h` is your House's view, or null) · `{t:'hinvite', key, name, color, sigil, from}` · `{t:'stats', ...}` · `{t:'roster', list}`
- `{t:'s', k, nd, me, p, m, sh, ev}`: the per-tick snapshot for your zone. `nd` lists spent resource nodes in view.
  - `me.cd` is the remaining cooldowns, in `AB_ORDER`.
  - `p` rows are `[id, x, y, face, hp, maxHp, house, name, level, dead, dashing, hair, tone, hname, hcolor, hsigil]`. `house` is the Institute House; `hname/hcolor/hsigil` are the player House.
  - `m` rows are `[id, type, x, y, face, hp, max, state, windProgress, aim, stun]`.
  - `sh` rows are projectiles, `[x, y, angle, hostile, kind]`.
  - `ev` entries are one-shot events, each with `x, y` and most with `id`.
    - Player abilities: `razor`, `whip`, `fist` (`fx, fy`), `dash`, `guard`.
    - Combat: `hit` (`by`, `ab`, `crit`, `block`), `die`, `wall`, `parry`, `hurt`.
    - Enemy attacks: `mslash` (`l` = lunge), `mshot`, `mslam` (`r`).
    - Progress: `lvl`, `pdie`, `respawn`, `qdone`, `relic`, `launch`, `gather` (`n` = node id), `upgrade`.

## Security rules (keep these true)
- Validate every message's type and range on the server. Clamp numbers and ignore unknown fields.
- Look up client-supplied keys (`ab`, quest `id`, account names, saved `zone`) with own-property checks (`own()` in `world.js` and `index.js`, `acct()` in `store.js`). Otherwise `__proto__` or `constructor` resolve to `Object.prototype` members. `npm test` includes these probes.
- Keep the per-connection rate limit (`msgBudget`) and the WebSocket `maxPayload`.
- Passwords are hashed with scrypt, a per-user salt, and a timing-safe compare. Never log or store plain passwords.
- Chat, NPC dialogue, House names and mottos, and player names must stay plain text end to end (`textContent`, or `h()` in the menu). Only static strings from `shared/defs.js` go through `innerHTML`.
- Houses:
  - Names pass `validHouseName` (letters, spaces and apostrophes, 3–24 characters). Over-long names are refused, not truncated.
  - Colors and sigils must come from `HERALD_COLORS` and `SIGILS`. Mottos are stripped of control characters and capped.
  - Only the head of the House can kick, pass leadership, set the motto or disband. Invitations expire after `inviteTtl`.
  - Journal data loaded from saves (relics, zones seen, kill counts) is filtered against the defs.
- Upgrades: credits, materials, gear ranks and talents loaded from saves are read as own properties only, and must be integers in range. Talents worth more points than your level allows are refunded.
- Every purchase, upgrade and respec is checked in full (proximity, price, stock, caps) before anything is deducted.
- When adding HTTP routes, keep the explicit route table. Never serve arbitrary paths from disk.

## Conventions
- Game balance numbers live in `shared/defs.js`, so both sides agree. Layout (tiles, camps, landing pads, resource nodes, safe areas) lives in `shared/map.js`.
- Coordinates are pixels. Tiles are `T = 16` px. Zone builders work in tiles.
- Adding a zone:
  1. Add an entry to `ZONES` with a `build` that sets `spawn` and `safe`, calls `pad()` for the landing pad (keep it inside a safe area), places camps, and calls `nodes()`.
  2. Add it to `DESTINATIONS` (the flight menu) and `ZONE_XP`.
  3. Add its giver, a smith and a trader to `TOWNSFOLK`, and its quests to `QUESTS`.
  4. Pick a biome or add one to `BIOMES` in `art.js`.
  5. Run `npm test`. The map checks prove everything is reachable.
- Adding a monster: stats in `MOBS` and a `DROPS` entry (`defs.js`), a `MOB_LOOK` entry in `art.js` (reuse `humanoid` with gear, or a creature model), and camps in a zone.
- Adding a material: `MATERIALS` (and `NODE_MATERIAL` plus a `NODE_LOOK` model if it grows in nodes). Adding a gear tier or talent only needs `defs.js`; `derive` is the single place stats are computed.
- Characters are drawn in a local frame where +x is facing and +y is the right hand. Poses come from `pose()` in `art.js`, driven by `act = {k, p}` with progress 0..1.
- Keep the look faceted: build shapes from `solid`, `gem`, `block` and `limb`, not ellipses. Soft gradients are only for glows, light and shadows.

## Testing
`npm test` runs two scripts:
1. `test/world.js` drives `World` directly, with no network.
   - Map integrity for every zone: spawn, camps, relics, the landing pad (ramp and exit), resource nodes, NPC paths and citizen lanes are all clear and reachable. Merchants stand still in safe areas. Maps build deterministically.
   - Enemy behavior per type (ranged, slam, combos, lunges, shields), parry and deflection (bolts and javelins), pulse fist, whip and dash.
   - Flight rules, and quest-giver zone and distance checks.
   - Gathering and regrowth, kill loot, smith upgrades (cost, proximity, caps), talents and respecs, trading, training dummies, Renewal, and sanitized upgrade data.
   - Relic and zone discovery, kinship XP, sanitized journal data.
   - House rules: names, heraldry, uniqueness, invitations, leadership, kicks, mottos, dissolving.
2. `test/bot.js` starts a server on port 3999 with a throwaway data file, then runs a bot that:
   1. registers, probing hostile input;
   2. BFS-paths to the Hangar, flies to the Marches, and gathers a resource node;
   3. takes the Marshal's quest and fights at the hound camp with every ability;
   4. flies home by ship;
   5. relogs, and checks XP, credits, materials, quests, zone, position and look.

   Before leaving the Citadel, the bot also founds a House and invites a second bot, which joins. It then checks House tags in snapshots, House chat, whispers, the roster, and that membership is restored at login.

For visuals, drive the real client in headless Chrome, for example with `puppeteer-core` pointed at an installed Chrome, and screenshot it. You can seed a character anywhere with `store.createAccount` plus a `char.zone/x/y` before starting the server.

## Roadmap (do these in order; each phase should end playable)
1. **Feel pass:**
   - *Done:* animations, hit-stop, sound, a fog-of-war map, vignette, warning shapes.
   - *Remaining:* sequence-numbered reconciliation and replay.
2. **Real database:** replace `server/store.js` with Postgres (Render Postgres, Neon, or Supabase). Tables: `accounts`, `characters` (including `zone`), `inventory`, `quests`. Keep the same exported functions. Add sessions (signed tokens) so a reload doesn't require retyping the password.
3. **Inventory and loot:**
   - *Done:* credits, materials, drop tables, resource nodes, gear ranks with smiths, traders, and talents.
   - *Next:* unique items (elites drop signature razors and armor), cosmetic ship paint jobs, and a House vault.
4. **Parties:** short-lived groups on top of Houses. Invites, a party frame, shared quest credit, party chat.
   - *Done:* player Houses (guilds) with House chat, whispers, and a kinship XP bonus.
5. **More zones:**
   - *Done:* the zone system, the Citadel hub, the Marches, Lykos, the Highlands, the Glass Barrens, the Frost Reaches.
   - *Next:* Luna's streets, the Institute's own valley, and splitting zones into separate processes (see phase 9).
6. **Gold progression:**
   - A talent tree per House (on top of the shared talents).
   - More razor and pulse-fist techniques (unlock by level).
   - The Institute questline as the signature story.
   - Quests from the Citadel's townsfolk of each Color.
7. **Dungeons and bosses:** instanced copies of zones for parties (the `World` class already supports it: one more instance, reached by ship), and boss phases built on wind-up/parry/shield mechanics.
8. **PvP:** an Institute-style arena and house wars, opt-in only.
9. **Scale and operations:** logging, metrics, admin commands (kick, ban, mute), backups, and horizontal scaling (one process per zone, Redis for cross-zone chat and transfers).

## Known limitations
- JSON file storage: fine for friends, not for many players (phase 2).
- All zones run in one process.
- Prediction is simple smoothing, not sequence-numbered replay (phase 1).
- Gear is ranks, not items: there is nothing to trade between players yet.
- Fog of war lives in the browser, so it doesn't follow you to another computer.
- The menu's House tab shows offline members' last saved level. Zones are shown only for online members.
- Old accounts from before the Gold-only version log in with the default look (House Mars). Accounts from before zones start in the Citadel. There is no in-game look editor yet.
