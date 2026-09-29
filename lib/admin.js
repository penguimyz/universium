// Admin page API. Only accounts listed in ADMIN_USERNAMES can use it.
//
//   GET    /api/admin/overview                 counts, uptime, version, AI status
//   GET    /api/admin/users?q=                 accounts (no passwords, no messages)
//   POST   /api/admin/users/:id/ban  {banned}  ban/unban (signs them out everywhere)
//   POST   /api/admin/users/:id/password       sets and returns a temporary password
//   DELETE /api/admin/users/:id                deletes the account, friends and messages
//   GET    /api/admin/requests                 game requests including links
//   PATCH  /api/admin/requests/:id {status}    "open" | "added"
//   DELETE /api/admin/requests/:id
//   POST   /api/admin/announcement {text, tone}  site-wide banner ("" clears it)
//   GET    /api/announcement                   public: the current banner
//
// Admins can't read anyone's private messages; there's deliberately no endpoint for that.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function registerAdmin(app, { accounts, requests, rootDir, aiStatus, version, startedAt }) {
  const dir = process.env.DATA_DIR || (existsSync("/data") ? "/data" : join(rootDir, "data"));
  const siteFile = join(dir, "site.json");
  let site = { announcement: null };
  const ready = (async () => { try { site = { ...site, ...JSON.parse(await readFile(siteFile, "utf8")) }; } catch {} })();
  async function saveSite() {
    try { await mkdir(dir, { recursive: true }); await writeFile(siteFile + ".tmp", JSON.stringify(site)); await rename(siteFile + ".tmp", siteFile); }
    catch (e) { console.error("[admin] save failed:", e.message); }
  }

  const admin = fn => async (req, res) => {
    await accounts.ready;
    const me = accounts.userFrom(req);
    if (!me || !accounts.isAdminName(me.username)) return res.status(403).json({ error: "Admins only." });
    res.setHeader("Cache-Control", "no-store");
    try { await fn(req, res, me); } catch (e) { console.error("[admin]", e); if (!res.headersSent) res.status(500).json({ error: e.message }); }
  };
  const target = (req, res, me) => {
    const u = accounts.users()[req.params.id];
    if (!u) { res.status(404).json({ error: "No such account." }); return null; }
    if (accounts.isAdminName(u.username) && u.id !== me.id) { res.status(403).json({ error: "You can't do that to another admin." }); return null; }
    return u;
  };

  app.get("/api/admin/overview", admin(async (_req, res) => {
    const users = Object.values(accounts.users());
    const reqs = requests.all();
    const dayAgo = Date.now() - 864e5;
    res.json({
      version, uptime: Date.now() - startedAt,
      users: users.length, newToday: users.filter(u => u.created > dayAgo).length, banned: users.filter(u => u.banned).length,
      ...accounts.stats(),
      requestsOpen: reqs.filter(r => r.status !== "added").length, requestsAdded: reqs.filter(r => r.status === "added").length,
      votes: reqs.reduce((a, r) => a + r.votes, 0),
      ai: await aiStatus().catch(e => ({ ok: false, message: e.message })),
      announcement: site.announcement,
    });
  }));

  app.get("/api/admin/users", admin(async (req, res) => {
    const q = String(req.query.q || "").toLowerCase();
    const list = Object.values(accounts.users())
      .filter(u => !q || u.username.toLowerCase().includes(q))
      .sort((a, b) => b.created - a.created)
      .slice(0, 300)
      .map(u => ({ id: u.id, username: u.username, color: u.color, created: u.created, friends: u.friends.length, online: accounts.online(u.id), banned: !!u.banned, admin: accounts.isAdminName(u.username) }));
    res.json({ users: list });
  }));

  app.post("/api/admin/users/:id/ban", admin(async (req, res, me) => {
    const u = target(req, res, me); if (!u) return;
    if (u.id === me.id) return res.status(400).json({ error: "You can't ban yourself." });
    accounts.setBanned(u.id, !!req.body?.banned);
    res.json({ ok: true });
  }));

  app.post("/api/admin/users/:id/password", admin(async (req, res, me) => {
    const u = target(req, res, me); if (!u) return;
    res.json({ password: await accounts.resetPassword(u.id) });
  }));

  app.delete("/api/admin/users/:id", admin(async (req, res, me) => {
    const u = target(req, res, me); if (!u) return;
    if (u.id === me.id) return res.status(400).json({ error: "Delete your own account from Settings instead." });
    accounts.removeUser(u.id);
    res.json({ ok: true });
  }));

  app.get("/api/admin/requests", admin(async (_req, res) => {
    await requests.ready;
    res.json({ requests: [...requests.all()].sort((a, b) => (a.status === "added") - (b.status === "added") || b.votes - a.votes).map(({ voters, ...r }) => r) });
  }));
  app.patch("/api/admin/requests/:id", admin(async (req, res) => {
    res.json({ ok: requests.setStatus(req.params.id, req.body?.status) });
  }));
  app.delete("/api/admin/requests/:id", admin(async (req, res) => {
    res.json({ ok: requests.remove(req.params.id) });
  }));

  app.post("/api/admin/announcement", admin(async (req, res, me) => {
    await ready;
    const text = String(req.body?.text || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 280);
    const tone = ["info", "warn", "party"].includes(req.body?.tone) ? req.body.tone : "info";
    site.announcement = text ? { text, tone, id: Date.now().toString(36), by: me.username, at: Date.now() } : null;
    await saveSite();
    res.json({ announcement: site.announcement });
  }));
  app.get("/api/announcement", async (_req, res) => {
    await ready;
    res.setHeader("Cache-Control", "no-store");
    res.json({ announcement: site.announcement });
  });
}
