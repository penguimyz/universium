// Extras: games from a public GitHub repo (one folder per game), discovered at runtime
// so anything added to the repo shows up without editing this site.
//
//   GET /api/extras        → { games: [{ id, name, path, thumb }], source, updated }
//   GET /extras/<path>     → the file, proxied from raw.githubusercontent.com with the right
//                            Content-Type (raw GitHub serves everything as text/plain).

const OWNER = process.env.EXTRAS_OWNER || "codeonline26";
const REPO = process.env.EXTRAS_REPO || "html";
const BRANCH = process.env.EXTRAS_BRANCH || "main";
const TTL = 6 * 60 * 60 * 1000; // re-scan the repo every 6 hours

const IMG = /\.(png|jpe?g|webp|gif)$/i;
const THUMB_NAME = /(thumb|cover|splash|banner|logo|icon|preview|screenshot|capsule|poster)[^/]*\.(png|jpe?g|webp|gif)$/i;

let catalog = null, loadedAt = 0, loading = null, source = "";

async function listFiles() {
  const errors = [];
  // jsDelivr's metadata API has no meaningful rate limit, so try it first.
  try {
    const r = await fetch(`https://data.jsdelivr.com/v1/packages/gh/${OWNER}/${REPO}@${BRANCH}?structure=flat`);
    if (!r.ok) throw new Error("jsDelivr " + r.status);
    const j = await r.json();
    const files = (j.files || []).map(f => f.name.replace(/^\//, ""));
    if (files.length) { source = "jsdelivr"; return files; }
    throw new Error("jsDelivr returned no files");
  } catch (e) { errors.push(e.message); }
  // Fallback: GitHub's tree API (60 requests/hour unauthenticated; set GITHUB_TOKEN to raise it).
  try {
    const headers = { "User-Agent": "universium", Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`, { headers });
    if (!r.ok) throw new Error("GitHub " + r.status);
    const j = await r.json();
    source = "github";
    return (j.tree || []).filter(t => t.type === "blob").map(t => t.path);
  } catch (e) { errors.push(e.message); }
  throw new Error("Couldn't list extras: " + errors.join("; "));
}

const depth = p => p.split("/").length;
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "game";
function pretty(name) {
  let s = name.replace(/\.html?$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (s === s.toLowerCase()) s = s.replace(/\b[a-z]/g, c => c.toUpperCase());
  return s;
}

function buildCatalog(paths) {
  const folders = new Map();
  const games = [];
  for (const p of paths) {
    if (p.startsWith(".") || p.includes("/.")) continue;
    const parts = p.split("/");
    if (parts.length === 1) {
      // A single-file game sitting in the repo root.
      if (/\.html?$/i.test(p) && !/^index\.html?$/i.test(p)) games.push({ id: slug(p), name: pretty(p), path: p, thumb: null });
      continue;
    }
    if (!folders.has(parts[0])) folders.set(parts[0], []);
    folders.get(parts[0]).push(p);
  }
  for (const [folder, files] of folders) {
    const htmls = files.filter(f => /\.html?$/i.test(f));
    if (!htmls.length) continue;
    // Prefer <folder>/index.html, then the shallowest index.html, then the shallowest page.
    const entry =
      htmls.find(f => f.toLowerCase() === `${folder}/index.html`.toLowerCase()) ||
      htmls.filter(f => /\/index\.html?$/i.test(f)).sort((a, b) => depth(a) - depth(b))[0] ||
      [...htmls].sort((a, b) => depth(a) - depth(b) || a.length - b.length)[0];
    // Only use images whose names suggest cover art; random sprites make bad thumbnails.
    const thumb = files
      .filter(f => IMG.test(f) && THUMB_NAME.test(f.split("/").pop()) && depth(f) <= depth(entry) + 1)
      .sort((a, b) => depth(a) - depth(b))[0] || null;
    games.push({ id: slug(folder), name: pretty(folder), path: entry, thumb });
  }
  // De-duplicate ids (two folders that slug the same).
  const seen = new Map();
  for (const g of games) { const n = seen.get(g.id) || 0; seen.set(g.id, n + 1); if (n) g.id += "-" + n; }
  return games.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
}

async function getCatalog() {
  if (catalog && Date.now() - loadedAt < TTL) return catalog;
  if (!loading) {
    loading = listFiles()
      .then(files => { catalog = buildCatalog(files); loadedAt = Date.now(); })
      .catch(err => { console.error("[extras]", err.message); if (!catalog) throw err; })
      .finally(() => { loading = null; });
  }
  // Serve a stale catalog immediately while a refresh runs in the background.
  if (catalog) return catalog;
  await loading;
  return catalog;
}

function injectAfterHead(html, snippet) {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, m => m + snippet);
  if (/<!doctype[^>]*>/i.test(html)) return html.replace(/<!doctype[^>]*>/i, m => m + snippet);
  return snippet + html;
}

export function registerExtras(app, { proxyFile, swSuppressor }) {
  const pageCache = new Map(); // small LRU of rewritten HTML pages

  app.get("/api/extras", async (_req, res) => {
    try {
      const games = await getCatalog();
      res.setHeader("Cache-Control", "public, max-age=600");
      res.json({ games, source, updated: loadedAt, repo: `${OWNER}/${REPO}` });
    } catch {
      res.status(502).json({ error: "Couldn't load extras" });
    }
  });

  app.get("/extras/*", async (req, res) => {
    const rel = req.params[0] || "";
    if (!rel || rel.split("/").some(seg => seg === ".." || seg === ".")) return res.status(400).send("Bad path");
    const rawPath = `/${OWNER}/${REPO}/${BRANCH}/` + rel.split("/").map(encodeURIComponent).join("/");

    if (!/\.html?$/i.test(rel)) {
      return proxyFile("raw.githubusercontent.com", rawPath, res, { typeByExt: true, cacheControl: "public, max-age=86400" });
    }

    try {
      let html = pageCache.get(rel);
      if (!html) {
        const r = await fetch("https://raw.githubusercontent.com" + rawPath);
        if (!r.ok) return res.status(r.status === 404 ? 404 : 502).send(r.status === 404 ? "Not found" : "Upstream error");
        html = await r.text();
        // Same treatment as /games: route absolute CDN links through our proxy.
        html = html.replace(/https?:\/\/(cdn\.jsdelivr\.net|raw\.githubusercontent\.com)\//gi, "/cdn-proxy/$1/");
        html = injectAfterHead(html, swSuppressor);
        pageCache.set(rel, html);
        if (pageCache.size > 150) pageCache.delete(pageCache.keys().next().value);
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(html);
    } catch (e) {
      res.status(502).send("Couldn't load that game: " + e.message);
    }
  });
}
