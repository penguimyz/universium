import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";
import express from "express";
import compression from "compression";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import wisp from "wisp-server-node";
import barePkg from "@tomphttp/bare-server-node";
import { SocksProxyAgent } from "socks-proxy-agent";
import { registerExtras } from "./lib/extras.js";
import { registerRequests } from "./lib/requests.js";
import { registerAccounts } from "./lib/accounts.js";
import { registerAdmin } from "./lib/admin.js";
import { registerDuel } from "./lib/duel.js";
import { dataDir, isPersistent } from "./lib/datadir.js";
const { createBareServer } = barePkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const bare = createBareServer("/bare/");
const app = express();
// Bump on each release; shown in Settings so you can tell which build is live.
const VERSION = "2026.10.06-1";
const STARTED_AT = Date.now();
app.disable("x-powered-by");

// gzip text responses. Skip the CDN proxy (it streams large binaries and
// sometimes forwards upstream Content-Length) and /games/<name>.html (pre-gzipped below).
app.use(compression({
  filter: (req, res) =>
    !req.path.startsWith("/cdn-proxy/") &&
    req.path !== "/api/events" && req.path !== "/api/ai/chat" && req.path !== "/api/ai/vision" && // streams: compression would buffer them
    !/^\/games\/[^/]+\.html$/.test(req.path) &&
    compression.filter(req, res),
}));

// Serve a pre-built <file>.gz when one sits next to the requested file (e.g. Minecraft's
// 22 MB classes.js ships as a 4 MB .gz), so big files are never compressed at request time.
const gzExists = new Map();
app.use(async (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  // Only local game files; proxied paths are unbounded and must not fill this cache.
  if (!req.path.startsWith("/games/")) return next();
  if (!/\bgzip\b/.test(req.headers["accept-encoding"] || "")) return next();
  let rel;
  try { rel = decodeURIComponent(req.path); } catch { return next(); }
  if (rel.includes("..") || rel.endsWith("/")) return next();
  const file = join(__dirname, "public", rel);
  let has = gzExists.get(file);
  if (has === undefined) {
    has = await stat(file + ".gz").then(s => s.isFile(), () => false);
    gzExists.set(file, has);
  }
  if (!has) return next();
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("Content-Type", typeFor(rel) || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=604800");
  res.sendFile(file + ".gz", { headers: { "Content-Type": typeFor(rel) || "application/octet-stream" } });
});

// ── Ollama (AI) config ────────────────────────────────────────────────────────
// Ollama runs on a Windows box reachable only over the Tailscale tailnet.
// This container's tailscaled runs in userspace-networking mode, so it exposes
// a local SOCKS5 proxy (see Dockerfile: --socks5-server=localhost:1055)
// instead of a real network interface. Only calls to Ollama need to go through
// it — TMDB and everything else on the public internet stay direct.
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://100.75.157.36:11434";
const ollamaAgent = new SocksProxyAgent("socks5h://localhost:1055");

// ── SW suppressor ─────────────────────────────────────────────────────────────
const SW_SUPPRESSOR = `<script>(function(){try{
var noop=function(){return Promise.resolve({scope:'/'})};
var fake={register:noop,getRegistration:function(){return Promise.resolve(undefined)},getRegistrations:function(){return Promise.resolve([])},ready:Promise.resolve({scope:'/'}),addEventListener:function(){},removeEventListener:function(){}};
Object.defineProperty(navigator,'serviceWorker',{get:function(){return fake},configurable:false});
}catch(e){}})();</script>`;

// ── CDN proxy helpers ─────────────────────────────────────────────────────────
// jsdelivr has a 50 MB per-file limit. Game repos store large files split as
// filename.ext.part1, filename.ext.part2, … which jsDelivr auto-assembled.
// We replicate that: fetch directly from GitHub raw, and if we get a 404
// automatically fetch and stream the parts concatenated.

// Convert cdn.jsdelivr.net/gh/USER/REPO@BRANCH/PATH → raw.githubusercontent.com/USER/REPO/BRANCH/PATH
function jsdToRaw(hostAndPath) {
  const m = hostAndPath.match(/^cdn\.jsdelivr\.net\/gh\/([^/@]+)\/([^@]+)@([^/]+)\/?(.*)$/);
  if (m) {
    const [, user, repo, branch, rest] = m;
    // web-dashers publishes its live site on jsDelivr's @latest alias, but
    // GitHub's raw host only exposes the main branch. Keep the proxy's
    // same-origin behavior while resolving that alias correctly.
    const rawBranch =
      user === "web-dashers" && repo === "web-dashers.github.io" && branch === "latest"
        ? "main"
        : branch;
    return { hostname: "raw.githubusercontent.com", path: `/${user}/${repo}/${rawBranch}/${rest}` };
  }
  try {
    const u = new URL("https://" + hostAndPath);
    return { hostname: u.hostname, path: u.pathname + u.search };
  } catch { return null; }
}

const CONTENT_TYPES = {
  wasm: "application/wasm",
  js:   "application/javascript",
  mjs:  "application/javascript",
  json: "application/json",
  css:  "text/css",
  html: "text/html; charset=utf-8",
  htm:  "text/html; charset=utf-8",
  txt:  "text/plain; charset=utf-8",
  xml:  "application/xml",
  svg:  "image/svg+xml",
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  gif:  "image/gif",
  webp: "image/webp",
  ico:  "image/x-icon",
  mp3:  "audio/mpeg",
  ogg:  "audio/ogg",
  wav:  "audio/wav",
  m4a:  "audio/mp4",
  mp4:  "video/mp4",
  webm: "video/webm",
  woff: "font/woff",
  woff2:"font/woff2",
  ttf:  "font/ttf",
  otf:  "font/otf",
  pck:  "application/octet-stream",
  data: "application/octet-stream",
  unityweb: "application/octet-stream",
};
const typeFor = path => CONTENT_TYPES[decodeURIComponent(path.split("?")[0]).split(".").pop().toLowerCase()];

// ── IcyStreaming integration ─────────────────────────────────────────────────
const TMDB_BASE = "https://api.themoviedb.org/3";
let icySourceCache;

async function readIcySource() {
  if (icySourceCache !== undefined) return icySourceCache;
  try {
    const ICY_SOURCE_PATH = join(__dirname, "attached_assets", "icystreaming_1788158658690.py");
    icySourceCache = await readFile(ICY_SOURCE_PATH, "utf8");
  } catch {
    icySourceCache = null; // file not present — graceful skip
  }
  return icySourceCache;
}

async function getIcyTemplate() {
  const source = await readIcySource();
  if (!source) return null;
  const marker = 'HTML_TEMPLATE = """';
  const start = source.indexOf(marker);
  const end = source.indexOf('"""', start + marker.length);
  if (start === -1 || end === -1) return null;
  const guard = `<script>
(() => {
  window.open = () => null;
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (href && href !== "#" && !href.startsWith("#")) event.preventDefault();
    link.removeAttribute("target");
  }, true);
  document.addEventListener("submit", (event) => event.preventDefault(), true);
})();
</script>`;
  return source.slice(start + marker.length, end).replace("</head>", `${guard}</head>`);
}

async function getTmdbApiKey() {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY;
  const source = await readIcySource();
  if (!source) return null;
  const match = source.match(/TMDB_API_KEY\s*=\s*["']([^"']+)["']/);
  return match?.[1] || null;
}

async function proxyTmdb(res, path, params = {}) {
  try {
    const apiKey = await getTmdbApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: "TMDB_API_KEY is not configured" });
    }

    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set("api_key", apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, value);
    }

    const upstream = await fetch(url);
    const body = await upstream.text();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    return res.status(upstream.status).send(body);
  } catch (error) {
    console.error("TMDB proxy error:", error.message);
    return res.status(502).json({ error: "Unable to reach TMDB" });
  }
}

// Fetch a URL following up to 5 redirects; calls back with (err, incomingMsg)
function fetchFollowRedirects(hostname, path, redirectsLeft, cb) {
  if (redirectsLeft <= 0) return cb(new Error("Too many redirects"), null);
  const req = httpsRequest(
    { hostname, path, method: "GET",
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*", "Accept-Encoding": "identity" } },
    (res) => {
      const loc = res.headers.location;
      if ((res.statusCode === 301 || res.statusCode === 302 ||
           res.statusCode === 307 || res.statusCode === 308) && loc) {
        res.resume();
        try {
          const r = new URL(loc);
          fetchFollowRedirects(r.hostname, r.pathname + r.search, redirectsLeft - 1, cb);
        } catch(e) { cb(e, null); }
        return;
      }
      cb(null, res);
    }
  );
  req.on("error", (e) => cb(e, null));
  req.end();
}

// Stream one part (partNum). On success, pipe to res then recurse for next part.
// On 404, close res (all parts done) or send 404 if no parts found.
function streamPart(hostname, basePath, partNum, res, headersWritten) {
  const path = `${basePath}.part${partNum}`;
  fetchFollowRedirects(hostname, path, 5, (err, upstream) => {
    if (err || !upstream || upstream.statusCode !== 200) {
      if (upstream) upstream.resume();
      if (!headersWritten) {
        if (!res.headersSent) res.status(404).send("File not found (no parts)");
      } else {
        res.end();
      }
      return;
    }
    if (!headersWritten) {
      res.status(200);
      res.setHeader("Access-Control-Allow-Origin", "*");
      const ext = basePath.split(".").pop().toLowerCase();
      res.setHeader("Content-Type", typeFor(basePath) || CONTENT_TYPES[ext] || "application/octet-stream");
    }
    upstream.on("end", () => streamPart(hostname, basePath, partNum + 1, res, true));
    upstream.on("error", () => { if (!res.writableEnded) res.end(); });
    upstream.pipe(res, { end: false });
  });
}

// Main proxy handler: try direct file first, fall back to part stitching on 404
// opts.typeByExt: trust the file extension over upstream's Content-Type (raw GitHub says text/plain).
function proxyFile(hostname, path, res, opts = {}) {
  fetchFollowRedirects(hostname, path, 5, (err, upstream) => {
    if (err) {
      if (!res.headersSent) res.status(502).send("Proxy error: " + err.message);
      return;
    }
    if (upstream.statusCode === 200) {
      res.status(200);
      res.setHeader("Access-Control-Allow-Origin", "*");
      const fwd = ["content-type", "content-length", "cache-control", "last-modified", "etag"];
      fwd.forEach(h => { if (upstream.headers[h]) res.setHeader(h, upstream.headers[h]); });
      if (opts.typeByExt && typeFor(path)) res.setHeader("Content-Type", typeFor(path));
      if (opts.cacheControl) res.setHeader("Cache-Control", opts.cacheControl);
      upstream.pipe(res);
      return;
    }
    if (upstream.statusCode === 404) {
      upstream.resume();
      // Try assembling from split parts
      streamPart(hostname, path, 1, res, false);
      return;
    }
    if (!res.headersSent) res.status(upstream.statusCode).send("CDN error");
    upstream.resume();
  });
}

// ── CDN proxy route ───────────────────────────────────────────────────────────
app.get("/cdn-proxy/*", (req, res) => {
  const target = jsdToRaw(req.params[0]);
  if (!target) return res.status(400).send("Bad CDN URL");
  // raw.githubusercontent.com labels everything text/plain; use the extension instead so
  // .wasm arrives as application/wasm (lets browsers compile it while it streams).
  proxyFile(target.hostname, target.path, res, { typeByExt: target.hostname === "raw.githubusercontent.com" });
});

// ── Game HTML serving ─────────────────────────────────────────────────────────
// 1. Normalises dead 40-char commit SHA refs → @main  (covers both base href
//    and any hardcoded cdn.jsdelivr.net URLs in script/link tags)
// 2. Rewrites <base href="https://cdn.X.net/..."> → <base href="/cdn-proxy/...">
//    so every asset the game engine resolves goes through our proxy on the same origin.
const SHA_RE = /(cdn\.jsdelivr\.net\/gh\/[^@"']+)@([0-9a-f]{40})/gi;

// Rewritten game pages are cached in memory with a gzipped copy, so the
// 17 MB Minecraft page isn't re-read, re-regexed and re-compressed per request.
const gameCache = new Map();

app.get("/games/:name.html", async (req, res) => {
  try {
    if (!/^[a-z0-9_-]+$/i.test(req.params.name)) return res.status(404).send("Game not found");
    let entry = gameCache.get(req.params.name);
    if (!entry) {
      entry = await buildGamePage(req.params.name);
      gameCache.set(req.params.name, entry);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("ETag", entry.etag);
    res.setHeader("Vary", "Accept-Encoding");
    if (req.headers["if-none-match"] === entry.etag) return res.status(304).end();
    if (/\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
      res.setHeader("Content-Encoding", "gzip");
      return res.send(entry.gz);
    }
    res.send(entry.raw);
  } catch {
    res.status(404).send("Game not found");
  }
});

async function buildGamePage(name) {
    const filePath = join(__dirname, "public", "games", name + ".html");
    let html = await readFile(filePath, "utf8");

    // Normalise all dead-SHA CDN refs to @main
    html = html.replace(SHA_RE, "$1@main");
    // The geometry game uses jsDelivr's @latest alias, which cannot be
    // translated to raw.githubusercontent.com without resolving the branch.
    html = html.replace(
      /cdn\.jsdelivr\.net\/gh\/web-dashers\/web-dashers\.github\.io@latest/gi,
      "cdn.jsdelivr.net/gh/web-dashers/web-dashers.github.io@main"
    );
    // Avoid a local 404 for the game's root-relative favicon.
    if (name === "geometry_dash") {
      html = html.replace(
        /(["'])\/assets\//g,
        "$1/cdn-proxy/cdn.jsdelivr.net/gh/web-dashers/web-dashers.github.io@main/assets/"
      );
    }

    // Rewrite ALL absolute cdn.jsdelivr.net and raw.githubusercontent.com references
    // through our proxy — covers <base href>, <script src>, <link href>, and JS strings
    html = html.replace(
      /https?:\/\/(cdn\.jsdelivr\.net|raw\.githubusercontent\.com)\//gi,
      "/cdn-proxy/$1/"
    );

    const raw = Buffer.from(SW_SUPPRESSOR + html, "utf8");
    return {
      raw,
      gz: gzipSync(raw, { level: 6 }),
      etag: '"' + createHash("sha1").update(raw).digest("base64url").slice(0, 16) + '"',
    };
}

// ── IcyStreaming movie site ──────────────────────────────────────────────────
app.get("/movies.html", async (_req, res) => {
  try {
    const tmpl = await getIcyTemplate();
    if (!tmpl) return res.status(404).send("Movies page not available");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
        "script-src 'unsafe-inline'",
        "style-src 'unsafe-inline'",
        "img-src 'self' data: https://image.tmdb.org",
        "connect-src 'self'",
        "frame-src https://player.videasy.net",
        "font-src 'self' data:",
      ].join("; ")
    );
    res.send(tmpl);
  } catch {
    res.status(404).send("Movies page not available");
  }
});

app.get("/api/search", (req, res) =>
  proxyTmdb(res, "/search/multi", { query: req.query.q || "", page: 1 })
);
app.get("/api/trending", (_req, res) =>
  proxyTmdb(res, "/trending/all/week")
);
app.get("/api/now_playing", (_req, res) =>
  proxyTmdb(res, "/movie/now_playing")
);
app.get("/api/upcoming", (_req, res) =>
  proxyTmdb(res, "/movie/upcoming")
);
app.get("/api/top_rated", (req, res) => {
  const mediaType = req.query.type === "tv" ? "tv" : "movie";
  return proxyTmdb(res, `/${mediaType}/top_rated`);
});
app.get("/api/movie/:id", (req, res) =>
  proxyTmdb(res, `/movie/${encodeURIComponent(req.params.id)}`, { append_to_response: "credits" })
);
app.get("/api/tv/:id/season/:season", (req, res) =>
  proxyTmdb(
    res,
    `/tv/${encodeURIComponent(req.params.id)}/season/${encodeURIComponent(req.params.season)}`
  )
);
app.get("/api/tv/:id", (req, res) =>
  proxyTmdb(res, `/tv/${encodeURIComponent(req.params.id)}`, { append_to_response: "credits" })
);

// ── AI chat (Ollama over Tailscale) ──────────────────────────────────────────
// Ollama's HTTP API only accepts requests over the tailnet, and Node's plain
// fetch() has no proxy support — it ignores ALL_PROXY/HTTP_PROXY by default.
// Passing `dispatcher: ollamaAgent` explicitly routes this one call through
// the local SOCKS5 endpoint tailscaled exposes; nothing else on the server
// goes through it, so TMDB etc. stay on their normal direct path.
const jsonSmall = express.json({ limit: "2mb" }), jsonBig = express.json({ limit: "10mb" });
app.use((req, res, next) => (req.path === "/api/ai/vision" ? jsonBig : jsonSmall)(req, res, next)); // room for synced account data and screenshots

// ── Extras (games from a GitHub repo) and game requests ─────────────────────
registerExtras(app, { proxyFile, swSuppressor: SW_SUPPRESSOR });
// Replies on game requests need accounts; the getters run per request, after accounts exist.
const requestsApi = registerRequests(app, {
  rootDir: __dirname,
  user: req => accountsApi.userFrom(req),
  isAdminName: name => accountsApi.isAdminName(name),
  notify: (uid, type, data) => accountsApi.send(uid, type, data),
  ready: { then: (ok, bad) => accountsApi.ready.then(ok, bad) },
});
const accountsApi = registerAccounts(app, { rootDir: __dirname });
const duel = registerDuel(app, { accounts: accountsApi });
registerAdmin(app, { accounts: accountsApi, requests: requestsApi, rootDir: __dirname, aiStatus: () => aiStatus(), version: VERSION, startedAt: STARTED_AT });

// ── AI status: works out exactly which link in the chain is broken ──────────
// Railway → (Tailscale SOCKS on :1055) → your PC over the tailnet → Ollama :11434 → model.
function tailscaleState() {
  return new Promise(resolve => {
    execFile("tailscale", ["status", "--json"], { timeout: 4000 }, (err, stdout) => {
      if (err && err.code === "ENOENT") return resolve({ installed: false });
      try { const j = JSON.parse(stdout); resolve({ installed: true, state: j.BackendState, self: j.Self?.TailscaleIPs?.[0] }); }
      catch { resolve({ installed: true, state: "Unknown" }); }
    });
  });
}
function ollamaTags() {
  return new Promise(resolve => {
    const t = new URL(`${OLLAMA_HOST}/api/tags`);
    const r = httpRequest({ hostname: t.hostname, port: t.port || 80, path: t.pathname, agent: ollamaAgent, timeout: 8000 }, up => {
      let body = ""; up.on("data", c => body += c);
      up.on("end", () => { try { resolve({ ok: up.statusCode === 200, status: up.statusCode, models: (JSON.parse(body).models || []).map(m => m.name) }); } catch { resolve({ ok: false, status: up.statusCode }); } });
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", e => resolve({ ok: false, error: e.message || String(e), code: e.code }));
    r.end();
  });
}
let aiStatusCache = null;
async function aiStatus() {
  if (aiStatusCache && Date.now() - aiStatusCache.at < 15000) return aiStatusCache.value;
  const model = process.env.OLLAMA_MODEL || "deepseek-r1:7b";
  const host = new URL(OLLAMA_HOST).hostname;
  let v;
  const ts = await tailscaleState();
  if (!ts.installed) v = { ok: false, step: "tailscale", message: "Tailscale isn't installed on the server.", hint: "Railway has to build from the Dockerfile. Check railway.json says builder DOCKERFILE and redeploy." };
  else if (!process.env.TAILSCALE_AUTHKEY) v = { ok: false, step: "tailscale", message: "TAILSCALE_AUTHKEY isn't set on Railway.", hint: "Add it under your service's Variables, then redeploy." };
  else if (ts.state !== "Running") v = { ok: false, step: "tailscale", message: `Tailscale on the server isn't connected (state: ${ts.state || "unknown"}).`, hint: "The auth key may be expired or already used. Make a new reusable key and update TAILSCALE_AUTHKEY." };
  else {
    const o = await ollamaTags();
    const err = (o.error || "").toLowerCase();
    if (o.ok) {
      const has = o.models.some(m => m === model || m === model + ":latest" || m.split(":")[0] === model);
      v = has ? { ok: true, step: "ready", message: `Connected to ${model}.` }
              : { ok: false, step: "model", message: `Ollama is reachable, but ${model} isn't installed on it.`, hint: `On the PC run: ollama pull ${model}. Installed: ${o.models.join(", ") || "none"}.` };
    } else if (err.includes("connectionrefused") || err.includes("refused") && !err.includes("1055")) {
      v = { ok: false, step: "ollama", message: `Your PC (${host}) is reachable, but nothing is answering on port 11434.`, hint: "Ollama is either closed or only listening to itself. Set OLLAMA_HOST=0.0.0.0 on the PC, quit Ollama from the tray, and open it again." };
    } else if (err.includes("1055") || o.code === "ECONNREFUSED") {
      v = { ok: false, step: "tailscale", message: "The server's Tailscale proxy isn't running.", hint: "Check the Railway logs for [start] tailscale lines." };
    } else if (err.includes("unreachable") || err.includes("timeout") || err.includes("ttl")) {
      v = { ok: false, step: "pc", message: `The server can't reach your PC at ${host}.`, hint: "Make sure the PC is on and awake, Tailscale is connected on it, and that its Tailscale IP is still " + host + ". Also allow port 11434 in Windows Firewall." };
    } else {
      v = { ok: false, step: "unknown", message: "Couldn't reach Ollama: " + (o.error || "HTTP " + o.status), hint: "Check the Railway logs." };
    }
  }
  aiStatusCache = { at: Date.now(), value: v };
  return v;
}
app.get("/api/ai/status", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try { res.json(await aiStatus()); } catch (e) { res.json({ ok: false, step: "unknown", message: e.message }); }
});

// Small local models copy whatever the system prompt talks about, so keep it about
// *how* to answer, and only describe the site for when the user actually asks.
const SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || [
  "You are a friendly, helpful assistant. Reply to the user's latest message directly.",
  "If they just say hi, say hi back briefly and ask what they need.",
  "Keep answers short (1-4 sentences) unless they ask for detail or the task needs it, like code or step-by-step help.",
  "Use plain conversational text; only use lists when listing several items.",
  "If you don't know something, say so instead of guessing.",
  "Only if the user asks about this website: it's called Universium and has a games library, movies, a web browser, friends and chat, and settings for backgrounds and a desktop mode.",
].join(" ");

// Models installed on the Ollama box (cached briefly), so the chat settings can offer a picker.
let modelsCache = null;
async function listModels() {
  if (modelsCache && Date.now() - modelsCache.at < 60000) return modelsCache.list;
  const o = await ollamaTags();
  const list = o.ok ? o.models : (modelsCache?.list || []);
  modelsCache = { at: Date.now(), list };
  return list;
}
const DEFAULT_MODEL = () => process.env.OLLAMA_MODEL || "deepseek-r1:7b";
app.get("/api/ai/models", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ models: await listModels(), default: DEFAULT_MODEL() });
});

const LENGTHS = { short: 300, normal: 1200, long: 4000 };

// Streams the reply back as newline-delimited JSON: {"t":"text"} chunks, then {"done":true}
// (or {"error":"..."}). Hides deepseek-r1's <think> reasoning while it streams.
app.post("/api/ai/chat", async (req, res) => {
  const { messages, model: wanted, temperature, length, instructions } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages (array) is required" });
  }
  const clean = messages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-30)
    .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!clean.length) return res.status(400).json({ error: "No messages to send." });

  // Only allow models that are actually installed; otherwise use the default.
  let model = DEFAULT_MODEL();
  if (typeof wanted === "string" && wanted && wanted !== model) {
    const installed = await listModels();
    if (installed.includes(wanted)) model = wanted;
  }
  let system = SYSTEM_PROMPT;
  if (typeof instructions === "string" && instructions.trim()) {
    system += " The user gave these extra instructions for how to respond: " + instructions.trim().slice(0, 1000);
  }
  const options = { num_predict: LENGTHS[length] || LENGTHS.normal };
  const temp = Number(temperature);
  if (Number.isFinite(temp)) options.temperature = Math.min(1.5, Math.max(0, temp));

  const payload = JSON.stringify({
    model,
    messages: [{ role: "system", content: system }, ...clean],
    stream: true,
    options,
    // R1 "thinks" at length before answering, which is slow for quick chat. Ollama 0.9+
    // can skip it; older versions ignore this field. Set OLLAMA_THINK=true to keep it.
    think: process.env.OLLAMA_THINK === "true",
  });
  streamOllama(res, model, payload);
});

// Sends a chat request to Ollama and streams the reply back as newline-delimited JSON:
// {"model"} first, then {"t":"text"} chunks, then {"done":true} (or {"error":"..."}).
// Hides <think>…</think> reasoning while it streams.
function streamOllama(res, model, payload) {
  const target = new URL(`${OLLAMA_HOST}/api/chat`);

  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    res.write(JSON.stringify({ model }) + "\n");
  };
  const send = obj => { begin(); res.write(JSON.stringify(obj) + "\n"); };

  const upstreamReq = httpRequest(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname,
      method: "POST",
      agent: ollamaAgent,
      timeout: 120000, // 2 min of silence max; cold model loads can take 30s+
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    },
    (upstreamRes) => {
      if (upstreamRes.statusCode !== 200) {
        let errBody = "";
        upstreamRes.on("data", (c) => (errBody += c));
        upstreamRes.on("end", () => {
          console.error("Ollama upstream error:", upstreamRes.statusCode, errBody);
          aiStatusCache = null;
          let detail = errBody; try { detail = JSON.parse(errBody).error || errBody; } catch {}
          if (!res.headersSent) res.status(502).json({ error: "Ollama error", detail });
          else { send({ error: String(detail) }); res.end(); }
        });
        return;
      }
      begin();
      // Ollama sends newline-delimited JSON. Rebuild the raw text, then emit only the part
      // outside <think>…</think> that hasn't been sent yet.
      let buffer = "", raw = "", sent = 0;
      const visible = () => {
        let v = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
        const open = v.search(/<think>/i);
        if (open !== -1) v = v.slice(0, open);           // still thinking
        const partial = v.match(/<(t(h(i(nk?)?)?)?)?$/i);  // "<thi" might become "<think>"
        if (partial) v = v.slice(0, partial.index);
        return v.replace(/^\s+/, "");
      };
      const flush = () => {
        const v = visible();
        if (v.length > sent) { send({ t: v.slice(sent) }); sent = v.length; }
      };
      upstreamRes.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try { const obj = JSON.parse(line); if (obj.message?.content) raw += obj.message.content; } catch {}
        }
        flush();
      });
      upstreamRes.on("end", () => {
        flush();
        send({ done: true });
        res.end();
      });
    }
  );

  // Stop generating if the user hits Stop or leaves.
  res.on("close", () => { if (!res.writableEnded) upstreamReq.destroy(); });
  upstreamReq.on("timeout", () => upstreamReq.destroy(new Error("Ollama request timed out")));
  upstreamReq.on("error", (err) => {
    if (res.writableEnded || res.destroyed) return;
    console.error("Ollama proxy error:", err.message);
    aiStatusCache = null;
    if (!res.headersSent) res.status(502).json({ error: "Unable to reach Ollama", detail: err.message });
    else { send({ error: err.message }); res.end(); }
  });

  upstreamReq.write(payload);
  upstreamReq.end();
}


// ── Snip & solve: a screenshot of a problem goes to a vision model ────────────
// deepseek-r1 can't see images, so this uses a separate model (OLLAMA_VISION_MODEL,
// default qwen2.5vl:7b). Body: { messages: [{ role, content, images?: [base64 jpeg/png] }] }.
const VISION_MODEL = () => process.env.OLLAMA_VISION_MODEL || "qwen2.5vl:7b";
const VISION_PROMPT = process.env.AI_VISION_PROMPT || [
  "You are a patient tutor. The user sends a screenshot cut from a web page, usually a homework or practice problem.",
  "Read everything in the image carefully, including numbers, units, answer choices, graphs and diagrams.",
  "Start with the answer, on its own line, like: **Answer:** 42. If there are several questions, number them and give each answer.",
  "For multiple choice, give the letter and the text of the right choice.",
  "Then explain the steps briefly and clearly so the user understands how to get it. Write math with LaTeX between \\( \\) or \\[ \\].",
  "If part of the problem is cut off or unreadable, say what's missing instead of guessing.",
  "For follow-up questions, answer them directly using the same screenshot.",
].join(" ");

app.post("/api/ai/vision", async (req, res) => {
  const msgs = Array.isArray(req.body?.messages) ? req.body.messages : [];
  let images = 0;
  const clean = msgs
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map(m => {
      const out = { role: m.role, content: m.content.slice(0, 4000) };
      if (m.role === "user" && Array.isArray(m.images)) {
        const imgs = m.images
          .filter(x => typeof x === "string")
          .map(x => x.replace(/^data:image\/[a-z]+;base64,/, ""))
          .filter(x => /^[A-Za-z0-9+/=]+$/.test(x.slice(0, 200)) && x.length < 7_000_000)
          .slice(0, 2);
        images += imgs.length;
        if (imgs.length) out.images = imgs;
      }
      return out;
    });
  if (!clean.length || !images) return res.status(400).json({ error: "Send a screenshot to solve." });

  const model = VISION_MODEL();
  const installed = await listModels();
  if (installed.length && !installed.includes(model) && !installed.includes(model + ":latest")) {
    return res.status(400).json({ error: `The vision model ${model} isn't installed on the AI computer.`, hint: `On that PC, run: ollama pull ${model}` });
  }
  const payload = JSON.stringify({
    model,
    messages: [{ role: "system", content: VISION_PROMPT }, ...clean],
    stream: true,
    options: { num_predict: 1500, temperature: 0.2 },
  });
  streamOllama(res, model, payload);
});

// ── UV / transport routes ─────────────────────────────────────────────────────
app.get("/sw.js", (_req, res) => {
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(join(__dirname, "public", "sw.js"));
});
app.get("/uv/uv.config.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(join(__dirname, "public", "uv", "uv.config.js"));
});
const libCache = { maxAge: "1d" };
app.use("/uv/", express.static(uvPath, libCache));
app.use("/epoxy/", express.static(epoxyPath, libCache));
app.use("/baremux/", express.static(baremuxPath, libCache));

// ── Static + fallback ─────────────────────────────────────────────────────────
app.use("/img/", express.static(join(__dirname, "public", "img"), { maxAge: "7d" }));
// Minecraft's builds are large and never change between releases; let browsers keep them.
app.use("/games/minecraft/", express.static(join(__dirname, "public", "games", "minecraft"), {
  maxAge: "7d",
  setHeaders: (res, path) => { if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); },
}));
app.use(express.static(join(__dirname, "public"), {
  // index.html must revalidate so UI updates show up immediately.
  setHeaders: (res, path) => { if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); },
}));
app.get("/api/health", (_req, res) => res.json({ ok: true, version: VERSION }));
// Unknown page paths get the app; missing files (anything with an extension, or under
// /games, /api, /extras) get a real 404 so games don't try to parse HTML as data.
app.get("*", (req, res) => {
  if (/\.[a-z0-9]{1,8}$/i.test(req.path) || /^\/(games|api|extras|cdn-proxy)\//.test(req.path)) {
    return res.status(404).send("Not found");
  }
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(join(__dirname, "public", "index.html"));
});

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = createServer();
server.on("request", (req, res) => {
  if (bare.shouldRoute(req)) bare.routeRequest(req, res);
  else app(req, res);
});
server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/duel-ws")) duel.handleUpgrade(req, socket, head);
  else if (bare.shouldRoute(req)) bare.routeUpgrade(req, socket, head);
  else wisp.routeRequest(req, socket, head);
});
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Universium listening on port ${PORT}`);
  console.log(isPersistent()
    ? `[data] saving accounts and requests to ${dataDir(__dirname)} (persistent)`
    : `[data] WARNING: saving to ${dataDir(__dirname)}, which is wiped on every deploy. Attach a Railway volume to keep accounts.`);
});
