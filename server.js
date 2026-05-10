import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import wisp from "wisp-server-node";
import barePkg from "@tomphttp/bare-server-node";
const { createBareServer } = barePkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const bare = createBareServer("/bare/");
const app = express();

// Our custom SW wrapper — needs Service-Worker-Allowed: / so it can control /service/
app.get("/sw.js", (_req, res) => {
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(join(__dirname, "public", "sw.js"));
});

// Our custom uv.config.js (must come before the static UV middleware)
app.get("/uv/uv.config.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(join(__dirname, "public", "uv", "uv.config.js"));
});

// UV scripts from node_modules (uv.bundle.js, uv.sw.js, uv.handler.js, etc.)
app.use("/uv/", express.static(uvPath));

// Transports from node_modules
app.use("/epoxy/",   express.static(epoxyPath));
app.use("/baremux/", express.static(baremuxPath));

// Frontend
app.use(express.static(join(__dirname, "public")));
app.get("*", (_req, res) =>
  res.sendFile(join(__dirname, "public", "index.html"))
);

const server = createServer();

server.on("request", (req, res) => {
  if (bare.shouldRoute(req)) bare.routeRequest(req, res);
  else app(req, res);
});

server.on("upgrade", (req, socket, head) => {
  if (bare.shouldRoute(req)) bare.routeUpgrade(req, socket, head);
  else wisp.routeRequest(req, socket, head);
});

server.listen(3000, () => {
  console.log("\n  ★  Universe OS  →  http://localhost:3000\n");
});
