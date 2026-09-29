// Accounts, friends and direct messages.
//
// Auth:     POST /api/auth/signup {username, password}   POST /api/auth/login   POST /api/auth/logout
//           GET  /api/me                                   DELETE /api/account {password}
// Friends:  POST /api/friends/request {username}   POST /api/friends/:id/(accept|decline|remove|block|unblock)
// Messages: GET  /api/messages/:friendId?before=<t>   POST /api/messages/:friendId {text}
//           POST /api/messages/:friendId/read
// Live:     GET  /api/events  (Server-Sent Events: message, friends, presence, typing)
//
// Messages only flow between accepted friends. Passwords are hashed with scrypt; sessions are
// random tokens stored hashed, sent as an HttpOnly cookie. Everything lives in JSON files in
// DATA_DIR (same folder as game requests).

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { scrypt, randomBytes, createHash, timingSafeEqual, randomUUID } from "node:crypto";

const SESSION_DAYS = 60;
const MAX_MSG = 1000;
const KEEP_PER_CONV = 300;
const USERNAME = /^[a-zA-Z0-9_]{3,20}$/;
const RESERVED = new Set(["admin", "administrator", "universium", "mod", "moderator", "system", "support"]);

// Accounts listed in ADMIN_USERNAMES (comma-separated) are admins. They get the Admin page,
// an "Admin" badge, and may register names that are otherwise reserved (like "admin").
const adminNames = () => new Set((process.env.ADMIN_USERNAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
export const isAdminName = name => adminNames().has(String(name || "").toLowerCase());

const scryptAsync = (pw, salt) => new Promise((ok, bad) => scrypt(pw, salt, 64, { N: 16384 }, (e, k) => e ? bad(e) : ok(k)));
const sha = s => createHash("sha256").update(s).digest("hex");
const convKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function jsonFile(dir, name, initial) {
  const file = join(dir, name);
  let data = initial, timer = null;
  const ready = (async () => {
    try { data = { ...initial, ...JSON.parse(await readFile(file, "utf8")) }; }
    catch (e) { if (e.code !== "ENOENT") console.error("[accounts] couldn't read", file, e.message); }
  })();
  return {
    ready,
    get: () => data,
    save() {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await mkdir(dir, { recursive: true });
          await writeFile(file + ".tmp", JSON.stringify(data));
          await rename(file + ".tmp", file);
        } catch (e) { console.error("[accounts] save failed:", e.message); }
      }, 300);
    },
  };
}

export function registerAccounts(app, { rootDir }) {
  const dir = process.env.DATA_DIR || (existsSync("/data") ? "/data" : join(rootDir, "data"));
  const usersDb = jsonFile(dir, "users.json", { users: {}, sessions: {} });
  const msgDb = jsonFile(dir, "messages.json", { convs: {} });
  const ready = Promise.all([usersDb.ready, msgDb.ready]);
  const U = () => usersDb.get().users;
  const S = () => usersDb.get().sessions;

  /* ── rate limiting ── */
  const hits = new Map();
  const ipOf = req => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  function limited(key, max, windowMs) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    const over = arr.length >= max;
    if (!over) arr.push(now);
    hits.set(key, arr);
    return over;
  }
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 3600000)) hits.delete(k); }, 600000).unref();

  /* ── sessions ── */
  function cookies(req) {
    const out = {};
    for (const part of (req.headers.cookie || "").split(";")) {
      const i = part.indexOf("="); if (i < 0) continue;
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }
  function setSession(req, res, uid) {
    const token = randomBytes(32).toString("base64url");
    S()[sha(token)] = { uid, exp: Date.now() + SESSION_DAYS * 864e5 };
    usersDb.save();
    const secure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted;
    res.setHeader("Set-Cookie", `uos_sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`);
  }
  function clearSession(req, res) {
    const t = cookies(req).uos_sess;
    if (t) { delete S()[sha(t)]; usersDb.save(); }
    res.setHeader("Set-Cookie", "uos_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  }
  function userFrom(req) {
    const t = cookies(req).uos_sess; if (!t) return null;
    const s = S()[sha(t)];
    if (!s || s.exp < Date.now()) return null;
    const u = U()[s.uid];
    return u && !u.banned ? u : null;
  }
  const auth = fn => async (req, res) => {
    await ready;
    const me = userFrom(req);
    if (!me) return res.status(401).json({ error: "Sign in first." });
    return fn(req, res, me);
  };
  setInterval(() => { const now = Date.now(); let dirty = false; for (const [k, s] of Object.entries(S())) if (s.exp < now) { delete S()[k]; dirty = true; } if (dirty) usersDb.save(); }, 3600000).unref();

  /* ── live events (SSE) ── */
  const streams = new Map(); // uid → Set(res)
  const online = uid => streams.has(uid) && streams.get(uid).size > 0;
  function send(uid, type, data) {
    for (const res of streams.get(uid) || []) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  function tellFriends(u, type, data) { for (const f of u.friends) send(f, type, data); }

  /* ── views ── */
  const pub = u => ({ id: u.id, username: u.username, color: u.color, ...(isAdminName(u.username) ? { admin: true } : {}) });
  function unreadFor(me, fid) {
    const conv = msgDb.get().convs[convKey(me.id, fid)] || [];
    const seen = me.reads?.[fid] || 0;
    let n = 0; for (let i = conv.length - 1; i >= 0 && conv[i].t > seen; i--) if (conv[i].from !== me.id) n++;
    return n;
  }
  function lastMsg(me, fid) { const c = msgDb.get().convs[convKey(me.id, fid)]; return c?.length ? c[c.length - 1] : null; }
  function meView(me) {
    const list = ids => ids.map(id => U()[id]).filter(Boolean);
    return {
      user: pub(me),
      friends: list(me.friends).map(f => ({ ...pub(f), online: online(f.id), unread: unreadFor(me, f.id), last: lastMsg(me, f.id) }))
        .sort((a, b) => (b.last?.t || 0) - (a.last?.t || 0) || a.username.localeCompare(b.username)),
      incoming: list(me.incoming).map(pub),
      outgoing: list(me.outgoing).map(pub),
      blocked: list(me.blocked).map(pub),
    };
  }
  const pushFriends = (...users) => users.forEach(u => send(u.id, "friends", meView(u)));

  function findByName(name) {
    const n = String(name || "").trim().toLowerCase();
    return Object.values(U()).find(u => u.username.toLowerCase() === n) || null;
  }
  const without = (arr, id) => arr.filter(x => x !== id);

  /* ── auth routes ── */
  app.post("/api/auth/signup", async (req, res) => {
    await ready;
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (!USERNAME.test(username)) return res.status(400).json({ error: "Usernames are 3–20 letters, numbers or underscores." });
    if (RESERVED.has(username.toLowerCase()) && !isAdminName(username)) return res.status(400).json({ error: "That username is reserved. Pick another one." });
    if (password.length < 6 || password.length > 200) return res.status(400).json({ error: "Use a password with at least 6 characters." });
    if (limited("signup:" + ipOf(req), 5, 3600000)) return res.status(429).json({ error: "Too many new accounts from here. Try again later." });
    if (findByName(username)) return res.status(409).json({ error: "That username is taken." });
    const salt = randomBytes(16).toString("hex");
    const hash = (await scryptAsync(password, salt)).toString("hex");
    const id = randomUUID().slice(0, 12);
    const hue = parseInt(sha(username).slice(0, 4), 16) % 360;
    U()[id] = { id, username, salt, hash, created: Date.now(), color: hue, friends: [], incoming: [], outgoing: [], blocked: [], reads: {} };
    usersDb.save();
    setSession(req, res, id);
    res.status(201).json(meView(U()[id]));
  });

  app.post("/api/auth/login", async (req, res) => {
    await ready;
    if (limited("login:" + ipOf(req), 20, 15 * 60000)) return res.status(429).json({ error: "Too many tries. Wait a few minutes." });
    const u = findByName(req.body?.username);
    const pw = String(req.body?.password || "");
    const ok = u && timingSafeEqual(Buffer.from(u.hash, "hex"), await scryptAsync(pw, u.salt));
    if (!ok) return res.status(401).json({ error: "Wrong username or password." });
    if (u.banned) return res.status(403).json({ error: "This account has been banned." });
    setSession(req, res, u.id);
    res.json(meView(u));
  });

  app.post("/api/auth/logout", async (req, res) => { await ready; clearSession(req, res); res.json({ ok: true }); });

  app.get("/api/me", async (req, res) => {
    await ready;
    res.setHeader("Cache-Control", "no-store");
    const me = userFrom(req);
    if (!me) return res.status(401).json({ user: null });
    res.json(meView(me));
  });

  app.delete("/api/account", auth(async (req, res, me) => {
    const ok = timingSafeEqual(Buffer.from(me.hash, "hex"), await scryptAsync(String(req.body?.password || ""), me.salt));
    if (!ok) return res.status(401).json({ error: "Wrong password." });
    removeUser(me.id);
    res.setHeader("Set-Cookie", "uos_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    res.json({ ok: true });
  }));

  function removeUser(uid) {
    const me = U()[uid]; if (!me) return false;
    kick(uid);
    for (const u of Object.values(U())) {
      if (u.id === me.id) continue;
      const had = u.friends.includes(me.id) || u.incoming.includes(me.id) || u.outgoing.includes(me.id);
      u.friends = without(u.friends, me.id); u.incoming = without(u.incoming, me.id); u.outgoing = without(u.outgoing, me.id); u.blocked = without(u.blocked, me.id);
      if (had) pushFriends(u);
    }
    for (const k of Object.keys(msgDb.get().convs)) if (k.split("|").includes(me.id)) delete msgDb.get().convs[k];
    for (const [k, s] of Object.entries(S())) if (s.uid === me.id) delete S()[k];
    delete U()[me.id];
    usersDb.save(); msgDb.save();
    return true;
  }
  // Sign someone out everywhere and close their live connections.
  function kick(uid) {
    for (const [k, s] of Object.entries(S())) if (s.uid === uid) delete S()[k];
    for (const res of streams.get(uid) || []) { try { res.end(); } catch {} }
    streams.delete(uid);
    usersDb.save();
  }

  /* ── friends ── */
  app.post("/api/friends/request", auth(async (req, res, me) => {
    if (limited("freq:" + me.id, 30, 3600000)) return res.status(429).json({ error: "Slow down a little." });
    const them = findByName(req.body?.username);
    if (!them || them.id === me.id) return res.status(404).json({ error: them ? "That's you." : "No one has that username." });
    if (me.friends.includes(them.id)) return res.status(400).json({ error: `You're already friends with ${them.username}.` });
    if (me.blocked.includes(them.id)) return res.status(400).json({ error: `Unblock ${them.username} first.` });
    if (them.blocked.includes(me.id)) return res.json(meView(me)); // don't reveal the block
    if (me.incoming.includes(them.id)) {
      // They already asked: accept.
      me.incoming = without(me.incoming, them.id); them.outgoing = without(them.outgoing, me.id);
      me.friends.push(them.id); them.friends.push(me.id);
    } else if (!me.outgoing.includes(them.id)) {
      me.outgoing.push(them.id); them.incoming.push(me.id);
    }
    usersDb.save(); pushFriends(me, them);
    res.json(meView(me));
  }));

  app.post("/api/friends/:id/:action", auth(async (req, res, me) => {
    const them = U()[req.params.id];
    const action = req.params.action;
    if (!them) return res.status(404).json({ error: "That person isn't around anymore." });
    switch (action) {
      case "accept":
        if (!me.incoming.includes(them.id)) return res.status(400).json({ error: "No request from them." });
        me.incoming = without(me.incoming, them.id); them.outgoing = without(them.outgoing, me.id);
        if (!me.friends.includes(them.id)) { me.friends.push(them.id); them.friends.push(me.id); }
        break;
      case "decline":
        me.incoming = without(me.incoming, them.id); them.outgoing = without(them.outgoing, me.id);
        me.outgoing = without(me.outgoing, them.id); them.incoming = without(them.incoming, me.id); // also cancels my request
        break;
      case "remove":
        me.friends = without(me.friends, them.id); them.friends = without(them.friends, me.id);
        break;
      case "block":
        me.friends = without(me.friends, them.id); them.friends = without(them.friends, me.id);
        me.incoming = without(me.incoming, them.id); them.outgoing = without(them.outgoing, me.id);
        me.outgoing = without(me.outgoing, them.id); them.incoming = without(them.incoming, me.id);
        if (!me.blocked.includes(them.id)) me.blocked.push(them.id);
        break;
      case "unblock":
        me.blocked = without(me.blocked, them.id);
        break;
      default:
        return res.status(404).json({ error: "Unknown action." });
    }
    usersDb.save(); pushFriends(me, them);
    res.json(meView(me));
  }));

  /* ── messages ── */
  app.get("/api/messages/:fid", auth(async (req, res, me) => {
    const fid = req.params.fid;
    if (!me.friends.includes(fid)) return res.status(403).json({ error: "You can only message friends." });
    const conv = msgDb.get().convs[convKey(me.id, fid)] || [];
    const before = Number(req.query.before) || Infinity;
    const page = conv.filter(m => m.t < before).slice(-50);
    res.setHeader("Cache-Control", "no-store");
    res.json({ messages: page, more: conv.length > 0 && page.length > 0 && conv[0].t < page[0].t, theirRead: U()[fid]?.reads?.[me.id] || 0 });
  }));

  app.post("/api/messages/:fid", auth(async (req, res, me) => {
    const fid = req.params.fid;
    const them = U()[fid];
    if (!them || !me.friends.includes(fid)) return res.status(403).json({ error: "You can only message friends." });
    const text = String(req.body?.text || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, MAX_MSG);
    if (!text) return res.status(400).json({ error: "Empty message." });
    if (limited("msg:" + me.id, 40, 60000)) return res.status(429).json({ error: "You're sending messages too fast." });
    const key = convKey(me.id, fid);
    const convs = msgDb.get().convs;
    const conv = convs[key] || (convs[key] = []);
    const m = { id: randomUUID().slice(0, 10), from: me.id, text, t: Date.now() };
    conv.push(m);
    if (conv.length > KEEP_PER_CONV) conv.splice(0, conv.length - KEEP_PER_CONV);
    me.reads[fid] = m.t;
    msgDb.save(); usersDb.save();
    send(fid, "message", { with: me.id, from: pub(me), message: m });
    send(me.id, "message", { with: fid, message: m, echo: true });
    res.status(201).json({ message: m });
  }));

  app.post("/api/messages/:fid/read", auth(async (req, res, me) => {
    const fid = req.params.fid;
    if (!me.friends.includes(fid)) return res.status(403).json({ error: "Not friends." });
    me.reads[fid] = Date.now();
    usersDb.save();
    send(fid, "read", { by: me.id, t: me.reads[fid] });
    res.json({ ok: true });
  }));

  app.post("/api/typing/:fid", auth(async (req, res, me) => {
    if (me.friends.includes(req.params.fid) && !limited("typing:" + me.id, 30, 60000)) send(req.params.fid, "typing", { from: me.id });
    res.json({ ok: true });
  }));

  /* ── live stream ── */
  app.get("/api/events", async (req, res) => {
    await ready;
    const me = userFrom(req);
    if (!me) return res.status(401).end();
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // don't let proxies buffer the stream
    });
    res.write("retry: 4000\n\n");
    const wasOnline = online(me.id);
    if (!streams.has(me.id)) streams.set(me.id, new Set());
    streams.get(me.id).add(res);
    if (!wasOnline) tellFriends(me, "presence", { id: me.id, online: true });
    const beat = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => {
      clearInterval(beat);
      const set = streams.get(me.id);
      set?.delete(res);
      if (set && !set.size) {
        streams.delete(me.id);
        const u = U()[me.id];
        if (u) tellFriends(u, "presence", { id: me.id, online: false });
      }
    });
  });

  // Used by the admin page (lib/admin.js).
  return {
    ready, userFrom, isAdminName, online, removeUser, kick,
    users: () => U(),
    stats() {
      const convs = msgDb.get().convs;
      return { conversations: Object.keys(convs).length, messages: Object.values(convs).reduce((a, c) => a + c.length, 0), onlineNow: streams.size };
    },
    setBanned(uid, banned) { const u = U()[uid]; if (!u) return false; u.banned = !!banned; if (banned) kick(uid); usersDb.save(); if (!banned) pushFriends(u); else tellFriends(u, "presence", { id: uid, online: false }); return true; },
    async resetPassword(uid) {
      const u = U()[uid]; if (!u) return null;
      const temp = randomBytes(6).toString("base64url");
      u.salt = randomBytes(16).toString("hex");
      u.hash = (await scryptAsync(temp, u.salt)).toString("hex");
      kick(uid);
      return temp;
    },
  };
}