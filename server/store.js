// Account, character and player-House persistence.
// Starter implementation: one JSON file on disk, written atomically. Fine for a handful of players.
// ROADMAP: swap this module for Postgres (see CLAUDE.md, phase 2). Keep the same function signatures.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'accounts.json');
let db = { accounts: {}, houses: {} }, dirty = false;

function load() {
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { db = {}; }
  if (!db.accounts || typeof db.accounts !== 'object') db.accounts = {};
  if (!db.houses || typeof db.houses !== 'object') db.houses = {};
  console.log(`[store] ${Object.keys(db.accounts).length} accounts and ${Object.keys(db.houses).length} Houses loaded from ${FILE}`);
}
function flush() {
  if (!dirty) return; dirty = false;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE);
}
// Own-property lookup only, so names like __proto__ or constructor never resolve to Object.prototype members.
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const acct = (key) => own(db.accounts, key) ? db.accounts[key] : null;
function hashPassword(pass, salt) { return crypto.scryptSync(pass, salt, 64).toString('hex'); }

// `look` is { house, hair, tone }, already validated by the caller. Every character is a Gold.
// New characters start at the spawn point of `zone` (x and y are null until the first save).
function createAccount(username, password, look, zone) {
  const key = username.toLowerCase();
  if (acct(key) || key === '__proto__') return { error: 'That name is taken.' };
  const salt = crypto.randomBytes(16).toString('hex');
  db.accounts[key] = { username, salt, hash: hashPassword(password, salt), created: Date.now(),
    char: { name: username, look, level: 1, xp: 0, zone, x: null, y: null, hp: null, quests: {} } };
  dirty = true; return { account: db.accounts[key] };
}
function verify(username, password) {
  const acc = acct(username.toLowerCase()); if (!acc) return null;
  const h = hashPassword(password, acc.salt);
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(acc.hash, 'hex')) ? acc : null;
}
function saveChar(username, char) { const acc = acct(username.toLowerCase()); if (!acc) return; acc.char = char; dirty = true; }
// A saved character, for showing offline House members. Returns null for unknown names.
function getChar(username) { const acc = acct(String(username).toLowerCase()); return acc ? acc.char : null; }

// Player Houses, keyed by lower-cased name: { name, color, sigil, motto, leader, members: [username], created }
const getHouse = (key) => own(db.houses, key) ? db.houses[key] : null;
function putHouse(key, house) { if (key === '__proto__') return; db.houses[key] = house; dirty = true; }
function removeHouse(key) { if (own(db.houses, key)) { delete db.houses[key]; dirty = true; } }

module.exports = { load, flush, createAccount, verify, saveChar, getChar, getHouse, putHouse, removeHouse };
