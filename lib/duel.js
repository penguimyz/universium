// Duels: 1v1 matches between friends.
//
//   POST /api/duel/invite {friendId, rounds}  → {id}   challenge a friend (they get a "duel" SSE event)
//   GET  /api/duel/invites                    → invites waiting for me
//   GET  /api/duel/active                     → the match I'm in right now, if any
//   POST /api/duel/:id/decline
//   WS   /duel-ws?match=<id>                  → the live match (joining as the invited player accepts)
//
// The match rules live in public/games/duel/shared.js so practice mode runs the same code in the
// browser. The server owns the flow (rounds, health, cards, chat); each player's browser moves
// its own character and reports the bullets that hit it, and the damage comes from the
// shooter's cards on the server.

import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import { Match, ROUND_OPTIONS } from "../public/games/duel/shared.js";

export function registerDuel(app, { accounts }) {
  const matches = new Map();      // id → { match, socks: [ws|null, ws|null] }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  const pub = u => ({ id: u.id, username: u.username, color: u.color });
  const live = m => m.match.phase !== "closed";
  const mine = uid => [...matches.values()].find(m => live(m) && m.match.p.some(p => p.id === uid));

  const auth = fn => async (req, res) => {
    await accounts.ready;
    const me = accounts.userFrom(req);
    if (!me) return res.status(401).json({ error: "Sign in first." });
    return fn(req, res, me);
  };

  function create(host, guest, rounds) {
    const id = randomUUID().slice(0, 8);
    const entry = { socks: [null, null] };
    entry.match = new Match({
      id, rounds,
      players: [pub(host), pub(guest)],
      emit(slot, msg) {
        const text = JSON.stringify(msg);
        for (const i of slot === -1 ? [0, 1] : [slot]) {
          const ws = entry.socks[i];
          if (ws && ws.readyState === 1) ws.send(text);
        }
      },
      onClose(reason) {
        // An invite that never got answered: take it off the friend's screen.
        if (entry.wasInvite) accounts.send(guest.id, "duel", { type: "cancel", id, reason });
        setTimeout(() => {
          entry.socks.forEach(ws => { try { ws?.close(1000, "closed"); } catch {} });
          matches.delete(id);
        }, 3000);
      },
    });
    entry.wasInvite = true;
    matches.set(id, entry);
    return entry;
  }

  setInterval(() => {
    for (const e of matches.values()) {
      if (e.match.phase !== "invite") e.wasInvite = false;
      try { e.match.tick(0.05); } catch (err) { console.error("[duel] tick", err); }
    }
  }, 50).unref();

  app.post("/api/duel/invite", auth(async (req, res, me) => {
    const them = accounts.users()[String(req.body?.friendId || "")];
    if (!them || !me.friends.includes(them.id)) return res.status(400).json({ error: "You can only challenge friends." });
    if (!accounts.online(them.id)) return res.status(400).json({ error: `${them.username} isn't online right now.` });
    const rounds = ROUND_OPTIONS.includes(Number(req.body?.rounds)) ? Number(req.body.rounds) : 5;
    // One match at a time: drop any invite or finished match you were still sitting in.
    const old = mine(me.id);
    if (old) {
      if (["invite", "lobby", "over"].includes(old.match.phase)) old.match.leave(old.match.slotOf(me.id));
      else return res.status(409).json({ error: "Finish your current duel first.", id: old.match.id });
    }
    const busy = mine(them.id);
    if (busy && !["invite", "over"].includes(busy.match.phase)) return res.status(409).json({ error: `${them.username} is already in a duel.` });
    const { match } = create(me, them, rounds);
    accounts.send(them.id, "duel", { type: "invite", id: match.id, from: pub(me), rounds: match.rounds });
    res.json({ id: match.id });
  }));

  app.get("/api/duel/invites", auth(async (_req, res, me) => {
    res.setHeader("Cache-Control", "no-store");
    const list = [...matches.values()]
      .filter(e => e.match.phase === "invite" && e.match.p[1].id === me.id)
      .map(e => ({ id: e.match.id, from: { id: e.match.p[0].id, username: e.match.p[0].username, color: e.match.p[0].color }, rounds: e.match.rounds }));
    res.json({ invites: list });
  }));

  app.get("/api/duel/active", auth(async (_req, res, me) => {
    res.setHeader("Cache-Control", "no-store");
    const e = mine(me.id);
    res.json({ id: e && e.match.phase !== "invite" ? e.match.id : e && e.match.p[0].id === me.id ? e.match.id : null });
  }));

  app.post("/api/duel/:id/decline", auth(async (req, res, me) => {
    const e = matches.get(req.params.id);
    if (e && e.match.phase === "invite" && e.match.p[1].id === me.id) e.match.leave(1);
    res.json({ ok: true });
  }));

  function handleUpgrade(req, socket, head) {
    (async () => {
      await accounts.ready;
      const me = accounts.userFrom(req);
      const id = new URL(req.url, "http://x").searchParams.get("match") || "";
      const e = matches.get(id);
      const slot = e && me ? e.match.slotOf(me.id) : -1;
      wss.handleUpgrade(req, socket, head, ws => {
        if (!me) return ws.close(4001, "Sign in first.");
        if (!e || slot < 0 || e.match.phase === "closed") {
          ws.send(JSON.stringify({ t: "gone" }));
          return ws.close(4004, "No such match.");
        }
        // One connection per player: a new tab takes over from the old one.
        const old = e.socks[slot];
        e.socks[slot] = ws;
        if (old) { try { old.send(JSON.stringify({ t: "replaced" })); old.close(4000, "replaced"); } catch {} }
        if (slot === 1 && e.match.phase === "invite") accounts.send(me.id, "duel", { type: "cancel", id, reason: "accepted" });
        ws.send(JSON.stringify({ t: "hello", you: slot }));
        e.match.connect(slot);

        let budget = 200, last = Date.now();
        ws.on("message", data => {
          const now = Date.now();
          budget = Math.min(200, budget + (now - last) * 0.12); last = now; // ~120 messages/second
          if (--budget < 0) return;
          let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
          try { e.match.handle(slot, msg); } catch (err) { console.error("[duel] handle", err); }
        });
        ws.on("close", () => { if (e.socks[slot] === ws) { e.socks[slot] = null; e.match.disconnect(slot); } });
        ws.on("error", () => {});
      });
    })().catch(() => socket.destroy());
  }

  return { handleUpgrade, matches };
}
