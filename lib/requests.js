// Game requests: anyone can suggest a game or vote for an existing suggestion.
//
//   GET    /api/game-requests            → { requests }            (public list, sorted by votes)
//   POST   /api/game-requests            { name, link?, note? }    (dupes count as a vote)
//   POST   /api/game-requests/:id/vote
//   Admin (set ADMIN_KEY, send it as the x-admin-key header):
//   GET    /api/game-requests/admin       → full list including links
//   PATCH  /api/game-requests/:id         { status: "open" | "added" }
//   DELETE /api/game-requests/:id
//
// Stored as JSON in DATA_DIR (defaults to /data if it exists, otherwise ./data).
// Set GAME_REQUEST_WEBHOOK to a Discord webhook URL to get pinged for new requests.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const MAX_REQUESTS = 500;
const LIMITS = { create: [5, 60 * 60 * 1000], vote: [40, 60 * 60 * 1000] };

export function registerRequests(app, { rootDir }) {
  const dir = process.env.DATA_DIR || (existsSync("/data") ? "/data" : join(rootDir, "data"));
  const file = join(dir, "game-requests.json");
  let db = { salt: randomBytes(16).toString("hex"), requests: [] };
  let saveTimer = null;

  const ready = (async () => {
    try { db = { ...db, ...JSON.parse(await readFile(file, "utf8")) }; }
    catch (e) { if (e.code !== "ENOENT") console.error("[requests] couldn't read", file, e.message); }
  })();

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await mkdir(dir, { recursive: true });
        const tmp = file + ".tmp";
        await writeFile(tmp, JSON.stringify(db));
        await rename(tmp, file); // atomic: never leaves a half-written file
      } catch (e) { console.error("[requests] save failed:", e.message); }
    }, 400);
  }

  const ipOf = req => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  const voter = req => createHash("sha256").update(db.salt + ipOf(req)).digest("hex").slice(0, 20);
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

  const hits = new Map();
  function limited(kind, req) {
    const [max, win] = LIMITS[kind];
    const key = kind + ":" + voter(req), now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < win);
    if (arr.length >= max) { hits.set(key, arr); return true; }
    arr.push(now); hits.set(key, arr);
    return false;
  }
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 3600000)) hits.delete(k); }, 600000).unref();

  function publicList(req) {
    const me = voter(req);
    return [...db.requests]
      .sort((a, b) => (a.status === "added") - (b.status === "added") || b.votes - a.votes || a.createdAt - b.createdAt)
      .map(r => ({ id: r.id, name: r.name, note: r.note, votes: r.votes, status: r.status, createdAt: r.createdAt, voted: r.voters.includes(me) }));
  }

  function notify(r, merged) {
    const hook = process.env.GAME_REQUEST_WEBHOOK;
    if (!hook) return;
    const lines = [merged ? `+1 for **${r.name}** (now ${r.votes} votes)` : `New game request: **${r.name}**`];
    if (!merged && r.link) lines.push(`<${r.link}>`);
    if (!merged && r.note) lines.push(`> ${r.note}`);
    fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: lines.join("\n"), allowed_mentions: { parse: [] } }) })
      .catch(e => console.error("[requests] webhook failed:", e.message));
  }

  const isAdmin = req => process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;

  app.get("/api/game-requests", async (req, res) => {
    await ready;
    res.setHeader("Cache-Control", "no-store");
    res.json({ requests: publicList(req) });
  });

  app.get("/api/game-requests/admin", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
    await ready;
    res.json({ requests: db.requests.map(({ voters, ...r }) => r) });
  });

  app.post("/api/game-requests", async (req, res) => {
    await ready;
    const name = clean(req.body?.name, 60);
    const note = clean(req.body?.note, 280);
    let link = clean(req.body?.link, 300);
    if (name.length < 2) return res.status(400).json({ error: "Give the game a name." });
    if (link) {
      if (!/^https?:\/\//i.test(link)) link = "https://" + link;
      try { new URL(link); } catch { return res.status(400).json({ error: "That link doesn't look right." }); }
    }
    if (limited("create", req)) return res.status(429).json({ error: "That's a lot of requests. Try again in an hour." });

    const me = voter(req);
    const existing = db.requests.find(r => norm(r.name) === norm(name));
    if (existing) {
      if (!existing.voters.includes(me)) { existing.voters.push(me); existing.votes++; notify(existing, true); save(); }
      return res.json({ merged: true, requests: publicList(req) });
    }
    const r = { id: randomUUID().slice(0, 8), name, link, note, votes: 1, voters: [me], status: "open", createdAt: Date.now() };
    db.requests.push(r);
    if (db.requests.length > MAX_REQUESTS) {
      // Drop the least-wanted open request to keep the file bounded.
      const open = db.requests.filter(x => x.status === "open").sort((a, b) => a.votes - b.votes || a.createdAt - b.createdAt);
      db.requests = db.requests.filter(x => x !== open[0]);
    }
    save(); notify(r, false);
    res.status(201).json({ created: true, requests: publicList(req) });
  });

  app.post("/api/game-requests/:id/vote", async (req, res) => {
    await ready;
    const r = db.requests.find(x => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: "That request is gone." });
    if (limited("vote", req)) return res.status(429).json({ error: "Slow down a little." });
    const me = voter(req);
    if (!r.voters.includes(me)) { r.voters.push(me); r.votes++; save(); }
    res.json({ requests: publicList(req) });
  });

  app.patch("/api/game-requests/:id", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
    await ready;
    const r = db.requests.find(x => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: "Not found" });
    if (["open", "added"].includes(req.body?.status)) r.status = req.body.status;
    save(); res.json({ ok: true });
  });

  app.delete("/api/game-requests/:id", async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
    await ready;
    db.requests = db.requests.filter(x => x.id !== req.params.id);
    save(); res.json({ ok: true });
  });
}
