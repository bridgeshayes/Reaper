# Reaper Online

A top-down online action RPG set in a Red Rising–inspired world. You play as a Gold: fight with a razor that uncoils into a whip, blast enemies apart with a pulse fist, and rise through the hierarchy. The other Colors fill the world around you, from the golden Citadel hub to the mines of Lykos.

This is a **private fan project**. Red Rising and its characters belong to Pierce Brown. Keep the server invite-only and non-commercial.

## What works today

- **Accounts:** create an account and log back in. Passwords are hashed with scrypt. Logging in somewhere new kicks your old session.
- **Play as a Gold.** Choose your Institute House (it sets your cloak and sash color), a hair style and a hair tone, with a live preview.
- **Five combat abilities**, all with cooldowns:
  - Razor slash (left click).
  - Razor whip (right click): long reach, stuns and yanks enemies toward you.
  - Pulse fist (Q): blasts every nearby enemy away, ignores shields, and slams enemies into walls for extra damage.
  - Dash (Space): untouchable mid-dash.
  - Parry (Shift): stuns attackers, and throws rifle bolts and javelins back at the thrower.
- **A world of six zones, reached by ship.** Your ship waits on a landing pad in the Citadel's Hangar district. Board it (E) to fly to any zone; every zone has a pad to fly home from.
  - **The Citadel** is the hub, and a sanctuary.
    - A walled city with a golden palace (the Spire) and a plaza with a gilded statue.
    - Market, garden and residential districts.
    - Around 40 citizens of every Color walking the avenues, plus named townsfolk you can talk to.
    - Quartermaster Voss posts bounties on each zone's champion.
    - Brakk the smith, Corvin the trader, and Archon Serapha, who resets talents.
    - The Hangar district with your ship, and a training yard of dummies.
  - **The Rust Marches** (levels 1–8). Red dust, ruins, a lake, the mining town of Rustwell and the Dustfields farm.
    - Enemies: Ash Hounds, Dust Crawlers, Rust Bandits, Scrap Drones, Bellona Legionnaires, Gray Sharpshooters, Obsidian Brutes, and the Rogue Gold.
  - **The Mines of Lykos** (levels 6–11). Pitch-dark tunnels lit by your torch, lanterns and glowing crystals, with a rail bridge over a lava chasm, and the cut-off refuge of Deepwell.
    - Enemies: Pitvipers, Burrow Rats, Drill Drones, Company Sentries, shielded Gray Enforcers, and the Mine Warden.
  - **The Institute Highlands** (levels 9–15). A river valley with pine forests, cliffs, a lake, watchtowers, a rival keep, the village of Brushwood, and a crashed skiff.
    - Enemies: Highland Wolves, House Raiders in rival House colors, Javelineers, Rival Skirmishers, and the Rival Primus.
  - **The Glass Barrens** (levels 12–17). A huge desert of dunes, glass shards, mesas and oases, with a warship buried in the sand and the Caravanserai trading post.
    - Enemies: Glass Scorpions, Dune Raiders, Sand Skimmers, Dune Worms, shielded Iron Legionnaires, and the Iron Legate.
  - **The Frost Reaches** (levels 16–21). A huge polar zone of frozen lakes, an icy sea, an Obsidian clan village, and the friendly Pale Clan's hold.
    - Enemies: Frost Wolves, Obsidian Clansmen, Obsidian Berserkers, Clan Spearthrowers, Ice Wyrms, and the Frost Jarl.
- **A map with fog of war (M).** It fills in as you explore and shows your ship, quest givers, smiths, traders, relics you've found and housemates. It never shows enemies.
- **Things to collect and a character to build:**
  - Glowing resource nodes in every wild zone: ember salt, iron scrap, helium ore, pulse crystal, valley sage, sunglass and frostite. Monsters drop hides, scrap and more, and champions drop cores. Every kill pays credits.
  - Smiths upgrade four gear slots (razor, armor, pulse gauntlet, grav boots), ten ranks each. Higher ranks need materials from harder lands.
  - Traders buy and sell materials.
  - A talent point every level, for eight talents: Might, Vitality, Swiftness, Reflexes, Long Reach, Shockwave, Renewal and Fortune.
- **Exploration rewards:** 40 hidden relics, carved stones glowing with a thin beam of light. Each gives XP and a piece of lore for your Journal. Discovering a new zone also gives XP.
- **The menu (Tab):**
  - Character: stats, gear, time played, deaths and abilities.
  - Talents and Inventory (credits, gear and materials).
  - Journal: contracts and relic lore.
  - Bestiary: every creature you have slain, with lore. The rest stay silhouettes.
  - House, Society (who's online, with whisper and invite buttons), and Settings.
- **Houses with your friends:**
  - Found a House with a name, a heraldic color and a sigil, and invite friends.
  - Housemates wear your sigil on their cloaks, show a House tag on their nameplates, share a House chat (`/h`), and earn bonus XP fighting side by side.
  - The head of the House can set a motto, pass leadership, remove members or disband.
  - Anyone can whisper (`/w name`, reply with `/r`).
- **Enemies fight differently.** Every attack is telegraphed on the ground:
  - Melee enemies wind up a red cone.
  - Brutes and the Warden slam a circle.
  - Predators prowl, then leap down a marked lane.
  - Shooters paint a laser line.
  - Enforcers block blades from the front until you stun them or get behind them.
  - Champions chain combos.
  - Stunned enemies take bonus damage.
- **Low-poly "polyblock" art.**
  - Every character, creature, tree, rock and building is built from faceted, flat-shaded solids lit by one sun, so armor facets catch the light as characters turn.
  - Walls, roofs and canopies overlap you.
  - Also: slash trails, shockwaves, sparks, hit-stop, synthesized sound (mute in Settings), take-off and landing animations, a quest tracker and a damage vignette.
- **Progression:** leveling with stat growth, and 29 quests from six quest givers, including elite bounties that are announced to everyone when claimed. Global chat.
- **Saving:** characters (including which zone they're in) save every 15 seconds, on logout, and when the server shuts down.
- **Responsive feel:** your own movement and attacks happen instantly on your screen, then are quietly corrected to match the server.

## Run it on your computer

1. Install **Node.js 18 or newer** from https://nodejs.org.
2. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. Open **http://localhost:3000** in your browser. Open a second browser window (or a private window) to log in as a second player and see multiplayer working.

To let friends on the same Wi-Fi join, they open `http://YOUR-COMPUTER'S-LOCAL-IP:3000`.

To check that everything works, run `npm test`. It runs the combat simulation tests and a headless bot that plays the game.

## Put it online (cloud)

The server is a single Node process that serves the game and the WebSocket on one port, so it runs on any host that supports WebSockets. Render and Fly.io are the simplest.

**Render (quickest start):**
1. Push this folder to a private GitHub repository.
2. On render.com, choose **New → Web Service** and pick the repo.
3. Set the build command to `npm install` and the start command to `npm start`.
4. Render gives you an https URL. The client switches to `wss://` automatically.

**Important:** the starter saves characters to a JSON file. Cloud hosts wipe local files on redeploy unless you attach a persistent disk. Before real players join, either:
- attach a persistent disk and set `DATA_FILE=/data/accounts.json`, or
- (better) move storage to Postgres. That's phase 2 in `CLAUDE.md`.

## Controls

| Key | Action |
|---|---|
| W A S D (or arrows) | Move |
| Left mouse (hold) | Razor slash |
| Right mouse | Razor whip |
| Q | Pulse fist |
| Space | Dash |
| Shift | Parry, timed as a red wind-up fills |
| E | Talk to townsfolk, gather a resource node, or board your ship |
| Tab | Menu: character, talents, inventory, journal, bestiary, House, society, settings |
| Enter | Chat (`/h` House, `/w name` whisper, `/r` reply) |
| M | Map |

Keys 1 to 5 also trigger the five abilities.

## Project layout

```
server/index.js   HTTP + WebSocket server, login, message routing, zone transfers, tick loop
server/world.js   The simulation of one zone (players, monsters, combat, quests, snapshots)
server/store.js   Account, character and House persistence (JSON file for now)
server/houses.js  Player Houses: founding, invitations, membership, leadership
shared/map.js     All zones (layouts, camps, landing pads, resource nodes) + collision, used by BOTH server and client
shared/defs.js    Abilities, Houses, monsters, drops, materials, gear, talents, quests, townsfolk, leveling, used by BOTH
client/index.html Login + character creator, chat, dialogs
client/game.js    Input, prediction, interpolation, effects, HUD
client/art.js     Procedural low-poly characters, creatures, terrain and buildings
client/audio.js   Synthesized sound effects
test/world.js     Map integrity, combat and AI tests against the simulation
test/bot.js       End-to-end headless bot test
CLAUDE.md         Architecture notes and roadmap for Claude Code
```
