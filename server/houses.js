// Player Houses: guilds that players found and grow with their friends.
// Founding, invitations, membership, leadership and mottos. Every request is validated here; the client only asks.
// Members are stored as lower-cased usernames; a character's `house` field holds its House key (the lower-cased name).
const { HOUSE_RULES: R, HERALD_COLORS, SIGILS, validHouseName } = require('../shared/defs.js');
const MAP = require('../shared/map.js');
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

class Houses {
  // store: persistence (getHouse/putHouse/removeHouse/getChar). online: Map of lower-cased username -> player. announce(msg): global system message.
  constructor(store, online, announce) { this.store = store; this.online = online; this.announce = announce || (() => {}); this.invites = new Map(); }
  // Called at login with the saved key: binds the player's House fields, or clears them if the House is gone.
  attach(p, key) { const h = typeof key === 'string' ? this.store.getHouse(key) : null; this.bind(p, h && h.members.includes(p.username.toLowerCase()) ? key : null); }
  bind(p, key) { const h = key ? this.store.getHouse(key) : null; p.hkey = h ? key : null; p.hname = h ? h.name : ''; p.hcolor = h ? h.color : ''; p.hsigil = h ? h.sigil : ''; }
  view(key) {
    const h = this.store.getHouse(key); if (!h) return null;
    const members = h.members.map(u => { const o = this.online.get(u), c = this.store.getChar(u) || {};
      return { name: o ? o.name : c.name || u, level: o ? o.level : c.level || 1, online: !!o, zone: o ? MAP.ZONES[o.zone].name : null, leader: u === h.leader }; });
    members.sort((a, b) => (b.leader - a.leader) || (b.online - a.online) || (b.level - a.level));
    return { name: h.name, color: h.color, sigil: h.sigil, motto: h.motto, created: h.created, members };
  }
  // Push the current House view to every online member.
  sync(key) { const h = this.store.getHouse(key), v = h && this.view(key); if (!h) return; for (const u of h.members) { const o = this.online.get(u); if (o) o.send({ t: 'house', h: v }); } }
  notify(key, msg) { const h = this.store.getHouse(key); if (!h) return; for (const u of h.members) { const o = this.online.get(u); if (o) o.send({ t: 'chat', from: '', msg, ch: 'h' }); } }
  say(p, msg) { p.send({ t: 'notice', msg }); }
  // House chat to online members.
  chat(p, msg) { if (!p.hkey) return this.say(p, 'You are not in a House.'); const h = this.store.getHouse(p.hkey); for (const u of h.members) { const o = this.online.get(u); if (o) o.send({ t: 'chat', from: p.name, msg, ch: 'h' }); } }
  // A player's pending invitations as [{ key, name, color, sigil, from }]
  pending(p) { const now = Date.now(), out = [], inv = this.invites.get(p.username.toLowerCase()); if (!inv) return out;
    for (const [key, i] of inv) { const h = this.store.getHouse(key); if (!h || now - i.at > R.inviteTtl * 1000) { inv.delete(key); continue; } out.push({ key, name: h.name, color: h.color, sigil: h.sigil, from: i.from }); } return out; }
  handle(p, m) {
    const me = p.username.toLowerCase(), h = p.hkey ? this.store.getHouse(p.hkey) : null, lead = h && h.leader === me;
    switch (m.action) {
      case 'info': p.send({ t: 'house', h: h ? this.view(p.hkey) : null, invites: this.pending(p) }); return;
      case 'create': {
        if (h) return this.say(p, 'Leave your House before founding another.');
        const name = clean(m.name, 64).replace(/ +/g, ' '); // over-long names fail validation rather than being cut short
        if (!validHouseName(name)) return this.say(p, `House names are ${R.nameMin}-${R.nameMax} letters (spaces and apostrophes allowed).`);
        if (!HERALD_COLORS.includes(m.color) || !SIGILS.includes(m.sigil)) return this.say(p, 'Choose a color and a sigil.');
        const key = name.toLowerCase(); if (this.store.getHouse(key)) return this.say(p, 'A House with that name already exists.');
        this.store.putHouse(key, { name, color: m.color, sigil: m.sigil, motto: '', leader: me, members: [me], created: Date.now() });
        this.bind(p, key); this.sync(key); this.announce(`${p.name} has founded House ${name}.`); return; }
      case 'invite': {
        if (!h) return this.say(p, 'You are not in a House.');
        if (h.members.length >= R.maxMembers) return this.say(p, `A House can hold ${R.maxMembers} members.`);
        const t = this.online.get(clean(m.target, 16).toLowerCase());
        if (!t) return this.say(p, 'That player is not online.'); if (t === p) return;
        if (t.hkey) return this.say(p, `${t.name} already belongs to a House.`);
        const tu = t.username.toLowerCase(); if (!this.invites.has(tu)) this.invites.set(tu, new Map());
        this.invites.get(tu).set(p.hkey, { from: p.name, at: Date.now() });
        t.send({ t: 'hinvite', key: p.hkey, name: h.name, color: h.color, sigil: h.sigil, from: p.name });
        this.say(p, `Invitation sent to ${t.name}.`); return; }
      case 'accept': case 'decline': {
        const key = clean(m.key, R.nameMax).toLowerCase(), inv = this.invites.get(me), ok = this.pending(p).some(i => i.key === key);
        if (inv) inv.delete(key);
        if (m.action === 'decline' || !ok) { if (!ok && m.action === 'accept') this.say(p, 'That invitation has expired.'); p.send({ t: 'house', h: h ? this.view(p.hkey) : null, invites: this.pending(p) }); return; }
        if (h) return this.say(p, 'Leave your House first.');
        const nh = this.store.getHouse(key); if (nh.members.length >= R.maxMembers) return this.say(p, 'That House is full.');
        nh.members.push(me); this.store.putHouse(key, nh); this.invites.delete(me);
        this.bind(p, key); this.notify(key, `${p.name} has joined the House.`); this.sync(key); return; }
      case 'leave': {
        if (!h) return; const key = p.hkey;
        h.members = h.members.filter(u => u !== me); this.bind(p, null); p.send({ t: 'house', h: null, invites: this.pending(p) });
        if (!h.members.length) { this.store.removeHouse(key); this.announce(`House ${h.name} has faded into history.`); return; }
        if (lead) h.leader = h.members[0];
        this.store.putHouse(key, h); this.notify(key, `${p.name} has left the House.`); this.sync(key); return; }
      case 'kick': case 'lead': {
        if (!lead) return this.say(p, 'Only the head of the House can do that.');
        const tu = clean(m.target, 16).toLowerCase(); if (tu === me || !h.members.includes(tu)) return;
        const name = (this.online.get(tu) || {}).name || (this.store.getChar(tu) || {}).name || tu;
        if (m.action === 'lead') { h.leader = tu; this.store.putHouse(p.hkey, h); this.notify(p.hkey, `${name} now leads the House.`); this.sync(p.hkey); return; }
        h.members = h.members.filter(u => u !== tu); this.store.putHouse(p.hkey, h);
        const t = this.online.get(tu); if (t) { this.bind(t, null); t.send({ t: 'house', h: null, invites: this.pending(t) }); this.say(t, `You were removed from House ${h.name}.`); }
        this.notify(p.hkey, `${name} was removed from the House.`); this.sync(p.hkey); return; }
      case 'motto': {
        if (!lead) return this.say(p, 'Only the head of the House can do that.');
        h.motto = clean(m.text, R.mottoMax); this.store.putHouse(p.hkey, h); this.sync(p.hkey); return; }
      case 'disband': {
        if (!lead) return this.say(p, 'Only the head of the House can do that.');
        const key = p.hkey; for (const u of h.members) { const o = this.online.get(u); if (o) { this.bind(o, null); o.send({ t: 'house', h: null, invites: this.pending(o) }); } }
        this.store.removeHouse(key); this.announce(`House ${h.name} has been disbanded.`); return; }
    }
  }
}
module.exports = { Houses };
